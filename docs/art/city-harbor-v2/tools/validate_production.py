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
RENEWAL_PATH = (
    REPOSITORY
    / "docs"
    / "art"
    / "city-ui-v2"
    / "RUNTIME-EVIDENCE-RENEWAL.json"
)
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
RUNTIME_CAPTURE_NAMES = (
    "starting-desktop-1440x900.jpg",
    "starting-phone-390x844.jpg",
    "midgame-desktop-1440x900.jpg",
    "full-desktop-1440x900.jpg",
    "full-phone-390x844.jpg",
    "full-phone-3x-center-390x844.jpg",
    "full-phone-3x-shipyard-390x844.jpg",
    "full-desktop-3x-1440x900.jpg",
)
RUNTIME_SOURCE_HEAD = "c1824f22bf14dca6d38f7519fd99affd789a8130"
RUNTIME_APPROVED_STATUS = "approved"
RUNTIME_APPROVAL_EVIDENCE_HEAD = "08717289778883d7adca6ff7a6f15b20fb7c6b25"
RUNTIME_APPROVAL_RECORD = (
    "https://github.com/jharvieux/AoP/issues/608#issuecomment-5555061289"
)
RENEWAL_APPROVAL_RECORD = (
    "https://github.com/jharvieux/AoP/issues/613#issuecomment-5555054349"
)
RENEWAL_SET_RECORDS = {
    "city-harbor-v2": RUNTIME_APPROVAL_RECORD,
    "gameplay-chrome-v2": (
        "https://github.com/jharvieux/AoP/issues/610#issuecomment-5555063774"
    ),
    "world-map-terrain-v2": (
        "https://github.com/jharvieux/AoP/issues/611#issuecomment-5555066496"
    ),
    "city-ui-v2": (
        "https://github.com/jharvieux/AoP/issues/612#issuecomment-5555069230"
    ),
}
RUNTIME_HISTORICAL_APPROVAL = {
    "status": "historical-source-only",
    "sourceHead": "45a206f760eacce50dc8dd1dc656c5d4e789cb3c",
    "evidenceHead": "dc11b60738f4f14b896532bf2db323b2bd054f5c",
    "record": "https://github.com/jharvieux/AoP/issues/608#issuecomment-5551752263",
    "reusable": False,
}
RUNTIME_SUPERSEDED_CAPTURE = {
    "sourceHead": "a5a8fd5f8c522ebddfb146510b492bcea1c28ee2",
    "recordHead": "b64ae4c02c3c31342e1fbf70f87b9c07203f86d2",
    "bindingSha256": "73a2cad9a38940a46731d30dedce32a35e1a1baaf2f6001c6688efbeeeb088f1",
    "approval": {"status": "pending-direct-operator-approval", "record": None},
    "reusable": False,
}


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
    styles = (REPOSITORY / "apps" / "web" / "src" / "styles.css").read_text()
    for path in constructed_files:
        assert f"/art/city/{path.name}" in content
    for path in backdrop_files:
        assert f'"src": "/art/city/{path.name}"' in LAYOUT_PATH.read_text()
    assert "citySceneLayout.backdrop.tiles" in scene
    assert "spriteCandidates" in scene and "FallbackImage" in scene
    assert "city-scene__backdrop-cell" in scene and "data-backdrop-tile" in scene
    assert "BACKDROP_TILE_BLEED = 2" in scene
    assert "contact-shadows" not in scene
    assert "city-scene__flagpole-mount" in scene
    assert "--city-flag-mount-width" in scene and "--city-flag-mount-height" in scene
    assert ".city-scene__flagpole-mount::before" in styles
    assert ".city-scene__flagpole-mount::after" in styles


