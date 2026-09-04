# Image-generation prompt ledger

Checkpoint 1 for issue #609. These request bodies are reproduced verbatim from the built-in OpenAI image-generation calls made on 2026-09-03. Every concept request referenced `../commercial-visual-v2/sources/b-gilded-harbor-diorama-map-r1.webp` only for style, material, palette, camera, and lighting. The background-extraction requests referenced only their named generated source as the edit target.

The built-in interface exposed neither a model identifier nor a seed, so both are recorded as `null` in `asset-registry.json`. The Dutch/French extraction call used the literal template shown below once for each of the two listed substitution values.

## city-british

```text
Use case: stylized-concept
Asset type: 256×256 world-map city token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain, boats, shelters, or composition.
Primary request: create one isolated British colonial harbor-city identity token.
Scene/backdrop: genuinely transparent background; no land, water, shoreline, tile, badge, frame, or colored ground plate.
Subject: a compact three-building British Caribbean port silhouette: one square Georgian limestone customs house with a small clockless cupola, one steep weathered-shingle naval storehouse, and one stout angular harbor bastion; squared roofline and disciplined symmetry distinguish it from other factions. No flag or heraldic emblem—the runtime overlay owns flags.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, modeled warm limestone and dark weathered timber, tiny restrained brass accents, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single token; bottom-center optical anchor; subject fills about 74% of a square canvas with 12.5% transparent safety; bold outer silhouette and only two or three internal value planes so it remains unmistakable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, broad soft penumbra, restrained contact shadow on transparency.
Color palette: warm weathered limestone, near-blackened timber, muted slate shingles, tiny brass; faction identity must come primarily from architecture and silhouette, not hue.
Constraints: output one genuine transparent RGBA cutout; clean alpha with no matte; no text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, terrain, water, people, animals, smoke, bloom, or cast shadow disconnected from the subject.
```

## alpha-edit-city-british

```text
Use case: background-extraction
Asset type: transparent world-map game token cutout
Input images: Image 1 is the sole edit target.
Primary request: remove only the white/light-gray checkerboard background and replace it with real transparent alpha.
Constraints: change only the background; preserve every pixel of the British harbor-city miniature, its composition, colors, northwest lighting, edges, proportions, contact shadow, and transparent safety margin; return a genuine RGBA image with alpha, not a drawn checkerboard or a white/gray background; no new objects, no restyling, no crop, no text, no signature, no watermark.
```

## city-dutch

```text
Use case: stylized-concept
Asset type: 256×256 world-map city token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain, boats, shelters, or composition.
Primary request: create one isolated Dutch colonial harbor-city identity token.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No land, water, shoreline, tile, badge, frame, or colored ground plate.
Subject: a compact three-building Dutch Caribbean trading-port silhouette: a tall narrow stepped-gable counting house as the unmistakable center, two lower brick-and-timber warehouses, and a small angular wharf crane tucked into the cluster. Stepped rooflines and mercantile verticality distinguish it from other factions. No flag or heraldic emblem—the runtime overlay owns flags.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, modeled warm masonry and dark weathered timber, tiny restrained brass accents, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single token; bottom-center optical anchor; subject fills about 74% of a square canvas with 12.5% transparent safety; bold outer silhouette and only two or three internal value planes so it remains unmistakable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, broad soft penumbra, restrained contact shadow on transparency.
Color palette: warm russet brick, weathered limestone, near-blackened timber, muted slate and tiny brass; faction identity must come primarily from architecture and silhouette, not hue.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; no text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, terrain, water, people, animals, smoke, bloom, or cast shadow disconnected from the subject.
```

## city-french

