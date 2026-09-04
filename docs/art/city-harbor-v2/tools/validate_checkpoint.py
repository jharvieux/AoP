#!/usr/bin/env python3
"""Technical acceptance checks for issue #608 checkpoint one."""

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
MAX_BYTES = 300 * 1024

EXPECTED = {
    "sources/empty-harbor-source-r1.webp": ("RGB", (1567, 1004)),
    "sources/empty-harbor-source-r2.webp": ("RGB", (1567, 1004)),
    "sources/townhall-source-r1.webp": ("RGB", (1254, 1254)),
    "sources/tavern-source-r1.webp": ("RGB", (1254, 1254)),
    "sources/tradehouse-source-r1.webp": ("RGB", (1254, 1254)),
    "sources/barracks-source-r1.webp": ("RGB", (1254, 1254)),
    "sources/stonewall-source-r1.webp": ("RGB", (1254, 1254)),
    "sources/shipyard-source-r1.webp": ("RGB", (1254, 1254)),
    "sources/shipyard-source-r2.webp": ("RGB", (1254, 1254)),
    "cutouts/townhall.webp": ("RGBA", (900, 840)),
    "cutouts/tavern.webp": ("RGBA", (900, 858)),
    "cutouts/tradehouse.webp": ("RGBA", (900, 682)),
    "cutouts/barracks.webp": ("RGBA", (900, 828)),
    "cutouts/stonewall.webp": ("RGBA", (900, 499)),
    "cutouts/shipyard.webp": ("RGBA", (900, 747)),
    "layers/contact-shadows.webp": ("RGBA", (2048, 1408)),
    "layers/empty-backdrop-2048x1408.webp": ("RGB", (2048, 1408)),
    "proofs/checkpoint-contact-sheet-1600x1120.webp": ("RGB", (1600, 1120)),
    "proofs/desktop-1440x900.webp": ("RGB", (1440, 900)),
    "proofs/empty-runtime-1024x704.webp": ("RGB", (1024, 704)),
    "proofs/layer-separation-1600x1000.webp": ("RGB", (1600, 1000)),
    "proofs/max-zoom-1024x704.webp": ("RGB", (1024, 704)),
    "proofs/phone-375x812.webp": ("RGB", (375, 812)),
    "proofs/scene-runtime-1024x704.webp": ("RGB", (1024, 704)),
    "proofs/stress/townhall-magenta-1024.webp": ("RGB", (1024, 1024)),
    "proofs/stress/tavern-magenta-1024.webp": ("RGB", (1024, 1024)),
    "proofs/stress/tradehouse-magenta-1024.webp": ("RGB", (1024, 1024)),
    "proofs/stress/barracks-magenta-1024.webp": ("RGB", (1024, 1024)),
    "proofs/stress/stonewall-magenta-1024.webp": ("RGB", (1024, 1024)),
    "proofs/stress/shipyard-magenta-1024.webp": ("RGB", (1024, 1024)),
}

MASK_HOLE_WITNESSES = {
    "townhall": ((1141, 583),),
    "tavern": ((208, 557), (192, 854)),
    "tradehouse": ((1079, 526), (110, 727)),
    "barracks": ((200, 332), (371, 328)),
    "shipyard": ((798, 301), (803, 220), (1021, 404), (1124, 327)),
}

