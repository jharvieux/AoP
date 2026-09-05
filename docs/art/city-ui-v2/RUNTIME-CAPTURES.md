# City UI v2 runtime capture record

## Status and provenance

These 20 captures were produced from issue #612 source head
`45a206f760eacce50dc8dd1dc656c5d4e789cb3c`. `RUNTIME-CAPTURE-BINDINGS.json` validates that
same head, its exact thirteen-file source inventory, and every retained capture byte. They
show the repaired responsive layout, focus containment, reduced-motion behavior,
topology-aware action gating, web-owned runtime art defaults, and measured reset fit.

The Pirate session used normal UI play only: starting is round 1 with 2 visible buildings,
midgame is round 13 with 8, and full is round 54 with all 14. No programmatic font/image await
is claimed. The integration owner completed visual-settle and native-size inspection of the
retained capture files.

Checkpoint 1 approved the dedicated city direction and subsequent portrait-phone framing
refinement. Exact-head recapture and native-size review are complete. The operator approved
checkpoint 2 for these exact bound bytes at evidence head
`dc11b60738f4f14b896532bf2db323b2bd054f5c`; the approval is recorded in
[issue #612](https://github.com/jharvieux/AoP/issues/612#issuecomment-5551752344).

The operator accepted the current deterministic fingerprint `850a9013b70e38a7`;
compatibility with pre-art multiplayer replays is not required yet. The content building URLs
and generated engine version remain unchanged. The web-owned city art registry is the runtime
default-art boundary. No replay-version alias or stored-row mutation is part of issue #612;
local saves retain their existing schema/rules-version behavior.

## Inventory

All files are RGB, baseline 8-bit JFIF JPEGs and remain below the 300 KiB evidence ceiling.

| Capture                                 | State             | View / evidence                  |   Bytes | SHA-256                                                            |
| --------------------------------------- | ----------------- | -------------------------------- | ------: | ------------------------------------------------------------------ |
| `full-desktop-1440x900-3x-townhall.jpg` | Full · R54 · 14   | 1440×900 · 3× Town Hall          | 259,691 | `1a4d19074ed92035e3bbdc80916bb04b381ebc759f35902fa9670e42d4252b3a` |
| `full-desktop-1440x900.jpg`             | Full · R54 · 14   | 1440×900 · 1×                    | 284,730 | `77b19a10b843d00bc5c40850d940e4b16575e2964b89c6d6042fb39c2bba9eb7` |
| `full-landscape-844x390.jpg`            | Full · R54 · 14   | 844×390 · 1×                     |  61,706 | `ccdcb81ed7d93bf1a3d72407e82222b95202371e0a24415ee7cd44b0e51146c2` |
| `full-phone-320x568.jpg`                | Full · R54 · 14   | 320×568 · 1×                     |  45,447 | `eecf942501ac8411154a0fcd2a438ce24aacd905c183b0090954c9685e1f869d` |
| `full-phone-375x812.jpg`                | Full · R54 · 14   | 375×812 · 1×                     |  59,002 | `bb42082cd65a63068d3571bad2fde4e02c1e2587e73b1c5ebe0ee216b126a562` |
| `full-phone-390x844-3x-shipyard.jpg`    | Full · R54 · 14   | 390×844 · 3× Shipyard            |  48,222 | `3d0c90a5d59cf7ed4e44702188246a431451924bdeb6f1ea43549c65a4d3cc2d` |
| `full-phone-390x844-3x-townhall.jpg`    | Full · R54 · 14   | 390×844 · 3× Town Hall           |  61,467 | `16eaaef6d6782417a9d55456bb9c9d80fecb46f5d81904d390591066ed5f3254` |
| `full-phone-430x932.jpg`                | Full · R54 · 14   | 430×932 · 1×                     |  72,025 | `4a077ecaabc417ca929fc963544e9f46493685a90db2334a174e56351eeba176` |
| `full-tablet-768x1024.jpg`              | Full · R54 · 14   | 768×1024 · 1×                    | 182,744 | `1c76b528702b68e455fd998870a484fe332f52ac52f5e9508fd97535498b336a` |
| `midgame-desktop-1440x900.jpg`          | Mid · R13 · 8     | 1440×900 · 1×                    | 280,020 | `a422de677228c6b8de6dadc9c8dec306b45af369c0b8f369237d1420e58e7c40` |
| `midgame-phone-375x812.jpg`             | Mid · R13 · 8     | 375×812 · 1×                     |  58,483 | `03bea6f04ab0d9bf194d81790fa9dccb96b7c6b4bde249d870564b33a5905205` |
| `panel-build-phone-375x812.jpg`         | Starting · R1 · 2 | 375×812 · Town Hall build        |  61,635 | `61e92d7b81d7ad3cb7099a520ce7cf358daab2ec45f16a8e1240bfec9203796a` |
| `panel-recruit-tablet-768x1024.jpg`     | Full · R54 · 14   | 768×1024 · Cutthroat Den recruit | 193,802 | `c11d27874c39a3abcd5f8d0e35bbdc3573038ea255d9d1f4982143b6d1f8d1f4` |
| `panel-tavern-desktop-1440x900.jpg`     | Full · R54 · 14   | 1440×900 · Grog House tavern     | 297,671 | `ec3c39d93583561d843b7f87bc8966a3ff210106917a0ced435c0f950800d04d` |
| `starting-desktop-1440x900.jpg`         | Starting · R1 · 2 | 1440×900 · 1×                    | 279,096 | `6b8f8fdca0cc81de38db160cd4684837645057ceb77db15374c7c387a3c271c8` |
| `starting-landscape-844x390.jpg`        | Starting · R1 · 2 | 844×390 · 1×                     |  60,791 | `e3a8fad32144fc86f85bb7596f13fc255904f3a2a1e2171b851bdf474fbcc2d9` |
| `starting-phone-320x568.jpg`            | Starting · R1 · 2 | 320×568 · 1×                     |  44,355 | `c134773ef86a8d6b3cf89bdaa0e6d5f2342d98f56f1396b8d0ed19d9aaa37916` |
| `starting-phone-375x812.jpg`            | Starting · R1 · 2 | 375×812 · 1×                     |  57,484 | `5ceeb1714c979d3e9481288d0c237aa2200cd250c5be66bda2161b4c841c717d` |
| `starting-phone-430x932.jpg`            | Starting · R1 · 2 | 430×932 · 1×                     |  70,325 | `f4c28d02163c144dc141ac9c76dfe9fa5764a38432eedd581d45030ed766520a` |
| `starting-tablet-768x1024.jpg`          | Starting · R1 · 2 | 768×1024 · 1×                    | 177,147 | `25ca80b639df0d144f00b7e15ffa8e5094d7bd5196c1be0750d1dc87eba94d27` |

## Mechanical boundary

`validate.mjs` requires the exact capture and source inventories; checks source and JPEG byte
counts and SHA-256 hashes; parses JPEG/JFIF structure, baseline precision, three-component RGB
mode, and dimensions; enforces the 300 KiB ceiling; and rejects drift in rounds, 2/8/14 visible
building counts, six breakpoint pairs, 1×/3× coverage, panel coverage, or checkpoint status.
It also requires an exact captured-to-current source match and the
`approved` status and exact approval record. A successful run validates the archive's
integrity; it cannot independently grant or renew operator approval.
