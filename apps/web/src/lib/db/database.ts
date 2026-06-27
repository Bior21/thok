/**
 * lib/db/database.ts
 *
 * This file sets up the local database that lives on the user's device.
 * It stores everything the app needs to work offline: word entries waiting
 * to be uploaded, word concepts used for prompts, the contributor's profile,
 * and a few app settings.
 *
 * Why store data on the device at all?
 * So the app keeps working when there's no internet. A contributor in the
 * field can record words and they'll be safely stored here until the device
 * comes back online and can upload them.
 *
 * This uses IndexedDB (the browser's built-in database) via a library called
 * Dexie, which makes it much easier to work with.
 *
 * Adding new fields or tables in future: increment the version number and
 * add a new .version() block. Never change existing version blocks — that
 * would break the database for anyone who already has the app installed.
 */

import Dexie, { type Table } from 'dexie';
import type { LocalEntry, Contributor, Concept } from '@/types';

// ── Table row types ────────────────────────────────────────────────────────────

/** A word entry saved locally, including its audio file if recorded. */
export type LocalEntryRow = LocalEntry;

/** A word concept downloaded from the server for use as an offline prompt. */
export type ConceptRow = Concept;

/** The contributor record for the person using this device. */
export type ContributorRow = Contributor;

/** A simple key-value store for small app settings like the total contribution count. */
export interface AppStateRow {
  key: string;     // The setting name
  value: unknown;  // The value (can be a number, string, boolean, etc.)
}

// ── Database class ─────────────────────────────────────────────────────────────

/**
 * The Thok local database. Holds all data the app needs to work offline.
 * Only one instance is ever created (see `db` singleton below).
 */
export class ThokDatabase extends Dexie {
  entries!: Table<LocalEntryRow, string>;
  concepts!: Table<ConceptRow, string>;
  contributor!: Table<ContributorRow, string>;
  appState!: Table<AppStateRow, string>;

  constructor() {
    super('thok-db');

    this.version(1).stores({
      // Word entries — queried by upload status and creation time.
      // clientEntryId is the unique key we generate on the device.
      entries: 'clientEntryId, syncStatus, conceptId, createdAt',

      // Concepts downloaded from the server — used to show prompts offline.
      concepts: 'id, englishGloss',

      // The single contributor record for this device — one person per device.
      contributor: 'id',

      // Simple key-value store for app settings like the contribution counter.
      appState: 'key',
    });
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

/** The single shared database instance used everywhere in the app. */
export const db = new ThokDatabase();
