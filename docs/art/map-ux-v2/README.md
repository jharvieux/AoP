# Map UX v2 — approved exact-source evidence

This package records issue #613's responsive map overlays, accessible minimap, bounded camera,
command hierarchy, city-overlay focus lifecycle, fog/privacy behavior, and reduced-motion
contract. The captures came from source commit
`c1824f22bf14dca6d38f7519fd99affd789a8130` (tree
`68b5529d91f15cdbfeeb0f612da5ee0c7ebd547d`) in the Codex in-app Browser. The 375 × 667
frame used DPR 2; the other six frames used DPR 1.

## Required viewport set

- [Phone — 375 × 667](runtime-captures/map-phone-375x667.jpg)
- [Phone minimap focus — 390 × 844](runtime-captures/map-phone-minimap-focus-390x844.jpg)
- [Compact landscape — 844 × 390](runtime-captures/map-phone-landscape-844x390.jpg)
- [Tablet portrait — 768 × 1024](runtime-captures/map-tablet-portrait-768x1024.jpg)
- [Tablet landscape multiplayer — 1024 × 768](runtime-captures/map-tablet-landscape-1024x768.jpg)
- [Desktop secondary commands — 1440 × 900](runtime-captures/map-desktop-more-1440x900.jpg)

The separate [multiplayer compact-landscape proof](runtime-captures/map-phone-landscape-mp-844x390.jpg)
shows the authoritative sanitized `PlayerView`, two halted orders in one selector card, all six
overlay regions, the command dock, and the expanded resign confirmation together at 844 × 390.
Its measured Confirm Resign, Cancel, and Leave actions are fully contained after the compact-menu
repair. The required SP 844 × 390 frame records the equivalent confirmation geometry; the desktop
frame records More open.

The route hint and multiplayer event feed are explicit collision-fixture portals around the real
production `GameScreen`/`MatchScreen`, `MapCanvas`, minimap, alert, roster, navigation, and command
components. They prove coordinated layout under maximum overlay load; they are not presented as a
physical-touch recording. Authentication, network polling, realtime transport, and feedback are
the only multiplayer seams replaced by deterministic evidence stubs.

## Approval boundary

The operator approved all seven exact-source captures at evidence head
`08717289778883d7adca6ff7a6f15b20fb7c6b25`; the permanent record is
[issue #613](https://github.com/jharvieux/AoP/issues/613#issuecomment-5555054349). The same
record links the [durable Simulator recording](https://github.com/user-attachments/assets/764e3854-47ee-4c34-bd7a-8c859a76d453).
The 920,404-byte GitHub-safe derivative is SHA-256 `5ce7e920…` and derives from the preserved
19,337,683-byte original MOV, SHA-256 `06523603…`; its metadata is SHA-256 `1618a296…`.
The exact-source iPhone Simulator XCTest passed drag, pinch, minimap navigation, fleet recenter,
fit, and route preview/confirmation.

The operator approved an M5 MacBook Air with Chrome as the available desktop performance
reference and accepted that physical-phone performance measurements are unavailable. That ruling
does not represent physical-phone performance evidence. The functional phone, keyboard,
accessibility, privacy, and safe-layout evidence is recorded here.

All seven frames were captured fresh after the MP-only fixture correction removed an impossible
hidden enemy captain and after the compact multiplayer More-menu containment repair. The current
harness retains the final SP and sanitized MP states and binds all evidence material to the frozen
application source. No pixel from either superseded source head is retained.

See [RUNTIME-VERIFICATION.md](RUNTIME-VERIFICATION.md) for measurements and interaction results,
[RUNTIME-MEASUREMENTS.json](RUNTIME-MEASUREMENTS.json) for the literal browser observations, and
[RUNTIME-CAPTURE-MANIFEST.json](RUNTIME-CAPTURE-MANIFEST.json) for capture/source byte identities.

Regenerate and validate the receipt:

```sh
node docs/art/map-ux-v2/tools/build-receipt.mjs
node docs/art/map-ux-v2/validate.mjs
```

The validator rejects source/archive, harness, receipt, capture, dimension, budget, approval,
touch-integration, viewport, DPR, overlay-geometry, More-menu containment, action clipping, or
supplemental-MP-proof drift.