```text
Use case: stylized-concept
Asset type: 256×256 world-map city token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain, boats, shelters, or composition.
Primary request: create one isolated French colonial harbor-city identity token.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No land, water, shoreline, tile, badge, frame, or colored ground plate.
Subject: a compact three-building French Caribbean port silhouette: one elegant limestone governor’s house with a steep charcoal mansard roof and a small open lantern cupola, flanked by two lower symmetrical arcaded buildings. The mansard crown, softened curved dormers, and balanced crescent plan distinguish it from other factions. No flag or heraldic emblem—the runtime overlay owns flags.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, modeled warm limestone and dark weathered timber, tiny restrained brass accents, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single token; bottom-center optical anchor; subject fills about 74% of a square canvas with 12.5% transparent safety; bold outer silhouette and only two or three internal value planes so it remains unmistakable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, broad soft penumbra, restrained contact shadow on transparency.
Color palette: warm pale limestone, near-black charcoal roof, muted blue-gray shutters and tiny brass; faction identity must come primarily from architecture and silhouette, not hue.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; no text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, terrain, water, people, animals, smoke, bloom, or cast shadow disconnected from the subject.
```

## alpha-edit-city-dutch-and-city-french-template

Substitution values, in call order: `Dutch stepped-gable harbor-city miniature`; `French mansard-roof harbor-city miniature`.

```text
Use case: background-extraction
Asset type: transparent world-map game token cutout
Input images: Image 1 is the sole edit target.
Primary request: remove only the white/light-gray checkerboard background and replace it with real transparent alpha around the ${names[i]}.
Constraints: change only the background; preserve every subject pixel, composition, colors, northwest lighting, edges, proportions, contact shadow, and transparent safety margin; return a genuine RGBA image with alpha, not a drawn checkerboard or white/gray background; no new objects, no restyling, no crop, no text, no signature, no watermark.
```

## city-spanish

```text
Use case: stylized-concept
Asset type: 256×256 world-map city token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain, boats, shelters, or composition.
Primary request: create one isolated Spanish colonial harbor-city identity token.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No land, water, shoreline, tile, badge, frame, or colored ground plate.
Subject: a compact three-building Spanish Caribbean port silhouette: one whitewashed limestone cabildo with an offset square bell tower, one low arcaded customs house, and one rounded coastal watchtower, all with bold red-clay tile roofs. The asymmetrical bell tower, arcade, and tile-roof massing distinguish it from other factions. No flag, cross, or heraldic emblem—the runtime overlay owns flags.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, modeled warm limestone and dark weathered timber, tiny restrained brass accents, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single token; bottom-center optical anchor; subject fills about 74% of a square canvas with 12.5% transparent safety; bold outer silhouette and only two or three internal value planes so it remains unmistakable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, broad soft penumbra, restrained contact shadow on transparency.
Color palette: warm whitewashed limestone, muted terracotta roofs, near-blackened timber, tiny brass; faction identity must come primarily from architecture and silhouette, not hue.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; no text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, terrain, water, people, animals, smoke, bloom, or cast shadow disconnected from the subject.
```

## city-pirates

```text
Use case: stylized-concept
Asset type: 256×256 world-map city token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain, boats, shelters, or composition.
Primary request: create one isolated pirate free-port city identity token.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No land, water, shoreline, tile, badge, frame, or colored ground plate.
Subject: a compact irregular three-structure pirate haven silhouette: one crooked timber tavern with a tall off-center lookout mast, one patched plank warehouse leaning into it, and one jagged palisade gate made from mismatched ship timbers. Ragged roof cuts, offset heights, rope braces, and asymmetry distinguish it from disciplined colonial factions. No skull emblem, flag, or heraldry—the runtime overlay owns flags.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, modeled salt-weathered timber and small limestone footings, tiny restrained brass accents, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single token; bottom-center optical anchor; subject fills about 74% of a square canvas with 12.5% transparent safety; bold outer silhouette and only two or three internal value planes so it remains unmistakable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, broad soft penumbra, restrained contact shadow on transparency.
Color palette: near-blackened timber, sun-bleached planks, muted rust cloth scraps, tiny brass; faction identity must come primarily from architecture and silhouette, not hue.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; no text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, terrain, water, people, animals, smoke, bloom, or cast shadow disconnected from the subject.
```

## city-neutral

