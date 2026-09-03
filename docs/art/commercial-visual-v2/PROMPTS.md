# Exact generation recipes

This file preserves the exact text recipes for every model-generated WebP in `sources/`. It exists because the corrective rounds changed camera, architecture, and state language; a single “latest prompt” would not reproduce rejected evidence.

## Assembly rule

For each source, form the positive prompt by concatenating the following strings with **no additional characters**:

```text
Use case: stylized-concept. Asset type: final-size game environment styleframe. Scene and subject:
{SUBJECT}
. Style and medium:
{STYLE}
. Composition:
{COMPOSITION}
 readable when reduced to a 1024 by 704 gameplay frame, calm negative space reserved for interface overlays at the edges. Constraints: one continuous scene, historically plausible age-of-sail materials, no baked user interface, no text, no logo, no watermark.
```

`{COMPOSITION}` deliberately ends with a comma, so the literal join is `..., readable ...`. The SHA-256 prefix in the recipe table verifies the assembled positive text. The negative prompt is the exact named negative profile below.

## Subject fragments

### S1 — original overhead map

```text
wide 16:11 high-angle top-down world map for a commercial pirate strategy game, an archipelago of two large irregular tropical islands and several small islets, deep blue-green sea, turquoise shallows, warm sand rims, rocky headlands, forests, clearings, faint dirt roads and empty natural harbors, coherent geography, strong large-scale land silhouettes, open navigable water channels, northwest sunlight, terrain only with no settlements and no vessels
```

### S2 — original empty harbor

```text
wide 16:11 high-angle three-quarter view of an empty buildable Caribbean harbor landscape for a commercial pirate strategy game, one coherent sloping ground plane, sea and timber piers along the lower-right shoreline, warm sand, an inland terrace at top center, branching dirt roads and prepared empty foundation plots, sparse palms and wind-bent coastal vegetation only at the perimeter, northwest sunlight, open central space for modular buildings, absolutely no constructed buildings or walls
```

### S3 — corrected strict-overhead map

```text
(strict orthographic 80-degree top-down illustrated game map:1.45), camera looking almost straight down, no visible sky and no horizon, wide 16:11 world map for a commercial pirate strategy game, an archipelago of two large irregular tropical islands and several small islets, deep blue-green sea, turquoise shallows, warm sand rims, rocky headlands, forests, clearings, faint dirt roads and empty natural harbors, coherent geography, strong large-scale land silhouettes, open navigable water channels, northwest sunlight, terrain only with no settlements and no vessels
```

### S4 — first corrected empty harbor

```text
(stylized illustrated isometric game environment:1.35), wide 16:11 high-angle three-quarter view of an empty buildable Caribbean harbor landscape for a commercial pirate strategy game, one coherent sloping ground plane, sea and timber piers along the lower-right shoreline, warm sand, an inland terrace at top center, branching dirt roads and prepared empty foundation plots, sparse palms and wind-bent coastal vegetation only at the perimeter, northwest sunlight, open central space for modular buildings, absolutely no constructed buildings or walls
```

### S5 — original starting city

```text
wide 16:11 high-angle three-quarter view of an 18th-century Caribbean harbor settlement for a commercial pirate strategy game, one coherent sloping ground plane and consistent building scale, sea along the lower-right shoreline, central town hall on the top-center terrace, economy quarter on the left, recruitment quarter on the right, shipyard touching the lower-right water, northwest sunlight and soft contact shadows, an intentional early settlement with only a dignified town hall and a modest barracks constructed, generous empty prepared plots, connected dirt roads, a small landing jetty, no other buildings and no fortification
```

### S6 — original midgame city

```text
wide 16:11 high-angle three-quarter view of an 18th-century Caribbean harbor settlement for a commercial pirate strategy game, one coherent sloping ground plane and consistent building scale, sea along the lower-right shoreline, central town hall on the top-center terrace, economy quarter on the left, recruitment quarter on the right, shipyard touching the lower-right water, northwest sunlight and soft contact shadows, an intentional growing settlement containing town hall, crooked tavern, shoreline shipyard, sawmill, trade house, barracks, garrison hall and a timber palisade segment, with several clearly empty prepared plots reserved for later construction
```

### S7 — original full city

