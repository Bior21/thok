/**
 * lib/api.ts
 *
 * Every call the app makes to the Thok server lives here.
 * No screen or hook talks to the server directly — they all go through
 * one of these functions. This keeps network logic in one place and
 * makes it easy to see everything the app can ask the server to do.
 *
 * The server speaks in snake_case (e.g. entry_id). This file translates
 * everything into camelCase (e.g. entryId) before handing it to the rest
 * of the app, so the rest of the code doesn't have to think about that.
 */

import { callFunction } from '@/lib/supabase';
import { ThokRecorder } from '@/lib/audio/recorder';
import type {
  NextTask,
  ReviewSubmission,
  ReviewResult,
  DictionaryResponse,
  RegisterContributorResponse,
  SubmitEntryResponse,
  UploadAudioResponse,
  SpeakerMetadata,
  Concept,
} from '@/types';

/**
 * Fixes audio URLs so the browser can reach them.
 *
 * When running locally, the server generates audio links using an internal
 * address (http://kong:8000) that only works inside Docker — the browser
 * can't reach it. This function replaces that internal address with the
 * public one (http://127.0.0.1:54321) so audio can actually play.
 * On the live hosted server the addresses already match, so this is a no-op.
 */
function toPublicStorageUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return url;
  try {
    const u = new URL(url);
    const b = new URL(base);
    u.protocol = b.protocol;
    u.host = b.host; // host includes the port number
    return u.toString();
  } catch {
    return url;
  }
}

// ── Next task ──────────────────────────────────────────────────────────────────

/**
 * Asks the server what the contributor should do next — contribute a new word
 * or review an existing one.
 *
 * The server decides based on how many words this person has contributed and
 * how many entries are waiting to be reviewed. The app just renders whatever
 * comes back.
 *
 * Also returns the server's count of this contributor's total contributions,
 * which the app uses to keep its local count accurate even after old entries
 * have been cleared from the device.
 */
export async function fetchNextTask(
  contributorId: string
): Promise<NextTask & { serverContributionCount?: number }> {
  const data = await callFunction<{
    task_type: string;
    prompt?: unknown;
    entry?: unknown;
    total_contributions?: number;
  }>('/next-task', contributorId, { method: 'GET' });

  const serverContributionCount =
    typeof data.total_contributions === 'number' ? data.total_contributions : undefined;

  // Convert the server's snake_case field names to camelCase for the app.
  if (data.task_type === 'contribute') {
    const p = data.prompt as Record<string, unknown>;
    return {
      taskType: 'contribute',
      serverContributionCount,
      prompt: {
        promptId:     String(p.prompt_id ?? ''),
        conceptId:    String(p.concept_id ?? ''),
        englishGloss: String(p.english_gloss ?? ''),
        promptType:   (p.prompt_type as 'image' | 'word' | 'context' | 'sentence') ?? 'word',
        conceptType:  (p.concept_type as 'word' | 'sentence') ?? 'word',
        imageUrl:     p.image_url ? String(p.image_url) : undefined,
        contextText:  p.context_text ? String(p.context_text) : undefined,
      },
    };
  }

  if (data.task_type === 'review') {
    const e = data.entry as Record<string, unknown>;
    return {
      taskType: 'review',
      serverContributionCount,
      entry: {
        entryId:        String(e.entry_id ?? ''),
        conceptId:      String(e.concept_id ?? ''),
        englishGloss:   String(e.english_gloss ?? ''),
        nativeWord:     String(e.native_word ?? ''),
        // Fix the audio URL so the browser can reach it (see toPublicStorageUrl above).
        // Seed entries have no audio — audioUrl is left undefined.
        audioUrl:       e.audio_url ? (toPublicStorageUrl(String(e.audio_url)) ?? undefined) : undefined,
        submitterTown:  String(e.submitter_town ?? ''),
        submitterState: String(e.submitter_state ?? ''),
        affinityTier:   Number(e.affinity_tier ?? 3) as 1 | 2 | 3 | 4,
        isSeedEntry:    Boolean(e.is_seed_entry ?? false),
      },
    };
  }

  throw new Error(`[Thok API] Unknown task_type: ${data.task_type}`);
}

// ── Skip concept ──────────────────────────────────────────────────────────────

/**
 * Records that a contributor doesn't know the word for a concept.
 * Fire-and-forget — the app moves to the next task immediately without
 * waiting for a response. The data is used for research only.
 */
