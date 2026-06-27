/**
 * lib/audio/recorder.ts
 *
 * This file handles all audio recording and playback in the app.
 *
 * Recording: The ThokRecorder class wraps the browser's built-in recording
 * system into a simple start/stop interface. It asks for microphone permission,
 * records the audio, and hands back the file when done.
 *
 * Playback: Two helper functions let the app play audio back — one for
 * previewing a just-recorded clip, and one for playing audio fetched from
 * the server during the review process.
 *
 * Audio format: Recordings are saved as WebM/Opus, which works on Chrome
 * and Android. Safari does not support WebM — use Chrome for testing.
 * The server converts recordings to WAV format for long-term storage.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

/** The audio file and metadata handed back when recording stops. */
export interface RecordingResult {
  blob: Blob;           // The raw audio file
  durationSec: number;  // How long the recording is, in seconds
  mimeType: string;     // The audio format, e.g. "audio/webm;codecs=opus"
}

// ── Error mapping ────────────────────────────────────────────────────────────

/**
 * Converts a technical microphone error into a plain message the user can act on.
 * Different browsers and devices throw different error types, so we map
 * them all to one of a few clear instructions.
 */
function mapMicError(err: unknown): Error {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return new Error(
          'Microphone permission denied. Tap the lock/▾ icon in your browser ' +
          'address bar and allow microphone access, then try again.'
        );
      case 'NotFoundError':
      case 'OverconstrainedError':
        return new Error('No usable microphone was found on this device.');
      case 'NotReadableError':
        return new Error(
          'Your microphone is already in use by another app. ' +
          'Close it (calls, voice notes, other tabs) and try again.'
        );
    }
  }
  return new Error('Could not access the microphone. Please check your device settings.');
}

// ── ThokRecorder ───────────────────────────────────────────────────────────────

/**
 * Records audio from the device microphone.
 * Create one instance, call start() to begin, then stop() to get the file.
 * Use cancel() to discard a recording in progress.
 */
export class ThokRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startTime = 0;

  // ── Static helpers ───────────────────────────────────────────────────────────

  /**
   * Checks whether the current browser supports audio recording at all.
   * Call this before showing the record button to avoid surprising the user.
   */
  static isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined'
    );
  }

  /**
   * Finds the best audio format this browser can record in.
   * Tries Opus (best quality for speech) first, then falls back to
   * whatever the browser supports.
   */
  static getSupportedMimeType(): string {
    const candidates = [
      // Chrome / Android: best quality for speech
      'audio/webm;codecs=opus',
      'audio/webm',
      // iOS Safari 14.3+: only supported container
      'audio/mp4;codecs=aac',
      'audio/mp4',
      // Firefox fallback
      'audio/ogg;codecs=opus',
      'audio/ogg',
    ];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return ''; // Let the browser pick its own default
  }

  /** Maps a mimeType to the correct file extension for upload. */
  static extensionFor(mimeType: string): string {
    if (mimeType.includes('mp4') || mimeType.includes('aac') || mimeType.includes('m4a')) return 'm4a';
    if (mimeType.includes('ogg')) return 'ogg';
    return 'webm';
  }

  // ── Instance methods ─────────────────────────────────────────────────────────

  /**
   * Asks the user for microphone permission and starts recording.
   * The first time this is called, the browser shows a permission dialog.
   *
   * We ask for specific audio settings (low noise, single channel) but
   * never demand them — some devices refuse if we're too strict, so we
   * let them do their best. The server normalises the format anyway.
   */
  async start(): Promise<void> {
    if (!ThokRecorder.isSupported()) {
      throw new Error(
        'Audio recording is not supported in this browser. ' +
        'Please update to the latest version of Chrome, Safari, or Firefox.'
      );
    }

    const preferred: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,        // Cuts out echo from the speaker
        noiseSuppression: true,        // Reduces background noise
        autoGainControl: true,         // Levels out quiet and loud voices
        sampleRate: { ideal: 16000 },  // Prefer 16kHz — good for speech, small file
        channelCount: { ideal: 1 },    // Prefer mono — half the file size
      },
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(preferred);
    } catch (err) {
      // Some devices reject even "ideal" (non-mandatory) constraints.
      // Fall back to the simplest possible request before giving up.
      if (err instanceof DOMException && err.name === 'OverconstrainedError') {
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (retryErr) {
          throw mapMicError(retryErr);
        }
      } else {
        throw mapMicError(err);
      }
    }

    this.chunks = [];
    this.startTime = Date.now();

    const mimeType = ThokRecorder.getSupportedMimeType();
    this.mediaRecorder = new MediaRecorder(
      this.stream,
      mimeType ? { mimeType } : {}
    );

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    // Collect a chunk every 250ms so very short recordings aren't missed.
    this.mediaRecorder.start(250);
  }

  /**
   * Stops recording and returns the audio file along with its duration.
   * Also releases the microphone so the browser stops showing the recording dot.
   */
  stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        reject(new Error('Recorder is not active. Call start() first.'));
        return;
      }

      const durationSec = (Date.now() - this.startTime) / 1000;
      const mimeType = this.mediaRecorder.mimeType;

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, {
          type: mimeType || '',
        });
        this.cleanup();
        resolve({ blob, durationSec, mimeType });
      };

      this.mediaRecorder.onerror = (event) => {
        this.cleanup();
        reject(
          new Error(`Recording error: ${(event as ErrorEvent).message ?? 'unknown'}`)
        );
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Throws away the current recording and releases the microphone.
   * Used when the user taps "cancel" or navigates away mid-recording.
   */
  cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      // Remove the stop handler so we don't accidentally resolve with partial data.
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    this.chunks = [];
    this.cleanup();
  }

  /** True if a recording is currently in progress. */
  get isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  /**
   * Releases the microphone and clears internal state.
   * Must be called after every recording ends so the browser stops
   * showing the microphone-in-use indicator to the user.
   */
  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
  }
}

