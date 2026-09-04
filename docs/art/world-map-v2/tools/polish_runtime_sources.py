#!/usr/bin/env python3
"""Build matte-cleaned 512 px runtime masters and stress-review proofs.

The checkpoint sources came from a rendered checkerboard extraction.  This pass is
deliberately conservative: it removes only low-chroma matte pixels that touch the
outside silhouette, plus named contact-shadow regions for the assets that need
them.  It never invents or expands visibility outside the original alpha mask.
"""

from __future__ import annotations

import argparse
import filecmp
import hashlib
import json
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageColor, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[2]
REGISTRY = ROOT / "asset-registry.json"
ADDITIONS = ROOT / "runtime-additions.json"
RUNTIME_SOURCE_DIR = ROOT / "sources" / "runtime"
PROOF_DIR = ROOT / "proofs" / "matte-stress"
RECEIPT = RUNTIME_SOURCE_DIR / "polish-receipt.json"
SOURCE_SIZE = 512
RUNTIME_SIZE = 256
SOURCE_LIMIT = 300 * 1024
RUNTIME_TARGET = 128 * 1024
RUNTIME_CEILING = 300 * 1024
PROOF_LIMIT = 300 * 1024

FACTION_COLORS = {
    "british": "#a6192e",
    "dutch": "#e07b1a",
    "french": "#2255a4",
    "pirates": "#1a1a1a",
    "spanish": "#c9a227",
}

FULL_BACKGROUND_MODES = ("representative", "dark", "magenta", "cyan")

BODY_FONT = "/System/Library/Fonts/Supplemental/Trebuchet MS.ttf"
BODY_BOLD = "/System/Library/Fonts/Supplemental/Trebuchet MS Bold.ttf"


@dataclass(frozen=True)
class MatteSpec:
    boundary_depth: int = 12
    chroma_limit: int = 24
    luminance_floor: int = 142
    contact_polygon: tuple[tuple[float, float], ...] | None = None
    contact_depth: int = 34
    contact_chroma: int = 30
    contact_luminance: int = 116


