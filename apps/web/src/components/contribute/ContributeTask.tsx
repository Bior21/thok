/**
 * components/contribute/ContributeTask.tsx
 *
 * Renders a contribution task: prompt → word input → audio recording → submit.
 *
 * Handles three prompt types:
 *   image   — shows an image (primary method)
 *   word    — shows an English word (secondary method)
 *   context — shows a descriptive question (enrichment method)
 *
 * Submit flow:
 *   1. User sees prompt
 *   2. User types the Dinka word
 *   3. User records audio (encouraged but optional)
 *   4. User taps Submit → entry goes to IndexedDB immediately
 *   5. Next task appears — no loading state, no confirmation screen
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import { useRecorder } from '@/hooks/useRecorder';
import { selectIsStorageBlocked } from '@/store/app';
import { useAppStore } from '@/store/app';
import { DinkaKeyboard } from '@/components/contribute/DinkaKeyboard';
import type { ContributeTask as ContributeTaskType, Contributor, SpeakerMetadata } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  task: ContributeTaskType;
  isSubmitting: boolean;
  onSubmit: (params: {
    nativeWord: string;
    audioBlob?: Blob;
    audioDurationSec?: number;
    speakerMetadata: SpeakerMetadata;
  }) => Promise<void>;
  onSkip: () => Promise<void>;
  contributor: Contributor;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ContributeTask({ task, isSubmitting, onSubmit, onSkip, contributor }: Props) {
  const [nativeWord, setNativeWord] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStorageBlocked = useAppStore(selectIsStorageBlocked);

  const isSentence = task.prompt.conceptType === 'sentence';

  // The Dinka on-screen keyboard appears when the word field is focused.
  const [showKeyboard, setShowKeyboard] = useState(false);

  const {
    isRecording,
    recording,
    error: recordingError,
    isSupported: recordingSupported,
    start,
    stop,
    cancel,
    play,
    clear,
  } = useRecorder();

  const canSubmit =
    nativeWord.trim().length > 0 &&
    !isSubmitting &&
    !isRecording &&
    !isStorageBlocked;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    const speakerMetadata: SpeakerMetadata = {
      ageRange:  contributor.ageRange,
      gender:    contributor.gender,
      l1Status:  contributor.l1Status,
    };

    await onSubmit({
      nativeWord:      nativeWord.trim(),
      audioBlob:       recording?.blob,
      audioDurationSec: recording?.durationSec,
      speakerMetadata,
    });

    // Reset for the next task.
    setNativeWord('');
    clear();
    setTimeout(() => {
      (isSentence ? textareaRef.current : inputRef.current)?.focus();
    }, 100);
  }, [canSubmit, nativeWord, recording, contributor, onSubmit, clear]);

  const { prompt } = task;

  return (
    <div className="mt-3 space-y-3 animate-fadein">

      {/* ── Prompt card ───────────────────────────────────────────────── */}
      <div className="bg-blue-50 rounded-xl p-4 text-center">

        {/* Image prompt */}
        {prompt.promptType === 'image' && prompt.imageUrl && (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={prompt.imageUrl}
              alt={prompt.englishGloss}
              className="w-24 h-24 object-cover rounded-xl mx-auto bg-blue-100"
            />
            <p className="text-sm font-medium text-[#0C447C]">
              {prompt.englishGloss}
            </p>
            <p className="text-xs text-[#185FA5]">
              What is the Dinka word for this?
            </p>
          </div>
        )}

        {/* Word prompt (or image fallback when no URL available) */}
        {(prompt.promptType === 'word' ||
          (prompt.promptType === 'image' && !prompt.imageUrl)) && (
          <div className="py-4 space-y-1">
            <p className="text-3xl font-medium text-[#0C447C]">
              {prompt.englishGloss}
            </p>
            <p className="text-xs text-[#185FA5]">
              What is the Dinka word for this?
            </p>
          </div>
        )}

        {/* Context prompt */}
        {prompt.promptType === 'context' && prompt.contextText && (
          <div className="py-2 space-y-2">
            <p className="text-sm text-[#0C447C] leading-relaxed">
              {prompt.contextText}
            </p>
            <p className="text-xs text-[#185FA5] font-medium">
              &ldquo;{prompt.englishGloss}&rdquo;
            </p>
          </div>
        )}

        {/* Sentence prompt */}
        {prompt.promptType === 'sentence' && (
          <div className="py-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#185FA5]">
              Translate this sentence
            </p>
            <p className="text-lg font-medium text-[#0C447C] leading-snug">
              &ldquo;{prompt.englishGloss}&rdquo;
            </p>
            {prompt.contextText && (
              <p className="text-xs text-[#185FA5] italic">
                {prompt.contextText}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Storage blocked warning */}
      {isStorageBlocked && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          Storage is full. Connect to the internet to sync your entries before continuing.
        </div>
      )}

      {/* ── Text input: single line for words, multiline for sentences ── */}
      {isSentence ? (
        <textarea
          ref={textareaRef}
          value={nativeWord}
          onChange={e => setNativeWord(e.target.value)}
          placeholder="Type the Dinka sentence…"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          rows={3}
          // inputMode="none" keeps the Dinka keyboard as the sole input method,
          // same as the word input — avoids native keyboard fighting it on mobile.
          inputMode="none"
          disabled={isStorageBlocked}
          onFocus={() => setShowKeyboard(true)}
          className="
            w-full px-3 py-2.5 text-sm resize-none
            border border-gray-200 rounded-lg bg-white text-gray-900
            focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30
            placeholder:text-gray-400
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        />
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={nativeWord}
          onChange={e => setNativeWord(e.target.value)}
          placeholder="Type the Dinka word…"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          // Suppress the device's native keyboard so the Dinka keyboard is the
          // only one on touch devices. Desktop physical typing still works.
          inputMode="none"
          disabled={isStorageBlocked}
          onFocus={() => setShowKeyboard(true)}
          className="
            w-full px-3 py-2.5 text-sm
            border border-gray-200 rounded-lg bg-white text-gray-900
            focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30
            placeholder:text-gray-400
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        />
      )}

      {/* ── Dinka on-screen keyboard ──────────────────────────────────── */}
      {!isStorageBlocked && showKeyboard && (
        <DinkaKeyboard
          value={nativeWord}
          onChange={setNativeWord}
          onDone={() => {
            setShowKeyboard(false);
            (isSentence ? textareaRef.current : inputRef.current)?.blur();
          }}
        />
      )}

      {/* ── Audio recorder ────────────────────────────────────────────── */}
      {recordingSupported && !isStorageBlocked && (
        <div className="space-y-1.5">
          {/* Idle — no recording yet */}
          {!isRecording && !recording && (
            <button
              onClick={start}
              className="
                w-full flex items-center justify-center gap-2 py-2.5
                border border-green-500 text-green-700 text-sm font-medium
                rounded-lg active:bg-green-50 transition-colors
              "
            >
              <MicIcon />
              {isSentence ? 'Record reading' : 'Record pronunciation'}
            </button>
          )}

          {/* Recording in progress */}
          {isRecording && (
            <button
              onClick={stop}
              className="
                w-full flex items-center justify-center gap-2 py-2.5
                border border-red-500 text-red-700 text-sm font-medium
                rounded-lg active:bg-red-50 transition-colors
              "
            >
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-record-pulse" />
              Recording — tap to stop
            </button>
          )}

          {/* Recording complete */}
          {recording && !isRecording && (
            <div className="flex gap-2">
              <button
                onClick={play}
                className="
                  flex items-center gap-1.5 px-3 py-2.5
                  border border-gray-200 text-gray-600 text-sm
                  rounded-lg active:bg-gray-50 flex-shrink-0
                "
              >
                <PlayIcon />
                {Math.round(recording.durationSec)}s
              </button>
              <button
                onClick={cancel}
                className="
                  flex-1 py-2.5 text-sm text-gray-500
                  border border-gray-200 rounded-lg active:bg-gray-50
                "
              >
                Re-record
              </button>
            </div>
          )}

          {/* Recording error */}
          {recordingError && (
            <p className="text-xs text-red-600">{recordingError}</p>
          )}
        </div>
      )}

      {/* ── Submit ────────────────────────────────────────────────────── */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="
          w-full py-3 rounded-xl text-sm font-medium
          bg-[#185FA5] text-white
          active:bg-[#0C447C] transition-colors
          disabled:opacity-40 disabled:cursor-not-allowed
        "
      >
        {isSubmitting ? 'Saving…' : 'Submit → next'}
      </button>

      <p className="text-center text-xs text-gray-400">
        Saved locally · syncs when online
      </p>

      {/* ── Skip ─────────────────────────────────────────────────────── */}
      <button
        onClick={onSkip}
        disabled={isSubmitting}
        className="
          w-full py-2 text-xs text-gray-400 text-center
          hover:text-gray-600 transition-colors
          disabled:opacity-40 disabled:cursor-not-allowed
        "
      >
        {isSentence
          ? "I don't know the translation"
          : `I don't know the Dinka word for "${prompt.englishGloss}"`
        }
      </button>

      {/* Spacer: when the Dinka keyboard is fixed at the bottom, this ensures
          the submit and skip buttons can be scrolled above it. h-80 (320px)
          covers the keyboard height plus the iPhone safe-area inset. */}
      {showKeyboard && <div aria-hidden className="h-80" />}
    </div>
  );
}

// ── Icons (inline SVG to avoid icon library dependency) ──────────────────────

function MicIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
