/**
 * lib/db/operations.ts
 *
 * All the functions for reading and writing data on the device's local database.
 *
 * Every part of the app that needs to store or retrieve data locally goes
 * through one of these functions — nothing imports the database directly.
 * This keeps the database logic in one place so it's easy to change.
 *
 * The local database stores:
 *   - Word entries waiting to be uploaded (including audio files)
 *   - Concept prompts for offline use
 *   - The contributor's profile
 *   - App settings like the contribution count
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from './database';
import type {
  LocalEntry,
  Contributor,
  Concept,
  SyncStatus,
  SpeakerMetadata,
  StorageInfo,
} from '@/types';

// ── App state (flags) ──────────────────────────────────────────────────────────

/**
 * Checks whether the person has already completed the onboarding form on this device.
 * Used when the app starts up to decide whether to show the welcome screen or not.
 */
export async function isOnboardingComplete(): Promise<boolean> {
  const row = await db.appState.get('onboarding_complete');
  return row?.value === true;
}

/**
 * Records that onboarding is done.
 * Called right after the contributor is saved to the server.
 * Private — only used within this file.
 */
async function markOnboardingComplete(): Promise<void> {
  await db.appState.put({ key: 'onboarding_complete', value: true });
}

// ── Contributor ────────────────────────────────────────────────────────────────

/**
 * Saves the contributor's profile to the device.
 * Called once when the person first registers. Also marks onboarding as done
 * so they aren't shown the welcome form again.
 */
export async function saveContributor(contributor: Contributor): Promise<void> {
  await db.contributor.put(contributor);
  await markOnboardingComplete();
}

/**
 * Loads the contributor's profile from the device.
 * Returns null if this is a first-time open or the device data was cleared.
 */
export async function loadContributor(): Promise<Contributor | null> {
  const rows = await db.contributor.toArray();
  return rows[0] ?? null;
}

/**
 * Updates specific fields on the saved contributor profile.
 * Used when the contributor provides their location after skipping onboarding.
 */
export async function updateContributor(patch: Partial<Contributor>): Promise<void> {
  const existing = await loadContributor();
  if (!existing) return;
  await db.contributor.put({ ...existing, ...patch });
}

// ── Concepts (offline cache) ───────────────────────────────────────────────────

/**
 * Saves all word concepts to the device for offline use.
 * Called when the app first connects to the internet.
 * Concepts are the list of words (like "water", "fire") that contributors record.
 */
export async function saveConcepts(concepts: Concept[]): Promise<void> {
  await db.concepts.bulkPut(concepts); // bulkPut saves all at once efficiently
  await db.appState.put({
    key: 'concepts_cached_at',
    value: new Date().toISOString(),
  });
}

/**
 * Returns all word concepts stored on the device, in alphabetical order by ID.
 */
export async function getCachedConcepts(): Promise<Concept[]> {
  return db.concepts.orderBy('id').toArray();
}

/**
 * Returns a randomly chosen concept from the device's offline cache.
 * Used when the app can't reach the server — gives the contributor something
 * to record rather than showing an error.
 */
export async function getRandomCachedConcept(): Promise<Concept | null> {
  const all = await getCachedConcepts();
  if (all.length === 0) return null;
  const idx = Math.floor(Math.random() * all.length);
  return all[idx];
}

// ── Lexicon entries ────────────────────────────────────────────────────────────

/**
 * Saves a new word entry to the device immediately after the contributor submits it.
 * This happens before anything is sent to the server — the contributor's work
 * is safe even if the internet drops right after they tap Submit.
 *
 * Also increments the contribution counter so the home screen stays up to date.
 *
 * Returns the local ID assigned to this entry.
 */
export async function queueEntry(params: {
  conceptId: string;
  englishGloss: string;
  nativeWord: string;
  promptId: string;
  speakerMetadata: SpeakerMetadata;
  audioBlob?: Blob;
  audioDurationSec?: number;
}): Promise<string> {
  const clientEntryId = uuidv4(); // Generate a unique ID for this entry before we know the server's ID

  const entry: LocalEntry = {
    clientEntryId,
    conceptId: params.conceptId,
    englishGloss: params.englishGloss,
    nativeWord: params.nativeWord,
    promptId: params.promptId,
    speakerMetadata: params.speakerMetadata,
    audioBlob: params.audioBlob,
    audioDurationSec: params.audioDurationSec,
    syncStatus: 'pending',
    createdAt: new Date().toISOString(),
  };

  await db.entries.put(entry);

  // Bump the persistent counter. We use a separate counter (not db.entries.count())
  // because synced entries get deleted from the device to free up space — without
  // this counter, the home screen would show "0 words" after every sync.
  const current = (await db.appState.get('total_contributions'))?.value as number ?? 0;
  await db.appState.put({ key: 'total_contributions', value: current + 1 });

  return clientEntryId;
}

