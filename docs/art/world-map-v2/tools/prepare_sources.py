#!/usr/bin/env python3
"""Verify raw imagegen outputs, recover alpha, and normalize selected 512 px sources."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "asset-registry.json"
DEFAULT_RAW_DIR = ROOT / "sources" / "openai"
SOURCE_SIZE = 512
SUBJECT_SIZE = 384
SOURCE_LIMIT = 300 * 1024


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def checkerboard_to_rgba(image: Image.Image) -> Image.Image:
    """Remove the imagegen UI checkerboard while retaining a soft neutral shadow edge."""

    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    maximum = rgb.max(axis=2)
    minimum = rgb.min(axis=2)
    chroma = maximum - minimum
    luminance = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]

    alpha = np.full(luminance.shape, 255.0, dtype=np.float32)
    neutral = chroma <= 9.0
    alpha[neutral & (luminance >= 235.0)] = 0.0
    feather = neutral & (luminance >= 205.0) & (luminance < 235.0)
    alpha[feather] = (235.0 - luminance[feather]) / 30.0 * 255.0

    # Decontaminate semi-transparent edge/shadow RGB from the pale checkerboard.
    fraction = alpha / 255.0
    soft = (fraction > 0.0) & (fraction < 1.0)
    for channel in range(3):
        values = rgb[:, :, channel]
        values[soft] = np.clip(
            (values[soft] - 249.0 * (1.0 - fraction[soft])) / fraction[soft],
            0.0,
            255.0,
        )

    rgba = np.dstack((rgb.clip(0, 255).astype(np.uint8), alpha.clip(0, 255).astype(np.uint8)))
    return Image.fromarray(rgba, "RGBA")


def has_real_alpha(image: Image.Image) -> bool:
    if image.mode != "RGBA":
        return False
    low, high = image.getchannel("A").getextrema()
    return low == 0 and high == 255


def remove_alpha_islands(image: Image.Image, min_pixels: int = 8) -> Image.Image:
    """Drop isolated extraction specks without eroding rigging or other fine edges."""

    pixels = np.asarray(image.convert("RGBA")).copy()
    visible = pixels[:, :, 3] >= 8
    visited = np.zeros(visible.shape, dtype=bool)
    height, width = visible.shape
    for start_y, start_x in np.argwhere(visible):
        y = int(start_y)
        x = int(start_x)
        if visited[y, x]:
            continue
        component: list[tuple[int, int]] = []
        queue: deque[tuple[int, int]] = deque([(y, x)])
        visited[y, x] = True
        while queue:
            current_y, current_x = queue.popleft()
            component.append((current_y, current_x))
            for neighbor_y in range(max(0, current_y - 1), min(height, current_y + 2)):
                for neighbor_x in range(max(0, current_x - 1), min(width, current_x + 2)):
                    if visible[neighbor_y, neighbor_x] and not visited[neighbor_y, neighbor_x]:
                        visited[neighbor_y, neighbor_x] = True
                        queue.append((neighbor_y, neighbor_x))
        if len(component) < min_pixels:
            rows, columns = zip(*component)
            pixels[rows, columns] = 0
    return Image.fromarray(pixels, "RGBA")


def normalize(image: Image.Image, anchor: str) -> Image.Image:
    rgba = image.convert("RGBA") if has_real_alpha(image) else checkerboard_to_rgba(image)
    alpha = rgba.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
    if bbox is None:
        raise ValueError("source has no visible pixels after alpha extraction")
    crop = rgba.crop(bbox)
    scale = min(SUBJECT_SIZE / crop.width, SUBJECT_SIZE / crop.height)
    resized = crop.resize(
        (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
        Image.Resampling.LANCZOS,
    )
    resized = remove_alpha_islands(resized)
    canvas = Image.new("RGBA", (SOURCE_SIZE, SOURCE_SIZE), (0, 0, 0, 0))
    x = (SOURCE_SIZE - resized.width) // 2
    if anchor == "bottom-center":
        y = SOURCE_SIZE - 64 - resized.height
    else:
        y = (SOURCE_SIZE - resized.height) // 2
    canvas.alpha_composite(resized, (x, y))
    return canvas


def save_with_budget(image: Image.Image, path: Path) -> tuple[int, int]:
    path.parent.mkdir(parents=True, exist_ok=True)
    for quality in range(92, 69, -2):
        image.save(path, "WEBP", quality=quality, method=6, exact=True)
        size = path.stat().st_size
        if size <= SOURCE_LIMIT:
            return quality, size
    raise ValueError(f"{path}: cannot meet {SOURCE_LIMIT} byte source limit")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    args = parser.parse_args()

    registry = json.loads(REGISTRY.read_text())
    rows: list[dict[str, object]] = []
    for asset in registry["assets"]:
        raw_path = args.raw_dir / asset["raw_file"]
        if not raw_path.is_file():
            raise FileNotFoundError(raw_path)
        actual = sha256(raw_path)
        if actual != asset["raw_sha256"]:
            raise ValueError(f"{raw_path}: raw hash {actual} != registry")

        chosen = raw_path
        expected = asset["raw_sha256"]
        preferred_name = asset.get("preferred_raw_file")
        if preferred_name:
            preferred = args.raw_dir / preferred_name
            if not preferred.is_file():
                raise FileNotFoundError(preferred)
            preferred_actual = sha256(preferred)
            if preferred_actual != asset["preferred_raw_sha256"]:
                raise ValueError(f"{preferred}: preferred raw hash mismatch")
            preferred_image = Image.open(preferred)
            if not has_real_alpha(preferred_image):
                raise ValueError(f"{preferred}: registered preferred source lacks real alpha")
            chosen = preferred
            expected = asset["preferred_raw_sha256"]

        image = Image.open(chosen)
        normalized = normalize(image, asset["anchor"])
        output = ROOT / asset["project_source"]
        quality, size = save_with_budget(normalized, output)
        rows.append(
            {
                "id": asset["id"],
                "input": chosen.name,
                "input_sha256": expected,
                "output": asset["project_source"],
                "output_sha256": sha256(output),
                "quality": quality,
                "bytes": size,
            }
        )

    receipt = ROOT / "sources" / "selected" / "normalization-receipt.json"
    receipt.write_text(json.dumps({"schema": 1, "assets": rows}, indent=2) + "\n")
    print(f"prepared {len(rows)} selected 512 px RGBA sources")


if __name__ == "__main__":
    main()
