# #613 cross-evidence renewal

## Status

All approvals inherited from issues #608, #610, #611, and #612 are historical evidence for
their former source revisions and do **not** carry to repaired #613 source
`a5a8fd5f8c522ebddfb146510b492bcea1c28ee2`. The 28 city UI and city-art targets have now
been replaced with 22 fresh browser frames, including six byte-identical cross-set copies.
They have passed native inspection, but direct operator approval remains pending. The three
gameplay-chrome and six terrain replacements remain separate #613 work.

`RUNTIME-EVIDENCE-RENEWAL.json` is the fail-loud pending record. It binds the 14 source and
test inputs changed by #613, records the four historical binding identities, declares the
exact 37-frame inventory, and records per-set renewal progress. Direct operator approval is
deliberately null until all replacement pixels are reviewable and the operator approves the
exact final evidence head.

Run the pending-state check from the repository root:

```bash
node docs/art/city-ui-v2/prepare-runtime-evidence-renewal.mjs --check-pending
```

The command succeeds only when the target source census is intact, every former approval is
marked non-reusable, each renewed set matches its exact pending binding, each unrenewed set
still matches its historical binding, and #610's immutable material anchor is unchanged. It
also rejects reuse of any historical city pixel and verifies the six declared cross-set
copies. The approval gate is a separate failing-direction check:

```bash
node docs/art/city-ui-v2/prepare-runtime-evidence-renewal.mjs --validate-approved
```

That command must fail until the capture replacement, native validators, direct operator
approval, and reviewed receipt updates are complete.

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
  --source-head a5a8fd5f8c522ebddfb146510b492bcea1c28ee2 \
  --captured-on YYYY-MM-DD \
  --confirmation PREPARE_UNAPPROVED_CAPTURE_PROPOSAL
```

The proposal utility validates all 37 signatures, dimensions, required PNG color types, and
budgets, then records byte counts and SHA-256 hashes. It refuses repository-local staging or
output and creates a new output file rather than overwriting one. It never edits retained
captures, bindings, receipts, reports, approval fields, or
`../gameplay-chrome-v2/RUNTIME-MATERIAL-BASELINE.json`.

## Integration order

1. Land the final #613 source and re-run `--check-pending`. If any source byte changes from
   the target census, refresh this preparation before capturing.
2. Capture all 37 frames, generate unapproved proposals, and independently inspect the exact
   staged bytes. The city batch uses the stricter 22-frame/28-target validator documented in
   `tools/runtime-harness/README.md`.
3. Replace the four retained capture sets and mechanically update their native receipts,
   bindings, and reports from the proposal. Do not copy an old approval record forward.
4. Run the #612, #608, #610, and #611 native validators plus the repository verification
   gate. #610's normal builder must remain blocked by the old material anchor at this stage.
5. Present permanent links for the exact new files and obtain direct operator approval.
6. Only after that approval, update the four approval records and renew #610's material
   anchor with a separately reviewed `apply_patch`; rebuild bindings and rerun all validators.
