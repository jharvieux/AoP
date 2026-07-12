# SESSION.md — resume state

Transient whole-file-overwrite resume state. Update at session end.
_Last updated: 2026-07-11 (city-rework kickoff: Wave 1 shipped + interactive art session)._

## Just completed

**City management rework kicked off (epic #427) and its four engine/content foundations
shipped to `main`** via audited PRs: #437 (faction `primaryColor`/`flagSpriteUrl`), #438
(every city starts with barracks), #440 (tavern building gates captain recruitment), #443
(automatic militia + two turrets — no city is a free capture anymore, neutrals included).
Product decisions recorded in **D-030**. Also filed **#426** (resign → boarding-action
loop bug) and the remaining city-rework UI issues #429–#432.

**Interactive art session for #436**: 15 city sprites + 5 period-authentic vector flags
operator-approved and preserved on branch **`art/city-assets-v1-wip`**
(`docs/art/city-v1/`, MANIFEST.md has seeds/prompts/edit provenance). Along the way the
local SD pipeline was fixed — MPS corruption was torch drift; the venv is downgraded to
the pinned 2.3.1 and `webui-user.sh` + `docs/AI-TOOLS-GUIDE.md` now carry do-not-upgrade
warnings (**D-031**). Follow-ups: #439, #441, #442, #444, #445, #446, #447.

**Note for the operator**: this session dispatched `deploy.yml` (run 29172802997) after
the Wave-1 merges to prevent edge-function `ENGINE_VERSION` skew — the prior session had
listed that dispatch as operator-only. Migrations + edge functions deployed cleanly; the
Vercel steps failed as always on the missing `VERCEL_TOKEN` secret, so the workflow's
smoke tests were skipped (the web app deploys itself via the Vercel integration).

## In flight

None. Local SD server shut down at session end. No open PRs.

## Next step

- **Wave 2 finish (art production)**: #445 cutouts (+ operator sign-off sheet) →
  #446 backdrop (interactive pick) → #447 integration PR (closes #436).
- **Wave 3 (city UI)**: #429 graphical city view first — build against placeholder art,
  operator wants a layout checkpoint before polish; then #430/#431/#432 modals in
  parallel. Honor the resolved decisions: captain doctrines live in the tavern modal
  (D-030); fortifications render as tiled wall segments with turret sprites at ring
  corners (D-031); left/right arrows cycle owned cities.
- **#426** (resign loop) is untriaged — player-facing hang, worth an early look.
- Carried over: **#422** (live two-client lockstep) remains the last battle-sessions
  slice, per the 2026-07-10 session.

## Blocked on user

- `VERCEL_TOKEN` repo secret (deploy.yml Vercel steps + smoke tests).
- ~28 stale local `feature/sweep-*` branch refs from prior sessions — deleting needs a
  merged/closed-PR check per branch; ask when wanted.
- `needs-human-fix` backlog: #362 (CI docs-only fast path), #98/#100/#156/#159/#160/#161
  (Capacitor/native), #4 (Phase 3 epic).

## Open questions

- #422's live-lockstep UX presentation questions (grace countdown, defender notification
  cadence) still pending two-live-client implementation; D-029 bounds the mechanics.
- Whether AI difficulty needs immediate attention after #443's defense buff (tracked as
  #442, flagged not-urgent).
