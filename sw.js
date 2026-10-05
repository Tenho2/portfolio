/* EV Multi-Tracker service worker.
 * Caching policy, in one rule:
 *
 *   same-origin, cacheable  -> cache-first (the app shell is versioned)
 *   same-origin navigation -> network-first, falls back to the cached shell
 *   ANY cross-origin request -> network-only, never cached
 *
 * The third rule is the important one. Supabase (sync + auth), Nominatim and
 * OSM tiles (geocoding) and the jsDelivr/unpkg libraries are all cross-origin,
 * so a stale copy of any of them can never be served. Caching them would mean
 * a revoked share, a deleted charging session or an old price silently
 * reappearing on screen. The trade-off is that Chart.js is unavailable while
 * fully offline, which the dashboard already handles by showing a note
 * instead of a chart.
 */

/*
 * BUMP THIS ON EVERY DEPLOY THAT CHANGES ev-tracker.html.
 *
 * The cache name is derived from it, so a new value makes the install handler
 * fetch a fresh shell and the activate handler delete the old one. Leaving it
 * alone is what leaves phones on an old build for weeks: the worker script
 * itself only re-runs when IT changes, and every other asset is served
 * cache-first from a cache nothing ever refreshes. Desktop usually hides this
 * because a navigation is network-first; an installed PWA launched from the
 * home screen can come straight out of the cache without any request at all.
 *
 * Last bumped: 2026-10-02, for panel-level render isolation and visible help
 * text in the vehicle editor.
 */
const VERSION = "v13";
const CACHE = `ev-tracker-shell-${VERSION}`;

const SHELL = [
  "./",
  "./ev-tracker.html",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-maskable.svg",
  "./icons/favicon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll is atomic: one bad path rejects the whole install, which is
      // what we want, because a half-cached shell fails in confusing ways.
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) => name.startsWith("ev-tracker-shell-") && name !== CACHE,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** True when the response may be stored: real, complete, and not no-store. */
function isCacheable(response) {
  if (!response || response.status !== 200) return false;
  if (response.type === "opaque" || response.type === "opaqueredirect")
    return false;
  const control = response.headers.get("Cache-Control") || "";
  if (/no-store|no-cache|private/i.test(control)) return false;
  return true;
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheable(response)) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstShell(request) {
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const cache = await caches.open(CACHE);
      cache.put("./ev-tracker.html", response.clone());
    }
    return response;
  } catch (err) {
    const shell = await caches.match("./ev-tracker.html", {
      ignoreSearch: true,
    });
    if (shell) return shell;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never touch non-GET: Supabase sync, auth and tile POSTs pass straight
  // through, and caching has no meaning for them anyway.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Non-HTTP schemes (chrome-extension:, blob:, data:) cannot be fetched.
  if (!url.protocol.startsWith("http")) return;

  // The critical bypass: Supabase, Nominatim, OSM and every CDN stay
  // network-only so sync and geocoding can never be served stale.
  if (url.origin !== self.location.origin) return;

  // Never cache the worker itself. If it were cache-first the browser could
  // keep running an old worker indefinitely, since updating a worker means
  // re-fetching this very file.
  if (url.pathname === self.location.pathname) return;

  // Range requests (media) must not be answered from the cache.
  if (request.headers.has("range")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

// Let the page trigger an update check after it has been interacted with.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
  /* The Settings panel shows the worker's own version so a phone can confirm it
     actually updated without opening DevTools. Answering from here rather than
     duplicating the string in the page means there is only ever one place to
     bump, which is the mistake that left phones on a stale build before. */
  if (event.data && event.data.type === "which-version") {
    const reply = { type: "version", version: VERSION, cache: CACHE };
    if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
    else if (event.source) event.source.postMessage(reply);
  }
});
