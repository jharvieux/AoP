import { describe, it, expect, beforeEach, vi } from 'vitest'
import { registerBackButtonHandler } from './androidBackButton'

// Mock getNativePlugin to avoid importing it (so tests run without Capacitor)
vi.mock('./nativeBridge', () => ({
  isNativePlatform: vi.fn(() => false),
  getPlatform: vi.fn(() => 'web'),
  getNativePlugin: vi.fn(() => undefined),
}))

// Re-import after mocking so we get the mocked version
import * as nativeBridge from './nativeBridge'

describe('androidBackButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('registerBackButtonHandler', () => {
    it('returns a no-op cleanup function on web', () => {
      const handler = vi.fn(() => true)
      const cleanup = registerBackButtonHandler(handler)

      expect(typeof cleanup).toBe('function')
      // Should not call the handler immediately
      expect(handler).not.toHaveBeenCalled()
      // Cleanup should not crash
      expect(() => cleanup()).not.toThrow()
    })

    it('returns early if isNativePlatform is false', () => {
      vi.mocked(nativeBridge.isNativePlatform).mockReturnValue(false)
      const handler = vi.fn(() => true)

      const cleanup = registerBackButtonHandler(handler)
      expect(typeof cleanup).toBe('function')
      expect(nativeBridge.getNativePlugin).not.toHaveBeenCalled()
    })

    it('returns early if the App plugin does not exist', () => {
      vi.mocked(nativeBridge.isNativePlatform).mockReturnValue(true)
      vi.mocked(nativeBridge.getNativePlugin).mockReturnValue(undefined)

      const handler = vi.fn(() => true)
      const cleanup = registerBackButtonHandler(handler)

      expect(typeof cleanup).toBe('function')
      expect(nativeBridge.getNativePlugin).toHaveBeenCalledWith('App')
    })

    it('calls plugin.addListener("backButton", ...) when plugin exists', () => {
      const mockListener = { remove: vi.fn() }
      const mockPlugin = {
        addListener: vi.fn().mockReturnValue(mockListener),
      }

      vi.mocked(nativeBridge.isNativePlatform).mockReturnValue(true)
      vi.mocked(nativeBridge.getNativePlugin).mockReturnValue(mockPlugin)

      const handler = vi.fn(() => true)
      registerBackButtonHandler(handler)

      expect(mockPlugin.addListener).toHaveBeenCalledWith('backButton', expect.any(Function))
    })

    it('calls handler when back button event fires', () => {
      let backButtonCallback: (() => void) | null = null
      const mockListener = { remove: vi.fn() }
      const mockPlugin = {
        addListener: vi.fn((event, cb) => {
          backButtonCallback = cb
          return mockListener
        }),
      }

      vi.mocked(nativeBridge.isNativePlatform).mockReturnValue(true)
      vi.mocked(nativeBridge.getNativePlugin).mockReturnValue(mockPlugin)

      const handler = vi.fn(() => true)
      registerBackButtonHandler(handler)

      // Simulate a back button press
      expect(backButtonCallback).not.toBeNull()
      ;(backButtonCallback as (() => void) | null)?.()
      expect(handler).toHaveBeenCalled()
    })

    it('calls exitApp if handler returns false (user wants to exit)', () => {
      let backButtonCallback: (() => void) | null = null
      const mockListener = { remove: vi.fn() }
      const mockPlugin = {
        addListener: vi.fn((event, cb) => {
          backButtonCallback = cb
          return mockListener
        }),
        exitApp: vi.fn(),
      }

      vi.mocked(nativeBridge.isNativePlatform).mockReturnValue(true)
      vi.mocked(nativeBridge.getNativePlugin).mockReturnValue(mockPlugin)

      const handler = vi.fn(() => false) // Return false = do exit
      registerBackButtonHandler(handler)

      // Simulate a back button press
      expect(backButtonCallback).not.toBeNull()
      ;(backButtonCallback as (() => void) | null)?.()
      expect(handler).toHaveBeenCalled()
      expect(mockPlugin.exitApp).toHaveBeenCalled()
    })

    it('does not call exitApp if handler returns true (navigation handled)', () => {
      let backButtonCallback: (() => void) | null = null
      const mockListener = { remove: vi.fn() }
      const mockPlugin = {
        addListener: vi.fn((event, cb) => {
          backButtonCallback = cb
          return mockListener
        }),
        exitApp: vi.fn(),
      }

      vi.mocked(nativeBridge.isNativePlatform).mockReturnValue(true)
      vi.mocked(nativeBridge.getNativePlugin).mockReturnValue(mockPlugin)

      const handler = vi.fn(() => true) // Return true = navigation handled
      registerBackButtonHandler(handler)

      // Simulate a back button press
      expect(backButtonCallback).not.toBeNull()
      ;(backButtonCallback as (() => void) | null)?.()
      expect(handler).toHaveBeenCalled()
      expect(mockPlugin.exitApp).not.toHaveBeenCalled()
    })

    it('cleanup function calls listener.remove()', () => {
      const mockListener = { remove: vi.fn() }
      const mockPlugin = {
        addListener: vi.fn().mockReturnValue(mockListener),
      }

      vi.mocked(nativeBridge.isNativePlatform).mockReturnValue(true)
      vi.mocked(nativeBridge.getNativePlugin).mockReturnValue(mockPlugin)

      const handler = vi.fn(() => true)
      const cleanup = registerBackButtonHandler(handler)

      cleanup()
      expect(mockListener.remove).toHaveBeenCalled()
    })
  })
})
