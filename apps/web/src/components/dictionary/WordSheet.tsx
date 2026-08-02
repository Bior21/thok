'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchConceptDetail } from '@/lib/api';
import { playAudioUrl } from '@/lib/audio/recorder';
import type { DictionaryEntry } from '@/types';

interface Props {
  conceptId:    string;
  englishGloss: string;
  nativeWord:   string;
  contributorId: string;
  onClose: () => void;
}

export function WordSheet({ conceptId, englishGloss, nativeWord, contributorId, onClose }: Props) {
  const router = useRouter();
  const [entries, setEntries]     = useState<DictionaryEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await fetchConceptDetail(contributorId, conceptId);
      setEntries(detail.entries);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [contributorId, conceptId]);

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

  const withAudio    = entries.filter(e => e.audioUrl);
  const withoutAudio = entries.filter(e => !e.audioUrl);

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
          <p className="text-sm text-gray-500 mt-0.5">{englishGloss}</p>
          {entries.length > 0 && (
            <p className="text-xs text-gray-400 mt-1.5">
              {entries.length} recording{entries.length !== 1 ? 's' : ''} from the community
              {withAudio.length > 0 && ` · ${withAudio.length} with audio`}
            </p>
          )}
        </div>

        {/* Scrollable entries */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
          {loading && (
            <p className="text-sm text-gray-400 py-4 text-center">Loading recordings…</p>
          )}

          {!loading && entries.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">
              No recordings yet — be the first.
            </p>
          )}

          {!loading && withAudio.map(entry => (
            <RecordingRow
              key={entry.entryId}
              entry={entry}
              isPlaying={playingId === entry.entryId}
              onPlay={() => handlePlay(entry)}
            />
          ))}

          {!loading && withoutAudio.length > 0 && (
            <>
              {withAudio.length > 0 && (
                <p className="text-xs text-gray-400 pt-3 pb-1 font-medium">
                  Written only (no recording)
                </p>
              )}
              {withoutAudio.map(entry => (
                <RecordingRow
                  key={entry.entryId}
                  entry={entry}
                  isPlaying={false}
                  onPlay={undefined}
                />
              ))}
            </>
          )}
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
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{entry.nativeWord}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {entry.regionState && (
            <span className="text-xs text-gray-400">{entry.regionState}</span>
          )}
          {entry.isVerified && (
            <span className="text-[10px] px-1 py-px rounded bg-green-50 text-green-700 font-medium">
              verified
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
