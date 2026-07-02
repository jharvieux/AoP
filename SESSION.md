# SESSION.md — resume state

Transient whole-file-overwrite resume state. Update at session end.

## Just completed

- Sweep batch A (branch `feature/sweep-engine-2`): landed the Phase-1 engine vertical slice.
  - #6 seeded map generation (square grid, fair home islands, coastlines, start positions).
  - #8 captains + movement points + deterministic naval A* pathfinding + `moveCaptain`.
  - #12 combat resolution engine (round-based, `BattleReport`) with an extensible resolver
    interface; combat stats injected from @aop/content, never hardcoded in the engine.
  - #18 hybrid tactical combat (broadside/board/ram/evade, bounded RPS matrix, flee/escape,
    three drivers over one code path) plugged into the #12 round engine.
  - #13 pure utility-scoring AI (`nextAiAction`/`runAiTurn`), chunked non-blocking in
    App.tsx, edge-function-ready. MapCanvas now renders the real map + captains.
  - #24 headless balance simulation harness (`simulateMatch`/`runTournament`) +
    `scripts/balance-sim.ts`; tuned `DAMAGE_SCALE` to cut mutual-destruction draws.
- `pnpm verify` green (59 engine tests). Decision recorded as D-012.

## In flight

- PR "Sweep batch A" open into `main` — squash-merge when CI passes.

## Next step

- Remaining Phase-1 P0s (epic #2 stays open): #9 resource economy, #7 map interaction,
  #10 cities, #11 recruitment.

## Blocked on user

- Activate the Claude Code hooks (`.claude/settings.json`) per docs/runbooks.

## Open questions

- Real faction balance pass (#24) is deferred until the economy (#9–#11) exists — faction
  stat asymmetry is intentional flavour meant to be balanced by cost, not identical stats.
  Should ship speed drive captain movement points once shipyards land?
