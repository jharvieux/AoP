# Visual bible

This document is the shared visual contract for either issue #607 candidate. Direction-specific rendering deltas are called out explicitly; everything else is fixed. It refines Weathered Parchment & Rope without replacing D-023.

## 1. Camera and composition

### World map

- Use a strict overhead or near-overhead atlas camera: nominal pitch 80–90° downward, no visible sky, no horizon, and no perspective convergence that changes gameplay distances.
- Geography owns the lowest layer. Coastline, shallows, reefs, vegetation, roads, and decorative terrain may add depth but must not masquerade as cities, encounters, blocked tiles, movement modifiers, income sites, or combat bonuses.
- Compose at 16:11 for art review, then prove the same world state in 16:10/desktop, 3:4/tablet, 9:19.5/portrait phone, and 16:9 narrow landscape. Responsive views crop or reveal more world; they do not move entities to aesthetically convenient locations.
- Keep the central navigation channel relatively quiet. Place high-frequency shoreline texture near land, not under route nodes or fleet silhouettes.
- Fog is a gameplay layer above terrain and below known friendly UI. It must fully suppress hidden entities and hidden decorative information derived from them at every zoom.

### Harbor city

- Use one horizonless, high-angle three-quarter camera with a nominal 55° depression. Orthographic projection is preferred; weak perspective is acceptable only if a 24 px door at the front is no more than 15% larger than the same door at the back.
- The default frame is exact 16:11. Land rises from the lower-right shoreline toward the top-center town-hall terrace. The economy district sits left, recruitment/right, shipyard at the water, and fortification across the front approach.
- Town hall is the primary P0 anchor. The shoreline is the secondary compositional anchor. A fully built city must read as one inhabited harbor, not a tray of unrelated icons.
- The city backdrop contains only terrain, water, shoreline, roads, vegetation, and subtle empty foundations. Constructed buildings, fortifications, docks that encode a constructed shipyard, flags, names, values, selection, and UI are separate layers.
- Every construction subset uses the same camera, shoreline, roads, plot positions, light, and depth order. Empty areas are deliberate breathing room, not unfinished holes.

### Direction deltas

| Property     | A — Chartmaker's Gouache                   | B — Gilded Harbor Diorama                                   |
| ------------ | ------------------------------------------ | ----------------------------------------------------------- |
| Spatial read | Flatter atlas planes and broad silhouettes | Sculpted terraces and stronger overlap/depth                |
| Edge         | Selective ink contour, 1–2 px at runtime   | Painted value edge; ink only on tiny semantic icons         |
| Texture      | Sparse paper tooth, broad matte wash       | Layered brush texture, material microdetail on focal assets |
| Shadow       | Short, soft, graphic contact shapes        | Soft ambient occlusion plus restrained cast shadow          |
| Ornament     | Parchment/wood, almost diagrammatic        | Dark wood with thin brass keylines                          |

Neither direction may change object anchors, gameplay hit areas, fog behavior, or theme IDs.

## 2. Scale, depth, and anchors

The [city production diagram](contracts/city-scale-depth-anchor-1600x1000.webp) is the coordinate reference.

- Author city art at 2048×1408 and evaluate a 1024×704 runtime export. Record each object's normalized bottom-center contact anchor `(x, y)` relative to that reference frame.
- At 1024×704, representative doors should read at approximately 18–24 px and ambient people at 12–18 px. A building may exceed its plot visually, but its contact point and interaction bounds remain stable.
- Use explicit depth groups before baseline sorting: P0 elevated civic anchor; P1 shoreline/shipyard; P2 district buildings; P3 front curtain/fortification. Within a group, sort by recorded baseline, never incidental DOM order.
- Contact shadows are independent soft multiply layers aligned to the contact baseline. Do not bake a square or circular ground tile into a cutout.
- Fortification visuals upgrade by replacement, not stacking. Palisade, armory/fortress, grand arsenal/citadel treatments may visually supersede predecessors while their existing game-state entries and content IDs remain intact.
- Keep at least 8 px transparent safety around meaningful alpha at runtime size. Decorative smoke or rigging may enter the safety band only if losing it cannot change identity.

## 3. Light and atmosphere

- Global key light comes from northwest/top-left at roughly 35° elevation. Lit planes are warm; shadow planes receive cool blue-green ambient bounce from sky and water.
- Use a broad soft penumbra. At runtime scale, a city building's cast-shadow transition should usually occupy 4–10 px; tiny map tokens rely on contact shadow rather than long cast shadows.
- Reserve the highest highlights for water glints, pale limestone edges, and selected brass. White paint is warm and weathered, never pure white.
- Atmospheric depth is value separation, not blur. Front assets have the strongest value range; distant/top-terrace assets lose 5–10% contrast, not silhouette clarity.
- Weathering accumulates beneath eaves, around waterlines, at timber joints, and on windward cloth. Avoid random grunge laid uniformly over all materials.

