'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestLanguage } from '@/lib/api';

export default function RequestLanguagePage() {
  const router = useRouter();

  const [languageName, setLanguageName] = useState('');
  const [region, setRegion]             = useState('');
  const [estSpeakers, setEstSpeakers]   = useState('');
  const [contactName, setContactName]   = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [message, setMessage]           = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted]       = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const canSubmit =
    languageName.trim() !== '' &&
    region.trim() !== '' &&
    contactName.trim() !== '' &&
    contactEmail.trim() !== '' &&
    !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await requestLanguage({
        languageName:  languageName.trim(),
        region:        region.trim(),
        estSpeakers:   estSpeakers.trim() || undefined,
        contactName:   contactName.trim(),
        contactEmail:  contactEmail.trim(),
        message:       message.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof Error
        ? err.message
        : 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <header className="bg-[#1B3A5C] text-white px-6 pt-10 pb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Request submitted</h1>
          <p className="text-sm text-white/60 mt-1.5 leading-relaxed">
            Thank you for helping grow Thok.
          </p>
        </header>

        <main className="flex-1 px-5 pt-10 pb-8 flex flex-col items-center text-center gap-5">
          <div className="text-5xl">🌍</div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">We received your request!</h2>
            <p className="text-sm text-gray-500 leading-relaxed max-w-xs">
              We will review it and reach out to you at <strong>{contactEmail}</strong> to
              discuss next steps for adding <strong>{languageName}</strong> to Thok.
            </p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="
              mt-4 w-full py-3.5 rounded-xl text-sm font-semibold
              bg-[#1B3A5C] text-white active:bg-[#152e4a] transition-colors
            "
          >
            Back to home
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-[#1B3A5C] text-white px-6 pt-10 pb-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-xs text-white/60 mb-5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center mb-5">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Add your language</h1>
        <p className="text-sm text-white/60 mt-1.5 leading-relaxed">
          Every language deserves to be preserved. Tell us about yours and we will work with your community to bring it to Thok.
        </p>
      </header>

      {/* ── Form ────────────────────────────────────────────────────────── */}
      <main className="flex-1 px-5 pt-7 pb-8 space-y-5">

        {/* Language name */}
        <div>
          <label htmlFor="lang-name" className="block text-xs font-medium text-gray-500 mb-1.5">
            Language name <span className="text-red-400">*</span>
          </label>
          <input
            id="lang-name"
            type="text"
            value={languageName}
            onChange={e => setLanguageName(e.target.value)}
            placeholder="e.g. Shilluk, Bari, Zande…"
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

        {/* Region */}
        <div>
          <label htmlFor="region" className="block text-xs font-medium text-gray-500 mb-1.5">
            Region where it is spoken <span className="text-red-400">*</span>
          </label>
          <input
            id="region"
            type="text"
            value={region}
            onChange={e => setRegion(e.target.value)}
            placeholder="e.g. Upper Nile State, South Sudan"
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

        {/* Estimated speakers */}
        <div>
          <label htmlFor="est-speakers" className="block text-xs font-medium text-gray-500 mb-1.5">
            Estimated number of speakers <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="est-speakers"
            type="text"
            value={estSpeakers}
            onChange={e => setEstSpeakers(e.target.value)}
            placeholder="e.g. 500,000"
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

        <div className="border-t border-gray-100 pt-1">
          <p className="text-xs font-medium text-gray-500 mb-4">Your contact details</p>

          {/* Contact name */}
          <div className="space-y-4">
            <div>
              <label htmlFor="contact-name" className="block text-xs font-medium text-gray-500 mb-1.5">
                Your name <span className="text-red-400">*</span>
              </label>
              <input
                id="contact-name"
                type="text"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="e.g. Deng Majok"
                autoCapitalize="words"
                autoCorrect="off"
                autoComplete="name"
                spellCheck={false}
                className="
                  w-full px-3 py-2.5 text-sm
                  border border-gray-200 rounded-lg bg-white text-gray-900
                  focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30
                  placeholder:text-gray-400
                "
              />
            </div>

            {/* Contact email */}
            <div>
              <label htmlFor="contact-email" className="block text-xs font-medium text-gray-500 mb-1.5">
                Email address <span className="text-red-400">*</span>
              </label>
              <input
                id="contact-email"
                type="email"
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="email"
                spellCheck={false}
                inputMode="email"
                className="
                  w-full px-3 py-2.5 text-sm
                  border border-gray-200 rounded-lg bg-white text-gray-900
                  focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30
                  placeholder:text-gray-400
                "
              />
            </div>
          </div>
        </div>

        {/* Message */}
        <div>
          <label htmlFor="message" className="block text-xs font-medium text-gray-500 mb-1.5">
            Anything else we should know? <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="message"
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={3}
            placeholder="e.g. I am a native speaker and can help build an initial word list…"
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck
            className="
              w-full px-3 py-2.5 text-sm
              border border-gray-200 rounded-lg bg-white text-gray-900
              focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30
              placeholder:text-gray-400 resize-none
            "
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
          {isSubmitting ? 'Sending…' : 'Submit request →'}
        </button>

        <p className="text-center text-xs text-gray-400 leading-relaxed">
          We will review your request and reach out within a few days.
        </p>

      </main>
    </div>
  );
}