def validate_layout_resolution_flags_and_seams() -> None:
    resolution_module = load_module(
        "city_resolution_census", PACKAGE / "tools/build_resolution_census.py"
    )
    retained = json.loads((PACKAGE / "RESOLUTION-CENSUS.json").read_text())
    assert retained == resolution_module.build(), "resolution census is stale"
    assert retained["worst_backdrop"]["ratio"] >= 1
    for asset, values in retained["worst_assets"].items():
        assert values["ratio"] >= 1, f"{asset} undersampled: {values}"

    module = compositor()
    hall_slot = next(
        slot for slot in module.SLOTS if slot.content_id == LAYOUT["flag"]["slotId"]
    )
    hall_cutout = Image.open(PACKAGE / "cutouts" / "townhall.webp").convert("RGBA")
    for device, fitted_size in (("phone", (375, 258)), ("desktop", (1024, 704))):
        for zoom in LAYOUT["zoomStops"]:
            size = (
                round(fitted_size[0] * zoom),
                round(fitted_size[1] * zoom),
            )
            geometry = module.flag_geometry(size)
            cloth_right = geometry["cloth_x"] + geometry["cloth_size"]
            cloth_bottom = geometry["cloth_y"] + geometry["cloth_size"]
            assert 0 <= geometry["cloth_x"] < cloth_right <= size[0], (
                f"{device} {zoom}x flag clips horizontally: {geometry}"
            )
            assert 0 <= geometry["cloth_y"] < cloth_bottom <= size[1], (
                f"{device} {zoom}x flag clips vertically: {geometry}"
            )
            assert (
                0 <= geometry["mount_left"] < geometry["mount_right"] <= size[0]
                and 0 <= geometry["mount_top"] < geometry["mount_bottom"] <= size[1]
            ), f"{device} {zoom}x flag mount clips: {geometry}"

            rendered, hall_x, hall_y = module.contained(
                hall_cutout, module.slot_box(hall_slot, size)
            )
            alpha = np.asarray(rendered.getchannel("A"))
            base_x = geometry["mast_center_x"] - hall_x
            base_y = geometry["mast_base_y"] - hall_y
            assert 0 <= base_x < alpha.shape[1] and 0 <= base_y < alpha.shape[0], (
                f"{device} {zoom}x mast base misses the Town Hall cutout bounds: "
                f"base=({geometry['mast_center_x']}, {geometry['mast_base_y']})"
            )
            assert int(alpha[base_y, base_x]) >= 128, (
                f"{device} {zoom}x mast base floats outside Town Hall subject alpha: "
                f"base=({geometry['mast_center_x']}, {geometry['mast_base_y']})"
            )
            radius = max(1, geometry["mast_width"])
            mount_left = max(0, geometry["mount_left"] - hall_x)
            mount_right = min(alpha.shape[1], geometry["mount_right"] - hall_x + 1)
            mount_top = max(0, geometry["mount_top"] - hall_y)
            mount_bottom = min(alpha.shape[0], geometry["mount_bottom"] - hall_y + 1)
            mount_region = alpha[mount_top:mount_bottom, mount_left:mount_right]
            assert mount_region.size and int((mount_region >= 128).sum()) >= radius, (
                f"{device} {zoom}x V-brace misses Town Hall subject alpha"
            )
    for faction in ("pirates", "british", "spanish", "french", "dutch"):
        image = Image.open(
            REPOSITORY / f"apps/web/public/art/factions/{faction}/flag.png"
        ).convert("RGBA")
        assert image.getchannel("A").getbbox() == (0, 0, *image.size)

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


