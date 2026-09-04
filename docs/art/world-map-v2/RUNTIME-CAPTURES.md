# Runtime capture record

These captures were made from the independently verified issue #609 runtime candidate at
`855c4c9c30c515a8b57e95177f0fe99982113eb3`, before this evidence-only commit.

The in-app browser loaded the local Vite build, started a medium hex map with five faction
seats, waited for `document.fonts.ready`, zoomed to gameplay detail, and used the shipping
**Center on fleet** control after each viewport change. All three images therefore show the
same round-one Pirate world state after eligible default art had settled.

| Capture                                                         | Viewport |  Bytes | SHA-256                                                            |
| --------------------------------------------------------------- | -------: | -----: | ------------------------------------------------------------------ |
| [`desktop-1440x900.jpg`](runtime-captures/desktop-1440x900.jpg) | 1440×900 | 59,724 | `8aa7ce698ab87dd9e018910c7e37b7fc05d4c8509893fa07eea99ce40aa02bca` |
| [`tablet-768x1024.jpg`](runtime-captures/tablet-768x1024.jpg)   | 768×1024 | 50,169 | `dd6e39557b6bc35efb429cf7dbf3c64fea60af3062265d8a67c1052c454eb5ec` |
| [`phone-390x844.jpg`](runtime-captures/phone-390x844.jpg)       |  390×844 | 33,085 | `c6f8fbd30b66841944f0f1232f26a7bdb0ceb6fcce4a4ab266eb833009e84c5c` |

The captures verify representative actual-size default city, ship, party, encounter, and
site presentation, the explored/visible fog boundary, minimap parity, and usable responsive
map/control layout.
The hidden-identity sentinel, theme-override priority, decode-failure fallback, preload
readiness, and no-fallback-pop behavior remain bound by the focused runtime tests and the
independent exact-head verification; no browser-only claim replaces those tests.

This package deliberately does not claim the terrain/semantic-zoom work tracked by #611 or
the shared chrome integration tracked by #610. Those layers are evaluated on their own
approved branches and then again on the final integrated head.
