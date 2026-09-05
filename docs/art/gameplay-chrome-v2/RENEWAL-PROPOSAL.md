# Gameplay chrome v2 exact-source renewal proposal

> **Unapproved candidate evidence.** These three files do not replace the approved
> `runtime-captures/` set, do not renew `RUNTIME-MATERIAL-BASELINE.json`, and do not
> inherit any historical approval. Direct operator review of these exact pixels is still
> required.

This proposal was captured on 2026-09-05 from shipping components and exact runtime/source
ancestor `c1824f22bf14dca6d38f7519fd99affd789a8130` (tree
`68b5529d91f15cdbfeeb0f612da5ee0c7ebd547d`). The complete fail-closed source,
renderer, asset, and fixture boundary is
`5e45088359d894c5b12a5ff633c901d5b07e7f62ce29f83aef0533e9116171a1`.

The combined chrome-and-terrain candidate digest is
`86dc0f7afa29a73c3983942d39a43d7dd9a0e681189216457374d93fcd59e3db`.
It binds all nine converted capture bytes, their raw-source hashes, observations, and
source/material/renderer/fixture identities. `PROPOSAL.json` deliberately records
`unapproved-proposal`, a pending direct-operator approval, and a null approval record.

## Native-size candidates

| Candidate                                                                        | State frozen in the frame                                                                  |    PNG |   Bytes | SHA-256                                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -----: | ------: | ------------------------------------------------------------------ |
| [Phone world](renewal-candidates/runtime-phone-world-375x812.png)                | 375×812 world chrome                                                                       | type 2 | 137,822 | `cb6b686837c2258682f54936e92fd777df1a3b29787c4318293ec68468ba92a5` |
| [City inspector](renewal-candidates/runtime-city-inspector-1440x900.png)         | 1440×900 Shipyard inspector; Close building details focused                                | type 3 | 247,242 | `f03d02ff4cd42f44cdf83702155bd512d646c999dfa4fcc3bf1694ce90c17ad9` |
| [Interaction states](renewal-candidates/runtime-interaction-states-1440x960.png) | 1440×960 Town Hall; close focused, About hovered but collapsed, 14 Build controls disabled | type 3 | 293,704 | `9ab69ff52ef5cfbb308a254832be581f668f76fc20b9e9251a49d5a96756af55` |

All three are true PNGs at the stated CSS viewport dimensions and remain below 300 KiB.
The in-app Browser reported DPR 2 for the phone frame and DPR 1 for the desktop frames.
Original-detail native inspection found complete fonts and art, no missing imagery or clipped
labels, and no map error.

## Supplemental More-state geometry

The same bound shipping chrome was also measured at 1440×900 in the open and confirmation
states. In both, the dock rectangle was `[0, 766.2031, 1440, 133.7969]`, the `details`
rectangle was `[861.7891, 800, 198.2109, 88]`, the toggle was
`[861.7891, 844, 198.2109, 44]`, and the menu was `[840, 800, 220, 44]`. Open contained
Saves and Resign; confirmation contained Saves, Confirm Resign, and Cancel. Every action was
at least 44 CSS px, both menus were contained by the viewport and command dock, and both
intersection sets were empty.

The confirmation screenshot was captured for separate map-UX evidence and is deliberately not
committed in this cross-evidence proposal. Its raw JPEG SHA-256 is
`8660a4d5ba63ce2db2b39a2e25b97158390f4e8d8bde5ed32942c3927d8fc481`.
The cross-evidence validator binds both literal geometry observations and the exact repaired
shipping style/source material.

## Exact capture recipe

The bounded fixture mounts the shipping `GameScreen`, `MapCanvas`, `CityScreen`, and
`CityScene`; only audio feedback is inert. With the fixture server on
`http://127.0.0.1:4627`:

1. Open `/index.html?scene=chrome-world` at 375×812, wait at least 1.2 seconds after
   rendering settles, and capture the world frame.
2. Open `/index.html?scene=chrome-city` at 1440×900, choose City and then Manage
   Shipyard, wait at least 1.2 seconds, and capture.
3. Resize that live city page to 1440×960, close the building details, choose Manage Town
   Hall, leave focus on Close building details, hover About Town Hall without expanding it,
   wait at least 1.2 seconds, and capture.
4. For the supplemental check, open the world scene at 1440×900, choose More, record the open
   geometry, choose Resign, wait at least 1.2 seconds, and capture and measure confirmation.

The in-app Browser screenshot API emitted JPEG source frames. The checked-in ingestion tool
rejects any missing/extra raw frame, unexpected dimensions, historical decoded pixels,
historical capture bytes, non-deterministic conversion, wrong PNG type, or file over 300 KiB.

Run the fail-closed checks from the repository root:

```sh
node docs/art/gameplay-chrome-v2/renewal-fixture/build-capture-ready.mjs
node docs/art/gameplay-chrome-v2/build-renewal-proposal.mjs
```

The first command verifies the exact-source material boundary and immutable historical
anchors. The second rebinds all observations and candidate pixels, repeats deterministic and
negative controls, and fails if either proposal differs.
