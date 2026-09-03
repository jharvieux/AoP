#!/usr/bin/env python3
"""Generate the paired #607 visual-direction sources with the repo ComfyUI client.

Run with the ComfyUI venv so Pillow is available for the project-bound WebP export:

    ~/aop-ai-tools/ComfyUI/venv/bin/python \
      docs/art/commercial-visual-v2/tools/generate_sources.py \
      --direction a --asset map --run-tag r1

The ComfyUI graph writes its normal PNG into ComfyUI's output directory. This script
keeps the project copy as an optimized WebP beside the visual-bible sources. It preserves
the final corrective prompt family and fixed seed/model map. PROMPTS.md preserves the
exact superseded r1/r2 text used by every retained source.
"""

from __future__ import annotations

import argparse
import io
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


REPO = Path(__file__).resolve().parents[4]
ART_SCRIPTS = REPO / "scripts" / "art"
sys.path.insert(0, str(ART_SCRIPTS))

from comfyui_client import txt2img  # noqa: E402


OUT = REPO / "docs" / "art" / "commercial-visual-v2" / "sources"

COMMON_MAP = (
    "(strict orthographic 80-degree top-down illustrated game map:1.45), camera looking "
    "almost straight down, no visible sky and no horizon, wide 16:11 world map for a "
    "commercial pirate strategy game, "
    "an archipelago of two large irregular tropical islands and several small islets, "
    "deep blue-green sea, turquoise shallows, warm sand rims, rocky headlands, forests, "
    "clearings, faint dirt roads and empty natural harbors, coherent geography, strong "
    "large-scale land silhouettes, open navigable water channels, northwest sunlight, "
    "terrain only with no settlements and no vessels"
)

COMMON_EMPTY_CITY = (
    "(completely empty illustrated buildable harbor ground:1.5), (horizonless high-angle "
    "isometric environment:1.35), wide 16:11 vacant Caribbean coastal landscape for a "
    "commercial pirate strategy game, one coherent gently sloping ground plane, natural sea "
    "along only the lower-right edge, warm sand, an inland terrace at top center, branching "
    "dirt roads and subtle empty foundation clearings, sparse palms and wind-bent coastal "
    "vegetation only at the perimeter, northwest sunlight, open central space for modular "
    "buildings; absolutely no houses, huts, towers, walls, docks, boats, flags or people"
)

CITY_LAYOUT = (
    "(horizonless high-angle isometric colonial Caribbean harbor diorama:1.45), camera looking "
    "down at 55 degrees with no visible sky or distant horizon, wide 16:11 18th-century pirate "
    "harbor settlement for a commercial strategy game, Spanish colonial and Georgian British "
    "architecture with whitewashed limestone, timber framing, red clay tile and weathered "
    "shingle gabled roofs, one coherent sloping ground plane and consistent building scale, sea "
    "along the lower-right shoreline, central town hall on the top-center terrace, economy "
    "quarter on the left, recruitment quarter on the right, shipyard touching the lower-right "
    "water, northwest sunlight and soft contact shadows"
)

CITY_STATE = {
    "start": (
        "an intentional early settlement with (only two constructed buildings:1.45): one "
        "dignified town hall and one modest barracks, generous empty prepared plots, connected "
        "dirt roads and natural shoreline, no other buildings and no fortification"
    ),
    "mid": (
        "an intentional growing settlement containing town hall, crooked tavern, shoreline "
        "shipyard, sawmill, trade house, barracks, garrison hall and a timber palisade segment, "
        "with several clearly empty prepared plots reserved for later construction"
    ),
    "full": (
        "a fully built prosperous harbor city with (a massive stone citadel wall, gatehouse and "
        "cannon bastion clearly spanning the foreground:1.5), (a large timber shipyard crane and "
        "drydock clearly touching the lower-right shoreline:1.4), a commanding town hall, crooked "
        "tavern, sawmill and trade-house economy buildings, barracks and grand arsenal recruitment "
        "buildings; each role has a distinct silhouette, readable districts, restrained smoke and "
        "tiny ambient figures"
    ),
}


@dataclass(frozen=True)
class Direction:
    checkpoint: str
    label: str
    style: str
    negative: str
    steps: int
    cfg: float
    sampler: str
    scheduler: str
    latent_width: int
    latent_height: int


