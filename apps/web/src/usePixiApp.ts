import { Application, TextureSource } from 'pixi.js'
import { useEffect, useRef, useState, type RefObject } from 'react'

// Explicit scaling policy for the stylized-2D map/battle art (#300 — a repo grep for
// scaleMode/roundPixels/nearest/pixelArt previously had zero hits, meaning Pixi's own
// defaults were doing this by accident). This is painterly generated art, not pixel art, so
// 'linear' — Pixi's existing default — is the correct filter; set explicitly so the choice
// reads as deliberate and survives a future Pixi default change. `TextureSource.defaultOptions`
// is a process-global applied to every texture loaded afterward, so this is set once here
// rather than per-texture at each call site.
TextureSource.defaultOptions.scaleMode = 'linear'

export interface UsePixiAppOptions {
  background?: string
}

export interface UsePixiApp {
  /** Attach to the wrapping <div> — the canvas is appended into it once ready. */
  containerRef: RefObject<HTMLDivElement | null>
  /** undefined until Pixi's async init resolves, and again once torn down. */
  app: Application | undefined
  /**
   * Set once `Application.init()` rejects (#241) — e.g. WebGL context
   * creation failed (blacklisted GPU, exhausted contexts, some WebViews).
   * Callers should render a fallback instead of an empty canvas div, since
   * `app` will otherwise just stay `undefined` forever with no other signal.
   */
  error: Error | undefined
}

/** Coerces whatever `Application.init()` rejects with into a real Error — a
 * rejection reason isn't guaranteed to be an `Error` instance (e.g. some WebGL
 * context-creation failures reject with a bare string or DOMException). */
export function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason))
}

/**
 * Owns the async Pixi `Application.init()` / teardown lifecycle so
 * canvas-heavy components don't each reimplement it (#7 — the inline
 * version in MapCanvas was fragile to extend). Callers get a ready-to-use
 * `Application` and build their own scene graph on top in a `useEffect`
 * keyed on `app`.
 */
export function usePixiApp(options: UsePixiAppOptions = {}): UsePixiApp {
  const containerRef = useRef<HTMLDivElement>(null)
  const [app, setApp] = useState<Application | undefined>(undefined)
  const [error, setError] = useState<Error | undefined>(undefined)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let destroyed = false
    const instance = new Application()
    setError(undefined)

    instance
      .init({
        // Explicit WebGL preference (#241): broadest device compatibility —
        // some browsers' WebGPU implementations are still partial/buggy, and
        // an explicit choice here is more predictable than Pixi's own
        // auto-detection when we're about to report init failure as fatal.
        preference: 'webgl',
        resizeTo: container,
        background: options.background ?? '#000000',
        antialias: true,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
        // Snaps every sprite/container's final screen position to a whole device pixel
        // (#300) — panning/zooming the map otherwise lands stylized sprites at sub-pixel
        // offsets that shimmer frame to frame as the linear-filtered sample point drifts.
        roundPixels: true,
      })
      .then(() => {
        if (destroyed) {
          instance.destroy(true)
          return
        }
        container.appendChild(instance.canvas)
        setApp(instance)
      })
      .catch((reason: unknown) => {
        if (destroyed) return
        const err = toError(reason)
        console.error('Pixi Application.init() failed', err)
        setError(err)
      })

    return () => {
      destroyed = true
      setApp(undefined)
      if (instance.renderer) instance.destroy(true)
    }
  }, [options.background])

  return { containerRef, app, error }
}
