/**
 * components/review/ReviewTask.tsx
 *
 * Renders a review task with independent text and audio judgments.
 *
 * Decision flow:
 *   1. Reviewer must play the audio at least once before verdicts unlock.
 *   2. Text verdict (✓ / ⚠ / ✗) judges the written Dinka word.
 *      ✗ expands an inline panel: wrong type selector + optional correction input.
 *   3. Audio verdict (✓ / ⚠ / ✗) judges the recording.
 *      ✗ expands an inline panel with an optional re-record flow.
 *   4. Submit unlocks when both verdicts are chosen (and wrong_type if text ✗).
 *      If a correction or recording is present the button says "Submit & send correction".
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { playAudioUrl } from '@/lib/audio/recorder';
import { useRecorder } from '@/hooks/useRecorder';
import type {
  ReviewTask as ReviewTaskType,
  Contributor,
  TextVerdict,
  AudioVerdict,
  WrongType,
  ReviewSubmission,
} from '@/types';

// ── Verdict button config ─────────────────────────────────────────────────────

interface VerdictBtn {
  value: string;
  icon: string;
  label: string;
  activeClass: string;
}

const TEXT_BTNS: VerdictBtn[] = [
  { value: 'correct',       icon: '✓', label: 'Correct', activeClass: 'bg-green-500 border-green-500 text-white' },
  { value: 'valid_variant', icon: '⚠', label: 'Unsure',  activeClass: 'bg-amber-500 border-amber-500 text-white' },
  { value: 'wrong_word',    icon: '✗', label: 'Wrong',   activeClass: 'bg-red-500   border-red-500   text-white' },
];

const AUDIO_BTNS: VerdictBtn[] = [
  { value: 'correct',       icon: '✓', label: 'Good',  activeClass: 'bg-green-500 border-green-500 text-white' },
  { value: 'valid_variant', icon: '⚠', label: 'Unsure', activeClass: 'bg-amber-500 border-amber-500 text-white' },
  { value: 'bad_audio',     icon: '✗', label: 'Poor',  activeClass: 'bg-red-500   border-red-500   text-white' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  task: ReviewTaskType;
  isSubmitting: boolean;
  onSubmit: (submission: ReviewSubmission) => Promise<void>;
  contributor: Contributor;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReviewTask({ task, isSubmitting, onSubmit, contributor }: Props) {
  const { entry } = task;

  // ── Playback ──────────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  // ── Verdicts ──────────────────────────────────────────────────────────────
  const [textVerdict,  setTextVerdict]  = useState<TextVerdict  | null>(null);
  const [audioVerdict, setAudioVerdict] = useState<AudioVerdict | null>(null);
  const [wrongType,    setWrongType]    = useState<WrongType    | null>(null);
  const [textCorrection, setTextCorrection] = useState('');

  // ── Correction recording ──────────────────────────────────────────────────
  const {
    isRecording, recording,
    start: startRec, stop: stopRec, cancel: cancelRec, clear: clearRec,
  } = useRecorder();

  // Reset everything when the entry changes (next task).
  const resetState = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setIsPlaying(false);
    setHasPlayed(false);
    setTextVerdict(null);
    setAudioVerdict(null);
    setWrongType(null);
    setTextCorrection('');
    cancelRec();
  // cancelRec is stable (useCallback in useRecorder)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.entryId]);

  useEffect(() => {
    resetState();
  }, [resetState]);

  // Stop playback on unmount.
  useEffect(() => () => { stopRef.current?.(); }, []);

  // ── Playback handler ──────────────────────────────────────────────────────
  const handleTogglePlay = () => {
    if (isPlaying) {
      stopRef.current?.();
      stopRef.current = null;
      setIsPlaying(false);
      return;
    }
    setIsPlaying(true);
    if (!hasPlayed) setHasPlayed(true);
    stopRef.current = playAudioUrl(entry.audioUrl, () => {
      stopRef.current = null;
      setIsPlaying(false);
    });
  };

  // ── Text verdict handler ──────────────────────────────────────────────────
  const handleTextVerdict = (v: TextVerdict) => {
    setTextVerdict(v);
    if (v !== 'wrong_word') {
      setWrongType(null);
      setTextCorrection('');
    }
  };

  // ── Audio verdict handler ─────────────────────────────────────────────────
  const handleAudioVerdict = (v: AudioVerdict) => {
    setAudioVerdict(v);
    if (v !== 'bad_audio') cancelRec();
  };

  // ── Submit logic ──────────────────────────────────────────────────────────
  const canSubmit =
    hasPlayed &&
    textVerdict  !== null &&
    audioVerdict !== null &&
    (textVerdict !== 'wrong_word' || wrongType !== null) &&
    !isSubmitting &&
    !isRecording;

  const hasCorrection =
    (textVerdict  === 'wrong_word' && textCorrection.trim().length > 0) ||
    (audioVerdict === 'bad_audio'  && recording !== null);

  const handleSubmit = () => {
    if (!canSubmit || !textVerdict || !audioVerdict) return;
    onSubmit({
      entryId:          entry.entryId,
      affinityTier:     entry.affinityTier,
      textVerdict,
      wrongType:        wrongType        ?? undefined,
      textCorrection:   textCorrection.trim() || undefined,
      audioVerdict,
      audioBlob:        recording?.blob,
      audioDurationSec: recording?.durationSec,
      willUploadAudio:  recording !== null,
    });
  };

  const showDialectNotice =
    contributor.town.toLowerCase() !== entry.submitterTown.toLowerCase();

  return (
    <div className="mt-3 space-y-3 animate-fadein">

      {/* ── Entry card ───────────────────────────────────────────────── */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-4">

        {/* English concept */}
        <div>
          <p className="text-xs text-gray-400 mb-0.5">English</p>
          <p className="text-lg font-medium text-gray-900">{entry.englishGloss}</p>
        </div>

        {/* Dinka word + text verdict */}
        <div className="space-y-2">
          <p className="text-xs text-gray-400">Dinka word</p>
          <div className="flex items-center gap-3">
            <p className="text-3xl font-medium text-gray-900 flex-1">{entry.nativeWord}</p>
            <VerdictButtons
              buttons={TEXT_BTNS}
              value={textVerdict}
              onChange={v => handleTextVerdict(v as TextVerdict)}
              disabled={false}
            />
          </div>

          {/* Text wrong — inline expansion */}
          {textVerdict === 'wrong_word' && (
            <div className="mt-1 bg-white border border-red-100 rounded-lg p-3 space-y-3">
              <p className="text-xs font-medium text-gray-700">What&rsquo;s wrong?</p>
              <div className="space-y-1.5">
                {(
                  [
                    {
                      value: 'wrong_spelling',
                      label: 'Wrong spelling',
                      desc: 'Right word, just spelled differently',
                    },
                    {
                      value: 'wrong_word',
                      label: 'Wrong word',
                      desc: `Not the Dinka word for "${entry.englishGloss}"`,
                    },
                  ] as { value: WrongType; label: string; desc: string }[]
                ).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setWrongType(opt.value)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                      wrongType === opt.value
                        ? 'border-red-400 bg-red-50'
                        : 'border-gray-200 bg-white active:bg-gray-50'
                    }`}
                  >
                    <span className="font-medium text-gray-800">{opt.label}</span>
                    <span className="text-xs text-gray-500 ml-1">— {opt.desc}</span>
                  </button>
                ))}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">
                  Your correction <span className="text-gray-400">(optional)</span>
                </p>
                <input
                  type="text"
                  value={textCorrection}
                  onChange={e => setTextCorrection(e.target.value)}
                  placeholder={`Correct Dinka word for "${entry.englishGloss}"`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 bg-white"
                />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100" />

        {/* Audio player + audio verdict */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {/* Play button */}
            <button
              onClick={handleTogglePlay}
              aria-label={isPlaying ? 'Stop audio' : 'Play audio'}
              className="flex items-center gap-3 px-3 py-2.5 bg-white border border-gray-200 rounded-lg active:bg-gray-50 transition-colors flex-1"
            >
              {isPlaying
                ? <PauseIcon className="text-[#27500A]" />
                : <PlayIcon  className="text-[#27500A]" />}
              <div className="flex items-center gap-0.5 flex-1 h-5" aria-hidden="true">
                {[5, 9, 14, 18, 12, 16, 8, 13, 10, 6, 12, 15, 9, 7].map((h, i) => (
                  <div
                    key={i}
                    className={`w-0.5 rounded-full ${isPlaying ? 'bg-[#27500A]' : 'bg-gray-300'}`}
                    style={{ height: `${h}px` }}
                  />
                ))}
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {isPlaying ? 'Tap to stop' : 'Play'}
              </span>
            </button>
            <VerdictButtons
              buttons={AUDIO_BTNS}
              value={audioVerdict}
              onChange={v => handleAudioVerdict(v as AudioVerdict)}
              disabled={!hasPlayed}
            />
          </div>

          {!hasPlayed && (
            <p className="text-xs text-center text-gray-400">
              Play the audio to unlock audio verdict
            </p>
          )}

          {/* Audio wrong — inline expansion */}
          {audioVerdict === 'bad_audio' && (
            <div className="bg-white border border-red-100 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-gray-700">
                Can you record &ldquo;{entry.englishGloss}&rdquo; in Dinka?
              </p>

              {!isRecording && !recording && (
                <button
                  onClick={startRec}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#27500A] text-white text-sm font-medium rounded-lg active:bg-[#1e3d07]"
                >
                  <span className="w-2 h-2 rounded-full bg-white" />
                  Record
                </button>
              )}

              {isRecording && (
                <button
                  onClick={stopRec}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg"
                >
                  <span className="w-2 h-2 rounded-full bg-white animate-record-pulse" />
                  Recording — tap to stop
                </button>
              )}

              {recording && !isRecording && (
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    ✓ Recorded ({Math.round(recording.durationSec)}s)
                  </p>
                  <button
                    onClick={clearRec}
                    className="text-xs text-gray-500 px-2 py-2"
                  >
                    Re-record
                  </button>
                </div>
              )}

              <button
                onClick={() => { clearRec(); }}
                className="w-full text-xs text-gray-400 py-1 text-center"
              >
                Skip — just flag it
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Context note ─────────────────────────────────────────────── */}
      <div className="border-l-2 border-gray-200 pl-3 py-0.5 space-y-1">
        <p className="text-xs text-gray-500">
          📍 Entry by a user from {entry.submitterTown}, {entry.submitterState}.
        </p>
        {showDialectNotice && (
          <p className="text-xs text-gray-400 italic">
            You are from {contributor.town}. Dialect differences may exist, so
            use &ldquo;Valid variant&rdquo; if the word sounds unfamiliar but plausible.
          </p>
        )}
      </div>

      {/* ── Submit ───────────────────────────────────────────────────── */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`w-full py-3 rounded-xl text-sm font-medium transition-colors ${
          canSubmit
            ? 'bg-[#27500A] text-white active:bg-[#1e3d07]'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
        }`}
      >
        {isSubmitting
          ? 'Submitting…'
          : hasCorrection
            ? 'Submit & send correction'
            : 'Submit review'}
      </button>
    </div>
  );
}

// ── VerdictButtons ────────────────────────────────────────────────────────────

function VerdictButtons({
  buttons,
  value,
  onChange,
  disabled,
}: {
  buttons: VerdictBtn[];
  value: string | null;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      {buttons.map(btn => {
        const isActive = value === btn.value;
        return (
          <button
            key={btn.value}
            onClick={() => !disabled && onChange(btn.value)}
            aria-pressed={isActive}
            disabled={disabled}
            className={`
              flex flex-col items-center justify-center gap-0.5
              w-14 py-1.5 rounded-lg border text-xs font-medium transition-colors
              ${isActive
                ? btn.activeClass
                : 'border-gray-200 text-gray-400 bg-white'}
              ${disabled
                ? 'opacity-40 cursor-not-allowed'
                : 'active:scale-95'}
            `}
          >
            <span className="text-sm leading-none">{btn.icon}</span>
            <span className="leading-none">{btn.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function PlayIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`w-5 h-5 flex-shrink-0 ${className}`}
      fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function PauseIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`w-5 h-5 flex-shrink-0 ${className}`}
      fill="currentColor" viewBox="0 0 24 24"
    >
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}
