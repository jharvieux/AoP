# Handoff: Age of Plunder — Title Screen & Main Menu

## Overview
Redesign of the game's launch experience: a graphical title/splash screen that plays for a few seconds, then transitions into a restyled main menu. Replaces the previous plain navy screen with a flat list of 10 bordered buttons.

## About the Design Files
The bundled file (`Age of Plunder Start Screen.dc.html`) is a **design reference built in HTML** — a clickable prototype showing intended look, motion, and behavior. It is not production code to copy line-for-line. The task is to recreate this design inside the game's actual codebase/engine (whatever UI framework the game uses — e.g. Unity UGUI, Unreal UMG, a web/Electron front end, etc.), following that codebase's existing patterns, asset pipeline, and component structure. If no UI framework/pattern exists yet for this game, pick the one that best fits the target platform.

Note: the HTML file contains **three explored visual directions** (side by side, labeled 1a/1b/1c) from the design process. **The chosen direction is 1a — "Weathered Parchment & Rope"**, the first/leftmost frame. Ignore 1b (Dark Stormy Sea) and 1c (Blood & Gold); they're kept in the file only as a record of alternatives considered.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and animation timing below are final — implement pixel-for-pixel where the target platform allows. The skull-and-crossbones emblem is built from layered CSS shapes in the prototype; recreate it as a real illustrated/vector asset (or sprite) in the target engine rather than reconstructing it from divs — see "Assets" below.

## Screens / Views

### 1. Title Screen (splash)
**Purpose:** First thing the player sees on launch. Establishes tone, shows brief loading/intro beat, then auto-advances to the main menu after ~3 seconds (no input required).

**Layout:** Full-bleed background, content centered as a vertical stack with generous gap (~22px at this reference scale), everything centered horizontally and vertically in the viewport.

**Stack order (top to bottom):**
1. Skull-and-crossbones emblem, ~120×118px at reference scale (scale up proportionally for real resolution)
2. Game title "AGE OF PLUNDER" — display font, letter-spacing 4px, engraved/embossed look (see Typography)
3. Subtitle "A Pirate Strategy Game" — small caps, letter-spacing 3px
4. Loading bar: 320px wide track, 8px tall, rounded (4px radius), 1px border in accent gold, fill animates left-to-right over **2.8s** with an ease-in curve, fill color = accent gold, subtle glow (box-shadow) matching accent
5. Loading caption "Charting the seas…" — small uppercase label under the bar

**Timing:** After the screen mounts, wait **3.2 seconds**, then transition to the Main Menu (see Interactions).

### 2. Main Menu
**Purpose:** Primary navigation hub. Player picks a game mode or adjusts settings.

**Layout:** Vertical stack, ~44px horizontal padding, ~30px top / 26px bottom padding, 18px gap between sections, transition-in with a fade + slight scale-up (see Interactions).

**Sections (top to bottom):**
1. **Header** — small centered game title, "AGE OF PLUNDER", ~30px, no subtitle here.
2. **Primary actions** (always visible, most prominent):
   - **New Game** — full-width, 52px tall, solid accent-gold fill, dark text, bold, 18px, largest/most prominent button on the screen, subtle drop shadow in accent color.
   - **Quick Match** and **Map Editor** — side by side (2-column row), 44px tall, transparent fill, 2px accent-gold border, accent-toned text, medium weight, 15px.
3. **"More Options" toggle** — small centered text button, uppercase, letter-spaced, secondary text color, with a chevron (▾) that rotates 180° when expanded. Toggles the secondary group below open/closed.
4. **Secondary actions** (collapsed by default, shown when "More Options" is expanded) — 2-column grid, 8px gap, 38px tall buttons, outlined in accent color at low opacity, secondary text color, 13px:
   - Theme Packs
   - Account
   - Watch Replay
   - Spectate
   - Grant Spectator Access
   - Match Browser
   - Leaderboard (spans both columns — full width)
5. **Divider** — 1px hairline, accent color at ~30% opacity.
6. **Audio settings** (always visible, bottom of menu):
   - "Mute audio" checkbox with label, 13px.
   - Three labeled sliders in a 2-column grid (label ~100px fixed, slider fills remainder): Dialogue (default 70/100), Music (default 55/100), SFX (default 65/100). Slider thumb/track tinted with the accent color.
7. A small "↻ Replay intro" text link, top-right corner of the menu panel, low-opacity secondary text — dev/demo affordance to replay the intro; **optional in production**, include only if there's a real "watch intro again" use case (e.g. accessibility or a title-screen re-trigger from a settings menu).

