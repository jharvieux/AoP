import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  registerForPushNotifications,
  onTurnNotification,
  onPushTokenRegistered,
} from './pushNotifications'

// Mock getNativePlugin to avoid importing it (so tests run without Capacitor)
vi.mock('./nativeBridge', () => ({
  isNativePlatform: vi.fn(() => false),
  getPlatform: vi.fn(() => 'web'),
  getNativePlugin: vi.fn(() => undefined),
}))

// Re-import after mocking so we get the mocked version
import * as nativeBridge from './nativeBridge'

describe('pushNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('registerForPushNotifications', () => {
    it('is a no-op on web (non-native platform)', async () => {
      // Default mock: isNativePlatform() returns false
      await registerForPushNotifications()
      // Should not call getNativePlugin or any plugin methods
      expect(nativeBridge.getNativePlugin).not.toHaveBeenCalled()
    })

    it('returns early if isNativePlatform is false', async () => {
      vi.mocked(nativeBridge.isNativePlatform).mockReturnValue(false)
      await registerForPushNotifications()
      expect(nativeBridge.getNativePlugin).not.toHaveBeenCalled()
    })

    it('calls getNativePlugin("PushNotifications") when on native', async () => {
      vi.mocked(nativeBridge.isNativePlatform).mockReturnValue(true)
      vi.mocked(nativeBridge.getNativePlugin).mockReturnValue(undefined)

      await registerForPushNotifications()
      expect(nativeBridge.getNativePlugin).toHaveBeenCalledWith('PushNotifications')
    })

    it('returns early if the plugin is not registered', async () => {
      vi.mocked(nativeBridge.isNativePlatform).mockReturnValue(true)
      vi.mocked(nativeBridge.getNativePlugin).mockReturnValue(undefined)

      // Should not crash, just return
      await registerForPushNotifications()
      expect(nativeBridge.getNativePlugin).toHaveBeenCalled()
    })

    it('calls requestPermissions and register if plugin exists and permissions granted', async () => {
      const mockPlugin = {
        requestPermissions: vi.fn().mockResolvedValue({ receive: 'granted' }),
        register: vi.fn().mockResolvedValue(undefined),
        addListener: vi.fn(),
      }

      vi.mocked(nativeBridge.isNativePlatform).mockReturnValue(true)
      vi.mocked(nativeBridge.getNativePlugin).mockReturnValue(mockPlugin)

      await registerForPushNotifications()

      expect(mockPlugin.requestPermissions).toHaveBeenCalled()
      expect(mockPlugin.register).toHaveBeenCalled()
      // registration + pushNotificationReceived + pushNotificationActionPerformed
      expect(mockPlugin.addListener).toHaveBeenCalledTimes(3)
    })

    it('returns early if permissions are not granted', async () => {
      const mockPlugin = {
        requestPermissions: vi.fn().mockResolvedValue({ receive: 'denied' }),
        register: vi.fn(),
        addListener: vi.fn(),
      }

      vi.mocked(nativeBridge.isNativePlatform).mockReturnValue(true)
      vi.mocked(nativeBridge.getNativePlugin).mockReturnValue(mockPlugin)

      await registerForPushNotifications()

      expect(mockPlugin.requestPermissions).toHaveBeenCalled()
      expect(mockPlugin.register).not.toHaveBeenCalled()
      expect(mockPlugin.addListener).not.toHaveBeenCalled()
    })
  })

  describe('onTurnNotification', () => {
    it('registers a handler without crashing', () => {
      const handler = vi.fn()
      expect(() => {
        onTurnNotification(handler)
      }).not.toThrow()
    })

    it('accepts a function that receives turn notification data', () => {
      const handler = vi.fn()
      onTurnNotification(handler)

      // The actual dispatch happens when the native runtime sends a notification,
      // which we can't easily trigger in a test without actually mocking the full
      // flow. Here we just verify the handler was registered without error.
      expect(handler).not.toHaveBeenCalled() // Not called until notification arrives
    })
  })

  describe('onPushTokenRegistered', () => {
    // Builds a native-plugin mock that records its event listeners so a test can
    // fire the `registration` event the real Capacitor runtime would emit.
    function nativePluginWithListeners() {
      const listeners = new Map<string, (payload: unknown) => void>()
      const plugin = {
        requestPermissions: vi.fn().mockResolvedValue({ receive: 'granted' }),
        register: vi.fn().mockResolvedValue(undefined),
        addListener: vi.fn((...args: unknown[]) => {
          listeners.set(args[0] as string, args[1] as (payload: unknown) => void)
        }),
      }
      vi.mocked(nativeBridge.isNativePlatform).mockReturnValue(true)
      vi.mocked(nativeBridge.getNativePlugin).mockReturnValue(plugin)
      return { plugin, fire: (event: string, payload: unknown) => listeners.get(event)?.(payload) }
    }

    it('delivers the token from the registration event to the handler', async () => {
      const { fire } = nativePluginWithListeners()
      const handler = vi.fn()
      onPushTokenRegistered(handler)

      await registerForPushNotifications()
      fire('registration', { value: 'device-token-xyz' })

      expect(handler).toHaveBeenLastCalledWith('device-token-xyz')
    })

    it('ignores a registration event with no token value', async () => {
      const { fire } = nativePluginWithListeners()
      await registerForPushNotifications()

      const handler = vi.fn()
      onPushTokenRegistered(handler)
      const callsBefore = handler.mock.calls.length
      fire('registration', {})

      expect(handler.mock.calls.length).toBe(callsBefore)
    })

    it('replays the most recent token to a handler set after registration', async () => {
      const { fire } = nativePluginWithListeners()
      await registerForPushNotifications()
      fire('registration', { value: 'late-token-123' })

      // Handler wired up only now — it should still receive the cached token.
      const lateHandler = vi.fn()
      onPushTokenRegistered(lateHandler)

      expect(lateHandler).toHaveBeenLastCalledWith('late-token-123')
    })
  })
})