export async function skipConcept(
  contributorId: string,
  conceptId: string
): Promise<void> {
  await callFunction('/skip-concept', contributorId, {
    method: 'POST',
    body: JSON.stringify({ concept_id: conceptId }),
  });
}

// ── Contributors ───────────────────────────────────────────────────────────────

/**
 * Registers a new contributor on the server the first time the app is opened.
 * The server assigns a unique ID which is saved to the device for future requests.
 * The 'new' placeholder tells the server to ignore any contributor ID header
 * and create a fresh record instead.
 */
export async function registerContributor(params: {
  town: string;
  state: string;
  languageCode?: string;
  ageRange?: string;
  gender?: string;
  l1Status?: 'L1' | 'L2';
}): Promise<RegisterContributorResponse> {
  const data = await callFunction<Record<string, unknown>>(
    '/register-contributor', 'new',
    {
      method: 'POST',
      body: JSON.stringify({
        town:          params.town,
        state:         params.state,
        language_code: params.languageCode ?? null,
        age_range:     params.ageRange ?? null,
        gender:        params.gender ?? null,
        l1_status:     params.l1Status ?? 'L1',
      }),
    }
  );

  return {
    contributorId:   String(data.contributor_id ?? ''),
    dialectInferred: data.dialect_inferred ? String(data.dialect_inferred) : undefined,
    language:        String(data.language ?? 'dinka'),
  };
}

export async function fetchLeaderboard(contributorId: string): Promise<{
  leaderboard: { state: string; wordCount: number }[];
  contributorState: string | null;
  contributorRank: number | null;
}> {
  return callFunction('/get-leaderboard', contributorId, { method: 'GET' });
}

export async function requestLanguage(params: {
  languageName: string;
  region: string;
  estSpeakers?: string;
  contactName: string;
  contactEmail: string;
  message?: string;
}): Promise<{ requestId: string }> {
  const data = await callFunction<Record<string, unknown>>(
    '/request-language', 'new',
    {
      method: 'POST',
      body: JSON.stringify({
        language_name: params.languageName,
        region:        params.region,
        est_speakers:  params.estSpeakers ?? null,
        contact_name:  params.contactName,
        contact_email: params.contactEmail,
        message:       params.message ?? null,
      }),
    }
  );
  return { requestId: String(data.request_id ?? '') };
}

// ── Entries ────────────────────────────────────────────────────────────────────

/**
 * Sends the text details of a new word entry to the server.
 * The audio recording is sent separately via uploadAudio() to keep
 * retries simple — if audio fails, the text is still safely stored.
 */
export async function submitEntry(
  contributorId: string,
  params: {
    clientEntryId: string;
    conceptId: string;
    nativeWord: string;
    promptId: string;
    speakerMetadata: SpeakerMetadata;
  }
): Promise<SubmitEntryResponse> {
  const data = await callFunction<Record<string, unknown>>(
    '/submit-entry', contributorId,
    {
      method: 'POST',
      body: JSON.stringify({
        client_entry_id: params.clientEntryId,
        concept_id:      params.conceptId,
        native_word:     params.nativeWord,
        prompt_id:       params.promptId,
        speaker_metadata: {
          age_range: params.speakerMetadata.ageRange ?? null,
          gender:    params.speakerMetadata.gender ?? null,
          l1_status: params.speakerMetadata.l1Status,
        },
      }),
    }
  );

  return {
    entryId:  String(data.entry_id ?? ''),
    syncedAt: String(data.synced_at ?? new Date().toISOString()),
  };
}

/**
 * Uploads the audio recording file for a word entry that has already been
 * submitted to the server. Sending the recording as a separate step means
 * the word is never lost even if the audio upload fails or times out.
 */
export async function uploadAudio(
  contributorId: string,
  entryId: string,
  audioBlob: Blob,
  durationSec: number
): Promise<UploadAudioResponse> {
  const ext = ThokRecorder.extensionFor(audioBlob.type);
  const formData = new FormData();
  formData.append('audio_file', audioBlob, `recording.${ext}`);
  formData.append('duration_sec', String(durationSec));

  const data = await callFunction<Record<string, unknown>>(
    `/upload-audio/${entryId}`, contributorId,
    {
      method: 'POST',
      // Passing an empty headers object so callFunction skips setting Content-Type.
      // The browser sets it automatically for FormData with the correct boundary.
      headers: {},
      body: formData,
    }
  );

  return {
    audioPathOpus: String(data.audio_path_opus ?? ''),
    audioPathWav:  data.audio_path_wav ? String(data.audio_path_wav) : null,
    snrFlag:       Boolean(data.snr_flag ?? false),
    durationSec:   Number(data.duration_sec ?? durationSec),
  };
}