DIRECTIONS = {
    "a": Direction(
        checkpoint="DreamShaper_8_pruned.safetensors",
        label="chartmakers-gouache",
        style=(
            "(flat cel-shaded gouache game illustration:1.4), (stylized 2D game art:1.3), "
            "matte pigment on lightly fibrous paper, confident dark-ink contour accents, broad simplified shapes, restrained texture "
            "density, warm sun-faded greens and parchment earth, crisp silhouette hierarchy, "
            "premium polished 2D game illustration, not photorealistic"
        ),
        negative=(
            "photograph, photorealistic, aerial photography, satellite photo, cinematic "
            "landscape, 3d render, glossy plastic, mobile app icon, circular "
            "badge, medallion, isolated object, border, frame, interface, HUD, text, labels, "
            "letters, numbers, logo, watermark, grid, square tiles, repeated pattern, collage, "
            "split screen, cutaway, horizon, sky, extreme perspective, blur, low detail, muddy"
        ),
        steps=32,
        cfg=7.5,
        sampler="dpmpp_2m",
        scheduler="karras",
        latent_width=512,
        latent_height=352,
    ),
    "b": Direction(
        checkpoint="DreamShaperXL_Turbo_V2-SFW.safetensors",
        label="gilded-harbor-diorama",
        style=(
            "luxurious hand-painted strategy-game diorama, layered gouache and oil-brush texture, "
            "dimensional but clearly illustrated, sculpted terrain depth, luminous turquoise water, "
            "warm limestone, weathered timber and tiny brass highlights, selective fine detail, "
            "soft atmospheric depth, premium commercial game key art, not photorealistic"
        ),
        negative=(
            "photograph, photorealistic, generic 3d asset render, glossy plastic, tilt-shift photo, "
            "Asian architecture, Japanese architecture, Chinese architecture, Southeast Asian "
            "architecture, pagoda, temple, curved Asian roof, stilt-house village, thatched resort, "
            "mobile app icon, circular badge, medallion, border, frame, interface, HUD, text, labels, "
            "letters, numbers, logo, watermark, grid, square tiles, repeated pattern, collage, split "
            "screen, cutaway, horizon, sky, extreme perspective, bloom, blur, muddy, oversaturated"
        ),
        steps=8,
        cfg=2.0,
        sampler="dpmpp_sde",
        scheduler="karras",
        latent_width=1024,
        latent_height=704,
    ),
}

SEEDS = {
    "map": 6071001,
    "empty": 6071002,
    "start": 6071003,
    "mid": 6071004,
    "full": 6071005,
}


def prompt_for(direction: Direction, asset: str) -> str:
    if asset == "map":
        subject = COMMON_MAP
    elif asset == "empty":
        subject = COMMON_EMPTY_CITY
    else:
        subject = f"{CITY_LAYOUT}, {CITY_STATE[asset]}"
    composition = (
        "strict top-down orthographic atlas composition, every island edge visible,"
        if asset == "map"
        else "orthographic-feeling high-angle three-quarter composition, full scene visible,"
    )
    return (
        "Use case: stylized-concept. Asset type: final-size game environment styleframe. "
        f"Scene and subject: {subject}. Style and medium: {direction.style}. "
        f"Composition: {composition} readable when "
        "reduced to a 1024 by 704 gameplay frame, calm negative space reserved for interface "
        "overlays at the edges. Constraints: one continuous scene, historically plausible age-of-"
        "sail materials, no baked user interface, no text, no logo, no watermark."
    )


def generate(direction_id: str, asset: str, run_tag: str) -> Path:
    direction = DIRECTIONS[direction_id]
    seed = SEEDS[asset]
    prompt = prompt_for(direction, asset)
    (png,) = txt2img(
        prompt,
        negative=direction.negative,
        checkpoint=direction.checkpoint,
        seed=seed,
        steps=direction.steps,
        cfg=direction.cfg,
        sampler=direction.sampler,
        scheduler=direction.scheduler,
        width=direction.latent_width,
        height=direction.latent_height,
        filename_prefix=f"aop-607-{direction_id}-{asset}-{run_tag}",
    )
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{direction_id}-{direction.label}-{asset}-{run_tag}.webp"
    image = Image.open(io.BytesIO(png)).convert("RGB")
    if image.size != (1024, 704):
        image = image.resize((1024, 704), Image.Resampling.LANCZOS)
    image.save(out, "WEBP", quality=91, method=6)
    print(out)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--direction", choices=[*DIRECTIONS, "all"], default="all")
    parser.add_argument("--asset", choices=[*SEEDS, "city", "all"], default="all")
    parser.add_argument("--run-tag", default="r1")
    args = parser.parse_args()
    directions = list(DIRECTIONS) if args.direction == "all" else [args.direction]
    if args.asset == "all":
        assets = list(SEEDS)
    elif args.asset == "city":
        assets = ["empty", "start", "mid", "full"]
    else:
        assets = [args.asset]
    for direction_id in directions:
        for asset in assets:
            generate(direction_id, asset, args.run_tag)


if __name__ == "__main__":
    main()
