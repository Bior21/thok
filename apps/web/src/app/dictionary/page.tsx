'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/app';
import { fetchDictionary } from '@/lib/api';
import { WordSheet } from '@/components/dictionary/WordSheet';
import type { DictionaryEntry } from '@/types';

const PAGE_SIZE = 40;

interface SheetState {
  conceptId:    string;
  nativeWord:   string;
  englishGloss: string;
}

export default function DictionaryPage() {
  const router          = useRouter();
  const isInitialising  = useAppStore(s => s.isInitialising);
  const contributor     = useAppStore(s => s.contributor);

  const [query, setQuery]       = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [entries, setEntries]   = useState<DictionaryEntry[]>([]);
  const [total, setTotal]       = useState(0);
  const [offset, setOffset]     = useState(0);
  const [loading, setLoading]   = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sheet, setSheet]       = useState<SheetState | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Redirect to onboarding if not registered
  useEffect(() => {
    if (!isInitialising && !contributor) router.push('/onboarding');
  }, [isInitialising, contributor, router]);

  // Debounce search query 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch first page when search changes
  const fetchPage = useCallback(async (search: string, pageOffset: number, append: boolean) => {
    if (!contributor) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    append ? setLoadingMore(true) : setLoading(true);

    try {
      const res = await fetchDictionary(contributor.id, {
        limit:  PAGE_SIZE,
        offset: pageOffset,
        search: search || undefined,
      });

      if (ctrl.signal.aborted) return;

      setTotal(res.total);
      setOffset(pageOffset + res.entries.length);
      setEntries(prev => append ? [...prev, ...res.entries] : res.entries);
    } catch {
      if (!ctrl.signal.aborted) {
        if (!append) setEntries([]);
      }
    } finally {
      if (!ctrl.signal.aborted) {
        append ? setLoadingMore(false) : setLoading(false);
      }
    }
  }, [contributor]);

  useEffect(() => {
    setOffset(0);
    setEntries([]);
    fetchPage(debouncedQ, 0, false);
  }, [debouncedQ, fetchPage]);

  const handleLoadMore = () => fetchPage(debouncedQ, offset, true);

  if (isInitialising) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    );
  }

  if (!contributor) return null;

  const hasMore = entries.length < total;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-[#1B3A5C] text-white px-5 pt-6 pb-4 sticky top-0 z-20">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center active:bg-white/25 transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Dictionary</h1>
            {total > 0 && !loading && (
              <p className="text-xs text-white/55">{total.toLocaleString()} words</p>
            )}
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search Dinka or English…"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className="
              w-full pl-9 pr-4 py-2.5 rounded-xl text-sm
              bg-white/15 text-white placeholder:text-white/45
              focus:outline-none focus:bg-white/20
              transition-colors
            "
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 active:text-white/80"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <main className="flex-1">

        {loading && (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-gray-400">Loading…</p>
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            {debouncedQ ? (
              <>
                <p className="text-base font-medium text-gray-700 mb-1">No results for &quot;{debouncedQ}&quot;</p>
                <p className="text-sm text-gray-400">Try a different spelling or English word</p>
              </>
            ) : (
              <p className="text-sm text-gray-400">No words yet.</p>
            )}
          </div>
        )}

        {!loading && entries.length > 0 && (
          <div className="bg-white divide-y divide-gray-50">
            {entries.map(entry => (
              <WordRow
                key={entry.entryId}
                entry={entry}
                onTap={() => setSheet({
                  conceptId:    entry.conceptId,
                  nativeWord:   entry.nativeWord,
                  englishGloss: entry.englishGloss,
                })}
              />
            ))}
          </div>
        )}

        {/* Load more */}
        {!loading && hasMore && (
          <div className="flex justify-center py-5">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-6 py-2.5 rounded-full text-sm font-medium bg-white border border-gray-200 text-gray-700 active:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {loadingMore ? 'Loading…' : `Load more (${(total - entries.length).toLocaleString()} remaining)`}
            </button>
          </div>
        )}

        {!loading && entries.length > 0 && !hasMore && (
          <p className="text-center text-xs text-gray-400 py-6">
            All {total.toLocaleString()} words shown
          </p>
        )}

      </main>

      {/* ── Word detail sheet ────────────────────────────────────────────── */}
      {sheet && (
        <WordSheet
          conceptId={sheet.conceptId}
          nativeWord={sheet.nativeWord}
          englishGloss={sheet.englishGloss}
          contributorId={contributor.id}
          onClose={() => setSheet(null)}
        />
      )}

    </div>
  );
}

// ── Word row ─────────────────────────────────────────────────────────────────

function WordRow({ entry, onTap }: { entry: DictionaryEntry; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      className="w-full flex items-center gap-3 px-5 py-3.5 active:bg-gray-50 transition-colors text-left"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{entry.nativeWord}</p>
        <p className="text-xs text-gray-500 truncate mt-0.5">{entry.englishGloss}</p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {entry.conceptType === 'sentence' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">
            sentence
          </span>
        )}
        {entry.isVerified && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">
            verified
          </span>
        )}
        {entry.audioUrl && (
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M15.536 8.464a5 5 0 010 7.072M12 6a7 7 0 00-7 7 7 7 0 007 7M9.879 16.121A3 3 0 1013.5 12H9m0 4.121V12" />
          </svg>
        )}
        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}
