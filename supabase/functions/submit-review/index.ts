/**
 * supabase/functions/submit-review/index.ts
 * POST /submit-review
 *
 * Records a reviewer's verdict on another contributor's word entry.
 *
 * HOW THE TWO-VERDICT SYSTEM WORKS:
 * Each review has two independent verdicts:
 *   - text_verdict: is the written Dinka word correct?
 *       "correct"       — exactly right
 *       "valid_variant" — a real Dinka word but a different dialect form
 *       "wrong_word"    — not the right word for the concept
 *   - audio_verdict: is the recording usable?
 *       "correct"       — clear, well-recorded pronunciation
 *       "valid_variant" — acceptable but accented or unclear
 *       "bad_audio"     — too noisy, too short, or wrong word spoken
 *
 * The verdicts are weighted by affinity tier: a reviewer from the same
 * dialect (tier 1) carries more weight than one from a different state (tier 3).
 * Score deltas are looked up from the affinity_score_weights table.
 *
 * A database trigger updates the entry's confidence_score after this insert.
 * When enough high-confidence reviews accumulate, is_verified flips to true.
 *
 * CORRECTION ENTRIES:
 * If the reviewer says the word is wrong and types a correction, OR
 * if they flag bad audio and record a new pronunciation, a new
 * lexicon_entry is created credited to the reviewer. The client then
 * uploads the correction audio to /upload-audio/:correctionEntryId.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-contributor-id',
}

const VALID_TEXT_VERDICTS  = ['correct', 'valid_variant', 'wrong_word']
const VALID_AUDIO_VERDICTS = ['correct', 'valid_variant', 'bad_audio']
const VALID_WRONG_TYPES    = ['wrong_spelling', 'wrong_word']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const reviewerId = req.headers.get('x-contributor-id')
    if (!reviewerId) return err(401, 'MISSING_CONTRIBUTOR_ID', 'x-contributor-id required.')

    const body = await req.json().catch(() => null)
    if (!body) return err(400, 'INVALID_BODY', 'JSON body required.')

    const {
      entry_id,
      affinity_tier,
      text_verdict,
      wrong_type,
      text_correction,
      audio_verdict,
      will_upload_audio = false,
    } = body

    // ── Input validation ──────────────────────────────────────────────────────

    if (!entry_id || !affinity_tier || !text_verdict || !audio_verdict)
      return err(400, 'MISSING_FIELDS', 'entry_id, affinity_tier, text_verdict, and audio_verdict are required.')

    if (!VALID_TEXT_VERDICTS.includes(text_verdict))
      return err(400, 'INVALID_TEXT_VERDICT', `text_verdict must be one of: ${VALID_TEXT_VERDICTS.join(', ')}`)

    if (!VALID_AUDIO_VERDICTS.includes(audio_verdict))
      return err(400, 'INVALID_AUDIO_VERDICT', `audio_verdict must be one of: ${VALID_AUDIO_VERDICTS.join(', ')}`)

    if (wrong_type && !VALID_WRONG_TYPES.includes(wrong_type))
      return err(400, 'INVALID_WRONG_TYPE', `wrong_type must be one of: ${VALID_WRONG_TYPES.join(', ')}`)

    if (![1, 2, 3, 4].includes(Number(affinity_tier)))
      return err(400, 'INVALID_TIER', 'affinity_tier must be 1, 2, 3, or 4.')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Load original entry and reviewer profile in parallel ──────────────────

    const [{ data: entry, error: entryErr }, { data: reviewer }] = await Promise.all([
      supabase
        .from('lexicon_entries')
        .select('id, contributor_id, concept_id, native_word, audio_path_opus, audio_path_wav, audio_duration_sec')
        .eq('id', entry_id)
        .single(),
      supabase
        .from('contributors')
        .select('id, town, state, age_range, gender, l1_status')
        .eq('id', reviewerId)
        .single(),
    ])

    if (entryErr || !entry) return err(404, 'ENTRY_NOT_FOUND', 'Entry not found.')

    // Prevent self-review — a contributor can't review their own word.
    if (entry.contributor_id === reviewerId) return err(403, 'SELF_REVIEW', 'Cannot review your own entry.')

    // ── Look up score weights for both verdicts ────────────────────────────────
    // The weight table encodes how much each verdict shifts the confidence score
    // based on the reviewer's affinity tier with the original speaker.

    const tier = Number(affinity_tier)

    const [{ data: textWeight }, { data: audioWeight }] = await Promise.all([
      supabase
        .from('affinity_score_weights')
        .select('score_delta')
        .eq('affinity_tier', tier)
        .eq('verdict', text_verdict)
        .eq('dimension', 'text')
        .single(),
      supabase
        .from('affinity_score_weights')
        .select('score_delta')
        .eq('affinity_tier', tier)
        .eq('verdict', audio_verdict)
        .eq('dimension', 'audio')
        .single(),
    ])

    const textScoreDelta  = textWeight?.score_delta  ?? 0
    const audioScoreDelta = audioWeight?.score_delta ?? 0

    // The legacy verdict column (required by the old schema) holds a single
    // combined value derived from both dimension verdicts.
    const legacyVerdict = deriveLegacyVerdict(text_verdict, audio_verdict)

    // ── Save the verdict ──────────────────────────────────────────────────────
    // A database trigger updates lexicon_entries.confidence_score after this insert.

    const { data: inserted, error: insertError } = await supabase
      .from('review_verdicts')
      .insert({
        entry_id,
        reviewer_id:       reviewerId,
        affinity_tier:     tier,
        verdict:           legacyVerdict,   // legacy column — kept for backward compatibility
        score_delta:       0,               // new rows use text/audio deltas; trigger handles both
        text_verdict,
        wrong_type:        wrong_type ?? null,
        text_correction:   text_correction?.trim() || null,
        audio_verdict,
        text_score_delta:  textScoreDelta,
        audio_score_delta: audioScoreDelta,
      })
      .select('id')
      .single()

    if (insertError) {
      if (insertError.code === '23505') return err(409, 'DUPLICATE_REVIEW', 'Already reviewed this entry.')
      console.error('[submit-review] insert verdict:', insertError)
      return err(500, 'INSERT_FAILED', 'Failed to save verdict.')
    }

    // ── Optionally create a correction entry ──────────────────────────────────
    // Create when: reviewer gave a corrected word (text_correction field), OR
    // they flagged bad audio and said they will upload a new recording.

    const hasTextCorrection    = text_verdict === 'wrong_word' && text_correction?.trim()
    const shouldCreateCorrection = hasTextCorrection || (audio_verdict === 'bad_audio' && will_upload_audio)

    let correctionEntryId: string | null = null

    if (shouldCreateCorrection) {
      // Use the reviewer's corrected word, or keep the original if only audio is being replaced.
      const correctedWord = text_correction?.trim() || entry.native_word

      // Inherit the original audio paths only if the audio was judged as acceptable.
      const inheritAudio = audio_verdict === 'correct' || audio_verdict === 'valid_variant'

      const { data: correction, error: correctionErr } = await supabase
        .from('lexicon_entries')
        .insert({
          concept_id:              entry.concept_id,
          native_word:             correctedWord,
          contributor_id:          reviewerId,
          source:                  'correction',            // flags this as a correction, not an original submission
          corrected_from_entry_id: entry_id,               // links back to the entry being corrected
          region_town:             reviewer?.town      ?? null,
          region_state:            reviewer?.state     ?? null,
          speaker_age_range:       reviewer?.age_range ?? null,
          speaker_gender:          reviewer?.gender    ?? null,
          speaker_l1_status:       reviewer?.l1_status ?? 'L1',
          audio_path_opus:         inheritAudio ? entry.audio_path_opus    : null,
          audio_path_wav:          inheritAudio ? entry.audio_path_wav     : null,
          audio_duration_sec:      inheritAudio ? entry.audio_duration_sec : null,
        })
        .select('id')
        .single()

      if (correctionErr) {
        // Non-fatal — the verdict was saved; only the correction entry failed.
        console.error('[submit-review] create correction entry:', correctionErr)
      } else {
        correctionEntryId = correction.id
      }
    }

    // ── Read updated scores (trigger has already run by now) ──────────────────

    const { data: updated } = await supabase
      .from('lexicon_entries')
      .select('confidence_score, is_verified, text_verified, audio_verified')
      .eq('id', entry_id)
      .single()

    return new Response(
      JSON.stringify({
        verdict_id:          inserted.id,
        confidence_score:    updated?.confidence_score ?? 0,
        is_verified:         updated?.is_verified      ?? false,
        text_verified:       updated?.text_verified    ?? false,
        audio_verified:      updated?.audio_verified   ?? false,
        correction_entry_id: correctionEntryId,  // null if no correction was created
      }),
      { status: 201, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    console.error('[submit-review]', e)
    return err(500, 'INTERNAL_ERROR', 'An unexpected error occurred.')
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Collapses the two-dimensional verdict into a single legacy value.
 * The legacy column is required by existing schema constraints and
 * may be used by older reporting queries.
 */
function deriveLegacyVerdict(textVerdict: string, audioVerdict: string): string {
  if (textVerdict === 'wrong_word' || audioVerdict === 'bad_audio') return 'incorrect'
  if (textVerdict === 'correct'    && audioVerdict === 'correct')    return 'correct'
  if (textVerdict === 'valid_variant' || audioVerdict === 'valid_variant') return 'valid_variant'
  return 'unsure'
}

/** Sends a structured error response with a machine-readable code. */
function err(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message, status } }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' }
  })
}
