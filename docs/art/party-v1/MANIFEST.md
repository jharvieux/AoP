# Party art v1 — first-pass candidates for operator review (2026-07-12)

> **#482 update (2026-07-12):** the operator-approved pick per faction has shipped — cutouts
> at `apps/web/public/art/parties/<factionId>.png` (downscaled from the 512² cutouts below
> to 160×160 to fit the 300 KB static-asset budget; see `apps/web/asset-size-allowlist.json`
> — well under budget at this size since these render as small map tokens). The picks are
> pirates #1 (seed1004), british #1 (seed1004), spanish #1 (seed1004, flag-fixed), dutch #1
> (seed1005, rebuilt per "Dutch flag rebuild" below), french #2 (seed1004) — see "Operator
> picks" below. The full masters/rejected-candidates tree never shipped past the
> `art/party-sprites-wip` branch — this file is copied forward only so the seeds, prompts,
> and flag-fix provenance stay discoverable for a future repaint.
>
> Content wiring (`packages/content/src/factions.ts`): every faction got a `partySpriteUrl`.
> Rendering (`apps/web/src/MapCanvas.tsx`): the party token now draws this sprite through the
> `resolveSpriteUrl` theme-pack override chain (`mapSprites.ts`'s `partyContentId`, same
> pattern as `factionFlagContentId` from #463); the existing flat-color triangular banner is
> kept as the 404/absence fallback, unchanged.

Landing parties (#465) currently render as a flat faction-color triangular banner token
on the map (`MapCanvas.tsx`, "Landing parties (#465)" comment, `TILE*0.24-0.3` radius —
rendered ~24-40px). This is the **PARTY ART** item of issue #482: first-pass sprite
candidates for the operator to review and pick from. **Nothing here is integrated** —
`apps/web` is untouched. Integration (content wiring + `MapCanvas.tsx` sprite draw,
following the same pattern ships/cities already use) is follow-up work after the operator
picks.

Subject: a small landing-party group emblem — 2-4 armed crew figures, most compositions
carrying the faction's banner planted in the ground — sized and styled to read clearly at
map-token scale.

## Generation

Local AUTOMATIC1111 (`~/aop-ai-tools/stable-diffusion-webui`, torch pinned 2.3.1 — see
`docs/AI-TOOLS-GUIDE.md`'s MPS warning), model `DreamShaper_8_pruned.safetensors`, sampler
Euler a, 28 steps, CFG 7, 512×512. Style prompt suffix and negative prompt are the **same
style family already shipped** for unit/ship art (`tier1_unit_art.py` /
`dreamshaper_repass.py`'s `STYLE_SUFFIX`/`NEGATIVE`), for visual continuity with
`apps/web/public/art/factions/<id>/unit_tier*.png`:

> `, flat cartoon illustration style, thick black outlines, simple flat color shading,
product shot on plain white studio background, isolated single object, video game asset,
no scenery`

Negative prompt additionally excludes `extra limbs, extra heads, deformed hands, fused
figures, mutated` on top of the shared unit-art negative list (group compositions are more
prone to limb/head fusion than single-figure unit icons).

Per-faction subject template (`party_art.py`, generation script, not committed to this repo
— lives at `~/aop-ai-tools/party_art.py` alongside the other art-tooling scripts):

> `game asset icon of a small landing party of two armed pirate-era crew members storming
ashore, cutlasses and pistols drawn, standing together as a group, {flavor}, dynamic
action pose, waist-up group composition, character icon`

| faction | flavor clause                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| pirates | ragged black and brown leather, a tattered black flag with a white skull planted in the ground, menacing outlaw raiders               |
| british | disciplined red coats and navy blue trim, a small British banner planted in the ground, orderly Royal Navy landing squad              |
| spanish | ornate cream and gold conquistador armor, a small gold and cream banner planted in the ground, opulent treasure-fleet raiders         |
| dutch   | sturdy dark wood-brown coats with orange and white accents, a small orange banner planted in the ground, practical VOC company guards |
| french  | deep blue coats with gold trim, a small blue and gold fleur-de-lis banner planted in the ground, elegant aggressive corsair raiders   |

`masters/` holds every generated candidate (4 seeds/faction, +2 extra for Dutch — see
below), `1001-1004`(-1006), so seeds are reproducible even for candidates not picked.
`cutouts/` holds only the **10 picked candidates** (2/faction) after background removal.

## Background removal

`rembg` (`isnet-general-use` model), run from the **separate** venv
(`~/aop-ai-tools/venv/bin/python3` — not the webui venv) per the established split in this
repo's tooling. Script: `~/aop-ai-tools/party_cutout.py`.

Manual fallback (`~/aop-ai-tools/party_dethreshold.py`, a hard alpha-channel threshold —
below the cutoff goes fully transparent, at/above is untouched) was needed on 4 of the 10
picks where a soft vignette/circle background left a translucent ghost smudge that `rembg`
didn't fully clear:

- `pirates_party_seed1001` — thresholded at 60. Clean result.
- `british_party_seed1001` — thresholded at 90 then 160 (two passes). The flag's pale
  upper-left corner was itself low-contrast against the vignette and got eaten along with
  the ghost, so the flag now reads as clipped at the top rather than a full pennant shape —
  the anchor emblem and red/blue field are still legible. Documented, not further fixed.
- `spanish_party_seed1003`, `spanish_party_seed1004` — thresholded at 90 for minor
  foot-shadow cleanup; both were already close to clean.

## Picks and per-candidate notes

Two candidates per faction, ranked #1 (top pick) / #2 (runner-up), chosen by the executing
agent as a first pass — **the operator makes the final pick**, including the option to
reject both and request a repaint.

| faction | pick | seed | notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ---- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pirates | #1   | 1004 | 3-figure group, clean white bg, sharp black/white skull flag. _Caveat_: a solid dark ground-mound shape is baked into the master (not translucent — same class of issue as the french #2 pick below) and survived the cutout as opaque foreground; not hand-edited out.                                                                                                                                                                                                     |
| pirates | #2   | 1001 | 4-figure group (incl. a smaller fifth silhouette), same flag family. Alpha-thresholded to remove a diagonal gradient ghost from the master's dark-vignette background.                                                                                                                                                                                                                                                                                                      |
| british | #1   | 1004 | 3-figure group, Union Jack banner, clean white bg, no rembg issues.                                                                                                                                                                                                                                                                                                                                                                                                         |
| british | #2   | 1001 | 3-figure group, red/blue/white banner with anchor emblem. Alpha-thresholded (see above) — flag's top-left corner is clipped as a side effect.                                                                                                                                                                                                                                                                                                                               |
| spanish | #1   | 1004 | 3-figure group, gold/black conquistador armor reads clearly. Originally drifted toward "Jolly Roger" maroon skull iconography instead of the requested heraldry — **flag fixed 2026-07-12** to the canonical Cross of Burgundy per operator direction, see "Operator picks" below.                                                                                                                                                                                          |
| spanish | #2   | 1003 | 2-figure group, ornate gold cross-and-crown banner on maroon — closer to the intended "opulent gold heraldry" flavor than #1.                                                                                                                                                                                                                                                                                                                                               |
| dutch   | #1   | 1005 | 3-figure group, clean bg. Required a second generation batch (seeds 1005-1006) — the first 4 Dutch seeds had no legible banner at all. Originally rendered twin solid-orange banners with a black anchor emblem instead of a national flag — **flag fixed 2026-07-12** to the canonical Dutch tricolor per operator direction, see "Operator picks" below. _Caveat_: opaque black ground-shadow blob baked into the master survived the cutout (same class as pirates #1).  |
| dutch   | #2   | 1004 | 3-figure group, orange/black, dynamic weapons-raised pose, clean bg. _Caveat_: no banner present — kept as the runner-up because it's the cleanest banner-less Dutch composition; the operator may prefer to wait for a repaint if a banner is a hard requirement here.                                                                                                                                                                                                     |
| french  | #1   | 1002 | 3-figure group, gold/blue fleur-de-lis-emblem banner, clean read even though the source master's background was solid black (not white) — rembg handled the high-contrast case cleanly.                                                                                                                                                                                                                                                                                     |
| french  | #2   | 1004 | 4-figure group, black/gold skull-and-crossed-anchors banner. Swapped in for the original seed-1001 pick: that candidate's banner was rendered in pale near-white tones against a light-blue vignette, so `rembg` (and the alpha-threshold fallback) partially or fully classified the flag itself as background — an unrecoverable case, not a fixable ghost, so it was dropped rather than hand-edited. _Caveat_: same opaque ground-mound issue as pirates #1 / dutch #1. |

## Operator picks (2026-07-12)

Final picks, one sprite per faction:

| faction | pick | disposition                                                      |
| ------- | ---- | ---------------------------------------------------------------- |
| pirates | #1   | approved as-is (ground-mound caveat above accepted).             |
| british | #1   | approved as-is.                                                  |
| spanish | #1   | approved, **flag fixed** — see below.                            |
| dutch   | #1   | approved, **flag fixed, then rejected and rebuilt** — see below. |
| french  | #2   | approved as-is (ground-mound caveat above accepted).             |

### Flag fixes: Spanish (Cross of Burgundy), Dutch (tricolor)

`spanish_party_seed1004` and `dutch_party_seed1005` both drifted off-brief on the banner
design (see "Banner-color drift" below): Spanish rendered a maroon Jolly-Roger-style skull
flag instead of the requested gold/cream heraldry, and Dutch rendered a solid-orange banner
with a black anchor instead of a national flag. The operator specified the actual canonical
designs — the Cross of Burgundy (red ragged diagonal saltire on white/cream,
`docs/art/flags/spanish.svg`, matching the shipped `apps/web/public/art/factions/spanish/
flag.png`) and the Dutch tricolor (red/white/blue horizontal bands,
`docs/art/flags/dutch.svg`, matching `apps/web/public/art/factions/dutch/flag.png`).

Fix approach (per-faction, both masters **overwritten in place** — same filename/seed,
following the city-v1 `_edited_` convention rather than a `-v2` file):

1. **Mask the banner shape**: flood-filled the background from the image corners (to
   correctly include enclosed white/pale interior emblem pixels — e.g. the Spanish skull —
   as foreground, not background), then subtracted the flagpole by color (hue/luminance
   test tuned per faction — the pole's brown/grey differs from both the old flag's fill and
   the background), restricted to a hand-picked bounding region so the mask only captures
   the flag fabric and not hats/faces. `binary_fill_holes` closes small anti-aliasing gaps
   left by the old emblem's fine linework before redrawing the silhouette's outline —
   skipping this step left tiny speckle-ring artifacts (a halo drawn around every leftover
   gap, not just the flag's outer edge).
2. **Composite the canonical flag**: row-by-row, each destination row of the mask was
   painted by horizontally resampling the corresponding row of the canonical flag PNG to
   fit that row's actual (possibly narrower/wavy) width — a "wave-warp" that follows the
   original AI-rendered banner's drape/flutter silhouette rather than pasting a flat
   rectangle. A very heavily-blurred (radius ~45px) luminance ratio from the original
   render was multiplied back in at low amplitude (0.88–1.12x) to keep a whisper of the
   original's fold/highlight shading without dragging along the old emblem's fine interior
   detail (a first attempt with a smaller blur radius/wider amplitude range visibly
   ghost-imaged the old skull/anchor artwork through the new flag — not just faded, but its
   edges and internal shading lines were reproduced as a shadow of the old design).
3. **One light img2img blend pass** (SD API, DreamShaper_8, same style suffix/negative as
   `party_art.py`, denoise 0.3, seed matching the original) — **Spanish only**. This pass
   cleanly removed a couple of residual pixel-level artifacts and gave the flag a
   consistent painterly integration with the rest of the render; visually confirmed no
   drift back toward skull iconography. **Dutch was NOT blended**: at denoise 0.22–0.3 the
   model repeatedly re-drifted the tricolor — first turning the top red band back to
   orange, then (after strengthening the negative prompt) eating most of the blue band
   instead and adding stray star-shaped artifacts. Lower denoise (0.13) didn't fix it
   either. This matches the documented banner-color-drift failure mode: DreamShaper has a
   strong "Dutch = solid orange" prior that a light img2img pass keeps reasserting. The
   Dutch master shipped as the **pure PIL composite** (no AI blend) — flat-cartoon color
   fill with a redrawn outline, which is arguably a closer style match to the shared
   "flat cartoon illustration ... thick black outlines" house style than a painterly blend
   would have been anyway.
4. **Re-cutout**: `rembg` (isnet-general-use) on both fixed masters — both cut clean, no
   ghost/smudge, no manual alpha-threshold fallback needed this time.

Known residual imperfections, judged acceptable at map-token scale (~24-40px):

- Spanish: a couple of faint single-pixel artifacts remain in the cream field where the old
  skull's shading detail was densest; imperceptible at token scale.
- Dutch: **superseded 2026-07-12, see "Dutch flag rebuild" below.** The wave-warp-onto-old-
  drape approach described here left the blue band as a tiny occluded corner accent and a
  thin orange sliver survived at the hand grip. The operator reviewed this result and
  rejected it outright ("Dutch flag is totally wrong") — the banner was rebuilt from scratch
  rather than patched further. Left in place for the historical record of what didn't work.
- Dutch mask-building note (historical, see above): the two flags' lower drape passes
  directly behind the third figure's tricorne hat. An early mask attempt used a generic
  "non-background, non-pole" foreground test for that region and it bled into the hat
  (painting it flag-blue) because hat-black isn't pole-colored either. Fixed by switching to
  a strict orange-color test (matching the old flag's fill hue specifically) for that lower
  region instead of a generic foreground test — the hat's black pixels don't match "orange"
  so it's naturally excluded without needing an explicit hat-shaped cutout. This whole
  drape-following strategy was abandoned in the rebuild (below) in favor of a fresh banner
  drawn clear of the figures entirely.

### Dutch flag rebuild (operator rejection, 2026-07-12 follow-up)

The tricolor patch described above (commit `562dccd`) was reviewed by the operator and
rejected: **"Dutch flag is totally wrong."** Composited into the old banner's occluded drape,
the result read as mostly red/white with only a corner sliver of blue and a leftover orange
fleck — not recognizable as the Dutch flag.

Canonical reference (unchanged from the fix above, re-confirmed against both the vector and
the shipped raster): `docs/art/flags/dutch.svg` / `apps/web/public/art/factions/dutch/
flag.png`, three equal horizontal bands top-to-bottom **red `#AE1C28` / white-cream
`#F5F0E6` / blue `#21468B`**.

Rather than patch the old drape again, the banner was rebuilt from scratch on
`dutch_party_seed1005.png` (master overwritten in place again, same file):

1. **Erased** the old twin-flag-and-pole assembly entirely. The clear region above all three
   hats (`y<153` across the full flag width) was blanked with a straight rectangle — safe
   because no character geometry lives there. Below that line, the old flag/pole remnants
   that dipped toward the hand grips were removed with a pure-orange color mask (no
   brown/pole-color mask — that threshold turned out to be indistinguishable from the
   figures' own skin-shadow tones and started eating faces; restricting the automated
   erase to the flag's saturated orange fill only, plus a couple of hand-placed small
   rectangle patches for two isolated leftover specks, cleaned it fully without touching any
   figure).
2. **Redrew** a single rectangular banner well above all three hats (clear of every figure,
   no occlusion possible), on a fresh pole planted near the center figure's raised fist —
   sized and placed the way the British #1 pick's Union Jack banner sits above its group.
   Thick black outline, flat-cartoon fill, a painterly flutter on the fly edge (two soft
   scallops) and a slight wave on the top/bottom edges, hoist edge straight against the pole
   — same silhouette language as the British/Pirates banners. All three bands are equal
   thirds of the flag's height, filled with the exact canonical hex values above, in the
   correct top-to-bottom order.
3. **Re-cutout** with `rembg` (isnet-general-use). The white/cream middle band, being close
   in luminance to the studio-white master background, got partially matted to
   near-transparent by rembg's saliency mask (alpha as low as 6–22 in that band) — the same
   "low-contrast subject vs. background" failure mode already flagged elsewhere in this
   manifest, this time hitting the new artwork instead of a generation artifact. Fixed
   deterministically rather than by re-thresholding: since the flag/pole footprint is known
   exactly (it was just drawn), that exact polygon was re-filled with the pre-cutout master's
   RGB and forced to alpha 255, overriding rembg's saliency call only inside that footprint.
   The two small hand-placed cleanup-patch rectangles from step 1 were forced to alpha 0
   (they're guaranteed empty canvas, not foreground) since rembg had inconsistently kept one
   of them as an opaque white fleck.
4. Verified at full resolution and downscaled to 32px and 128px: reads instantly and
   unambiguously as the Dutch tricolor at token scale, against light, dark, and magenta test
   backdrops — no ghosting, no occlusion, correct band order and colors.

No other faction's sprite was touched by this follow-up.

## Failure modes worth flagging for future passes

- **Banner-color drift**: despite per-faction flavor clauses naming explicit banner colors
  (gold/cream for Spanish, orange for Dutch, blue/gold for French), DreamShaper repeatedly
  defaulted toward "Jolly Roger" skull-and-crossbones iconography regardless of faction —
  visible in 3 of the 5 top picks (pirates, spanish, french). The model appears to have a
  strong prior linking "pirate-era banner" to skull imagery that the prompt didn't fully
  override. A future pass could try moving the flag-color clause earlier in the prompt, or
  an explicit negative-prompt exclusion of "skull, skull and crossbones" for non-pirate
  factions.
- **Low-contrast subject vs. background**: when a master's banner or flag rendered in pale
  tones close to the background's own color (2 of 20 raw candidates: french seed1001,
  partially british seed1001), `rembg`'s saliency mask treats the subject element as
  background. Alpha thresholding is not a real fix here — it either leaves the ghost or
  eats the subject with it. The only reliable fix is discarding the candidate or a manual
  inpaint pass (not attempted, out of scope for a first-pass review).
- **Baked-in ground plane**: 3 of the 10 final picks (pirates #1, dutch #1, french #2) have
  an opaque ground-mound or shadow shape fused to the figures' feet despite the shared
  negative prompt's `ground plane` exclusion. Because it's fully opaque (not a translucent
  ghost), `rembg`/alpha-thresholding can't remove it without also cutting into the boots;
  doing so cleanly needs a manual mask, which was judged out of scope for a first pass —
  flagged here so the operator can weigh in on whether it reads fine at token scale or
  needs a repaint/inpaint before it ships.
- **Stray text artifact**: one discarded Dutch candidate (seed1002, not carried forward)
  rendered a small garbled text string ("GAVE GARCO") despite the shared negative prompt
  excluding `text, watermark, signature` — a known DreamShaper failure mode, not something
  the negative prompt fully suppresses. No action needed since the candidate wasn't picked,
  noted here only as a reminder for future generations.

## Files

- `masters/<faction>_party_seed<seed>.png` — all 22 raw 512² generations (20 from the
  initial 4-seeds/faction batch + 2 extra Dutch seeds). `spanish_party_seed1004.png` was
  overwritten in place 2026-07-12 with the flag-fixed version (see "Operator picks" above).
  `dutch_party_seed1005.png` was overwritten twice 2026-07-12: once with the (rejected)
  tricolor-onto-old-drape patch, then again with the fully rebuilt banner (see "Dutch flag
  rebuild" above) — neither earlier version is retained separately, per the city-v1
  `_edited_`-in-place convention.
- `cutouts/<faction>_party_seed<seed>-cut.png` — the 10 picked candidates, background
  removed (rembg + manual alpha-threshold fallback where noted above). The spanish/1004 and
  dutch/1005 cutouts were regenerated 2026-07-12 from the fixed masters, and dutch/1005 was
  regenerated a second time from the rebuilt master (rembg's saliency matte on the new
  banner's white/cream band needed a targeted alpha override — see "Dutch flag rebuild").
- `party-contact-sheet-light.png` / `party-contact-sheet-dark.png` — all 10 first-pass
  candidates, 2 per row (one row per faction), composited over a light and a dark backdrop
  respectively, for the operator's initial pick. Not regenerated for the Dutch rebuild — that
  sheet only ever reflected the first-pass candidates, not the fixed flags.
- `picks-sheet-light.png` / `picks-sheet-dark.png` — the 5 **final approved** sprites (one
  per faction, including the rebuilt Dutch flag), one row, for final sign-off. Copies were
  also placed in the operator's review tmp folder for this session.
