#!/usr/bin/env python3
"""Normalize generated terrain art, publish runtime files, and prove repeatability."""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


TERRAIN_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[5]
REGISTRY_PATH = TERRAIN_ROOT / "terrain-registry.json"
SOURCE_ROOT = TERRAIN_ROOT / "sources"
PUBLIC_ROOT = REPO_ROOT / "apps" / "web" / "public" / "art" / "world-map-v2" / "terrain"
PROOF_ROOT = TERRAIN_ROOT / "proofs"
RECEIPT_PATH = TERRAIN_ROOT / "terrain-receipt.json"
CAPTURE_RECEIPT_PATH = TERRAIN_ROOT / "runtime-capture-receipt.json"
CAPTURE_ROOT = TERRAIN_ROOT / "runtime-captures"
REFERENCE_PATH = TERRAIN_ROOT.parents[1] / "commercial-visual-v2" / "sources" / "b-gilded-harbor-diorama-map-r1.webp"

IMAGE_LIMIT = 300 * 1024
SOURCE_SIZE = 256
RUNTIME_SIZE = 128
MASK = 0xFFFFFFFF


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def checkerboard_to_rgba(image: Image.Image) -> Image.Image:
    """Remove the generator's pale neutral checker without eroding colored art."""

    rgb = np.asarray(image.convert("RGB"), dtype=np.float32).copy()
    maximum = rgb.max(axis=2)
    minimum = rgb.min(axis=2)
    chroma = maximum - minimum
    luminance = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]

    alpha = np.full(luminance.shape, 255.0, dtype=np.float32)
    neutral = chroma <= 10.0
    alpha[neutral & (luminance >= 236.0)] = 0.0
    feather = neutral & (luminance >= 202.0) & (luminance < 236.0)
    alpha[feather] = (236.0 - luminance[feather]) / 34.0 * 255.0

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


def genuine_alpha(image: Image.Image) -> bool:
    if "A" not in image.getbands():
        return False
    low, high = image.getchannel("A").getextrema()
    return low == 0 and high == 255


def premultiplied_resize(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.float32) / 255.0
    alpha = rgba[:, :, 3]
    premultiplied = rgba[:, :, :3] * alpha[:, :, None]
    resized_channels = [
        np.asarray(
            Image.fromarray(channel.astype(np.float32), "F").resize(size, Image.Resampling.LANCZOS),
            dtype=np.float32,
        )
        for channel in [premultiplied[:, :, 0], premultiplied[:, :, 1], premultiplied[:, :, 2], alpha]
    ]
    resized_alpha = np.clip(resized_channels[3], 0.0, 1.0)
    resized_rgb = np.stack(resized_channels[:3], axis=2)
    visible = resized_alpha > 1 / 255
    resized_rgb[visible] /= resized_alpha[visible, None]
    resized_rgb[~visible] = 0.0
    result = np.dstack((np.clip(resized_rgb, 0.0, 1.0), resized_alpha))
    return Image.fromarray(np.round(result * 255.0).astype(np.uint8), "RGBA")


def normalize_cutout(
    image: Image.Image,
    kind: str,
    *,
    dark_halo_cleanup: bool = False,
) -> Image.Image:
    rgba = image.convert("RGBA") if genuine_alpha(image) else checkerboard_to_rgba(image)
    alpha = rgba.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
    if bbox is None:
        raise ValueError("generated cutout has no visible pixels")
    crop = rgba.crop(bbox)
    target_width = 220 if kind == "port" else 196
    target_height = 164 if kind == "port" else 196
    scale = min(target_width / crop.width, target_height / crop.height)
    resized = premultiplied_resize(
        crop,
        (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
    )
    canvas = Image.new("RGBA", (SOURCE_SIZE, SOURCE_SIZE), (0, 0, 0, 0))
    x = (SOURCE_SIZE - resized.width) // 2
    y = (SOURCE_SIZE - resized.height) // 2
    canvas.alpha_composite(resized, (x, y))
    if dark_halo_cleanup:
        pixels = np.asarray(canvas).copy()
        luminance = (
            0.2126 * pixels[:, :, 0] + 0.7152 * pixels[:, :, 1] + 0.0722 * pixels[:, :, 2]
        )
        core = Image.fromarray(
            np.where((pixels[:, :, 3] >= 8) & (luminance >= 52), 255, 0).astype(np.uint8),
            "L",
        )
        # The failed generated edit left a dark rectangular vignette. Retain
        # darker authored wood only when it connects closely to a brighter dock
        # pixel, then softly feather that semantic foreground mask.
        keep = core.filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.GaussianBlur(1.0))
        pixels[:, :, 3] = np.minimum(pixels[:, :, 3], np.asarray(keep))
        canvas = Image.fromarray(pixels, "RGBA")
    pixels = np.asarray(canvas).copy()
    pixels[pixels[:, :, 3] == 0, :3] = 0
    return Image.fromarray(pixels, "RGBA")


