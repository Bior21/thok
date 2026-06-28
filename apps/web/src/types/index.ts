/**
 * types/index.ts
 *
 * This file defines the shape of every piece of data used across the Thok app.
 * Think of it as a shared dictionary of "what does this data look like?"
 *
 * When data changes on the server side (database), this file is the first
 * place to update — the editor will then highlight every other file that
 * needs to change too.
 */

// ── Primitives ────────────────────────────────────────────────────────────────

/** Whether the current task is adding a new word or reviewing an existing one. */
export type TaskType = 'contribute' | 'review';

/** How a word concept is shown to the person contributing — as a picture, a word, a description, or a full sentence. */
export type PromptType = 'image' | 'word' | 'context' | 'sentence';

/** Whether a concept is a single word or a full sentence to translate. */
export type ConceptType = 'word' | 'sentence';

/** The old-style single verdict on a submission — kept so older review records still work. */
export type Verdict = 'correct' | 'incorrect' | 'valid_variant' | 'unsure';

/** A reviewer's judgment on the written Dinka word. */
export type TextVerdict = 'correct' | 'valid_variant' | 'wrong_word';

/** A reviewer's judgment on the audio recording. */
export type AudioVerdict = 'correct' | 'valid_variant' | 'bad_audio';

/** When the written word is flagged as wrong, this tells us whether the spelling is off or the wrong word was used entirely. */
export type WrongType = 'wrong_spelling' | 'wrong_word';

/**
 * How closely a reviewer is connected to the contributor who recorded the entry.
 * 1 = same dialect (most relevant opinion), 4 = unrelated dialect (least relevant).
 * A higher-tier match weighs more in quality scoring.
 */
export type AffinityTier = 1 | 2 | 3 | 4;

/**
 * Where a locally saved entry is in its journey to the server.
 *   pending  → saved on this device, not uploaded yet
 *   syncing  → upload is happening right now
 *   synced   → server confirmed it arrived safely
 *   failed   → upload failed, will try again later
 */
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

/** The network status shown in the top bar of the app. */
export type ConnectivityState = 'online' | 'syncing' | 'offline';

// ── Contributor ───────────────────────────────────────────────────────────────

/**
 * A person who contributes words to Thok.
 * We only store where they're from and their language background — no names or emails.
 * This record is saved on the device and also sent to the server.
 */
export interface Contributor {
  id: string;              // A unique ID assigned by the server on first sign-up
  name?: string;           // Display name — optional, stored locally only
  town: string;            // e.g. "Bor"
  state: string;           // e.g. "Jonglei State"
  ageRange?: string;       // e.g. "18-24" — optional
  gender?: string;         // "M" | "F" | "NB" | "prefer_not_to_say"
  l1Status: 'L1' | 'L2';  // L1 = grew up speaking Dinka, L2 = learned it later
  dialectInferred?: string;// The server's best guess at dialect from location, e.g. "bor"
  language: string;        // Always "dinka" for now
  createdAt: string;       // When this person first registered (ISO date string)
}

/** Basic background info about the speaker attached to each word recording. */
export interface SpeakerMetadata {
  ageRange?: string;
  gender?: string;
  l1Status: 'L1' | 'L2';
}

// ── Concepts and Prompts ──────────────────────────────────────────────────────

/**
 * A concept is the idea or thing we're trying to collect a Dinka word for — like "dog" or "water".
 * Multiple people can submit recordings for the same concept.
 * Concepts are saved on the device so prompts still show up when offline.
 */
export interface Concept {
  id: string;                    // e.g. "c_0124" for a word, "s_0001" for a sentence
  englishGloss: string;          // The English label — a word like "water" or a sentence like "I want water."
  imagePath?: string;            // Path to an image if this concept is shown as a picture
  promptContext?: string;        // Extra instructions, e.g. for template sentences like "My name is [name]."
  conceptType?: ConceptType;     // 'word' (default) or 'sentence'
}

/**
 * A prompt is the specific way a concept is presented to the contributor at the moment of recording.
 * The server decides which prompt type to use and sends it with each task.
 */