def validate_stylesheet_scope_guardrails(binding_builder) -> dict[str, object]:
    styles_path = REPOSITORY / binding_builder.STYLESHEET_PATH
    scene_path = REPOSITORY / "apps/web/src/CityScene.tsx"
    styles = styles_path.read_text()
    scene = scene_path.read_text()
    scope = binding_builder.build_stylesheet_scope(styles, scene)

    unrelated = styles + "\n.capture-binding-unrelated { color: #fff; }\n"
    assert binding_builder.build_stylesheet_scope(unrelated, scene) == scope, (
        "unrelated CSS changed the city capture dependency closure"
    )

    selected_marker = ".city-scene {\n  --city-zoom: 1;"
    assert selected_marker in styles
    selected_change = styles.replace(
        selected_marker,
        ".city-scene {\n  --city-zoom: 1.01;",
        1,
    )
    assert binding_builder.build_stylesheet_scope(selected_change, scene) != scope, (
        "city selector drift did not change the capture dependency closure"
    )

    def expect_failure(candidate_styles: str, candidate_scene: str, message: str) -> None:
        try:
            binding_builder.build_stylesheet_scope(candidate_styles, candidate_scene)
        except AssertionError as error:
            assert message in str(error), f"unexpected scope failure: {error}"
        else:
            raise AssertionError(f"city stylesheet scope accepted {message}")

    stroke = "  --stroke-standard: #725838;\n"
    assert stroke in styles
    expect_failure(styles.replace(stroke, "", 1), scene, "unresolved")

    emphasized = "  --stroke-emphasized: #cbb17a;\n"
    assert emphasized in styles
    cyclic = styles.replace(
        stroke,
        "  --stroke-standard: var(--stroke-emphasized);\n",
        1,
    ).replace(
        emphasized,
        "  --stroke-emphasized: var(--stroke-standard);\n",
        1,
    )
    expect_failure(cyclic, scene, "cyclic")

    component_marker = "'--city-shadow-left':"
    assert component_marker in scene
    expect_failure(
        styles,
        scene.replace(component_marker, "'--removed-city-shadow-left':", 1),
        "unresolved",
    )
    return scope