```text
Use case: stylized-concept
Asset type: 256×256 world-map settlement token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain, boats, shelters, or composition.
Primary request: create one isolated neutral Caribbean settlement identity token.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No land, water, shoreline, tile, badge, frame, or colored ground plate.
Subject: a modest compact neutral settlement silhouette: one low warm-limestone market hall with an open central arch, two small plain weathered-timber houses, and a short round communal well tower. Low horizontal massing, no fortification, no grand civic crown, and no raised standard distinguish it from faction capitals.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, modeled warm limestone and weathered timber, very restrained metal detail, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single token; bottom-center optical anchor; subject fills about 72% of a square canvas with 12.5% transparent safety; bold outer silhouette and only two or three internal value planes so it remains unmistakable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, broad soft penumbra, restrained contact shadow on transparency.
Color palette: muted parchment limestone, desaturated timber, olive-gray shingles; neutral identity must come from low civic silhouette and absence of faction display, not hue.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; no text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, banner, terrain, water, people, animals, smoke, bloom, or cast shadow disconnected from the subject.
```

## ship-british-sloop

```text
Use case: stylized-concept
Asset type: 256×256 world-map ship token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its sea, coastline, other vessels, or composition.
Primary request: create one isolated British naval sloop token, clearly the smaller and faster of two class proofs.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No sea, wake, tile, badge, frame, or colored ground plate.
Subject: a lean single-masted 18th-century sloop seen from high overhead, narrow hull, one large fore-and-aft triangular sail plus a small jib, clipped square stern, disciplined taut rigging, closed gunports. A broad two-tone diagonal sail panel and squared stern rail provide a British faction cue without a flag or heraldic emblem. Bow points toward upper right.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, warm weathered timber, cream canvas, near-black rigging and tiny brass accents, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 82° camera, no horizon; centered single token; bottom-center optical anchor at the stern; vessel fills about 74% of a square canvas with 12.5% transparent safety; strong narrow hull and triangular-sail silhouette readable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, restrained attached contact shadow on transparency.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; no text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, separate flag, ocean, foam, waves, people, smoke, bloom, or disconnected shadow.
```

## ship-pirates-galleon

```text
Use case: stylized-concept
Asset type: 256×256 world-map ship token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its sea, coastline, other vessels, or composition.
Primary request: create one isolated pirate galleon token, clearly the larger and heavier of two class proofs.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No sea, wake, tile, badge, frame, or colored ground plate.
Subject: a broad three-masted 18th-century galleon seen from high overhead, high ornate sterncastle, deep round hull, two large square-sail masses and a smaller lateen mizzen, compact readable rigging, closed gunports. Patchwork sail panels with one asymmetric torn corner and a jagged stern gallery provide pirate identity through pattern and silhouette without a flag or skull emblem. Bow points toward upper right.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, near-black weathered hull, sun-aged cream canvas, muted rust patches and tiny brass accents, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 82° camera, no horizon; centered single token; bottom-center optical anchor at the stern; vessel fills about 76% of a square canvas with 12% transparent safety; broad hull and multi-mast silhouette readable at 24 CSS pixels and unmistakably heavier than the sloop.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, restrained attached contact shadow on transparency.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; no text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, separate flag, ocean, foam, waves, people, smoke, bloom, or disconnected shadow.
```

## party-british

```text
Use case: stylized-concept
Asset type: 256×256 world-map landing-party token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain or composition.
Primary request: create one isolated British landing-party token.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No terrain, road, tile, badge, frame, or colored ground plate.
Subject: a tightly grouped three-person 18th-century British marine landing party viewed from high overhead: a central tricorn officer one step forward and two uniformed marines in a disciplined straight rear rank, compact muskets held close, square cartridge boxes and crisp crossed white straps. Rigid triangular formation and square kit silhouette distinguish them beyond color. No standard, flag, crest, or text.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, cloth and leather simplified into strong value planes, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single squad token; center optical anchor; group fills about 72% of a square canvas with 13% transparent safety; three heads and the formation remain readable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, one restrained connected contact shadow.
Color palette: dark navy coats, parchment crossbelts, muted rust cuffs, near-black hats; identity must rely on formation and kit as well as hue.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; exactly three people; no text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, banner, terrain, foliage, building, animal, smoke, bloom, or disconnected shadow.
```

