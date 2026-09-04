# Gameplay chrome v2 — pre-implementation census

Baseline: `09a68ce2a51e918911af9bbbe1b819d3bcbb4e92` (approved checkpoint)

This bounded census records the runtime defects reproduced before the #610 implementation. It is intentionally limited to gameplay chrome and the CSS-to-canvas color bridge.

## Token bridge

- 40 `cssToken()` calls consume 31 distinct CSS properties.
- 9 properties are not declared in `:root`: `--map-sand`, `--map-shore`, the three `--map-land-encounter-*` colors, and the four `--map-land-site-*` colors.
- 2 fallbacks do not exactly match the declaration: `--color-text-on-gold` (`#1a1408` fallback vs `#2c1810`) and `--color-white` (`#ffffff` fallback vs shorthand `#fff`).
- `--accent: #c8962c` names the action/focus role while `--color-gold: #c9a227` ambiguously names the selection/status brass role. The values are intentionally different but the names do not express that distinction.

## Platform glyphs

The owned gameplay path renders platform-dependent text glyphs for controls or state:

- `MapCanvas`: zoom in/out, center fleet, and fit map (`+`, `−`, `⌖`, `⛶`).
- `BottomSheet`: close (`×`).
- `GameScreen` and `MatchScreen`: disembark count decrement/increment (`−`, `+`).
- `GameScreen`: city constructed/idle status (`✓`, `•`).

`CityScene` also renders previous/next and zoom controls with `‹`, `›`, `−`, and `+`. That file belongs to the #612 city-interaction lane and is recorded as an explicit downstream consumer; #610 supplies the shared vector exports and corrects its shared CSS target sizes without editing its behavior.

## Direct-control geometry

Existing shared gameplay CSS establishes 44 px primary/secondary/danger buttons and a 44 × 44 sheet close target, but the following controls fail the approved minimum:

- map navigation buttons: 40 × 40 px;
- city-roster entries: 32 px minimum height;
- city garrison actions: 40 px minimum height;
- city zoom controls: 44 × 32 px;
- checkbox row: 24 px minimum height.

The city building targets and city-cycle controls already have 44 × 44 minimums. The minimap is larger than 44 px in both axes for supported maps, but its pointer/keyboard behavior remains owned by #613.

## GameScreen / MatchScreen drift

Both screens already share the `.game-screen-container`, `.hud`, `.turn-info`, `.map-container`, `.turn-event-feed`, `.sail-interrupt-banner`, `.selection-info`, `.bottom-action-bar`, and generic button classes. They still duplicate the header and command-dock markup, use raster action icons independently, and do not expose an explicit shared chrome contract for tests.

Feature differences are intentional and must remain: single player has Saves, autosave status, idle-city guidance, and a multi-city roster; multiplayer has turn timing, Diplomacy, Chat, Leave, submission state, and network errors. The implementation aligns their visual/state contract without equalizing these actions or their enabled/disabled rules.