// ── Reviews ────────────────────────────────────────────────────────────────────

/**
 * Submits a reviewer's verdict on a word entry — judging both the written
 * word and the audio recording independently.
 *
 * If the reviewer recorded a replacement audio clip, this function uploads
 * it after the verdict is saved. The verdict is always saved first so it's
 * never lost if the audio upload fails.
 */
export async function submitReview(
  contributorId: string,
  review: ReviewSubmission
): Promise<ReviewResult> {
  const data = await callFunction<Record<string, unknown>>(
    '/submit-review', contributorId,
    {
      method: 'POST',
      body: JSON.stringify({
        entry_id:          review.entryId,
        affinity_tier:     review.affinityTier,
        text_verdict:      review.textVerdict,
        wrong_type:        review.wrongType       ?? null,
        text_correction:   review.textCorrection  ?? null,
        audio_verdict:     review.audioVerdict    ?? null,  // null for seed entries (no audio to judge)
        will_upload_audio: review.willUploadAudio ?? false,
      }),
    }
  );

  const correctionEntryId = data.correction_entry_id
    ? String(data.correction_entry_id)
    : undefined;

  // If the reviewer recorded a replacement clip and the server created a slot
  // for it, upload the recording now. A failure here is non-fatal — the
  // verdict is already saved and the audio can be re-uploaded later.
  if (correctionEntryId && review.audioBlob && review.audioDurationSec) {
    try {
      await uploadAudio(contributorId, correctionEntryId, review.audioBlob, review.audioDurationSec);
    } catch (uploadErr) {
      console.error('[submitReview] correction audio upload failed:', uploadErr);
    }
  }

  return {
    verdictId:         String(data.verdict_id       ?? ''),
    confidenceScore:   Number(data.confidence_score ?? 0),
    isVerified:        Boolean(data.is_verified     ?? false),
    textVerified:      Boolean(data.text_verified   ?? false),
    audioVerified:     Boolean(data.audio_verified  ?? false),
    correctionEntryId,
  };
}

// ── Dictionary ─────────────────────────────────────────────────────────────────

/**
 * Fetches a page of verified word entries for the live dictionary view.
 * Uses limit/offset pagination so the dictionary can load more entries
 * without fetching everything at once.
 */
export async function fetchDictionary(
  contributorId: string,
  limit = 20,
  offset = 0
): Promise<DictionaryResponse> {
  const data = await callFunction<{ entries: Record<string, unknown>[]; total: number }>(
    `/get-dictionary?limit=${limit}&offset=${offset}`,
    contributorId,
    { method: 'GET' }
  );

  return {
    entries: (data.entries ?? []).map(e => ({
      entryId:      String(e.entry_id ?? ''),
      nativeWord:   String(e.native_word ?? ''),
      englishGloss: String(e.english_gloss ?? ''),
      isVerified:   Boolean(e.is_verified ?? false),
      isOwn:        Boolean(e.is_own ?? false),
      audioUrl:     e.audio_url ? toPublicStorageUrl(String(e.audio_url)) : undefined,
    })),
    total: Number(data.total ?? 0),
  };
}

// ── Concepts ───────────────────────────────────────────────────────────────────

/**
 * Downloads all word concepts so they can be saved on the device.
 * This lets the app show prompts to contributors even without internet —
 * the concept list is cached and reused until it goes stale.
 */
export async function fetchConcepts(contributorId: string): Promise<Concept[]> {
  const data = await callFunction<Record<string, unknown>[]>(
    '/get-concepts', contributorId,
    { method: 'GET' }
  );

  return (Array.isArray(data) ? data : []).map(c => ({
    id:            String(c.id ?? ''),
    englishGloss:  String(c.english_gloss ?? ''),
    imagePath:     c.image_path ? String(c.image_path) : undefined,
    promptContext: c.prompt_context ? String(c.prompt_context) : undefined,
  }));
}
