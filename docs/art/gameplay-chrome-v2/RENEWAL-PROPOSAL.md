# Gameplay chrome v2 exact-source renewal proposal

> **Unapproved candidate evidence.** These three files do not replace the approved
> `runtime-captures/` set, do not renew `RUNTIME-MATERIAL-BASELINE.json`, and do not
> inherit any historical approval. Direct operator review of these exact pixels is still
> required.

This proposal was captured on 2026-09-05 from shipping components and exact runtime/source
ancestor `a5a8fd5f8c522ebddfb146510b492bcea1c28ee2` (tree
`71328fc4b018f021686ecefcd21f89a0ffc04c6a`). The complete fail-closed source,
renderer, asset, and fixture boundary is
`6678cab608897369cfa5ca08cfd36a71f3eddfad9da49fc8756ddc46e774abb3`.

The combined chrome-and-terrain candidate digest is
`7d300d1e6010953bbcbfd89697cb764f35b9285560c4232fd32ee90cb860beba`.
It binds all nine converted capture bytes, their raw-source hashes, observations, and
source/material/renderer/fixture identities. `PROPOSAL.json` deliberately records
`unapproved-proposal`, a pending direct-operator approval, and a null approval record.

## Native-size candidates

| Candidate                                                                        | State frozen in the frame                                                                  |    PNG |   Bytes | SHA-256                                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -----: | ------: | ------------------------------------------------------------------ |
| [Phone world](renewal-candidates/runtime-phone-world-375x812.png)                | 375×812 world chrome                                                                       | type 2 | 132,682 | `95ca834f76f57ba77465a6a77e1f27e0d72046f2a0048f749e2b4475903adce7` |
| [City inspector](renewal-candidates/runtime-city-inspector-1440x900.png)         | 1440×900 Shipyard inspector                                                                | type 3 | 243,256 | `c2e3212dfe59b7afc454b1336c60af38aeab79f916878efe093297e405d4ff8f` |
| [Interaction states](renewal-candidates/runtime-interaction-states-1440x960.png) | 1440×960 Town Hall; close focused, About hovered but collapsed, 14 Build controls disabled | type 3 | 292,600 | `95c5215c2856197ed1b238f109f58ec1718ffba2f161a59c2521caa9d4184f58` |

All three are true PNGs at the stated CSS viewport dimensions and remain below 300 KiB.
The in-app Browser reported DPR 1 for these frames. Original-detail native inspection found
complete fonts and art, no missing imagery or clipped labels, and no map error.

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
