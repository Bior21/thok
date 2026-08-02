'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/app';
import { fetchDictionary, fetchDictionaryIndex } from '@/lib/api';
import { WordSheet } from '@/components/dictionary/WordSheet';
import type { DictionaryHeadword, LetterIndexEntry } from '@/types';

const PAGE_SIZE = 30;

interface LetterSection {
  letter:      string;
  count:       number;
  headwords:   DictionaryHeadword[];
  offset:      number;
  loadingMore: boolean;
  loaded:      boolean;   // first page has been fetched
}

export default function DictionaryPage() {
  const router          = useRouter();
  const isInitialising  = useAppStore(s => s.isInitialising);
  const contributor     = useAppStore(s => s.contributor);

  const [query, setQuery]           = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  // ── Search mode state ─────────────────────────────────────────────────────
  const [searchResults, setSearchResults] = useState<DictionaryHeadword[]>([]);
  const [searchTotal, setSearchTotal]     = useState(0);
  const [searchOffset, setSearchOffset]   = useState(0);
  const [searching, setSearching]         = useState(false);
  const [searchingMore, setSearchingMore] = useState(false);

  // ── Browse mode state (sticky-lettered sections) ──────────────────────────
  const [sections, setSections]           = useState<LetterSection[]>([]);
  const [revealedCount, setRevealedCount] = useState(1);
  const [indexLoading, setIndexLoading]   = useState(true);

  const [sheetWord, setSheetWord] = useState<string | null>(null);

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

  // ── Letter index — fetched once, drives the browse sections ──────────────
  useEffect(() => {
    if (!contributor) return;
    let cancelled = false;
    (async () => {
      setIndexLoading(true);
      try {
        const index: LetterIndexEntry[] = await fetchDictionaryIndex(contributor.id);
        if (cancelled) return;
        setSections(index.map(({ letter, count }) => ({
          letter, count, headwords: [], offset: 0, loadingMore: false, loaded: false,
        })));
      } catch {
        if (!cancelled) setSections([]);
      } finally {
        if (!cancelled) setIndexLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [contributor]);

  // ── Load a letter section's next page ─────────────────────────────────────
  const loadSection = useCallback(async (letter: string, append: boolean) => {
    if (!contributor) return;
    setSections(prev => prev.map(s => s.letter === letter ? { ...s, loadingMore: true } : s));

    const section = sections.find(s => s.letter === letter);
    const pageOffset = append ? (section?.offset ?? 0) : 0;

    try {
      const res = await fetchDictionary(contributor.id, { limit: PAGE_SIZE, offset: pageOffset, letter });
      setSections(prev => prev.map(s => s.letter === letter ? {
        ...s,
        headwords:   append ? [...s.headwords, ...res.headwords] : res.headwords,
        offset:      pageOffset + res.headwords.length,
        loadingMore: false,
        loaded:      true,
      } : s));
    } catch {
      setSections(prev => prev.map(s => s.letter === letter ? { ...s, loadingMore: false, loaded: true } : s));
    }
  }, [contributor, sections]);

  // Auto-load newly revealed sections
  useEffect(() => {
    const toLoad = sections.slice(0, revealedCount).filter(s => !s.loaded && !s.loadingMore);
    toLoad.forEach(s => loadSection(s.letter, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.length, revealedCount]);

  // ── Search fetch ───────────────────────────────────────────────────────────
  const fetchSearchPage = useCallback(async (search: string, pageOffset: number, append: boolean) => {
    if (!contributor) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    append ? setSearchingMore(true) : setSearching(true);

    try {
      const res = await fetchDictionary(contributor.id, { limit: PAGE_SIZE, offset: pageOffset, search });
      if (ctrl.signal.aborted) return;

      setSearchTotal(res.total);
      setSearchOffset(pageOffset + res.headwords.length);
      setSearchResults(prev => append ? [...prev, ...res.headwords] : res.headwords);
    } catch {
      if (!ctrl.signal.aborted && !append) setSearchResults([]);
    } finally {
      if (!ctrl.signal.aborted) {
        append ? setSearchingMore(false) : setSearching(false);
      }
    }
  }, [contributor]);

  useEffect(() => {
    if (!debouncedQ) { abortRef.current?.abort(); return; }
    setSearchOffset(0);
    setSearchResults([]);
    fetchSearchPage(debouncedQ, 0, false);
  }, [debouncedQ, fetchSearchPage]);

  if (isInitialising) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    );
  }

  if (!contributor) return null;

  const isSearchMode = debouncedQ.length > 0;
  const totalWords = sections.reduce((n, s) => n + s.count, 0);
  const searchHasMore = searchResults.length < searchTotal;
  const canRevealMore = revealedCount < sections.length;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-[#1B3A5C] text-white px-5 pt-6 pb-4 sticky top-0 z-30">
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
            {!indexLoading && totalWords > 0 && (
              <p className="text-xs text-white/55">{totalWords.toLocaleString()} words</p>
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

        {isSearchMode ? (
          <SearchResults
            query={debouncedQ}
            loading={searching}
            loadingMore={searchingMore}
            results={searchResults}
            total={searchTotal}
            hasMore={searchHasMore}
            onLoadMore={() => fetchSearchPage(debouncedQ, searchOffset, true)}
            onTap={setSheetWord}
          />
        ) : (
          <>
            {indexLoading && (
              <div className="flex items-center justify-center py-16">
                <p className="text-sm text-gray-400">Loading…</p>
              </div>
            )}

            {!indexLoading && sections.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-16">No words yet.</p>
            )}

            {sections.slice(0, revealedCount).map(section => (
              <LetterSectionBlock
                key={section.letter}
                section={section}
                onLoadMore={() => loadSection(section.letter, true)}
                onTap={setSheetWord}
              />
            ))}

            {!indexLoading && canRevealMore && (
              <div className="flex justify-center py-5">
                <button
                  onClick={() => setRevealedCount(n => n + 1)}
                  className="px-6 py-2.5 rounded-full text-sm font-medium bg-white border border-gray-200 text-gray-700 active:bg-gray-50 transition-colors"
                >
                  Show more letters ({sections.length - revealedCount} left)
                </button>
              </div>
            )}
          </>
        )}

      </main>

      {/* ── Word detail sheet ────────────────────────────────────────────── */}
      {sheetWord && (
        <WordSheet
          nativeWord={sheetWord}
          contributorId={contributor.id}
          onClose={() => setSheetWord(null)}
        />
      )}

    </div>
  );
}

// ── Search results ───────────────────────────────────────────────────────────

function SearchResults({
  query, loading, loadingMore, results, total, hasMore, onLoadMore, onTap,
}: {
  query: string;
  loading: boolean;
  loadingMore: boolean;
  results: DictionaryHeadword[];
  total: number;
  hasMore: boolean;
  onLoadMore: () => void;
  onTap: (nativeWord: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
        <p className="text-base font-medium text-gray-700 mb-1">No results for &quot;{query}&quot;</p>
        <p className="text-sm text-gray-400">Try a different spelling or English word</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white divide-y divide-gray-50">
        {results.map(h => (
          <HeadwordRow key={h.nativeWord} headword={h} onTap={() => onTap(h.nativeWord)} />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center py-5">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="px-6 py-2.5 rounded-full text-sm font-medium bg-white border border-gray-200 text-gray-700 active:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {loadingMore ? 'Loading…' : `Load more (${(total - results.length).toLocaleString()} remaining)`}
          </button>
        </div>
      )}

      {!hasMore && (
        <p className="text-center text-xs text-gray-400 py-6">
          All {total.toLocaleString()} words shown
        </p>
      )}
    </>
  );
}

// ── Letter section (sticky header) ────────────────────────────────────────────

function LetterSectionBlock({
  section, onLoadMore, onTap,
}: {
  section: LetterSection;
  onLoadMore: () => void;
  onTap: (nativeWord: string) => void;
}) {
  const hasMore = section.loaded && section.headwords.length < section.count;

  return (
    <div>
      <div className="sticky top-[104px] z-20 bg-gray-100 px-5 py-1.5 border-y border-gray-200">
        <span className="text-xs font-bold text-gray-500">{section.letter.toUpperCase()}</span>
        <span className="text-xs text-gray-400 ml-2">{section.count.toLocaleString()}</span>
      </div>

      {!section.loaded && (
        <div className="flex items-center justify-center py-8">
          <p className="text-sm text-gray-400">Loading…</p>
        </div>
      )}

      {section.loaded && (
        <div className="bg-white divide-y divide-gray-50">
          {section.headwords.map(h => (
            <HeadwordRow key={h.nativeWord} headword={h} onTap={() => onTap(h.nativeWord)} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center py-4">
          <button
            onClick={onLoadMore}
            disabled={section.loadingMore}
            className="px-5 py-2 rounded-full text-xs font-medium bg-white border border-gray-200 text-gray-700 active:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {section.loadingMore ? 'Loading…' : `More words starting with ${section.letter.toUpperCase()}`}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Headword row ─────────────────────────────────────────────────────────────

function HeadwordRow({ headword, onTap }: { headword: DictionaryHeadword; onTap: () => void }) {
  const extraSenses = headword.senseCount - headword.glossPreview.split(', ').filter(Boolean).length;

  return (
    <button
      onClick={onTap}
      className="w-full flex items-center gap-3 px-5 py-3.5 active:bg-gray-50 transition-colors text-left"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{headword.nativeWord}</p>
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {headword.glossPreview}
          {extraSenses > 0 && <span className="text-gray-400"> +{extraSenses} more</span>}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {headword.isVerified && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">
            verified
          </span>
        )}
        {!headword.isVerified && headword.isSeed && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
            dictionary source
          </span>
        )}
        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}
