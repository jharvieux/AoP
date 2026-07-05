import { getNativePlugin, isNativePlatform } from './nativeBridge'

/**
 * Native push registration for "your turn" notifications (#42).
 *
 * Scaffolding only: the real `@capacitor/push-notifications` plugin isn't
 * installed yet (see docs/runbooks/capacitor-native.md for why, and the
 * exact commands to finish wiring this up once an operator approves the new
 * dependency + the native iOS/Android projects exist). Everything here goes
 * through `getNativePlugin`, which reads the plugin off Capacitor's runtime
 * plugin registry by name rather than importing the package, so this module
 * type-checks and no-ops harmlessly on web today.
 *
 * Once `@capacitor/push-notifications` is installed and the native projects
 * are generated, swap the body of each function below for the typed
 * equivalent from the package (e.g. `PushNotifications.requestPermissions()`)
 * — the public API of this module (register/onTurnNotification) shouldn't
 * need to change for callers.
 */

export type TurnNotificationHandler = (payload: { matchId?: string }) => void

/** Invoked with the device's push token once native registration succeeds. */
export type PushTokenHandler = (token: string) => void

const PLUGIN_NAME = 'PushNotifications'

let turnHandler: TurnNotificationHandler | undefined
let tokenHandler: PushTokenHandler | undefined
// The `registration` event can fire before the app wires up its handler (e.g.
// AuthContext mounts after startup calls registerForPushNotifications). Cache
// the most recent token so a late-arriving handler still receives it.
let lastToken: string | undefined

/**
 * Requests permission and registers this device for native push. Safe to
 * call unconditionally at app startup — it's a no-op on web and a no-op on
 * native until the PushNotifications plugin is actually present in the
 * native build.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (!isNativePlatform()) return

  const plugin = getNativePlugin(PLUGIN_NAME)
  if (!plugin) {
    // Native shell exists but the plugin hasn't been added to the native
    // project yet (see scripts/capacitor/setup.sh) — nothing to do.
    return
  }

  const permission = (await plugin.requestPermissions?.()) as { receive?: string } | undefined
  if (permission?.receive !== 'granted') return

  await plugin.register?.()

  plugin.addListener?.('registration', (registration: unknown) => {
    const token = (registration as { value?: string } | undefined)?.value
    if (token) dispatchToken(token)
  })
  plugin.addListener?.('pushNotificationReceived', (notification: unknown) => {
    dispatchTurnNotification(notification)
  })
  plugin.addListener?.('pushNotificationActionPerformed', (action: unknown) => {
    const notification = (action as { notification?: unknown } | undefined)?.notification
    dispatchTurnNotification(notification)
  })
}

/**
 * Registers the single handler invoked when a "your turn" push arrives or is
 * tapped. There's no match/multiplayer screen in the web client yet (that's
 * tracked separately) — wire the real navigation-to-match behavior here once
 * it exists.
 */
export function onTurnNotification(handler: TurnNotificationHandler): void {
  turnHandler = handler
}

/**
 * Registers the handler invoked with the device's push token once native
 * registration succeeds — wire this to persist the token (see pushTokenStore).
 * If a token was already captured before the handler was set, it fires
 * immediately with the cached value.
 */
export function onPushTokenRegistered(handler: PushTokenHandler): void {
  tokenHandler = handler
  if (lastToken !== undefined) handler(lastToken)
}

function dispatchTurnNotification(notification: unknown): void {
  const data = (notification as { data?: { matchId?: string } } | undefined)?.data
  turnHandler?.(data?.matchId === undefined ? {} : { matchId: data.matchId })
}

function dispatchToken(token: string): void {
  lastToken = token
  tokenHandler?.(token)
}
