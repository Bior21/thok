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
 * Audio format: MediaRecorder captures a compressed stream (WebM/Opus on
 * Chrome/Android, MP4/AAC on Safari). After recording stops, we decode the
 * compressed audio through the Web Audio API and re-encode it as uncompressed
 * 16-bit PCM WAV. This gives ML engineers lossless source audio without
 * requiring any server-side transcoding — the subtle breathy/modal vowel
 * distinctions in Dinka that Opus compression can erase are preserved in full.
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
    if (mimeType === 'audio/wav') return 'wav';
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
   * Stops recording and returns the audio as a lossless WAV file.
   *
   * The browser's MediaRecorder captures compressed audio (Opus or AAC depending
   * on the platform). We decode it through the Web Audio API to get raw PCM
   * samples, then write a standard WAV file. This preserves phonetic detail that
   * lossy codecs discard — critical for Dinka's breathy/modal vowel distinctions.
   *
   * Falls back to the compressed blob if WAV encoding fails (shouldn't happen on
   * any modern browser, but we never block the user on it).
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
        const compressed = new Blob(this.chunks, { type: mimeType || '' });
        this.cleanup();

        // Decode compressed → PCM → WAV.
        const ctx = new AudioContext();
        compressed.arrayBuffer()
          .then(buf  => ctx.decodeAudioData(buf))
          .then(audioBuf => { ctx.close(); resolve({ blob: encodeWav(audioBuf), durationSec, mimeType: 'audio/wav' }); })
          .catch(err => {
            ctx.close();
            console.warn('[ThokRecorder] WAV encode failed, uploading compressed audio:', err);
            resolve({ blob: compressed, durationSec, mimeType });
          });
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

// ── WAV encoder ────────────────────────────────────────────────────────────────

/**
 * Encodes a decoded AudioBuffer as a 16-bit PCM WAV blob (mono, native sample rate).
 *
 * WAV layout: RIFF header (12 B) + fmt chunk (24 B) + data chunk (8 B + samples).
 * We always take the first channel only — stereo microphones are uncommon on phones
 * and mono halves the file size with no quality loss for a single speaker.
 *
 * We keep the device's native sample rate rather than downsampling. Most phones
 * record at 44.1 kHz or 48 kHz; a 3-second clip is ~264 KB — well within the
 * 10 MB upload limit. ASR engineers can resample to 16 kHz themselves; TTS
 * engineers want the full-rate original.
 */
function encodeWav(audioBuffer: AudioBuffer): Blob {
  const samples    = audioBuffer.getChannelData(0);  // mono: first channel only
  const sampleRate = audioBuffer.sampleRate;

  // Convert float32 samples (−1…+1) to signed int16 (−32768…+32767).
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 32768 : s * 32767;
  }

  const dataBytes = int16.byteLength;
  const buf       = new ArrayBuffer(44 + dataBytes);
  const v         = new DataView(buf);
  const w         = (off: number, str: string) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)); };

  w(0,  'RIFF');  v.setUint32(4,  36 + dataBytes,     true);
  w(8,  'WAVE');
  w(12, 'fmt ');  v.setUint32(16, 16,             true);  // PCM chunk size
                  v.setUint16(20, 1,              true);  // PCM = 1
                  v.setUint16(22, 1,              true);  // mono
                  v.setUint32(24, sampleRate,     true);
                  v.setUint32(28, sampleRate * 2, true);  // byte rate
                  v.setUint16(32, 2,              true);  // block align
                  v.setUint16(34, 16,             true);  // bits per sample
  w(36, 'data');  v.setUint32(40, dataBytes,      true);
  new Int16Array(buf, 44).set(int16);

  return new Blob([buf], { type: 'audio/wav' });
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
