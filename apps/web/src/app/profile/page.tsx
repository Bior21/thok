'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/app';
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

const AGE_RANGES = ['Under 18', '18–24', '25–34', '35–44', '45–54', '55+'] as const;

const LANGUAGE_META: Record<string, { nameEnglish: string; nameNative: string }> = {
  dinka: { nameEnglish: 'Dinka', nameNative: 'Thuɔŋjäŋ' },
  nuer:  { nameEnglish: 'Nuer',  nameNative: 'Thok Naath' },
};

export default function ProfilePage() {
  const router             = useRouter();
  const contributor        = useAppStore(s => s.contributor);
  const setContributor     = useAppStore(s => s.setContributor);
  const totalContributions = useAppStore(s => s.totalContributions);
  const streakCount        = useAppStore(s => s.streakCount);

  const [name, setName]           = useState(contributor?.name ?? '');
  const [town, setTown]           = useState(
    contributor?.locationDeferred ? '' : (contributor?.town ?? '')
  );
  const [state, setState]         = useState(
    contributor?.locationDeferred ? '' : (contributor?.state ?? '')
  );
  const [l1Status, setL1Status]   = useState<'L1' | 'L2'>(contributor?.l1Status ?? 'L1');
  const [ageRange, setAgeRange]   = useState(contributor?.ageRange ?? '');
  const [gender, setGender]       = useState(contributor?.gender ?? '');
  const [isSaving, setIsSaving]   = useState(false);
  const [saved, setSaved]         = useState(false);

  if (!contributor) {
    router.push('/onboarding');
    return null;
  }

  const langCode = contributor.language ?? 'dinka';
  const langMeta = LANGUAGE_META[langCode] ?? { nameEnglish: langCode, nameNative: '' };

  const memberSince = new Date(contributor.createdAt).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  });

  const hasLocation = state.trim() !== '' && town.trim() !== '';

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaved(false);

    try {
      const patch = {
        name:             name.trim() || undefined,
        town:             hasLocation ? town.trim()  : contributor.town,
        state:            hasLocation ? state.trim() : contributor.state,
        locationDeferred: hasLocation ? false : contributor.locationDeferred,
        l1Status,
        ageRange:         ageRange || undefined,
        gender:           gender   || undefined,
      };
      await updateContributor(patch);
      setContributor({ ...contributor, ...patch });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-[#1B3A5C] text-white px-5 pt-6 pb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-xs text-white/60 mb-5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* Avatar */}
        <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mb-3">
          <span className="text-2xl font-semibold text-white">
            {name.trim() ? name.trim()[0].toUpperCase() : '?'}
          </span>
        </div>

        <h1 className="text-xl font-semibold">
          {name.trim() || 'Your profile'}
        </h1>
        <p className="text-xs text-white/55 mt-0.5">Member since {memberSince}</p>
      </header>

      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        <div className="flex flex-col items-center py-4 gap-0.5">
          <span className="text-lg font-bold text-gray-900">{totalContributions}</span>
          <span className="text-xs text-gray-500">Words</span>
        </div>
        <div className="flex flex-col items-center py-4 gap-0.5">
          <span className="text-lg font-bold text-gray-900">
            {streakCount >= 1 ? `🔥 ${streakCount}` : '—'}
          </span>
          <span className="text-xs text-gray-500">Day streak</span>
        </div>
        <div className="flex flex-col items-center py-4 gap-0.5">
          <span className="text-lg font-bold text-gray-900">
            {langMeta.nameEnglish}
          </span>
          <span className="text-xs text-gray-500">{langMeta.nameNative}</span>
        </div>
      </div>

      {/* ── Editable fields ─────────────────────────────────────────────── */}
      <main className="flex-1 px-5 pt-6 pb-8 space-y-5">

        {/* Name */}
        <div>
          <label htmlFor="profile-name" className="block text-xs font-medium text-gray-500 mb-1.5">
            Name <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="profile-name"
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

        {/* Location */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-500">Location</p>

          <div className="relative">
            <select
              value={state}
              onChange={e => setState(e.target.value)}
              className="
                w-full px-3 py-2.5 text-sm appearance-none
                border border-gray-200 rounded-lg bg-white text-gray-900
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

          <input
            type="text"
            value={town}
            onChange={e => setTown(e.target.value)}
            placeholder="Your home town…"
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
          />
        </div>

        {/* Speaker status */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Speaker status</p>
          <div className="grid grid-cols-2 gap-3">
            {(['L1', 'L2'] as const).map(status => (
              <button
                key={status}
                type="button"
                onClick={() => setL1Status(status)}
                className={`
                  py-3 rounded-xl border-2 text-sm font-medium transition-colors
                  ${l1Status === status
                    ? 'border-[#1B3A5C] bg-[#1B3A5C]/5 text-[#1B3A5C]'
                    : 'border-gray-200 text-gray-600 active:bg-gray-50'
                  }
                `}
              >
                {status === 'L1' ? 'Native speaker' : 'Learned it later'}
              </button>
            ))}
          </div>
        </div>

        {/* Age range */}
        <div>
          <label htmlFor="age-range" className="block text-xs font-medium text-gray-500 mb-1.5">
            Age range <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <div className="relative">
            <select
              id="age-range"
              value={ageRange}
              onChange={e => setAgeRange(e.target.value)}
              className="
                w-full px-3 py-2.5 text-sm appearance-none
                border border-gray-200 rounded-lg bg-white text-gray-900
                focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30
              "
            >
              <option value="">Prefer not to say</option>
              {AGE_RANGES.map(r => (
                <option key={r} value={r}>{r}</option>
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

        {/* Gender */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">
            Gender <span className="text-gray-400 font-normal">(optional)</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'M',              label: 'Male' },
              { value: 'F',              label: 'Female' },
              { value: 'NB',             label: 'Non-binary' },
              { value: 'prefer_not_to_say', label: 'Prefer not to say' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGender(g => g === opt.value ? '' : opt.value)}
                className={`
                  py-2.5 px-3 rounded-xl border-2 text-xs font-medium transition-colors
                  ${gender === opt.value
                    ? 'border-[#1B3A5C] bg-[#1B3A5C]/5 text-[#1B3A5C]'
                    : 'border-gray-200 text-gray-600 active:bg-gray-50'
                  }
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="
            w-full py-3.5 rounded-xl text-sm font-semibold
            bg-[#1B3A5C] text-white
            active:bg-[#152e4a] transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          {isSaving ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
        </button>

        {/* Language — display only */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-500 mb-1">Contributing language</p>
          <p className="text-sm text-gray-900">
            {langMeta.nameEnglish}
            {langMeta.nameNative && (
              <span className="text-gray-400 ml-1.5">· {langMeta.nameNative}</span>
            )}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            To switch languages, contact us or start a new profile.
          </p>
        </div>

      </main>
    </div>
  );
}
