'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/app';
import { StatusBar } from '@/components/layout/StatusBar';
import { Dictionary } from '@/components/dictionary/Dictionary';
import { updateContributor } from '@/lib/db/operations';
import { fetchLeaderboard } from '@/lib/api';

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

const LANGUAGE_META: Record<string, { nameEnglish: string; nameNative: string }> = {
  dinka: { nameEnglish: 'Dinka', nameNative: 'Thuɔŋjäŋ' },
  nuer:  { nameEnglish: 'Nuer',  nameNative: 'Thok Naath' },
};

// Shorten long state names for the leaderboard
function shortState(state: string) {
  return state
    .replace(' State', '')
    .replace(' Equatoria', ' Eq.')
    .replace('Northern Bahr el Ghazal', 'N. Bahr el Ghazal')
    .replace('Western Bahr el Ghazal', 'W. Bahr el Ghazal');
}

export default function HomePage() {
  const router             = useRouter();
  const isInitialising     = useAppStore(s => s.isInitialising);
  const contributor        = useAppStore(s => s.contributor);
  const setContributor     = useAppStore(s => s.setContributor);
  const totalContributions = useAppStore(s => s.totalContributions);
  const streakCount        = useAppStore(s => s.streakCount);
  const connectivity       = useAppStore(s => s.connectivity);

  const [locationState, setLocationState] = useState('');
  const [locationTown, setLocationTown]   = useState('');
  const [savingLocation, setSavingLocation] = useState(false);

  const [leaderboard, setLeaderboard] = useState<{ state: string; wordCount: number }[]>([]);
  const [myRank, setMyRank]           = useState<number | null>(null);

  useEffect(() => {
    if (!isInitialising && !contributor) {
      router.push('/onboarding');
    }
  }, [isInitialising, contributor, router]);

  // Fetch leaderboard when online
  useEffect(() => {
    if (!contributor || connectivity === 'offline') return;
    fetchLeaderboard(contributor.id)
      .then(data => {
        setLeaderboard(data.leaderboard ?? []);
        setMyRank(data.contributorRank ?? null);
      })
      .catch(() => {});
  }, [contributor, connectivity]);

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
    ? null
    : `${contributor.town}, ${contributor.state}`;

  const langCode = contributor.language ?? 'dinka';
  const langMeta = LANGUAGE_META[langCode] ?? { nameEnglish: langCode, nameNative: '' };
  const langChip = langMeta.nameNative
    ? `${langMeta.nameEnglish} · ${langMeta.nameNative}`
    : langMeta.nameEnglish;

  const greeting = contributor.name
    ? totalContributions === 0
      ? `Welcome, ${contributor.name}`
      : `Welcome back, ${contributor.name}`
    : 'Thok';

  const ctaLabel = totalContributions === 0
    ? 'Start contributing →'
    : 'Continue contributing →';

  const ctaSub = totalContributions === 0
    ? `Help preserve the ${langMeta.nameEnglish} language`
    : `You've preserved ${totalContributions} ${langMeta.nameEnglish} word${totalContributions === 1 ? '' : 's'}`;

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-[#1B3A5C] text-white px-5 pt-6 pb-5">
        <div className="flex items-start justify-between">
          <div className="inline-block text-xs bg-white/15 text-blue-100 px-2.5 py-0.5 rounded-full mb-3">
            {langChip}
          </div>
          <button
            onClick={() => router.push('/profile')}
            className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center active:bg-white/25 transition-colors"
            aria-label="Profile"
          >
            {contributor.name ? (
              <span className="text-sm font-semibold text-white">
                {contributor.name[0].toUpperCase()}
              </span>
            ) : (
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            )}
          </button>
        </div>

        <h1 className="text-xl font-semibold leading-tight">{greeting}</h1>

        <div className="flex items-center justify-between mt-1">
          {headerLocation && (
            <p className="text-xs text-white/55">{headerLocation}</p>
          )}
          {streakCount >= 2 && (
            <span className="text-xs bg-orange-500/90 text-white px-2 py-0.5 rounded-full font-semibold ml-auto">
              🔥 {streakCount} day streak
            </span>
          )}
        </div>
      </header>

      {/* ── Status bar — only when relevant ─────────────────────────────── */}
      <StatusBar />

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 pb-6 space-y-4 pt-3">

        {/* Location prompt */}
        {showLocationPrompt && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-[#0C447C]">Help us match your dialect</p>
              <p className="text-xs text-[#185FA5] mt-0.5">
                Your location helps route your words to speakers of the same dialect.
              </p>
            </div>
            <div className="space-y-2">
              <div className="relative">
                <select
                  value={locationState}
                  onChange={e => setLocationState(e.target.value)}
                  className="w-full px-3 py-2 text-sm appearance-none border border-blue-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30"
                >
                  <option value="">Select your state…</option>
                  {SOUTH_SUDAN_STATES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <input
                type="text"
                value={locationTown}
                onChange={e => setLocationTown(e.target.value)}
                placeholder="Your home town…"
                autoCapitalize="words"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30 placeholder:text-gray-400"
                onKeyDown={e => e.key === 'Enter' && handleSaveLocation()}
              />
            </div>
            <button
              onClick={handleSaveLocation}
              disabled={!canSaveLocation}
              className="w-full py-2.5 rounded-lg text-sm font-semibold bg-[#1B3A5C] text-white active:bg-[#152e4a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {savingLocation ? 'Saving…' : 'Save location'}
            </button>
          </div>
        )}

        {/* ── Hero CTA ────────────────────────────────────────────────── */}
        <button
          onClick={() => router.push('/task')}
          className="
            w-full flex items-center gap-4 px-5 py-4
            bg-[#1B3A5C] rounded-2xl shadow-md
            active:bg-[#152e4a] transition-colors no-select
          "
        >
          <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div className="text-left flex-1">
            <div className="text-base font-semibold text-white">{ctaLabel}</div>
            <div className="text-xs text-white/65 mt-0.5">{ctaSub}</div>
          </div>
          <svg className="w-5 h-5 text-white/50 flex-shrink-0" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* ── Regional leaderboard ─────────────────────────────────────── */}
        {leaderboard.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-700">
                {langMeta.nameEnglish} — State rankings
              </p>
              {myRank && (
                <span className="text-xs text-[#185FA5] font-medium">
                  Your state: #{myRank}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {leaderboard.map((row, i) => {
                const isMe = row.state === contributor.state;
                const maxCount = leaderboard[0]?.wordCount ?? 1;
                const pct = Math.round((row.wordCount / maxCount) * 100);
                return (
                  <div key={row.state} className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400 w-4 text-right">{i + 1}</span>
                        <span className={`text-xs font-medium ${isMe ? 'text-[#1B3A5C]' : 'text-gray-700'}`}>
                          {shortState(row.state)}
                          {isMe && <span className="ml-1 text-[10px] text-[#185FA5]">· you</span>}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">{row.wordCount.toLocaleString()} words</span>
                    </div>
                    <div className="ml-5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isMe ? 'bg-[#1B3A5C]' : 'bg-gray-300'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Your words dictionary ────────────────────────────────────── */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm px-4 py-4">
          <Dictionary />
        </div>

        {/* ── Add your language ────────────────────────────────────────── */}
        <button
          onClick={() => router.push('/request-language')}
          className="
            w-full flex items-center gap-3 px-4 py-3
            bg-white border border-gray-100 rounded-xl shadow-sm
            active:bg-gray-50 transition-colors no-select
          "
        >
          <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-gray-900">Add your language</div>
            <div className="text-xs text-gray-500">Request to bring your language to Thok</div>
          </div>
          <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

      </main>
    </div>
  );
}
