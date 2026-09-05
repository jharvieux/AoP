# Gameplay chrome v2 — runtime verification

This report binds the #610 runtime implementation to the approved Direction B checkpoint and the refreshed exact-source runtime evidence after the #612 city-shell change. The operator approved all three refreshed exact-source runtime frames committed at `dc11b60738f4f14b896532bf2db323b2bd054f5c`; the approval is recorded in [issue #610](https://github.com/jharvieux/AoP/issues/610#issuecomment-5551752271). The files were captured on 2026-09-04 against runtime/source head `45a206f760eacce50dc8dd1dc656c5d4e789cb3c`.

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
| CSS                         |  59.02 KiB |  11.20 KiB | 850 / 260 KiB |
| App entry                   | 670.66 KiB | 195.46 KiB | 850 / 260 KiB |
| Pixi vendor                 | 537.84 KiB | 155.60 KiB | 850 / 260 KiB |
| Largest remaining app chunk | 447.01 KiB | 146.56 KiB | 850 / 260 KiB |

The #610 chrome change itself added no static asset. Existing `apps/web/public/art/ui` totals **161,783 bytes**; its largest file is `skull-emblem.svg` at **118,320 bytes**, below the 300 KiB per-asset ceiling. The later #611 terrain assets and their budgets are independently bound by the runtime-art receipt. The authored vector family is code-only; `uiIcons.ts` is 6,147 bytes before final formatting.

## Verification run

- Web focused chrome tests: 6 files, 33 tests passed.
- Shared tests: 5 files, 57 tests passed.
- Engine tests: 37 files, 765 tests passed.
- Web tests: 104 files, 945 tests passed.
- All package and web TypeScript projects passed.
- Web production build passed and emitted the budget values above.
- `node compose.mjs` validates deterministic proof regeneration and semantic source/proof parity. The normal binding builder and validator intentionally remain fail-closed until the refreshed capture approval renews the immutable material anchor.

The isolated writer's first literal wrapper attempt could not replace read-only dependency links and exited with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`; the equivalent repository-owned commands passed there. Independent exact-source verification later ran the literal `CI=true pnpm verify` gate successfully. The refreshed #610/#611/#612 exact-source gate passes Prettier, all five TypeScript projects, 104 web files / 945 tests, 37 engine files / 765 tests, 5 shared files / 57 tests, and the production build.

## Exact-source capture binding

`RUNTIME-CAPTURE-BINDINGS.json` is a conservative schema-v3 boundary containing **215 shipping source files**: 149 non-test files recursively discovered under `apps/web/src`, all 29 engine source files, all 19 shared source files and all 18 content source files. It separately binds **22 web/package build inputs**, including the HTML entry, PWA worker/manifest/icons, workspace/dependency resolution, package exports, TypeScript/Vite configuration and Vite helpers. Exact sorted inventories make an added, removed or renamed shipping file fail, while exact byte counts and SHA-256 values catch content changes in the active shell, theme resolver, helpers, Canvas components and package leaves.

The boundary also binds the full `apps/web/src/styles.css` bytes as acceptance evidence, not merely a hand-selected selector projection. That deliberately conservative choice catches broad selectors, cascade/order changes, keyframes, tokens and future rules even when a selector does not name a gameplay component. The older per-frame selector/token projections remain diagnostic only. An explicit Canvas audit records 34 calls and 28 unique MapCanvas/Minimap tokens; it identifies the 26 values that schema v2 failed to include in its acceptance projection and checks their CSS, typed fallback and call-site fallback parity.

The two runtime-art receipts and all **96** referenced public assets are exact-bound; per-frame asset inventories remain 54 for phone world and 52 for each city frame. Fonts, resource/action art, world tiles, faction flags and every receipt-selected world/city output are covered. The refreshed candidate records the frozen default/no-override theme and mounted `GameScreen` state for each frame: closed city with no selected unit, course, or event feed and a settled home-island fleet cluster; full city with a selected Shipyard in the dedicated right inspector and flagship upgrade rows; and full city with a selected Town Hall in the dedicated right inspector plus focus, hover, collapsed-info, and disabled states.

`RUNTIME-MATERIAL-BASELINE.json` closes the generator trust gap: it is a non-generated anchor containing the `dc11b60` evidence head, a SHA-256 identity for the external capture record and the immutable SHA-256/byte count/census of the complete schema-v3 material projection. The normal builder recomputes and compares that projection before writing `RUNTIME-CAPTURE-BINDINGS.json`; it cannot update the anchor. Consequently, changing a shipping source or inventory and then running the builder stops with material-baseline drift instead of silently carrying the approved capture identity onto new runtime bytes.

The distinct `renew-runtime-capture-baseline.mjs` operation is proposal-only and structurally unable to update either evidence file. It requires a completely clean tracked and untracked worktree, then proves the requested local HEAD equals its same-named upstream, hosted branch and hosted PR head. It computes material and capture facts from the worktree, verifies every recorded file byte against `git show HEAD:path`, and checks the repository state again around the external lookup. It accepts only a resolvable canonical `github.com/jharvieux/AoP/issues/610#issuecomment-N` whose GitHub API `html_url`, issue identity and numeric ID match and whose author association is `OWNER`. The opaque comment body is not machine-interpreted as permission: the utility prints its URL, author and SHA-256 beside the exact head/material/capture facts for manual review.

