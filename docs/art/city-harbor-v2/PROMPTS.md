# Exact built-in image-generation prompts

All calls used the subscription-included OpenAI built-in image generator on 2026-09-03.
The interface did not expose a model identifier, version, sampler, seed, quality switch, or
size switch, so none is invented here. Source dimensions are recorded in `MANIFEST.md`.

## Reference images and roles

- `../commercial-visual-v2/sources/b-gilded-harbor-diorama-full-r3.webp` was the
  style/material/camera/light reference in P1–P9; it was never an edit target. SHA-256:
  `eca94fde3859ed41ad1f8f2469c114c743c11d8861007414107c18f9d98f360d`.
- The original lossless P1 empty-harbor output was the spatial-only Image 2 reference in
  P2–P7 and the edit target in P8. SHA-256:
  `67ad1ce86995f1b6dd9737aa6f25a0065de9a58163dfb8c229ced339fb476154`.
- The retained P7 shipyard source was the edit target in P9. Retained SHA-256:
  `e190306b2a2ee3d03f2489244fedc5a10ea383e1c8b727f8f3110ed22d97fec9`.
- The original lossless P8 corrected-empty-harbor output was the spatial-only Image 2
  reference in P9. SHA-256:
  `3addd21de1c4968e9b61388577f009deeae5cac38b997fb5adef78c997db8ad3`.

## P1 — empty harbor

```text
Use case: stylized-concept
Asset type: source art for a modular 2D strategy-game city backdrop
Input images: Image 1 is a style, material, camera, and lighting reference only; it is not an edit target and none of its buildings, walls, boats, flags, or people may be copied into the new scene.
Primary request: Create a genuinely EMPTY buildable 18th-century Caribbean harbor landscape in the approved Gilded Harbor Diorama direction. This will sit behind separately composited building cutouts.
Scene/backdrop: one coherent gently terraced island harbor ground plane; opaque terrain; luminous blue-green water along the lower-right quarter; pale sand and limestone shoreline; branching dirt roads; six subtle unoccupied foundation clearings matching these normalized scene regions: civic plot centered near x 50% y 27%; tavern plot near x 11% y 40%; economy plot near x 26% y 43%; recruitment plot near x 54% y 55%; low fortification footing near x 33% y 72%; shoreline shipyard footing near x 89% y 84%. The shipyard footing must visibly cross the sand/water boundary without including any dock.
Style/medium: luxurious hand-painted 2D strategy-game diorama; layered gouache and oil-brush texture; dimensional but clearly illustrated; restrained selective detail; no photorealism; no generic mobile-game gloss.
Composition/framing: exact 16:11 landscape intent; horizonless high-angle three-quarter camera looking down about 55 degrees; no sky and no distant horizon; keep every plot fully inside the canvas; coherent scene-scale perspective; land buildings will later be bottom-anchored into the listed plots.
Lighting/mood: northwest/top-left warm sunlight at about 35 degrees; cool turquoise ambient bounce; prosperous but unoccupied.
Color palette: luminous turquoise and deep teal water; sun-warmed limestone; parchment earth; muted olive vegetation; restrained coral roof-color traces only in natural debris, not roof shapes.
Materials/textures: sculpted limestone, weathered timber road edging only where natural, sand, compacted earth, sparse perimeter palms and wind-bent coastal scrub.
Constraints: absolutely no constructed buildings, houses, huts, towers, walls, gates, docks, piers, cranes, boats, ships, sails, flags, banners, signs, people, animals, text, numbers, UI, selection rings, logos, signatures, or watermarks. No object may imply a built or owned gameplay state. Roads and empty foundations only. No rectangular decorative border. Opaque background, not transparent.
```

## Building-prompt assembly rule

For P2–P7, the exact submitted prompt was the asset-specific block followed by one newline
and the common block. There was no other text.

### Common cutout block

