# Runtime asset and export specification

This is the Direction B production handoff for issues downstream of #607. It specifies deliverables and validation; it does not itself authorize runtime implementation beyond each approved child issue and does not change the stored `ThemePack` shape. City assets must preserve the approved depth and material language while reducing fortress dominance and giving the tavern, economy, recruitment, and shipyard clear independent silhouettes.

## 1. Coordinate systems

### City

| Property             | Contract                                                           |
| -------------------- | ------------------------------------------------------------------ |
| Reference aspect     | Exact 16:11                                                        |
| Master scene         | 2048×1408 px, sRGB                                                 |
| Runtime reference    | 1024×704 px                                                        |
| Smallest review      | 375 px viewport with a 375×258 scene crop                          |
| Camera               | Horizonless high-angle three-quarter, nominal 55° depression       |
| Projection tolerance | Door-size front/back variance no greater than 15%                  |
| Anchor               | Normalized bottom-center contact point `(x, y)` in reference scene |
| Light                | Northwest/top-left, nominal 35° elevation                          |

Author each building in place on a 2048×1408 scene guide. Export it tightly cropped after recording the normalized anchor and optical bounds. Do not ship a full transparent scene-sized canvas per building.

The production layout record for every building must include:

- content ID and source filename;
- normalized anchor `(x, y)`;
- trimmed runtime width/height;
- optical bounds inside the trimmed image;
- explicit depth group P0–P3;
- contact-shadow offset and bounds;
- replacement group, if the art supersedes a lower fortification tier;
- native 1024×704 screenshot showing the asset in starting, midgame, or full context.

### Map

| Property                        | Master        | Runtime source                         | Evaluation sizes                              |
| ------------------------------- | ------------- | -------------------------------------- | --------------------------------------------- |
| City/fleet/encounter/site token | 256×256 RGBA  | 64×64 RGBA                             | 24, 32, 40, and 64 px                         |
| Terrain base/decal              | 256×256       | 128×128                                | Current 32 px tile plus 0.08–3.00 camera zoom |
| Faction flag                    | Vector master | Current raster/vector runtime contract | 16, 24, and 40 px                             |

Map token subjects fill 70–78% of the 256 px master with 12.5% optical safety. Use a bottom-center visual anchor for ships/cities and a center anchor for abstract encounter/site marks. Hit areas remain gameplay-derived and may not shrink to painted alpha.

## 2. City layer contract

### Backdrop

The backdrop is opaque RGB and contains only:

- terrain and broad vegetation;
- blue-green water, surf, sand, and rock shoreline;
- roads and subtle unoccupied foundation clearings;
- environmental texture that does not encode constructed state.

It cannot contain a constructed building, wall, shipyard dock, flag, banner, city name, resource value, selection/focus state, unit, or management UI. Ambient boats and people are excluded when their presence could be read as a constructed building or gameplay unit.

### Building cutouts

- Export straight-alpha RGBA, not premultiplied alpha.
- Dilate plausible edge RGB 2 px beneath transparent pixels before resizing so bilinear sampling cannot reveal a white or black matte.
- Keep at least 8 transparent pixels between meaningful alpha and the trimmed runtime edge. Soft smoke and rope wisps may use the band only when clipping them does not affect identity.
- No baked rectangular, circular, or diamond ground plane. Footprint texture belongs in the backdrop; the building may include only contact dirt that stays within its physical footprint.
- Contact shadow is a separate grayscale/alpha or RGBA layer using multiply-style compositing. Its maximum opacity is 32% for Direction A and 38% for Direction B.
- Town-hall faction flag, selection ring, hover lift, focus outline, labels, values, and cooldown/build-state effects are runtime overlays.
- The citadel accessory is a corner tower, not a modern turret. It remains a separate `building:citadel:tower` asset.

### Depth

Resolve depth with the following stable order before baseline sorting:

1. P0: elevated town hall/civic anchor.
2. P1: shoreline and shipyard structures.
3. P2: economy and recruitment districts.
4. P3: front curtain and active fortification replacement.

Within a group, use recorded normalized baseline `y`. Do not rely on array, DOM, request, or load-completion order. A replacement fortification suppresses only its predecessor's visual layer; underlying game-state entries and interaction affordances remain accessible.

