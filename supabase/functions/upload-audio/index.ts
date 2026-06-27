/**
 * supabase/functions/upload-audio/index.ts
 * POST /upload-audio/:entryId
 *
 * Receives the audio recording for a word entry and stores it.
 *
 * This is always called AFTER /submit-entry, never before.
 * The entry must already exist in the database (text saved first).
 *
 * What happens here:
 *   1. Validates the file isn't too large and isn't silence.
 *   2. Stores the audio file in Supabase Storage at audio/{entryId}.opus
 *   3. Updates the entry record with the file path and duration.
 *   4. Marks the sync_queue record as fully resolved.
 *
 * The audio format is WebM/Opus, which is what all modern Android phones
 * and Chrome on desktop record natively. WAV conversion (for higher
 * compatibility) is done separately by a background job — that's why
 * audio_path_wav is null in the response here.
 *
 * Quality check: files under 5000 bytes are flagged as likely silence.
 * This flag is noted but doesn't block the upload — a human or future
 * automated process can review flagged entries.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-contributor-id',
}

const MAX_FILE_BYTES = 10 * 1024 * 1024  // 10MB — prevents runaway uploads
const MIN_DURATION   = 0.5               // seconds — shorter recordings are probably accidents

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const contributorId = req.headers.get('x-contributor-id')
    if (!contributorId) return err(401, 'MISSING_CONTRIBUTOR_ID', 'x-contributor-id required.')

    // The entry ID is part of the URL path: /upload-audio/:entryId
    const parts   = new URL(req.url).pathname.split('/')
    const entryId = parts[parts.length - 1]
    if (!entryId) return err(400, 'MISSING_ENTRY_ID', 'Entry ID required in URL.')

    // Audio is sent as multipart form data, not JSON, because JSON can't
    // carry binary files efficiently.
    const formData = await req.formData().catch(() => null)
    if (!formData) return err(400, 'INVALID_FORM', 'Multipart form data required.')

    const audioFile   = formData.get('audio_file') as File | null
    const durationSec = parseFloat((formData.get('duration_sec') as string) ?? '0')

    if (!audioFile)                         return err(400, 'MISSING_AUDIO', 'audio_file field required.')
    if (audioFile.size > MAX_FILE_BYTES)    return err(413, 'FILE_TOO_LARGE', 'Audio file exceeds 10MB limit.')
    if (durationSec < MIN_DURATION)         return err(400, 'TOO_SHORT', `Recording must be at least ${MIN_DURATION}s.`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Confirm the entry belongs to this contributor before touching storage.
    // Without this check anyone could overwrite another person's audio.
    const { data: entry } = await supabase
      .from('lexicon_entries')
      .select('id, contributor_id')
      .eq('id', entryId)
      .eq('contributor_id', contributorId)
      .single()

    if (!entry) return err(404, 'ENTRY_NOT_FOUND', 'Entry not found or access denied.')

    // Store the audio file. Using upsert:true means retries don't fail if the
    // file was already partially uploaded.
    const opusPath   = `audio/${entryId}.opus`
    const audioBytes = await audioFile.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from('lexicon')
      .upload(opusPath, audioBytes, {
        contentType: audioFile.type || 'audio/webm',
        upsert: true,
      })

    if (uploadError) {
      console.error('[upload-audio] storage error:', uploadError)
      return err(500, 'STORAGE_ERROR', 'Failed to store audio file.')
    }

    // Files under 5000 bytes are suspiciously small — likely silence or a tap.
    // Flag them for human review without blocking the upload.
    const snrFlag = audioFile.size < 5000

    // Write the file path back to the entry so next-task can find it.
    await supabase
      .from('lexicon_entries')
      .update({
        audio_path_opus:    opusPath,
        audio_duration_sec: durationSec,
        audio_snr_flag:     snrFlag,
      })
      .eq('id', entryId)

    // This entry is now fully uploaded — mark the sync_queue record resolved.
    await supabase
      .from('sync_queue')
      .update({
        audio_uploaded: true,
        resolved:       true,
        resolved_at:    new Date().toISOString(),
      })
      .eq('entry_id', entryId)

    return new Response(
      JSON.stringify({
        audio_path_opus: opusPath,
        audio_path_wav:  null,  // filled in later by a background transcoding job
        snr_flag:        snrFlag,
        duration_sec:    durationSec,
      }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    console.error('[upload-audio]', e)
    return err(500, 'INTERNAL_ERROR', 'An unexpected error occurred.')
  }
})

/** Sends a structured error response with a machine-readable code. */
function err(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message, status } }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' }
  })
}
