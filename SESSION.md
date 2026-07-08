# SESSION.md — resume state

Transient whole-file-overwrite resume state. Update at session end.
_Last updated: 2026-07-07 (naval-navigation UX issue batch, D-027)._

## Just completed

**Naval-navigation UX batch (D-027): seven ready-to-execute, model-labeled issues filed — no code changes this session.**

The operator reported naval navigation is hard to understand and requested six
improvements; each was designed against the actual code (two parallel exploration passes
over `apps/web` map UI and `packages/engine` movement/combat/visibility) and filed:

| #    | Title (short)                                               | Tier   | Pri |
| ---- | ----------------------------------------------------------- | ------ | --- |
| #370 | BUG: client chebyshev vs engine hex `mapDistance` adjacency | sonnet | P1  |
| #371 | Movement-range shading on selection (green/red/yellow)      | opus   | P1  |
| #372 | Engine multi-turn sail orders + fog-of-war interrupts       | opus   | P1  |
| #375 | Dotted course preview, this-turn vs later-turn dots         | sonnet | P1  |
| #376 | Target ships/cities/encounters from any distance            | sonnet | P1  |
| #373 | Multi-city ownership audit (AI/economy/UI)                  | sonnet | P2  |
| #374 | Defeated captain's ship joins winner's fleet (prizes)       | opus   | P2  |

#370 was a bug discovered during exploration (likely part of the operator's targeting
complaint), not one of the six requests.

## In flight

None.

## Next step

Execute the batch in dependency order: **#370 first** (small correctness fix), then
**#371 + #372** (engine foundations: `reachableTiles`, sail orders), then **#375 + #376**
(course preview and any-distance targeting build on both). #373 and #374 can run anytime.
Carry-over: operator review of the #321 multiplayer tactical probe design still pending.

## Blocked on user

- Optional vetoes on product defaults embedded in the designs (see D-027): no auto-attack
  on intercept arrival (#372); prize ships join empty-crewed, no prize on failed city
  assaults (#374).
- Carry-over: #321 design go/no-go; stale `.claude/worktrees/*` cleanup (local prettier
  blocker, not CI-critical).

## Open questions

None beyond the in-issue defaults above.