def mirrored_periodic_field(image: Image.Image) -> Image.Image:
    square = ImageOps.fit(image.convert("RGB"), (768, 768), Image.Resampling.LANCZOS)
    patch = square.resize((SOURCE_SIZE // 2, SOURCE_SIZE // 2), Image.Resampling.LANCZOS)
    field = Image.new("RGB", (SOURCE_SIZE, SOURCE_SIZE))
    field.paste(patch, (0, 0))
    field.paste(ImageOps.mirror(patch), (SOURCE_SIZE // 2, 0))
    field.paste(ImageOps.flip(patch), (0, SOURCE_SIZE // 2))
    field.paste(ImageOps.flip(ImageOps.mirror(patch)), (SOURCE_SIZE // 2, SOURCE_SIZE // 2))
    return field


def normalize_color_fields(fields: list[Image.Image]) -> list[Image.Image]:
    arrays = [np.asarray(field, dtype=np.float32) for field in fields]
    means = [array.mean(axis=(0, 1)) for array in arrays]
    deviations = [array.std(axis=(0, 1)) for array in arrays]
    target_mean = np.mean(np.stack(means, axis=0), axis=0)
    target_deviation = np.mean(np.stack(deviations, axis=0), axis=0) * 0.72
    return [
        Image.fromarray(
            np.round(
                (array - mean[None, None, :])
                * (target_deviation / np.maximum(deviation, 1.0))[None, None, :]
                + target_mean[None, None, :]
            )
            .clip(0, 255)
            .astype(np.uint8),
            "RGB",
        )
        for array, mean, deviation in zip(arrays, means, deviations, strict=True)
    ]


def shared_edge_fields(fields: list[Image.Image]) -> list[Image.Image]:
    arrays = [np.asarray(field, dtype=np.float32) for field in normalize_color_fields(fields)]
    shared = np.mean(np.stack(arrays, axis=0), axis=0)
    yy, xx = np.mgrid[0:SOURCE_SIZE, 0:SOURCE_SIZE]
    edge_distance = np.minimum.reduce([xx, yy, SOURCE_SIZE - 1 - xx, SOURCE_SIZE - 1 - yy])
    t = np.clip(edge_distance / 18.0, 0.0, 1.0)
    variant_weight = t * t * (3.0 - 2.0 * t)
    result: list[Image.Image] = []
    for array in arrays:
        blended = array * variant_weight[:, :, None] + shared * (1.0 - variant_weight[:, :, None])
        result.append(Image.fromarray(np.round(blended).clip(0, 255).astype(np.uint8), "RGB"))
    return result


def save_webp(image: Image.Image, path: Path, *, lossless: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if lossless:
        image.save(path, "WEBP", lossless=True, method=6, exact=True)
    else:
        for quality in range(92, 67, -2):
            image.save(path, "WEBP", quality=quality, method=6, exact=True)
            if path.stat().st_size <= IMAGE_LIMIT:
                break
    if path.stat().st_size > IMAGE_LIMIT:
        raise ValueError(f"{path}: {path.stat().st_size} exceeds {IMAGE_LIMIT} bytes")


def stable_hash(x: int, y: int, content: str) -> int:
    value = 0x811C9DC5
    for character in content:
        value ^= ord(character)
        value = (value * 0x01000193) & MASK
    value ^= x & MASK
    value = (value * 0x9E3779B1) & MASK
    value ^= y & MASK
    value = (value * 0x85EBCA6B) & MASK
    value ^= value >> 16
    value = (value * 0x7FEB352D) & MASK
    value ^= value >> 15
    value = (value * 0x846CA68B) & MASK
    value ^= value >> 16
    return value & MASK


def base_variant(x: int, y: int, topology: str) -> int:
    return stable_hash(x, y, f"terrain-base:land:{topology}") % 3


def proof_matrix(topology: str) -> list[list[int]]:
    return [[base_variant(x, y, topology) for x in range(5)] for y in range(5)]


def compose_proofs(public_root: Path, proof_root: Path) -> list[Path]:
    bases = [Image.open(public_root / f"land-base-{letter}.webp").convert("RGB") for letter in "abc"]
    seam_paths = []
    for topology in ("square", "hex"):
        matrix = proof_matrix(topology)
        seam = Image.new("RGB", (5 * RUNTIME_SIZE, 5 * RUNTIME_SIZE))
        for y, row in enumerate(matrix):
            for x, variant in enumerate(row):
                seam.paste(bases[variant], (x * RUNTIME_SIZE, y * RUNTIME_SIZE))
        suffix = "" if topology == "square" else "-hex"
        seam_path = proof_root / f"seam-no-repeat-5x5{suffix}.webp"
        save_webp(seam, seam_path, lossless=False)
        seam_paths.append(seam_path)

    contact = Image.new("RGB", (768, 512), (24, 42, 38))
    draw = ImageDraw.Draw(contact)
    font = ImageFont.load_default(size=15)
    names = [
        "land-base-a",
        "land-base-b",
        "land-base-c",
        "forest-a",
        "forest-b",
        "clearing",
        "highland",
        "port-straight",
        "port-l",
    ]
    for index, name in enumerate(names):
        column = index % 3
        row = index // 3
        x = column * 256
        y = row * 160
        is_port = name.startswith("port")
        background = (32, 92, 112) if is_port else (72, 112, 62)
        draw.rectangle((x + 8, y + 8, x + 248, y + 152), fill=background)
        if name.startswith("land-base"):
            tile = Image.open(public_root / f"{name}.webp").convert("RGB")
            contact.paste(tile.resize((120, 120), Image.Resampling.NEAREST), (x + 68, y + 20))
        else:
            art = Image.open(public_root / f"{name}.webp").convert("RGBA")
            if is_port:
                draw.rectangle((x + 8, y + 8, x + 92, y + 152), fill=(72, 112, 62))
            art.thumbnail((152, 112), Image.Resampling.LANCZOS)
            contact.paste(art, (x + 128 - art.width // 2, y + 78 - art.height // 2), art)
        draw.text((x + 14, y + 132), name, fill=(248, 238, 203), font=font)
    contact_path = proof_root / "terrain-contact-sheet.webp"
    save_webp(contact, contact_path, lossless=False)
    return [*seam_paths, contact_path]


def publish(registry: dict[str, object], source_root: Path, public_root: Path, proof_root: Path) -> dict[str, object]:
    public_paths: list[Path] = []
    for asset in registry["assets"]:
        source_path = TERRAIN_ROOT / asset["source"] if source_root == SOURCE_ROOT else source_root / Path(asset["source"]).name
        source = Image.open(source_path)
        output_path = public_root / Path(asset["runtime"]).name
        if asset["kind"] == "port":
            alpha = source.convert("RGBA").getchannel("A")
            bbox = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
            if bbox is None:
                raise ValueError(f"{source_path}: empty port alpha")
            cropped = source.convert("RGBA").crop(bbox)
            scale = min(172 / cropped.width, 108 / cropped.height)
            resized = premultiplied_resize(
                cropped,
                (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
            )
            runtime = Image.new("RGBA", (192, 128), (0, 0, 0, 0))
            runtime.alpha_composite(resized, ((192 - resized.width) // 2, (128 - resized.height) // 2))
        elif asset["kind"] == "base":
            runtime = source.convert("RGB").resize(
                (RUNTIME_SIZE, RUNTIME_SIZE), Image.Resampling.LANCZOS
            )
        else:
            runtime = premultiplied_resize(source, (RUNTIME_SIZE, RUNTIME_SIZE))
        save_webp(runtime, output_path, lossless=True)
        public_paths.append(output_path)

    proof_paths = compose_proofs(public_root, proof_root)
    return receipt(registry, source_root, public_paths, proof_paths)


def image_record(path: Path, label: str) -> dict[str, object]:
    with Image.open(path) as image:
        return {
            "path": label,
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
            "dimensions": [image.width, image.height],
            "mode": image.mode,
        }


def edge_delta(bases: list[Image.Image]) -> int:
    arrays = [np.asarray(base.convert("RGB"), dtype=np.int16) for base in bases]
    maximum = 0
    for left in arrays:
        for right in arrays:
            maximum = max(maximum, int(np.abs(left[:, -1] - right[:, 0]).max()))
            maximum = max(maximum, int(np.abs(left[-1, :] - right[0, :]).max()))
    return maximum


SPATIAL_OFFSETS = ((1, 0), (0, 1), (1, 1), (-1, 1), (2, 0), (0, 2))


def selection_metrics(matrix: list[list[int]]) -> dict[str, object]:
    rows = ["".join(map(str, row)) for row in matrix]
    columns = ["".join(str(matrix[y][x]) for y in range(5)) for x in range(5)]
    motifs = {
        "".join(str(matrix[y + dy][x + dx]) for dy in range(2) for dx in range(2))
        for y in range(4)
        for x in range(4)
    }
    longest_run = 1
    for line in [*matrix, *[[matrix[y][x] for y in range(5)] for x in range(5)]]:
        run = 1
        for index in range(1, len(line)):
            run = run + 1 if line[index] == line[index - 1] else 1
            longest_run = max(longest_run, run)

    offset_matches = {}
    for dx, dy in SPATIAL_OFFSETS:
        samples = [
            matrix[y][x] == matrix[y + dy][x + dx]
            for y in range(5)
            for x in range(5)
            if 0 <= x + dx < 5 and 0 <= y + dy < 5
        ]
        offset_matches[f"{dx},{dy}"] = round(sum(samples) / len(samples), 6)
    counts = [sum(value == variant for row in matrix for value in row) for variant in range(3)]
    parity_dominance = []
    for parity in range(2):
        values = [
            matrix[y][x]
            for y in range(5)
            for x in range(5)
            if (x + y) % 2 == parity
        ]
        parity_dominance.append(
            round(max(values.count(variant) for variant in range(3)) / len(values), 6)
        )
    return {
        "matrix": matrix,
        "variant_counts": counts,
        "unique_rows": len(set(rows)),
        "unique_columns": len(set(columns)),
        "longest_axis_run": longest_run,
        "parity_dominance": parity_dominance,
        "distinct_2x2_motifs": len(motifs),
        "offset_match_ratios": offset_matches,
    }


def perceptual_metrics(
    bases: list[Image.Image], matrix: list[list[int]]
) -> dict[str, object]:
    base_arrays = [np.asarray(base.convert("RGB"), dtype=np.int16) for base in bases]
    interior = [array[16:-16, 16:-16] for array in base_arrays]
    pairwise_mae = {
        f"{left},{right}": round(
            int(np.abs(interior[left] - interior[right]).sum(dtype=np.int64))
            / interior[left].size,
            6,
        )
        for left in range(len(interior))
        for right in range(left + 1, len(interior))
    }
    composite = np.zeros((5 * RUNTIME_SIZE, 5 * RUNTIME_SIZE, 3), dtype=np.int16)
    for y, row in enumerate(matrix):
        for x, variant in enumerate(row):
            composite[
                y * RUNTIME_SIZE : (y + 1) * RUNTIME_SIZE,
                x * RUNTIME_SIZE : (x + 1) * RUNTIME_SIZE,
            ] = base_arrays[variant]
    offset_mae = {}
    for dx, dy in SPATIAL_OFFSETS:
        left = composite[
            max(0, -dy) * RUNTIME_SIZE : min(5, 5 - dy) * RUNTIME_SIZE,
            max(0, -dx) * RUNTIME_SIZE : min(5, 5 - dx) * RUNTIME_SIZE,
        ]
        right = composite[
            max(0, dy) * RUNTIME_SIZE : min(5, 5 + dy) * RUNTIME_SIZE,
            max(0, dx) * RUNTIME_SIZE : min(5, 5 + dx) * RUNTIME_SIZE,
        ]
        offset_mae[f"{dx},{dy}"] = round(
            int(np.abs(left - right).sum(dtype=np.int64)) / left.size,
            6,
        )
    return {
        "minimum_base_interior_pairwise_mae": min(pairwise_mae.values()),
        "base_interior_pairwise_mae": pairwise_mae,
        "translated_composite_mae": offset_mae,
    }


def receipt(
    registry: dict[str, object],
    source_root: Path,
    public_paths: list[Path],
    proof_paths: list[Path],
) -> dict[str, object]:
    source_records = []
    for asset in registry["assets"]:
        path = TERRAIN_ROOT / asset["source"] if source_root == SOURCE_ROOT else source_root / Path(asset["source"]).name
        source_records.append(image_record(path, asset["source"]))
    public_records = [
        image_record(path, next(asset["runtime"] for asset in registry["assets"] if Path(asset["runtime"]).name == path.name))
        for path in public_paths
    ]
    proof_records = [image_record(path, f"proofs/{path.name}") for path in proof_paths]
    bases = [Image.open(path).convert("RGB") for path in public_paths if path.name.startswith("land-base-")]
    selections = {}
    for topology in ("square", "hex"):
        matrix = proof_matrix(topology)
        selections[topology] = {
            **selection_metrics(matrix),
            **perceptual_metrics(bases, matrix),
        }
    return {
        "schema": 2,
        "issue": 611,
        "source": source_records,
        "runtime": public_records,
        "proofs": proof_records,
        "budget": {
            "per_image_limit_bytes": IMAGE_LIMIT,
            "runtime_total_bytes": sum(path.stat().st_size for path in public_paths),
            "largest_image_bytes": max(path.stat().st_size for path in [*public_paths, *proof_paths]),
        },
        "seam_proof": {
            "selection_salt": "terrain-base:land:{topology}",
            "selections": selections,
            "maximum_cross_variant_edge_channel_delta": edge_delta(bases),
        },
    }


def verify_registry_raw(registry: dict[str, object], raw_root: Path) -> None:
    reference = registry["reference"]
    if sha256(REFERENCE_PATH) != reference["sha256"]:
        raise ValueError("style reference hash drift")
    for item in [*registry["assets"], *registry["rejected"]]:
        path = raw_root / item["raw_file"]
        if not path.is_file():
            raise FileNotFoundError(path)
        with Image.open(path) as image:
            observed = (sha256(path), path.stat().st_size, [image.width, image.height], image.mode)
        expected = (
            item["raw_sha256"],
            item["raw_bytes"],
            item["raw_dimensions"],
            item["raw_mode"],
        )
        if observed != expected:
            raise ValueError(f"{path}: raw provenance drift: {observed} != {expected}")


def ingest(registry: dict[str, object], raw_root: Path) -> None:
    verify_registry_raw(registry, raw_root)
    base_assets = [asset for asset in registry["assets"] if asset["kind"] == "base"]
    fields = [mirrored_periodic_field(Image.open(raw_root / asset["raw_file"])) for asset in base_assets]
    for asset, field in zip(base_assets, shared_edge_fields(fields), strict=True):
        save_webp(field, TERRAIN_ROOT / asset["source"], lossless=True)
    for asset in registry["assets"]:
        if asset["kind"] == "base":
            continue
        normalized = normalize_cutout(
            Image.open(raw_root / asset["raw_file"]),
            asset["kind"],
            dark_halo_cleanup=asset.get("dark_halo_cleanup", False),
        )
        save_webp(normalized, TERRAIN_ROOT / asset["source"], lossless=False)


def validate(receipt_data: dict[str, object], public_root: Path) -> None:
    records = [*receipt_data["source"], *receipt_data["runtime"], *receipt_data["proofs"]]
    if any(record["bytes"] > IMAGE_LIMIT for record in records):
        raise ValueError("terrain image budget exceeded")
    seam = receipt_data["seam_proof"]
    for topology, selection in seam["selections"].items():
        if (
            selection["unique_rows"] != 5
            or selection["unique_columns"] != 5
            or selection["longest_axis_run"] > 3
            or max(selection["parity_dominance"]) > 0.55
            or selection["distinct_2x2_motifs"] < 14
            or max(selection["variant_counts"]) - min(selection["variant_counts"]) > 2
            or max(selection["offset_match_ratios"].values()) > 0.5
            or selection["minimum_base_interior_pairwise_mae"] < 6
            or min(selection["translated_composite_mae"].values()) < 3.5
        ):
            raise ValueError(f"{topology} terrain spatial/perceptual proof failed: {selection}")
    if seam["maximum_cross_variant_edge_channel_delta"] > 1:
        raise ValueError(f"runtime base edges exceed one channel step: {seam}")
    for path in public_root.glob("*.webp"):
        with Image.open(path) as image:
            if path.name.startswith("land-base-"):
                if image.size != (RUNTIME_SIZE, RUNTIME_SIZE):
                    raise ValueError(f"{path}: wrong base dimensions")
            else:
                alpha = image.convert("RGBA").getchannel("A")
                low, high = alpha.getextrema()
                if low != 0 or high != 255:
                    raise ValueError(f"{path}: incomplete alpha range {low, high}")
                if any(alpha.getpixel(corner) != 0 for corner in [(0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1)]):
                    raise ValueError(f"{path}: nontransparent corner")


def compare_tree(expected_root: Path, actual_root: Path) -> None:
    expected = sorted(path.relative_to(expected_root) for path in expected_root.rglob("*") if path.is_file())
    actual = sorted(path.relative_to(actual_root) for path in actual_root.rglob("*") if path.is_file())
    if expected != actual:
        raise ValueError(f"output census drift: {expected} != {actual}")
    for relative in expected:
        if (expected_root / relative).read_bytes() != (actual_root / relative).read_bytes():
            raise ValueError(f"nondeterministic output: {relative}")


def renderer_asset_digest() -> str:
    paths = [
        REPO_ROOT / "apps" / "web" / "src" / "MapCanvas.tsx",
        REPO_ROOT / "apps" / "web" / "src" / "mapPresentation.ts",
        *sorted(PUBLIC_ROOT.glob("*.webp")),
    ]
    lines = "".join(
        f"{sha256(path)}  {path.relative_to(REPO_ROOT)}\n"
        for path in paths
    )
    return hashlib.sha256(lines.encode()).hexdigest()


def validate_runtime_captures() -> None:
    capture_receipt = json.loads(CAPTURE_RECEIPT_PATH.read_text())
    expected_digest = capture_receipt["runtime_binding"]["renderer_and_runtime_asset_digest"]
    observed_digest = renderer_asset_digest()
    if observed_digest != expected_digest:
        raise ValueError(
            "runtime capture renderer/art binding drift: "
            f"expected {expected_digest}, observed {observed_digest}; recapture required"
        )
    captures = capture_receipt["captures"]
    pairs = {(row["viewport"], row["band"]) for row in captures}
    if pairs != {
        (viewport, band)
        for viewport in ["desktop", "phone"]
        for band in ["overview", "tactical", "detail"]
    }:
        raise ValueError(f"runtime capture coverage drift: {pairs}")
    for row in captures:
        path = TERRAIN_ROOT / row["path"]
        if not path.is_file():
            raise FileNotFoundError(path)
        with Image.open(path) as image:
            dimensions = [image.width, image.height]
        observed = (path.stat().st_size, sha256(path), dimensions)
        expected = (row["bytes"], row["sha256"], row["dimensions"])
        if observed != expected:
            raise ValueError(f"{path}: capture drift: {observed} != {expected}")
        if path.stat().st_size > IMAGE_LIMIT:
            raise ValueError(f"{path}: capture exceeds image budget")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ingest-raw", type=Path)
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.ingest_raw and not args.publish and not args.check:
        parser.error("choose --ingest-raw DIR, --publish, or --check")

    registry = json.loads(REGISTRY_PATH.read_text())
    if args.ingest_raw:
        ingest(registry, args.ingest_raw)

    if args.ingest_raw or args.publish:
        receipt_data = publish(registry, SOURCE_ROOT, PUBLIC_ROOT, PROOF_ROOT)
        validate(receipt_data, PUBLIC_ROOT)
        RECEIPT_PATH.write_text(json.dumps(receipt_data, indent=2) + "\n")

    if args.check:
        with tempfile.TemporaryDirectory(prefix="aop-terrain-check-") as temporary:
            root = Path(temporary)
            rebuilt_public = root / "public"
            rebuilt_proofs = root / "proofs"
            receipt_data = publish(registry, SOURCE_ROOT, rebuilt_public, rebuilt_proofs)
            validate(receipt_data, rebuilt_public)
            compare_tree(rebuilt_public, PUBLIC_ROOT)
            compare_tree(rebuilt_proofs, PROOF_ROOT)
            if receipt_data != json.loads(RECEIPT_PATH.read_text()):
                raise ValueError("terrain receipt drift")
        print("terrain runtime/proofs/receipt: verified")
    if args.ingest_raw or args.check:
        validate_runtime_captures()
    print("terrain assets: verified")


if __name__ == "__main__":
    main()