```text
Input images: Image 1 is the approved Gilded Harbor Diorama style/material/camera reference only; Image 2 is the empty harbor spatial reference only. Neither is an edit target.
Style/medium: luxurious hand-painted 2D strategy-game building cutout; layered gouache and oil-brush texture; dimensional but clearly illustrated; coherent warm limestone, weathered timber, red clay tile and weathered shingles, tiny restrained brass accents; premium commercial game art, not photorealistic and not glossy generic mobile-game 3D.
Camera: horizonless high-angle three-quarter orthographic-like view looking down about 55 degrees, consistent with Image 2; show roof and two front-facing planes; bottom-center contact anchor.
Lighting: northwest/top-left warm sunlight at about 35 degrees with cool turquoise ambient bounce from lower-right; soft natural contact shading.
Transparency: genuinely transparent background with straight clean alpha; preserve fine roof, chimney, railing, rope, hoist, sign, and timber edges; at least 8% transparent safety margin.
Constraints: one isolated building only; no terrain island, no rectangular or oval base, no road, no water, no sky, no scenery, no people, no boats unless structurally part of the shipyard subject, no flags, no banners, no letters, no numbers, no UI, no selection ring, no logo, no signature, no watermark.
```

The barracks, fortification, and shipyard submissions used the same common block with the
first constraint sentence changed to `one isolated constructed element only` and the
fine-edge list shortened to `roof, timber, rope and rigging edges`; those exact
substitutions are shown below.

## P2 — town hall asset block

```text
Use case: stylized-concept
Asset type: modular city building cutout — town hall
Primary request: A dignified 18th-century Caribbean colonial town hall that reads immediately as a civic anchor without reading as a fortress: broad two-storey limestone body, open arched loggia, central clockless cupola/belfry, balanced stair, deep civic doorway, warm red-tile roof, restrained timber galleries. Moderate height and welcoming civic proportions; no battlements, cannon, curtain wall, gatehouse, defensive tower, or oversized keep. Strong distinctive silhouette at phone scale.
Composition/framing: isolated square source canvas; subject fills about 76% of width and 82% of height; full footprint visible; centered bottom-center contact point.
```

## P3 — tavern asset block

```text
Use case: stylized-concept
Asset type: modular city building cutout — tavern
Primary request: A crooked, welcoming 18th-century harbor tavern with an unmistakable hospitality silhouette: low asymmetric timber-framed body, one lively red-shingle gable, covered porch, broad doorway, small projecting bay, two uneven chimneys, stacked casks under the eaves, and one blank hanging wooden sign with absolutely no marks. Intimate and rambling, visibly smaller than a town hall. Strong distinctive silhouette at phone scale.
Composition/framing: isolated square source canvas; subject fills about 80% of width and 72% of height; full footprint visible; centered bottom-center contact point.
```

## P4 — trade house asset block

```text
Use case: stylized-concept
Asset type: modular city building cutout — trade house economy building
Primary request: A prosperous 18th-century Caribbean trade house that reads clearly as commerce rather than housing or military: broad two-storey counting house and compact attached warehouse, arcaded loading frontage, canvas awnings with no lettering, exterior hoist beam, cargo crates and rolled sailcloth tucked strictly inside the physical footprint, split warm limestone and dark timber materials, long low roofline. No crane tall enough to compete with the shipyard. Strong distinctive silhouette at phone scale.
Composition/framing: isolated square source canvas; subject fills about 84% of width and 72% of height; full footprint visible; centered bottom-center contact point.
```

## P5 — barracks asset block

```text
Use case: stylized-concept
Asset type: modular city building cutout — barracks recruitment building
Primary request: A practical 18th-century Caribbean harbor barracks that reads immediately as recruitment rather than commerce or civic authority: compact L-shaped limestone-and-timber quarters, one taller square watch stair, long shaded weapons veranda, open drill-yard gate integrated within the footprint, orderly weapon racks and two small training dummies tucked under the eaves, weathered shingle roof with a restrained red-tile ridge. Lower and tougher than the town hall, with a strong asymmetrical military silhouette; no curtain wall, battlements, cannons, fortress gate, insignia, or soldiers.
Composition/framing: isolated square source canvas; subject fills about 82% of width and 72% of height; full footprint visible; centered bottom-center contact point.
```

