/**
 * app/layout.tsx
 *
 * Root layout — wraps every page in the app.
 *
 * Handles global initialisation on first render:
 *   1. Load contributor from IndexedDB → set in store
 *   2. Load aggregate counts (total, pending) → set in store
 *   3. Load storage info → set in store
 *   4. Seed concept cache if empty and online
 *   5. Set up connectivity listeners (online/offline events)
 *   6. Trigger immediate sync if there are pending entries
 *   7. Set isInitialising = false → screens can now render
 *
 * CLEANUP FIX:
 * useEffect cleanup must be a synchronous function. We use module-level
 * refs to hold cleanup callbacks so they're accessible from the cleanup
 * function without returning a promise.
 */

'use client';

import { useEffect, useRef } from 'react';
import { Noto_Sans } from 'next/font/google';
import { useAppStore } from '@/store/app';
import {
  loadContributor,
  getTotalEntryCount,
  getStorageInfo,
  getPendingCount,
  getCachedConcepts,
  saveConcepts,
  loadStreak,
} from '@/lib/db/operations';
import {
  setupConnectivityListener,
  isOnline,
  syncQueue,
} from '@/lib/sync/engine';
import { fetchConcepts } from '@/lib/api';
import './globals.css';

const notoSans = Noto_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const setContributor        = useAppStore(s => s.setContributor);
  const setTotalContributions = useAppStore(s => s.setTotalContributions);
  const setStorageInfo        = useAppStore(s => s.setStorageInfo);
  const setPendingCount       = useAppStore(s => s.setPendingCount);
  const setConnectivity       = useAppStore(s => s.setConnectivity);
  const setIsInitialising     = useAppStore(s => s.setIsInitialising);
  const setStreakCount        = useAppStore(s => s.setStreakCount);

  // Hold cleanup callbacks in refs so the useEffect cleanup function
  // (which must be synchronous) can call them without returning a promise.
  const connectivityCleanupRef = useRef<(() => void) | null>(null);
  const offlineCleanupRef      = useRef<(() => void) | null>(null);

  useEffect(() => {
    async function init() {
      // 1. Load contributor from IndexedDB.
      const contributor = await loadContributor();
      setContributor(contributor);

      // 2. Load aggregate counts and streak.
      const [total, pending, streak] = await Promise.all([
        getTotalEntryCount(),
        getPendingCount(),
        loadStreak(),
      ]);
      setTotalContributions(total);
      setPendingCount(pending);
      setStreakCount(streak.count);

      // 3. Load storage info.
      const storage = await getStorageInfo();
      setStorageInfo(storage);

      // 4. Seed concept cache if online and cache is empty.
      if (contributor && isOnline()) {
        try {
          const cached = await getCachedConcepts();
          if (cached.length === 0) {
            const concepts = await fetchConcepts(contributor.id);
            await saveConcepts(concepts);
          }
        } catch {
          // Non-fatal — will retry on next online startup.
        }
      }

      // 5. Set up connectivity listeners.
      if (contributor) {
        setConnectivity(isOnline() ? 'online' : 'offline');

        // offline event listener.
        const handleOffline = () => setConnectivity('offline');
        window.addEventListener('offline', handleOffline);
        offlineCleanupRef.current = () =>
          window.removeEventListener('offline', handleOffline);

        // online event listener — triggers sync.
        connectivityCleanupRef.current = setupConnectivityListener(
          contributor.id,
          () => setConnectivity('syncing'),
          async (synced) => {
            setConnectivity('online');
            if (synced > 0) {
              // Refresh counts after a successful sync.
              const [newTotal, newPending] = await Promise.all([
                getTotalEntryCount(),
                getPendingCount(),
              ]);
              setTotalContributions(newTotal);
              setPendingCount(newPending);
              const newStorage = await getStorageInfo();
              setStorageInfo(newStorage);
            }
          }
        );

        // 6. Trigger immediate sync if there are pending entries.
        if (isOnline() && pending > 0) {
          setConnectivity('syncing');
          syncQueue(contributor.id)
            .then(async (synced) => {
              setConnectivity('online');
              if (synced > 0) {
                const [newTotal, newPending] = await Promise.all([
                  getTotalEntryCount(),
                  getPendingCount(),
                ]);
                setTotalContributions(newTotal);
                setPendingCount(newPending);
                const newStorage = await getStorageInfo();
                setStorageInfo(newStorage);
              }
            })
            .catch(() => setConnectivity('online'));
        }
      }

      // 7. Done — screens can now render.
      setIsInitialising(false);
    }

    init().catch(err => {
      console.error('[Thok] Init error:', err);
      // Still mark initialisation complete so the app doesn't hang.
      setIsInitialising(false);
    });

    // Synchronous cleanup — called when the component unmounts.
    return () => {
      connectivityCleanupRef.current?.();
      offlineCleanupRef.current?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount.

  // Register the service worker so the app shell loads offline (PWA).
  // Separate effect — independent of app init and safe if init throws.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // In development, NEVER run the service worker — it caches the bundle and
    // hides code changes. Proactively unregister any previously-installed worker
    // and clear its caches so dev always reflects the latest build.
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()));
      if (typeof caches !== 'undefined') {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // Non-fatal — the app still works online without the cache.
      console.error('[Thok] Service worker registration failed:', err);
    });
  }, []);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#1B3A5C" />

        {/* Android PWA */}
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.json" />

        {/* iOS PWA — lets the app run full-screen when added to home screen */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Thok" />
        {/* black-translucent + viewport-fit=cover = content extends under status bar */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* App icon for iOS home screen (shown when user taps Share → Add to Home Screen) */}
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512.png" />

        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
        <title>Thok · Dinka</title>
      </head>
      <body className={`${notoSans.className} bg-slate-900 min-h-screen antialiased`}>
        {/* Constrain to mobile width — readable on tablets too. */}
        <div className="max-w-md mx-auto min-h-screen bg-white text-gray-900 relative">
          {children}
        </div>
      </body>
    </html>
  );
}