## 3. Map layer and variant contract

- Terrain bases describe only geography. Decals may vary canopy clusters, stones, surf, brush grain, and sand texture, but never suggest movement cost, ownership, income, encounter, blockage, or combat advantage.
- Select a decorative variant from a deterministic integer-coordinate hash plus stable terrain/decal identifier. Do not consume engine RNG and do not use `Math.random()`, wall clock, load order, or viewport order.
- A repaint of `(x, y, terrainId, variantVersion)` must choose the same result in saves, replays, and multiplayer clients. Increment a rendering-only `variantVersion` only when intentionally invalidating the visual mapping.
- Fog is composited after terrain/decal selection and before visible tokens. Hidden entities are not decoded, placed, outlined, or represented by close-zoom decoration.
- Current-turn route uses the brass family; later-turn route uses cool slate. A larger outlined break node and dash/rhythm change carry the distinction without color.
- Claimed sites use faction pattern/ring outside the source art. Do not recolor the entire site sprite.

Autotile identifiers retain the existing convention:

- variant 0: `tile:<tileType>`;
- variants 1–15: `tile:<tileType>:edge:<variant>`;
- if a pack does not provide an edge variant, resolve the base `tile:<tileType>` before the flat procedural fallback.

## 4. File names and formats

Use lowercase directories and retain case-sensitive content IDs in the file stem where the existing IDs are camel-cased. Proposed default-art exports:

```text
apps/web/public/art/city/backdrop.webp
apps/web/public/art/city/<buildingId>.webp
apps/web/public/art/city/citadel-tower.webp
apps/web/public/art/city/shadows/<buildingId>.webp
apps/web/public/art/cities/own.webp
apps/web/public/art/cities/enemy.webp
apps/web/public/art/tiles/<tileType>.webp
apps/web/public/art/tiles/<tileType>-edge-<01..15>.webp
apps/web/public/art/encounters/<kind>.webp
apps/web/public/art/sites/<kind>.webp
apps/web/public/art/parties/<factionId>.webp
apps/web/public/art/factions/<factionId>/ship_<shipClassId>.webp
```

Changing a default URL from `.png` to `.webp` is an implementation detail for a dependent issue. It must retain the content ID and fallback chain, update preload inventory atomically, and never alter saved theme-pack keys.

Format policy:

- Opaque painted backdrops/terrain: lossy WebP, quality 82–88, sRGB.
- Transparent painted cutouts: WebP with alpha at quality 88–92 when edge inspection passes; otherwise optimized PNG.
- Small hard-edge flags/icons: SVG or optimized PNG according to the existing consumer. SVG must have a fixed view box and no external references.
- Core chrome icons—fleet, city, course, zoom in/out, fit/overview, and end turn—must use authored geometry rather than Unicode or icon-font characters, with text labels retained for primary commands.
- Strip prompt, workflow, EXIF, thumbnail, and editor metadata from shipped assets. Keep provenance in the repository manifest, not inside runtime images.
- Do not add a runtime dependency to encode, decode, select, or animate art.

## 5. Optimization and budgets

The existing **300 KiB raw per-file ceiling is hard**. No asset receives an allowlist exception.

| Asset class                             |            Target |                                 Hard ceiling |
| --------------------------------------- | ----------------: | -------------------------------------------: |
| Map token, encounter, site, party, ship | ≤96 KiB preferred | ≤128 KiB target requirement; always <300 KiB |
| City building or shadow                 |          ≤180 KiB |                                     <300 KiB |
| City backdrop                           |          ≤260 KiB |                                     <300 KiB |
| Terrain base/decal                      |           ≤96 KiB |                                     <300 KiB |
| Flag/icon                               |           ≤32 KiB |                                     <128 KiB |

Payload budgets are compressed transfer totals, not per-file substitutions:

- initial visible map art: ≤1.5 MiB cold cache, including terrain and visible default tokens;
- city backdrop plus starting-state buildings: ≤900 KiB cold cache;
- additional fully built city art: ≤2.0 MiB, loaded on demand after city entry;
- decoded city art resident at once: target ≤32 MiB; release replaced fortification tiers and offscreen high-resolution sources.

