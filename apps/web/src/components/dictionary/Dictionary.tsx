/**
 * components/dictionary/Dictionary.tsx
 *
 * Live dictionary embedded on the Home screen.
 *
 * Two data sources merged into one list:
 *   1. Local IndexedDB entries (pending sync) — visible instantly after submit
 *   2. Server entries (synced/verified) — fetched when online
 *
 * The product promise is: "submit a word and see it in the dictionary
 * immediately." Local entries make this true even offline.
 * Server entries provide verified status and audio URLs for other speakers.
 *
 * Deduplication: if a local entry has been synced and appears on both sides,
 * the server version wins (has richer data).
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/app';
import { getAllEntries } from '@/lib/db/operations';
import { fetchDictionary } from '@/lib/api';
import { playAudioUrl, playAudioBlob } from '@/lib/audio/recorder';
import type { LocalEntry, DictionaryEntry } from '@/types';

// ── Merged entry type ─────────────────────────────────────────────────────────

interface MergedEntry {
  id: string;
  nativeWord: string;
  englishGloss: string;
  isVerified: boolean;
  isPending: boolean;   // true = not yet confirmed by server
  audioBlob?: Blob;     // for local unsynced entries
  audioUrl?: string;    // for server entries
}

// ── Component ──────────────────────────────────────────────────────────────────

export function Dictionary() {
  const contributor  = useAppStore(s => s.contributor);
  const connectivity = useAppStore(s => s.connectivity);

  const [entries, setEntries]   = useState<MergedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!contributor) return;
    setIsLoading(true);

    try {
      // ── Local entries (IndexedDB) ─────────────────────────────────────────
      const localRows: LocalEntry[] = await getAllEntries();

      // ── Server entries ────────────────────────────────────────────────────
      let serverMapped: MergedEntry[] = [];
      const canFetch = connectivity === 'online' || connectivity === 'syncing';

      if (canFetch) {
        try {
          const response = await fetchDictionary(contributor.id, 30);
          serverMapped = response.entries.map((e: DictionaryEntry) => ({
            id:           e.entryId,
            nativeWord:   e.nativeWord,
            englishGloss: e.englishGloss,
            isVerified:   e.isVerified,
            isPending:    false,
            audioUrl:     e.audioUrl,
          }));
        } catch {
          // Non-fatal — show local entries only.
        }
      }

      const serverIds = new Set(serverMapped.map(e => e.id));

      // Only show local entries not yet confirmed by server.
      // Skip locals whose serverEntryId already appears in server results
      // (partial upload: metadata synced, audio still pending).
      const localMapped: MergedEntry[] = localRows
        .filter(e => e.syncStatus !== 'synced')
        .filter(e => !e.serverEntryId || !serverIds.has(e.serverEntryId))
        .map(e => ({
          id:           e.clientEntryId,
          nativeWord:   e.nativeWord,
          englishGloss: e.englishGloss,
          isVerified:   false,
          isPending:    true,
          audioBlob:    e.audioBlob,
        }));

      const dedupedLocal = localMapped;

      setEntries([...dedupedLocal, ...serverMapped]);
    } finally {
      setIsLoading(false);
    }
  }, [contributor, connectivity]);

  // Reload when connectivity changes (entries may have just synced).
  useEffect(() => {
    load();
  }, [load]);

  if (isLoading) {
    return (
      <div className="mt-2">
        <SectionHeader />
        <p className="text-xs text-gray-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <SectionHeader />

      {entries.length === 0 ? (
        <p className="text-xs text-gray-400 leading-relaxed">
          Your words will appear here. Every word you record helps preserve your language for the next generation.
        </p>
      ) : (
        <div className="divide-y divide-gray-100">
          {entries.map(entry => (
            <DictionaryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader() {
  return (
    <div className="text-xs font-medium text-gray-500 mb-3">
      Your words
    </div>
  );
}

function DictionaryRow({ entry }: { entry: MergedEntry }) {
  const handlePlay = () => {
    if (entry.audioBlob)  { playAudioBlob(entry.audioBlob); return; }
    if (entry.audioUrl)   { playAudioUrl(entry.audioUrl);   return; }
  };

  const hasAudio = !!(entry.audioBlob || entry.audioUrl);

  return (
    <div className="flex items-center gap-3 py-2.5">
      {/* Word + gloss */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-900 mr-2">
          {entry.nativeWord}
        </span>
        <span className="text-xs text-gray-400">
          {entry.englishGloss}
        </span>
      </div>

      {/* Status badge */}
      {entry.isVerified ? (
        <span className="text-xxs font-medium px-1.5 py-0.5 rounded bg-green-50 text-green-700 flex-shrink-0">
          verified
        </span>
      ) : (
        <span className="text-xxs font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 flex-shrink-0">
          {entry.isPending ? 'pending' : 'unverified'}
        </span>
      )}

      {/* Play button */}
      {hasAudio && (
        <button
          onClick={handlePlay}
          className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 active:text-gray-600 active:bg-gray-100"
          aria-label={`Play pronunciation of ${entry.nativeWord}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      )}
    </div>
  );
}
