# City Harbor v2 — production prompts

These are the exact prompts submitted through the subscription-included OpenAI built-in
image generator on 2026-09-03 for production prompts P10–P20. The interface did not expose
a model name/version, sampler, seed, quality, or size setting. Reference roles are repeated
inside each prompt and indexed with hashes in `PRODUCTION-PROVENANCE.json`.

## P10 — fourteen-foundation empty harbor

```text
Use case: precise-object-edit
Asset type: production source art for a modular 2D strategy-game city backdrop
Input images: Image 1 is the edit target. Image 2 is a style, material, camera, and lighting reference only; it is not an edit target and none of its buildings, walls, docks, boats, flags, or people may be copied.
Primary request: Preserve Image 1's exact empty Caribbean harbor geography, horizonless high-angle three-quarter camera, scene scale, northwest light, luminous water, continuous corrected lower-right sand-and-limestone shoreline, road network, rocks, and vegetation. Change only the prepared building-ground system so all fourteen current CityScene slots have subtle, unoccupied, geologically integrated dirt/limestone foundations connected to the existing roads: town hall at x37–63 y6–42; tavern x4–18 y24–44; trade house x19–33 y28–46; sawmill x2–15 y48–64; iron mine x16–29 y50–66; distillery x30–43 y50–66; barracks x47–60 y46–63; garrison hall x62–75 y46–64; fortress armory x64–77 y24–43; grand arsenal x80–95 y20–42; palisade x4–21 y66–78; stone wall x24–41 y66–78; citadel x44–60 y62–78; shipyard x80–99 y75–99 percent of the 16:11 scene. Foundation clearings may overlap roads naturally but must not become bright UI rectangles. Preserve breathing room and do not make the scene look like a grid.
Style/medium: luxurious hand-painted 2D strategy-game diorama; layered gouache and oil-brush texture; dimensional but illustrated; luminous turquoise/deep-teal water, warm limestone, parchment earth, muted olive vegetation, weathered natural timber edging only; premium commercial game art, not photorealistic or glossy generic mobile-game 3D.
Composition/framing: preserve the exact existing 16:11 landscape intent, cover, weak-orthographic 55-degree downward view, and lower-right shoreline relationship; no sky or horizon.
Lighting: preserve warm northwest/top-left sunlight at about 35 degrees and cool blue-green ambient bounce.
Hard constraints: the result must remain a genuinely EMPTY opaque terrain/coast/road/foundation layer. Absolutely no buildings, houses, huts, roofs, towers, walls, gates, palisades, docks, piers, planks, pilings, cranes, boats, ships, sails, flags, signs, people, animals, text, letters, numbers, UI, selection rings, logos, signatures, or watermarks. No painted future-building silhouettes and no decorative border.
```

## P11 — barracks dummy removal

```text
Use case: precise-object-edit
Asset type: production source for a modular strategy-game barracks cutout
Input images: Image 1 is the edit target. Image 2 is style/material/camera/light reference only.
Primary request: Change only the two human-shaped wooden training dummies beneath the right side of Image 1's veranda. Remove both figure-like forms completely and replace them with one low horizontal weapons rack holding three round practice shields and bundled wooden staves. The replacement must read unmistakably as inanimate stored equipment even at source size. Preserve every other part of Image 1 exactly: the square watch stair, roof geometry, limestone walls, timber veranda, courtyard, gates, weapon racks, barrels, footprint, proportions, framing, brushwork, palette, northwest lighting, and 55-degree high-angle three-quarter camera.
Transparency: return one isolated constructed barracks with a genuinely transparent background and straight clean alpha; preserve fine roof, railing, gate, stair, weapon, and timber edges with generous transparent safety margin.
Hard constraints: no people, human figures, mannequins, statues, dolls, targets with heads or limbs, text, insignia, flags, banners, numbers, UI, terrain island, road, scenery, logo, signature, or watermark. Do not add or remove architecture. Do not crop, rotate, mirror, resize, relight, or redesign the building.
```

## P12 — sawmill

