/**
 * hooks/useRecorder.ts
 *
 * A React hook that makes it easy for any screen to record audio.
 * It wraps the ThokRecorder class and keeps track of all the recording
 * state so the screen just has to call start(), stop(), etc.
 *
 * Usage:
 *   const { isRecording, recording, start, stop, cancel, play, clear } = useRecorder();
 *
 * The hook also makes sure the microphone is released if the user
 * navigates away while recording is in progress.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ThokRecorder,
  playAudioBlob,
  type RecordingResult,
} from '@/lib/audio/recorder';

// ── Types ──────────────────────────────────────────────────────────────────────

interface RecorderState {
  isRecording: boolean;
  recording: RecordingResult | null;  // The finished recording, or null if not done yet
  error: string | null;               // An error message if something went wrong
  isSupported: boolean;               // False on browsers that can't record audio
}

interface RecorderActions {
  /** Asks for microphone permission and starts recording. */
  start: () => Promise<void>;
  /** Stops recording and saves the audio so it can be submitted. */
  stop: () => Promise<void>;
  /** Throws away the current recording without saving it. */
  cancel: () => void;
  /** Plays back the saved recording so the contributor can hear it. Returns a function to stop playback early. */
  play: () => (() => void) | undefined;
  /** Clears the saved recording so the contributor can record again. */
  clear: () => void;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Provides recording controls and state to any screen that needs audio input.
 * Handles microphone permission, state transitions, and cleanup automatically.
 */
export function useRecorder(): RecorderState & RecorderActions {
  // Keep a reference to the active recorder so we can stop it from anywhere.
  const recorderRef = useRef<ThokRecorder | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording]     = useState<RecordingResult | null>(null);
  const [error, setError]             = useState<string | null>(null);

  // Check once at startup whether this browser supports recording at all.
  // Done this way (not in render) so it doesn't break server-side rendering.
  const [isSupported] = useState(() =>
    typeof window !== 'undefined' && ThokRecorder.isSupported()
  );

  // If the user navigates away while recording, cancel and release the microphone.
  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
    };
  }, []);

  /** Starts a new recording. Asks for microphone permission if needed. */
  const start = useCallback(async () => {
    setError(null);
    setRecording(null);

    const recorder = new ThokRecorder();
    recorderRef.current = recorder;

    try {
      await recorder.start();
      setIsRecording(true);
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : 'Could not start recording.';
      setError(message);
      recorderRef.current = null;
    }
  }, []);

  /** Stops the current recording and saves the result. */
  const stop = useCallback(async () => {
    if (!recorderRef.current) return;

    try {
      const result = await recorderRef.current.stop();
      setRecording(result);
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : 'Recording failed. Please try again.';
      setError(message);
    } finally {
      setIsRecording(false);
      recorderRef.current = null;
    }
  }, []);

  /** Cancels and discards the current recording. */
  const cancel = useCallback(() => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setIsRecording(false);
    setRecording(null);
    setError(null);
  }, []);

  /** Plays back the saved recording. Returns a function to stop it early. */
  const play = useCallback((): (() => void) | undefined => {
    if (!recording) return undefined;
    return playAudioBlob(recording.blob);
  }, [recording]);

  /** Clears the saved recording so the contributor can try again. */
  const clear = useCallback(() => {
    setRecording(null);
    setError(null);
  }, []);

  return {
    isRecording,
    recording,
    error,
    isSupported,
    start,
    stop,
    cancel,
    play,
    clear,
  };
}
