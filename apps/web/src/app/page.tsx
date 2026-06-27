/**
 * app/page.tsx — Home screen
 *
 * Entry point. Shown after onboarding is complete.
 *
 * Displays:
 *   - Status bar (connectivity + storage gauge)
 *   - Single "Start session" button
 *   - Contribution count
 *   - Live dictionary (embedded)
 *
 * Routing:
 *   - isInitialising = true  → loading spinner (prevents redirect race)
 *   - contributor = null     → redirect to /onboarding
 *   - contributor set        → show Home
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/app';
import { StatusBar } from '@/components/layout/StatusBar';
import { Dictionary } from '@/components/dictionary/Dictionary';

export default function HomePage() {
  const router               = useRouter();
  const isInitialising       = useAppStore(s => s.isInitialising);
  const contributor          = useAppStore(s => s.contributor);
  const totalContributions   = useAppStore(s => s.totalContributions);

  // Redirect to onboarding only after initialisation is complete.
  // Without the isInitialising guard, this fires before IndexedDB loads
  // and sends registered users to onboarding every time.
  useEffect(() => {
    if (!isInitialising && !contributor) {
      router.push('/onboarding');
    }
  }, [isInitialising, contributor, router]);

  // Show a minimal loading state while IndexedDB is being read.
  if (isInitialising) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    );
  }

  // Contributor is null and we've kicked off the redirect — show nothing.
  if (!contributor) return null;

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-[#1B3A5C] text-white px-4 pt-4 pb-3">
        <div className="inline-block text-xs bg-white/15 text-blue-100 px-2.5 py-0.5 rounded-full mb-2">
          Dinka · Thuɔŋjäŋ
        </div>
        <h1 className="text-lg font-medium leading-tight">Thok</h1>
        <p className="text-xs text-white/55 mt-0.5">
          {contributor.town}, {contributor.state}
        </p>
      </header>

      {/* ── Status bar ──────────────────────────────────────────────────── */}
      <StatusBar />

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 pb-6 space-y-4">

        {/* Start session button */}
        <button
          onClick={() => router.push('/task')}
          className="
            w-full flex items-center gap-3 px-4 py-3 mt-2
            bg-white border border-gray-100 rounded-xl shadow-sm
            active:bg-gray-50 transition-colors no-select
          "
        >
          <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-5 h-5 text-[#185FA5]"
              fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-gray-900">Start session</div>
            <div className="text-xs text-gray-500">
              {totalContributions < 10
                ? `${totalContributions}/10 words — ${10 - totalContributions} more to unlock reviews`
                : 'Contribute words or review entries'
              }
            </div>
          </div>
          <svg
            className="w-4 h-4 text-gray-400 ml-auto"
            fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Contribution count */}
        <p className="text-center text-xs text-gray-400">
          {totalContributions === 0
            ? 'No entries yet — start your first session!'
            : `${totalContributions} entr${totalContributions === 1 ? 'y' : 'ies'} contributed`
          }
        </p>

        {/* Live dictionary */}
        <Dictionary />

      </main>
    </div>
  );
}
