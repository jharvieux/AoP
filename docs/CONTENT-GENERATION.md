# Content generation pipeline

How locally-generated audio and art get from a text prompt into the game. This complements
the tool-level setup guide (`docs/AI-TOOLS-GUIDE.md`) with the parts that are repo-specific:
where generated files live, what "done" looks like, and which files in this codebase they
hook into.

**Status as of this writing**: the tooling to generate NPC dialogue clips (issue #75,
script at `~/aop-ai-tools/`) exists and works, but the 10 predefined `.wav` files have not
yet been committed to `main` (they live on a still-open PR, #78). Background music
(MusicGen) and generic gameplay SFX (procedural synthesis) are generated and wired in —
see `docs/runbooks/music-sfx-generation.md`. Art generation (Stable Diffusion WebUI) is
installed but unused — the map still renders as flat-color PixiJS shapes (see
`MapCanvas.tsx`), matching decision D-008 ("stylized 2D sprites") as a not-yet-built
target. The two worked examples below show the integration as it would be built today,
using the code patterns already in the repo.

## Pipeline: generate → curate → integrate

```
 ┌──────────┐      ┌───────────┐      ┌─────────────┐      ┌──────────────────┐
 │  Prompt  │ ───▶ │ Generate  │ ───▶ │   Curate    │ ───▶ │     Integrate     │
 │ (text /  │      │ (Piper /  │      │ (listen /   │      │ (commit asset +   │
 │  dialogue│      │  Stable   │      │  eyeball,   │      │  wire into code   │
 │  line)   │      │ Diffusion)│      │  discard    │      │  or content data) │
 └──────────┘      └───────────┘      │  bad takes) │      └──────────────────┘
                                       └─────────────┘
```

1. **Generate** — run a script or the Stable Diffusion WebUI locally. Nothing here touches
   the repo; output lands in a scratch or `public/` directory on disk.
2. **Curate** — a human (or an agent instructed to) listens/looks at every generated
   candidate and throws away anything that fails the quality bar below. Generation is cheap
   and non-deterministic; regenerate rather than accept a mediocre take.
3. **Integrate** — the surviving asset gets a stable filename, is placed under
   `apps/web/public/`, and is either referenced directly from a component (audio) or wired
   through `@aop/content` (anything that varies by faction/unit/encounter, so balance/content
   changes don't require code changes).

Nothing in `@aop/engine` ever touches generated assets — per the engine invariants in
`CLAUDE.md`, the engine is pure data in/data out. Audio and art are strictly presentation,
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

**Art (Stable Diffusion)**

- Style: stylized 2D (per D-008), not photoreal — matches the flat-color/vector look the
  map already has in `MapCanvas.tsx`.
- Resolution: generate at a size that maps cleanly onto the tile/sprite grid the client
  uses (`TILE = 32` px in `MapCanvas.tsx`; export sprites as a multiple of that, e.g.
  64×64 or 128×128, then downscale — upscaling a small generation looks worse than
  generating larger and shrinking).
- Consistent style _within_ a faction: reuse the same prompt template/seed family for all
  assets of one faction so ships/units/banners don't look like they came from different
  games.
- Background: transparent PNG for anything composited over the map or UI (ships, unit
  portraits, banners); no baked-in drop shadows or matte color that won't match the map's
  palette.

**Performance**

- Asset loading must never block a turn or a render frame. Preload during idle time
  (menu screens, between-turn AI "thinking" delay — see `AI_STEP_MS` in `GameScreen.tsx`),
  not synchronously on first use.
- Keep per-asset file size small: audio clips a few seconds long, sprites sized per the
  resolution guidance above. This is a client-side PWA (`docs/ARCHITECTURE.md` §4) —
  everything ships in the bundle or is fetched over the network to a phone.
- Curate aggressively before committing. Every asset that lands in `apps/web/public/` ships
  to every player forever (or until someone notices and deletes it) — don't commit
  generation experiments.

## Integration points in the codebase

| What varies                   | Lives in                                                             | Notes                                                                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Encounter flavor text/choices | `packages/content/src/encounters.ts`                                 | Pure data — no dialogue audio hook exists yet (see Example 1).                                                                                                                                               |
| Encounter dialogue _display_  | `apps/web/src/screens/GameScreen.tsx` (`encounter` modal, ~line 324) | Currently a static per-kind title string; this is where an audio cue would be triggered.                                                                                                                     |
| Faction names/rosters         | `packages/content/src/factions.ts`                                   | No art field on `FactionDef` yet; would need one to reference generated art by faction id (see Example 2).                                                                                                   |
| Map/entity rendering          | `apps/web/src/MapCanvas.tsx`                                         | Currently `pixi.js` `Graphics` with flat-color fills (`TILE_COLOR`, `OWN_SHIP`, `ENEMY_SHIP`, `ENCOUNTER_COLOR`, …). This is where `Sprite`/`Texture` would replace `Graphics.fill()` calls once art exists. |
| Generated audio files         | `apps/web/public/audio/generated/*.wav`                              | Written directly by `~/aop-ai-tools/generate-game-audio-piper.py`. Scripts and tooling exist (issue #75); new/regenerated clips need an explicit `git add` (not the whole directory) before commit.          |
| Background music              | `apps/web/public/audio/music/*.wav`                                  | Written by `~/aop-ai-tools/generate_game_music.py` (MusicGen). Selected by `apps/web/src/audio/musicClips.ts`'s `selectGameplayMusicContext()`; see `docs/runbooks/music-sfx-generation.md`.                 |
| Generic gameplay SFX          | `apps/web/public/audio/sfx/*.wav`                                    | Written by `~/aop-ai-tools/generate_game_sfx.py` (procedural synthesis, no model). Played via `apps/web/src/audio/feedback.ts`; see `docs/runbooks/music-sfx-generation.md`.                                 |
| Generated art files (future)  | `apps/web/public/art/...` (convention, doesn't exist yet)            | Suggested split: `art/factions/<factionId>/`, `art/units/<unitId>.png`.                                                                                                                                      |

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

Say you want a ship sprite for the Pirates faction to replace the flat-color triangle
`MapCanvas.tsx` currently draws for `OWN_SHIP`/`ENEMY_SHIP`.

1. **Prompt in the established style** (stylized 2D, per D-008) via Stable Diffusion WebUI
   at `http://localhost:7860` (start with `python ~/aop-ai-tools/stable-diffusion-webui/launch.py`):

   > "top-down stylized 2D pirate sloop, flat colors, clean outlines, game asset, transparent
   > background, no shadow, 128x128"

   Generate several seeds from the same prompt template — you'll want the same template
   reused for every Pirates unit so the faction reads as one visual family.

2. **Curate**: reject anything photoreal, off-model, or with a baked-in background/shadow
   that won't composite over the map's flat tile colors. Keep 128×128 (a multiple of the
   32px tile grid) and re-export/trim any stray padding.

3. **Place the file** using the suggested convention:
   `apps/web/public/art/factions/pirates/ship.png`.

4. **Wire it into content data** — add an art field so the client can look up the sprite by
   faction id instead of hardcoding a path per component:

   ```ts
   // packages/content/src/factions.ts
   export interface FactionDef {
     id: FactionId
     name: string
     description: string
     units: UnitDef[]
     shipSpriteUrl?: string // '/art/factions/pirates/ship.png'
   }
   ```

5. **Integrate into rendering** — `MapCanvas.tsx` currently draws ships with
   `entities.fill(own ? OWN_SHIP : ENEMY_SHIP)` on a `Graphics` object (~line 167). Swapping
   in art means loading a `pixi.js` `Texture` from `FACTIONS[faction].shipSpriteUrl` and
   drawing a `Sprite` instead of a filled shape for that entity — the flat-color fill stays
   as the fallback for factions/units that don't have art yet, so the map degrades
   gracefully while art is generated incrementally.

6. **Performance check**: preload faction textures once per match (when the match's
   factions are known), not per-frame or per-tile-render.
