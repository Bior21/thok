/**
 * public/sw.js — Thok service worker
 *
 * Makes the app shell load with no network, completing the "offline-capable
 * PWA" promise. The IndexedDB data layer already works offline; this adds the
 * missing piece — the HTML/JS/CSS needed to *boot* the app when offline.
 *
 * STRATEGY (dependency-free, robust against hashed filenames):
 *
 *   Navigations (HTML)  → network-first, fall back to cached page, then to '/'.
 *     Keeps users on fresh content when online; still boots when offline.
 *
 *   Static assets       → stale-while-revalidate.
 *     (_next chunks, CSS, fonts, icons, manifest) Serve instantly from cache,
 *     refresh in the background. Hashed names mean cached chunks never go stale.
 *
 *   Everything else      → passthrough (never cache Supabase API calls or
 *     signed audio/image URLs — those are dynamic and auth-scoped).
 *
 * Bump CACHE_VERSION to force old caches to be discarded on next activation.
 */

const CACHE_VERSION = 'thok-v1';
const APP_SHELL = ['/', '/onboarding/', '/task/', '/manifest.json'];

// ── Install: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // addAll is atomic — if one fails none cache. Pre-cache best-effort so a
      // single 404 (e.g. a route not yet built) never blocks installation.
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: drop caches from previous versions ─────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle same-origin GET requests. API calls (Supabase), POSTs, and
  // cross-origin signed URLs pass straight through to the network.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first so online users get fresh HTML.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
