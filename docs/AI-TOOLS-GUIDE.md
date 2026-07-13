# AI Tools Guide — Age of Plunder

This guide covers setting up and using AI tools for generating game assets, including
building sprites, unit/party art, faction emblems, and UI backgrounds.

## Local image generation: ComfyUI

The art pipeline runs [ComfyUI](https://github.com/comfyanonymous/ComfyUI) locally on
Apple Silicon (MPS/Metal acceleration). ComfyUI replaced AUTOMATIC1111 WebUI in July 2026
(issue #444): A1111's final release (v1.10.1) is unmaintained and its inference code
required pinning a 2-year-old torch to keep MPS from producing corrupted output. ComfyUI
is actively maintained and runs correctly on current torch — verified 2026-07-13 on
torch 2.13 / MPS.

### Layout

- **Install**: `~/aop-ai-tools/ComfyUI` (own venv, python 3.13, current torch)
- **Models**: `~/aop-ai-tools/ComfyUI/models/checkpoints/`; the legacy A1111 model
  directory is also mapped in via `extra_model_paths.yaml`, so
  `DreamShaper_8_pruned.safetensors` (the checkpoint behind the shipped art) resolves
  without duplication.
- **Repo tooling**: `scripts/art/`
  - `comfyui_client.py` — stdlib-only txt2img client for the workflow-graph API
    (library + CLI)
  - `aop_styles.py` — the established prompt families (building sprites, unit/party
    style, faction flavors) behind the shipped art
  - `gen_building_art.py` — building-sprite candidate generator + contact sheet

### Launch

```bash
cd ~/aop-ai-tools/ComfyUI && ./venv/bin/python main.py --listen 127.0.0.1 --port 8188
```

Background it for API use; browser UI at `http://127.0.0.1:8188` if you want the node
graph. Default attention is fastest on this machine — `--use-pytorch-cross-attention`
measured slower (41s vs 34s per 512² image, 2026-07-13).

### Generating

```bash
# One-off:
python3 scripts/art/comfyui_client.py "stylized isometric game asset of ..." \
  --negative "photo, realistic, ..." --seed 1001 --steps 32 --cfg 7.5 \
  --sampler "DPM++ 2M Karras" --batch 4 --out ~/aop-ai-tools/sd-game-art/foo

# Building-sprite candidates (all buildings, or a subset), with contact sheet:
python3 scripts/art/gen_building_art.py tavern shipyard --seeds 4
```

The client accepts A1111-style sampler names (`"Euler a"`, `"DPM++ 2M Karras"`) and maps
them to ComfyUI's split sampler/scheduler fields. As a library:

```python
from comfyui_client import txt2img
from aop_styles import BUILDING_STYLE, BUILDING_NEGATIVE, BUILDINGS
pngs = txt2img(BUILDING_STYLE.format(subject=BUILDINGS["tavern"]),
               negative=BUILDING_NEGATIVE, seed=1001,
               steps=32, cfg=7.5, sampler="dpmpp_2m", scheduler="karras")
```

### API shape (what changed from A1111)

ComfyUI has no flat `txt2img` endpoint. You `POST /prompt` with a JSON **graph**
(checkpoint loader → CLIP text encodes → KSampler → VAE decode → SaveImage), poll
`GET /history/<prompt_id>`, and download results via `GET /view`. `comfyui_client.py`
wraps all of this; don't hand-roll new REST calls.

Two behaviors worth knowing:

- **Execution cache**: resubmitting a byte-identical graph (same seed, prompts, and
  `filename_prefix`) is served from cache and produces **no** output images. The client
  raises a clear error; vary `filename_prefix` (the CLI bakes the seed into it) to force
  a re-save.
- **Checkpoint switching** is just a field in the graph — no separate `/options` call.
  The first generation after a switch pays the model-load cost.

### Checkpoints

- **`DreamShaper_8_pruned.safetensors`** (SD1.5, 2023) — the checkpoint behind all
  shipped AoP art. Established params: 512², steps 28–32, cfg 7–7.5, Euler a or
  DPM++ 2M Karras. Known failure modes and prompt counters live in
  `scripts/art/aop_styles.py` (circular badge framing, baked-in scenery, garbled text).
- **`DreamShaperXL_Turbo_V2-SFW.safetensors`** (SDXL Turbo, same author) — evaluated
  2026-07-13 for #444 as the candidate successor. Params: 1024² native, steps 8,
  cfg 2.0, DPM++ SDE Karras. Adoption is per-art-batch, operator's call — new art
  batches should contact-sheet both until a style winner is declared.

### Performance (M5, 16 GB, 2026-07-13)

- DreamShaper 8, 512², 32 steps: ~34s/image on MPS (measured under normal desktop
  load; treat as an upper bound).
- Timings scale roughly with steps; 20-step drafts land near 20s.
- 16 GB RAM fits SD1.5 and SDXL-class checkpoints. Flux-class models (12 GB+ weights)
  are out of reach here.

### Troubleshooting

- **Corrupted/noise output on MPS**: on the old A1111 stack this meant a torch/webui
  version mismatch. ComfyUI tracks current torch, so first try updating BOTH ComfyUI
  (`git pull` in `~/aop-ai-tools/ComfyUI`) and its venv requirements; a fresh known-good
  pairing beats pinning. CPU fallback for diagnosis: relaunch with `--cpu` (slow, always
  correct) and compare same-seed output.
- **"prompt completed with no images"**: you hit the execution cache (see above).
- **Checkpoint missing from the list**: `GET /object_info/CheckpointLoaderSimple` shows
  what the server sees; new files under `models/checkpoints/` need a server restart or
  a "Refresh" from the UI.
- **Out of memory / swapping**: close heavyweight apps; SDXL at 1024² is the practical
  ceiling on 16 GB.

## Legacy: AUTOMATIC1111 WebUI (deprecated)

`~/aop-ai-tools/stable-diffusion-webui` still exists but is unmaintained upstream and no
longer used. If it must be run: it works on MPS **only** with the torch build it pins
(torch 2.3.1 + torchvision 0.18.1, per `webui-macos-env.sh`) — never
`pip install --upgrade torch` in that venv; newer torch corrupts MPS output there
(root-caused 2026-07-11). Launch flags and history: see git history of this file.

## Other local tools

- **rembg** (background removal): installed in the separate `~/aop-ai-tools/venv`
  (NOT the A1111 venv). Its saliency model ghosts on low-contrast scenic backgrounds;
  chroma-key flood-fill / alpha-hardening fallbacks worked for wall segments.
- **Audio**: MusicGen for music, procedural SFX — see `generate_game_music.py` /
  `generate_game_sfx.py` in `~/aop-ai-tools`.
- No vector tools installed (no inkscape/imagemagick); macOS `qlmanage` covers SVG→PNG,
  PIL lives in the ComfyUI venv.

## Prompting the AoP house styles

Use the constants in `scripts/art/aop_styles.py` — don't re-derive prompts from screen
captures. The two families:

- **Building sprites** (`BUILDING_STYLE` / `BUILDING_NEGATIVE` / `BUILDINGS`): stylized
  isometric, flat cel shading, charcoal roof, cream stone, round grass island base.
- **Unit/captain/party sprites** (`UNIT_STYLE_SUFFIX` / `UNIT_NEGATIVE` /
  `FACTION_FLAVOR`): flat cartoon, thick black outlines, plain white background.

Curation workflow: generate 4+ seeds per subject → contact sheet → operator picks →
rembg cutout pass (for sprites) → `apps/web/public/art/...` with provenance in the art
MANIFEST.

## Future expansion

- **ControlNet** (ComfyUI supports it natively): pose/edge-guided consistency across a
  faction's unit line.
- **Upscaling / inpainting** workflows: built into ComfyUI, unlocked by #444.
- **Text-to-3D / voice**: still TBD.
