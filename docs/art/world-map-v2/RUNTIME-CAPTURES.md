# Runtime capture record

These captures were made from exact runtime head
`09368902401310bf9a43455865f1151a6bb02d87`. Its world-map runtime and public art are
unchanged from the independently verified complete-fleet candidate at
`7c4c56d7a28baea8a7f176e51fadd15d70353648`. They await renewed operator checkpoint-2
approval for these exact pixels.

The in-app browser used the previously unused `http://localhost:4177` origin so prior-origin
service-worker, Cache Storage, IndexedDB, or theme state could not contaminate this run.
Before starting the game, the Theme Packs screen visibly showed **Default (no overrides)**
and a disabled Active button. The browser then started a Medium Hex five-player Pirate game
through the UI, waited for eligible art to settle, zoomed in four times, and used **Center
on fleet** again after each viewport change. With no active theme override, the exact-head
web registry makes `/art/factions/pirates/ship_sloop_v2.webp` the winning sloop URL. All
three images show the same round-one Pirate world state.

| Capture                                                         | Viewport |  Bytes | SHA-256                                                            |
| --------------------------------------------------------------- | -------: | -----: | ------------------------------------------------------------------ |
| [`desktop-1440x900.jpg`](runtime-captures/desktop-1440x900.jpg) | 1440×900 | 61,088 | `cc30c6ad1a7308386880f2f1907f018d3bbd5d2571d494655ec7514394c284e2` |
| [`tablet-768x1024.jpg`](runtime-captures/tablet-768x1024.jpg)   | 768×1024 | 51,218 | `0e4b914dd95757a6abeac3b20139225160c249ecf0d802393bca67d582c894e8` |
| [`phone-390x844.jpg`](runtime-captures/phone-390x844.jpg)       |  390×844 | 33,323 | `e1902d49e2cf038931d180329d416178233672582461edee4952c533c18ba777` |

Each original was inspected at native size and clearly shows the tan, diagonal,
single-mast generated Pirate sloop inside the selection ring—not the legacy black-and-white
three-masted side-view ship. `runtime-captures/capture-receipt.json` binds the clean-session
checklist, exact source hashes, and a 50×50 px reference crop for each viewport. The
validator compares opaque source pixels against both the shipping `_v2` token and the known
legacy token. Generated-reference mean absolute RGB errors are 14.5958, 14.2021, and
13.9578; the corresponding legacy-reference errors are 77.3851, 76.8194, and 77.7315.
Known stale capture hashes are rejected explicitly.

These captures prove the same round-one Pirate city-and-sloop slice at three actual
viewport sizes, together with the explored/visible fog boundary, minimap parity, and usable
responsive map/control layout. They do not prove that every identity is simultaneously
reachable in this one game state. Complete 41-identity coverage at 24, 32, 48, and 96 px is
instead bound to shipping bytes in
`proofs/matte-stress/runtime-public-contact-sheet-41.webp`; the dedicated twenty-ship
color/grayscale matrix is in
`proofs/matte-stress/ship-fleet-runtime-contact-sheet-20.webp`.
The hidden-identity sentinel, theme-override priority, decode-failure fallback, preload
readiness, and no-fallback-pop behavior remain bound by the focused runtime tests and the
independent exact-head verification; no browser-only claim replaces those tests.

This package deliberately does not claim the terrain/semantic-zoom work tracked by #611 or
the shared chrome integration tracked by #610. Those layers are evaluated on their own
approved branches and then again on the final integrated head.
