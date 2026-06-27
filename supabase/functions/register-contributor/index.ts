/**
 * supabase/functions/register-contributor/index.ts
 * POST /register-contributor
 *
 * Creates a new anonymous contributor record on first app open.
 * No email, password, or personal name is collected — only the person's
 * home state and town, which are used to match their words to the right
 * Dinka dialect group.
 *
 * After inserting the record, a database trigger (set_contributor_location_metadata)
 * automatically fills in the language_id and tries to infer the dialect_id from
 * the town name. The dialect inference is what enables affinity-tier review routing:
 * speakers from the same dialect review each other's words first.
 *
 * Returns:
 *   - contributor_id: the UUID to store on the device (used in all future requests)
 *   - dialect_inferred: the dialect code matched from town, or null if not matched
 *   - language: always "dinka" for now
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers allow the browser app (on any origin) to call this function.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-contributor-id',
}

serve(async (req) => {
  // Browsers send a preflight OPTIONS request before the real request — just say OK.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json().catch(() => null)
    if (!body) return err(400, 'INVALID_BODY', 'JSON body required.')

    const { town, state, age_range, gender, l1_status } = body

    // State and town are the minimum required — everything else is optional metadata.
    if (!town?.trim() || !state?.trim())
      return err(400, 'MISSING_FIELDS', 'town and state are required.')

    // Use the service role key so this function can write to the database
    // without needing the user to be logged in.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Insert the contributor. The database trigger fires here and fills in
    // language_id and dialect_id based on the town/state values.
    const { data: contributor, error: insertError } = await supabase
      .from('contributors')
      .insert({
        town:        town.trim(),
        state:       state.trim(),
        age_range:   age_range ?? null,
        gender:      gender ?? null,
        l1_status:   l1_status ?? 'L1',
        is_reviewer: true,  // All contributors can also review
      })
      .select('id, dialect_id, language_id')
      .single()

    if (insertError) {
      console.error('[register-contributor]', insertError)
      return err(500, 'INSERT_FAILED', 'Failed to register contributor.')
    }

    // Look up the human-readable dialect code (e.g. "rek", "bor") from the ID.
    let dialectCode: string | null = null
    if (contributor.dialect_id) {
      const { data: dialect } = await supabase
        .from('dialects')
        .select('code')
        .eq('id', contributor.dialect_id)
        .single()
      dialectCode = dialect?.code ?? null
    }

    // Look up the language code (always "dinka" in the current dataset).
    const { data: language } = await supabase
      .from('languages')
      .select('code')
      .eq('id', contributor.language_id)
      .single()

    return new Response(
      JSON.stringify({
        contributor_id:   contributor.id,
        dialect_inferred: dialectCode,
        language:         language?.code ?? 'dinka',
      }),
      { status: 201, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    console.error('[register-contributor]', e)
    return err(500, 'INTERNAL_ERROR', 'An unexpected error occurred.')
  }
})

/** Sends a structured error response with a machine-readable code. */
function err(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message, status } }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' }
  })
}