The utility imports only `readFileSync` from the filesystem API, records before/after hashes for `RUNTIME-MATERIAL-BASELINE.json` and `RUNTIME-CAPTURE-BINDINGS.json`, and fails if either changes. Its output and a GitHub comment are never autonomous authorization. After direct trusted-user approval, a reviewer must compare the opaque comment body to every printed fact and make a separately reviewed manual `apply_patch` to the baseline. Until that patch exists, the normal builder and validator remain fail-closed against the previous anchor and cannot re-bless the proposal.

`validate.mjs` requires exact anchor, schema, tree-policy, source, build-input, stylesheet, receipt, asset, frozen-state, capture and diagnostic inventory equality before recomputing all bytes and hashes. Its failing-direction controls require builder rejection—not merely a different generated manifest—for stale source/capture data, every one of the three broad CSS hiding mutations, the hidden App wrapper and GameScreen root, theme URL resolution, engine ship hull, engine visibility, shared `canAfford`, new source/import inventory, build input, receipt, public asset, capture state, capture bytes and each of the 26 formerly escaping Canvas tokens. Proposal falsifiers reject dirty tracked and untracked state, head divergence, fake/off-repository/wrong-issue/unresolvable records, non-owner association, a reused head or record, and omitted confirmation. Before/after artifact hashes plus a writer-symbol census prove proposal evaluation cannot mutate or re-bless the anchor or binding. There is intentionally no “unrelated CSS” exception in schema v3.

## Operator-approved refreshed runtime capture evidence

The supervisor rebuilt the production preview after the source freeze, waited for the runtime to settle, and native-inspected every frame for font fallback or incomplete or missing imagery before approval. No programmatic font/image await is claimed. These are the approved real runtime frames:

| File                                                                                                  | Dimensions | PNG color type |   Bytes | SHA-256                                                            |
| ----------------------------------------------------------------------------------------------------- | ---------: | -------------: | ------: | ------------------------------------------------------------------ |
| [`runtime-phone-world-375x812.png`](runtime-captures/runtime-phone-world-375x812.png)                 |  375 × 812 |        2 (RGB) |  86,297 | `87349453bf99dc66ff4252f69e727ae40a61b6a016f2e94b8dfd1fb2129e1840` |
| [`runtime-city-inspector-1440x900.png`](runtime-captures/runtime-city-inspector-1440x900.png)         | 1440 × 900 |    3 (indexed) | 242,636 | `e64f66065aa8b165b2af57cde63f05dd1a79d3ab807c22be785f97d2bb7d2523` |
| [`runtime-interaction-states-1440x960.png`](runtime-captures/runtime-interaction-states-1440x960.png) | 1440 × 960 |    3 (indexed) | 283,680 | `3b90fecc8c013c97bbaec22c0dcd45d001f7675a5030a6a6223e68592780e72c` |

The in-app Browser returned JPEG/JFIF payloads despite `.png` names. They were decoded with Pillow 12.3.0 and saved twice byte-identically as real PNGs at unchanged dimensions: the phone frame as truecolor RGB, and the two large city frames as 40-color FASTOCTREE indexed PNGs without dithering so they remain below the evidence budget. The phone's decoded RGB is exact; the indexed frames have measured RGB RMSE 9.3949 and 9.7165. The #612 RGB/JFIF capture set remains the city-art fidelity evidence. These three PNGs total **612,613 bytes**; the largest is 283,680 bytes, so every review capture remains below 300 KiB and no byte belongs to the shipping runtime bundle.

### Measured composition and states

- **Phone world map:** the viewport is 375 × 812 and the playable map rectangle is approximately `[0, 104, 375, 644]`, or 241,500 px². The 104 px HUD and the status/command-dock region at `[0, 724, 375, 88]` are required rows. This settled frame has no selected unit, course, or event-feed entries. Non-required in-map chrome consists of four 44 × 44 navigation controls within `[319, 117, 44, 200]` and the minimap near `[212, 605, 151, 130]`. Their approximate union is 27,230 px², or **11.3%** of playable map area. The frame shows current Direction B terrain, the settled home-island fleet cluster, resources, minimap, and the complete command dock. The smallest direct target is 44 × 44.
- **City inspector:** the viewport is 1440 × 900. The city art occupies the dominant left column while a dedicated right-side Shipyard inspector shows the docked flagship and its Hull, Cannons, Sails, and Crew capacity upgrades. The close and upgrade targets are at least 44 × 44.
- **Interaction evidence:** the viewport is 1440 × 960. A dedicated right-side Town Hall inspector preserves the selected Town Hall context while its close control is keyboard-focused, an info control is hovered but remains collapsed, and Build controls are disabled with their non-color slash. The close, info, and Build targets are all at least 44 × 44. Pressed is inherently transient and is verified by the runtime `:active` rules/tests plus the approved static state sheet; it is not falsely claimed as frozen in this frame.

Native-size inspection found no font fallback, missing image, clipped label, control below 44 × 44, or unintended opaque panel over a selectable map entity. The approval carries across docs/evidence-only commits only while the complete schema-v3 source-tree inventory, build inputs, full stylesheet, runtime receipts/assets, frozen capture states, and capture bytes remain exact; any material bound-byte or inventory change requires renewed capture approval.