export interface Prompt {
  promptId: string;
  conceptId: string;
  englishGloss: string;
  promptType: PromptType;
  imageUrl?: string;       // A temporary link to the image, valid for 10 minutes
  contextText?: string;    // The descriptive question, or extra guidance for sentence templates
  conceptType?: ConceptType; // 'word' or 'sentence' — controls the input field style
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

/** A task where the contributor records a new word. */
export interface ContributeTask {
  taskType: 'contribute';
  prompt: Prompt;
}

/**
 * A task where the contributor listens to someone else's recording and judges it.
 * The affinityTier tells us how closely related the reviewer's dialect is to the original speaker's —
 * this affects how much weight their opinion carries in the quality score.
 */
export interface ReviewTask {
  taskType: 'review';
  entry: {
    entryId: string;
    conceptId: string;
    englishGloss: string;
    nativeWord: string;
    audioUrl: string;        // Temporary link to the audio, valid for 10 minutes
    submitterTown: string;
    submitterState: string;
    affinityTier: AffinityTier;
  };
}

/** Everything the server might send back when the app asks "what should I do next?" */
export type NextTask = ContributeTask | ReviewTask;

// ── Lexicon Entries ───────────────────────────────────────────────────────────

/**
 * A word entry saved on this device before it has been uploaded to the server.
 * We save it locally first so the contributor's work is never lost, even offline.
 * The clientEntryId is used to prevent the same entry being uploaded twice.
 */
export interface LocalEntry {
  clientEntryId: string;     // A unique ID we generate locally before the server knows about this entry
  conceptId: string;
  englishGloss: string;      // Stored locally so the dictionary shows correctly without internet
  nativeWord: string;
  promptId: string;
  speakerMetadata: SpeakerMetadata;
  audioBlob?: Blob;          // The audio recording file — absent if the person skipped recording
  audioDurationSec?: number;
  syncStatus: SyncStatus;
  createdAt: string;         // When the entry was made (ISO date string)
  syncedAt?: string;         // When the server confirmed receipt
  serverEntryId?: string;    // The server's ID for this entry, filled in after upload
}

/**
 * A word entry as it comes back from the server's dictionary endpoint.
 * This is the "official" version — already uploaded and stored in the database.
 */
export interface DictionaryEntry {
  entryId: string;
  nativeWord: string;
  englishGloss: string;
  isVerified: boolean;       // True once enough reviewers have agreed it's correct
  isOwn: boolean;            // True if this was submitted by the person currently using the app
  audioUrl?: string;         // Temporary link to the audio, valid for 10 minutes
}

// ── Reviews ───────────────────────────────────────────────────────────────────

/** Everything the app sends to the server when a reviewer submits their verdict. */
export interface ReviewSubmission {
  entryId:           string;
  affinityTier:      AffinityTier;
  textVerdict:       TextVerdict;
  wrongType?:        WrongType;       // Must be filled in when textVerdict = 'wrong_word'
  textCorrection?:   string;          // The reviewer's suggestion for the correct word
  audioVerdict:      AudioVerdict;
  audioBlob?:        Blob;            // A replacement recording the reviewer made
  audioDurationSec?: number;
  willUploadAudio?:  boolean;         // Tells the server to expect an audio file upload
}

/** What the server sends back after a reviewer submits their verdict. */
export interface ReviewResult {
  verdictId:          string;
  confidenceScore:    number;         // How confident we are this entry is correct (0–1)
  isVerified:         boolean;        // True if the entry has passed overall quality checks
  textVerified:       boolean;        // True if the written word has been verified
  audioVerified:      boolean;        // True if the audio recording has been verified
  correctionEntryId?: string;         // If a correction was created, this is its server ID
}

// ── Storage ───────────────────────────────────────────────────────────────────

/** How much storage space is being used on this device — shown as a gauge on the home screen. */
export interface StorageInfo {
  usedBytes: number;
  totalBytes: number;
  percentUsed: number;  // A number from 0 to 100
  isWarning: boolean;   // True when storage is getting full (70%+)
  isBlocked: boolean;   // True when storage is nearly full (90%+) — new recordings are blocked
}

// ── API response shapes ───────────────────────────────────────────────────────

/** The standard error format returned by all Thok server endpoints. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    status: number;
  };
}

/** What the server sends back after a new contributor registers. */
export interface RegisterContributorResponse {
  contributorId: string;
  dialectInferred?: string;
  language: string;
}

/** What the server sends back after a word entry is submitted. */
export interface SubmitEntryResponse {
  entryId: string;
  syncedAt: string;
}

/** What the server sends back after an audio file is uploaded. */
export interface UploadAudioResponse {
  audioPathOpus: string;
  audioPathWav: string | null; // Null until a background job converts it to WAV format
  snrFlag: boolean;
  durationSec: number;
}

/** What the server sends back when the app requests the dictionary. */
export interface DictionaryResponse {
  entries: DictionaryEntry[];
  total: number;
}
