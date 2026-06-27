/**
 * supabase/functions/submit-entry/index.ts
 * POST /submit-entry
 *
 * Saves a new word entry to the database. Audio is NOT sent here —
 * it's uploaded separately via POST /upload-audio/:entryId.
 *
 * Why split text and audio into two requests?
 * Audio files are large and more likely to fail or time out.
 * Saving the text first means the word is never lost even if the
 * audio upload fails. The entry just won't have audio until it retries.
 *
 * Idempotent: if the same client_entry_id arrives twice (e.g. because the
 * app retried after a network drop), the server returns the existing entry
 * instead of creating a duplicate.
 *
 * The server fills in language_id and dialect_id from the contributor's
 * profile — the app doesn't need to send these.
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
    // The contributor ID is sent in a header, not the body, for consistency
    // across all endpoints.
    const contributorId = req.headers.get('x-contributor-id')
    if (!contributorId) return err(401, 'MISSING_CONTRIBUTOR_ID', 'x-contributor-id required.')

    const body = await req.json().catch(() => null)
    if (!body) return err(400, 'INVALID_BODY', 'Request body must be valid JSON.')

    const { client_entry_id, concept_id, native_word, prompt_id, speaker_metadata } = body

    if (!client_entry_id || !concept_id || !native_word) {
      return err(400, 'MISSING_FIELDS', 'client_entry_id, concept_id, and native_word are required.')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Idempotency check: if the app already sent this entry (same client_entry_id),
    // return the existing record rather than inserting a duplicate.
    const { data: existing } = await supabase
      .from('sync_queue')
      .select('entry_id, created_at')
      .eq('client_entry_id', client_entry_id)
      .eq('contributor_id', contributorId)
      .single()

    if (existing?.entry_id) {
      return new Response(
        JSON.stringify({ entry_id: existing.entry_id, synced_at: existing.created_at }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Load the contributor's profile to copy their location into the entry.
    const { data: contributor } = await supabase
      .from('contributors')
      .select('id, town, state, dialect_id, language_id')
      .eq('id', contributorId)
      .single()

    if (!contributor) return err(404, 'CONTRIBUTOR_NOT_FOUND', 'Contributor not registered.')

    // Only insert entries for the currently active language (Dinka MVP).
    const { data: language } = await supabase
      .from('languages')
      .select('id')
      .eq('is_mvp_active', true)
      .single()

    if (!language) return err(503, 'LANGUAGE_INACTIVE', 'No active language configured.')

    const syncedAt = new Date().toISOString()

    // Create the entry. A database trigger fills in tone_language_flag
    // and refines dialect if not already set.
    const { data: entry, error: insertError } = await supabase
      .from('lexicon_entries')
      .insert({
        concept_id,
        native_word:        native_word.trim(),
        language_id:        language.id,
        dialect_id:         contributor.dialect_id ?? null,
        region_town:        contributor.town,
        region_state:       contributor.state,
        contributor_id:     contributorId,
        speaker_age_range:  speaker_metadata?.age_range ?? null,
        speaker_gender:     speaker_metadata?.gender ?? null,
        speaker_l1_status:  speaker_metadata?.l1_status ?? 'L1',
        synced_at:          syncedAt,
        is_visible:         true,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[submit-entry]', insertError)
      return err(500, 'INSERT_FAILED', 'Failed to save entry.')
    }

    // Record in sync_queue so we can check idempotency on future retries
    // and track whether audio has been uploaded yet.
    await supabase.from('sync_queue').insert({
      client_entry_id,
      contributor_id:     contributorId,
      entry_id:           entry.id,
      metadata_uploaded:  true,
      audio_uploaded:     false,   // audio comes separately via /upload-audio
      resolved:           false,
      payload_json:       { concept_id, native_word, prompt_id },
    })

    return new Response(
      JSON.stringify({ entry_id: entry.id, synced_at: syncedAt }),
      { status: 201, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    console.error('[submit-entry]', e)
    return err(500, 'INTERNAL_ERROR', 'An unexpected error occurred.')
  }
})

/** Sends a structured error response with a machine-readable code. */
function err(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message, status } }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' }
  })
}
