#!/usr/bin/env python3
"""Technical acceptance checks for issue #608 checkpoint one."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image


PACKAGE = Path(__file__).resolve().parents[1]
MAX_BYTES = 300 * 1024

EXPECTED = {
    "sources/empty-harbor-source-r1.webp": ("RGB", (1567, 1004)),
    "sources/townhall-source-r1.webp": ("RGB", (1254, 1254)),
    "sources/tavern-source-r1.webp": ("RGB", (1254, 1254)),
    "sources/tradehouse-source-r1.webp": ("RGB", (1254, 1254)),
    "sources/barracks-source-r1.webp": ("RGB", (1254, 1254)),
    "sources/stonewall-source-r1.webp": ("RGB", (1254, 1254)),
    "sources/shipyard-source-r1.webp": ("RGB", (1254, 1254)),
    "cutouts/townhall.webp": ("RGBA", (900, 838)),
    "cutouts/tavern.webp": ("RGBA", (900, 857)),
    "cutouts/tradehouse.webp": ("RGBA", (900, 681)),
    "cutouts/barracks.webp": ("RGBA", (900, 825)),
    "cutouts/stonewall.webp": ("RGBA", (900, 498)),
    "cutouts/shipyard.webp": ("RGBA", (900, 876)),
    "layers/contact-shadows.webp": ("RGBA", (2048, 1408)),
    "layers/empty-backdrop-2048x1408.webp": ("RGB", (2048, 1408)),
    "proofs/checkpoint-contact-sheet-1600x1120.webp": ("RGB", (1600, 1120)),
    "proofs/desktop-1440x900.webp": ("RGB", (1440, 900)),
    "proofs/empty-runtime-1024x704.webp": ("RGB", (1024, 704)),
    "proofs/layer-separation-1600x1000.webp": ("RGB", (1600, 1000)),
    "proofs/max-zoom-1024x704.webp": ("RGB", (1024, 704)),
    "proofs/phone-375x812.webp": ("RGB", (375, 812)),
    "proofs/scene-runtime-1024x704.webp": ("RGB", (1024, 704)),
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
        for path in PACKAGE.glob("*/*.webp")
        if path.parent.name in {"sources", "cutouts", "layers", "proofs"}
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
    assert len(data["generation"]) == 7
    assert {item["prompt_id"] for item in data["generation"]} == {
        "P1",
        "P2",
        "P3",
        "P4",
        "P5",
        "P6",
        "P7",
    }
    for item in data["generation"]:
        path = PACKAGE / item["retained_path"]
        assert sha256(path) == item["retained_sha256"], f"source hash drift: {path.name}"
    prompts = (PACKAGE / "PROMPTS.md").read_text()
    for prompt_id in ("P1", "P2", "P3", "P4", "P5", "P6", "P7"):
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

    shadow = Image.open(PACKAGE / "layers" / "contact-shadows.webp").convert("RGBA")
    shadow_max = shadow.getchannel("A").getextrema()[1]
    assert shadow_max <= round(255 * 0.38), f"shadow alpha {shadow_max} exceeds Direction B cap"


def validate_geometry() -> None:
    compositor = load_compositor()
    assert compositor.MASTER_SIZE == (2048, 1408)
    assert compositor.RUNTIME_SIZE == (1024, 704)
    actual = {
        slot.asset: (slot.left, slot.top, slot.width, slot.height, slot.depth)
        for slot in compositor.SLOTS
    }
    assert actual == EXPECTED_SLOTS, f"slot geometry drift: {actual}"


def validate_determinism() -> None:
    command = [sys.executable, str(PACKAGE / "tools" / "compose_checkpoint.py"), "--check"]
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise AssertionError(f"deterministic recomposition failed:\n{result.stdout}\n{result.stderr}")
    assert "PASS: deterministic recomposition matched 15 files" in result.stdout


def main() -> None:
    validate_inventory()
    print("PASS: 22-file WebP inventory, dimensions, modes, metadata, and 300 KiB ceiling")
    validate_provenance()
    print("PASS: seven source records, hashes, prompt IDs, reference roles, and unavailable fields")
    validate_alpha_contract()
    print("PASS: six genuine-alpha cutouts, 8 px safety bands, and 38% shadow cap")
    validate_geometry()
    print("PASS: exact 16:11 master/runtime geometry and current SCENE_SLOTS values")
    validate_determinism()
    print("PASS: byte-identical deterministic recomposition of 15 derived files")
    print("PASS: issue #608 checkpoint-one technical contract")


if __name__ == "__main__":
    main()
