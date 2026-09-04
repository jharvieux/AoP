# Gameplay chrome v2 — runtime verification

This report binds the #610 runtime implementation to the approved Direction B checkpoint and the final exact-source runtime evidence captured after fonts and art assets loaded. The captures and native-size inspection are complete; explicit operator acceptance remains a separate gate and is not claimed here.

## Implemented contract

| Intent                     | Runtime token                                            | Value                           | Primary runtime consumers                                             |
| -------------------------- | -------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| Primary action and focus   | `--color-action`, `--stroke-focus`                       | `#c8962c`                       | filled primary commitments, focus-visible outline, checkbox accent    |
| Selection and status brass | `--color-brass`, `--stroke-selected`                     | `#c9a227`                       | selected rings, resource/cost emphasis, map port and own-city markers |
| Highlight                  | `--color-highlight`                                      | `#f0cb66`                       | hover lift, viewport indicator, urgent text                           |
| Semantic success           | `--color-success`                                        | `#477447`                       | approved success-state shape/fill role                                |
| Success text               | `--text-success`                                         | `#b8dab2`                       | map-editor valid/status copy                                          |
| Own-unit map visibility    | `--map-own-unit`                                         | `#3be2a1`                       | own ships and the map-editor start marker only                        |
| Timber surfaces            | `--surface-panel`, `--surface-raised`, `--surface-inset` | `#2d1b10`, `#3a2416`, `#21150d` | HUD, dock, sheets, buttons and compact overlays                       |
| Parchment text             | `--text-primary`, `--text-secondary`, `--text-muted`     | `#f3e5c2`, `#e7d4ac`, `#b9a47b` | labels, body copy and quiet status                                    |

The root stylesheet also defines semantic overlay/scrim/disabled surfaces; danger, warning and success text; standard/emphasized/selected/focus/disabled/danger strokes; elevation, spacing, radius, type and motion scales. Texture opacity and selection glow are named tokens, not per-selector color literals.

Cabin remains the functional body/button/numeric face, with tabular numerals on resources, movement, rounds and timers. Pirata One is reserved for the brand and sheet/city headings. Action labels do not fall below the 12 px caption floor.

## Production surfaces changed

- `ResourceHud` now exposes named resource values and one shared `GameplayHud` used by both local and multiplayer play.
- `GameScreen` and `MatchScreen` share explicit screen, HUD and command-dock hooks while retaining their existing actions, confirmations and enabled/disabled rules.
- Map navigation, resource chips, course/status overlays, minimap frame, event feed, interruption prompt, city roster, command dock, alerts and bottom-sheet chrome use the same restrained parchment/timber family.
- Bottom sheets expose dialog semantics, a labelled title, initial/restored focus, Escape dismissal and a project-owned close vector without changing drag/backdrop dismissal.
- Map zoom, recenter and fit; sheet close; disembark count; constructed/idle state; End Turn and Attack now use the same deterministic 20 px `currentColor` icon language.
- `MapCanvas`, `Minimap` and `MapEditorCanvas` use `--color-brass` with the exact `#c9a227` non-DOM fallback and `--map-own-unit` with the exact `#3be2a1` visibility fallback. No camera, render-loop, terrain, LOD, fog, gesture, action or minimap behavior changed.

## Fail-loud census

- CSS-to-canvas bridge: **40 calls / 31 distinct properties / 0 undeclared / 0 fallback mismatches**.
- The former `--accent`, `--accent-2`, `--accent-glow` and `--color-gold` declarations are absent. Action/focus and brass/selection remain intentionally distinct.
- Every replaced control is vector geometry using `currentColor`; the containing button retains its accessible name. The #610-owned source set has no raw `+`, `−`, `×`, `✓`, `•`, `⌖` or `⛶` control node.
- `CityScene.tsx` is intentionally unchanged. Its existing previous/next/zoom glyph consumers are a #612 city-interaction follow-up; the shared vector family already exports `previous`, `next`, `zoomIn` and `zoomOut` for that migration.
- Minimap keyboard/pointer behavior remains a #613 follow-up. This change only aligns its visual frame and semantic brass fallback.

The bounded shipping-state census found one persistent DOM selection family: the multi-city roster. Exactly its current city now exposes `aria-current="true"`, while every other roster entry omits the attribute; the GameScreen test changes current city and proves both directions. Map fleet/party selection is a canvas state, not a DOM button state. The reusable city `InfoToggle` already exposes its real boolean `aria-expanded` state. The touched gameplay/city consumers contain **37** native `disabled` bindings (GameScreen 7, MatchScreen 14, CityScene 2, city modals 14); none substitutes a visual class or `aria-disabled` for the native button state, and all receive the shared non-color disabled slash. The missing roster `aria-current` was the only semantic-state defect in this bounded set.

## Control geometry and states

| Control family                                         | Effective minimum                                                  | State evidence                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Map navigation                                         | `44 × 44`                                                          | default, hover, pressed, focus-visible; global non-color disabled slash if disabled                       |
| Primary, secondary and danger actions                  | `44 × 44` minimum; icon-only width is normally `20 + 2×16 = 52` px | default, hover, pressed, focus-visible, explicit disabled surface/stroke/text plus slash                  |
| City roster                                            | `44 × 44` minimum; labelled entries expand naturally               | default, hover, pressed, persistent two-ring selected cue plus status icon/label                          |
| Bottom-sheet close                                     | `44 × 44`                                                          | default, hover, pressed and focus-visible                                                                 |
| Building/garrison/build actions                        | `44 × 44` minimum; rows may expand to full width                   | default, hover, pressed, focus-visible and explicit disabled treatment                                    |
| City building, city-cycle, city-zoom and info controls | `44 × 44`                                                          | default, hover/pressed where applicable, focus-visible, disabled slash, or selected/expanded two-ring cue |
| Disembark checkbox row                                 | `44` px high full-label target                                     | native checked shape plus semantic action accent and focus-visible outline                                |

