/**
 * supabase/functions/get-concepts/index.ts
 * GET /get-concepts
 *
 * Returns the full list of word concepts for the app to cache on the device.
 *
 * Concepts are the "prompts" shown to contributors — e.g. "water", "fire",
 * "mother" — each with an English gloss and optionally an image path or
 * descriptive context sentence.
 *
 * Why cache on the device?
 * When a contributor is offline (in the field without internet), the app can
 * still show prompts from this locally stored list. The app calls this endpoint
 * once on first launch and refreshes it periodically so the list stays current.
 *
 * The response is a flat JSON array — no pagination. The concept list is small
 * enough (a few hundred words) that sending it all at once is faster than
 * making multiple requests.
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch all concepts, ordered by ID for a stable sort so the device
    // cache always stores them in the same order.
    const { data: concepts, error } = await supabase
      .from('concepts')
      .select('id, english_gloss, image_path, prompt_context')
      .order('id', { ascending: true })

    if (error) {
      console.error('[get-concepts]', error)
      return new Response(JSON.stringify({ error: { code: 'QUERY_FAILED', message: error.message, status: 500 } }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    // Return the array directly (not wrapped in an object) so the client can
    // pass it straight into saveConcepts() without unwrapping.
    return new Response(
      JSON.stringify(concepts ?? []),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    console.error('[get-concepts]', e)
    return new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error', status: 500 } }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})
