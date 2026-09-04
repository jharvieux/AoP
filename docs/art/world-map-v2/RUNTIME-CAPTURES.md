# Runtime capture record

These captures were made from the independently verified issue #609 runtime candidate at
`7c4c56d7a28baea8a7f176e51fadd15d70353648`, after the pre-PR audit repair completed the
five-faction by four-class fleet. They await renewed operator checkpoint-2 approval for
these exact pixels.

The in-app browser loaded the local Vite build, started a medium hex map with five faction
seats, waited for the interface and eligible default art to settle, zoomed to gameplay
detail, and used the shipping **Center on fleet** control after each viewport change. All
three images therefore show the same round-one Pirate world state.

| Capture                                                         | Viewport |  Bytes | SHA-256                                                            |
| --------------------------------------------------------------- | -------: | -----: | ------------------------------------------------------------------ |
| [`desktop-1440x900.jpg`](runtime-captures/desktop-1440x900.jpg) | 1440×900 | 61,817 | `0bb8ad71284cf9c832735d9b96ec562304bbaabf154cf3ee10ce0d96f201bc35` |
| [`tablet-768x1024.jpg`](runtime-captures/tablet-768x1024.jpg)   | 768×1024 | 51,000 | `891de6f6b71eb8fa8da0cce1b43712d7a0bb912fe14e789cb17a216c031f29e2` |
| [`phone-390x844.jpg`](runtime-captures/phone-390x844.jpg)       |  390×844 | 30,814 | `5e636d9e945bfa237f21a1f202c99400fe0dbbe9bbadf454d1c16d9986a9056f` |

The captures verify the same round-one Pirate city and current generated Pirate sloop at
three actual viewport sizes, together with the explored/visible fog boundary, minimap
parity, and usable responsive map/control layout. Complete 41-identity coverage at 24, 32,
48, and 96 px is bound to shipping bytes in
`proofs/matte-stress/runtime-public-contact-sheet-41.webp`; the dedicated twenty-ship
color/grayscale matrix is in
`proofs/matte-stress/ship-fleet-runtime-contact-sheet-20.webp`.
The hidden-identity sentinel, theme-override priority, decode-failure fallback, preload
readiness, and no-fallback-pop behavior remain bound by the focused runtime tests and the
independent exact-head verification; no browser-only claim replaces those tests.

This package deliberately does not claim the terrain/semantic-zoom work tracked by #611 or
the shared chrome integration tracked by #610. Those layers are evaluated on their own
approved branches and then again on the final integrated head.
