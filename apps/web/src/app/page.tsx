'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/app';
import { StatusBar } from '@/components/layout/StatusBar';
import { Dictionary } from '@/components/dictionary/Dictionary';
import { updateContributor } from '@/lib/db/operations';

const SOUTH_SUDAN_STATES = [
  'Central Equatoria State',
  'Eastern Equatoria State',
  'Jonglei State',
  'Lakes State',
  'Northern Bahr el Ghazal',
  'Unity State',
  'Upper Nile State',
  'Warrap State',
  'Western Bahr el Ghazal State',
  'Western Equatoria State',
  'Abyei Area',
  'Other / Outside South Sudan',
] as const;

export default function HomePage() {
  const router             = useRouter();
  const isInitialising     = useAppStore(s => s.isInitialising);
  const contributor        = useAppStore(s => s.contributor);
  const setContributor     = useAppStore(s => s.setContributor);
  const totalContributions = useAppStore(s => s.totalContributions);

  const [locationState, setLocationState] = useState('');
  const [locationTown, setLocationTown]   = useState('');
  const [savingLocation, setSavingLocation] = useState(false);

  useEffect(() => {
    if (!isInitialising && !contributor) {
      router.push('/onboarding');
    }
  }, [isInitialising, contributor, router]);

  if (isInitialising) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    );
  }

  if (!contributor) return null;

  const showLocationPrompt =
    contributor.locationDeferred && totalContributions >= 3;

  const canSaveLocation = locationState.trim() !== '' && locationTown.trim() !== '' && !savingLocation;

  const handleSaveLocation = async () => {
    if (!canSaveLocation) return;
    setSavingLocation(true);
    try {
      const patch = {
        town:             locationTown.trim(),
        state:            locationState.trim(),
        locationDeferred: false,
      };
      await updateContributor(patch);
      setContributor({ ...contributor, ...patch });
    } finally {
      setSavingLocation(false);
    }
  };

  const headerLocation = contributor.locationDeferred
    ? 'Location not set'
    : `${contributor.town}, ${contributor.state}`;

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-[#1B3A5C] text-white px-5 pt-6 pb-5">
        <div className="inline-block text-xs bg-white/15 text-blue-100 px-2.5 py-0.5 rounded-full mb-3">
          Dinka · Thuɔŋjäŋ
        </div>
        <h1 className="text-xl font-semibold leading-tight">
          {contributor.name ? `Welcome back, ${contributor.name}` : 'Thok'}
        </h1>
        <p className="text-xs text-white/55 mt-1">{headerLocation}</p>
        <p className="text-xs text-white/40 mt-0.5">
          Helping digitalize indigenous African languages
        </p>
      </header>

      {/* ── Status bar ──────────────────────────────────────────────────── */}
      <StatusBar />

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 pb-6 space-y-4">

        {/* Location prompt — shown after 3 contributions if location was skipped */}
        {showLocationPrompt && (
          <div className="mt-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-[#0C447C]">Help us match your dialect</p>
              <p className="text-xs text-[#185FA5] mt-0.5">
                Your location helps route your words to speakers of the same dialect.
              </p>
            </div>

            <div className="space-y-2">
              {/* State */}
              <div className="relative">
                <select
                  value={locationState}
                  onChange={e => setLocationState(e.target.value)}
                  className="
                    w-full px-3 py-2 text-sm appearance-none
                    border border-blue-200 rounded-lg bg-white text-gray-900
                    focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30
                  "
                >
                  <option value="">Select your state…</option>
                  {SOUTH_SUDAN_STATES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {/* Town */}
              <input
                type="text"
                value={locationTown}
                onChange={e => setLocationTown(e.target.value)}
                placeholder="Your home town…"
                autoCapitalize="words"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                className="
                  w-full px-3 py-2 text-sm
                  border border-blue-200 rounded-lg bg-white text-gray-900
                  focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30
                  placeholder:text-gray-400
                "
                onKeyDown={e => e.key === 'Enter' && handleSaveLocation()}
              />
            </div>

            <button
              onClick={handleSaveLocation}
              disabled={!canSaveLocation}
              className="
                w-full py-2.5 rounded-lg text-sm font-semibold
                bg-[#1B3A5C] text-white
                active:bg-[#152e4a] transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed
              "
            >
              {savingLocation ? 'Saving…' : 'Save location'}
            </button>
          </div>
        )}

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
              {totalContributions === 0
                ? 'Start adding words and reviewing entries'
                : `${totalContributions} contribution${totalContributions === 1 ? '' : 's'} — keep going`
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
