#!/usr/bin/env python3
"""Validate issue #608 production art, compositing, provenance, and budgets."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


PACKAGE = Path(__file__).resolve().parents[1]
REPOSITORY = PACKAGE.parents[2]
RUNTIME_CITY = REPOSITORY / "apps" / "web" / "public" / "art" / "city"
LAYOUT_PATH = REPOSITORY / "apps" / "web" / "src" / "citySceneLayout.json"
LAYOUT = json.loads(LAYOUT_PATH.read_text())
MAX_BYTES = 300 * 1024
MAX_FULLY_BUILT_BYTES = 3 * 1024 * 1024
ASSETS = (
    "townhall",
    "tavern",
    "tradehouse",
    "sawmill",
    "ironmine",
    "distillery",
    "barracks",
    "garrisonHall",
    "fortressArmory",
    "grandArsenal",
    "palisade",
    "stonewall",
    "citadel",
    "citadel-tower",
    "shipyard",
)
OPEN_STRUCTURE_ASSETS = {
    "tavern",
    "sawmill",
    "ironmine",
    "barracks",
    "garrisonHall",
    "fortressArmory",
    "grandArsenal",
    "palisade",
    "stonewall",
    "citadel",
    "citadel-tower",
    "shipyard",
}
MASK_FILES = {asset: f"{asset}-mask.png" for asset in ASSETS}
MASK_FILES["townhall"] = "townhall-detail-mask.png"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compositor():
    path = PACKAGE / "tools" / "compose_checkpoint.py"
    spec = importlib.util.spec_from_file_location("city_production_compositor", path)
    if spec is None or spec.loader is None:
        raise AssertionError("unable to load compositor")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise AssertionError(f"unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def validate_path_hashes(value: object) -> int:
    """Recompute every retained path/hash pair in a provenance structure."""

    count = 0
    if isinstance(value, dict):
        path_value = value.get("path") or value.get("retained_path")
        hash_value = value.get("sha256") or value.get("retained_sha256")
        if isinstance(path_value, str) and isinstance(hash_value, str):
            path = PACKAGE / path_value
            assert path.is_file(), f"missing provenance path: {path_value}"
            assert sha256(path) == hash_value, f"provenance hash drift: {path_value}"
            count += 1
        for child in value.values():
            count += validate_path_hashes(child)
    elif isinstance(value, list):
        for child in value:
            count += validate_path_hashes(child)
    return count


def validate_provenance() -> None:
    checkpoint = json.loads((PACKAGE / "PROVENANCE.json").read_text())
    production = json.loads((PACKAGE / "PRODUCTION-PROVENANCE.json").read_text())
    high_resolution = json.loads((PACKAGE / "HIGH-RES-PROVENANCE.json").read_text())
    assert (
        checkpoint["service"]
        == production["service"]
        == high_resolution["service"]
        == "OpenAI built-in image generator"
    )
    assert {item["prompt_id"] for item in checkpoint["generation"]} == {
        f"P{number}" for number in range(1, 10)
    }
    assert len(production["generation"]) == 11
    assert {item["prompt_id"] for item in production["generation"]} == {
        f"P{number}" for number in range(10, 21)
    }
    assert [item["call_id"] for item in high_resolution["accepted_calls"]] == [
        f"H{number:02}" for number in range(1, 27)
    ]
    assert high_resolution["rejected_calls"]["count"] == 6
    assert "no rejected output is project-bound" in high_resolution["rejected_calls"][
        "disposition"
    ].lower()
    assert validate_path_hashes(checkpoint) >= 15
    assert validate_path_hashes(production) >= 15
    assert validate_path_hashes(high_resolution) >= 80
    checkpoint_prompt_text = (PACKAGE / "PROMPTS.md").read_text()
    production_prompt_text = (PACKAGE / "PRODUCTION-PROMPTS.md").read_text()
    for number in range(1, 10):
        assert f"## P{number} " in checkpoint_prompt_text, f"missing exact P{number} prompt"
    for number in range(10, 21):
        assert f"## P{number} " in production_prompt_text, f"missing exact P{number} prompt"
    for item in high_resolution["accepted_calls"]:
        assert item["prompt"].startswith("Use case: precise-object-edit")
        assert len(item["input_references"]) == 2
    assert "did not expose" in production_prompt_text

    output_hashes = json.loads((PACKAGE / "PRODUCTION-OUTPUT-HASHES.json").read_text())
    assert len(output_hashes["files"]) >= 100
    for item in output_hashes["files"]:
        path = REPOSITORY / item["path"]
        assert path.is_file(), f"missing production output: {item['path']}"
        assert item["bytes"] <= MAX_BYTES, f"retained output exceeds 300 KiB: {item['path']}"
        assert sha256(path) == item["sha256"], f"production output hash drift: {item['path']}"


def validate_masks_and_cutouts() -> None:
    cutouts = {path.stem: path for path in (PACKAGE / "cutouts").glob("*.webp")}
    assert set(cutouts) == set(ASSETS), f"cutout inventory drift: {sorted(cutouts)}"
    assert sha256(PACKAGE / "masks/barracks-mask-p5.png") == (
        "b97251d90247e7a5a2a5daaebe3fe59eb93053e85f4c4c6aa7a0412b27053fed"
    )
    assert sha256(PACKAGE / "masks/barracks-mask.png") == (
        "96ecb6924484c9c1aa27222c5274d1cb10bc48b970b904359056081126d095b6"
    )

    for asset in ASSETS:
        mask_path = PACKAGE / "masks" / MASK_FILES[asset]
        with Image.open(mask_path) as mask_image:
            assert mask_image.format == "PNG" and mask_image.mode == "L"
            mask = np.asarray(mask_image)
        with Image.open(cutouts[asset]) as cutout_image:
            assert cutout_image.format == "WEBP" and cutout_image.mode == "RGBA"
            assert cutout_image.width <= 1600 and cutout_image.height <= 1600
            assert max(cutout_image.size) >= 900
            alpha = np.asarray(cutout_image.getchannel("A"))
        assert cutouts[asset].stat().st_size <= MAX_BYTES
        assert int(alpha.min()) == 0 and int(alpha.max()) == 255
        assert ((alpha > 0) & (alpha < 255)).any(), f"{asset}: missing soft edge"

        for values, label in ((mask, "mask"), (alpha, "cutout")):
            for threshold in (8, 128):
                _, count = ndimage.label(values > threshold)
                assert count == 1, f"{asset} {label}: alpha>{threshold} has {count} islands"
            opaque = values >= 240
            soft = (values > 8) & ~opaque
            distance = ndimage.distance_transform_edt(~opaque)
            assert float(distance[soft].max()) <= 5, f"{asset} {label}: broad soft matte"

        border = np.concatenate(
            (alpha[:8, :].ravel(), alpha[-8:, :].ravel(), alpha[:, :8].ravel(), alpha[:, -8:].ravel())
        )
        assert int(border.max()) <= 8, f"{asset}: alpha enters eight-pixel safety band"

        if asset in OPEN_STRUCTURE_ASSETS:
            foreground = alpha >= 128
            holes = ndimage.binary_fill_holes(foreground) & ~foreground
            _, hole_count = ndimage.label(holes)
            assert hole_count >= 1 and int(holes.sum()) >= 32, (
                f"{asset}: no transparent enclosed opening; painted checker/matte may remain"
            )


def validate_runtime() -> None:
    runtime_names = {**{asset: asset for asset in ASSETS}, "stonewall": "stoneWall"}
    backdrop_files = [RUNTIME_CITY / Path(tile["src"]).name for tile in LAYOUT["backdrop"]["tiles"]]
    constructed_files = [
        RUNTIME_CITY / f"{runtime_names[asset]}.webp" for asset in ASSETS
    ]
    runtime_files = backdrop_files + constructed_files
    assert len(runtime_files) == 39
    for path in runtime_files:
        assert path.is_file(), f"missing runtime asset {path.name}"
        assert path.stat().st_size <= MAX_BYTES, f"runtime asset too large: {path.name}"
        with Image.open(path) as image:
            assert image.format == "WEBP"
            if path in backdrop_files:
                assert image.mode == "RGB" and image.size == (1024, 1056)
            else:
                assert image.mode == "RGBA" and max(image.size) >= 900

    flag_root = REPOSITORY / "apps" / "web" / "public" / "art" / "factions"
    largest_flag = max((path.stat().st_size for path in flag_root.glob("*/flag.png")), default=0)
    total = sum(path.stat().st_size for path in runtime_files) + largest_flag
    assert total <= MAX_FULLY_BUILT_BYTES, f"fully built first-open payload {total} exceeds 3 MiB"

    content = (REPOSITORY / "packages" / "content" / "src" / "buildings.ts").read_text()
    scene = (REPOSITORY / "apps" / "web" / "src" / "CityScene.tsx").read_text()
    for path in constructed_files:
        assert f"/art/city/{path.name}" in content
    for path in backdrop_files:
        assert f'"src": "/art/city/{path.name}"' in LAYOUT_PATH.read_text()
    assert "citySceneLayout.backdrop.tiles" in scene
    assert "spriteCandidates" in scene and "FallbackImage" in scene
    assert "city-scene__backdrop-cell" in scene and "data-backdrop-tile" in scene
    assert "BACKDROP_TILE_BLEED = 2" in scene
    assert "contact-shadows" not in scene


def validate_layout_resolution_flags_and_seams() -> None:
    resolution_module = load_module(
        "city_resolution_census", PACKAGE / "tools/build_resolution_census.py"
    )
    retained = json.loads((PACKAGE / "RESOLUTION-CENSUS.json").read_text())
    assert retained == resolution_module.build(), "resolution census is stale"
    assert retained["worst_backdrop"]["ratio"] >= 1
    for asset, values in retained["worst_assets"].items():
        assert values["ratio"] >= 1, f"{asset} undersampled: {values}"

    hall = LAYOUT["slots"][LAYOUT["flag"]["slotId"]]
    scene_width, scene_height = 1024, 704
    hall_x = scene_width * hall["left"] / 100
    hall_y = scene_height * hall["top"] / 100
    hall_width = scene_width * hall["width"] / 100
    hall_height = scene_height * hall["height"] / 100
    flag = LAYOUT["flag"]
    cloth_x = hall_x + hall_width * flag["poleLeftPercent"] / 100 + flag["clothLeftPx"]
    cloth_y = hall_y + hall_height * flag["poleTopPercent"] / 100
    cloth_size = hall_width * flag["poleWidthPercent"] / 100 * flag["clothWidthPercent"] / 100
    assert 0 <= cloth_x < cloth_x + cloth_size <= scene_width
    assert 0 <= cloth_y < cloth_y + cloth_size <= scene_height
    for faction in ("pirates", "british", "spanish", "french", "dutch"):
        image = Image.open(
            REPOSITORY / f"apps/web/public/art/factions/{faction}/flag.png"
        ).convert("RGBA")
        assert image.getchannel("A").getbbox() is not None

    module = compositor()
    bleed = module.BACKDROP_TILE_BLEED
    tile_size = module.BACKDROP_TILE_SIZE
    tiles = {}
    for row in range(1, 5):
        for column in range(1, 7):
            image = Image.open(
                RUNTIME_CITY / f"backdrop-c{column}r{row}.webp"
            ).convert("RGB")
            image = image.crop(
                (bleed, bleed, image.width - bleed, image.height - bleed)
            ).resize(tile_size, Image.Resampling.BILINEAR)
            tiles[column, row] = np.asarray(image, dtype=np.int16)

    seam_metrics = []

    def record(label: str, seam: np.ndarray, inside_a: np.ndarray, inside_b: np.ndarray) -> None:
        seam_mean = float(seam.mean())
        adjacent_mean = float((inside_a.mean() + inside_b.mean()) / 2)
        seam_p99 = float(np.quantile(seam, 0.99))
        adjacent_p99 = float(
            (np.quantile(inside_a, 0.99) + np.quantile(inside_b, 0.99)) / 2
        )
        seam_metrics.append(
            {
                "label": label,
                "mean": seam_mean,
                "adjacent_mean": adjacent_mean,
                "mean_ratio": seam_mean / max(adjacent_mean, 0.01),
                "p99": seam_p99,
                "adjacent_p99": adjacent_p99,
                "p99_ratio": seam_p99 / max(adjacent_p99, 0.01),
            }
        )

    for row in range(1, 5):
        for column in range(1, 6):
            left = tiles[column, row]
            right = tiles[column + 1, row]
            record(
                f"vertical c{column}/c{column + 1} r{row}",
                np.abs(left[:, -1] - right[:, 0]),
                np.abs(left[:, -1] - left[:, -2]),
                np.abs(right[:, 1] - right[:, 0]),
            )
    for row in range(1, 4):
        for column in range(1, 7):
            upper = tiles[column, row]
            lower = tiles[column, row + 1]
            record(
                f"horizontal c{column} r{row}/r{row + 1}",
                np.abs(upper[-1] - lower[0]),
                np.abs(upper[-1] - upper[-2]),
                np.abs(lower[1] - lower[0]),
            )

    assert len(seam_metrics) == 38
    failures = [
        metric
        for metric in seam_metrics
        if (
            metric["mean"] > 4.5
            and metric["mean_ratio"] > 2
        )
        or (
            metric["p99"] > 20
            and metric["p99_ratio"] > 2
        )
    ]
    assert not failures, f"visible backdrop joins versus adjacent gradients: {failures}"


def validate_proofs_and_shipyard() -> None:
    proof_files = sorted((PACKAGE / "proofs").rglob("*.webp"))
    assert len(proof_files) >= 33
    for path in proof_files:
        assert path.stat().st_size <= MAX_BYTES, f"proof exceeds 300 KiB: {path.name}"
        with Image.open(path) as image:
            assert image.format == "WEBP"
    assert len(list((PACKAGE / "proofs" / "factions").glob("*-full-1024x704.webp"))) == 5
    assert len(list((PACKAGE / "proofs" / "stress").glob("*-magenta-1024.webp"))) == 15

    module = compositor()
    slot = next(slot for slot in module.SLOTS if slot.asset == "shipyard")
    cutout = Image.open(PACKAGE / "cutouts" / "shipyard.webp").convert("RGBA")
    rendered, x, y = module.contained(cutout, module.slot_box(slot, module.MASTER_SIZE))
    placed = np.zeros((module.MASTER_SIZE[1], module.MASTER_SIZE[0]), dtype=np.uint8)
    placed[y : y + rendered.height, x : x + rendered.width] = np.asarray(rendered.getchannel("A"))
    backdrop = np.asarray(Image.open(PACKAGE / "layers" / "empty-backdrop-2048x1408.webp").convert("RGB"))

    shore = placed[1060:1240, 1900:2040] >= 128
    assert int(shore.sum()) >= 1800, "shipyard gangway misses the immutable shoreline region"
    shore_rgb = backdrop[1060:1240, 1900:2040][shore].mean(axis=0)
    assert shore_rgb[0] > shore_rgb[2] * 0.85, f"gangway is not over dry shore: {shore_rgb}"

    water = placed[1220:1400, 1640:1920] >= 128
    assert int(water.sum()) >= 16000, "shipyard waterward structure is missing"
    water_rgb = backdrop[1220:1400, 1640:1920][water].mean(axis=0)
    assert water_rgb[2] > water_rgb[0] + 35, f"drydock is not over luminous water: {water_rgb}"


def validate_determinism() -> None:
    command = [sys.executable, str(PACKAGE / "tools" / "compose_checkpoint.py"), "--check"]
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise AssertionError(f"deterministic recomposition failed:\n{result.stdout}\n{result.stderr}")
    assert "PASS" in result.stdout


def main() -> None:
    validate_provenance()
    validate_masks_and_cutouts()
    validate_runtime()
    validate_layout_resolution_flags_and_seams()
    validate_proofs_and_shipyard()
    validate_determinism()
    print("PASS: #608 production art, alpha topology, shore placement, provenance, budgets, and deterministic proofs")


if __name__ == "__main__":
    main()
