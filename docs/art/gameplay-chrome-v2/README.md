# Gameplay chrome v2 — approved contract

This directory contains the approved visual contract and deterministic review package for [issue #610](https://github.com/jharvieux/AoP/issues/610). The operator approved **Direction B — Gilded Harbor Diorama with the recommended city refinement** before runtime implementation began, then approved the three exact-source runtime captures on 2026-09-04 against the bound runtime-source and capture bytes at `f1dea84d0d489ef52db3944c47748a708ba40004`. The mockups remain non-runtime evidence; the implemented CSS, components, vector primitives, and verification are recorded in [RUNTIME-VERIFICATION.md](RUNTIME-VERIFICATION.md).

## Review at native size

- [Phone world map — 375 × 812](mockups/phone-world-map-375x812.svg)
- [City inspector — 1440 × 900](mockups/city-inspector-desktop-1440x900.svg)
- [Token, type, icon, and state sheet — 1440 × 960](mockups/token-type-icon-sheet-1440x960.svg)
- [Exact-source phone runtime — 375 × 812](runtime-captures/runtime-phone-world-375x812.png)
- [Exact-source city inspector runtime — 1440 × 900](runtime-captures/runtime-city-inspector-1440x900.png)
- [Exact-source runtime interaction states — 1440 × 960](runtime-captures/runtime-interaction-states-1440x960.png)

Open each at 100%. The approved Direction B map/city review sources are embedded only as non-runtime backdrop evidence. All chrome, labels, selection rings, icon marks, numeric values, and panels are locally authored deterministic SVG geometry/text; there are no platform glyph controls, third-party logos, signatures, watermarks, or generated UI art.

## Approved contract

### Semantic vocabulary

The runtime implementation retains `:root` in `apps/web/src/styles.css` as the single source of truth and uses one semantic surface and emphasis vocabulary:

| Intent                   | Runtime token                           | Value / rule                                                                      |
| ------------------------ | --------------------------------------- | --------------------------------------------------------------------------------- |
| canvas / deepest inset   | `--surface-canvas` / `--surface-inset`  | `#17100a` / `#21150d`; gameplay sits over art without opaque covering             |
| panel / raised panel     | `--surface-panel` / `--surface-raised`  | `#2d1b10` / `#3a2416`, 92–96% opacity, low-frequency wood grain only              |
| readable warm surface    | `--surface-parchment`                   | `#f3e5c2`, reserved for labels, sheets, and light panels                          |
| primary action           | `--color-action`                        | `#c8962c`; fills End turn / Commission and is the focus accent                    |
| selection / status brass | `--color-brass`                         | `#c9a227`; thin keyline and two-ring selection, never another filled action color |
| focus                    | `--stroke-focus`                        | `#c8962c`, external static 2 px outline                                           |
| danger / success         | `--color-danger` / `--color-success`    | `#a6402f` / `#477447`, always paired with icon/shape/text                         |
| disabled                 | `--text-disabled` / `--stroke-disabled` | reduced contrast plus a visible slash or label, not opacity alone                 |

Parchment communicates material and readability, not a competing brand color. Action gold identifies the primary commitment/focus. Status brass is reserved for small selected/status details and thin keylines; neither becomes panel fill or decorative clutter. Direction B water, limestone, and timber retain the largest visual area and highest detail density.

Semantic success is `--color-success: #477447`, matching `C.success` in the proof. The brighter `--map-own-unit: #3be2a1` is reserved for own-ship and map-editor start-marker visibility; it is not a success-status color. Success copy uses `--text-success: #b8dab2`.

### Literal color census and proof parity

`compose.mjs` holds every literal color in the semantic `C` vocabulary; no UI drawing string carries an unclassified hex literal. The validator checks every row below against the source and each generated proof, so README, compositor, and output cannot silently drift.

| Source semantic name                                        | Value                             | Rendered consumer(s)                                                                         |
| ----------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| `C.surfaceCanvas`                                           | `#17100a`                         | token-sheet outer canvas                                                                     |
| `C.ink`                                                     | `#21150d`                         | insets, dark panel interior, primary-action text                                             |
| `C.wood` / `C.woodRaised` / `C.woodHover`                   | `#2d1b10` / `#3a2416` / `#51331d` | information panels; default and hover controls                                               |
| `C.surfaceDisabled`                                         | `#33291f`                         | disabled control sample                                                                      |
| `C.parchment` / `C.parchmentHighlight` / `C.parchmentMuted` | `#f3e5c2` / `#fff1ca` / `#cbb17a` | readable copy, hover copy, quiet dividers/material edges                                     |
| `C.textMuted` / `C.textDisabled`                            | `#b9a47b` / `#b4aa9a`             | captions/status copy; disabled label and slash                                               |
| `C.action` / `C.focus`                                      | `#c8962c`                         | filled End turn and Commission; course-confirmation edge; focus outline                      |
| `C.brass` / `C.brassHighlight`                              | `#c9a227` / `#f0cb66`             | thin panel/icon keylines, selection/status ring and resource/cost emphasis; highlight glints |
| `C.fog` / `C.artScrim`                                      | `#0b1a26` / `#07121a`             | map/city backing and restrained art scrim                                                    |
| `C.sea` / `C.land`                                          | `#1b4a6b` / `#4a7c3f`             | minimap illustration only                                                                    |
| `C.danger` / `C.success`                                    | `#a6402f` / `#477447`             | token-sheet semantic samples                                                                 |
| `C.strokeDisabled`                                          | `#796f61`                         | disabled-control border                                                                      |
| `C.courseSurface` / `C.costStroke`                          | `#172939` / `#725838`             | course confirmation surface; quiet cost-card border                                          |

### Type, numbers, and icon language

- **Pirata One** is limited to short branded display headings, city names, and major section headings. It never carries a long instruction or critical numeric value.
- **Cabin** handles body copy, labels, buttons, notices, and all numbers. Resources, movement, counts, turns, and timers use `font-variant-numeric: tabular-nums`.
- Default UI text is 14–16 px; the approved caption floor is 12 px at 1×. No actionable label drops below it.
- The icon family is authored SVG geometry in a shared 20 px optical box (filled subject plus 2 px round structural stroke). It includes ship/fleet, city, route, zoom in/out, fit, back/next, close, and confirm. Controls keep accessible text names; icons do not replace unambiguous multiword actions.

### Controls, state, and safe areas

Every direct control uses a minimum **44 × 44 CSS px** hit area. The phone's route-confirmation action is deliberately **331 × 48 px**, so it remains comfortable without stealing meaningful map area.

- Default: one restrained brass keyline.
- Hover: brightness/keyline lift, 150–180 ms, no layout movement.
- Pressed: darker inset surface, still legible.
- Selected: persistent brass two-ring treatment plus the selected icon/label; it is non-color-only.
- Disabled: lower contrast plus a slash or explicit unavailable wording.
- Focus: external, static 2 px high-contrast outline; hover never substitutes for focus.

HUD, navigation, dock, and sheet actions reserve safe-area inset plus 12 px. Ornament yields before content, text, map/city area, or touch-target size. Reduced-motion mode removes pulse/sweep/parallax while preserving every static state cue.

### Checkpoint control census

The compositor annotates every depicted rectangle that represents a direct control with `data-control`; the validator rejects any width or height below 44 px and logs each geometry. The rendered checkpoint contains:

- phone: 331 × 48 course confirmation, three 44 × 44 map-navigation controls, and four 44 × 44 command-dock controls;
- desktop city: the 44 px End turn, Commission, Previous, and Next city controls;
- state sheet: six 44 px-high reference button states (each 120 px wide).

The following surfaces are intentionally non-interactive review content, not exceptions to the runtime target: resource/HUD readouts, map art, selected-fleet ring/chip, minimap illustration, city art frame, selected-building ring/chip, panel copy, color swatches, and icon specimens. Runtime entity/map hit areas remain governed by the existing interaction implementation and are not represented by static rectangle geometry in this checkpoint.

### GameScreen / MatchScreen parity

The implementation must keep all existing actions and action gating. `GameScreen` and `MatchScreen` consume the same semantic token values, resource order, notice treatment, command-dock hierarchy, map-navigation button component, icon language, focus style, safe-area spacing, and accessible labels. The screens may retain different multiplayer status information, but that information fits the same chrome contract rather than inventing a second visual system.

City uses the same HUD/dock type and panel grammar as map. Its selected-building inspector is a persistent right rail at desktop width; its building art/selection remain distinct runtime layers, consistent with D-049's city amendment. This checkpoint does not propose a baked city scene or a behavior change.

## Files and reproducibility

- `compose.mjs` embeds the approved Direction B source backdrop hashes by local path and writes deterministic self-contained SVG mockups.
- `RUNTIME-INVENTORY.md` records the exact pre-implementation token, glyph, geometry, and local/multiplayer drift census.
- `RUNTIME-CAPTURE-BINDINGS.json` is the conservative schema-v3 evidence boundary. It binds the exact inventory and bytes of every non-test file under `apps/web/src`, every file under the engine/shared/content source trees, the web build entry/config inputs, the complete stylesheet, the two runtime-art receipts and their 96 referenced runtime assets, all three captures, and the explicit default-theme/mounted-screen/city/building/selection state frozen in each frame.
- `build-runtime-capture-bindings.mjs` regenerates that boundary from the repository trees. Any added, removed, renamed, or changed bound file invalidates the evidence. The older selector projections remain diagnostics only; the full `styles.css` hash is acceptance evidence so broad selectors, cascade changes, keyframes, and previously unreferenced Canvas tokens cannot escape.
- `RUNTIME-VERIFICATION.md` records implemented surfaces, test/build budgets, and exact-source evidence.
- `validate.mjs` checks proof dimensions, embedded backdrop evidence, geometry, asset size and contract language, then checks source-binding inventory and drift controls, runtime token parity, icon markers, glyph removal, control states, and local/multiplayer parity; it exits nonzero on failure.
- The final review files are self-contained SVG. They are intentionally not copied into `apps/web/public` and must not be treated as shippable runtime assets.

Backdrop provenance is locked to the merged #607 review sources: `b-gilded-harbor-diorama-map-r1.webp` (`c80a488f0e2c02a4eaaabcc0e4b08fe481cd238bcc44b97dbf89f339e939c9f9`) and `b-gilded-harbor-diorama-full-r3.webp` (`eca94fde3859ed41ad1f8f2469c114c743c11d8861007414107c18f9d98f360d`). The latter remains fortress-heavy reference evidence only. Issue #608 has since delivered the approved layered city amendment; exact-head runtime captures, not this historical checkpoint backdrop, verify the shipping city art.

Run `node compose.mjs && node build-runtime-capture-bindings.mjs && node validate.mjs` from this directory to recreate and validate the package. Run repository formatting afterward if the generated JSON layout changes.

## Approval record

Approved for implementation: parchment readability, `#c8962c` action/focus, `#c9a227` brass status/selection, Cabin-first functional typography with Pirata One only for short headings, 44 px vector-icon controls with explicit states, and Direction B art remaining visually dominant.

The operative evidence boundary for the runtime record below is the complete schema-v3 source-tree inventory, build inputs, full stylesheet, runtime receipts/assets, frozen capture states, and capture bytes; the older scoped CSS projections are diagnostic only.

On 2026-09-04, the operator approved all three exact-source runtime frames at `f1dea84d0d489ef52db3944c47748a708ba40004`; the approval is recorded in [issue #610](https://github.com/jharvieux/AoP/issues/610#issuecomment-5544612671). That approval carries across docs/evidence-only commits only while `RUNTIME-CAPTURE-BINDINGS.json` proves every bound runtime source, CSS projection, asset, and capture byte remains exact; any material bound-byte change requires renewed capture approval.
