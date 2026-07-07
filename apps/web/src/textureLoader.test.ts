import { describe, expect, it, vi } from 'vitest'
import { createTextureLoader, type AssetLoader } from './textureLoader'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/** Fake pixi.js Assets: `load` resolves to `{ url }` as a stand-in texture, `unload` just
 * records the call. Real loads/unloads are controllable via `resolvers` for ordering tests. */
function fakeAssets(): AssetLoader<{ url: string }> & { unloaded: string[] } {
  const unloaded: string[] = []
  return {
    unloaded,
    load: (url) => Promise.resolve({ url }),
    unload: (url) => {
      unloaded.push(url)
      return Promise.resolve()
    },
  }
}

describe('createTextureLoader', () => {
  it('loads a URL at most once, caching the result once it resolves', async () => {
    const assets = fakeAssets()
    const loadSpy = vi.spyOn(assets, 'load')
    const markDirty = vi.fn()
    const loader = createTextureLoader(assets, markDirty)

    expect(loader.getTexture('/art/tiles/deep.png')).toBeUndefined()
    expect(loader.getTexture('/art/tiles/deep.png')).toBeUndefined()
    expect(loadSpy).toHaveBeenCalledTimes(1)

    await Promise.resolve()
    await Promise.resolve()

    expect(markDirty).toHaveBeenCalled()
    expect(loader.getTexture('/art/tiles/deep.png')).toEqual({ url: '/art/tiles/deep.png' })
    expect(loadSpy).toHaveBeenCalledTimes(1)
  })

  it('unloadThemeTextures releases only data: URL entries, leaving static art cached', async () => {
    const assets = fakeAssets()
    const loader = createTextureLoader(assets, () => undefined)

    loader.getTexture('/art/tiles/deep.png')
    loader.getTexture('data:image/png;base64,AAA')
    await Promise.resolve()
    await Promise.resolve()

    loader.unloadThemeTextures()

    expect(assets.unloaded).toEqual(['data:image/png;base64,AAA'])
    // Static art survives the unload — still cached, no re-fetch.
    expect(loader.getTexture('/art/tiles/deep.png')).toEqual({ url: '/art/tiles/deep.png' })
    // The data: URL is gone from the cache — asking for it again re-triggers a load.
    expect(loader.getTexture('data:image/png;base64,AAA')).toBeUndefined()
  })

  it('marks dirty on unload so the caller redraws without the stale texture', () => {
    const assets = fakeAssets()
    const markDirty = vi.fn()
    const loader = createTextureLoader(assets, markDirty)
    loader.getTexture('data:image/png;base64,AAA')
    markDirty.mockClear()

    loader.unloadThemeTextures()

    expect(markDirty).toHaveBeenCalled()
  })

  it('ignores a resolution for a data: URL that was unloaded before it landed', async () => {
    const { promise, resolve } = deferred<{ url: string }>()
    const unloaded: string[] = []
    const assets: AssetLoader<{ url: string }> = {
      load: () => promise,
      unload: (url) => {
        unloaded.push(url)
        return Promise.resolve()
      },
    }
    const loader = createTextureLoader(assets, () => undefined)

    loader.getTexture('data:image/png;base64,BBB') // starts the (still-pending) load
    loader.unloadThemeTextures() // pack switched away before the load landed

    resolve({ url: 'data:image/png;base64,BBB' })
    await Promise.resolve()
    await Promise.resolve()

    // The stale resolution must not resurrect the texture in the cache.
    expect(loader.getTexture('data:image/png;base64,BBB')).toBeUndefined()
  })

  it('re-requesting a previously unloaded data: URL triggers a fresh load', async () => {
    const assets = fakeAssets()
    const loadSpy = vi.spyOn(assets, 'load')
    const loader = createTextureLoader(assets, () => undefined)

    loader.getTexture('data:image/png;base64,CCC')
    await Promise.resolve()
    await Promise.resolve()
    loader.unloadThemeTextures()

    loader.getTexture('data:image/png;base64,CCC')
    expect(loadSpy).toHaveBeenCalledTimes(2)
  })

  it('preload warms the cache for a batch of URLs before any getTexture call (#300)', async () => {
    const assets = fakeAssets()
    const loadSpy = vi.spyOn(assets, 'load')
    const loader = createTextureLoader(assets, () => undefined)

    await loader.preload(['/art/tiles/deep.png', '/art/tiles/land.png'])

    expect(loadSpy).toHaveBeenCalledTimes(2)
    expect(loader.getTexture('/art/tiles/deep.png')).toEqual({ url: '/art/tiles/deep.png' })
    expect(loader.getTexture('/art/tiles/land.png')).toEqual({ url: '/art/tiles/land.png' })
    // Already warm — no second load kicked off.
    expect(loadSpy).toHaveBeenCalledTimes(2)
  })

  it('marks dirty exactly once per URL whether preload or getTexture triggered the load', async () => {
    const assets = fakeAssets()
    const loadSpy = vi.spyOn(assets, 'load')
    const markDirty = vi.fn()
    const loader = createTextureLoader(assets, markDirty)

    // getTexture asks for it first (still pending)...
    expect(loader.getTexture('/art/tiles/deep.png')).toBeUndefined()
    // ...then preload is asked for the same URL — must dedupe against the same load.
    await loader.preload(['/art/tiles/deep.png'])

    expect(loadSpy).toHaveBeenCalledTimes(1)
    expect(markDirty).toHaveBeenCalledTimes(1)
    expect(loader.getTexture('/art/tiles/deep.png')).toEqual({ url: '/art/tiles/deep.png' })
  })

  it('preload resolves even when one of its URLs fails to load', async () => {
    const assets: AssetLoader<{ url: string }> = {
      load: (url) => (url === 'bad' ? Promise.reject(new Error('nope')) : Promise.resolve({ url })),
      unload: () => Promise.resolve(),
    }
    const loader = createTextureLoader(assets, () => undefined)

    await expect(loader.preload(['bad', 'good'])).resolves.toBeUndefined()
    expect(loader.getTexture('good')).toEqual({ url: 'good' })
    expect(loader.getTexture('bad')).toBeUndefined()
  })
})
