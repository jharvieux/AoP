# World-map v2 token proof — checkpoint 1

**Status:** awaiting operator approval. This is a Direction B art proof for issue #609, not runtime art. No file under `public/art`, no asset registry used by the game, and no visibility or gameplay behavior has changed.

## Review the proof

![All 21 token candidates at 24, 32, 48, and 96 CSS pixels](proofs/token-contact-sheet-2400x3108.webp)

![Faction shape, formation, class, and existing flag cues in color and grayscale](proofs/faction-color-grayscale-2200x1800.webp)

![Visible, visible-side fog frontier, and fully hidden presentation](proofs/fog-truth-2100x1040.webp)

The family contains six city identities, two ship classes, five faction parties, one sea encounter, all three land encounters, and all four sites required by the issue. Every candidate uses the approved Direction B camera, northwest light, restrained palette, optical safety margin, and a cue that does not depend on color alone.

The 32 px column deliberately places each token on the visible side of a fog frontier. The separate fog proof is explicit: a hidden entity receives no token, silhouette, highlight, shadow, label, or high-detail substitute. These are presentation examples only and do not propose a visibility-rule change.

## Checkpoint boundary

- `sources/selected/` holds normalized 512 px RGBA proof sources.
- `tokens/` holds optimized 256 px RGBA candidates used by the sheets.
- `asset-registry.json`, `PROMPTS.md`, and `MANIFEST.md` preserve provenance and constraints.
- `tools/` contains deterministic preparation, composition, and fail-loud validation.
- Nothing here is approved for runtime placement yet.

## Operator decision

Do you approve this Direction B token family as the target for checkpoint 2, with the disclosed alpha-edge cleanup and any specific token replacements completed before runtime integration?
