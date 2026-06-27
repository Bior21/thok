/**
 * supabase/functions/skip-concept/index.ts
 * POST /skip-concept
 *
 * Records that a contributor doesn't know the word for a concept.
 *
 * This is a fire-and-forget endpoint — the app doesn't wait for a response
 * before moving to the next task. The data is used for research:
 * concepts skipped by many contributors may not have established Dinka words.
 *
 * A skip does NOT affect the contributor's count or the concept's availability —
 * the same concept can still appear in future sessions (the person may have
 * learned it since).
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
    if (!contributorId)
      return err(401, 'MISSING_CONTRIBUTOR_ID', 'x-contributor-id header required.')

    const body = await req.json().catch(() => null)
    if (!body?.concept_id)
      return err(400, 'MISSING_CONCEPT_ID', 'concept_id is required.')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ON CONFLICT DO NOTHING — if this person already skipped this concept,
    // silently ignore the duplicate rather than returning an error.
    await supabase
      .from('concept_skips')
      .insert({ contributor_id: contributorId, concept_id: body.concept_id })

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[skip-concept]', e)
    return err(500, 'INTERNAL_ERROR', 'An unexpected error occurred.')
  }
})

function err(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message, status } }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