## 4. Palette and contrast

Application chrome continues to use existing theme variables. Art may vary locally but must harmonize with these anchors:

| Role              | Reference             | Use                                                      |
| ----------------- | --------------------- | -------------------------------------------------------- |
| Ink               | `#2c1810`             | Primary dark, wood-panel text structure                  |
| Action accent     | `#c8962c`             | D-023 primary action and focus accent                    |
| Brass/status gold | `#c9a227`             | Metal glints, selected rings, status emphasis            |
| Rust              | `#7a2e1a`             | Danger support, cloth/roof family, sparing warm contrast |
| Parchment family  | `#cbb17a` / `#f3e5c2` | Panels, labels, warm light                               |
| Deep sea          | `#1b4a6b`             | Deep water and cool shadow family                        |
| Shallows          | `#2a6a8f`             | Coastal water and ambient bounce                         |
| Land              | `#4a7c3f`             | Mid-value vegetation/terrain anchor                      |
| Fog               | `#0b1a26`             | Explored frontier mask                                   |
| Danger            | `#a6402f`             | Enemy/danger state, always paired with shape             |

- Use warm sand to separate land from blue-green water at a glance. A pale surf line may reinforce the edge but cannot be the only separation.
- Preserve a minimum 3:1 local value contrast between a map token and the terrain directly under its silhouette. Add a restrained halo/contact plate when terrain cannot provide it.
- HUD and panel body copy target WCAG AA contrast. Decorative display text never carries essential state alone.
- The grayscale sheet is a falsifier: ownership crests, fleet classes, route phases, selected objects, and panel hierarchy must remain identifiable without hue.

## 5. Material vocabulary

- **Water:** deep blue-green body, turquoise shallows, warm reflected light near sand, and sparse directional glints. Large waves establish flow; avoid uniform repeated wave stamps at close zoom.
- **Land and sand:** warm olive/earth body with broad value masses. Sand is sun-warmed parchment rather than saturated yellow. Use no biome color that can be mistaken for ownership.
- **Vegetation:** clustered dark masses with a few directional fronds or canopy highlights. Keep central city plots clear and map routes readable.
- **Shoreline and rock:** pale limestone or weathered gray stone with the brightest value break at surf contact. Direction B may model more strata; Direction A simplifies to two or three planes.
- **Roads and foundations:** compacted warm earth, slightly lighter than land, with low contrast. Foundations are irregular prepared clearings, never bright UI circles in production art.
- **Docks and timber:** warm brown heartwood, cool dark joints, salt-bleached horizontal surfaces, and restrained moss at the waterline. Plank scale must agree across buildings.
- **Stone:** warm limestone on lit faces, cool gray-green shadow, dark mortar only where it helps scale. Avoid sterile white castle stone.
- **Cloth and flags:** woven matte cloth with directional folds; faction pattern and cut are readable before color.
- **Brass:** small, high-value warm accents on actionable chrome and prestige structures. It is a punctuation mark, not a full trim pass.
- **Rope:** warm desaturated fiber with a clear twist only at city close-up; map-scale rope becomes a simple line.

## 6. Painterly edge and detail density

- Detail hierarchy is `silhouette → value plane → material cue → microdetail`. Stop before microdetail if the preceding level does not survive at target size.
- Map terrain carries low-to-medium frequency detail. City focal buildings may carry medium-to-high frequency detail, but adjacent ground remains calm.
- Paint through edges, then selectively recover important contours. Never apply a uniform outline to every rock, leaf, plank, and roof tile.
- At 375 px phone width, permanent world labels are removed. Selection or focus may reveal one short label in a safe overlay; the inspector carries long names and values.
- Do not use text produced inside generative art. Names, numbers, heraldry, and iconography are authored vector/raster overlays with known source provenance.

## 7. Faction identity

Ownership must work without red/green discrimination:

- Pair a stable city/fleet silhouette with flag cut, high-contrast pattern, and outer ring treatment.
- Own: dark swallowtail or established faction flag, small light device, brass ring.
- Enemy: pale pennant with diagonal rust slash, broken/double ring.
- Neutral: no raised flag, stone/parchment crest, single muted ring.
- Faction-specific production art may vary banners, trim, roof accents, sail devices, and one silhouette cue. It must not recolor the entire city or terrain.
- Preserve the period-authentic vector flags and current faction/ship-class keys. Do not ask an image model to generate final flag geometry.

## 8. Map semantic zoom

The [map LOD diagram](contracts/map-token-lod-1600x930.webp) is authoritative. Camera zoom changes presentation, never visibility truth.

### Strategic: 0.08–0.39×

