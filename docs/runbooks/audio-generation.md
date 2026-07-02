# Audio generation (Piper TTS)

Quick-start commands for generating NPC/narrator dialogue locally. Background, quality
bar, and how generated clips get wired into the game live in
`docs/CONTENT-GENERATION.md`. Full local-tooling setup (what's installed, Bark vs Piper
tradeoffs, Stable Diffusion) lives in `~/AI-TOOLS-GUIDE.md` on the operator's machine — it
is not checked into this repo.

This runbook covers the tooling at `~/aop-ai-tools/`, which is **not part of this repo** —
it runs on the operator's machine and writes output directly into
`apps/web/public/audio/generated/`.

## Prerequisites

- Python env already set up at `~/aop-ai-tools/venv/`.
- Voice models already downloaded to `~/aop-ai-tools/voices/*.onnx`. Currently available:
  `en_US-ryan-medium`, `en_US-ryan-high`, `en_GB-alan-medium`, `en_US-libritts-high`.
- If a voice is missing: `python -m piper.download_voices --download-dir ~/aop-ai-tools/voices <voice-name>`.

## Quick start

```bash
# Activate the environment (every session)
source ~/aop-ai-tools/venv/bin/activate

# One custom line
python ~/aop-ai-tools/generate-game-audio-piper.py <character> "<dialogue text>"
# e.g.
python ~/aop-ai-tools/generate-game-audio-piper.py pirate "Avast ye scallywag!"

# Regenerate the full predefined set (merchant/native/settler/battle/narrator lines)
python ~/aop-ai-tools/generate-game-audio-piper.py batch
```

Output always lands in:

```
apps/web/public/audio/generated/<name>.wav
```

## Characters → voices

| Character                        | Voice model           |
| -------------------------------- | --------------------- |
| `pirate`, `merchant`, `narrator` | `en_US-ryan-medium`   |
| `settler`                        | `en_US-ryan-high`     |
| `british`                        | `en_GB-alan-medium`   |
| `native`                         | `en_US-libritts-high` |

## Curate before committing

```bash
# Listen to a generated clip
afplay apps/web/public/audio/generated/<name>.wav
```

Discard and regenerate (don't commit) any clip that fails the quality bar in
`docs/CONTENT-GENERATION.md` — dead air, mispronunciation, or a read that doesn't fit the
character. Piper's prosody is sensitive to punctuation; a trailing "!" or "…" often fixes a
flat read faster than rephrasing.

## Known gaps

- The 10 predefined clips (issue #75) were generated but have not yet been committed to
  `main` (they live on a still-open PR, #78). When committing clips yourself, use
  `git add apps/web/public/audio/...` explicitly (not the whole directory) so generation
  experiments don't ship accidentally.
- No component in `apps/web/src` plays a generated clip yet. See "Example: add a new NPC
  dialogue line" in `docs/CONTENT-GENERATION.md` for the first wiring.
- `generate-game-audio.py` (Bark) is present but slower and has had PyTorch compatibility
  issues on this machine; prefer the Piper script above for day-to-day generation.

## Troubleshooting

**"Unable to find voice: `<name>` (use piper.download_voices)"**
The script passes a full path to `--model`; this error means the `.onnx` file isn't in
`~/aop-ai-tools/voices/`. Download it (see Prerequisites) and retry.

**`piper: command not found`**
Activate the venv first — `source ~/aop-ai-tools/venv/bin/activate`. If still missing:
`pip install piper-tts`.

**Clip plays but sounds wrong on the web build**
Verify the served path matches the on-disk path — anything under `apps/web/public/` is
served from the site root, so `apps/web/public/audio/generated/x.wav` is `/audio/generated/x.wav`.
