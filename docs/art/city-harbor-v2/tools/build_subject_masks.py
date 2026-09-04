#!/usr/bin/env python3
"""Build reviewed subject masks for the issue #608 checkpoint sources.

Run with the repository's separate rembg authoring environment:

    NUMBA_DISABLE_JIT=1 ~/aop-ai-tools/venv/bin/python3 \
      docs/art/city-harbor-v2/tools/build_subject_masks.py

The source generator painted its transparency checker into RGB. A semantic
subject mask is therefore required; color flood-fill alone cannot clear
checker regions enclosed by roofs, spars, railings, and rigging.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import new_session, remove
from scipy import ndimage


PACKAGE = Path(__file__).resolve().parents[1]
SOURCE_NAMES = {
    "townhall": "townhall-source-r1.webp",
    "tavern": "tavern-source-r1.webp",
    "tradehouse": "tradehouse-source-r1.webp",
    "barracks": "barracks-source-r1.webp",
    "stonewall": "stonewall-source-r1.webp",
    "shipyard": "shipyard-source-r2.webp",
}


def reviewed_mask(raw: Image.Image) -> Image.Image:
    """Harden rembg saliency into one reviewed subject with a soft edge.

    The 128 core preserves intentional openings instead of filling holes. Only
    the largest connected foreground component is retained, which rejects
    detached floor-matte fragments and isolated saliency specks. A sub-pixel
    blur restores anti-aliasing without reintroducing a broad translucent mat.
    """

    prediction = np.asarray(raw.convert("L"), dtype=np.uint8)
    core = prediction >= 128
    labels, count = ndimage.label(core)
    if count == 0:
        raise ValueError("rembg returned an empty subject mask")
    sizes = np.bincount(labels.ravel())
    subject_label = int(np.argmax(sizes[1:]) + 1)
    subject = labels == subject_label

    alpha = ndimage.gaussian_filter(subject.astype(np.float32), sigma=0.65)
    alpha = np.clip((alpha - 0.04) / 0.92, 0, 1)
    return Image.fromarray((alpha * 255).astype(np.uint8), "L")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=PACKAGE / "masks")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    session = new_session("isnet-general-use")
    for asset, filename in SOURCE_NAMES.items():
        source = Image.open(PACKAGE / "sources" / filename).convert("RGB")
        prediction = remove(source, session=session, only_mask=True).convert("L")
        mask = reviewed_mask(prediction)
        path = args.output / f"{asset}-mask.png"
        mask.save(path, "PNG", optimize=True)
        print(f"{asset}: {path} {mask.size}")


if __name__ == "__main__":
    main()