```text
wide 16:11 high-angle three-quarter view of an 18th-century Caribbean harbor settlement for a commercial pirate strategy game, one coherent sloping ground plane and consistent building scale, sea along the lower-right shoreline, central town hall on the top-center terrace, economy quarter on the left, recruitment quarter on the right, shipyard touching the lower-right water, northwest sunlight and soft contact shadows, a fully built prosperous harbor city containing a commanding town hall, crooked tavern, large shoreline shipyard and drydock, sawmill and trade-house economy buildings, barracks and grand arsenal recruitment buildings, and a coherent stone citadel wall with towers across the front; readable districts, restrained smoke and tiny ambient figures
```

### S8 — strict empty backdrop

```text
(completely empty illustrated buildable harbor ground:1.5), (horizonless high-angle isometric environment:1.35), wide 16:11 vacant Caribbean coastal landscape for a commercial pirate strategy game, one coherent gently sloping ground plane, natural sea along only the lower-right edge, warm sand, an inland terrace at top center, branching dirt roads and subtle empty foundation clearings, sparse palms and wind-bent coastal vegetation only at the perimeter, northwest sunlight, open central space for modular buildings; absolutely no houses, huts, towers, walls, docks, boats, flags or people
```

### S9 — colonial starting city

```text
(horizonless high-angle isometric colonial Caribbean harbor diorama:1.45), camera looking down at 55 degrees with no visible sky or distant horizon, wide 16:11 18th-century pirate harbor settlement for a commercial strategy game, Spanish colonial and Georgian British architecture with whitewashed limestone, timber framing, red clay tile and weathered shingle gabled roofs, one coherent sloping ground plane and consistent building scale, sea along the lower-right shoreline, central town hall on the top-center terrace, economy quarter on the left, recruitment quarter on the right, shipyard touching the lower-right water, northwest sunlight and soft contact shadows, an intentional early settlement with (only two constructed buildings:1.45): one dignified town hall and one modest barracks, generous empty prepared plots, connected dirt roads and natural shoreline, no other buildings and no fortification
```

### S10 — colonial midgame city

```text
(horizonless high-angle isometric colonial Caribbean harbor diorama:1.45), camera looking down at 55 degrees with no visible sky or distant horizon, wide 16:11 18th-century pirate harbor settlement for a commercial strategy game, Spanish colonial and Georgian British architecture with whitewashed limestone, timber framing, red clay tile and weathered shingle gabled roofs, one coherent sloping ground plane and consistent building scale, sea along the lower-right shoreline, central town hall on the top-center terrace, economy quarter on the left, recruitment quarter on the right, shipyard touching the lower-right water, northwest sunlight and soft contact shadows, an intentional growing settlement containing town hall, crooked tavern, shoreline shipyard, sawmill, trade house, barracks, garrison hall and a timber palisade segment, with several clearly empty prepared plots reserved for later construction
```

### S11 — colonial full city, first anchor pass

```text
(horizonless high-angle isometric colonial Caribbean harbor diorama:1.45), camera looking down at 55 degrees with no visible sky or distant horizon, wide 16:11 18th-century pirate harbor settlement for a commercial strategy game, Spanish colonial and Georgian British architecture with whitewashed limestone, timber framing, red clay tile and weathered shingle gabled roofs, one coherent sloping ground plane and consistent building scale, sea along the lower-right shoreline, central town hall on the top-center terrace, economy quarter on the left, recruitment quarter on the right, shipyard touching the lower-right water, northwest sunlight and soft contact shadows, a fully built prosperous harbor city containing a commanding town hall, crooked tavern, large shoreline shipyard and drydock, sawmill and trade-house economy buildings, barracks and grand arsenal recruitment buildings, and a coherent stone citadel wall with towers across the front; readable districts, restrained smoke and tiny ambient figures
```

### S12 — colonial full city, reinforced anchors

