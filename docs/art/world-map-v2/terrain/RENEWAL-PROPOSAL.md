# Terrain runtime-capture renewal proposal

> **Unapproved candidate evidence.** These six fresh frames do not replace the historical
> `runtime-captures/` set and do not reuse its approval. Direct operator review of these
> exact pixels is still required.

The frames were captured on 2026-09-05 from one fresh-origin, continuous, untouched default
theme session: deterministic seed 611, xlarge 96×96 square map, five seats, Pirates human,
round 1. No gameplay action occurred between captures. The source ancestor is
`c1824f22bf14dca6d38f7519fd99affd789a8130` (tree
`68b5529d91f15cdbfeeb0f612da5ee0c7ebd547d`).

The combined chrome-and-terrain candidate digest is
`86dc0f7afa29a73c3983942d39a43d7dd9a0e681189216457374d93fcd59e3db`.
`PROPOSAL.json` deliberately remains an unapproved proposal with a null approval record.

## Native-size candidates

| Candidate                                                   | DPR | Measured band evidence |  Bytes | SHA-256                                                            |
| ----------------------------------------------------------- | --: | ---------------------- | -----: | ------------------------------------------------------------------ |
| [Desktop overview](renewal-candidates/desktop-overview.png) |   1 | Fit; overview          | 31,531 | `e7df1f36edc36f8cae0007735ca5442b20b8330b7151f5275d6321743694849e` |
| [Desktop tactical](renewal-candidates/desktop-tactical.png) |   1 | Center map; tactical   | 43,284 | `1ecbb403c51473c1f05b5debd64e559f3e7220ca73b05b154b83b2b55cb0eb9e` |
| [Desktop detail](renewal-candidates/desktop-detail.png)     |   1 | Center map; detail     | 65,770 | `29517b2e105e93de1375dc8fe35b369579266f9c4207294627ffc98a4adf12eb` |
| [Phone overview](renewal-candidates/phone-overview.png)     |   2 | Fit; full-map overview | 21,486 | `62bb619068c5abcbd7d429480127069e7610cddbeff0b36628e0796f0f05e408` |
| [Phone tactical](renewal-candidates/phone-tactical.png)     |   2 | 25.300965 px/tile      | 33,256 | `4c722485249acd082a5bedbb0a0b62636e8c3437ae79deba00a5a157accfecc1` |
| [Phone detail](renewal-candidates/phone-detail.png)         |   2 | 49.415889 px/tile      | 49,886 | `034a00c80f4d6195310084e735e9539d532dd5ef7971e4038c39e7af28fda7f1` |

All six are true indexed PNGs at 1440×900 or 390×844 and remain below 300 KiB.
Original-detail native inspection found complete fonts and art, no clipped label, missing
image, document overflow, or map error, and a minimum visible direct target of 44 CSS px.
The minimap-derived Fit diagnostics saturated at `0.46875` on desktop and `0.126953` on
phone, so they are explicitly recorded as non-authoritative. The prescribed shipping Fit
action and the shipping fit-camera calculation establish the overview states; the mostly fogged
desktop result truthfully reflects the round-1 revealed cluster after the single-player fog-leak
repair. Phone tactical and detail retain their direct tile measurements; the desktop states
retain their literal semantic-band observations.

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
