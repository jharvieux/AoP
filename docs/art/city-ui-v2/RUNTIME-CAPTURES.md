# City UI v2 runtime capture record

## Status and provenance

These 20 captures were produced from exact #613 target source
`c1824f22bf14dca6d38f7519fd99affd789a8130`. `RUNTIME-CAPTURE-BINDINGS.json` validates that
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
refinement. Exact-head recapture and native-size review are complete. The operator approved
checkpoint 2 at evidence head `08717289778883d7adca6ff7a6f15b20fb7c6b25`; the durable
record is [issue #612](https://github.com/jharvieux/AoP/issues/612#issuecomment-5555069230).
The earlier approval at evidence head
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
| `full-desktop-1440x900-3x-townhall.jpg` | Full · R54 · 14   | 1440×900 · 3× Town Hall          | 217,395 | `91b31cfe44465978b82bf85223c0e36d8bc80e83bd88a86f8b00ecbda6d55c17` |
| `full-desktop-1440x900.jpg`             | Full · R54 · 14   | 1440×900 · 1×                    | 242,624 | `7301275190ff760eb097f67675f65bba6b96ea382c6ec8b18f54b447794e248d` |
| `full-landscape-844x390.jpg`            | Full · R54 · 14   | 844×390 · 1×                     |  52,941 | `5777edb860bc7214d246d09a37fd69df3f706f1c527fe5ceb79488aede94c8ed` |
| `full-phone-320x568.jpg`                | Full · R54 · 14   | 320×568 · 1×                     |  41,234 | `af26aa1abc1f78e6a9c46e1ee2925fffd2d2cec354ff5c33a41598fc6cb4621d` |
| `full-phone-375x812.jpg`                | Full · R54 · 14   | 375×812 · 1×                     |  51,875 | `1bd5eb07ace624f5111cbf48a4dcc0342806a992bec401ea9c07e387f58c23f9` |
| `full-phone-390x844-3x-shipyard.jpg`    | Full · R54 · 14   | 390×844 · 3× Shipyard            |  41,210 | `b1378c52942f596428efb5f5c3721bf48301756a054d202705fd85a48c4a0b6e` |
| `full-phone-390x844-3x-townhall.jpg`    | Full · R54 · 14   | 390×844 · 3× Town Hall           |  51,971 | `e4460ee838e11a45726195ce6da56f405b0ad153783822c481f224b83fcca696` |
| `full-phone-430x932.jpg`                | Full · R54 · 14   | 430×932 · 1×                     |  62,741 | `48df14358afb0c7bfa8513a1a6f99ad8aba4526bc511c6cf966200d2a86a0c3c` |
| `full-tablet-768x1024.jpg`              | Full · R54 · 14   | 768×1024 · 1×                    | 154,597 | `82b5e7067c838bbee6da44f34110f366f4ddc3d6823f9f5a18eab4dbc5833dc4` |
| `midgame-desktop-1440x900.jpg`          | Mid · R13 · 8     | 1440×900 · 1×                    | 238,547 | `3fc99f09f5ba9449e8e93fe2345938116078e1f2b185a69390e0da33ee885ca3` |
| `midgame-phone-375x812.jpg`             | Mid · R13 · 8     | 375×812 · 1×                     |  51,080 | `6d8764361e4bd49ebacc17e96d38153d6c237229bbd81fa3a419f472d45c5ea1` |
| `panel-build-phone-375x812.jpg`         | Starting · R1 · 2 | 375×812 · Town Hall build        |  51,810 | `95b66e9f5cf758ea22aca524f800dcb5cc13937947e2e196eaf116af34e91003` |
| `panel-recruit-tablet-768x1024.jpg`     | Full · R54 · 14   | 768×1024 · Cutthroat Den recruit | 161,810 | `7eb0c29c3a28105f190ad99c8da9b56cf7ee23b781a3335ae698fc1d5f402896` |
| `panel-tavern-desktop-1440x900.jpg`     | Full · R54 · 14   | 1440×900 · Grog House tavern     | 273,475 | `852b20ae172701347a21879c9bec7b063107d1c32ca62c9e9157cd690afa484a` |
| `starting-desktop-1440x900.jpg`         | Starting · R1 · 2 | 1440×900 · 1×                    | 238,120 | `fc53d522de957fa8aa97e22abb2e2db6c11842e07e5923f147952f73fc233fd4` |
| `starting-landscape-844x390.jpg`        | Starting · R1 · 2 | 844×390 · 1×                     |  52,280 | `258ed3e62bcca2dc98e48ce3ede239989031083ad6807f8bbd31512a51b24b5e` |
| `starting-phone-320x568.jpg`            | Starting · R1 · 2 | 320×568 · 1×                     |  40,314 | `80d349d1330e45c40fd73f81c1b2d2478d1cd04db2217a14b92dd5ba65b08cc8` |
| `starting-phone-375x812.jpg`            | Starting · R1 · 2 | 375×812 · 1×                     |  49,178 | `5f7e9bbddd49a7542885a6b8a1e6c4d96f787c29e83705b8e9961053c9b0224b` |
| `starting-phone-430x932.jpg`            | Starting · R1 · 2 | 430×932 · 1×                     |  61,637 | `64ec58c5d2766a8d3b77d819aeb2cca0809aea09baacd533414826db3c2c0810` |
| `starting-tablet-768x1024.jpg`          | Starting · R1 · 2 | 768×1024 · 1×                    | 152,108 | `3f736acb8cbdbe8265f5cf0d386ef23bfd2a87f5bf7f2c6ad3ed16c749c8b6ae` |

## Mechanical boundary

`validate.mjs` requires the exact capture and source inventories; checks source and JPEG byte
counts and SHA-256 hashes; parses JPEG/JFIF structure, baseline precision, three-component RGB
mode, and dimensions; enforces the 300 KiB ceiling; and rejects drift in rounds, 2/8/14 visible
building counts, six breakpoint pairs, 1×/3× coverage, panel coverage, or checkpoint status.
It also requires an exact captured-to-current source match, completed integration-owner
inspection, and the exact evidence-head plus permanent issue-comment approval binding. A
successful run validates the archive's integrity; it cannot independently grant or renew
operator approval.
