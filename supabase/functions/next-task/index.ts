/**
 * supabase/functions/next-task/index.ts
 * GET /next-task
 *
 * The task scheduler — decides whether to show a contribute task or a review
 * task next. Called after every submission and when the Task screen opens.
 *
 * The app never decides task type — it just shows whatever arrives here.
 * All scheduling logic lives in one place so it's easy to tune.
 *
 * HOW THE SCHEDULER WORKS:
 *
 * Phase 1 (first 9 contributions): always contribute.
 *   New contributors should build up a baseline before seeing other people's work.
 *
 * Phase 2 (10+ contributions): weighted random.
 *   Default: 70% contribute / 30% review.
 *   Under pressure: 50% / 50% when more than 40% of all entries are unreviewed.
 *   "Queue pressure" prevents a backlog of entries that never get reviewed.
 *
 * REVIEW ENTRY SELECTION:
 *   Candidates are scored by affinity tier (how similar the reviewer is to
 *   the original speaker). Tier 1 = same dialect; tier 2 = same state;
 *   tier 3 = same language. The lowest-confidence entry in the best tier wins.
 *   Entries already reviewed by this person are excluded.
 *
 * RETURN VALUE:
 *   Always includes total_contributions (the server's authoritative count)
 *   so the app can keep its local contribution counter in sync.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-contributor-id',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const contributorId = req.headers.get('x-contributor-id')
    if (!contributorId) return err(401, 'MISSING_CONTRIBUTOR_ID', 'x-contributor-id header required.')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Load the contributor's dialect and state for affinity tier matching.
    const { data: contributor } = await supabase
      .from('contributors')
      .select('id, dialect_id, state, language_id')
      .eq('id', contributorId)
      .single()

    if (!contributor) return err(404, 'CONTRIBUTOR_NOT_FOUND', 'Contributor not found.')

    // Count how many entries this contributor has submitted to the server.
    // This is the authoritative count — sent back with every response so
    // the app's local counter stays in sync.
    const { count: totalContributions } = await supabase
      .from('lexicon_entries')
      .select('id', { count: 'exact', head: true })
      .eq('contributor_id', contributorId)

    // Phase 1: fewer than 10 entries — always contribute.
    if ((totalContributions ?? 0) < 10) {
      const task = await buildContributeTask(supabase, contributorId)
      if (!task) return err(404, 'NO_TASKS_AVAILABLE', 'No concepts available. Add concepts in the admin panel.')
      return ok({ task_type: 'contribute', prompt: task, total_contributions: totalContributions ?? 0 })
    }

    // Phase 2: check queue pressure and decide task type.
    const { count: totalEntries }      = await supabase.from('lexicon_entries').select('id', { count: 'exact', head: true })
    const { count: unreviewedEntries } = await supabase.from('lexicon_entries')
      .select('id', { count: 'exact', head: true })
      .lt('confidence_score', 0.15)     // low confidence = needs more reviews
      .neq('contributor_id', contributorId)

    // pressure = fraction of all entries that are still low-confidence.
    const pressure  = (unreviewedEntries ?? 0) / Math.max(totalEntries ?? 1, 1)
    const pReview   = pressure > 0.4 ? 0.5 : 0.3  // more pressure → more review tasks
    const taskType  = Math.random() < pReview ? 'review' : 'contribute'

    if (taskType === 'review') {
      const reviewTask = await buildReviewTask(supabase, contributor)
      if (!reviewTask) {
        // No reviewable entries available — fall back to contribute.
        const contributeTask = await buildContributeTask(supabase, contributorId)
        if (!contributeTask) return err(404, 'NO_TASKS_AVAILABLE', 'No tasks available.')
        return ok({ task_type: 'contribute', prompt: contributeTask, total_contributions: totalContributions ?? 0 })
      }
      return ok({ task_type: 'review', entry: reviewTask, total_contributions: totalContributions ?? 0 })
    } else {
      const contributeTask = await buildContributeTask(supabase, contributorId)
      if (!contributeTask) return err(404, 'NO_TASKS_AVAILABLE', 'No prompts available.')
      return ok({ task_type: 'contribute', prompt: contributeTask, total_contributions: totalContributions ?? 0 })
    }

  } catch (e) {
    console.error('[next-task]', e)
    return err(500, 'INTERNAL_ERROR', 'An unexpected error occurred.')
  }
})

// ── Task builders ──────────────────────────────────────────────────────────────

/**
 * Picks a random concept that this contributor hasn't recorded yet.
 * Falls back to any concept if they've already recorded everything.
 * Generates a signed image URL if the concept has an associated image.
 */
