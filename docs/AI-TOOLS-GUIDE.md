# AI Tools Guide — Age of Plunder

This guide covers setting up and using AI tools for generating game assets, including concept art, textures, NPC artwork, and UI backgrounds.

## Stable Diffusion WebUI

Stable Diffusion WebUI is a local, web-based interface for generating high-quality images using Stable Diffusion models. It provides fine-grained control over prompts, sampling methods, and model weights.

### System Requirements

- **GPU**: NVIDIA GPU with CUDA support (8GB+ VRAM recommended for quality output)
  - RTX 3060 or better for practical generation times
  - RTX 4070 / 4080+ for batch operations
- **CPU fallback**: Possible but very slow (hours per image); GPU strongly recommended
- **Storage**: ~20GB free space (models + WebUI)
- **RAM**: 16GB+ system RAM

### Installation

1. **Clone the repository**:

   ```bash
   mkdir -p ~/aop-ai-tools
   cd ~/aop-ai-tools
   git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git
   cd stable-diffusion-webui
   ```

2. **Install Python dependencies**:

   ```bash
   pip install -r requirements.txt
   ```

   On macOS with ARM (Apple Silicon), use `requirements-apple.txt` instead.

3. **Download models**:
   The first run will download ~4GB of model data. Common model choices:

   - **Stable Diffusion v1.5** (default): Good baseline, balanced quality/speed
   - **DreamShaper**: Better for fantasy art and character design (recommended)
   - **Realistic Vision**: Best for photorealistic textures

   Place custom models in `models/Stable-diffusion/` directory.

### Running the WebUI

```bash
cd ~/aop-ai-tools/stable-diffusion-webui
python launch.py
```

The UI will start at `http://localhost:7860` and open in your default browser.

### Configuration

Create a `.env` or `config.txt` file to persist launch options:

```bash
# For NVIDIA CUDA:
python launch.py --xformers --lowram  # if <10GB VRAM

# For Apple Silicon (macOS) — MPS/Metal acceleration (~12s per 512² image).
# WORKS ONLY with the torch build this webui pins (torch 2.3.1 + torchvision 0.18.1,
# per webui-macos-env.sh). Newer torch (e.g. 2.12) makes MPS emit corrupted output
# (smeared blobs to pure noise) while CPU stays correct — verified 2026-07-11 by
# same-seed comparison. NEVER `pip install --upgrade torch` in this venv.
python launch.py --api --skip-torch-cuda-test --upcast-sampling --no-half-vae --use-cpu interrogate

# For faster startup and inference:
python launch.py --listen 127.0.0.1 --port 7860
```

### Usage for Game Asset Generation

#### Prompting Strategy

Good prompts are **specific**, **descriptive**, and **reference-aligned**:

```
"pirate faction emblem, fantasy flag design, oil painting style,
 intricate details, warm color palette, artstation, hd, 8k"
```

Common quality modifiers:

- `artstation` / `ArtStation HQ` — improves quality and detail
- `concept art`, `game art` — game-appropriate styles
- `octane render`, `unreal engine` — technical polish
- Negative prompt: `ugly, blurry, low quality, distorted`

#### Workflow: Batch Generation and Curation

1. **Prompt engineering** (iterative):
   - Start with 4–8 variants of a concept
   - Set `Steps: 25–50` (higher = more detail, slower)
   - `Guidance Scale: 7–12` (higher = stronger adherence to prompt)
   - Use seed `Randomize` for exploration, or fix seed for refinement

2. **Batch generation**:
   - In the WebUI, set `Batch count: 4–8` to generate multiple images per prompt
   - Select `DreamShaper` or appropriate model
   - Click `Generate`

3. **Manual curation**:
   - Review outputs in the `outputs/` directory
   - Keep 1–2 best variations per concept
   - Discard obviously flawed or off-brand imagery
   - Export to `assets/generated/` with descriptive names

4. **Post-processing** (optional):
   - Use WebUI's built-in upscaler (`RealESRGAN 4x`) for texture detail
   - Crop or reframe in GIMP/Photoshop if needed
   - Adjust color grading to match game palette

### Use Cases

#### Faction Emblems

```
"pirate skull emblem, red and gold, ornate border,
 fantasy heraldry, symmetrical, detailed, high resolution"
```

Output: 512×512, used as faction banners in UI and world.

#### NPC Portraits

```
"character portrait of a grizzled pirate captain,
 oil painting, fantasy character design, trending on artstation,
 detailed face, golden hour lighting"
```

Output: 768×768, used for unit cards and character screens.

#### Map Tiles and Terrain

```
"isometric fantasy dungeon floor tile, stone texture,
 game asset, seamless pattern, intricate carvings,
 D&D style, high quality"
```

Output: 256×256 for tile-based maps.

#### UI Backgrounds

```
"ornate pirate tavern interior, fantasy art style,
 warm candlelight, game ui background, ornate borders,
 hd, artstation"
```

Output: 1920×1080 for menu/HUD backgrounds.

### Performance Tips

- **Reduce memory usage**: `--lowram` flag or `--precision auto`
- **Faster inference**: Use `--xformers` (requires `pip install xformers`)
- **Batch processing**: Generate 4–8 images at once rather than 1
- **Model optimization**: Switch to `sd-v1.5` (smaller) if DreamShaper is too slow

### Troubleshooting

**CUDA out of memory**:

```bash
python launch.py --lowram --autolaunch
```

**Model not loading**:

- Verify model file exists in `models/Stable-diffusion/`
- Check file integrity: `ls -lh models/Stable-diffusion/`

**Slow generation**:

- Confirm GPU is being used (check WebUI logs)
- Reduce `Steps` to 25–30
- Lower resolution to 512×512 instead of 768×768

**Black/corrupted images**:

- On Apple Silicon, corrupted/noise output almost always means the venv's torch no longer
  matches the version `webui-macos-env.sh` pins. Fix by DOWNGRADING to the pinned build
  (`pip install torch==2.3.1 torchvision==0.18.1`), or fall back to CPU
  (`--use-cpu all --no-half`, ~50s per 512² image — slow but always correct).
  Do NOT `pip install --upgrade torch` — a newer torch is what breaks MPS here, and this
  guide previously recommending the upgrade is how the install got broken (2026-07-11).
- Try a different sampler (e.g., DPM++ 2M Karras)

### Workflow Integration

1. **Design iteration**: Create 10–20 concept variations
2. **Selection**: Team votes on top 5 per asset type
3. **Refinement**: Re-generate winners with fine-tuned prompts
4. **Final export**: Upscale, crop, and save to `assets/generated/`
5. **Version control**: Commit best outputs + prompt history to reference doc

### Resources

- **Official repo**: https://github.com/AUTOMATIC1111/stable-diffusion-webui
- **Model hub**: https://huggingface.co/models (search "stable-diffusion")
- **Prompt inspiration**: https://arthub.ai (community gallery with prompts)
- **Prompt guide**: https://promptomania.com/ (interactive prompt builder)

---

## Future Expansion

Additional AI tools to consider as the project scales:

- **ComfyUI**: Node-based interface for more advanced workflows (upscaling, inpainting)
- **ControlNet**: Precise image control via edge maps and pose estimation
- **Text-to-3D**: TBD (Shap-E, DreamFusion) for 3D model generation
- **Voice generation**: TBD (TTS for NPC dialogue and announcements)
