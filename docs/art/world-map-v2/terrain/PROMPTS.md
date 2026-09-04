# Terrain image-generation prompt ledger

These request bodies are reproduced verbatim from the built-in OpenAI image-generation calls
made on 2026-09-04 for issue #611. Every concept request attached
`../../commercial-visual-v2/sources/b-gilded-harbor-diorama-map-r1.webp` as Image 1 solely for
style, material, palette, camera, and lighting. The corrective edit attached only the rejected
L-port output as its edit target.

## land-base-a

```text
Use case: stylized-concept
Asset type: seamless square land terrain base for a 32 CSS-pixel world-map tile in a commercial pirate strategy game.
Input images: Image 1 is the approved Direction B “Gilded Harbor Diorama” style, material, palette, near-overhead camera, and northwest-lighting reference only; do not copy its coastline, objects, buildings, boats, shelters, or composition.
Primary request: create one tileable sun-warmed Caribbean grass-and-earth base, with fine low grass, tiny ochre soil flecks, and broad hand-painted value variation.
Composition: strict orthographic near-overhead 80° camera, no horizon, flat continuous ground covering the full square; every opposite edge must join seamlessly; restrained detail readable at 32 px and clean at 64–96 px.
Style: luxurious hand-painted strategy-map texture, layered gouache and oil-brush grain, warm northwest/top-left key light and cool blue-green ambient influence, premium illustrated game art rather than photorealism or generic 3D.
Constraints: no tree, bush, rock, mountain, clearing, road, path, river, shoreline, water, building, dock, ship, person, animal, text, letters, numbers, signature, watermark, logo, border, UI, tile outline, cast object shadow, or baked gameplay cue.
```

## land-base-b

```text
Use case: stylized-concept
Asset type: seamless square land terrain base for a 32 CSS-pixel world-map tile in a commercial pirate strategy game.
Input images: Image 1 is the approved Direction B “Gilded Harbor Diorama” style, material, palette, near-overhead camera, and northwest-lighting reference only; do not copy its coastline, objects, buildings, boats, shelters, or composition.
Primary request: create a second tileable Caribbean land base, darker and lusher than variant A, with dense short olive grass, muted emerald and moss strokes, and small patches of warm soil showing through.
Composition: strict orthographic near-overhead 80° camera, no horizon, flat continuous ground covering the full square; every opposite edge must join seamlessly; broad low-frequency variation, no central feature, readable at 32 px and clean at 64–96 px.
Style: luxurious hand-painted strategy-map texture, layered gouache and oil-brush grain, warm northwest/top-left key light and cool blue-green ambient influence, premium illustrated game art rather than photorealism or generic 3D.
Constraints: no tree, bush, rock, mountain, clearing, road, path, river, shoreline, water, building, dock, ship, person, animal, text, letters, numbers, signature, watermark, logo, border, UI, tile outline, cast object shadow, or baked gameplay cue.
```

## land-base-c

```text
Use case: stylized-concept
Asset type: seamless square land terrain base for a 32 CSS-pixel world-map tile in a commercial pirate strategy game.
Input images: Image 1 is the approved Direction B “Gilded Harbor Diorama” style, material, palette, near-overhead camera, and northwest-lighting reference only; do not copy its coastline, objects, buildings, boats, shelters, or composition.
Primary request: create a third tileable Caribbean land base, drier and more golden than variants A and B, with straw-green grass, sandy ochre undertones, and subtle rounded brush mottling.
Composition: strict orthographic near-overhead 80° camera, no horizon, flat continuous ground covering the full square; every opposite edge must join seamlessly; broad low-frequency variation, no central feature, readable at 32 px and clean at 64–96 px.
Style: luxurious hand-painted strategy-map texture, layered gouache and oil-brush grain, warm northwest/top-left key light and cool blue-green ambient influence, premium illustrated game art rather than photorealism or generic 3D.
Constraints: no tree, bush, rock, mountain, clearing, road, path, river, shoreline, water, building, dock, ship, person, animal, text, letters, numbers, signature, watermark, logo, border, UI, tile outline, cast object shadow, or baked gameplay cue.
```

## forest-a

```text
Use case: stylized-concept
Asset type: transparent forest decal for a 32 CSS-pixel world-map tile in a commercial pirate strategy game.
Input images: Image 1 is the approved Direction B “Gilded Harbor Diorama” style, material, palette, near-overhead camera, and northwest-lighting reference only; do not copy its terrain or composition.
Primary request: create one isolated compact cluster of three broad tropical hardwood canopies with a few smaller leaves filling the silhouette, clearly a scenic forest accent rather than a gameplay token.
Composition: strict orthographic near-overhead 80° camera, no horizon; centered organic footprint; bold outer silhouette, two or three internal value planes, about 74% subject fill with transparent safety margin; readable at 24–32 px.
Lighting and palette: warm northwest/top-left light, cool blue-green ambient shadow, deep olive and moss green, restrained golden leaf tips, connected soft contact shadow.
Constraints: genuine transparent RGBA, not a drawn checkerboard; no ground plate, grass square, soil square, trunk standing alone, road, water, building, person, animal, text, signature, watermark, logo, UI, border, selection ring, or disconnected shadow.
```

## forest-b