```text
(horizonless high-angle isometric colonial Caribbean harbor diorama:1.45), camera looking down at 55 degrees with no visible sky or distant horizon, wide 16:11 18th-century pirate harbor settlement for a commercial strategy game, Spanish colonial and Georgian British architecture with whitewashed limestone, timber framing, red clay tile and weathered shingle gabled roofs, one coherent sloping ground plane and consistent building scale, sea along the lower-right shoreline, central town hall on the top-center terrace, economy quarter on the left, recruitment quarter on the right, shipyard touching the lower-right water, northwest sunlight and soft contact shadows, a fully built prosperous harbor city with (a massive stone citadel wall, gatehouse and cannon bastion clearly spanning the foreground:1.5), (a large timber shipyard crane and drydock clearly touching the lower-right shoreline:1.4), a commanding town hall, crooked tavern, sawmill and trade-house economy buildings, barracks and grand arsenal recruitment buildings; each role has a distinct silhouette, readable districts, restrained smoke and tiny ambient figures
```

## Style fragments

### A1 — initial DreamShaper 8 style

```text
hand-painted nautical atlas gouache, matte pigment on lightly fibrous paper, confident dark-ink contour accents, broad simplified shapes, restrained texture density, warm sun-faded greens and parchment earth, crisp silhouette hierarchy, premium polished 2D game illustration, not photorealistic
```

### A2 — reinforced DreamShaper 8 style

```text
(flat cel-shaded gouache game illustration:1.4), (stylized 2D game art:1.3), matte pigment on lightly fibrous paper, confident dark-ink contour accents, broad simplified shapes, restrained texture density, warm sun-faded greens and parchment earth, crisp silhouette hierarchy, premium polished 2D game illustration, not photorealistic
```

### B — DreamShaperXL Turbo style

```text
luxurious hand-painted strategy-game diorama, layered gouache and oil-brush texture, dimensional but clearly illustrated, sculpted terrain depth, luminous turquoise water, warm limestone, weathered timber and tiny brass highlights, selective fine detail, soft atmospheric depth, premium commercial game key art, not photorealistic
```

## Composition fragments

### C1 — initial high-angle

```text
orthographic-feeling high-angle camera, full scene visible,
```

### C2 — strict map

```text
strict top-down orthographic atlas composition, every island edge visible,
```

### C3 — city three-quarter

```text
orthographic-feeling high-angle three-quarter composition, full scene visible,
```

## Negative profiles

### NA1 — DreamShaper 8 r1

```text
photograph, photorealistic, 3d render, glossy plastic, mobile app icon, circular badge, medallion, isolated object, border, frame, interface, HUD, text, labels, letters, numbers, logo, watermark, grid, square tiles, repeated pattern, collage, split screen, cutaway, horizon, sky, extreme perspective, blur, low detail, muddy
```

### NA2 — DreamShaper 8 r2

```text
photograph, photorealistic, aerial photography, satellite photo, cinematic landscape, 3d render, glossy plastic, mobile app icon, circular badge, medallion, isolated object, border, frame, interface, HUD, text, labels, letters, numbers, logo, watermark, grid, square tiles, repeated pattern, collage, split screen, cutaway, horizon, sky, extreme perspective, blur, low detail, muddy
```

### NB1 — DreamShaperXL Turbo r1

```text
photograph, photorealistic, generic 3d asset render, glossy plastic, tilt-shift photo, mobile app icon, circular badge, medallion, border, frame, interface, HUD, text, labels, letters, numbers, logo, watermark, grid, square tiles, repeated pattern, collage, split screen, cutaway, horizon, sky, extreme perspective, bloom, blur, muddy, oversaturated
```

### NB2 — DreamShaperXL Turbo r2/r3

```text
photograph, photorealistic, generic 3d asset render, glossy plastic, tilt-shift photo, Asian architecture, Japanese architecture, Chinese architecture, Southeast Asian architecture, pagoda, temple, curved Asian roof, stilt-house village, thatched resort, mobile app icon, circular badge, medallion, border, frame, interface, HUD, text, labels, letters, numbers, logo, watermark, grid, square tiles, repeated pattern, collage, split screen, cutaway, horizon, sky, extreme perspective, bloom, blur, muddy, oversaturated
```

## Source recipe map

All seeds are decimal. Positive and negative hashes are the first eight hexadecimal characters of SHA-256 over the exact UTF-8 strings.

