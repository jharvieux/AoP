# Native on-device QA checklist (#160)

The device-in-hand pass for the Capacitor native shell: IAP, safe areas, and gestures.
This is the `needs-human-fix` half of #160 — it requires real hardware, store accounts,
and TestFlight/Play-beta builds, none of which exist in the agent sandbox. Each failed
item becomes its own small fix issue (label it with the finding, reference #160).

**Prerequisites** (in dependency order — none of these existed when this checklist was
written): #156 (Capacitor deps + `ios/`/`android/` projects; blocked on operator approval
for the runtime deps, see `docs/runbooks/capacitor-native.md`), then #159 (CI debug
builds), then store setup (App Store Connect / Play Console accounts, a TestFlight /
internal-testing track).

## What is already covered by automated tests (do not re-verify by hand)

The web-side shims all degrade to no-ops without the native runtime and are unit-tested:

| Area                                  | Harness                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------- |
| IAP no-op/degradation, product wiring | `apps/web/src/monetization/iap.test.ts`                                    |
| Entitlement grant/read                | `apps/web/src/monetization/entitlements.test.ts`                           |
| Haptics degradation on web            | `apps/web/src/haptics.test.ts`                                             |
| Native bridge detection               | `apps/web/src/plugins/nativeBridge.test.ts`                                |
| Push registration/routing             | `apps/web/src/plugins/pushNotifications.test.ts`, `pushTokenStore.test.ts` |
| Android back handling                 | `apps/web/src/plugins/androidBackButton.test.ts`                           |
| Turn push wire shape                  | `apps/web/src/multiplayer/turnPush.test.ts`                                |

What the device pass verifies is the part tests cannot: the real native runtime injecting
`window.Capacitor`, real store sandboxes, real notches, and real OS gesture recognizers.

## 1. IAP — remove-ads purchase (`apps/web/src/monetization/iap.ts`)

Run on both platforms with a **sandbox/test store account**, never a real card.

- [ ] `isNativePlatform()` returns true inside the shell; the IAP path is offered instead
      of the Stripe web checkout.
- [ ] Purchase flow completes in the store sandbox; OS purchase sheet appears and returns
      control to the app afterwards.
- [ ] **Known gap, verify it fails loudly, not silently**: server-side receipt
      verification does not exist yet (see the header comment in `iap.ts` — the
      verification Edge Function needs store credentials). Until it ships, a purchase
      must NOT silently grant `remove_ads` client-side. File the verification function
      as its own issue the moment devices are available.
- [ ] Cancel mid-purchase: app returns to a sane state, no entitlement granted, no stuck
      spinner.
- [ ] Restore purchases (fresh install, same store account): entitlement comes back.
- [ ] Airplane mode during purchase: clear error, retry works after reconnect.
- [ ] Ads actually disappear everywhere `AdSlot` renders (between-turns placement) once
      the entitlement is granted.

## 2. Safe areas and display cutouts

The CSS side shipped in #42/#97: `viewport-fit=cover` (`index.html`),
`env(safe-area-inset-*)` padding on `.app` (`styles.css:28`) and on bottom sheets
(`styles.css:550`), `overscroll-behavior: contain` on `.screen`/`.sheet`.

Test on at least: one notched iPhone, one iPhone with Dynamic Island, one Android with a
punch-hole camera and gesture nav enabled.

- [ ] HUD header (`.hud`) is not clipped by the notch/island in portrait.
- [ ] Bottom action bar sits above the home indicator / gesture bar; buttons are fully
      tappable, not half-covered.
- [ ] Bottom sheets (`BottomSheet.tsx`: city, battle, encounter, saves, diplomacy, chat)
      respect the bottom inset when fully open AND while being dragged.
- [ ] Landscape both rotations: left/right insets applied, map canvas fills the remainder
      with no letterboxing or overflow.
- [ ] Keyboard-open (chat input): the input stays visible above the keyboard; layout
      restores cleanly on dismiss.
- [ ] No rubber-band overscroll exposing the WebView chrome behind a fully-scrolled sheet.

## 3. Gestures

`MapCanvas` uses Pointer Events with `touch-action: none`; Android back is intercepted by
`plugins/androidBackButton.ts` (single-screen state machine — back must never exit the
app from a sub-screen).

- [ ] Map pan/pinch-zoom works with two fingers without triggering OS back-swipe or
      app-switcher gestures.
- [ ] Pan starting near the left/right screen edge does NOT trigger iOS back-swipe or
      Android gesture-nav back (this is the classic WebView conflict — if it fires, the
      fix is a system-gesture-exclusion inset, file it).
- [ ] Android hardware/gesture back: from every sub-screen returns toward the menu; from
      the menu itself, backgrounds the app (never a dead tap).
- [ ] Tile tap accuracy at min and max zoom: taps select the intended tile (fat-finger
      check on a small phone).
- [ ] Sheet drag-to-dismiss does not fight with map pan underneath it.
- [ ] No 300ms tap delay anywhere (buttons feel immediate).
- [ ] Haptics fire on the wired feedback points (tap/impact/coin/combat) and are absent
      when the OS-level system haptics toggle is off.

## 4. Push notifications (adjacent, verify while devices are in hand)

- [ ] Push permission prompt appears once, at a sensible moment (not on first launch
      before any match exists).
- [ ] With the app killed: a turn advance in a multiplayer match produces a system
      notification (requires FCM/APNs credentials — `_shared/push.ts` header).
- [ ] Tapping the notification opens the app and routes to the match
      (`plugins/pushNotifications.ts` `onTurnNotification` → the match screen).

## Reporting

One finding = one issue, labeled `phase:4`, body links the checklist item and names the
device/OS. Fixes are normal sweep material; re-run only the affected section afterwards.