/**
 * Returns all locally stored entries that have a given upload status.
 * Results are sorted oldest-first so the upload queue processes in order.
 */
export async function getEntriesByStatus(status: SyncStatus): Promise<LocalEntry[]> {
  return db.entries
    .where('syncStatus')
    .equals(status)
    .sortBy('createdAt');
}

/**
 * Returns all entries on the device, newest first.
 * Used by the local dictionary view to show the contributor's recent submissions.
 */
export async function getAllEntries(): Promise<LocalEntry[]> {
  return db.entries.orderBy('createdAt').reverse().toArray();
}

/**
 * Updates the upload status of a single entry.
 * When the server confirms receipt, also records the server's ID and the timestamp.
 */
export async function updateEntryStatus(
  clientEntryId: string,
  status: SyncStatus,
  serverEntryId?: string
): Promise<void> {
  await db.entries.update(clientEntryId, {
    syncStatus: status,
    ...(serverEntryId ? { serverEntryId } : {}),
    ...(status === 'synced' ? { syncedAt: new Date().toISOString() } : {}),
  });
}

/**
 * Deletes entries from the device once they've been safely uploaded.
 * Only removes entries that the server has confirmed — never entries that
 * are still pending or failed, as that would permanently lose the contributor's work.
 *
 * Returns how many entries were removed.
 */
export async function pruneSyncedEntries(): Promise<number> {
  const synced = await db.entries
    .where('syncStatus')
    .equals('synced')
    .toArray();

  // Only delete entries that have a server ID — double-confirmation they arrived.
  const toDelete = synced
    .filter(e => !!e.serverEntryId)
    .map(e => e.clientEntryId);

  if (toDelete.length > 0) {
    await db.entries.bulkDelete(toDelete);
  }
  return toDelete.length;
}

/**
 * Returns how many entries are saved on the device but not yet uploaded.
 * Shown in the sync status bar so the contributor knows data is waiting.
 */
export async function getPendingCount(): Promise<number> {
  return db.entries
    .where('syncStatus')
    .anyOf(['pending', 'syncing'])
    .count();
}

/**
 * Returns the total number of words ever contributed from this device.
 * Shown on the home screen as the contributor's running count.
 *
 * Uses a persistent counter stored in app settings rather than counting
 * rows in the entries table — because entries are deleted after upload,
 * counting rows would show "0 words" after every sync.
 *
 * Falls back to counting surviving rows for devices that don't have the
 * counter yet (entries added before this feature was introduced).
 */
export async function getTotalEntryCount(): Promise<number> {
  const row = await db.appState.get('total_contributions');
  if (row && typeof row.value === 'number') return row.value;

  // Fallback for existing devices — seed from however many rows still exist.
  const count = await db.entries.count();
  if (count > 0) {
    await db.appState.put({ key: 'total_contributions', value: count });
  }
  return count;
}

/**
 * Updates the local contribution counter if the server reports a higher count.
 * Called when the server returns its authoritative count — catches up devices
 * where entries were synced and deleted before the counter was introduced.
 */
export async function seedTotalContributionCount(serverCount: number): Promise<void> {
  const row = await db.appState.get('total_contributions');
  const local = typeof row?.value === 'number' ? row.value : 0;
  if (serverCount > local) {
    await db.appState.put({ key: 'total_contributions', value: serverCount });
  }
}

// ── Storage management ─────────────────────────────────────────────────────────

/**
 * Returns an estimate of how much storage space is being used on the device.
 * Shows a warning at 70% full and blocks new recordings at 90% to avoid
 * running out of space and losing data.
 *
 * This is an estimate, not an exact figure — the browser can only give
 * an approximation of storage usage.
 */
export async function getStorageInfo(): Promise<StorageInfo> {
  let usedBytes = 0;
  let totalBytes = 50 * 1024 * 1024; // Fall back to 50MB if the browser can't tell us

  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    usedBytes = estimate.usage ?? 0;
    totalBytes = estimate.quota ?? totalBytes;
  }

  const percentUsed = totalBytes > 0
    ? Math.min(Math.round((usedBytes / totalBytes) * 100), 100)
    : 0;

  return {
    usedBytes,
    totalBytes,
    percentUsed,
    isWarning: percentUsed >= 70,
    isBlocked: percentUsed >= 90,
  };
}