// ── Audio playback helpers ─────────────────────────────────────────────────────

/**
 * Plays back a recording that was just made on this device.
 * Used so contributors can hear their own recording before submitting.
 * Returns a function to stop playback early and free memory.
 */
export function playAudioBlob(blob: Blob): () => void {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  audio.play().catch(() => {
    // Browsers sometimes block autoplay if the user hasn't tapped anything yet.
    // Nothing we can do here — the user will just tap play again.
  });

  return () => {
    audio.pause();
    audio.src = '';
    URL.revokeObjectURL(url); // Free the temporary URL to avoid memory leaks
  };
}

/**
 * Plays audio from a server URL — used by reviewers to listen to submitted entries.
 *
 * The `onEnded` callback is called when playback finishes or fails, so the
 * screen can reset its play button. It is NOT called when the returned stop
 * function is used (the caller already knows it stopped in that case).
 *
 * A `settled` flag prevents `onEnded` from being called twice if both the
 * 'ended' event and the play() rejection fire.
 *
 * Errors are logged to the browser console with an error code:
 *   code 4 = MEDIA_ERR_SRC_NOT_SUPPORTED means the format isn't supported
 *   or the URL is unreachable. On Safari, WebM audio causes this error.
 */
export function playAudioUrl(url: string, onEnded?: () => void): () => void {
  const audio = new Audio();
  let settled = false;

  // Ensures onEnded is called at most once, regardless of how many events fire.
  const settle = () => {
    if (settled) return;
    settled = true;
    onEnded?.();
  };

  const handleError = () => {
    const err = audio.error;
    console.error('[playAudioUrl] audio error', {
      url,
      code: err?.code,
      message: err?.message,
    });
    settle();
  };

  audio.addEventListener('ended', settle);
  audio.addEventListener('error', handleError);

  // Set src after attaching listeners so no events are missed.
  audio.src = url;
  audio.play().catch((e: unknown) => {
    console.error('[playAudioUrl] play() rejected:', e, 'url:', url);
    settle();
  });

  return () => {
    audio.removeEventListener('ended', settle);
    audio.removeEventListener('error', handleError);
    audio.pause();
    audio.src = '';
  };
}