```text
Use case: stylized-concept
Asset type: production source for a modular city building cutout — sawmill
Input images: Image 1 is the approved Direction B style/material/camera/light reference only. Image 2 is the empty production harbor spatial reference only. Neither is an edit target.
Primary request: Create one practical 18th-century Caribbean sawmill that reads immediately as timber production: a low open-sided weathered-timber saw shed with a strong sloping red-clay and weathered-shingle roof, a visible large vertical frame-saw mechanism, an asymmetrical log-loading gantry, and orderly stacked cut logs contained strictly within the physical footprint. Keep it lower and more horizontal than the town hall and recruitment towers, with a unique long shed-plus-log-rack silhouette that survives the 13%×16% CityScene slot at phone size.
Style/medium: luxurious hand-painted 2D strategy-game building cutout; layered gouache and oil-brush texture; dimensional but illustrated; premium commercial game art; warm weathered timber, limited warm limestone footings, muted red tile, restrained brass; no photorealism or glossy generic 3D.
Composition/framing: isolated square source canvas; horizonless weak-orthographic 55-degree high-angle three-quarter view; show roof and two planes; subject fills about 84% width and 68% height; full footprint visible; bottom-center contact anchor; northwest/top-left light at 35 degrees and cool turquoise ambient bounce.
Transparency: genuinely transparent background with straight clean alpha; preserve fine saw frame, gantry, roof, log, and timber edges; at least 8% transparent safety margin.
Hard constraints: one isolated constructed building only; no terrain island, ground tile, road, grass, trees, water, sky, scenery, people, animals, flags, banners, signs, letters, numbers, UI, selection ring, logo, signature, or watermark. No detached floor shadow.
```

## P13 — iron mine

```text
Use case: stylized-concept
Asset type: production source for a modular city building cutout — iron mine
Input images: Image 1 is the approved Direction B style/material/camera/light reference only. Image 2 is the empty production harbor spatial reference only. Neither is an edit target.
Primary request: Create one compact 18th-century Caribbean iron-mine works that reads as mining rather than a fortress or house: a sturdy timber headframe with a visible hoist wheel over a cut-limestone shaft portal, a low attached ore-sorting shed, short timber ore chute, one small rail cart, and contained stacked ore baskets. Make the tall open headframe and low shed form a distinctive asymmetrical mining silhouette that survives the 13%×16% CityScene slot at phone size. Rock is allowed only as dressed stone structurally integrated into the portal, never as a natural terrain mound.
Style/medium: luxurious hand-painted 2D strategy-game building cutout; layered gouache and oil-brush texture; dimensional but illustrated; premium commercial game art; warm limestone, weathered timber, dark iron mechanism, restrained rust and brass; no photorealism or glossy generic 3D.
Composition/framing: isolated square source canvas; horizonless weak-orthographic 55-degree high-angle three-quarter view; show roof and two planes; subject fills about 78% width and 76% height; full footprint visible; bottom-center contact anchor; northwest/top-left light at 35 degrees and cool turquoise ambient bounce.
Transparency: genuinely transparent background with straight clean alpha; preserve fine headframe, hoist, chute, cart, and timber edges; at least 8% transparent safety margin.
Hard constraints: one isolated constructed building only; no cave, cliff, terrain island, ground tile, road, grass, vegetation, water, sky, scenery, people, animals, flags, banners, signs, letters, numbers, UI, selection ring, logo, signature, or watermark. No detached floor shadow.
```

## P14 — distillery

```text
Use case: stylized-concept
Asset type: production source for a modular city building cutout — rum distillery
Input images: Image 1 is the approved Direction B style/material/camera/light reference only. Image 2 is the empty production harbor spatial reference only. Neither is an edit target.
Primary request: Create one unmistakable 18th-century Caribbean rum distillery: a compact warm-limestone and dark-timber works with a stepped red-clay roofline, one tall slender brick-and-copper vent stack, an open side bay revealing a large copper pot still and coiled condenser, cane-crusher rollers, and a disciplined row of rum casks within the physical footprint. Give it a unique chimney-plus-copper-still silhouette, neither tavern-like nor military, readable in the 13%×16% CityScene slot at phone size.
Style/medium: luxurious hand-painted 2D strategy-game building cutout; layered gouache and oil-brush texture; dimensional but illustrated; premium commercial game art; sun-warmed limestone, weathered timber, oxidized copper, muted red tile, restrained brass; no photorealism or glossy generic 3D.
Composition/framing: isolated square source canvas; horizonless weak-orthographic 55-degree high-angle three-quarter view; show roof and two planes; subject fills about 78% width and 76% height; full footprint visible; bottom-center contact anchor; northwest/top-left light at 35 degrees and cool turquoise ambient bounce.
Transparency: genuinely transparent background with straight clean alpha; preserve fine vent, pipe, roof, still, and timber edges; at least 8% transparent safety margin.
Hard constraints: one isolated constructed building only; no terrain island, ground tile, road, cane field, vegetation, water, sky, scenery, smoke cloud, people, animals, flags, banners, signs, letters, numbers, UI, selection ring, logo, signature, or watermark. No detached floor shadow.
```

