# City UI v2 runtime evidence

> **#613 approval pending:** these 20 replacement pixels were captured and inspected against
> exact source `a5a8fd5f8c522ebddfb146510b492bcea1c28ee2`. Direct operator approval is
> deliberately still pending under the 37-frame cross-evidence procedure in
> [`RUNTIME-EVIDENCE-RENEWAL.md`](RUNTIME-EVIDENCE-RENEWAL.md).

This directory records issue #612's dedicated city overlay and 20 fresh runtime JPEGs from
the #613 target source. They cover the current responsive layout, interaction states,
runtime art resolution, zoom extremes, and management panels. Every source and capture byte
is bound in the retained manifest.

Checkpoint 1 approved the city direction and portrait-phone framing refinement. The prior
checkpoint 2 approval at evidence head
`dc11b60738f4f14b896532bf2db323b2bd054f5c` is retained only as a historical record in
[issue #612](https://github.com/jharvieux/AoP/issues/612#issuecomment-5551752344); it does
not approve these new bytes. The integration owner completed visual-settle and native-size
inspection of every replacement file. Checkpoint 2 remains pending direct operator approval.

The evidence set contains starting (round 1, 2 buildings), midgame (round 13, 8 buildings),
and full (round 54, 14 buildings) Pirate states created by a truthful import harness around
the shipping city components. Shipping zoom and management controls were operated visibly.
It covers 320×568, 375×812, 430×932, 768×1024, 844×390, and 1440×900 at 1×; phone and desktop
3× detail; and Town Hall build, Cutthroat Den recruit, and Grog House tavern panels.

Files:

- `RUNTIME-CAPTURES.md` is the human-readable capture record.
- `RUNTIME-CAPTURE-RECEIPT.json` records provenance, state, coverage, and checkpoint status.
- `RUNTIME-CAPTURE-BINDINGS.json` binds every retained capture and all thirteen #612 source
  anchors to the same exact source head.
- `tools/runtime-harness/` builds the shipping-component fixture, checks its exact state and
  target inventory, and validates staged JPEGs before ingestion.
- `build-runtime-capture-bindings.mjs` refreshes byte counts and hashes only from an external,
  unapproved capture proposal after an explicit native-inspection confirmation.
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
