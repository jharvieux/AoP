// Age of Plunder service worker.
//
// Strategy:
// - Navigation requests (the SPA shell): network-first, falling back to the cached
//   shell when offline, so single-player (all client-side via IndexedDB, see
//   src/storage.ts) keeps working with no network at all.
// - Same-origin static assets (Vite's hashed JS/CSS, audio, icons, manifest):
//   cache-first, populated lazily on first fetch — safe because Vite fingerprints
//   build output by content hash, so a cached entry is never stale for its own URL.
// - Everything else (cross-origin, non-GET — e.g. future multiplayer/Supabase
//   calls) is left untouched and falls through to the network, so it degrades
//   the normal way (a failed fetch) rather than silently serving stale data.
//
// CACHE_VERSION is stamped at build time by vite-plugins/swVersion.ts with a hash of the
// build output, so every deploy gets a new cache name automatically: old caches are pruned
// by the activate handler below, and changing this file's bytes on every deploy is what
// makes the browser notice an update, install the new worker, and hold it in "waiting"
// until the page accepts the prompt wired up in src/registerServiceWorker.ts. In dev
// (`vite`/`vite preview` without a build) this placeholder is served as-is, which is a
// valid (if unversioned) cache name.
const CACHE_VERSION = '__AOP_BUILD_HASH__'
const CACHE_NAME = `aop-cache-${CACHE_VERSION}`
const APP_SHELL = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-maskable.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match('/'))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
