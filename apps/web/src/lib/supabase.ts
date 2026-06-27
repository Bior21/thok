/**
 * lib/supabase.ts
 *
 * This file sets up the connection to Supabase — the cloud service that
 * stores all words, reviews, and contributor data for Thok.
 *
 * It provides two things:
 *   1. A shared Supabase client for querying the database directly.
 *   2. A helper function (callFunction) that every API call in the app uses
 *      to talk to the server-side functions (Edge Functions).
 *
 * Every request automatically includes the contributor's ID and the API key
 * so the server knows who is making the request.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const ENV_ERROR =
  '[Thok] Missing Supabase environment variables.\n' +
  'Copy apps/web/.env.example to apps/web/.env.local and fill in your values.';

/**
 * Reads the Supabase URL and anonymous API key from environment variables.
 * Throws a clear error if they're missing so the developer knows what to fix.
 */
function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(ENV_ERROR);
  }

  return { url, anonKey };
}

// ── Singleton client ───────────────────────────────────────────────────────────

let _client: SupabaseClient | null = null;

/**
 * Returns the shared Supabase database client.
 * Creates it once on first use and reuses it — avoids opening multiple connections.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    const { url, anonKey } = getSupabaseConfig();
    _client = createClient(url, anonKey, {
      auth: {
        // Thok uses anonymous contributor IDs instead of Supabase login accounts.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return _client;
}

// ── Edge Function helpers ──────────────────────────────────────────────────────

/** Returns the base URL for all server-side functions. */
export function getFunctionsUrl(): string {
  const { url } = getSupabaseConfig();
  return `${url}/functions/v1`;
}

/**
 * Sends a request to one of the Thok server-side functions and returns the result.
 *
 * Automatically attaches the API key and the contributor's ID to every request.
 * If the server returns an error, this throws with a readable message so the
 * calling code doesn't have to handle raw HTTP responses.
 *
 * Note: when sending audio files (FormData), the Content-Type header is left
 * out intentionally — the browser sets it automatically with the correct
 * boundary string that makes multipart uploads work.
 *
 * @param path           - The function to call, e.g. '/next-task'
 * @param contributorId  - The device's contributor ID, attached to every request
 * @param options        - Standard fetch options (method, body, headers)
 */
export async function callFunction<T>(
  path: string,
  contributorId: string,
  options: RequestInit = {}
): Promise<T> {
  const { anonKey } = getSupabaseConfig();

  // Audio uploads use FormData — the browser must set Content-Type itself
  // to include the correct multipart boundary. Overwriting it would break uploads.
  const isFormData = options.body instanceof FormData;

  const response = await fetch(`${getFunctionsUrl()}${path}`, {
    ...options,
    headers: {
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      'apikey': anonKey,
      'x-contributor-id': contributorId,
      // Caller-provided headers come last so they can override defaults if needed.
      ...(options.headers ?? {}),
    },
  });

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(`[Thok API] Non-JSON response from ${path} (status ${response.status})`);
  }

  if (!response.ok) {
    // Pull the server's human-readable error message out of the response.
    const err = (data as { error?: { message?: string } })?.error;
    throw new Error(
      err?.message ?? `[Thok API] Error ${response.status} from ${path}`
    );
  }

  return data as T;
}