Validate at native size after optimization. Reject an export if alpha fringe, roof rigging, flag shape, token class, or selected outline materially changes even when the byte target is met.

Responsive map composition uses one source-to-screen transform for terrain and every semantic overlay. Store semantic anchors and route samples in source/world coordinates, apply the exact rounded cover scale and crop offset used by the terrain, and derive contextual labels from the transformed anchor plus a deterministic viewport collision offset. Validate every route sample and turn marker against navigable terrain rather than checking endpoints alone. Viewport-relative entity or label placement is invalid even when one screenshot looks correct.

The current theme-upload limits (`maxImageBytes: 500_000`, `maxImageDimension: 256`) are a separate existing user-content contract and remain unchanged. They do not relax the stricter default-art targets above.

## 6. Loading, preload, and fallback

Asset resolution remains:

```text
active theme-pack sprite override
  → default local art URL
    → existing flat-color/CSS/category placeholder
```

Specific rules:

- A non-empty theme-pack override always wins. If it is absent, empty, fails decode, or errors, use the default local art. If default art is absent or errors, keep the current procedural/category fallback visible and interactive.
- Never hide a hit target while art is loading. Reserve final layout bounds before decode so a late image cannot move controls or anchors.
- Warm default visible-map art into the existing texture cache before first paint. Theme-pack data URLs are already in memory but must be decoded before replacing the fallback.
- Map priority: visible terrain/fog prerequisites, selected fleet and visible entities, near-viewport tokens, then offscreen/default catalog.
- City priority on entry: backdrop, town hall, constructed/visible buildings, selected building and panel imagery, then optional ambient layers. Do not fetch unconstructed building art solely to paint the current state.
- Swap fallback to art only after successful decode. On error, restore the fallback and report through the existing diagnostic path without retry loops.
- Keep all default assets same-origin and available to the offline/PWA build. No runtime CDN, remote model endpoint, or network-only font/art dependency.
- A service-worker or versioned-cache update must activate asset references and matching code together. Never leave a new URL pointing to an old cache manifest.

## 7. Immutable theme content IDs

Stored keys use `sprite:<contentId>`, but the content IDs below are the public contract. The `ThemePack` interface is not extended.

### City

```text
cityScene:backdrop
city:own
city:enemy
building:townhall
building:sawmill
building:ironmine
building:distillery
building:tradehouse
building:barracks
building:garrisonHall
building:fortressArmory
building:grandArsenal
building:palisade
building:stoneWall
building:citadel
building:citadel:tower
building:shipyard
building:tavern
```

### Map and faction art

```text
tile:land
tile:port
tile:land:edge:1 ... tile:land:edge:15
tile:port:edge:1 ... tile:port:edge:15

encounter:merchant
encounter:natives
encounter:settlers
encounter:nativeVillage
encounter:hermit
encounter:banditCamp

landSite:mine
landSite:sawmill
landSite:lumberCamp
landSite:ruins

party:pirates
party:british
party:spanish
party:dutch
party:french
```

Faction flag sprite keys remain the unnamespaced faction IDs `pirates`, `british`, `spanish`, `dutch`, and `french`. Ship sprite/name keys remain the unnamespaced class IDs `sloop`, `brigantine`, `frigate`, and `galleon`. Existing faction unit/name keys also remain untouched.

If a future faction-aware default city registry is added, it sits behind `city:own`/`city:enemy`: the active pack override resolves first, then a faction-aware default, then the generic current default, then the flat fallback. It cannot add a stored `ThemePack` field or reinterpret an existing ID.

## 8. Export acceptance checklist

Every production batch must prove:

- exact dimensions, color mode, and file-size budget;
- clean transparent edges on light, dark, land, and water backgrounds;
- recorded bottom-center anchor, depth group, and contact-shadow offset;
- correct northwest light and agreed candidate rendering character;
- identity at 24, 32, and 40 px for map art or 375 px viewport for city art;
- grayscale ownership/selection readability;
- empty, starting, midgame, and full city composition without baked state;
- strategic, normal, and close map hierarchy without fog leakage;
- theme override → default → procedural fallback behavior;
- local/offline loading after a cold-cache install;
- no engine, `GameState`, replay, content balance, or stored-theme schema change.
