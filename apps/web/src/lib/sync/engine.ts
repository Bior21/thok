/**
 * lib/sync/engine.ts
 *
 * This file handles uploading locally saved word entries to the server
 * whenever the device has an internet connection.
 *
 * How it works:
 * When a contributor submits a word, it's saved on the device first (offline-safe).
 * This engine then picks up those waiting entries and uploads them one by one.
 * If an upload fails, it retries up to 3 times with increasing wait times.
 *
 * Uploading happens in two steps for each entry:
 *   1. Send the word text and metadata first — so the entry exists on the server.
 *   2. Then send the audio file — which is larger and more likely to fail.
 * This way, if the audio upload fails, the word text is already saved and
 * the audio can be retried later without duplicating the entry.
 *
 * Only one sync can run at a time — a flag prevents them from overlapping.
 */

import { submitEntry, uploadAudio } from '@/lib/api';
import {
  getEntriesByStatus,
  updateEntryStatus,
  pruneSyncedEntries,
} from '@/lib/db/operations';
import type { LocalEntry } from '@/types';

// ── Config ─────────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000; // Start with 1 second, then 2s, then 4s

// ── State ──────────────────────────────────────────────────────────────────────

/** Prevents two sync processes from running at the same time. */
let isSyncing = false;

// ── Main sync function ─────────────────────────────────────────────────────────

/**
 * Uploads all pending and failed entries to the server.
 * Skips if a sync is already in progress.
 *
 * @param contributorId - The ID sent with every upload request.
 * @param onProgress    - Optional callback called after each entry uploads.
 * @returns How many entries were successfully uploaded in this run.
 */
export async function syncQueue(
  contributorId: string,
  onProgress?: (synced: number, total: number) => void
): Promise<number> {
  if (isSyncing) return 0; // Another sync is already running — skip this call
  isSyncing = true;

  let syncedCount = 0;

  try {
    const pendingEntries = await getEntriesByStatus('pending');
    const failedEntries  = await getEntriesByStatus('failed');
    const allEntries     = [...pendingEntries, ...failedEntries];

    if (allEntries.length === 0) return 0;

    const total = allEntries.length;

    for (const entry of allEntries) {
      try {
        await uploadEntry(entry, contributorId);
        syncedCount++;
        onProgress?.(syncedCount, total);
      } catch (err) {
        console.error(`[sync] Failed to upload ${entry.clientEntryId}:`, err);
        await updateEntryStatus(entry.clientEntryId, 'failed');
      }
    }

    // Remove successfully uploaded entries from the device to free storage space.
    await pruneSyncedEntries();

    return syncedCount;
  } finally {
    isSyncing = false; // Always release the lock, even if something threw
  }
}

// ── Entry upload ───────────────────────────────────────────────────────────────

/**
 * Uploads a single entry to the server in two steps: text first, then audio.
 * If the text was already uploaded in a previous attempt (serverEntryId is set),
 * skips straight to uploading the audio.
 */
async function uploadEntry(
  entry: LocalEntry,
  contributorId: string
): Promise<void> {
  await updateEntryStatus(entry.clientEntryId, 'syncing');

  let serverEntryId: string = entry.serverEntryId ?? '';

  if (!serverEntryId) {
    // Step 1: Upload the word text and metadata.
    const metaResponse = await withRetry(
      () =>
        submitEntry(contributorId, {
          clientEntryId: entry.clientEntryId,
          conceptId:     entry.conceptId,
          nativeWord:    entry.nativeWord,
          promptId:      entry.promptId,
          speakerMetadata: entry.speakerMetadata,
        }),
      MAX_RETRIES
    );

    serverEntryId = metaResponse.entryId;
    // Save the server's ID on the device now — so if audio upload fails and we
    // retry, we know not to re-upload the text (which would create a duplicate).
    await updateEntryStatus(entry.clientEntryId, 'syncing', serverEntryId);
  }

  // Step 2: Upload the audio file, if one was recorded.
  if (entry.audioBlob) {
    await withRetry(
      () =>
        uploadAudio(
          contributorId,
          serverEntryId,
          entry.audioBlob!,
          entry.audioDurationSec ?? 0
        ),
      MAX_RETRIES
    );
  }

  await updateEntryStatus(entry.clientEntryId, 'synced', serverEntryId);
}

// ── Retry helper ───────────────────────────────────────────────────────────────

/**
 * Runs a function and retries it if it fails, waiting longer between each attempt.
 * Waits 1s after the first failure, 2s after the second, 4s after the third.
 * Throws the last error if all attempts fail.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts - 1) {
        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError ?? new Error('Upload failed after maximum retries.');
}

// ── Connectivity ───────────────────────────────────────────────────────────────

/**
 * Starts listening for the device coming back online.
 * Whenever the device reconnects, triggers a sync automatically.
 * Call this once when the app starts. Returns a function to stop listening.
 */
export function setupConnectivityListener(
  contributorId: string,
  onSyncStart: () => void,
  onSyncComplete: (synced: number) => void
): () => void {
  const handleOnline = async () => {
    onSyncStart();
    const synced = await syncQueue(contributorId);
    onSyncComplete(synced);
  };

  window.addEventListener('online', handleOnline);
  return () => window.removeEventListener('online', handleOnline);
}

/** Returns true if the device is currently connected to the internet. */
export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine;
}