EXPECTED_SLOTS = {
    "townhall": (37, 6, 26, 36, "P0"),
    "shipyard": (80, 75, 19, 24, "P1"),
    "tavern": (4, 24, 14, 20, "P2"),
    "tradehouse": (19, 28, 14, 18, "P2"),
    "barracks": (47, 46, 13, 17, "P2"),
    "stonewall": (24, 66, 17, 12, "P3"),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_compositor():
    path = PACKAGE / "tools" / "compose_checkpoint.py"
    spec = importlib.util.spec_from_file_location("city_checkpoint_compositor", path)
    if spec is None or spec.loader is None:
        raise AssertionError("unable to load compositor")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def validate_inventory() -> None:
    retained = {
        str(path.relative_to(PACKAGE))
        for path in PACKAGE.rglob("*.webp")
        if path.parent.name in {"sources", "cutouts", "layers", "proofs"}
        or path.parent.parent.name == "proofs"
    }
    assert retained == set(EXPECTED), (
        f"unexpected WebP inventory; missing={sorted(set(EXPECTED) - retained)} "
        f"extra={sorted(retained - set(EXPECTED))}"
    )

    for relative, (mode, size) in EXPECTED.items():
        path = PACKAGE / relative
        assert path.stat().st_size <= MAX_BYTES, f"{relative} exceeds 300 KiB"
        with Image.open(path) as image:
            assert image.format == "WEBP", f"{relative} is not WebP"
            assert image.mode == mode, f"{relative}: expected {mode}, got {image.mode}"
            assert image.size == size, f"{relative}: expected {size}, got {image.size}"
            forbidden_metadata = {"exif", "xmp", "icc_profile"} & set(image.info)
            assert not forbidden_metadata, f"{relative}: metadata present {forbidden_metadata}"


def validate_provenance() -> None:
    data = json.loads((PACKAGE / "PROVENANCE.json").read_text())
    assert data["service"] == "OpenAI built-in image generator"
    assert data["date"] == "2026-09-03"
    assert len(data["generation"]) == 9
    assert {item["prompt_id"] for item in data["generation"]} == {
        "P1",
        "P2",
        "P3",
        "P4",
        "P5",
        "P6",
        "P7",
        "P8",
        "P9",
    }
    for item in data["generation"]:
        path = PACKAGE / item["retained_path"]
        assert sha256(path) == item["retained_sha256"], f"source hash drift: {path.name}"
    assert data["active_sources"]["backdrop"] == "sources/empty-harbor-source-r2.webp"
    assert data["active_sources"]["shipyard"] == "sources/shipyard-source-r2.webp"
    assert data["masking"]["model"] == "isnet-general-use"
    for item in data["masking"]["masks"]:
        path = PACKAGE / item["path"]
        assert sha256(path) == item["sha256"], f"mask hash drift: {path.name}"
    prompts = (PACKAGE / "PROMPTS.md").read_text()
    for prompt_id in ("P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"):
        assert f"## {prompt_id} " in prompts, f"missing {prompt_id} prompt"
    assert "did not expose a model identifier" in prompts
    assert "did not expose a model name/version" in (PACKAGE / "MANIFEST.md").read_text()


def validate_alpha_contract() -> None:
    for path in sorted((PACKAGE / "cutouts").glob("*.webp")):
        image = Image.open(path).convert("RGBA")
        alpha = image.getchannel("A")
        low, high = alpha.getextrema()
        histogram = alpha.histogram()
        assert low == 0 and high == 255, f"{path.name}: alpha lacks full range"
        assert sum(histogram[1:255]) > 0, f"{path.name}: alpha is not antialiased"
        # The production contract asks for eight clear edge pixels. Allow only
        # negligible compression noise in that band.
        border = Image.new("L", image.size, 0)
        border.paste(alpha.crop((0, 0, image.width, 8)), (0, 0))
        border.paste(alpha.crop((0, image.height - 8, image.width, image.height)), (0, image.height - 8))
        border.paste(alpha.crop((0, 0, 8, image.height)), (0, 0))
        border.paste(alpha.crop((image.width - 8, 0, image.width, image.height)), (image.width - 8, 0))
        assert border.getextrema()[1] <= 8, f"{path.name}: meaningful alpha enters safety band"

        values = np.asarray(alpha)
        for threshold in (8, 128):
            components, count = ndimage.label(values > threshold)
            assert count == 1, f"{path.name}: alpha>{threshold} has {count} disconnected islands"
        opaque = values >= 240
        soft = (values > 8) & ~opaque
        distance = ndimage.distance_transform_edt(~opaque)
        assert float(distance[soft].max()) <= 5, f"{path.name}: broad translucent matte detected"

    shadow = Image.open(PACKAGE / "layers" / "contact-shadows.webp").convert("RGBA")
    shadow_max = shadow.getchannel("A").getextrema()[1]
    assert shadow_max <= round(255 * 0.38), f"shadow alpha {shadow_max} exceeds Direction B cap"


def validate_subject_masks() -> None:
    paths = sorted((PACKAGE / "masks").glob("*-mask.png"))
    assert len(paths) == 6, f"expected six retained subject masks, got {len(paths)}"
    for path in paths:
        asset = path.name.removesuffix("-mask.png")
        with Image.open(path) as image:
            assert image.format == "PNG" and image.mode == "L" and image.size == (1254, 1254)
            assert not ({"exif", "xmp", "icc_profile"} & set(image.info)), f"{path.name}: metadata present"
            alpha = np.asarray(image)

        assert int(alpha.min()) == 0 and int(alpha.max()) == 255
        assert ((alpha > 0) & (alpha < 255)).any(), f"{path.name}: mask is not antialiased"
        for threshold in (8, 128):
            _, count = ndimage.label(alpha > threshold)
            assert count == 1, f"{path.name}: alpha>{threshold} has {count} disconnected islands"
        opaque = alpha >= 240
        soft = (alpha > 8) & ~opaque
        distance = ndimage.distance_transform_edt(~opaque)
        assert float(distance[soft].max()) <= 5, f"{path.name}: broad translucent matte detected"

        for x, y in MASK_HOLE_WITNESSES.get(asset, ()):
            assert alpha[y, x] <= 8, f"{path.name}: enclosed background hole ({x},{y}) is opaque"


def validate_stress_proofs() -> None:
    for path in sorted((PACKAGE / "proofs" / "stress").glob("*-magenta-1024.webp")):
        image = Image.open(path).convert("RGB")
        left = image.getpixel((8, 180))
        right = image.getpixel((1015, 180))
        assert left[0] > 230 and left[2] > 230 and left[1] < 35, f"{path.name}: magenta field missing"
        assert right[0] < 25 and right[1] > 35 and right[2] > 40, f"{path.name}: dark-teal field missing"


def validate_geometry() -> None:
    compositor = load_compositor()
    assert compositor.MASTER_SIZE == (2048, 1408)
    assert compositor.RUNTIME_SIZE == (1024, 704)
    actual = {
        slot.asset: (slot.left, slot.top, slot.width, slot.height, slot.depth)
        for slot in compositor.SLOTS
    }
    assert actual == EXPECTED_SLOTS, f"slot geometry drift: {actual}"


def validate_shipyard_connection() -> None:
    compositor = load_compositor()
    slot = next(slot for slot in compositor.SLOTS if slot.asset == "shipyard")
    cutout = Image.open(PACKAGE / "cutouts" / "shipyard.webp").convert("RGBA")
    rendered, x, y = compositor.contained(cutout, compositor.slot_box(slot, compositor.MASTER_SIZE))
    placed_alpha = np.zeros((compositor.MASTER_SIZE[1], compositor.MASTER_SIZE[0]), dtype=np.uint8)
    placed_alpha[y : y + rendered.height, x : x + rendered.width] = np.asarray(
        rendered.getchannel("A")
    )
    backdrop = np.asarray(Image.open(PACKAGE / "layers" / "empty-backdrop-2048x1408.webp"))

    shore_box = (1960, 1070, 2028, 1180)
    sx1, sy1, sx2, sy2 = shore_box
    shore_alpha = placed_alpha[sy1:sy2, sx1:sx2] >= 128
    assert int(shore_alpha.sum()) >= 1000, "shipyard gangway does not reach the shore witness region"
    shore_rgb = backdrop[sy1:sy2, sx1:sx2][shore_alpha].mean(axis=0)
    assert shore_rgb[0] > 140 and (shore_rgb[0] + shore_rgb[1]) / 2 > shore_rgb[2] + 20, (
        f"shipyard shore witness is not on dry sand/limestone: {shore_rgb}"
    )

    water_box = (1700, 1250, 1880, 1394)
    wx1, wy1, wx2, wy2 = water_box
    water_alpha = placed_alpha[wy1:wy2, wx1:wx2] >= 128
    assert int(water_alpha.sum()) >= 15000, "shipyard waterward structure is missing"
    water_rgb = backdrop[wy1:wy2, wx1:wx2][water_alpha].mean(axis=0)
    assert water_rgb[2] > water_rgb[0] + 50 and water_rgb[1] > water_rgb[0] + 40, (
        f"shipyard water witness is not over luminous water: {water_rgb}"
    )


def validate_determinism() -> None:
    command = [sys.executable, str(PACKAGE / "tools" / "compose_checkpoint.py"), "--check"]
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise AssertionError(f"deterministic recomposition failed:\n{result.stdout}\n{result.stderr}")
    assert "PASS: deterministic recomposition matched 21 files" in result.stdout


def main() -> None:
    # Checkpoint one is retained as history, but this package now ships the
    # complete production candidate. Keep the old entry point useful instead
    # of validating superseded dimensions and inventories.
    production_validator = PACKAGE / "tools" / "validate_production.py"
    if production_validator.exists():
        subprocess.run([sys.executable, str(production_validator)], check=True)
        return
    validate_inventory()
    print("PASS: 30-file WebP inventory, dimensions, modes, metadata, and 300 KiB ceiling")
    validate_provenance()
    print("PASS: nine source records, active selections, hashes, P1-P9 prompts, masks, and unavailable fields")
    validate_alpha_contract()
    validate_subject_masks()
    print("PASS: reviewed masks, enclosed holes, single alpha islands, soft-edge bounds, and shadow cap")
    validate_stress_proofs()
    print("PASS: six saturated magenta/dark-teal native alpha stress proofs")
    validate_geometry()
    print("PASS: exact 16:11 master/runtime geometry and current SCENE_SLOTS values")
    validate_shipyard_connection()
    print("PASS: shipyard spans dry-shore and water witnesses inside the unchanged slot")
    validate_determinism()
    print("PASS: byte-identical deterministic recomposition of 21 derived files")
    print("PASS: issue #608 checkpoint-one technical contract")


if __name__ == "__main__":
    main()
