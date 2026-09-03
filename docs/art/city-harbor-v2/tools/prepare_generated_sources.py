#!/usr/bin/env python3
"""Normalize built-in image-generator exports for the #608 proof package.

The service exports lossless PNGs. This authoring utility retains a visually
equivalent, metadata-free WebP source and prints both hashes. Original service
hashes remain the provenance identity recorded in PROVENANCE.json.
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

from PIL import Image


NAMES = (
    "empty-harbor-source-r1",
    "townhall-source-r1",
    "tavern-source-r1",
    "tradehouse-source-r1",
    "barracks-source-r1",
    "stonewall-source-r1",
    "shipyard-source-r1",
)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    for stem in NAMES:
        source = args.input / f"{stem}.png"
        target = args.output / f"{stem}.webp"
        image = Image.open(source).convert("RGB")
        quality = 80 if stem == "empty-harbor-source-r1" else 88
        image.save(target, "WEBP", quality=quality, method=6, exact=True)
        print(f"{stem}: png={digest(source)} webp={digest(target)} bytes={target.stat().st_size}")


if __name__ == "__main__":
    main()