P5 used the exact common-block substitutions printed under P6.

## P6 — stone wall asset block

```text
Use case: stylized-concept
Asset type: modular city fortification cutout — stone wall segment
Primary request: A restrained evolving-perimeter fortification element for an 18th-century Caribbean harbor: one long, low warm-limestone curtain-wall segment with a central open archway, weathered timber parapet walk, two modest rounded end turrets no taller than one storey above the wall, subtle moss and chipped stone. It must read clearly as a perimeter upgrade without dominating the city; no keep, no giant gatehouse, no castle mass, no cannons, no attached buildings.
Composition/framing: isolated wide subject on a square source canvas; subject fills about 86% of width and 46% of height; full base line visible; centered bottom-center contact point.
```

Exact common block substitutions for P6:

```text
Transparency: genuinely transparent background with straight clean alpha; preserve fine roof, timber, rope and rigging edges; at least 8% transparent safety margin.
Constraints: one isolated constructed element only; no terrain island, no rectangular or oval base, no road, no painted water, no sky, no scenery, no people, no flags, no banners, no letters, no numbers, no UI, no selection ring, no logo, no signature, no watermark.
```

## P7 — shipyard asset block

```text
Use case: stylized-concept
Asset type: modular city building cutout — shoreline shipyard
Primary request: A distinctive 18th-century Caribbean shoreline shipyard designed to straddle sand and open water: timber pier on high pilings, unmistakable inclined drydock cradle with a partial wooden sloop hull under construction, one tall but slender timber shear-leg crane, rope blocks, stacked spars and a compact red-shingle shipwright shed. The drydock, hull ribs, pier silhouette, and crane must remain individually readable at phone scale. Include only structural boats/hull under construction; no floating completed vessel. No terrain or painted water; pilings and slipway end cleanly for placement across the shoreline.
Composition/framing: isolated square source canvas; subject fills about 84% of width and 80% of height; shoreward attachment toward upper-left and waterward pilings toward lower-right; full footprint and all rigging visible; bottom-center contact anchor at the near end of the slipway.
```

P7 used the same two exact common-block substitutions printed under P6.

## P8 — corrected empty harbor

```text
Use case: edit-image
Asset type: corrected empty modular 2D strategy-game city backdrop
Input images: Image 1 is the edit target. Image 2 is style/material/camera/light reference only and is not an edit target.
Primary request: Preserve Image 1 exactly except for one narrowly localized correction to the lower-right shoreline. Extend the existing pale sand-and-warm-limestone coast and the nearby EMPTY shipyard foundation footing diagonally downward/right into the normalized current shipyard slot region x 80%–99%, y 75%–99%, so a separately composited shipyard jetty placed in that slot can visibly begin on dry shore and extend over water with no open-water gap. The natural shore/footing should reach approximately x 82%, y 78% and taper into luminous water; it must look geologically continuous with the existing coast, not like a rectangular island. Keep luminous turquoise/deep-teal water around the waterward side.
Preservation: Keep the same 16:11 landscape intent, exact horizonless high-angle three-quarter camera, scene scale, northwest light, layered gouache/oil-brush finish, roads, all six empty plot clearings, vegetation, rocks, and every non-target region. Do not move, add, remove, redesign, or repaint any other plot or terrain feature.
Hard constraints: the result must remain a genuinely EMPTY opaque terrain/coast/road/foundation layer. Absolutely no buildings, houses, huts, walls, gates, docks, piers, planks, pilings, cranes, boats, ships, sails, flags, signs, people, animals, text, numbers, UI, selection rings, logos, signatures, or watermarks. The extended shipyard footing is unoccupied natural sand/limestone only.
```

