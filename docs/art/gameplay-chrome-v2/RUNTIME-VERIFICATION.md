# Gameplay chrome v2 — runtime verification

This report binds the #610 runtime implementation to the approved Direction B checkpoint. It deliberately does **not** claim the final capture gate: the supervisor will capture and inspect the exact rebased commit in the in-app browser after fonts and art assets finish loading.

## Implemented contract

| Intent                     | Runtime token                                            | Value                           | Primary runtime consumers                                             |
| -------------------------- | -------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| Primary action and focus   | `--color-action`, `--stroke-focus`                       | `#c8962c`                       | filled primary commitments, focus-visible outline, checkbox accent    |
| Selection and status brass | `--color-brass`, `--stroke-selected`                     | `#c9a227`                       | selected rings, resource/cost emphasis, map port and own-city markers |
| Highlight                  | `--color-highlight`                                      | `#f0cb66`                       | hover lift, viewport indicator, urgent text                           |
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
- `MapCanvas`, `Minimap` and `MapEditorCanvas` use `--color-brass` with the exact `#c9a227` non-DOM fallback. No camera, render-loop, terrain, LOD, fog, gesture, action or minimap behavior changed.

## Fail-loud census

- CSS-to-canvas bridge: **40 calls / 31 distinct properties / 0 undeclared / 0 fallback mismatches**.
- The former `--accent`, `--accent-2`, `--accent-glow` and `--color-gold` declarations are absent. Action/focus and brass/selection remain intentionally distinct.
- Every replaced control is vector geometry using `currentColor`; the containing button retains its accessible name. The #610-owned source set has no raw `+`, `−`, `×`, `✓`, `•`, `⌖` or `⛶` control node.
- `CityScene.tsx` is intentionally unchanged. Its existing previous/next/zoom glyph consumers are a #612 city-interaction follow-up; the shared vector family already exports `previous`, `next`, `zoomIn` and `zoomOut` for that migration.
- Minimap keyboard/pointer behavior remains a #613 follow-up. This change only aligns its visual frame and semantic brass fallback.

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
| CSS                         |  47.27 KiB |   9.33 KiB | 850 / 260 KiB |
| App entry                   | 641.74 KiB | 187.04 KiB | 850 / 260 KiB |
| Pixi vendor                 | 537.84 KiB | 155.60 KiB | 850 / 260 KiB |
| Largest remaining app chunk | 447.01 KiB | 146.56 KiB | 850 / 260 KiB |

No static asset was added. Existing `apps/web/public/art/ui` totals **161,783 bytes**; its largest file is `skull-emblem.svg` at **118,320 bytes**, below the 300 KiB per-asset ceiling. The authored vector family is code-only; `uiIcons.ts` is 6,147 bytes before final formatting.

## Verification run

- Web focused chrome tests: 6 files, 32 tests passed.
- Shared tests: 5 files, 57 tests passed.
- Engine tests: 37 files, 765 tests passed.
- Web tests: 98 files, 827 tests passed.
- All package and web TypeScript projects passed.
- Web production build passed and emitted the budget values above.
- `node compose.mjs` followed by `node validate.mjs` validates deterministic proof regeneration, semantic source/proof parity, 18 proof controls, the 40/31 runtime token census, vector markers, raw-glyph removal and GameScreen/MatchScreen parity.

The literal `pnpm verify` wrapper was attempted, but pnpm rejected the isolated worktree's read-only dependency links with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. Equivalent repository-owned formatter, TypeScript, Vitest and Vite commands then passed against the existing lockfile installation. The integration owner must run the literal wrapper again after rebase and before push.

## Final runtime capture gate — pending

Capture these from the exact integrated head, not from this writer's dirty worktree:

1. `runtime-phone-world-375x812.png`: 375 × 812, selected fleet and course, resources, minimap and full command dock visible.
2. `runtime-city-inspector-1440x900.png`: 1440 × 900, city open with a selected building inspector and command chrome visible.
3. `runtime-interaction-states-1440x960.png`: keyboard focus plus representative hover, pressed, selected and disabled states.

Before each capture, await `document.fonts.ready` and every visible image's `complete` state. Record exact viewport dimensions, map/city playable-art rectangle, and the union of opaque chrome rectangles. The acceptance measurement is `(opaque chrome union − required DOM rows) / playable-art rectangle`; inspect that compact overlays remain restrained and that no panel unintentionally covers a selectable entity. Native-size legibility and all 44 px targets must be checked from the resulting pixels. Final capture approval remains operator-owned.
