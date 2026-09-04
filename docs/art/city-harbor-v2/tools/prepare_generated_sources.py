#!/usr/bin/env python3
"""Normalize built-in image-generator exports for the #608 proof package.

The service exports lossless PNGs. This authoring utility retains a visually
equivalent, metadata-free WebP source and prints both hashes. Original service
hashes remain the provenance identity recorded in the package's provenance files.
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

from PIL import Image


NAMES = (
    "empty-harbor-source-r1",
    "empty-harbor-source-r2",
    "empty-harbor-source-r3",
    "townhall-source-r1",
    "tavern-source-r1",
    "tradehouse-source-r1",
    "barracks-source-r1",
    "barracks-source-r2",
    "sawmill-source-r1",
    "ironmine-source-r1",
    "distillery-source-r1",
    "garrisonhall-source-r1",
    "fortress-armory-source-r1",
    "grand-arsenal-source-r1",
    "palisade-source-r1",
    "stonewall-source-r1",
    "citadel-source-r1",
    "citadel-tower-source-r1",
    "shipyard-source-r1",
    "shipyard-source-r2",
)

QUALITY = {
    "empty-harbor-source-r1": 80,
    "empty-harbor-source-r2": 76,
    "empty-harbor-source-r3": 72,
    "shipyard-source-r2": 86,
}


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
        if not source.exists():
            continue
        image = Image.open(source).convert("RGB")
        quality = QUALITY.get(stem, 82)
        image.save(target, "WEBP", quality=quality, method=6, exact=True)
        print(f"{stem}: png={digest(source)} webp={digest(target)} bytes={target.stat().st_size}")


if __name__ == "__main__":
    main()
