# City UI v2 runtime evidence

This directory records issue #612's dedicated city overlay and 20 runtime JPEGs captured
from exact source head `45a206f760eacce50dc8dd1dc656c5d4e789cb3c`. They cover the
current responsive layout, interaction states, runtime art resolution, zoom extremes, and
management panels. Every source and capture byte is bound in the retained manifest.

Checkpoint 1 approved the city direction and the follow-up portrait-phone framing
refinement. Checkpoint 2 remains pending: these final bytes do not become approved merely by
being present or passing the mechanical validator. The integration owner completed
visual-settle and native-size inspection of the retained capture files.

The previous final-capture review was bound to a superseded source head. The current captures
have been regenerated and inspected at native size, but checkpoint 2 remains pending until
the operator explicitly approves these exact bound bytes.

The evidence set contains starting (round 1, 2 buildings), midgame (round 13, 8 buildings),
and full (round 54, 14 buildings) Pirate city states reached through normal UI play. It covers
320×568, 375×812, 430×932, 768×1024, 844×390, and 1440×900 at 1×; phone and desktop 3×
detail; and Town Hall build, Cutthroat Den recruit, and Grog House tavern panels.

Files:

- `RUNTIME-CAPTURES.md` is the human-readable capture record.
- `RUNTIME-CAPTURE-RECEIPT.json` records provenance, state, coverage, and checkpoint status.
- `RUNTIME-CAPTURE-BINDINGS.json` binds every retained capture and all thirteen #612 source
  anchors to the same exact source head.
- `build-runtime-capture-bindings.mjs` deterministically refreshes byte counts and hashes for
  the declared source and capture inventories without changing their semantic metadata.
- `validate.mjs` rejects source, image, inventory, format, dimension, budget, or metadata drift.

## Replay boundary

The operator accepted the current deterministic fingerprint `850a9013b70e38a7`;
compatibility with pre-art multiplayer replays is not required yet. Content building URLs and
the generated engine version remain unchanged. Runtime city presentation uses the web-owned
registry for default WebPs, preserving theme override → web default → visible CSS fallback.
Local saves retain their existing schema/rules-version behavior. No replay-version alias or
stored-row mutation is part of issue #612.

Run the fail-loud check from the repository root:

```sh
node docs/art/city-ui-v2/validate.mjs
```
