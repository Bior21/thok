/**
 * store/app.ts
 *
 * This file holds the global "memory" of the app — things that multiple
 * screens need to know about at the same time, like whether the user is
 * connected to the internet, how much storage is left, and who the
 * current contributor is.
 *
 * Only truly shared state lives here. Things like "what word is being
 * typed right now" stay local to the screen that needs them.
 */

import { create } from 'zustand';
import type { Contributor, ConnectivityState, StorageInfo } from '@/types';

// ── State shape ────────────────────────────────────────────────────────────────

interface AppState {
  // ── Initialisation ──────────────────────────────────────────────────────────

  /**
   * True while the app is still loading saved data from the device on startup.
   * Screens wait for this to turn false before deciding whether to show the
   * onboarding form — otherwise a registered user might get sent there by mistake.
   */
  isInitialising: boolean;
  setIsInitialising: (v: boolean) => void;

  // ── Contributor ─────────────────────────────────────────────────────────────

  /**
   * The person using this device.
   * null means either the app hasn't finished loading yet, or the person
   * hasn't registered yet (first time opening the app).
   */
  contributor: Contributor | null;
  setContributor: (contributor: Contributor | null) => void;

  // ── Connectivity ─────────────────────────────────────────────────────────────

  /** Whether the device is online, uploading queued entries, or offline. */
  connectivity: ConnectivityState;
  setConnectivity: (state: ConnectivityState) => void;

  // ── Storage ──────────────────────────────────────────────────────────────────

  /** How much of the device's storage is being used. Drives the gauge on the home screen. */
  storageInfo: StorageInfo | null;
  setStorageInfo: (info: StorageInfo) => void;

  // ── Contribution count ───────────────────────────────────────────────────────

  /** How many words this person has contributed in total — shown on the home screen. */
  totalContributions: number;
  incrementContributions: () => void;
  setTotalContributions: (count: number) => void;

  // ── Pending sync count ───────────────────────────────────────────────────────

  /** How many entries are saved on the device but not yet uploaded to the server. */
  pendingCount: number;
  setPendingCount: (count: number) => void;
}

// ── Store ──────────────────────────────────────────────────────────────────────

/** Creates the global store. All screens read from and write to this single object. */
export const useAppStore = create<AppState>((set) => ({
  // Starting values before anything has loaded
  isInitialising:     true,
  contributor:        null,
  connectivity:       'offline', // Assume offline until we confirm otherwise
  storageInfo:        null,
  totalContributions: 0,
  pendingCount:       0,

  // Functions that update the state
  setIsInitialising:      (v) => set({ isInitialising: v }),
  setContributor:         (contributor) => set({ contributor }),
  setConnectivity:        (connectivity) => set({ connectivity }),
  setStorageInfo:         (storageInfo) => set({ storageInfo }),
  setTotalContributions:  (totalContributions) => set({ totalContributions }),
  setPendingCount:        (pendingCount) => set({ pendingCount }),

  /** Adds 1 to the contribution count without needing to know the current total. */
  incrementContributions: () =>
    set(state => ({ totalContributions: state.totalContributions + 1 })),
}));

// ── Selectors ──────────────────────────────────────────────────────────────────
// Helper functions that pull a specific piece of state.
// Using these prevents a screen from re-rendering when unrelated state changes.

/** Returns true if the person has already registered and completed onboarding. */
export const selectIsOnboarded = (state: AppState): boolean =>
  state.contributor !== null;

/** Returns true when the device is too full to accept new recordings (90%+ used). */
export const selectIsStorageBlocked = (state: AppState): boolean =>
  state.storageInfo?.isBlocked ?? false;

/** Returns true when storage is getting full but not yet blocked (70–90% used). */
export const selectIsStorageWarning = (state: AppState): boolean =>
  state.storageInfo?.isWarning ?? false;