## P15 — palisade

```text
Use case: stylized-concept
Asset type: production source for a modular city fortification cutout — palisade
Input images: Image 1 is the approved Direction B style/material/camera/light reference only. Image 2 is the empty production harbor spatial reference only. Image 3 is the existing stone-wall tier lineage reference only. None is an edit target.
Primary request: Create the starter tier of one evolving harbor perimeter: a long, low weathered-timber palisade segment with a central open timber gate, irregular sharpened stakes, simple diagonal braces, a narrow inner plank walk, rope lashings, and two modest raised lookout ends. Its overall span, open-gate position, camera, and baseline should clearly anticipate Image 3's later warm-limestone wall, while remaining visibly rougher, lighter, and less defensive. Strong long-and-low silhouette for the current 17%×12% CityScene slot.
Style/medium: luxurious hand-painted 2D strategy-game constructed-element cutout; layered gouache and oil-brush texture; dimensional but illustrated; premium commercial game art; salt-weathered timber, dark joints, rope, tiny warm metal accents; no photorealism or glossy generic 3D.
Composition/framing: isolated wide subject on a square source canvas; horizonless weak-orthographic 55-degree high-angle three-quarter view; subject fills about 88% width and 42% height; full baseline visible; bottom-center contact anchor; northwest/top-left light at 35 degrees and cool turquoise ambient bounce.
Transparency: genuinely transparent background with straight clean alpha; preserve fine stake, rope, gate, brace, and walkway gaps; at least 8% transparent safety margin.
Hard constraints: one isolated constructed perimeter element only; no terrain island, ground tile, road, grass, water, sky, scenery, buildings, stone towers, cannons, people, flags, banners, signs, letters, numbers, UI, selection ring, logo, signature, or watermark. No detached floor shadow.
```

## P16 — compact citadel

```text
Use case: stylized-concept
Asset type: production source for a modular city fortification cutout — compact citadel
Input images: Image 1 is the approved Direction B style/material/camera/light reference only. Image 2 is the empty production harbor spatial reference only. Image 3 is the existing stone-wall tier lineage reference only. None is an edit target.
Primary request: Create the final tier of one evolving harbor perimeter as a compact, low citadel gate-bastion rather than a standalone castle: a broad warm-limestone curtain segment with one deep central arched gate, thicker battered base, an elevated timber-and-stone parapet walk, two low angular half-bastions, and one small central command pavilion with a restrained red-tile roof. Match Image 3's stone language, open-gate position, camera, and baseline while clearly upgrading its construction. The whole element must remain lower than the town hall and leave visual space for a separate corner-tower accessory; it should strengthen the front approach without dominating the city.
Style/medium: luxurious hand-painted 2D strategy-game constructed-element cutout; layered gouache and oil-brush texture; dimensional but illustrated; premium commercial game art; sun-warmed limestone, cool gray-green shadow, weathered timber, restrained brass and muted red tile; no photorealism or glossy generic 3D.
Composition/framing: isolated wide subject on a square source canvas; horizonless weak-orthographic 55-degree high-angle three-quarter view; subject fills about 88% width and 55% height; full baseline and open gate visible; bottom-center contact anchor; northwest/top-left light at 35 degrees and cool turquoise ambient bounce.
Transparency: genuinely transparent background with straight clean alpha; preserve fine arch, parapet, railing, roof, and bastion edges; at least 8% transparent safety margin.
Hard constraints: one isolated constructed perimeter element only; no terrain island, ground tile, road, grass, water, sky, scenery, attached city buildings, giant keep, oversized towers, cannons, people, flags, banners, signs, letters, numbers, UI, selection ring, logo, signature, or watermark. No detached floor shadow.
```