## party-dutch

```text
Use case: stylized-concept
Asset type: 256×256 world-map landing-party token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain or composition.
Primary request: create one isolated Dutch landing-party token.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No terrain, road, tile, badge, frame, or colored ground plate.
Subject: a compact three-person 18th-century Dutch maritime militia landing party viewed from high overhead: one broad-brim-hat leader forward, two short-coated sailors behind in a shallow wedge, compact muskets held close, round satchels and rolled rope coils at the hip. Broad hats, low wedge formation, and round maritime kit distinguish them beyond color. No standard, flag, crest, barrel, cargo, or text.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, cloth and leather simplified into strong value planes, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single squad token; center optical anchor; group fills about 72% of a square canvas with 13% transparent safety; three heads and the formation remain readable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, one restrained connected contact shadow.
Color palette: muted ochre and deep blue coats, parchment canvas, dark brown leather; identity must rely on formation and kit as well as hue.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; exactly three people; no text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, banner, terrain, foliage, building, animal, smoke, bloom, or disconnected shadow.
```

## party-french

```text
Use case: stylized-concept
Asset type: 256×256 world-map landing-party token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain or composition.
Primary request: create one isolated French landing-party token.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No terrain, road, tile, badge, frame, or colored ground plate.
Subject: a compact three-person 18th-century French naval infantry landing party viewed from high overhead: a long-coated central officer forward with a small feather on the tricorn, two marines behind in a graceful crescent, compact muskets held close, long coat tails and rounded cartridge pouches. Crescent formation, swept coat tails, and rounded kit distinguish them beyond color. No standard, flag, crest, fleur-de-lis, or text.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, cloth and leather simplified into strong value planes, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single squad token; center optical anchor; group fills about 72% of a square canvas with 13% transparent safety; three heads and the formation remain readable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, one restrained connected contact shadow.
Color palette: muted pale blue coats, parchment crossbelts, near-black tricorns, tiny brass; identity must rely on formation and coat silhouette as well as hue.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; exactly three people; no text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, banner, terrain, foliage, building, animal, smoke, bloom, or disconnected shadow.
```

## party-pirates

```text
Use case: stylized-concept
Asset type: 256×256 world-map landing-party token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain or composition.
Primary request: create one isolated pirate landing-party token.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No terrain, road, tile, badge, frame, or colored ground plate.
Subject: a compact three-person 18th-century pirate raiding party viewed from high overhead: one bandana-wearing cutlass leader ahead, one tricorn raider and one headscarf raider behind at uneven offsets, compact weapons held close, irregular satchels and rope belts. Broken asymmetric formation, varied head shapes, and swept cutlass silhouette distinguish them beyond color. No standard, flag, skull crest, treasure, or text.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, cloth and leather simplified into strong value planes, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single squad token; center optical anchor; group fills about 72% of a square canvas with 13% transparent safety; three heads and the asymmetric formation remain readable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, one restrained connected contact shadow.
Color palette: near-black and weathered brown clothing, muted rust sash, parchment shirt highlights, tiny brass; identity must rely on formation and silhouette as well as hue.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; exactly three people; no text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, banner, terrain, foliage, building, animal, smoke, bloom, or disconnected shadow.
```

## party-spanish

```text
Use case: stylized-concept
Asset type: 256×256 world-map landing-party token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain or composition.
Primary request: create one isolated Spanish landing-party token.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No terrain, road, tile, badge, frame, or colored ground plate.
Subject: a compact three-person 18th-century Spanish colonial infantry landing party viewed from high overhead: one long-coated officer forward and two soldiers behind in a tight arrowhead, flat broad tricorn silhouettes, short shoulder capes, crossed cartridge belts and compact muskets held close. Arrowhead formation, cape triangles, and broad hats distinguish them beyond color. No standard, flag, crest, cross, or text.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, cloth and leather simplified into strong value planes, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single squad token; center optical anchor; group fills about 72% of a square canvas with 13% transparent safety; three heads and the formation remain readable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, one restrained connected contact shadow.
Color palette: muted rust-red coats, parchment capes and belts, near-black hats, tiny brass; identity must rely on formation and cape silhouette as well as hue.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; exactly three people; no text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, banner, terrain, foliage, building, animal, smoke, bloom, or disconnected shadow.
```