def validate_runtime_captures() -> None:
    renewal_set = None
    if RENEWAL_PATH.is_file():
        renewal = json.loads(RENEWAL_PATH.read_text())
        renewal_set = next(
            (
                item
                for item in renewal.get("sets", [])
                if item.get("id") == "city-harbor-v2"
            ),
            None,
        )
        assert renewal_set is not None, (
            "#613 renewal omits the city-harbor-v2 capture set"
        )
        assert renewal_set.get("count") == len(RUNTIME_CAPTURE_NAMES), (
            "#613 city-harbor-v2 renewal count drift"
        )
        assert renewal.get("status") == "approved-renewal", (
            "invalid #613 renewal status"
        )
        assert renewal.get("approval") == {
            "status": "approved",
            "evidenceHead": RUNTIME_APPROVAL_EVIDENCE_HEAD,
            "record": RENEWAL_APPROVAL_RECORD,
            "setRecords": RENEWAL_SET_RECORDS,
        }, "#613 approval record drift"
        set_renewal = renewal_set.get("renewal")
        assert set_renewal is not None, (
            "#613 city-harbor-v2 replacement capture record is missing"
        )
        assert set_renewal.get("status") == "approved-exact-source"
        assert set_renewal.get("sourceHead") == RUNTIME_SOURCE_HEAD
        assert set_renewal.get("historicalPixelsReused") is False
        assert set_renewal.get("supersededCapture") == RUNTIME_SUPERSEDED_CAPTURE
        assert set_renewal.get("approval") == {
            "status": "approved",
            "evidenceHead": RUNTIME_APPROVAL_EVIDENCE_HEAD,
            "record": RUNTIME_APPROVAL_RECORD,
        }, "city-harbor-v2 approval record drift"
        assert set_renewal.get("visualSettleInspection") == (
            "completed-by-integration-owner"
        )
        assert set_renewal.get("nativeSizeInspection") == (
            "completed-by-integration-owner"
        )
    capture_root = PACKAGE / "runtime-captures"
    assert {path.name for path in capture_root.iterdir() if path.is_file()} == set(
        RUNTIME_CAPTURE_NAMES
    ), "runtime capture directory inventory drift"
    captures = {path.name: path for path in capture_root.glob("*.jpg")}
    assert set(captures) == set(RUNTIME_CAPTURE_NAMES), "runtime capture inventory drift"
    binding_path = PACKAGE / "RUNTIME-CAPTURE-BINDINGS.json"
    binding = json.loads(binding_path.read_text())
    assert binding["schema"] == 3
    assert binding["sourceHead"] == RUNTIME_SOURCE_HEAD
    assert binding["captureSourceHead"] == RUNTIME_SOURCE_HEAD
    assert binding["captureStatus"] == RUNTIME_APPROVED_STATUS
    assert binding["approval"] == {
        "status": "approved",
        "evidenceHead": RUNTIME_APPROVAL_EVIDENCE_HEAD,
        "record": RUNTIME_APPROVAL_RECORD,
    }, "runtime approval binding drift"
    assert binding["historicalApproval"] == RUNTIME_HISTORICAL_APPROVAL
    assert binding["supersededCapture"] == RUNTIME_SUPERSEDED_CAPTURE
    assert binding["captureOrigin"]["workflow"] == (
        "truthful shipping-component import harness with visible shipping controls"
    )
    assert binding["captureOrigin"]["sourceHead"] == RUNTIME_SOURCE_HEAD
    assert binding["captureOrigin"]["programmaticFontOrImageAwaitClaimed"] is False
    assert binding["captureOrigin"]["visualSettleInspection"] == (
        "completed-by-integration-owner"
    )
    assert binding["captureOrigin"]["nativeSizeInspection"] == (
        "completed-by-integration-owner"
    )
    if renewal_set is not None:
        assert sha256(binding_path) == renewal_set["renewal"]["bindingSha256"], (
            "#613 city-harbor-v2 renewal binding drift"
        )
    binding_builder = load_module(
        "city_runtime_capture_binding",
        PACKAGE / "tools" / "build_runtime_capture_bindings.py",
    )
    assert "apps/web/src/cityArtRegistry.ts" in binding_builder.FULL_SHIPPING_SOURCES, (
        "runtime capture binding must include the web-owned city art registry"
    )
    assert tuple(item["path"] for item in binding["shipping_sources"]) == (
        binding_builder.FULL_SHIPPING_SOURCES
    ), "runtime capture full-source inventory drift"
    subprocess.run(
        ["git", "merge-base", "--is-ancestor", RUNTIME_SOURCE_HEAD, "HEAD"],
        cwd=REPOSITORY,
        check=True,
    )
    for source in binding["shipping_sources"]:
        path = REPOSITORY / source["path"]
        assert sha256(path) == source["sha256"], (
            f"runtime captures are stale for shipping source: {source['path']}"
        )
        target = subprocess.run(
            ["git", "show", f"{RUNTIME_SOURCE_HEAD}:{source['path']}"],
            cwd=REPOSITORY,
            check=True,
            capture_output=True,
        ).stdout
        assert target == path.read_bytes(), (
            f"runtime source does not match exact target: {source['path']}"
        )
    expected_scope = validate_stylesheet_scope_guardrails(binding_builder)
    stylesheet_binding = binding["stylesheet_source"]
    assert set(stylesheet_binding) == {"path", "diagnostic_full_sha256", "scope"}, (
        "runtime capture stylesheet binding inventory drift"
    )
    assert stylesheet_binding["path"] == binding_builder.STYLESHEET_PATH
    full_hash = stylesheet_binding["diagnostic_full_sha256"]
    assert isinstance(full_hash, str) and len(full_hash) == 64
    int(full_hash, 16)
    stylesheet_path = REPOSITORY / binding_builder.STYLESHEET_PATH
    assert full_hash == sha256(stylesheet_path), (
        "runtime captures are stale for the exact target stylesheet"
    )
    target_stylesheet = subprocess.run(
        ["git", "show", f"{RUNTIME_SOURCE_HEAD}:{binding_builder.STYLESHEET_PATH}"],
        cwd=REPOSITORY,
        check=True,
        capture_output=True,
    ).stdout
    assert target_stylesheet == stylesheet_path.read_bytes(), (
        "runtime stylesheet does not match exact target"
    )
    assert stylesheet_binding["scope"] == expected_scope, (
        "runtime captures are stale for the city stylesheet dependency closure"
    )
    bound_captures = {Path(item["path"]).name: item for item in binding["captures"]}
    assert set(bound_captures) == set(RUNTIME_CAPTURE_NAMES), (
        "runtime capture binding inventory drift"
    )
    record = (PACKAGE / "RUNTIME-CAPTURES.md").read_text()
    approval_head = RUNTIME_HISTORICAL_APPROVAL["evidenceHead"]
    approval_record = RUNTIME_HISTORICAL_APPROVAL["record"]
    for relative in ("README.md", "PRODUCTION-MANIFEST.md", "RUNTIME-CAPTURES.md"):
        approval_source = (PACKAGE / relative).read_text()
        assert approval_head in approval_source and approval_record in approval_source, (
            f"runtime capture historical approval record drift: {relative}"
        )
        assert RUNTIME_SOURCE_HEAD in approval_source, (
            f"runtime target source record drift: {relative}"
        )
        assert RUNTIME_APPROVAL_RECORD in approval_source, (
            f"runtime approval status drift: {relative}"
        )

    historical_binding_bytes = subprocess.run(
        [
            "git",
            "show",
            f"{approval_head}:docs/art/city-harbor-v2/RUNTIME-CAPTURE-BINDINGS.json",
        ],
        cwd=REPOSITORY,
        check=True,
        capture_output=True,
    ).stdout
    if renewal_set is not None:
        assert hashlib.sha256(historical_binding_bytes).hexdigest() == (
            renewal_set["historicalBinding"]["sha256"]
        ), "historical city-harbor-v2 binding record drift"
    historical_binding = json.loads(historical_binding_bytes)
    historical_captures = {
        Path(item["path"]).name: item for item in historical_binding["captures"]
    }
    superseded_binding_bytes = subprocess.run(
        [
            "git",
            "show",
            f"{RUNTIME_SUPERSEDED_CAPTURE['recordHead']}:docs/art/city-harbor-v2/RUNTIME-CAPTURE-BINDINGS.json",
        ],
        cwd=REPOSITORY,
        check=True,
        capture_output=True,
    ).stdout
    assert hashlib.sha256(superseded_binding_bytes).hexdigest() == (
        RUNTIME_SUPERSEDED_CAPTURE["bindingSha256"]
    ), "superseded city-harbor-v2 binding record drift"
    superseded_binding = json.loads(superseded_binding_bytes)
    superseded_captures = {
        Path(item["path"]).name: item for item in superseded_binding["captures"]
    }

    for name in RUNTIME_CAPTURE_NAMES:
        item = bound_captures[name]
        dimensions = tuple(item["dimensions"])
        byte_count = item["bytes"]
        digest = item["sha256"]
        path = captures[name]
        assert path.stat().st_size == byte_count, f"runtime capture byte drift: {name}"
        assert byte_count <= MAX_BYTES, f"runtime capture exceeds 300 KiB: {name}"
        assert sha256(path) == digest, f"runtime capture hash drift: {name}"
        assert digest != historical_captures[name]["sha256"], (
            f"historical runtime pixel was reused: {name}"
        )
        assert digest != superseded_captures[name]["sha256"], (
            f"superseded runtime pixel was reused: {name}"
        )
        with Image.open(path) as image:
            assert image.format == "JPEG" and image.mode == "RGB"
            assert image.size == dimensions, f"runtime capture dimension drift: {name}"
            assert "jfif" in image.info and not image.info.get("progressive", False), (
                f"runtime capture must be baseline JFIF: {name}"
            )
        assert name in record and digest in record, f"runtime capture record drift: {name}"


def main() -> None:
    validate_provenance()
    validate_masks_and_cutouts()
    validate_runtime()
    validate_layout_resolution_flags_and_seams()
    validate_proofs_and_shipyard()
    validate_determinism()
    validate_runtime_captures()
    print(
        "PASS: #608 production art, alpha topology, shore placement, provenance, budgets, "
        "deterministic proofs, and live runtime captures"
    )


if __name__ == "__main__":
    main()
