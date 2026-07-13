#!/usr/bin/env python3
"""Generate AoP building sprite candidates via local ComfyUI (issue #444).

ComfyUI port of the A1111-era gen_city_art.py session script: same prompts
(aop_styles.py), same params, one contact sheet per run for curation.

Usage: python3 gen_building_art.py [building ...] [--seeds N] [--checkpoint C] [--out DIR]
  With no building args, generates all buildings in aop_styles.BUILDINGS.
  Needs a running ComfyUI server (see comfyui_client.py header) and PIL for
  the contact sheet (skipped with a warning if PIL is missing).
"""

import argparse
import io
import random
import sys
from pathlib import Path

from aop_styles import BUILDING_NEGATIVE, BUILDING_STYLE, BUILDINGS
from comfyui_client import DEFAULT_CHECKPOINT, txt2img


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("buildings", nargs="*", metavar="building")
    ap.add_argument("--seeds", type=int, default=4, help="candidates per building")
    ap.add_argument("--checkpoint", default=DEFAULT_CHECKPOINT)
    ap.add_argument("--out", type=Path, default=Path.home() / "aop-ai-tools" / "sd-game-art" / "cities" / "candidates")
    args = ap.parse_args()

    unknown = [b for b in args.buildings if b not in BUILDINGS]
    if unknown:
        ap.error(f"unknown building(s) {unknown}; valid: {', '.join(BUILDINGS)}")
    names = args.buildings or list(BUILDINGS)
    args.out.mkdir(parents=True, exist_ok=True)
    seeds = [random.randrange(2**31) for _ in range(args.seeds)]

    tiles, labels = [], []
    for name in names:
        for seed in seeds:
            (png,) = txt2img(
                BUILDING_STYLE.format(subject=BUILDINGS[name]),
                negative=BUILDING_NEGATIVE,
                checkpoint=args.checkpoint,
                seed=seed,
                steps=32,
                cfg=7.5,
                sampler="dpmpp_2m",
                scheduler="karras",
                filename_prefix=f"{name}-seed{seed}",
            )
            path = args.out / f"{name}-seed{seed}.png"
            path.write_bytes(png)
            tiles.append(png)
            labels.append(f"{name} seed {seed}")
            print(path, flush=True)

    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("PIL not available in this python — skipping contact sheet", file=sys.stderr)
        return

    cell, pad, cap = 256, 8, 22
    cols, rows = len(seeds), len(names)
    sheet = Image.new(
        "RGB",
        (cols * (cell + pad) + pad, rows * (cell + cap + pad) + pad),
        "white",
    )
    draw = ImageDraw.Draw(sheet)
    for i, (png, label) in enumerate(zip(tiles, labels)):
        img = Image.open(io.BytesIO(png)).resize((cell, cell))
        x = pad + (i % cols) * (cell + pad)
        y = pad + (i // cols) * (cell + cap + pad)
        sheet.paste(img, (x, y))
        draw.text((x + 2, y + cell + 4), label, fill="black")
    sheet_path = args.out / "contact-sheet.png"
    sheet.save(sheet_path)
    print(sheet_path)


if __name__ == "__main__":
    main()
