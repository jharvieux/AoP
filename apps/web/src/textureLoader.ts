/**
 * Loads and caches textures by URL, kicking off a load at most once per URL and
 * marking the caller's dirty flag so the next tick redraws once a texture lands.
 * Missing/broken assets resolve to no texture forever — the caller's flat-color
 * fallback keeps rendering instead (#115).
 *
 * Theme-pack sprite overrides are inlined as `data:` URLs (see theme/types.ts),
 * unique per pack per asset, and loaded through the same process-global cache as
 * static default art. Nothing ever unloaded them, so switching packs repeatedly
 * accumulated a full decoded texture set per pack (#245). `unloadThemeTextures`
 * releases just the `data:`-keyed entries — static default-art URLs are left
 * cached since they're shared across packs and content-hashed for their own
 * lifetime.
 *
 * Generic over the loader/texture types so this stays unit-testable without a
 * Pixi/canvas environment — MapCanvas.tsx wires it to pixi.js's `Assets`.
 */
export interface AssetLoader<Texture> {
  load(url: string): Promise<Texture>
  unload(url: string): Promise<void>
}

function isThemeDataUrl(url: string): boolean {
  return url.startsWith('data:')
}

export interface TextureLoader<Texture> {
  getTexture(url: string): Texture | undefined
  unloadThemeTextures(): void
}

export function createTextureLoader<Texture>(
  assets: AssetLoader<Texture>,
  markDirty: () => void,
): TextureLoader<Texture> {
  const cache = new Map<string, Texture>()
  const pending = new Set<string>()
  // Bumped by unloadThemeTextures so an in-flight load for a data: URL that's
  // already been unloaded doesn't resurrect it in the cache when it resolves.
  let epoch = 0

  function getTexture(url: string): Texture | undefined {
    const cached = cache.get(url)
    if (cached) return cached
    if (!pending.has(url)) {
      pending.add(url)
      const loadEpoch = epoch
      assets
        .load(url)
        .then((texture) => {
          if (isThemeDataUrl(url) && loadEpoch !== epoch) return
          cache.set(url, texture)
          markDirty()
        })
        .catch(() => {
          // Leave unresolved; the flat-color fallback keeps rendering this asset's slot.
        })
    }
    return undefined
  }

  function unloadThemeTextures(): void {
    epoch++
    for (const url of cache.keys()) {
      if (!isThemeDataUrl(url)) continue
      cache.delete(url)
      pending.delete(url)
      void assets.unload(url).catch(() => undefined)
    }
    // Also clear any not-yet-resolved data: URL loads so a later re-request
    // (e.g. switching back to a previously-used pack) triggers a fresh load
    // instead of silently deduping against an abandoned one.
    for (const url of [...pending]) {
      if (isThemeDataUrl(url)) pending.delete(url)
    }
    markDirty()
  }

  return { getTexture, unloadThemeTextures }
}
