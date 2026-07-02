import { Application } from 'pixi.js'
import { useEffect, useRef, useState, type RefObject } from 'react'

export interface UsePixiAppOptions {
  background?: string
}

export interface UsePixiApp {
  /** Attach to the wrapping <div> — the canvas is appended into it once ready. */
  containerRef: RefObject<HTMLDivElement | null>
  /** undefined until Pixi's async init resolves, and again once torn down. */
  app: Application | undefined
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

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let destroyed = false
    const instance = new Application()

    instance
      .init({
        resizeTo: container,
        background: options.background ?? '#000000',
        antialias: true,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
      })
      .then(() => {
        if (destroyed) {
          instance.destroy(true)
          return
        }
        container.appendChild(instance.canvas)
        setApp(instance)
      })

    return () => {
      destroyed = true
      setApp(undefined)
      if (instance.renderer) instance.destroy(true)
    }
  }, [options.background])

  return { containerRef, app }
}