- Show coast silhouette, city ownership crest, fleet strength/class pennant, explored/fog frontier, and current selection.
- Token marks render at approximately 12–18 px. Collapse detailed ships and buildings to authored silhouettes.
- Hide terrain decals, wake detail, long labels, encounter illustrations, and route-node decoration.

### Normal: 0.40–1.49×

- Show 24–40 px city/fleet tokens, class silhouettes, encounter/site shape, route with current/later turn break, selection ring, and on-demand label.
- This is the default judging size represented in both candidate frames.
- Route dots use brass for the current turn and cool slate for later turns. A larger outlined break node communicates the transition without color alone.

### Close: 1.50–3.00×

- Show 40–64 px painted token art, restrained wake/contact shadow, terrain decals, and selected/hovered labels.
- Preserve hit target size independent of painted bounds. Do not reveal hidden objects or higher-detail hidden terrain under fog.
- Decorative variants may change brush texture, rock grouping, or canopy silhouette only. They may not imply nonexistent modifiers.

## 9. Typography and labels

- Runtime display face remains **Pirata One**, title case, for short screen/city headings only.
- Runtime body face remains **Cabin** at weights 400–700. Use tabular numerals for resources, costs, turns, and counts.
- The styleframe compositor uses Georgia and Trebuchet as local render proxies because it does not load runtime web fonts; those proxy fonts are not a proposal.
- Minimum rasterized reference size is 12 px at 1×; default UI text is 14–16 px. Phone headings may scale down only if they remain single-line and legible.
- Labels sit on parchment or dark-wood surfaces with intentional padding. Avoid permanent black pills over every city building.
- Use sentence case for instructions, title case for proper names, and uppercase only for short categories/status chips.

## 10. Icon and interaction grammar

- Core icons are filled silhouettes at 16–24 px with at most one interior cut. Fine line art is reserved for 32 px and above.
- Default state: normal value and one structural border.
- Hover: brighten the subject or border by approximately 8% over 150–180 ms; do not move layout.
- Selected: persistent two-ring brass treatment plus a subtle subject lift. One ring is solid and one diffuse; it cannot depend on animation.
- Keyboard focus: static 2 px high-contrast outline outside the hit area. Never reuse hover as the only focus cue.
- Disabled: reduce saturation and contrast while keeping text readable; retain the underlying silhouette.
- Danger: rust outline plus warning geometry/icon. Never red alone.
- Route preview and range overlays remain translucent enough to preserve terrain but opaque enough to read in grayscale.
- Reduced-motion mode removes bob, pulse, sweep, and parallax while retaining every static cue. Default transitions stay within 150–220 ms.

## 11. Responsive composition

### Desktop: 1024 px and wider

- Map: full-width canvas, top HUD, bottom command dock, right navigation, bottom-right minimap, and one contextual notice at upper left.
- City: 16:11 scene left and persistent management panel right. Bottom strip holds city navigation and non-critical summary values.

### Tablet: 600–1023 px

- Map: retain top resources, bottom command dock, right navigation, and minimap; crop world around the selected fleet without moving entities.
- City: show the full 16:11 scene above a wide management card. A 14–18 px overlap may visually connect the card to the selection without obscuring the anchor.

### Portrait phone: below 600 px

- Map: use the selected fleet as the crop focus, keep resources in two compact rows, and remove permanent entity labels. Four primary commands remain reachable at the bottom.
- City: show a 258 px-deep scene preview, then a full-width inspector sheet. The selected ring remains visible in the preview; management actions stay at the sheet bottom.

### Narrow landscape

- Preserve at least 44 px vertical command targets. Collapse the resource HUD to icon/value pairs and move the city inspector to a 38–44% right rail.
- If height falls below 420 px, hide the minimap before shrinking map tokens or body text. The city scene may crop top vegetation, never the shoreline/shipyard or selected anchor.

Across all sizes, safe-area insets apply to top HUD, navigation, command dock, and modal actions. Ornament yields before content or touch-target size.

## 12. Dynamic city states

- Starting state: town hall plus barracks; empty prepared plots and road network make growth legible.
- Midgame: town hall, tavern, shipyard, sawmill, trade house, barracks, garrison hall, and palisade; several future plots remain open.
- Full: all existing construction entries are represented; higher fortification art visually replaces lower tiers so the foreground remains coherent.
- The proof labels “2 built,” “8 built,” and “14 built” refer to game-state entries. A replacement fortification can make fewer than 14 independent silhouettes visible.
- State transitions should add or replace separable layers. Do not crossfade to a baked full-city background.

## 13. Ornament ceiling

- One outer frame, one primary panel edge, and one selected-state flourish are enough. Rope knots, compass motifs, rivets, and torn parchment corners are optional and never repeated on every nested control.
- Keep gold/brass below roughly 8% of chrome area. Large gold fills are reserved for the primary action.
- The map and city painting remain the highest-detail and highest-area visual elements on screen.
