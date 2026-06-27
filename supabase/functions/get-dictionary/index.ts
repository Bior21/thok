/**
 * supabase/functions/get-dictionary/index.ts
 * GET /get-dictionary
 *
 * Returns word entries for the home screen dictionary view.
 *
 * WHAT'S INCLUDED:
 *   - All verified entries (entries that have passed community review) — visible to everyone
 *   - The requesting contributor's own unverified entries — so people can see their own work
 *   - Nobody else's unverified entries — unreviewed words aren't shown publicly yet
 *
 * This balances two goals:
 *   1. Contributors see their submissions immediately (encourages participation).
 *   2. Unverified entries from other contributors don't pollute the dictionary.
 *
 * Query parameters:
 *   limit  — number of entries to return (max 50, default 20)
 *   offset — for pagination (default 0)
 *
 * Each entry in the response includes a signed audio URL that expires in 10 minutes.
 * The URL is generated fresh each time — storing it longer would be pointless and
 * could expose stale links.
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
    if (!contributorId) return err(401, 'MISSING_CONTRIBUTOR_ID', 'x-contributor-id required.')

    const url    = new URL(req.url)
    const limit  = Math.min(parseInt(url.searchParams.get('limit')  ?? '20'), 50)  // cap at 50
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0'),  0)   // no negative offsets

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch verified entries + this contributor's own entries in one query.
    // The .or() condition reads: "is_verified = true OR contributor_id = me"
    const { data: entries, count } = await supabase
      .from('lexicon_entries')
      .select(
        'id, native_word, concept_id, is_verified, contributor_id, audio_path_wav, audio_path_opus, concepts!inner(english_gloss)',
        { count: 'exact' }
      )
      .or(`is_verified.eq.true,contributor_id.eq.${contributorId}`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (!entries) return new Response(JSON.stringify({ entries: [], total: 0 }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }
    })

    // Generate a signed audio URL for each entry that has audio.
    // This runs in parallel for all entries so the response isn't slow.
    const withUrls = await Promise.all(
      entries.map(async (e: {
        id: string
        native_word: string
        is_verified: boolean
        contributor_id: string
        audio_path_wav: string | null
        audio_path_opus: string | null
        concepts: { english_gloss: string }
      }) => {
        let audioUrl: string | null = null

        // Prefer WAV (higher quality) over Opus if both exist.
        const path = e.audio_path_wav ?? e.audio_path_opus
        if (path) {
          const { data: signed } = await supabase.storage
            .from('lexicon')
            .createSignedUrl(path, 600)   // URL valid for 10 minutes
          audioUrl = signed?.signedUrl ?? null
        }

        return {
          entry_id:      e.id,
          native_word:   e.native_word,
          english_gloss: e.concepts.english_gloss,
          is_verified:   e.is_verified,
          is_own:        e.contributor_id === contributorId,  // true = submitted by this person
          audio_url:     audioUrl,
        }
      })
    )

    return new Response(
      JSON.stringify({ entries: withUrls, total: count ?? 0 }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    console.error('[get-dictionary]', e)
    return err(500, 'INTERNAL_ERROR', 'An unexpected error occurred.')
  }
})

/** Sends a structured error response with a machine-readable code. */
function err(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message, status } }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' }
  })
}
