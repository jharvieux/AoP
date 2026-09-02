# Codex repository setup

Codex loads this directory only for a trusted project. Open `/hooks` in Codex to review and
trust the current `.codex/hooks.json` definitions after cloning or whenever their hash
changes.

## Hook contract

The configuration follows the current [Codex hooks documentation](https://learn.chatgpt.com/codex/hooks):

- `PreToolUse` matches the canonical `Bash` and `apply_patch` tool names. `Edit` and `Write`
  are matcher aliases for `apply_patch`, not values reported in `tool_name`.
- Both tools provide their source text in `tool_input.command`. The MEMORY guard exits `2`
  to deny a rejected call.
- `Stop` hooks receive `stop_hook_active` and print `{}` on successful exit, as required for
  valid Stop-hook output.
- Hook commands resolve scripts from the Git root so they also work when Codex starts in a
  repository subdirectory.

The MEMORY hook allows only a single `apply_patch` hunk that adds lines before the first
existing line of the repository-root `MEMORY.md`. It rejects removals, later insertions,
whole-file replacement patterns, malformed input, and shell commands that mention
`MEMORY.md` unless the command is a simple allowlisted read.

Codex documents tool hooks as a guardrail rather than a complete enforcement boundary.
`AGENTS.md` therefore also forbids every shell or script write to `MEMORY.md`; agents must
use `apply_patch` for a prepend. The hook deliberately blocks ambiguous shell commands
instead of trying to fully interpret shell syntax.

## Verification

Run the dependency-free hook regression suite with:

```sh
node --test .codex/hooks/hooks.test.mjs
```

Syntax-check every hook with:

```sh
for hook in .codex/hooks/*.mjs; do node --check "$hook"; done
```
