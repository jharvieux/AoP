# Content generation pipeline

How locally-generated audio and art get from a text prompt into the game. This complements
the tool-level setup guide (`docs/AI-TOOLS-GUIDE.md`) with the parts that are repo-specific:
where generated files live, what "done" looks like, and which files in this codebase they
hook into.

**Status as of this writing**: background music (MusicGen) and generic gameplay SFX
(procedural synthesis) are generated and wired in; see
`docs/runbooks/music-sfx-generation.md`. NPC dialogue generation tooling also exists under
`~/aop-ai-tools/`, although dialogue playback is not yet a production integration point.
The world map now ships authored raster land/port tiles, cities, ships, parties,
encounters, and sites over procedural terrain, water, fog, markers, and decode-failure
fallbacks. Its
approved visual north star is Direction B — Gilded Harbor Diorama (D-049), which builds on
the stylized 2D sprite choice in D-008 and the Weathered Parchment & Rope application
palette in D-023. The examples below describe the current separation between presentation
art and deterministic game data.

## Pipeline: generate → curate → integrate

```
┌────────────┐   ┌────────────┐   ┌──────────────┐   ┌────────────────────┐
│   Prompt   │ → │  Generate  │ → │ Curate/prove │ → │     Integrate      │
│ text/line  │   │ Piper /    │   │ inspect,     │   │ normalize, publish │
│ + refs     │   │ OpenAI /   │   │ compare,     │   │ + bind to the      │
│            │   │ local tools│   │ reject       │   │ right consumer     │
└────────────┘   └────────────┘   └──────────────┘   └────────────────────┘
```

1. **Generate** — use the tool appropriate to the medium. Current Direction B map batches
   may use the built-in OpenAI image generator when it materially improves the result, as
   authorized by D-049. ComfyUI remains available for evaluated local workflows under
   D-041; it is neither the production style authority nor a required fallback. Keep raw
   output in scratch space until it has been selected and normalized.
2. **Curate and prove** — inspect every candidate at native size and at its actual runtime
   sizes. Reject off-model work and record useful rejects. For generated art, preserve the
   exact prompt, service/tool/date, input-reference roles and hashes, original and retained
   hashes, normalization receipt, usage basis, and truthful `null` values when the interface
   does not expose model or seed.
3. **Integrate** — publish only optimized, stable filenames under `apps/web/public/` and
   bind them to their presentation consumer. Cosmetic world-map defaults and theme
   overrides belong in the web presentation layer (`mapArtRegistry.ts` and `mapSprites.ts`),
   not `@aop/content`: changing content package bytes changes `ENGINE_VERSION` and replay
   compatibility. Put data in `@aop/content` only when it actually defines gameplay or
   semantic content rather than an art URL.

Nothing in `@aop/engine` ever touches generated assets — per the engine invariants in
`AGENTS.md`, the engine is pure data in/data out. Audio and art are strictly presentation,
selected by the client from IDs the engine already emits (faction id, encounter kind, etc).

## Quality standards

**Audio (TTS dialogue / SFX)**

- Intelligible at normal playback volume on a phone speaker — the primary client is
  mobile-first (`docs/ARCHITECTURE.md` §4).
- Line reads the character: pacing/tone should not clash with the faction or encounter
  flavor text already in `packages/content/src/encounters.ts` / `factions.ts`.
- No dead air longer than ~0.5s at the start/end of the clip (trim before committing).
- Keep clips short — dialogue barks, not narration paragraphs. Long lines increase both load
  time and the chance of a bad take.
- File format: mono 16-bit PCM `.wav` (what Piper emits by default) is fine for now; revisit
  compression (Opus/AAC) only if asset size becomes a real problem.

**Art (Direction B — Gilded Harbor Diorama)**

- Style: hand-painted, stylized 2D strategy-game miniatures (D-008 and D-049), not
  photorealism, flat-vector badges, or isolated 3D renders. Preserve the approved
  near-overhead camera, northwest light, warm material depth, quiet ornament, optical
  baseline, and broad silhouette hierarchy across the whole family.
- Identity: faction and class must remain readable without hue. Use architecture,
  formation, hull/sail plan, kit, pattern, and silhouette cues; verify faction comparisons
  in both color and grayscale.
- Source and export: generate large enough to inspect cleanly (the current map-token
  pipeline normalizes selected sources to 512 px RGBA), then use premultiplied-alpha,
  aspect-ratio-preserving resizing to export a 256 px WebP runtime token. Evaluate every
  token at exact 24, 32, 48, and 96 CSS px instead of assuming a nominal tile multiple
  guarantees clarity.
