# SESSION.md — resume state

Transient whole-file-overwrite resume state. Update at session end.
_Last updated: 2026-07-06 (issue sweep + title emblem)._

## Just completed

- **Full `/issue-sweep`**: 14 issues fixed and squash-merged into `main` across 8 PRs
  (#313 #314 #315 #316 #318 #319 #323 #324 #325 #327), each `pre-pr-reviewer`-audited with
  green `ci`. Closed: #295 #296 #297 #298 #299 #300 #301 #303 #304 #305 #306 #308 #309 #311.
  Highlights: turn-2 rush fix + multiple captains/capture/ransom (#308/#309), fog-along-path
  (#295), PixiJS teardown crash (#306), sprite crispness + ship animation (#300/#297),
  battle playback + Tactical mode (#304/#305), board animation + ambient map (#303/#298),
  design tokens + transitions (#301), auth discoverability (#296).
- **#311 title emblem**: replaced the interim hand-drawn skull with the **CC0 "Jolly Roger 2"**
  (Wikimedia Commons), recoloured to the parchment palette, shipped as a static asset
  (`public/art/ui/skull-emblem.svg`) to stay under the #253 bundle budget. Local Stable
  Diffusion (DreamShaper) was tried first but couldn't render crossbones / kept biasing
  yellow. Parchment stayed the CSS gradient. See D-024.

## In flight

- None — sweep fully finalized, no open PRs.

## Next step

- Operator decisions on the sweep's tech-debt (see D-024): the **#319 two-gold-token split**
  (`--accent` #c8962c vs `--color-gold` #c9a227) and the thin bundle-budget headroom
  (~846 KB raw / 850 KB ceiling).
- Follow-up issues to schedule: #326 (recruit/ransom captain UI — engine done, no UI yet),
  #320 (spectate battle playback), #321 (multiplayer Tactical authority), #322 (first-contact
  tuning).

## Blocked on user

- **#307 OAuth** (supervised, left open): now scoped to **Google + Microsoft/Azure AD** (ATC
  pattern), GitHub dropped. Needs Supabase provider provisioning (operator actions) before it
  can be swept.

## Open questions

- Resolve the two-gold-token palette split (#319) — unify onto D-023's `--accent`, or keep
  HUD chrome as a distinct token?
- Native-mobile issues (#98 #100 #156 #159 #160 #161) and epics (#2–#5) are held as
  `needs-human-fix` — confirm they stay out of automated sweeps.
