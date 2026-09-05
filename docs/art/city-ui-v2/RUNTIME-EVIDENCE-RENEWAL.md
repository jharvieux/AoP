# #613 cross-evidence renewal

## Status

The operator approved all 37 exact-source targets for issues #608, #610, #611, and #612 at
evidence head `08717289778883d7adca6ff7a6f15b20fb7c6b25`. The permanent set-specific
records are linked from `RUNTIME-EVIDENCE-RENEWAL.json`; the #613 cross-evidence record is
[issue #613](https://github.com/jharvieux/AoP/issues/613#issuecomment-5555054349). All frames
picture repaired application source `c1824f22bf14dca6d38f7519fd99affd789a8130`. The city
sets contain 28 targets from 22 fresh browser frames, including six byte-identical cross-set
copies. The three gameplay-chrome and six terrain frames were promoted byte-identically from
their approved proposals at promotion head `ec86cebf1d0d4c70c2a670f142bdddf6fab265ee`.

`RUNTIME-EVIDENCE-RENEWAL.json` is the fail-loud approval record. It binds the 18 source and
test inputs changed by #613, all four historical binding identities, the exact 37-frame
inventory, promoted binding/receipt hashes, and the permanent approval records.

Run the approved-state check from the repository root:

```bash
node docs/art/city-ui-v2/prepare-runtime-evidence-renewal.mjs --validate-approved
```

The command succeeds only when the target source census is intact, every former approval is
marked non-reusable, each promoted set matches its final binding or receipt, all 37 retained
files equal the approved evidence bytes, and every approval URL and material anchor is exact.
It also rejects reuse of historical pixels and verifies the six declared cross-set copies.
The old pending-state command is now a failing-direction check:

```bash
node docs/art/city-ui-v2/prepare-runtime-evidence-renewal.mjs --check-pending
```

That command must fail after the approved renewal replaces the pending state.

## Capture recipe

Build and serve the exact target source with a fresh origin. Use the normal UI or a truthful
import harness around shipping components and content; never substitute a synthetic visual
reimplementation or mutate a fixture after construction. Do not claim that fonts/images were
programmatically awaited. After every final camera, zoom, panel, or viewport operation, wait
for a visibly settled frame and inspect the saved file at native size.

Capture these sets in this order so one city session can supply the shared states:

1. **#612 city UI (20 JPEGs, captured):** the truthful shipping-component harness created the
   exact 2-building round-1, 8-building round-13, and 14-building round-54 Pirate states from
   `RUNTIME-CAPTURES.md`. It covered the six 1× starting/full breakpoints (320×568, 375×812,
   430×932, 768×1024, 844×390, 1440×900), two midgame frames, three 3× checks, and the
   build/recruit/tavern panels through visible shipping controls.
2. **#608 city art (8 JPEGs, captured):** six shared browser frames were copied
   byte-identically from the #612 batch; the 390×844 starting/full views were captured in the
   same harness session. Native review covered the mounted faction flag, construction truth,
   alpha edges, backdrop seams, and dry-shore to waterward Shipyard connection.
3. **#610 gameplay chrome (3 true PNGs):** recreate the three frozen states in
   `../gameplay-chrome-v2/RUNTIME-VERIFICATION.md`: 375×812 phone world, 1440×900 Shipyard
   inspector, and 1440×960 Town Hall interaction states. Preserve PNG color type 2 for the
   phone frame and type 3 for both desktop frames.
4. **#611 terrain (6 PNGs):** use one fresh-origin, untouched round-1 xlarge 96×96 session.
   Without gameplay actions, capture overview, tactical, and detail at 1440×900 desktop and
   390×844 phone using the fit/zoom/recenter sequence documented in
   `../world-map-v2/terrain/RUNTIME-CAPTURES.md`.

The JSON manifest is the canonical filename/dimension/encoding inventory. Every file remains
under the 300 KiB evidence ceiling.

## Mechanical ingestion

Stage new captures outside the repository with this directory shape:

```text
<stage-root>/
  city-ui-v2/<20 filenames>
  city-harbor-v2/<8 filenames>
  gameplay-chrome-v2/<3 filenames>
  world-map-terrain-v2/<6 filenames>
```

Then create a no-approval proposal outside the repository:

```bash
node docs/art/city-ui-v2/prepare-runtime-evidence-renewal.mjs --proposal \
  --stage-root /absolute/staging/path \
  --output /absolute/new/proposal.json \
  --source-head c1824f22bf14dca6d38f7519fd99affd789a8130 \
  --captured-on YYYY-MM-DD \
  --confirmation PREPARE_UNAPPROVED_CAPTURE_PROPOSAL
```

The proposal utility validates all 37 signatures, dimensions, required PNG color types, and
budgets, then records byte counts and SHA-256 hashes. It refuses repository-local staging or
output and creates a new output file rather than overwriting one. It never edits retained
captures, bindings, receipts, reports, approval fields, or
`../gameplay-chrome-v2/RUNTIME-MATERIAL-BASELINE.json`.

## Completed integration order

1. The final #613 application source was frozen and all 37 frames were captured.
2. Independent native-size review and proposal negative controls passed.
3. The operator approved the exact displayed evidence and permanent issue records were posted.
4. The #610 and #611 captures were promoted byte-identically and their material anchors renewed.
5. All four set-specific records and this cross-evidence validator were rebound to the approved
   evidence, promotion head, and permanent comments.
