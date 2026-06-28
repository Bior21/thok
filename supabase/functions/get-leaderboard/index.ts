/**
 * supabase/functions/get-leaderboard/index.ts
 * GET /get-leaderboard
 *
 * Returns the top states by contribution count for the contributor's language.
 * Used to show regional competition on the home screen.
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
    if (!contributorId) return err(401, 'MISSING_ID', 'x-contributor-id header required.')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Load contributor's language and state
    const { data: contributor } = await supabase
      .from('contributors')
      .select('language_id, state')
      .eq('id', contributorId)
      .single()

    if (!contributor) return err(404, 'NOT_FOUND', 'Contributor not found.')

    // Aggregate word counts per state for this language
    const { data: rows, error: queryErr } = await supabase
      .from('lexicon_entries')
      .select('region_state')
      .eq('language_id', contributor.language_id)
      .not('region_state', 'is', null)
      .neq('region_state', '')
      .neq('region_state', 'Other / Outside South Sudan')

    if (queryErr) {
      console.error('[get-leaderboard]', queryErr)
      return err(500, 'QUERY_FAILED', 'Failed to fetch leaderboard.')
    }

    // Count per state in JS (Supabase JS client doesn't support GROUP BY directly)
    const counts: Record<string, number> = {}
    for (const row of rows ?? []) {
      const s = row.region_state as string
      counts[s] = (counts[s] ?? 0) + 1
    }

    const leaderboard = Object.entries(counts)
      .map(([state, wordCount]) => ({ state, wordCount }))
      .sort((a, b) => b.wordCount - a.wordCount)
      .slice(0, 5)

    // Find the contributor's state rank
    const allSorted = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
    const contributorRank =
      allSorted.findIndex(([s]) => s === contributor.state) + 1

    return new Response(
      JSON.stringify({
        leaderboard,
        contributorState: contributor.state ?? null,
        contributorRank:  contributorRank > 0 ? contributorRank : null,
      }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )

  } catch (e) {
    console.error('[get-leaderboard]', e)
    return err(500, 'INTERNAL_ERROR', 'An unexpected error occurred.')
  }
})

function err(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message, status } }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
