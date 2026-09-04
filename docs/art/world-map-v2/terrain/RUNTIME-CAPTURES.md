# Three-band runtime captures

> **Repair recapture required:** these six images bind the pre-repair renderer digest recorded in
> `runtime-capture-receipt.json`. The current candidate deliberately fails the terrain asset check
> with `recapture required`; the available browser backend exposed no browser and the local preview
> could not bind its port in this sandbox. Retaining the old files makes the gap explicit and does not
> represent them as evidence for the repaired pixels.

All six captures come from one untouched round-1 96×96 square-map session with five seats,
default/no-override theme, and no gameplay action between frames. The browser origin was fresh so
the development service worker could not substitute an older same-path terrain asset. Exact image
hashes, camera procedures, canvas sizes, and limitations are in `runtime-capture-receipt.json`.

The New Game UI creates a seeded deterministic map but does not expose that seed. These images
therefore bind the same live session and renderer/art digest, while the separately recorded seed-611
square/hex trace binds repeatable map and terrain-selection checksums.

## Desktop — 1440×900

### Overview

![Desktop overview](runtime-captures/desktop-overview.png)

### Tactical

![Desktop tactical](runtime-captures/desktop-tactical.png)

### Detail

![Desktop detail](runtime-captures/desktop-detail.png)

## Phone — 390×844

### Overview

![Phone overview](runtime-captures/phone-overview.png)

### Tactical

![Phone tactical](runtime-captures/phone-tactical.png)

### Detail

![Phone detail](runtime-captures/phone-detail.png)

## Interaction smoke

The same largest-map session completed 22 bidirectional pan drags, 12 zoom-button transitions
through overview/tactical/detail, and two fleet recenters on the phone viewport. The browser console
reported no warning or error. The in-app backend did not expose Performance Timeline entries, so no
browser frame-time percentile is claimed; the reproducible CPU/draw-work trace is recorded in
`PERFORMANCE.md`.

These captures still require operator approval. They are not represented as an approved checkpoint.
