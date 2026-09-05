# Terrain runtime-capture renewal proposal

> **Unapproved candidate evidence.** These six fresh frames do not replace the historical
> `runtime-captures/` set and do not reuse its approval. Direct operator review of these
> exact pixels is still required.

The frames were captured on 2026-09-05 from one fresh-origin, continuous, untouched default
theme session: deterministic seed 611, xlarge 96×96 square map, five seats, Pirates human,
round 1. No gameplay action occurred between captures. The source ancestor is
`a5a8fd5f8c522ebddfb146510b492bcea1c28ee2` (tree
`71328fc4b018f021686ecefcd21f89a0ffc04c6a`).

The combined chrome-and-terrain candidate digest is
`7d300d1e6010953bbcbfd89697cb764f35b9285560c4232fd32ee90cb860beba`.
`PROPOSAL.json` deliberately remains an unapproved proposal with a null approval record.

## Native-size candidates

| Candidate                                                   | DPR | Measured band evidence |  Bytes | SHA-256                                                            |
| ----------------------------------------------------------- | --: | ---------------------- | -----: | ------------------------------------------------------------------ |
| [Desktop overview](renewal-candidates/desktop-overview.png) |   1 | Fit; full-map overview | 31,531 | `e7df1f36edc36f8cae0007735ca5442b20b8330b7151f5275d6321743694849e` |
| [Desktop tactical](renewal-candidates/desktop-tactical.png) |   1 | 25.875944 px/tile      | 43,289 | `a1c7a3134badde5e07c1c55d93e398ef1a24f62654c7b1723a3508882c33b7a8` |
| [Desktop detail](renewal-candidates/desktop-detail.png)     |   1 | 49.4159 px/tile        | 65,805 | `3ef4069bd3cbd12524a1ab7cc3ec3d045b3e0832b48cfdd5eb4caaa649b295c6` |
| [Phone overview](renewal-candidates/phone-overview.png)     |   2 | Fit; full-map overview | 21,486 | `62bb619068c5abcbd7d429480127069e7610cddbeff0b36628e0796f0f05e408` |
| [Phone tactical](renewal-candidates/phone-tactical.png)     |   2 | 25.300965 px/tile      | 33,185 | `8789251d5454be26e5579ea170b30394c0a51d738cc6c61c29f01bd7c6275d2f` |
| [Phone detail](renewal-candidates/phone-detail.png)         |   2 | 49.415889 px/tile      | 49,774 | `f0ded7c85e3d0052f07a1d222334bc2c1a9641f3a1d99ce394e8075929bc0c4b` |

All six are true indexed PNGs at 1440×900 or 390×844 and remain below 300 KiB.
Original-detail native inspection found complete fonts and art, no clipped label, missing
image, document overflow, or map error, and a minimum visible direct target of 44 CSS px.
The Fit scale diagnostic saturated in the capture environment, so it is recorded as
non-authoritative; the prescribed Fit control state and visibly complete full-map framing
establish the two overview frames. Tactical and detail retain their direct tile measurements.

## Exact capture recipe

Open `http://127.0.0.1:4627/index.html?scene=terrain` once in a fresh in-app Browser
origin. Keep the same live page and never take a gameplay action:

1. At 390×844, choose Fit, settle at least 1.2 seconds, and capture overview.
2. Choose Zoom in nine times, then Center map, settle, and capture tactical.
3. Choose Zoom in three more times, then Center map, settle, and capture detail.
4. Resize the same page to 1440×900, choose Center map, settle, and capture detail.
5. Choose Zoom out three times, then Center map, settle, and capture tactical.
6. Choose Fit, settle, and capture overview.

The shipping `MapCanvas` supplies every rendered pixel. The fixture adds no replacement
map renderer, generated screenshot art, theme override, or gameplay mutation. The shared
source/material/renderer/fixture binding and all capture observations live with the chrome
proposal; run:

```sh
node docs/art/gameplay-chrome-v2/renewal-fixture/build-capture-ready.mjs
node docs/art/gameplay-chrome-v2/build-renewal-proposal.mjs
```

Both commands include deterministic and negative controls and preserve all historical
evidence files byte-for-byte.