## encounter-merchant-convoy

```text
Use case: stylized-concept
Asset type: 256×256 world-map sea-encounter token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its sea, coastline, vessels, or composition.
Primary request: create one isolated merchant-convoy sea encounter token.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No sea, foam, wake, tile, badge, frame, or colored ground plate.
Subject: two compact 18th-century merchant craft traveling together from lower left to upper right: one round-bellied single-mast cargo vessel with a broad cream square sail and visible stacked casks under a small open hatch, accompanied by one much smaller lateen-rigged tender. Paired offset hulls and cargo-belly silhouette communicate a convoy without text.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, warm weathered timber, cream canvas and tiny restrained brass, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 82° camera, no horizon; centered single encounter token; center optical anchor; paired craft fill about 74% of a square canvas with 12.5% transparent safety; broad merchant plus tiny tender remain readable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, restrained attached contact shadows.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; no people, flag, heraldry, text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, ocean, waves, cargo floating outside the hull, smoke, bloom, or disconnected shadow.
```

## encounter-native-village

```text
Use case: stylized-concept
Asset type: 256×256 world-map land-encounter token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain, shelters, or composition.
Primary request: create one isolated native Caribbean village encounter token, respectful and non-caricatured.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No soil, grass, shoreline, road, tile, badge, frame, or colored ground plate.
Subject: a compact peaceful village cluster of exactly three small circular palm-thatch dwellings with woven timber walls, arranged around one open-sided communal shade pavilion; rounded roofs, woven wall rhythm, and a low radial silhouette distinguish it from colonial settlements and bandit tents. Architecture only: no people, weapons, trophies, masks, flags, or symbols.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, natural palm fiber and warm weathered timber simplified into strong value planes, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single encounter token; center optical anchor; cluster fills about 72% of a square canvas with 13% transparent safety; three round roofs and central open pavilion remain readable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, one restrained connected contact shadow.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; no people, text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, banner, terrain, plants, animals, fire, smoke, bloom, or disconnected shadow.
```

## encounter-hermit

```text
Use case: stylized-concept
Asset type: 256×256 world-map land-encounter token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain, shelters, or composition.
Primary request: create one isolated hermit encounter token.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No soil, grass, shoreline, road, tile, badge, frame, or colored ground plate.
Subject: one tiny solitary weather-beaten timber hut with a sharply leaning shingle roof, a narrow pale-stone chimney, one small covered stoop, and one hanging unlit lantern. A single tall chimney beside a low crooked cabin creates a lonely asymmetrical silhouette unmistakable from villages, camps, and resource sites. No person.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, salt-weathered timber and warm limestone simplified into strong value planes, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single encounter token; center optical anchor; hut fills about 70% of a square canvas with 14% transparent safety; roof/chimney silhouette readable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, one restrained connected contact shadow.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; exactly one hut; no person, text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, banner, terrain, plants, animals, fire, smoke, bloom, or disconnected shadow.
```

## encounter-bandit-camp

```text
Use case: stylized-concept
Asset type: 256×256 world-map land-encounter token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain, shelters, or composition.
Primary request: create one isolated bandit-camp encounter token.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No soil, grass, shoreline, road, tile, badge, frame, or colored ground plate.
Subject: a compact hostile camp silhouette made of exactly two low patched triangular canvas lean-to tents behind a jagged waist-high timber barricade, with one crossed pair of plain spears leaning against the center. Sharp triangles, broken palisade teeth, and crossed spear silhouette distinguish it from the round native village and lone hermit hut. No people, skulls, loot, treasure, or flag.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, patched canvas and dark weathered timber simplified into strong value planes, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single encounter token; center optical anchor; camp fills about 72% of a square canvas with 13% transparent safety; tent triangles and jagged barricade readable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, one restrained connected contact shadow.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; no people, text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, banner, terrain, foliage, animal, fire, smoke, bloom, or disconnected shadow.
```

