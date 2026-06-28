/**
 * supabase/functions/request-language/index.ts
 * POST /request-language
 *
 * Accepts a community request to add a new language to Thok.
 * Saves the request to the language_requests table and attempts to
 * send an email notification via Resend (graceful if key not configured).
 *
 * Body fields:
 *   language_name  — name of the language (required)
 *   region         — where it is spoken (required)
 *   est_speakers   — rough speaker count estimate (optional)
 *   contact_name   — person's name (required)
 *   contact_email  — person's email (required)
 *   message        — extra context from the requester (optional)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const NOTIFY_EMAIL = 'biormadol21@gmail.com'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json().catch(() => null)
    if (!body) return err(400, 'INVALID_BODY', 'JSON body required.')

    const { language_name, region, est_speakers, contact_name, contact_email, message } = body

    if (!language_name?.trim()) return err(400, 'MISSING_FIELD', 'language_name is required.')
    if (!region?.trim())        return err(400, 'MISSING_FIELD', 'region is required.')
    if (!contact_name?.trim())  return err(400, 'MISSING_FIELD', 'contact_name is required.')
    if (!contact_email?.trim()) return err(400, 'MISSING_FIELD', 'contact_email is required.')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: row, error: insertError } = await supabase
      .from('language_requests')
      .insert({
        language_name:  language_name.trim(),
        region:         region.trim(),
        est_speakers:   est_speakers?.trim() || null,
        contact_name:   contact_name.trim(),
        contact_email:  contact_email.trim(),
        message:        message?.trim() || null,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[request-language] insert error:', insertError)
      return err(500, 'INSERT_FAILED', 'Failed to save your request. Please try again.')
    }

    // Try to send an email notification — non-fatal if Resend is not configured.
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (resendKey) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from:    'Thok <onboarding@resend.dev>',
            to:      [NOTIFY_EMAIL],
            subject: `New language request: ${language_name.trim()}`,
            html: `
              <h2>New Language Request on Thok</h2>
              <table cellpadding="6">
                <tr><td><strong>Language</strong></td><td>${language_name.trim()}</td></tr>
                <tr><td><strong>Region</strong></td><td>${region.trim()}</td></tr>
                <tr><td><strong>Est. Speakers</strong></td><td>${est_speakers?.trim() || '—'}</td></tr>
                <tr><td><strong>Contact</strong></td><td>${contact_name.trim()} &lt;${contact_email.trim()}&gt;</td></tr>
                <tr><td><strong>Message</strong></td><td>${message?.trim() || '—'}</td></tr>
              </table>
              <p style="color:#888;font-size:12px">Request ID: ${row.id}</p>
            `,
          }),
        })
      } catch (emailErr) {
        console.warn('[request-language] email send failed (non-fatal):', emailErr)
      }
    } else {
      console.info('[request-language] RESEND_API_KEY not set — skipping email notification.')
    }

    return new Response(
      JSON.stringify({ success: true, request_id: row.id }),
      { status: 201, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )

  } catch (e) {
    console.error('[request-language]', e)
    return err(500, 'INTERNAL_ERROR', 'An unexpected error occurred.')
  }
})

function err(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message, status } }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
