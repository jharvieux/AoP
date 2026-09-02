/**
 * Registers the PWA service worker (public/sw.js) and reports when an updated
 * worker has installed and is waiting to take over. `onUpdateAvailable` is
 * called with an `apply` function — call it (from a user-initiated "Reload")
 * to activate the new worker, which reloads the page via the controllerchange
 * listener below.
 */
export function registerServiceWorker(onUpdateAvailable: (apply: () => void) => void) {
  const serviceWorker = navigator.serviceWorker
  if (!serviceWorker) return

  window.addEventListener('load', () => {
    serviceWorker.register('/sw.js').then((registration) => {
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          // A controller already exists, so this "installed" worker is an update
          // to an existing install rather than the very first registration.
          if (installing.state === 'installed' && serviceWorker.controller) {
            onUpdateAvailable(() => installing.postMessage({ type: 'SKIP_WAITING' }))
          }
        })
      })
    })
  })

  let reloadedForUpdate = false
  serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForUpdate) return
    reloadedForUpdate = true
    window.location.reload()
  })
}