P8 became the active backdrop source after native compositing confirmed that P1's lower-right
coast did not reach the unchanged shipyard slot.

## P9 — corrected shoreline shipyard

```text
Use case: edit-image
Asset type: corrected modular city building cutout — shoreline shipyard
Input images: Image 1 is the edit target. Image 2 is a spatial reference showing the corrected lower-right shore and immutable shipyard-slot relationship. Image 3 is style/material/camera/light reference only. Images 2 and 3 are not edit targets.
Primary request: Preserve Image 1's shipwright shed, partial sloop hull and ribs, drydock cradle, pier decks, pilings, stacked spars, winch, ropes, and tall slender shear-leg crane. Add one clear, narrow, raised timber shore-access gangway from the rear/right (upper-right) deck, running diagonally toward and reaching the upper-right edge of the subject canvas. It must read as the landward connection into Image 2's nearby pale sand-and-limestone coast when the asset is bottom-anchored inside the current lower-right shipyard slot. Keep the existing lower-left inclined slipway as the waterward launch side. The new upper-right gangway needs visible planks, two slim support posts, and simple rope rails; it must be shorter and visually quieter than the drydock/crane.
Composition: keep the same horizonless 55-degree high-angle three-quarter camera and northwest light. Keep the complete subject inside a square source canvas with the upper-right gangway reaching approximately 96% of canvas width and 18% of canvas height. Preserve strong phone-scale drydock, hull-rib, shed, crane, and landward-gangway silhouettes. Do not rotate or mirror the whole shipyard.
Transparency: genuinely transparent background with straight clean alpha; preserve fine timber, rope, rigging, hook, rail, and piling edges; at least 3% transparent safety margin.
Hard constraints: one isolated constructed element only; no terrain island, no rectangular or oval base, no road, no painted water, no sea, no waves, no sky, no scenery, no people, no completed or floating vessel, no flags, no banners, no letters, no numbers, no UI, no selection ring, no logo, no signature, no watermark. Do not remove the structural half-built hull.
```

P9 became the active shipyard source. It preserves the drydock/waterward slip and adds the
short upper-right gangway that crosses onto P8's dry shore within the exact current slot.

## Rejected transparency correction

P2–P7 requested genuine alpha, but the service rendered a pale checker into RGB. A second
built-in background-extraction call was made for P2–P4 using each output as the edit target.
It preserved the subject but again returned RGB checker art, so those three retry files are
rejected and not retained. The repeated exact template was:

```text
Use case: background-extraction
Asset type: modular strategy-game building cutout
Input images: Image 1 is the edit target.
Primary request: Remove only the pale gray-and-white checkerboard background from Image 1 and replace it with genuine transparent alpha. The checkerboard is not part of the art. Preserve the [town hall | tavern | trade house] itself exactly: identical architecture, silhouette, proportions, materials, brushwork, camera, lighting, colors, details, and framing.
Transparency: actual RGBA transparency, not a painted checkerboard, not white, not gray. Clean anti-aliased edges with no halo. Preserve fine roof, chimney, railing, rope, hoist, sign, and timber edges. Remove the detached diffuse floor shadow outside the physical footprint so a separate contact-shadow layer can be authored later.
Constraints: change only background and detached floor shadow; do not redesign, crop, rotate, resize, relight, simplify, add, or remove any part of the building; no terrain, no base, no text, no flag, no UI, no logo, no signature, no watermark.
```

The retained cutouts instead use the repository's `rembg` IS-Net semantic-mask workflow,
followed by largest-subject-component hardening, a narrow soft-edge reconstruction, and
interior-color extension through that edge. The reviewed masks are retained under
`masks/`; `tools/build_subject_masks.py` and `tools/compose_checkpoint.py` reproduce the
process.