## site-mine

```text
Use case: stylized-concept
Asset type: 256×256 world-map land-site token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain, shelters, or composition.
Primary request: create one isolated mine resource-site token.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No soil, rock ground, grass, road, tile, badge, frame, or colored ground plate.
Subject: a compact timber-braced mine adit: one deep black arched opening framed by heavy squared beams, a short pair of rails projecting from it, and one tiny empty ore cart tucked to one side. The dark arch, triangular timber brace, and parallel rails form the unmistakable silhouette. No loose ore pile or precious-metal glow.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, near-black weathered timber and warm limestone simplified into strong value planes, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single site token; center optical anchor; structure fills about 72% of a square canvas with 13% transparent safety; arch and rails readable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, one restrained connected contact shadow.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; no people, text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, terrain, foliage, animal, smoke, bloom, or disconnected shadow.
```

## site-sawmill

```text
Use case: stylized-concept
Asset type: 256×256 world-map land-site token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain, shelters, or composition.
Primary request: create one isolated sawmill resource-site token.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No soil, grass, water, road, tile, badge, frame, or colored ground plate.
Subject: a compact open-sided timber sawmill shed with a broad pitched shingle roof cut away at the front, one oversized circular saw blade clearly visible in the opening, and one straight log bed passing through. The single bright blade circle under a broad roof distinguishes it from the lumber camp and mine. No waterwheel and no loose log pile.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, salt-weathered timber, dark iron and pale cut wood simplified into strong value planes, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single site token; center optical anchor; structure fills about 72% of a square canvas with 13% transparent safety; roof, blade circle, and log bed readable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, one restrained connected contact shadow.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; no people, text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, terrain, foliage, animal, water, smoke, bloom, or disconnected shadow.
```

## site-lumber-camp

```text
Use case: stylized-concept
Asset type: 256×256 world-map land-site token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain, shelters, or composition.
Primary request: create one isolated lumber-camp resource-site token.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No soil, grass, road, tile, badge, frame, or colored ground plate.
Subject: a compact logging camp made from two large parallel stacks of freshly cut logs with strongly visible circular ends, one simple A-frame timber rack spanning them, and one chopping block with an axe embedded. The paired log stacks and repeating round ends distinguish it from the roofed sawmill and dark mine arch. No shed, saw blade, cart, or people.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, bark-dark timber and pale fresh-cut ends simplified into strong value planes, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single site token; center optical anchor; log cluster fills about 72% of a square canvas with 13% transparent safety; paired stacks and round ends readable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, one restrained connected contact shadow.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; no people, text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, terrain, foliage, animal, fire, smoke, bloom, or disconnected shadow.
```

## site-ruins

```text
Use case: stylized-concept
Asset type: 256×256 world-map land-site token source for a commercial pirate strategy game
Input images: Image 1 is a style, material, palette, and camera reference only; do not copy its terrain, cliffs, or composition.
Primary request: create one isolated ruins exploration-site token.
Scene/backdrop: real transparent alpha; no visible background. A checkerboard pattern is not transparency—do not draw one. No soil, sand, grass, road, tile, badge, frame, or colored ground plate.
Subject: a compact broken warm-limestone ruin: one tall fractured arch with a missing upper-right section, one short standing column, and two clearly toppled column drums crossing at the base. The open arch void, jagged broken crown, and crossed fallen stones distinguish it from every active building and resource structure. No treasure, glowing light, skull, vines, or person.
Style/medium: Direction B “Gilded Harbor Diorama”; luxurious hand-painted strategy-game miniature, layered gouache and oil-brush texture, weathered warm limestone with cool gray-green shadow simplified into strong value planes, dimensional but clearly illustrated, premium commercial game art, not photorealistic or generic 3D.
Composition/framing: strict orthographic near-overhead 80° camera, no horizon; centered single site token; center optical anchor; ruin fills about 70% of a square canvas with 14% transparent safety; arch void and broken crown readable at 24 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35° elevation, cool blue-green ambient shadow, one restrained connected contact shadow.
Constraints: output one genuine transparent RGBA cutout with clean alpha and no matte; no people, text, letters, numbers, signature, watermark, logo, UI, border, icon ring, selection ring, flag, terrain, foliage, animal, fire, smoke, bloom, or disconnected shadow.
```