## P17 — garrison hall

```text
Use case: stylized-concept
Asset type: production source for a modular city recruitment building cutout — garrison hall
Input images: Image 1 is the approved Direction B style/material/camera/light reference only. Image 2 is the empty production harbor spatial reference only. Image 3 is the cleaned barracks lower-tier lineage reference only. None is an edit target.
Primary request: Create the tier-2 garrison hall as a deliberate architectural upgrade from Image 3: a broader but still modest two-storey warm-limestone and dark-timber quarters with one low square watch belvedere, a long shaded weapons veranda, a central open mustering arch, orderly shield and pike racks, and a compact enclosed drill porch. Preserve the barracks family's red-clay ridge, shingle roof, square military proportions, and asymmetry, but give the garrison hall a wider, steadier silhouette and more permanent stone construction. It must read as recruitment, not commerce or a standalone fort, in the current 13%×18% CityScene slot at phone size.
Style/medium: luxurious hand-painted 2D strategy-game building cutout; layered gouache and oil-brush texture; dimensional but illustrated; premium commercial game art; warm limestone, weathered timber, muted roof reds, dark iron, restrained brass; no photorealism or glossy generic 3D.
Composition/framing: isolated square source canvas; horizonless weak-orthographic 55-degree high-angle three-quarter view; subject fills about 82% width and 72% height; full footprint visible; bottom-center contact anchor; northwest/top-left light at 35 degrees with cool turquoise ambient bounce.
Transparency: genuinely transparent background with straight clean alpha; preserve fine roof, belvedere, veranda, rack, shield, pike, and timber edges; at least 8% transparent safety margin.
Hard constraints: one isolated constructed building only; no terrain island, ground tile, road, grass, water, sky, scenery, curtain wall, giant tower, cannons, people, human-shaped dummies, mannequins, statues, flags, banners, insignia, signs, letters, numbers, UI, selection ring, logo, signature, or watermark. No detached floor shadow.
```

## P18 — fortress armory

```text
Use case: stylized-concept
Asset type: production source for a modular city recruitment building cutout — fortress armory
Input images: Image 1 is the approved Direction B style/material/camera/light reference only. Image 2 is the empty production harbor spatial reference only. Image 3 is the garrison-hall lower-tier lineage reference only. None is an edit target.
Primary request: Create the tier-3 fortress armory as a clear industrial-military upgrade from Image 3: a compact, strong two-storey warm-limestone armory with one squat square corner magazine tower, a stepped red-tile and dark-shingle roof, a large open arched workshop bay, exterior weapon-testing hoist, organized racks of pikes and round shields, and a small enclosed forge court with a short dark chimney. Retain the recruitment family's square stone massing, shaded veranda language, and red-clay ridge, but make the armory more vertical and equipment-focused. It must read as recruitment and arms preparation, not as a curtain wall, keep, town hall, or trade house, in the current 13%×19% CityScene slot at phone size.
Style/medium: luxurious hand-painted 2D strategy-game building cutout; layered gouache and oil-brush texture; dimensional but illustrated; premium commercial game art; warm limestone, weathered dark timber, muted roof reds, dark iron, tiny brass; no photorealism or glossy generic 3D.
Composition/framing: isolated square source canvas; horizonless weak-orthographic 55-degree high-angle three-quarter view; subject fills about 78% width and 78% height; full footprint visible; bottom-center contact anchor; northwest/top-left light at 35 degrees with cool turquoise ambient bounce.
Transparency: genuinely transparent background with straight clean alpha; preserve fine roof, tower, hoist, arch, chimney, rack, shield, pike, and timber edges; at least 8% transparent safety margin.
Hard constraints: one isolated constructed building only; no terrain island, ground tile, road, grass, water, sky, scenery, curtain wall, giant tower, battlements, cannon battery, people, human-shaped dummies, mannequins, statues, flags, banners, insignia, signs, letters, numbers, UI, selection ring, logo, signature, or watermark. No detached floor shadow.
```

## P19 — grand arsenal

