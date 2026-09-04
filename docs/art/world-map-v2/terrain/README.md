# Terrain presentation addendum

This issue-#611 package extends the approved issue-#609 **Direction B — Gilded Harbor
Diorama** family with render-only terrain variation. It does not add a biome, movement,
production, vision, combat, generation, save, or replay field. Forest, clearing, and highland
marks are scenic only.

## Semantic zoom contract

`MapCanvas` selects a band from the on-screen size of its 32 px world tile. The previous band
owns the dead zone, so slow bidirectional zoom does not chatter.

| Band     | Nominal range                           | Presentation                                                                                                                                                                                       |
| -------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview | below 12.8 screen px per tile (0.40×)   | Traced land/water silhouettes, fog, cities, fleets, and bounded geometric strategic markers. No per-cell terrain sprites, decals, glints, caustics, routes, range fills, or entity texture lookup. |
| Tactical | 12.8–47.999 screen px per tile          | Normal entity art, routes/ranges, encounters/sites, land bases, sparse decals, glints, and layered coast.                                                                                          |
| Detail   | 48 screen px per tile and above (1.50×) | Tactical content plus rich decals and caustics.                                                                                                                                                    |

Overview exits upward at 14.4 px and tactical exits downward at 11.2 px. Tactical exits upward
at 51.2 px and detail exits downward at 44.8 px. Direct jumps across both bands are allowed.
Marker diameters are clamped by family in screen pixels; interaction remains on the existing
topology-aware tile coordinates.

Full entity art retains its authored family/class proportions inside an authoritative screen-space
band: 24–40 px in tactical and 40–64 px in detail. Ownership rings use the same bounds, including
the 0.45× and 3× camera extrema and both hysteresis transition edges. The bounds are presentation
only; tile-coordinate hit testing and camera behavior are unchanged.

## Determinism, topology, and privacy

- Terrain selection uses a fixed FNV-1a/integer-avalanche hash of integer coordinates, visible
  tile content, and topology. It never calls `Math.random()`, `Date.now()`, engine RNG, or mutable
  global state.
- Square classification uses eight neighbors. Odd-r hex classification uses six parity-aware
  neighbors. A map edge is explicit and never invented as water.
- The renderer supplies an exploration predicate before neighbor tile content is read. Unknown
  neighbors stay `unknown`, so a dock cannot point at or reveal unseen water.
- City eligibility remains own-or-explored. Fleet and party eligibility remains own-or-visible.
  Encounter and site eligibility remains visible. Inactive/unavailable markers remain absent.
- A theme's directed variant wins only if it decodes, followed by its decoded base, the decoded
  shipped default, and finally procedural art. The same runtime chain covers bases, decals, and
  ports. Its finite preload list contains every rung, is independent of map contents and hidden
  coordinates, and replaces the unused 37,086-byte legacy land/port preload.

## Asset contract and preparation

Three 128×128 land bases share a one-channel-step-or-better periodic edge field, while their
interiors remain distinct. Two forest decals, one clearing, one highland, and two right-facing
port overlays use full-range alpha. The renderer rotates either port overlay toward a known
adjacent water neighbor for square or hex topology.

The original built-in image-generator PNGs exceeded the repository image ceiling and are not
committed. `terrain-registry.json` records their exact filenames, hashes, sizes, dimensions,
modes, selection/rejection status, generation service, unavailable model/seed fields, and style
reference. Project-bound normalized 256 px sources are retained under `sources/`.

`tools/prepare_terrain.py` verifies those raw records during ingestion, converts rendered
checker backgrounds to alpha where required, builds a shared seamless edge field, publishes
runtime WebP files, composes the 5×5/contact proofs, and records hashes and budgets in
`terrain-receipt.json`. Its normal audit mode needs only committed files:

```sh
/Users/johnharvieux/aop-ai-tools/venv/bin/python \
  docs/art/world-map-v2/terrain/tools/prepare_terrain.py --check
```

`--publish` deterministically rebuilds runtime/proof outputs from the committed normalized sources;
`--check` rebuilds in a temporary directory, byte-compares the trees and receipt, and verifies the
runtime-capture binding.

Observed delivery: nine runtime images total 148,968 bytes; the largest committed terrain image
is the 99,544-byte hex 5×5 proof, below the 300 KiB ceiling. Both selected 5×5 coordinate crops
have five unique rows and columns, balanced use of all three bases, no axis run longer than three,
14 (square) or 16 (hex) distinct 2×2 motifs, no parity holding more than 55% of one base, and no
tested translation with more than 50% matching ids. The pixel validator additionally requires every
base-interior pair to differ by a mean of at least six channel steps and every one/two-cell proof
translation to differ by at least 3.5 channel steps. Decoded runtime edges differ by at most one
channel step across any variant pairing.

## Proofs and review notes

- `proofs/seam-no-repeat-5x5.webp` is the exact square-topology coordinate selection for x/y
  0–4. It demonstrates the shared edges and selection motif.
- `proofs/seam-no-repeat-5x5-hex.webp` applies the exact same native-resolution proof to odd-r hex
  selection, without inventing or reading neighboring map content.
- `proofs/terrain-contact-sheet.webp` shows every shipped base/decal/port candidate. Slots are
  ordered land A/B/C, forest A/B/clearing, then highland/straight port/L-port.
- `RUNTIME-CAPTURES.md` shows overview, tactical, and detail from the same 96×96 session at
  1440×900 and 390×844. `PERFORMANCE.md` records the seeded square/hex draw-work trace.
- Both proof images and all nine runtime images were inspected at original resolution. The first
  L-port output was rejected for an opaque vignette. A targeted generator edit established
  transparent bounds; deterministic foreground cleanup removed its remaining dark rectangular
  halo while retaining attached dock shadow.
- No wake texture was generated: the issue made it optional, and a baked wake would duplicate
  water-direction state that the current static map model does not provide.

## Generation and usage basis

All nine concepts and the one corrective background edit were made with the built-in OpenAI
image generator through the user's subscription, as authorized by D-049. Each concept was a
separate call. The interface exposed neither model ID nor seed, so both are recorded as `null`;
no API key or paid API generation path was used. The outputs were made for this project and are
used subject to the applicable OpenAI terms. No third-party stock art was used as generation
input, and this package makes no exclusivity or copyrightability claim.

Exact request bodies are in `PROMPTS.md`. The only generation reference was the locally approved
Direction B map source recorded in `terrain-registry.json`; its role was limited to style,
material, palette, camera, and lighting.