## Runtime-completion generation note

The two sea-encounter replacements below were made after checkpoint 1, during runtime completion. The approved Direction B map reference and the legacy `natives.png` / `settlers.png` assets were visually inspected before both calls, but no image was attached to either generation request. The built-in interface again exposed neither model identifier nor seed; both are recorded as `null` in `runtime-additions.json`.

## runtime-encounter-natives

```text
Create one production-ready transparent raster sprite for the Age of Plunder world map.

Asset role: neutral sea encounter token, kind “natives”.
Subject: a compact encounter group of two historically plausible Caribbean Indigenous dugout canoes viewed from high overhead, one larger canoe and one small escort canoe. Broad carved wood hull silhouettes, a few simple paddles laid across the gunwales, woven baskets and rolled fiber mats as peaceful trade cargo. No weapons, no colonial flag, no heraldry, no people large enough for facial detail. The paired canoe silhouette must be unmistakably different from a European merchant sailboat at 24–40 CSS pixels.

Art direction: Direction B “Gilded Harbor Diorama”; premium hand-painted game-token finish, warm weathered timber, restrained brass/tan accents, deep readable value separation, broad shapes over micro-detail, coherent with a polished pirate strategy game. Strict orthographic near-overhead camera at about 82 degrees. Warm northwest/top-left key light at about 35 degrees elevation and cool blue-green ambient shadow. Center optical anchor with at least 12% transparent safety margin. No baked terrain, water, wake, contact shadow, ring, selection state, text, signature, logo, or watermark. Encode no reward, danger, hostility, ownership, or gameplay modifier.

Output requirements: one isolated sprite only on a genuinely transparent RGBA background. Transparent pixels must be truly transparent, not a rendered checkerboard or white/gray matte. Straight clean alpha with edge colors extended beneath transparent pixels; no pale halo. No border and no square/circular/diamond ground plane. Square canvas, subject centered, optimized for reduction to 24, 32, 48, and 96 pixels.
```

## runtime-encounter-settlers

```text
Create one production-ready transparent raster sprite for the Age of Plunder world map.

Asset role: neutral sea encounter token, kind “settlers”.
Subject: a compact colonial supply-launch encounter seen from high overhead: one broad shallow-draft wooden longboat with a short mast and small furled cream canvas lug sail, accompanied by one tiny rowing tender. The main launch visibly carries two travel trunks, a canvas-covered crate, a water barrel, a rolled blanket, and a short bundle of building timbers. No warship guns, no treasure, no faction flag, no heraldry, and no people large enough for facial detail. Its broad cargo-laden launch silhouette must remain clearly different from both a paired merchant sailing convoy and two narrow Indigenous dugout canoes at 24–40 CSS pixels.

Art direction: Direction B “Gilded Harbor Diorama”; premium hand-painted game-token finish, warm weathered timber, muted canvas and leather, restrained brass/tan accents, deep readable value separation, broad shapes over micro-detail, coherent with a polished pirate strategy game. Strict orthographic near-overhead camera at about 82 degrees. Warm northwest/top-left key light at about 35 degrees elevation and cool blue-green ambient shadow. Center optical anchor with at least 12% transparent safety margin. No baked terrain, water, wake, contact shadow, ring, selection state, text, signature, logo, or watermark. Encode no reward, danger, hostility, ownership, or gameplay modifier.

Output requirements: one isolated sprite only on a genuinely transparent RGBA background. Transparent pixels must be truly transparent, not a rendered checkerboard or white/gray matte. Straight clean alpha with edge colors extended beneath transparent pixels; no pale halo. No border and no square/circular/diamond ground plane. Square canvas, subject centered, optimized for reduction to 24, 32, 48, and 96 pixels.
```