| Project source                          | Subject | Style | Composition | Negative |    Seed | Positive hash | Negative hash |
| --------------------------------------- | ------- | ----- | ----------- | -------- | ------: | ------------- | ------------- |
| `a-chartmakers-gouache-map-r1.webp`     | S1      | A1    | C1          | NA1      | 6071001 | `f055983c`    | `fea57c9d`    |
| `a-chartmakers-gouache-empty-r1.webp`   | S2      | A1    | C1          | NA1      | 6071002 | `ef9b698c`    | `fea57c9d`    |
| `a-chartmakers-gouache-map-r2.webp`     | S3      | A2    | C2          | NA2      | 6071001 | `35e182eb`    | `ddf56d76`    |
| `a-chartmakers-gouache-empty-r2.webp`   | S4      | A2    | C3          | NA2      | 6071002 | `9eb4bc56`    | `ddf56d76`    |
| `a-chartmakers-gouache-start-r2.webp`   | S5      | A2    | C3          | NA2      | 6071003 | `8f44e8e5`    | `ddf56d76`    |
| `a-chartmakers-gouache-mid-r2.webp`     | S6      | A2    | C3          | NA2      | 6071004 | `d3c96587`    | `ddf56d76`    |
| `a-chartmakers-gouache-full-r2.webp`    | S7      | A2    | C3          | NA2      | 6071005 | `2d765427`    | `ddf56d76`    |
| `b-gilded-harbor-diorama-map-r1.webp`   | S3      | B     | C2          | NB1      | 6071001 | `915242c1`    | `a9ce11fe`    |
| `b-gilded-harbor-diorama-empty-r1.webp` | S4      | B     | C3          | NB1      | 6071002 | `6c24f573`    | `a9ce11fe`    |
| `b-gilded-harbor-diorama-start-r1.webp` | S5      | B     | C3          | NB1      | 6071003 | `76a8d9f5`    | `a9ce11fe`    |
| `b-gilded-harbor-diorama-mid-r1.webp`   | S6      | B     | C3          | NB1      | 6071004 | `e6e05f55`    | `a9ce11fe`    |
| `b-gilded-harbor-diorama-full-r1.webp`  | S7      | B     | C3          | NB1      | 6071005 | `02c375ee`    | `a9ce11fe`    |
| `b-gilded-harbor-diorama-empty-r2.webp` | S8      | B     | C3          | NB2      | 6071002 | `9145e938`    | `e5ab33e6`    |
| `b-gilded-harbor-diorama-start-r2.webp` | S9      | B     | C3          | NB2      | 6071003 | `1cfed78b`    | `e5ab33e6`    |
| `b-gilded-harbor-diorama-mid-r2.webp`   | S10     | B     | C3          | NB2      | 6071004 | `3c32e5f5`    | `e5ab33e6`    |
| `b-gilded-harbor-diorama-full-r2.webp`  | S11     | B     | C3          | NB2      | 6071005 | `5eacf19c`    | `e5ab33e6`    |
| `b-gilded-harbor-diorama-full-r3.webp`  | S12     | B     | C3          | NB2      | 6071005 | `e86937eb`    | `e5ab33e6`    |

## Model and sampler profiles

| Direction  | Checkpoint                               | Native latent | Steps | CFG | Sampler     | Scheduler | Project export                           |
| ---------- | ---------------------------------------- | ------------- | ----: | --: | ----------- | --------- | ---------------------------------------- |
| A r1       | `DreamShaper_8_pruned.safetensors`       | 1024×704      |    32 | 7.5 | `dpmpp_2m`  | `karras`  | 1024×704 RGB WebP, quality 91            |
| A r2       | `DreamShaper_8_pruned.safetensors`       | 512×352       |    32 | 7.5 | `dpmpp_2m`  | `karras`  | Lanczos to 1024×704 RGB WebP, quality 91 |
| B r1/r2/r3 | `DreamShaperXL_Turbo_V2-SFW.safetensors` | 1024×704      |     8 | 2.0 | `dpmpp_sde` | `karras`  | 1024×704 RGB WebP, quality 91            |

Generation used the repository's `scripts/art/comfyui_client.py` against local ComfyUI 0.27.0 on the MPS device. The current `tools/generate_sources.py` contains the final corrective recipe used by B r2/r3 and the seed/model map; this file preserves superseded prompt text exactly.
