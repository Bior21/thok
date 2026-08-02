'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchHeadwordDetail } from '@/lib/api';
import { playAudioUrl } from '@/lib/audio/recorder';
import type { DictionaryEntry, DictionarySense } from '@/types';

interface Props {
  nativeWord:    string;
  contributorId: string;
  onClose: () => void;
}

export function WordSheet({ nativeWord, contributorId, onClose }: Props) {
  const router = useRouter();
  const [senses, setSenses]       = useState<DictionarySense[]>([]);
  const [loading, setLoading]     = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await fetchHeadwordDetail(contributorId, nativeWord);
      setSenses(detail.senses);
    } catch {
      setSenses([]);
    } finally {
      setLoading(false);
    }
  }, [contributorId, nativeWord]);

  useEffect(() => { load(); }, [load]);

  // Close on backdrop tap
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handlePlay = (entry: DictionaryEntry) => {
    if (!entry.audioUrl) return;
    setPlayingId(entry.entryId);
    playAudioUrl(entry.audioUrl, () => setPlayingId(null));
  };

  const handleRecord = () => {
    onClose();
    router.push('/task');
  };

  const totalRecordings = senses.reduce((n, s) => n + s.entries.length, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={handleBackdrop}
    >
      <div className="w-full bg-white rounded-t-2xl max-h-[85vh] flex flex-col">

        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Word header */}
        <div className="px-5 pt-3 pb-4 border-b border-gray-100">
          <p className="text-2xl font-semibold text-gray-900">{nativeWord}</p>
          {!loading && senses.length > 0 && (
            <p className="text-xs text-gray-400 mt-1.5">
              {senses.length > 1 ? `${senses.length} meanings · ` : ''}
              {totalRecordings} recording{totalRecordings !== 1 ? 's' : ''} from the community
            </p>
          )}
        </div>

        {/* Scrollable senses */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading && (
            <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
          )}

          {!loading && senses.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">
              No recordings yet — be the first.
            </p>
          )}

          {!loading && senses.map((sense, i) => (
            <SenseBlock
              key={sense.conceptId}
              sense={sense}
              number={senses.length > 1 ? i + 1 : undefined}
              playingId={playingId}
              onPlay={handlePlay}
            />
          ))}
        </div>

        {/* Record CTA */}
        <div className="px-5 py-4 border-t border-gray-100 space-y-2">
          <button
            onClick={handleRecord}
            className="
              w-full flex items-center justify-center gap-2 py-3
              bg-[#1B3A5C] text-white text-sm font-semibold rounded-xl
              active:bg-[#152e4a] transition-colors
            "
          >
            <MicIcon />
            Record your pronunciation
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm text-gray-500 text-center"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SenseBlock({
  sense,
  number,
  playingId,
  onPlay,
}: {
  sense: DictionarySense;
  number?: number;
  playingId: string | null;
  onPlay: (entry: DictionaryEntry) => void;
}) {
  const withAudio    = sense.entries.filter(e => e.audioUrl);
  const withoutAudio = sense.entries.filter(e => !e.audioUrl);

  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 mb-1.5">
        {number != null && (
          <span className="text-xs font-semibold text-gray-400">{number}.</span>
        )}
        <p className="text-sm font-medium text-gray-700">{sense.englishGloss}</p>
        {sense.conceptType === 'sentence' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">
            sentence
          </span>
        )}
      </div>

      <div className="space-y-1">
        {withAudio.map(entry => (
          <RecordingRow
            key={entry.entryId}
            entry={entry}
            isPlaying={playingId === entry.entryId}
            onPlay={() => onPlay(entry)}
          />
        ))}
        {withoutAudio.map(entry => (
          <RecordingRow
            key={entry.entryId}
            entry={entry}
            isPlaying={false}
            onPlay={undefined}
          />
        ))}
      </div>
    </div>
  );
}

function RecordingRow({
  entry,
  isPlaying,
  onPlay,
}: {
  entry: DictionaryEntry;
  isPlaying: boolean;
  onPlay?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {entry.dialect && (
            <span className="text-xs text-gray-500 font-medium">{entry.dialect}</span>
          )}
          {entry.regionState && (
            <span className="text-xs text-gray-400">{entry.regionState}</span>
          )}
          {entry.isVerified && (
            <span className="text-[10px] px-1 py-px rounded bg-green-50 text-green-700 font-medium">
              verified
            </span>
          )}
          {!entry.isVerified && entry.isSeed && (
            <span className="text-[10px] px-1 py-px rounded bg-gray-100 text-gray-500 font-medium">
              dictionary source
            </span>
          )}
          {entry.isOwn && (
            <span className="text-[10px] px-1 py-px rounded bg-blue-50 text-blue-700 font-medium">
              yours
            </span>
          )}
        </div>
      </div>

      {onPlay && (
        <button
          onClick={onPlay}
          aria-label="Play recording"
          className={`
            flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center
            transition-colors
            ${isPlaying
              ? 'bg-[#1B3A5C] text-white'
              : 'bg-gray-100 text-gray-600 active:bg-gray-200'
            }
          `}
        >
          {isPlaying ? <StopIcon /> : <PlayIcon />}
        </button>
      )}

      {entry.durationSec != null && (
        <span className="text-xs text-gray-400 flex-shrink-0">
          {Math.round(entry.durationSec)}s
        </span>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="6" y="6" width="12" height="12" rx="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