- Transparency: map tokens need genuine alpha with zero RGB under fully transparent pixels.
  Do not ship pale mattes, checkerboards, baked terrain, contact plates, drop shadows,
  selection rings, flags, text, signatures, or watermarks. Inspect the complete native and
  96 px footprint over representative terrain, near-black, saturated magenta, and cyan.
- Provenance and reproducibility: issue one distinct generation request per asset or
  variant; record the exact request and every input's role/hash. Deterministic local tools
  own crop, matte cleanup, premultiplied resize, optical alignment, optimization, contact
  sheets, byte receipts, and rebuild checks. A shared style reference is useful, but a seed
  or prompt-family label is not evidence that separately generated assets are coherent.

**Performance, readiness, and privacy**

- A selected world-map texture may gate the first interactive, art-bearing frame until it
  either loads or definitively fails. That finite readiness gate prevents a procedural
  placeholder from visibly popping into a sprite; a failed decode settles to the permanent
  procedural fallback instead of hanging the map.
- Build the critical preload set only from entities the current viewer is already eligible
  to know under the existing visibility/exploration rules. Never derive, request, or warm a
  hidden faction, class, encounter, or site URL. Defer unseen and detail-only art.
- Rendering and preload must resolve the same winning URL: theme override first, registered
  web default second, procedural fallback on missing or failed art. A separate preload URL
  table will drift and can reintroduce both pop and privacy defects.
- Keep per-asset files small and bind budgets to a complete file census. The current map
  proof uses a 128 KiB ordinary-token target, 300 KiB hard per-image ceiling, and a measured
  cold-cache critical set. This is a client-side PWA (`docs/ARCHITECTURE.md` §4), so every
  published byte matters on phones.
- Curate aggressively before committing. Preserve hashes and metadata for meaningful
  unretained originals/rejects, but do not place generation experiments in public runtime
  directories.

## Integration points in the codebase

