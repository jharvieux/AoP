# Map UX v2 — final exact-source candidate evidence

This package records issue #613's responsive map overlays, accessible minimap, bounded camera,
command hierarchy, city-overlay focus lifecycle, fog/privacy behavior, and reduced-motion
contract. The captures came from source commit
`a5a8fd5f8c522ebddfb146510b492bcea1c28ee2` (tree
`71328fc4b018f021686ecefcd21f89a0ffc04c6a`) in the Codex in-app Browser at device pixel
ratio 1.

## Required viewport set

- [Phone — 375 × 667](runtime-captures/map-phone-375x667.jpg)
- [Phone minimap focus — 390 × 844](runtime-captures/map-phone-minimap-focus-390x844.jpg)
- [Compact landscape — 844 × 390](runtime-captures/map-phone-landscape-844x390.jpg)
- [Tablet portrait — 768 × 1024](runtime-captures/map-tablet-portrait-768x1024.jpg)
- [Tablet landscape multiplayer — 1024 × 768](runtime-captures/map-tablet-landscape-1024x768.jpg)
- [Desktop secondary commands — 1440 × 900](runtime-captures/map-desktop-more-1440x900.jpg)

The separate [multiplayer compact-landscape proof](runtime-captures/map-phone-landscape-mp-844x390.jpg)
shows the authoritative sanitized `PlayerView`, two halted orders in one selector card, all six
overlay regions, and the command dock together at 844 × 390.

The route hint and multiplayer event feed are explicit collision-fixture portals around the real
production `GameScreen`/`MatchScreen`, `MapCanvas`, minimap, alert, roster, navigation, and command
components. They prove coordinated layout under maximum overlay load; they are not presented as a
physical-touch recording. Authentication, network polling, realtime transport, and feedback are
the only multiplayer seams replaced by deterministic evidence stubs.

## Approval boundary

The seven images are final exact-source **candidate** captures. This package does not claim
operator approval. It also does not claim a touch recording: no physical or simulator device was
connected and the in-app Browser has neither multitouch emulation nor video recording. The
drag/pinch/minimap/recenter/fit/route recording therefore remains a pending external acceptance
gate.

The operator approved an M5 MacBook Air with Chrome as the available desktop performance
reference and accepted that physical-phone performance measurements are unavailable. That ruling
does not waive the touch recording or the functional phone, keyboard, accessibility, privacy, and
safe-layout evidence recorded here.

The single-player frames were captured before an MP-only fixture correction removed an impossible
hidden enemy captain. That correction does not share state with or alter the SP fixture. Both MP
frames were recaptured after the correction. The current harness retains the final SP and
sanitized MP states and binds all evidence material to the frozen application source.

See [RUNTIME-VERIFICATION.md](RUNTIME-VERIFICATION.md) for measurements and interaction results,
[RUNTIME-MEASUREMENTS.json](RUNTIME-MEASUREMENTS.json) for the literal browser observations, and
[RUNTIME-CAPTURE-MANIFEST.json](RUNTIME-CAPTURE-MANIFEST.json) for capture/source byte identities.

Regenerate and validate the receipt:

```sh
node docs/art/map-ux-v2/tools/build-receipt.mjs
node docs/art/map-ux-v2/validate.mjs
```

The validator rejects source, harness, receipt, capture, dimension, budget, approval, touch-gate,
viewport, or supplemental-MP-proof drift.
