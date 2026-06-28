'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/app';
import { registerContributor } from '@/lib/api';
import { saveContributor } from '@/lib/db/operations';
import type { Contributor } from '@/types';

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

export default function OnboardingPage() {
  const router         = useRouter();
  const setContributor = useAppStore(s => s.setContributor);

  const [name, setName]             = useState('');
  const [state, setState]           = useState('');
  const [town, setTown]             = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const canSubmit = state.trim() !== '' && town.trim() !== '' && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await registerContributor({
        town:  town.trim(),
        state: state.trim(),
      });

      const contributor: Contributor = {
        id:              response.contributorId,
        name:            name.trim() || undefined,
        town:            town.trim(),
        state:           state.trim(),
        l1Status:        'L1',
        dialectInferred: response.dialectInferred,
        language:        response.language,
        createdAt:       new Date().toISOString(),
      };

      await saveContributor(contributor);
      setContributor(contributor);
      router.push('/');
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : 'Registration failed. Please check your connection and try again.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-[#1B3A5C] text-white px-6 pt-10 pb-8">
        <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center mb-5">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Thok</h1>
        <p className="text-sm text-white/60 mt-1.5 leading-relaxed">
          Help preserve African languages — one word at a time.
        </p>
      </header>

      {/* ── Form ────────────────────────────────────────────────────────── */}
      <main className="flex-1 px-5 pt-7 pb-8 space-y-5">

        <p className="text-sm text-gray-500 leading-relaxed">
          Your location helps us route words to the right dialect.
          No account or password needed.
        </p>

        {/* Name (optional) */}
        <div>
          <label htmlFor="name-input" className="block text-xs font-medium text-gray-500 mb-1.5">
            Your name <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="name-input"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Deng, Ayen, Mading…"
            autoCapitalize="words"
            autoCorrect="off"
            autoComplete="given-name"
            spellCheck={false}
            className="
              w-full px-3 py-2.5 text-sm
              border border-gray-200 rounded-lg bg-white text-gray-900
              focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30
              placeholder:text-gray-400
            "
          />
        </div>

        {/* State */}
        <div>
          <label htmlFor="state-select" className="block text-xs font-medium text-gray-500 mb-1.5">
            Your state
          </label>
          <div className="relative">
            <select
              id="state-select"
              value={state}
              onChange={e => setState(e.target.value)}
              className="
                w-full px-3 py-2.5 text-sm appearance-none
                border border-gray-200 rounded-lg bg-white text-gray-900
                focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30
              "
            >
              <option value="">Select a state…</option>
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
        </div>

        {/* Town */}
        <div>
          <label htmlFor="town-input" className="block text-xs font-medium text-gray-500 mb-1.5">
            Your home town
          </label>
          <input
            id="town-input"
            type="text"
            value={town}
            onChange={e => setTown(e.target.value)}
            placeholder="e.g. Bor, Gogrial, Aweil…"
            autoCapitalize="words"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className="
              w-full px-3 py-2.5 text-sm
              border border-gray-200 rounded-lg bg-white text-gray-900
              focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30
              placeholder:text-gray-400
            "
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="
            w-full py-3.5 rounded-xl text-sm font-semibold
            bg-[#1B3A5C] text-white
            active:bg-[#152e4a] transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          {isSubmitting ? 'Setting up…' : 'Start contributing →'}
        </button>

      </main>
    </div>
  );
}