| What varies                   | Lives in                                                             | Notes                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Encounter flavor text/choices | `packages/content/src/encounters.ts`                                 | Pure data — no dialogue audio hook exists yet (see Example 1).                                                                                                                                                                                                                                                                |
| Encounter dialogue _display_  | `apps/web/src/screens/GameScreen.tsx` (`encounter` modal, ~line 324) | Currently a static per-kind title string; this is where an audio cue would be triggered.                                                                                                                                                                                                                                      |
| Faction names/rosters         | `packages/content/src/factions.ts`                                   | Gameplay/content data. Legacy art URLs may remain for existing consumers, but new world-map cosmetic defaults do not belong here.                                                                                                                                                                                             |
| World-map art defaults        | `apps/web/src/mapArtRegistry.ts`                                     | Pure presentation registry for tiles, six city identities, five-by-four ship variants, faction parties, sea/land encounters, and sites. It is testable without Pixi.                                                                                                                                                          |
| Theme sprite overrides        | `apps/web/src/mapSprites.ts`                                         | Resolves the active presentation theme ahead of the web default. Render and preload share this resolver contract.                                                                                                                                                                                                             |
| Map/entity rendering          | `apps/web/src/MapCanvas.tsx`                                         | Hybrid Pixi renderer: authored `Sprite`/`Texture` assets are composed with procedural terrain, water, fog, markers, overlays, and stable decode-failure shapes. Eligible winning URLs settle before the interactive world is revealed.                                                                                        |
| Generated audio files         | `apps/web/public/audio/generated/*.wav`                              | Written directly by `~/aop-ai-tools/generate-game-audio-piper.py`. Scripts and tooling exist (issue #75); new/regenerated clips need an explicit `git add` (not the whole directory) before commit.                                                                                                                           |
| Background music              | `apps/web/public/audio/music/*.{wav,ogg,m4a}`                        | `.wav` master written by `~/aop-ai-tools/generate_game_music.py` (MusicGen); `.ogg`/`.m4a` are the shipped formats, produced by `apps/web/scripts/encode-music.mjs` (#253). Selected by `apps/web/src/audio/musicClips.ts`'s `selectGameplayMusicContext()`/`pickMusicSource()`; see `docs/runbooks/music-sfx-generation.md`. |
| Generic gameplay SFX          | `apps/web/public/audio/sfx/*.wav`                                    | Written by `~/aop-ai-tools/generate_game_sfx.py` (procedural synthesis, no model). Played via `apps/web/src/audio/feedback.ts`; see `docs/runbooks/music-sfx-generation.md`.                                                                                                                                                  |
| Generated world-map art       | `apps/web/public/art/{cities,factions,parties,encounters,sites}/...` | Shipping, optimized presentation assets. Source/provenance, actual-size sheets, alpha-stress proofs, public byte receipts, and deterministic validators live under `docs/art/world-map-v2/`.                                                                                                                                  |

## Example: add a new NPC dialogue line

Say you want the `natives` encounter's `fight` choice to bark a line when the player picks
it, similar to how `battle_charge`/`battle_taunt` were pre-generated.

1. **Write the line as data, not code.** If it's flavor tied to an encounter, it belongs
   next to the encounter definition. There's no `dialogue` field on `EncounterChoiceDef`
   in `packages/content/src/encounters.ts` yet — add one (or, for a single one-off line,
   skip this step and hardcode the audio filename where you play it):

   ```ts
   // packages/content/src/encounters.ts
   fight: {
     successChance: 0.55,
     reward: { gold: 180, iron: 10 },
     failTroopLossPct: 0.35,
     xp: 25,
     dialogue: 'native_fight_taunt', // maps to public/audio/generated/native_fight_taunt.wav
   },
   ```

2. **Generate the clip:**

   ```bash
   source ~/aop-ai-tools/venv/bin/activate
   python ~/aop-ai-tools/generate-game-audio-piper.py native \
     "You dare raise steel against us? So be it."
   # rename the output to native_fight_taunt.wav, or pass a filename per the
   # script's own usage (see docs/runbooks/audio-generation.md)
   ```

3. **Curate**: `afplay apps/web/public/audio/generated/native_fight_taunt.wav` and listen.
   Regenerate with different phrasing/punctuation (Piper's prosody is sensitive to
   punctuation) if it's flat or mispronounces something.

4. **Integrate**: play it where the choice resolves, in
   `apps/web/src/screens/GameScreen.tsx` `resolveEncounter()` (~line 174):

   ```ts
   function resolveEncounter(choice: string) {
     if (!selectedCaptain || !encounter) return
     const dialogueKey =
       game.config.content?.encounters?.[encounter.kind]?.choices?.[choice]?.dialogue
     if (dialogueKey) new Audio(`/audio/generated/${dialogueKey}.wav`).play()
     onAction({
       type: 'resolveEncounter',
       captainId: selectedCaptain.id,
       encounterId: encounter.id,
       choice: choice as EncounterChoice,
     })
     setEncounterId(null)
   }
   ```

5. **Commit** the `.wav` file alongside the content-data change so the two never drift apart.

## Example: generate and integrate faction art

Say you need a new faction/class ship variant that belongs beside the shipping Direction B
fleet.

1. **Review the approved references and write one concept request for this identity.** Use
   the Direction B map proof for camera, light, palette, and material language; use approved
   small- and heavy-class ships for finish and optical-baseline reference. Ask the built-in
   OpenAI image generator for a genuine transparent cutout with the specific faction and
   class silhouette. Explicitly forbid text, signatures, watermarks, baked terrain or water,
   selection rings, flags, and contact plates. One request must not silently supply several
   class/faction variants.

2. **Curate and normalize**: inspect the raw output at native size, record its exact prompt,
   inputs, service/tool/date, hashes, and whether the interface exposed model or seed.
   Reject an incoherent class silhouette rather than relabeling it. Normalize the selected
   source to a 512×512 RGBA review canvas, remove matte/contact contamination with documented
   semantic masks, preserve aspect ratio and the shared optical baseline, then produce the
   optimized 256 px exact-alpha WebP. Prove it on terrain, near-black, magenta, and cyan at
   native 512 and exact 96 px, and compare it at 24/32/48/96 in color and grayscale.

3. **Place the file** using the current convention, including its gameplay class:
   `apps/web/public/art/factions/pirates/ship_sloop_v2.webp`.

4. **Register the cosmetic default in the web presentation layer** — keep art URLs out of
   `@aop/content`, because content bytes participate in `ENGINE_VERSION` and replay
   compatibility. Add the faction/class path to the pure registry instead:

   ```ts
   // apps/web/src/mapArtRegistry.ts
   const DEFAULT_SHIP_URLS = {
     'pirates:sloop': '/art/factions/pirates/ship_sloop_v2.webp',
   }
   ```

5. **Use the shared resolver for rendering and preload** — `MapCanvas.tsx` calls
   `resolveMapShipUrl()` for both paths, with theme overrides ahead of the registered
   default. The procedural shape remains the decode/missing-file fallback. Do not create a
   second URL table in the renderer or preload path.

6. **Performance and privacy check**: build the finite preload set only from identities the
   current player is allowed to know, wait for each winning URL to load or fail once, and
   never derive a hidden faction/class URL merely to warm the cache. Validate the public
   file against its receipt, confirm render/preload URL parity and theme precedence, and
   reproduce the missing-file procedural fallback before shipping.
