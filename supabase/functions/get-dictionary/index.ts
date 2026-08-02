/**
 * supabase/functions/get-dictionary/index.ts
 *
 * Three modes depending on query parameters:
 *
 *   GET /get-dictionary                       — browse (verified + own entries)
 *   GET /get-dictionary?search=yen            — search by Dinka word or English gloss
 *   GET /get-dictionary?concept_id=c_0001     — all entries for one concept (detail view)
 *
 * All three return signed audio URLs valid for 10 minutes.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-contributor-id',
}

const ENTRY_SELECT = `
  id, native_word, concept_id, is_verified, contributor_id,
  audio_path_wav, audio_path_opus, audio_duration_sec, region_state,
  concepts!inner(english_gloss, concept_type)
`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const contributorId = req.headers.get('x-contributor-id')
    if (!contributorId) return err(401, 'MISSING_CONTRIBUTOR_ID', 'x-contributor-id required.')

    const url       = new URL(req.url)
    const search    = url.searchParams.get('search')?.trim()    ?? ''
    const conceptId = url.searchParams.get('concept_id')?.trim() ?? ''
    const limit     = Math.min(parseInt(url.searchParams.get('limit')  ?? '30'), 100)
    const offset    = Math.max(parseInt(url.searchParams.get('offset') ?? '0'),  0)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Mode 1: concept detail — all entries for one word ─────────────────────
    if (conceptId) {
      const { data: concept } = await supabase
        .from('concepts')
        .select('id, english_gloss, concept_type, prompt_context')
        .eq('id', conceptId)
        .single()

      if (!concept) return err(404, 'NOT_FOUND', 'Concept not found.')

      const { data: entries } = await supabase
        .from('lexicon_entries')
        .select(ENTRY_SELECT)
        .eq('concept_id', conceptId)
        .eq('is_visible', true)
        .order('confidence_score', { ascending: false })

      const withUrls = await attachAudioUrls(supabase, entries ?? [], contributorId)

      return ok({
        concept_id:    concept.id,
        english_gloss: concept.english_gloss,
        concept_type:  concept.concept_type,
        context_text:  concept.prompt_context ?? null,
        entries:       withUrls,
        entry_count:   withUrls.length,
      })
    }

    // ── Mode 2: search ────────────────────────────────────────────────────────
    if (search) {
      // Search native_word directly, and english_gloss via the joined concepts table.
      // We run two separate queries and merge to avoid cross-table OR limitations.
      const [byDinka, byEnglish] = await Promise.all([
        supabase
          .from('lexicon_entries')
          .select(ENTRY_SELECT, { count: 'exact' })
          .ilike('native_word', `%${search}%`)
          .eq('is_visible', true)
          .or(`is_verified.eq.true,contributor_id.eq.${contributorId}`)
          .order('confidence_score', { ascending: false })
          .range(offset, offset + limit - 1),

        supabase
          .from('concepts')
          .select('id')
          .ilike('english_gloss', `%${search}%`)
          .limit(200),
      ])

      // Fetch entries for English-matched concepts, excluding IDs already found by Dinka search
      const dinkaIds  = new Set((byDinka.data ?? []).map((e: { id: string }) => e.id))
      const conceptIds = (byEnglish.data ?? []).map((c: { id: string }) => c.id)

      let englishEntries: Record<string, unknown>[] = []
      if (conceptIds.length > 0) {
        const { data } = await supabase
          .from('lexicon_entries')
          .select(ENTRY_SELECT)
          .in('concept_id', conceptIds)
          .eq('is_visible', true)
          .or(`is_verified.eq.true,contributor_id.eq.${contributorId}`)
          .order('confidence_score', { ascending: false })
          .limit(limit)
        englishEntries = (data ?? []).filter((e: { id: string }) => !dinkaIds.has(e.id))
      }

      const merged = [...(byDinka.data ?? []), ...englishEntries].slice(0, limit)
      const withUrls = await attachAudioUrls(supabase, merged, contributorId)

      return ok({ entries: withUrls, total: withUrls.length })
    }

    // ── Mode 3: browse — verified entries + contributor's own ─────────────────
    const { data: entries, count } = await supabase
      .from('lexicon_entries')
      .select(ENTRY_SELECT, { count: 'exact' })
      .or(`is_verified.eq.true,contributor_id.eq.${contributorId}`)
      .eq('is_visible', true)
      .order('confidence_score', { ascending: false })
      .range(offset, offset + limit - 1)

    const withUrls = await attachAudioUrls(supabase, entries ?? [], contributorId)
    return ok({ entries: withUrls, total: count ?? 0 })

  } catch (e) {
    console.error('[get-dictionary]', e)
    return err(500, 'INTERNAL_ERROR', 'An unexpected error occurred.')
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

type Entry = {
  id: string
  native_word: string
  concept_id: string
  is_verified: boolean
  contributor_id: string
  audio_path_wav: string | null
  audio_path_opus: string | null
  audio_duration_sec: number | null
  region_state: string | null
  concepts: { english_gloss: string; concept_type: string }
}

async function attachAudioUrls(
  supabase: ReturnType<typeof createClient>,
  entries: Record<string, unknown>[],
  contributorId: string
) {
  return Promise.all(
    (entries as Entry[]).map(async (e) => {
      let audioUrl: string | null = null
      const path = e.audio_path_wav ?? e.audio_path_opus
      if (path) {
        const { data: signed } = await supabase.storage
          .from('lexicon')
          .createSignedUrl(path, 600)
        audioUrl = signed?.signedUrl ?? null
      }
      return {
        entry_id:      e.id,
        concept_id:    e.concept_id,
        native_word:   e.native_word,
        english_gloss: e.concepts.english_gloss,
        concept_type:  e.concepts.concept_type ?? 'word',
        is_verified:   e.is_verified,
        is_own:        e.contributor_id === contributorId,
        region_state:  e.region_state ?? '',
        duration_sec:  e.audio_duration_sec ?? null,
        audio_url:     audioUrl,
      }
    })
  )
}

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }
  })
}

function err(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message, status } }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' }
  })
}
