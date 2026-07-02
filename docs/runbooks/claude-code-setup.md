# Claude Code setup

`.claude/settings.json` is **gitignored** (per-machine), so hooks must be wired once per
clone. The hook scripts themselves are tracked under `.claude/hooks/`.

Paste this into `.claude/settings.json` at the repo root:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/block-memory-edits.mjs"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/typecheck-changed-workspaces.mjs" },
          { "type": "command", "command": "node .claude/hooks/run-affected-tests.mjs" }
        ]
      }
    ]
  }
}
```

What each hook does:

| Hook                               | Event      | Purpose                                                                                                                          |
| ---------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `block-memory-edits.mjs`           | PreToolUse | Enforces MEMORY.md append-only (fails closed). Edits must prepend: `new_string` must end with `old_string` verbatim.             |
| `typecheck-changed-workspaces.mjs` | Stop       | Typechecks only workspaces with changed TS files; failures block the stop and feed back to the agent.                            |
| `run-affected-tests.mjs`           | Stop       | Runs the engine test suite when `packages/{engine,shared,content}` changed — the determinism tests are the repo's core contract. |

Both Stop hooks respect `stop_hook_active` to prevent feedback loops. If a hook
misbehaves, remove its entry from settings.json (do not delete the script) and open an
issue.