# Polygons are intentionally confined to the ground/contact side of each
# silhouette. They let us remove extracted checkerboard shadows without treating
# pale sails, uniforms, masonry, or roofs elsewhere as background.
SPECS: dict[str, MatteSpec] = {
    "ship:british:sloop": MatteSpec(boundary_depth=18, luminance_floor=128),
    "ship:pirates:galleon": MatteSpec(boundary_depth=15, luminance_floor=132),
    "party:british": MatteSpec(
        boundary_depth=16,
        luminance_floor=128,
        contact_polygon=((0.25, 0.48), (0.78, 0.48), (0.79, 0.85), (0.20, 0.85)),
    ),
    "party:spanish": MatteSpec(
        boundary_depth=16,
        luminance_floor=126,
        contact_polygon=((0.18, 0.48), (0.82, 0.48), (0.78, 0.84), (0.20, 0.84)),
    ),
    "landSite:mine": MatteSpec(
        boundary_depth=16,
        luminance_floor=126,
        contact_polygon=((0.13, 0.51), (0.88, 0.51), (0.87, 0.85), (0.15, 0.85)),
        contact_depth=42,
    ),
    "encounter:hermit": MatteSpec(
        # Keep the cool-gray shingle edge: only the genuinely near-white outer
        # fringe is eligible outside the explicit ground-contact region.
        boundary_depth=7,
        chroma_limit=12,
        luminance_floor=178,
        contact_polygon=((0.18, 0.68), (0.82, 0.68), (0.82, 0.83), (0.18, 0.83)),
        contact_depth=22,
        contact_chroma=20,
        contact_luminance=132,
    ),
    "encounter:nativeVillage": MatteSpec(
        boundary_depth=16,
        luminance_floor=124,
        contact_polygon=((0.08, 0.52), (0.92, 0.52), (0.91, 0.80), (0.08, 0.80)),
        contact_depth=40,
    ),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def erode(mask: np.ndarray) -> np.ndarray:
    padded = np.pad(mask, 1, mode="constant", constant_values=False)
    height, width = mask.shape
    result = np.ones_like(mask)
    for y in range(3):
        for x in range(3):
            result &= padded[y : y + height, x : x + width]
    return result


def boundary_depth(mask: np.ndarray, maximum: int) -> np.ndarray:
    """Return Chebyshev distance from transparent space, capped at maximum + 1."""

    depth = np.zeros(mask.shape, dtype=np.uint8)
    remaining = mask.copy()
    for value in range(1, maximum + 1):
        inner = erode(remaining)
        depth[remaining & ~inner] = value
        remaining = inner
        if not remaining.any():
            break
    depth[remaining] = maximum + 1
    return depth


def normalized_polygon(points: tuple[tuple[float, float], ...]) -> np.ndarray:
    image = Image.new("1", (SOURCE_SIZE, SOURCE_SIZE), 0)
    draw = ImageDraw.Draw(image)
    draw.polygon([(round(x * SOURCE_SIZE), round(y * SOURCE_SIZE)) for x, y in points], fill=1)
    return np.asarray(image, dtype=bool)


def polished_image(source: Image.Image, asset_id: str) -> tuple[Image.Image, dict[str, int | str]]:
    rgba = np.asarray(source.convert("RGBA")).copy()
    alpha = rgba[:, :, 3]
    visible = alpha >= 8
    if source.size != (SOURCE_SIZE, SOURCE_SIZE):
        raise ValueError(f"{asset_id}: source is {source.size}, expected 512x512")

    spec = SPECS.get(asset_id, MatteSpec())
    maximum_depth = max(spec.boundary_depth, spec.contact_depth if spec.contact_polygon else 0)
    depth = boundary_depth(visible, maximum_depth)
    rgb = rgba[:, :, :3].astype(np.int16)
    maximum = rgb.max(axis=2)
    minimum = rgb.min(axis=2)
    chroma = maximum - minimum
    luminance = (
        rgb[:, :, 0].astype(np.float32) * 0.2126
        + rgb[:, :, 1].astype(np.float32) * 0.7152
        + rgb[:, :, 2].astype(np.float32) * 0.0722
    )

    boundary_matte = (
        visible
        & (depth <= spec.boundary_depth)
        & (chroma <= spec.chroma_limit)
        & (luminance >= spec.luminance_floor)
    )
    contact_matte = np.zeros_like(visible)
    if spec.contact_polygon:
        contact_matte = (
            visible
            & normalized_polygon(spec.contact_polygon)
            & (depth <= spec.contact_depth)
            & (chroma <= spec.contact_chroma)
            & (luminance >= spec.contact_luminance)
        )

    matte = boundary_matte | contact_matte
    # Remove fully rather than feathering extracted background.  The remaining
    # authored edge already has antialiasing, and transparent RGB is zeroed so a
    # later scale cannot reintroduce a pale fringe.
    rgba[matte] = 0
    rgba[rgba[:, :, 3] == 0, :3] = 0

    result = Image.fromarray(rgba, "RGBA")
    return result, {
        "policy": "low-chroma-exterior-plus-semantic-contact-v1",
        "boundary_pixels_removed": int(boundary_matte.sum()),
        "contact_pixels_removed": int((contact_matte & ~boundary_matte).sum()),
        "visible_pixels_before": int(visible.sum()),
        "visible_pixels_after": int((rgba[:, :, 3] >= 8).sum()),
    }


def save_webp(image: Image.Image, path: Path, limit: int, start: int = 92) -> tuple[int, int]:
    path.parent.mkdir(parents=True, exist_ok=True)
    for quality in range(start, 67, -2):
        image.save(path, "WEBP", quality=quality, method=6, exact=True)
        if path.stat().st_size <= limit:
            return quality, path.stat().st_size
    raise ValueError(f"{path}: cannot meet {limit} byte budget")


def premultiplied_resize(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Downsample without leaking RGB from transparent pixels into the edge."""

    return image.convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")


def normalize_generated_alpha(image: Image.Image, asset_id: str) -> Image.Image:
    rgba = image.convert("RGBA")
    low, high = rgba.getchannel("A").getextrema()
    if low != 0 or high != 255:
        raise ValueError(f"{asset_id}: runtime generation lacks full transparent/opaque alpha")
    bbox = rgba.getchannel("A").point(lambda value: 255 if value >= 8 else 0).getbbox()
    if bbox is None:
        raise ValueError(f"{asset_id}: runtime generation has no visible subject")
    crop = rgba.crop(bbox)
    scale = min(384 / crop.width, 384 / crop.height)
    resized = premultiplied_resize(
        crop,
        (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
    )
    canvas = Image.new("RGBA", (SOURCE_SIZE, SOURCE_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(
        resized,
        ((SOURCE_SIZE - resized.width) // 2, (SOURCE_SIZE - resized.height) // 2),
    )
    return canvas


def tiled(path: Path, size: tuple[int, int]) -> Image.Image:
    tile = Image.open(path).convert("RGB")
    result = Image.new("RGB", size)
    for y in range(0, size[1], tile.height):
        for x in range(0, size[0], tile.width):
            result.paste(tile, (x, y))
    return result


def stress_background(size: tuple[int, int], context: str) -> Image.Image:
    width, height = size
    tile_name = "deep.png" if context == "water" else "land.png"
    representative = tiled(REPO / "apps" / "web" / "public" / "art" / "tiles" / tile_name, size)
    image = representative.convert("RGBA")
    draw = ImageDraw.Draw(image)
    draw.rectangle((width // 2, 0, width, height // 2), fill="#08121f" if context == "water" else "#102719")
    draw.rectangle((0, height // 2, width // 2, height), fill="#c21e79")
    draw.rectangle((width // 2, height // 2, width, height), fill="#00a7b5")
    draw.line((width // 2, 0, width // 2, height), fill="#f2d27a", width=1)
    draw.line((0, height // 2, width, height // 2), fill="#f2d27a", width=1)
    return image


def full_background(size: tuple[int, int], context: str, mode: str) -> Image.Image:
    if mode == "representative":
        tile_name = "deep.png" if context == "water" else "land.png"
        return tiled(REPO / "apps" / "web" / "public" / "art" / "tiles" / tile_name, size).convert(
            "RGBA"
        )
    colors = {
        "dark": "#08121f" if context == "water" else "#102719",
        "magenta": "#c21e79",
        "cyan": "#00a7b5",
    }
    if mode not in colors:
        raise ValueError(f"unknown stress background {mode}")
    return Image.new("RGBA", size, colors[mode])


def compose_full_footprint_512(
    assets: list[dict[str, object]], images: dict[str, Image.Image], proof_dir: Path
) -> list[Path]:
    """Repeat each 512 px source over four complete fields, never partial quadrants."""

    paths: list[Path] = []
    for asset in assets:
        sheet = Image.new("RGB", (SOURCE_SIZE * 2, SOURCE_SIZE * 2), "#130f0c")
        for index, mode in enumerate(FULL_BACKGROUND_MODES):
            x = (index % 2) * SOURCE_SIZE
            y = (index // 2) * SOURCE_SIZE
            field = full_background((SOURCE_SIZE, SOURCE_SIZE), str(asset["context"]), mode)
            field.alpha_composite(images[str(asset["id"])])
            sheet.paste(field.convert("RGB"), (x, y))
        path = proof_dir / f"matte-full-footprint-512-{asset['prompt_key']}.webp"
        save_webp(sheet, path, PROOF_LIMIT, start=78)
        paths.append(path)
    return paths


def compose_full_footprint_96(
    assets: list[dict[str, object]], images: dict[str, Image.Image], proof_dir: Path
) -> Path:
    """Show every runtime token at exact 96 px over each complete stress field."""

    label_width = 174
    cell = 96
    gap = 8
    header_height = 32
    row_height = cell + gap
    width = label_width + len(FULL_BACKGROUND_MODES) * (cell + gap)
    height = header_height + len(assets) * row_height
    sheet = Image.new("RGB", (width, height), "#130f0c")
    draw = ImageDraw.Draw(sheet)
    for index, mode in enumerate(FULL_BACKGROUND_MODES):
        label = "terrain" if mode == "representative" else mode
        draw.text(
            (label_width + index * (cell + gap), 8),
            label,
            font=ImageFont.truetype(BODY_FONT, 12),
            fill="#f3e5c2",
        )
    for row, asset in enumerate(assets):
        y = header_height + row * row_height
        draw.text(
            (8, y + 40),
            str(asset["id"])[:23],
            font=ImageFont.truetype(BODY_FONT, 12),
            fill="#f3e5c2",
        )
        token = premultiplied_resize(images[str(asset["id"])], (cell, cell))
        for column, mode in enumerate(FULL_BACKGROUND_MODES):
            x = label_width + column * (cell + gap)
            field = full_background((cell, cell), str(asset["context"]), mode)
            field.alpha_composite(token)
            sheet.paste(field.convert("RGB"), (x, y))
    path = proof_dir / "matte-full-footprint-96-all.webp"
    save_webp(sheet, path, PROOF_LIMIT, start=82)
    return path


def compose_512_sheets(
    assets: list[dict[str, object]], images: dict[str, Image.Image], proof_dir: Path
) -> list[Path]:
    paths: list[Path] = []
    for page, start in enumerate(range(0, len(assets), 7), start=1):
        page_assets = assets[start : start + 7]
        cell_width, cell_height = 560, 558
        rows = (len(page_assets) + 1) // 2
        sheet = Image.new("RGB", (cell_width * 2, cell_height * rows), "#130f0c")
        draw = ImageDraw.Draw(sheet)
        for index, asset in enumerate(page_assets):
            column, row = index % 2, index // 2
            x, y = column * cell_width, row * cell_height
            background = stress_background((512, 512), str(asset["context"]))
            background.alpha_composite(images[str(asset["id"])])
            sheet.paste(background.convert("RGB"), (x + 24, y + 28))
            draw.text((x + 28, y + 4), str(asset["id"]), font=ImageFont.truetype(BODY_BOLD, 18), fill="#f3e5c2")
            draw.rectangle((x + 24, y + 28, x + 535, y + 539), outline="#c8962c", width=2)
        path = proof_dir / f"matte-stress-512-page-{page}.webp"
        save_webp(sheet, path, PROOF_LIMIT, start=76)
        paths.append(path)
    return paths


def compose_96_sheet(
    assets: list[dict[str, object]], images: dict[str, Image.Image], proof_dir: Path
) -> Path:
    cell_width, cell_height = 156, 142
    rows = (len(assets) + 6) // 7
    sheet = Image.new("RGB", (cell_width * 7, cell_height * rows), "#130f0c")
    draw = ImageDraw.Draw(sheet)
    for index, asset in enumerate(assets):
        column, row = index % 7, index // 7
        x, y = column * cell_width, row * cell_height
        background = stress_background((128, 112), str(asset["context"]))
        token = premultiplied_resize(images[str(asset["id"])], (96, 96))
        background.alpha_composite(token, (16, 8))
        sheet.paste(background.convert("RGB"), (x + 14, y + 22))
        label = str(asset["id"]).split(":")[-1]
        draw.text((x + 16, y + 3), label[:17], font=ImageFont.truetype(BODY_FONT, 13), fill="#f3e5c2")
        draw.rectangle((x + 14, y + 22, x + 141, y + 133), outline="#c8962c", width=1)
    path = proof_dir / "matte-stress-96-all.webp"
    save_webp(sheet, path, PROOF_LIMIT, start=82)
    return path


def grayscale_rgba(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    result = ImageOps.grayscale(image.convert("RGB")).convert("RGBA")
    result.putalpha(alpha)
    return result


def compose_24_marker_sheet(images: dict[str, Image.Image], proof_dir: Path) -> Path:
    factions = ["british", "dutch", "french", "pirates", "spanish"]
    cell_width, row_height = 170, 122
    sheet = Image.new("RGB", (cell_width * len(factions), 310), "#130f0c")
    draw = ImageDraw.Draw(sheet)
    draw.text(
        (18, 10),
        "Runtime faction marker · exact 24 px ring/token · authored flag geometry",
        font=ImageFont.truetype(BODY_BOLD, 17),
        fill="#f3e5c2",
    )
    for column, faction in enumerate(factions):
        x = column * cell_width
        draw.text(
            (x + 14, 40),
            faction.title(),
            font=ImageFont.truetype(BODY_BOLD, 15),
            fill="#f3e5c2",
        )
        flag = Image.open(
            REPO / "apps" / "web" / "public" / "art" / "factions" / faction / "flag.png"
        ).convert("RGBA")
        token = premultiplied_resize(images[f"city:{faction}"], (24, 24))
        for row, gray in enumerate((False, True)):
            top = 64 + row * row_height
            patch = stress_background((142, 94), "land")
            center = (71, 47)
            display_token = grayscale_rgba(token) if gray else token
            patch.alpha_composite(display_token, (center[0] - 12, center[1] - 12))
            ring_color = ImageColor.getrgb(FACTION_COLORS[faction])
            if gray:
                value = round(
                    ring_color[0] * 0.2126 + ring_color[1] * 0.7152 + ring_color[2] * 0.0722
                )
                ring_color = (value, value, value)
            patch_draw = ImageDraw.Draw(patch)
            patch_draw.ellipse(
                (center[0] - 12, center[1] - 12, center[0] + 12, center[1] + 12),
                outline="#14100d",
                width=3,
            )
            patch_draw.ellipse(
                (center[0] - 12, center[1] - 12, center[0] + 12, center[1] + 12),
                outline=ring_color,
                width=1,
            )
            display_flag = grayscale_rgba(flag) if gray else flag
            display_flag = premultiplied_resize(display_flag, (11, 11))
            patch.alpha_composite(display_flag, (center[0] + 4, center[1] - 15))
            sheet.paste(patch.convert("RGB"), (x + 14, top))
            draw.text(
                (x + 20, top + 70),
                "grayscale" if gray else "color",
                font=ImageFont.truetype(BODY_FONT, 13),
                fill="#f3e5c2",
            )
    draw.text(
        (18, 292),
        "British cross/diagonals and Spanish barbed saltire remain different without hue.",
        font=ImageFont.truetype(BODY_FONT, 13),
        fill="#cbb17a",
    )
    path = proof_dir / "faction-marker-24-color-grayscale.webp"
    save_webp(sheet, path, PROOF_LIMIT, start=86)
    return path


def build(runtime_source_dir: Path, proof_dir: Path, receipt_path: Path) -> None:
    registry = json.loads(REGISTRY.read_text())
    additions = json.loads(ADDITIONS.read_text())
    assets = [*registry["assets"], *additions["assets"]]
    images: dict[str, Image.Image] = {}
    rows: list[dict[str, object]] = []
    for asset in assets:
        asset_id = str(asset["id"])
        if "project_source" in asset:
            source_path = ROOT / str(asset["project_source"])
            source_image = Image.open(source_path)
        else:
            source_path = ROOT / str(asset["raw_file"])
            if sha256(source_path) != asset["raw_sha256"]:
                raise ValueError(f"{asset_id}: generated runtime source hash drifted")
            source_image = normalize_generated_alpha(Image.open(source_path), asset_id)
        image, metrics = polished_image(source_image, asset_id)
        source_name = f"{asset['prompt_key']}-512.webp"
        source_output = runtime_source_dir / source_name
        source_quality, source_bytes = save_webp(image, source_output, SOURCE_LIMIT)
        runtime_name = f"{asset['prompt_key']}-256.webp"
        runtime_output = runtime_source_dir / runtime_name
        runtime_quality, runtime_bytes = save_webp(
            premultiplied_resize(image, (RUNTIME_SIZE, RUNTIME_SIZE)),
            runtime_output,
            RUNTIME_TARGET,
            start=90,
        )
        if runtime_bytes > RUNTIME_CEILING:
            raise ValueError(f"{runtime_output}: exceeds hard ceiling")
        images[asset_id] = image
        rows.append(
            {
                "id": asset_id,
                "input": str(source_path.relative_to(ROOT)),
                "input_sha256": sha256(source_path),
                "output_512": f"sources/runtime/{source_name}",
                "output_512_sha256": sha256(source_output),
                "output_512_quality": source_quality,
                "output_512_bytes": source_bytes,
                "output_256": f"sources/runtime/{runtime_name}",
                "output_256_sha256": sha256(runtime_output),
                "output_256_quality": runtime_quality,
                "output_256_bytes": runtime_bytes,
                **metrics,
            }
        )

    proof_paths = compose_512_sheets(assets, images, proof_dir)
    proof_paths.append(compose_96_sheet(assets, images, proof_dir))
    proof_paths.extend(compose_full_footprint_512(assets, images, proof_dir))
    proof_paths.append(compose_full_footprint_96(assets, images, proof_dir))
    proof_paths.append(compose_24_marker_sheet(images, proof_dir))
    receipt = {
        "schema": 1,
        "transform": "deterministic semantic matte cleanup; no generative edit",
        "assets": rows,
        "proofs": [
            {
                "path": f"proofs/matte-stress/{path.name}",
                "sha256": sha256(path),
                "bytes": path.stat().st_size,
            }
            for path in proof_paths
        ],
    }
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"polished {len(rows)} sources; wrote {len(proof_paths)} stress proofs")


def compare_directory(expected: Path, actual: Path) -> None:
    expected_files = sorted(path.relative_to(expected) for path in expected.rglob("*") if path.is_file())
    actual_files = sorted(path.relative_to(actual) for path in actual.rglob("*") if path.is_file())
    if expected_files != actual_files:
        raise ValueError(
            f"deterministic runtime file set differs: expected={expected_files}, actual={actual_files}"
        )
    mismatches = [
        str(path)
        for path in expected_files
        if not filecmp.cmp(expected / path, actual / path, shallow=False)
    ]
    if mismatches:
        raise ValueError("deterministic runtime bytes differ: " + ", ".join(mismatches))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.check:
        build(RUNTIME_SOURCE_DIR, PROOF_DIR, RECEIPT)
        return
    with tempfile.TemporaryDirectory(prefix="aop-map-runtime-") as temporary:
        root = Path(temporary)
        actual_sources = root / "sources" / "runtime"
        actual_proofs = root / "proofs" / "matte-stress"
        build(actual_sources, actual_proofs, actual_sources / "polish-receipt.json")
        compare_directory(RUNTIME_SOURCE_DIR, actual_sources)
        compare_directory(PROOF_DIR, actual_proofs)
    print("PASS: matte cleanup, runtime candidates, and stress proofs are byte-deterministic")


if __name__ == "__main__":
    main()