async function buildContributeTask(supabase: ReturnType<typeof createClient>, contributorId: string) {
  // Find out which concepts this contributor has already submitted.
  const { data: submitted } = await supabase
    .from('lexicon_entries')
    .select('concept_id')
    .eq('contributor_id', contributorId)

  const submittedIds = (submitted ?? []).map((r: { concept_id: string }) => r.concept_id)

  // Fetch only the IDs of all unsubmitted concepts — lightweight, no text data.
  // We then pick one at random and fetch its full details.
  // This guarantees true random selection across all concept types (words AND
  // sentences), because fetching a fixed-size page without ORDER BY RANDOM()
  // always returns the same rows first and sentences — inserted later — never appear.
  let idQuery = supabase.from('concepts').select('id')
  if (submittedIds.length > 0) {
    idQuery = idQuery.not('id', 'in', `(${submittedIds.join(',')})`)
  }

  const { data: idRows } = await idQuery
  let availableIds = (idRows ?? []).map((r: { id: string }) => r.id)

  if (availableIds.length === 0) {
    // Contributor has recorded everything — allow repeats.
    const { data: allIds } = await supabase.from('concepts').select('id')
    availableIds = (allIds ?? []).map((r: { id: string }) => r.id)
    if (availableIds.length === 0) return null
  }

  // True random pick across all concept types.
  const randomId = availableIds[Math.floor(Math.random() * availableIds.length)]

  // Fetch the full details for the chosen concept.
  const { data: concept } = await supabase
    .from('concepts')
    .select('id, english_gloss, image_path, prompt_context, concept_type')
    .eq('id', randomId)
    .single()

  if (!concept) return null

  // Determine what kind of prompt to show the contributor.
  // Sentences always use the 'sentence' prompt type regardless of other fields.
  const promptType = concept.concept_type === 'sentence'
    ? 'sentence'
    : concept.image_path
      ? 'image'
      : concept.prompt_context
        ? 'context'
        : 'word'

  // Generate a signed URL for the image (expires in 10 minutes).
  // Signed URLs are temporary — they can't be used to browse storage freely.
  let imageUrl: string | null = null
  if (concept.image_path) {
    const { data: signed } = await supabase.storage
      .from('concepts')
      .createSignedUrl(concept.image_path, 600)
    imageUrl = signed?.signedUrl ?? null
  }

  return {
    prompt_id:     `p-${concept.id}-${Date.now()}`,
    concept_id:    concept.id,
    english_gloss: concept.english_gloss,
    prompt_type:   promptType,
    concept_type:  concept.concept_type ?? 'word',
    image_url:     imageUrl,
    context_text:  concept.prompt_context ?? null,
  }
}

/**
 * Picks the best unreviewed entry for this contributor to review.
 *
 * "Best" = lowest confidence score (needs the most reviews) among entries
 * from the contributor's own dialect/state, ranked by affinity tier.
 *
 * Only entries with audio uploaded are eligible — the reviewer needs to
 * listen to the recording to give a meaningful verdict.
 *
 * Returns null if there are no entries left to review.
 */
async function buildReviewTask(
  supabase: ReturnType<typeof createClient>,
  contributor: { id: string; dialect_id: number | null; state: string; language_id: number }
) {
  // Exclude entries this reviewer has already judged.
  const { data: reviewed } = await supabase
    .from('review_verdicts')
    .select('entry_id')
    .eq('reviewer_id', contributor.id)

  const reviewedIds = (reviewed ?? []).map((r: { entry_id: string }) => r.entry_id)

  let query = supabase
    .from('lexicon_entries')
    .select(`
      id,
      concept_id,
      native_word,
      region_town,
      region_state,
      dialect_id,
      language_id,
      confidence_score,
      audio_path_opus,
      audio_path_wav,
      concepts!inner (english_gloss)
    `)
    .neq('contributor_id', contributor.id)      // can't review your own entry
    .eq('language_id', contributor.language_id)  // same language only
    .not('audio_path_opus', 'is', null)          // must have audio to be reviewable
    .order('confidence_score', { ascending: true })  // lowest confidence first
    .limit(20)

  if (reviewedIds.length > 0) {
    query = query.not('id', 'in', `(${reviewedIds.join(',')})`)
  }

  const { data: candidates } = await query
  if (!candidates || candidates.length === 0) return null

  // Score each candidate by how closely the reviewer matches the original speaker.
  type Candidate = {
    id: string
    concept_id: string
    native_word: string
    region_town: string
    region_state: string
    dialect_id: number | null
    audio_path_opus: string | null
    audio_path_wav: string | null
    concepts: { english_gloss: string }
    affinity_tier: number
  }

  const tiered: Candidate[] = candidates.map((entry) => {
    let tier = 3  // default: same language, different state/dialect
    if (contributor.dialect_id && entry.dialect_id === contributor.dialect_id) tier = 1  // same dialect — best match
    else if (entry.region_state?.toLowerCase() === contributor.state?.toLowerCase()) tier = 2  // same state
    return { ...entry, affinity_tier: tier }
  })

  // Sort so the best-matched entry (lowest tier number) comes first.
  tiered.sort((a, b) => a.affinity_tier - b.affinity_tier)
  const best = tiered[0]

  // Generate a temporary signed URL for the audio file (expires in 10 minutes).
  // We use the stored path from the DB rather than guessing it — the path only
  // exists after a successful audio upload, so this never generates broken URLs.
  const audioPath = best.audio_path_wav ?? best.audio_path_opus  // prefer WAV if transcoded
  if (!audioPath) return null

  const { data: signed } = await supabase.storage
    .from('lexicon')
    .createSignedUrl(audioPath, 600)

  const audioUrl = signed?.signedUrl ?? null
  if (!audioUrl) return null

  return {
    entry_id:        best.id,
    concept_id:      best.concept_id,
    english_gloss:   best.concepts.english_gloss,
    native_word:     best.native_word,
    audio_url:       audioUrl,
    submitter_town:  best.region_town ?? '',
    submitter_state: best.region_state ?? '',
    affinity_tier:   best.affinity_tier,
  }
}

/** Sends a 200 JSON response. */
function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }
  })
}

/** Sends a structured error response with a machine-readable code. */
function err(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message, status } }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' }
  })
}