```text
Use case: stylized-concept
Asset type: transparent forest decal for a 32 CSS-pixel world-map tile in a commercial pirate strategy game.
Input images: Image 1 is the approved Direction B “Gilded Harbor Diorama” style, material, palette, near-overhead camera, and northwest-lighting reference only; do not copy its terrain or composition.
Primary request: create a second isolated forest accent with a crescent of two slim palms and two low broadleaf canopies, visibly different from the compact three-canopy forest A.
Composition: strict orthographic near-overhead 80° camera, no horizon; centered asymmetric crescent footprint; bold outer silhouette, two or three internal value planes, about 74% subject fill with transparent safety margin; readable at 24–32 px.
Lighting and palette: warm northwest/top-left light, cool blue-green ambient shadow, deep olive and palm green, restrained golden leaf tips, connected soft contact shadow.
Constraints: genuine transparent RGBA, not a drawn checkerboard; no ground plate, grass square, soil square, road, water, building, person, animal, text, signature, watermark, logo, UI, border, selection ring, or disconnected shadow.
```

## clearing

```text
Use case: stylized-concept
Asset type: transparent scenic clearing decal for a 32 CSS-pixel world-map tile in a commercial pirate strategy game.
Input images: Image 1 is the approved Direction B “Gilded Harbor Diorama” style, material, palette, near-overhead camera, and northwest-lighting reference only; do not copy its terrain or composition.
Primary request: create one isolated irregular warm ochre clearing patch with a soft broken grass edge, sparse short straw tufts, and broad painterly center; it must read as surface variation, not a road or gameplay area.
Composition: strict orthographic overhead surface decal, centered organic footprint, about 72% subject fill with transparent safety; restrained detail readable at 32 px.
Constraints: genuine transparent RGBA, not a drawn checkerboard; no square tile background, tree, bush, rock, road, path continuing off-canvas, water, structure, token, text, signature, watermark, logo, border, UI, or selection ring.
```

## highland

```text
Use case: stylized-concept
Asset type: transparent rocky/highland scenic decal for a 32 CSS-pixel world-map tile in a commercial pirate strategy game.
Input images: Image 1 is the approved Direction B “Gilded Harbor Diorama” style, material, palette, near-overhead camera, and northwest-lighting reference only; do not copy its terrain or composition.
Primary request: create one isolated compact grouping of three low weathered limestone and slate outcrops, one larger angled slab and two smaller companions, unmistakably scenic relief rather than a mountain or blocking obstacle.
Composition: strict orthographic near-overhead 80° camera, no horizon; centered asymmetric footprint; bold silhouette and two or three value planes; about 70% subject fill with transparent safety; readable at 24–32 px.
Lighting and palette: warm northwest/top-left highlights, cool blue-green ambient shadow, muted gray limestone, slate, small moss accents, connected soft contact shadow.
Constraints: genuine transparent RGBA, not a drawn checkerboard; no ground square, cliff edge, mine entrance, road, water, building, person, animal, text, signature, watermark, logo, UI, border, selection ring, or disconnected shadow.
```

## port-straight

```text
Use case: stylized-concept
Asset type: transparent coast-oriented port overlay for a 32 CSS-pixel world-map tile in a commercial pirate strategy game.
Input images: Image 1 is the approved Direction B “Gilded Harbor Diorama” style, material, palette, near-overhead camera, and northwest-lighting reference only; do not copy its coastline, buildings, boats, shelters, or composition.
Primary request: create one isolated straight salt-weathered timber quay that begins at a compact landward platform on the left and projects horizontally toward water on the right, with four stout posts, rope, and two small barrels attached to the landward platform.
Composition: strict orthographic near-overhead 80° camera, no horizon; long right-facing silhouette; subject fills about 80% of a landscape canvas with transparent safety; broad planks and posts readable at 24–40 px.
Constraints: genuine transparent RGBA, not a drawn checkerboard; no land, water, shoreline, building, crane, ship, boat, people, flag, cargo pile, text, signature, watermark, logo, UI, border, tile square, selection ring, or disconnected shadow.
```

## port-l

```text
Use case: stylized-concept
Asset type: transparent coast-oriented port overlay for a 32 CSS-pixel world-map tile in a commercial pirate strategy game.
Input images: Image 1 is the approved Direction B “Gilded Harbor Diorama” style, material, palette, near-overhead camera, and northwest-lighting reference only; do not copy its coastline, buildings, boats, shelters, or composition.
Primary request: create one isolated L-shaped salt-weathered timber dock that begins at a compact landward platform on the left, projects horizontally toward water on the right, then turns downward at its outer end, with stout posts, restrained rope, and two attached barrels.
Composition: strict orthographic near-overhead 80° camera, no horizon; clear right-facing L silhouette; subject fills about 80% of a landscape canvas with transparent safety; broad planks and posts readable at 24–40 px.
Constraints: genuine transparent RGBA, not a drawn checkerboard; no land, water, shoreline, building, crane, ship, boat, people, flag, cargo pile, text, signature, watermark, logo, UI, border, tile square, selection ring, glow, vignette, or disconnected shadow.
```

## alpha-edit-port-l

```text
Use case: background-extraction
Asset type: transparent coast-oriented world-map dock overlay
Input images: Image 1 is the sole edit target.
Primary request: remove only the black and dark-brown rectangular background, vignette, and detached glow around the L-shaped dock and replace them with genuine transparent alpha.
Constraints: preserve the complete L-shaped dock, planks, posts, barrels, rope, composition, colors, northwest lighting, proportions, attached contact shadow, orientation, and transparent safety margin; return real RGBA transparency rather than black fill, a drawn checkerboard, or a new backdrop; no new objects, no restyling, no crop, no text, no signature, no watermark.
```
