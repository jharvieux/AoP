# SESSION.md — resume state

Transient whole-file-overwrite resume state. Update at session end.

## Just completed

- Phase 0 scaffold merged (engine skeleton + tests, content placeholders, web shell, CI).
- Multiplayer spec (docs/MULTIPLAYER.md) merged; issue #29 closed.
- Issue #1 (issue-sweep prerequisites): branch protection live on main (required `ci`
  check), bare haiku/sonnet/opus labels created, CLAUDE.md + MEMORY/SESSION protocol +
  hooks + runbooks ported from ATC.

## In flight

- PR for the ATC-conventions port (this change set) — squash-merge when CI passes, then
  close #1.

## Next step

- Start Phase 1: issue #6 (world map generation) and #9 (resource economy) are the
  unblocked P0s.

## Blocked on user

- Activate the Claude Code hooks by pasting `.claude/settings.json` per
  docs/runbooks/claude-code-setup.md (tracked as a GitHub issue).

## Open questions

- Web ad network choice (Phase 4; native is AdMob by default).
- Simultaneous-turn variant someday (action-log design permits it).
