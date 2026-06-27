/**
 * app/onboarding/page.tsx
 *
 * Onboarding screen — shown only on first open.
 *
 * Collects two fields:
 *   - State (dropdown — reduces typos in state names)
 *   - Home town (free text)
 *
 * These two fields drive dialect affinity routing on the backend.
 * No account, no password, no email.
 *
 * On submit:
 *   1. Call POST /register-contributor
 *   2. Save the returned contributor to IndexedDB
 *   3. Update global store
 *   4. Navigate to Home
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/app';
import { registerContributor } from '@/lib/api';
import { saveContributor } from '@/lib/db/operations';
import type { Contributor } from '@/types';

// ── State list ─────────────────────────────────────────────────────────────────
// Pre-populated to prevent spelling variations that break dialect inference.

// Names match region_dialect_map.state values where seeded (e.g. "Jonglei State")
// so affinity tier-2 routing compares states consistently.
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

// ── Component ──────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router        = useRouter();
  const setContributor = useAppStore(s => s.setContributor);

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
        town:            town.trim(),
        state:           state.trim(),
        l1Status:        'L1',
        dialectInferred: response.dialectInferred,
        language:        response.language,
        createdAt:       new Date().toISOString(),
      };

      // Persist to IndexedDB — this is what the app loads on every future open.
      await saveContributor(contributor);

      // Update global state so layout.tsx doesn't redirect back.
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
    <div className="min-h-screen flex flex-col">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-[#1B3A5C] text-white px-4 pt-6 pb-5">
        <div className="inline-block text-xs bg-white/15 text-blue-100 px-2.5 py-0.5 rounded-full mb-3">
          Dinka · Thuɔŋjäŋ
        </div>
        <h1 className="text-xl font-medium">Welcome to Thok</h1>
        <p className="text-xs text-white/55 mt-1">
          Tell us where you&apos;re from
        </p>
      </header>

      {/* ── Form ────────────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 pt-6 pb-8 space-y-5">

        <p className="text-sm text-gray-600 leading-relaxed">
          Your location helps us route your words to the right Dinka dialect.
          No account or personal details needed.
        </p>

        {/* State */}
        <div>
          <label
            htmlFor="state-select"
            className="block text-xs font-medium text-gray-500 mb-1.5"
          >
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
          <label
            htmlFor="town-input"
            className="block text-xs font-medium text-gray-500 mb-1.5"
          >
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

        {/* Error */}
        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="
            w-full py-3 rounded-xl text-sm font-medium
            bg-[#1B3A5C] text-white
            active:bg-[#152e4a] transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          {isSubmitting ? 'Setting up…' : 'Start contributing'}
        </button>

      </main>
    </div>
  );
}