## Interactions & Behavior
- **Auto-advance:** Title screen shows for 3.2s, then the Main Menu replaces it. In the prototype this is an unconditional timer; in production this should also resolve as soon as any required asset loading finishes (whichever is later — don't cut the loading bar short, and don't force the player to wait if load finishes late).
- **Transition:** Menu fades and scales in — opacity 0→1, scale 0.97→1, translateY 8px→0, over ~700ms ease-out. Title screen itself fades/scales in on mount too — opacity 0→1, scale 1.04→1, over ~900ms ease-out.
- **Loading bar fill:** width 0%→100% over 2.8s, ease-in.
- **More Options toggle:** click expands/collapses the secondary button grid; chevron rotates 180°; label swaps between "More Options" and "Fewer Options". No animation on the grid itself needed beyond an optional height/opacity transition if the target framework supports it easily.
- **Buttons:** standard press/hover feedback per platform convention (slight scale-down or brightness change on press). No specific hover spec was defined in the prototype beyond default cursor affordance — use the target platform's standard button feedback.
- No responsive/breakpoint behavior specified — this is a single fixed-aspect game screen (build at the game's native UI resolution).

## State Management
- `hasSeenIntro` / screen state: `"title" | "menu"` — starts at `"title"`, moves to `"menu"` after the timer (and/or asset load) resolves.
- `moreOptionsOpen: boolean` — default `false`.
- Audio: `muted: boolean`, `dialogueVolume: number (0–100)`, `musicVolume: number (0–100)`, `sfxVolume: number (0–100)` — wire to the game's existing audio system/settings persistence.

## Design Tokens (Weathered Parchment & Rope — chosen direction)
**Colors**
- Background gradient: `radial-gradient(120% 100% at 50% -10%, #cbb17a 0%, #a9855a 40%, #7d5f3d 75%, #5c4429 100%)` — a warm tan-to-brown vignette, lighter at top-center.
- Paper grain overlay: fine diagonal repeating lines, `rgba(60,40,20,0.06)`, 2px line / 4px gap, at 115°.
- Panel background (secondary-button fill): `rgba(48,32,17,0.85)`
- Accent (gold): `#c8962c` — primary buttons, borders, loading bar fill, glows
- Accent 2 (rust/red-brown): `#7a2e1a` — used for the title's embossed drop-shadow only
- Text on accent (e.g. New Game button label): `#2c1810`
- Primary text (title, on-dark surfaces): `#f3e6c8`
- Secondary text (subtitles, labels): `#e7d4ac`
- Title color (on the parchment bg itself): `#2c1810`
- Accent glow: `rgba(200,150,44,0.35)`
- Skull "bone" color: `#ece0c0` (ivory)
- Skull socket/shadow color: `#1a1006` (near-black brown)

**Typography**
- Display/title font: **Pirata One** (Google Fonts) — used only for "AGE OF PLUNDER" at 58px (title screen) / 30px (menu header), letter-spacing 2–4px, with a 2px solid drop-shadow in Accent 2 plus a soft colored glow for an embossed/engraved look.
- Body/UI font: **Cabin** (Google Fonts), weights 400/500/600/700 — everything else (buttons, labels, captions).

**Spacing scale (reference resolution, scale proportionally):** 6, 8, 10, 14, 18, 22, 26, 30, 44px.

**Border radius:** 8–10px on buttons, 18px on the outer screen/panel frame, 4px on the loading-bar track.

**Shadows/glows:** buttons and the loading bar use a soft colored glow matching the accent (`box-shadow: 0 6px 18px rgba(200,150,44,0.35)` on New Game; `0 0 10px` same color on the loading fill). Outer frame: `0 20px 60px rgba(0,0,0,0.5)`.

## Assets
- **Skull and crossbones emblem** — in the prototype this is built from ~14 layered CSS div shapes (rounded cranium, jaw with a "teeth" gradient strip, two rotated eye sockets, triangular nasal cavity, two crossed bone shapes each with rounded knuckle ends) to approximate a bone-colored (ivory) skull with dark sockets. **Recommend commissioning or sourcing a real illustrated/vector skull-and-crossbones asset** (matching the ivory-on-parchment palette above) rather than reconstructing this shape-by-shape — the CSS version is a rough stand-in for the intended composition and proportions only (roughly square emblem, crossbones behind/below the skull, skull occupying the upper ~2/3).
- **Parchment/paper texture** — currently a CSS gradient + faint repeating diagonal lines. A real scanned or painted parchment/paper texture would read better than the flat gradient; treat the current version as a placeholder for a proper texture asset.
- No other imagery is used — everything else (buttons, sliders, layout) is flat color/typography, no additional icons.
- Fonts: Pirata One and Cabin, both free/open on Google Fonts — no licensing concerns.

## Files
- `Age of Plunder Start Screen.dc.html` — the interactive HTML prototype. Open directly in a browser. Contains all three explored directions (1a/1b/1c side by side); **implement 1a only**, per this README.
