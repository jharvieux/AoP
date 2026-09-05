# City UI v2 runtime capture record

## Status and provenance

These 20 captures were produced from exact #613 target source
`a5a8fd5f8c522ebddfb146510b492bcea1c28ee2`. `RUNTIME-CAPTURE-BINDINGS.json` validates that
same head, its exact thirteen-file source inventory, and every retained capture byte. They
show the repaired responsive layout, focus containment, reduced-motion behavior,
topology-aware action gating, web-owned runtime art defaults, and measured reset fit.

The capture server used a truthful harness that imports the shipping `CityScreen` and
`CityScene` components and creates explicit Pirate fixtures: starting is round 1 with 2
visible buildings, midgame is round 13 with 8, and full is round 54 with all 14. Shipping
zoom and management controls were operated visibly. No programmatic font/image await is
claimed. The integration owner inspected all retained files at native size after visible
settling.

Checkpoint 1 approved the dedicated city direction and subsequent portrait-phone framing
refinement. Exact-head recapture and native-size review are complete, but direct operator
approval of these replacement pixels is pending. Checkpoint 2 is pending direct operator
approval. The earlier approval at evidence head
`dc11b60738f4f14b896532bf2db323b2bd054f5c` remains a non-reusable historical record in
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
| `full-desktop-1440x900-3x-townhall.jpg` | Full · R54 · 14   | 1440×900 · 3× Town Hall          | 221,797 | `704a3449008342fa57cf3d6ea5879d7096c046ebce4c3495b9e122c72ce2e6e0` |
| `full-desktop-1440x900.jpg`             | Full · R54 · 14   | 1440×900 · 1×                    | 241,364 | `da8e255f134f82135bd97bfc1e6a6f49ba5fcd0591ad80a78661804c6e006928` |
| `full-landscape-844x390.jpg`            | Full · R54 · 14   | 844×390 · 1×                     |  52,781 | `895d4625963f4ee8a1ce6e99f38c03e49cecedbce0807c7506b402a25dd30f84` |
| `full-phone-320x568.jpg`                | Full · R54 · 14   | 320×568 · 1×                     |  38,621 | `3f5e41425d7e1142f70cce767ed6fba616595fc671034168430f52b26767a264` |
| `full-phone-375x812.jpg`                | Full · R54 · 14   | 375×812 · 1×                     |  50,981 | `0fe1503c04391be42c00424e7d9483e50727f78d3ddb73704dd509baf5206661` |
| `full-phone-390x844-3x-shipyard.jpg`    | Full · R54 · 14   | 390×844 · 3× Shipyard            |  40,114 | `b698c7a907aa11c04aa118448cc9cf99b2cde71ea71a509163a3ec6a7d541cc2` |
| `full-phone-390x844-3x-townhall.jpg`    | Full · R54 · 14   | 390×844 · 3× Town Hall           |  51,196 | `d50a451d33471ab40a195301f0fb362e45be2d6b3c32b881b7082daa7330ef22` |
| `full-phone-430x932.jpg`                | Full · R54 · 14   | 430×932 · 1×                     |  62,789 | `0dc33f5afebc093e12af527308e14a9dfebb5733c1c68c914d232f976cf05f17` |
| `full-tablet-768x1024.jpg`              | Full · R54 · 14   | 768×1024 · 1×                    | 153,542 | `3d480fb6d46bbe08a3241e7122fc810579448dcd64c4bbd611f9b2f5ce45922d` |
| `midgame-desktop-1440x900.jpg`          | Mid · R13 · 8     | 1440×900 · 1×                    | 237,477 | `cbc12a310450ab6c85641df6e6b28983fa87143020a447d54e29fef365b11af7` |
| `midgame-phone-375x812.jpg`             | Mid · R13 · 8     | 375×812 · 1×                     |  50,191 | `fa7dbb0c601dcdc909d3ba9649a32e2fc3fcb718ee6989685435a1dbacba3f63` |
| `panel-build-phone-375x812.jpg`         | Starting · R1 · 2 | 375×812 · Town Hall build        |  51,780 | `0169a94304e2b290bb16cfb2c17d1f23a77e69b8c9ad1dc34af81212bee43ece` |
| `panel-recruit-tablet-768x1024.jpg`     | Full · R54 · 14   | 768×1024 · Cutthroat Den recruit | 160,632 | `5d9987ddb9ab1aa78f0381f6ee32f623942b105f22da2b9aa731843714a9afd1` |
| `panel-tavern-desktop-1440x900.jpg`     | Full · R54 · 14   | 1440×900 · Grog House tavern     | 272,056 | `2cc5987466b3de6e3606373b8ce78c5ef4f0c67b5388e34d9ff6393b36bb4951` |
| `starting-desktop-1440x900.jpg`         | Starting · R1 · 2 | 1440×900 · 1×                    | 237,116 | `b5cae3bfd07ab97c8aa6eaba53162d2bdaa49c8eeef3921254350e112b523678` |
| `starting-landscape-844x390.jpg`        | Starting · R1 · 2 | 844×390 · 1×                     |  52,166 | `d91261606e2dc8d6329fee5a577f3868c9948c06a39eae13980ff9fe8e299684` |
| `starting-phone-320x568.jpg`            | Starting · R1 · 2 | 320×568 · 1×                     |  39,234 | `937a41c847e8381a3d192626f9cf59953280ea6a7a56dc2a823fd07d9bffb66c` |
| `starting-phone-375x812.jpg`            | Starting · R1 · 2 | 375×812 · 1×                     |  49,774 | `c04ae7255cd87ce24d672a448c3585c2820bf8854d8ccc24e5d523392f7c062a` |
| `starting-phone-430x932.jpg`            | Starting · R1 · 2 | 430×932 · 1×                     |  61,707 | `e16c1a0eb2523638cbb937ecb95a36d701b5fe755b1514206b3e9a5562637dde` |
| `starting-tablet-768x1024.jpg`          | Starting · R1 · 2 | 768×1024 · 1×                    | 151,148 | `c2360bb976eebfbbf65a4d4836fd75f57427c9fe2e0a28ff1c6a868689ab81b2` |

## Mechanical boundary

`validate.mjs` requires the exact capture and source inventories; checks source and JPEG byte
counts and SHA-256 hashes; parses JPEG/JFIF structure, baseline precision, three-component RGB
mode, and dimensions; enforces the 300 KiB ceiling; and rejects drift in rounds, 2/8/14 visible
building counts, six breakpoint pairs, 1×/3× coverage, panel coverage, or checkpoint status.
It also requires an exact captured-to-current source match, completed integration-owner
inspection, and null direct-approval fields. A successful run validates the archive's
integrity; it cannot independently grant or renew operator approval.