The static checkpoint validator separately inventories all **18** depicted controls and rejects any width or height below 44 px. Resource readouts, art, status chips, the event feed and the minimap illustration are non-interactive surfaces and are not control exceptions.

## Budgets

Production build output from this worktree:

| Chunk                       |        Raw |       Gzip |         Limit |
| --------------------------- | ---------: | ---------: | ------------: |
| CSS                         |  48.82 KiB |   9.65 KiB | 850 / 260 KiB |
| App entry                   | 652.69 KiB | 190.06 KiB | 850 / 260 KiB |
| Pixi vendor                 | 537.84 KiB | 155.60 KiB | 850 / 260 KiB |
| Largest remaining app chunk | 447.01 KiB | 146.56 KiB | 850 / 260 KiB |

No static asset was added. Existing `apps/web/public/art/ui` totals **161,783 bytes**; its largest file is `skull-emblem.svg` at **118,320 bytes**, below the 300 KiB per-asset ceiling. The authored vector family is code-only; `uiIcons.ts` is 6,147 bytes before final formatting.

## Verification run

- Web focused chrome tests: 6 files, 33 tests passed.
- Shared tests: 5 files, 57 tests passed.
- Engine tests: 37 files, 765 tests passed.
- Web tests: 101 files, 865 tests passed.
- All package and web TypeScript projects passed.
- Web production build passed and emitted the budget values above.
- `node compose.mjs` followed by `node validate.mjs` validates deterministic proof regeneration, semantic source/proof parity, 18 proof controls, the 40/31 runtime token census, vector markers, raw-glyph removal and GameScreen/MatchScreen parity.

The literal `pnpm verify` wrapper was attempted, but pnpm rejected the isolated worktree's read-only dependency links with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. Equivalent repository-owned formatter, TypeScript, Vitest and Vite commands then passed against the existing lockfile installation. The integration owner must run the literal wrapper again after rebase and before push.

## Final runtime capture evidence — captured, operator acceptance pending

The supervisor rebuilt the production preview after the source freeze, waited for the runtime to settle, and native-inspected every frame for font fallback or incomplete or missing imagery before acceptance. These are the resulting real runtime frames:

| File                                                                                                  | Dimensions |   Bytes | SHA-256                                                            |
| ----------------------------------------------------------------------------------------------------- | ---------: | ------: | ------------------------------------------------------------------ |
| [`runtime-phone-world-375x812.png`](runtime-captures/runtime-phone-world-375x812.png)                 |  375 × 812 | 184,381 | `06e830d837b0112c0612ca8e7aa9f9c990907f7628132ce0ebbdc6616fa13bb1` |
| [`runtime-city-inspector-1440x900.png`](runtime-captures/runtime-city-inspector-1440x900.png)         | 1440 × 900 | 228,700 | `15d83da5c065cad5a5b9363d50b2bac11fe830b274d19d11fcb5fb2853fcae13` |
| [`runtime-interaction-states-1440x960.png`](runtime-captures/runtime-interaction-states-1440x960.png) | 1440 × 960 | 279,832 | `9dc5f8aace3163724a87f534677efa2201347155ff27bfe3cf48ff1e4460cdbe` |

All three are true RGB PNGs. They total **692,913 bytes**; the largest is 279,832 bytes, so every review capture remains below 300 KiB and no byte belongs to the shipping runtime bundle.

### Measured composition and states

- **Phone world map:** the viewport is 375 × 812 and the playable map rectangle is approximately `[0, 104, 375, 644]`, or 241,500 px². The 104 px HUD and the status/command-dock region at `[0, 724, 375, 88]` are required rows. Non-required in-map chrome consists of the event feed near `[12, 117, 114, 137]`, four 44 × 44 navigation controls within `[319, 117, 44, 200]`, and the minimap near `[212, 582, 151, 129]`. Their measured union is approximately 42,600 px², or **17.6%** of playable map area. The frame shows current Direction B art, the selected flagship and hex, traveled dotted course, resources, minimap, and the complete command dock. The smallest direct target is 44 × 44.
- **City inspector:** the viewport is 1440 × 900. The city art layer behind the selected Shipyard task is approximately `[306, 181, 812, 488]`; the required building-inspector BottomSheet begins near y=205 and extends to the bottom. The real implementation uses the existing full-width task sheet rather than the checkpoint's aspirational right rail, so the capture demonstrates the shipped inspector surface honestly without claiming that later city-shell layout. Its close and action targets are at least 44 × 44.
- **Interaction evidence:** the viewport is 1440 × 960 and the required Town Hall BottomSheet occupies y=193–960. The capture freezes a 52 × 52 keyboard-focused close control, a 44 × 44 hovered info control, the open/selected Town Hall context, and disabled Build controls with their non-color slash, all at least 44 px high. Pressed is inherently transient and is verified by the runtime `:active` rules/tests plus the approved static state sheet; it is not falsely claimed as frozen in this frame.

Native-size inspection found no font fallback, missing image, clipped label, control below 44 × 44, or unintended opaque panel over a selectable map entity. Final visual approval remains operator-owned.