```text
Use case: stylized-concept
Asset type: production source for a modular city recruitment building cutout — grand arsenal
Input images: Image 1 is the approved Direction B style/material/camera/light reference only. Image 2 is the empty production harbor spatial reference only. Image 3 is the fortress-armory lower-tier lineage reference only. None is an edit target.
Primary request: Create the tier-4 grand arsenal as the prestigious final recruitment workshop in Image 3's architectural family: a broad three-bay warm-limestone arsenal with a strong long roofline, two restrained square roof lanterns rather than a giant tower, three tall arched equipment doors, an open central assembly court, heavy timber hoists, organized racks of pikes, shields, cannon barrels and naval spars, and small brass fittings. Preserve the armory family's stepped red-tile/dark-shingle roofs, arcaded workshop language, and square military proportions, but broaden and refine the silhouette. It must read as elite arms production, not a palace, town hall, curtain wall, or standalone fortress, in the current 15%×22% CityScene slot at phone size; remain visually subordinate to the town hall.
Style/medium: luxurious hand-painted 2D strategy-game building cutout; layered gouache and oil-brush texture; dimensional but illustrated; premium commercial game art; warm limestone, weathered dark timber, muted roof reds, dark iron, restrained brass; no photorealism or glossy generic 3D.
Composition/framing: isolated square source canvas; horizonless weak-orthographic 55-degree high-angle three-quarter view; subject fills about 86% width and 76% height; full footprint visible; bottom-center contact anchor; northwest/top-left light at 35 degrees with cool turquoise ambient bounce.
Transparency: genuinely transparent background with straight clean alpha; preserve fine lantern, arch, hoist, rack, spar, roof, and timber edges; at least 8% transparent safety margin.
Hard constraints: one isolated constructed building only; no terrain island, ground tile, road, grass, water, sky, scenery, curtain wall, giant keep, oversized tower, active cannon battery, people, human-shaped dummies, mannequins, statues, flags, banners, insignia, signs, letters, numbers, UI, selection ring, logo, signature, or watermark. No detached floor shadow.
```

## P20 — citadel corner tower

```text
Use case: stylized-concept
Asset type: production source for modular city fortification accessory — citadel corner tower
Input images: Image 1 is the approved Direction B style/material/camera/light reference only. Image 2 is the selected compact citadel lineage reference only. Neither is an edit target.
Primary request: Create one separate modest citadel corner-tower accessory that mates visually with Image 2: a short, round battered warm-limestone tower with the same block size, mossed base, cool gray-green shadow planes, parapet walk, rope-railed timber inner platform, and a restrained faceted red-clay cap. It must read as one corner continuation of the citadel perimeter, not a standalone keep or modern turret. Match Image 2's exact 55-degree weak-orthographic camera, northwest light, material treatment, optical scale, and baseline. Strong compact silhouette, no more than about two wall-storeys high.
Style/medium: luxurious hand-painted 2D strategy-game constructed-element cutout; layered gouache and oil-brush texture; dimensional but illustrated; premium commercial game art; warm limestone, weathered timber, muted red tile, restrained brass; no photorealism or glossy generic 3D.
Composition/framing: isolated square source canvas; subject fills about 48% width and 72% height; full base visible; bottom-center contact anchor; generous transparent margin.
Transparency: genuinely transparent background with straight clean alpha; preserve fine parapet, rope rail, cap, masonry, and timber edges; at least 8% transparent safety margin.
Hard constraints: exactly one corner tower only; no attached wall segment, gate, terrain island, ground tile, road, grass, water, sky, scenery, cannon, weapon, giant keep, people, flags, banners, insignia, signs, letters, numbers, UI, selection ring, logo, signature, or watermark. No detached floor shadow.
```

## H01–H26 — high-resolution production pass

All 26 exact prompts, per-call input roles and hashes, selected output hashes,
service/tool details, and unexposed model/seed fields are recorded in
`HIGH-RES-PROVENANCE.json`. H01–H24 are the distinct 6×4 backdrop-tile edits;
H25 and H26 are the distinct overlapping town-hall detail edits. The JSON stores
the fully expanded prompt for every call, not only a shorthand template.

Six earlier pilot tile calls were rejected because their five-column grid
provided only 0.858× source/device coverage at the approved worst-case 3× stop.
They were discarded rather than retained as project-bound art.
