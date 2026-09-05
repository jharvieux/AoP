# Three-band runtime captures

All six current captures come from one fresh-origin, continuous, untouched round-1 96×96 square-map
fixture session with five seats, deterministic seed 611, default/no-override theme, and no gameplay
action between frames. They were captured from runtime/source ancestor
`c1824f22bf14dca6d38f7519fd99affd789a8130` and reviewed at evidence head
`08717289778883d7adca6ff7a6f15b20fb7c6b25`, then promoted byte-identically at exact evidence head
`ec86cebf1d0d4c70c2a670f142bdddf6fab265ee`. The renewed `runtime-capture-receipt.json` binds that
exact promotion head, the shipping renderer/art digest, and all six capture bytes.

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

The same largest-map session completed 15 zoom-button transitions, four center actions, and two Fit
actions across the phone and desktop capture sequence. The in-app backend did not expose
Performance Timeline entries, so no browser frame-time percentile is claimed; the reproducible
CPU/draw-work trace and phone-device limitation are recorded in `PERFORMANCE.md`.

The operator approved these exact six combined frames on 2026-09-05. They are byte-exact with
combined candidate digest `86dc0f7afa29a73c3983942d39a43d7dd9a0e681189216457374d93fcd59e3db`;
the durable record is [issue comment 5555066496](https://github.com/jharvieux/AoP/issues/611#issuecomment-5555066496).
That approval carries across docs/evidence-only commits only while the receipt's renderer/runtime
asset digest and all six capture hashes remain exact. Any material bound-byte change requires renewed
approval.
