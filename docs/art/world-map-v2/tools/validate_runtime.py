#!/usr/bin/env python3
"""Fail-loud validation for issue #609's runtime art delivery."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[2]
REGISTRY = ROOT / "asset-registry.json"
ADDITIONS = ROOT / "runtime-additions.json"
PROMPTS = ROOT / "PROMPTS.md"
POLISH_RECEIPT = ROOT / "sources" / "runtime" / "polish-receipt.json"
PUBLIC_RECEIPT = ROOT / "runtime-public-receipt.json"
SOURCE_LIMIT = 300 * 1024
TOKEN_TARGET = 128 * 1024
TOKEN_CEILING = 300 * 1024
PROOF_LIMIT = 300 * 1024
CRITICAL_LIMIT = 3 * 1024 * 1024
EXPECTED_PROOFS = {
    "proofs/matte-stress/matte-stress-512-page-1.webp": (1120, 2232),
    "proofs/matte-stress/matte-stress-512-page-2.webp": (1120, 2232),
    "proofs/matte-stress/matte-stress-512-page-3.webp": (1120, 2232),
    "proofs/matte-stress/matte-stress-512-page-4.webp": (1120, 2232),
    "proofs/matte-stress/matte-stress-512-page-5.webp": (1120, 2232),
    "proofs/matte-stress/matte-stress-512-page-6.webp": (1120, 1674),
    "proofs/matte-stress/matte-stress-96-all.webp": (1092, 852),
    "proofs/matte-stress/matte-full-footprint-96-all.webp": (590, 4296),
    "proofs/matte-stress/faction-marker-24-color-grayscale.webp": (850, 310),
    "proofs/matte-stress/runtime-public-contact-sheet-23.webp": (1024, 2992),
    "proofs/matte-stress/runtime-public-contact-sheet-41.webp": (1024, 5008),
    "proofs/matte-stress/ship-fleet-runtime-contact-sheet-20.webp": (1600, 3180),
    "proofs/matte-stress/ship-fleet-alpha-stress-96-all.webp": (606, 2116),
}
MATTE_REQUIRED_IDS = {
    "ship:british:sloop",
    "ship:pirates:galleon",
    "party:british",
    "party:spanish",
    "landSite:mine",
    "encounter:hermit",
    "encounter:nativeVillage",
}
CONTAMINATION_REQUIRED_IDS = {
    "party:spanish",
    "encounter:hermit",
    "encounter:nativeVillage",
}
RUNTIME_SIZES = [24, 32, 48, 96]
FACTIONS = ["british", "dutch", "french", "pirates", "spanish"]
SHIP_CLASSES = ["sloop", "brigantine", "frigate", "galleon"]
FLEET_IDS = [
    f"ship:{faction}:{ship_class}" for faction in FACTIONS for ship_class in SHIP_CLASSES
]
REUSED_SHIP_IDS = {"ship:british:sloop", "ship:pirates:galleon"}
GENERATED_SHIP_IDS = set(FLEET_IDS) - REUSED_SHIP_IDS
IMAGE_SUFFIXES = {".png", ".webp", ".jpg", ".jpeg"}
EXPECTED_RUNTIME_CAPTURES = {
    "desktop-1440x900.jpg": (
        (1440, 900),
        61817,
        "0bb8ad71284cf9c832735d9b96ec562304bbaabf154cf3ee10ce0d96f201bc35",
    ),
    "tablet-768x1024.jpg": (
        (768, 1024),
        51000,
        "891de6f6b71eb8fa8da0cce1b43712d7a0bb912fe14e789cb17a216c031f29e2",
    ),
    "phone-390x844.jpg": (
        (390, 844),
        30814,
        "5e636d9e945bfa237f21a1f202c99400fe0dbbe9bbadf454d1c16d9986a9056f",
    ),
}
UNRETAINED_ORIGINALS = {
    "encounter:natives": {
        "sha256": "3867d03e4393a76cce93dfc03fdf330a73b918558e2c0f7c225f4b848bac4006",
        "bytes": 953313,
        "alpha_bbox": [258, 71, 997, 1139],
    },
    "encounter:settlers": {
        "sha256": "c4333e9e6c224b4f4621d4146679b3ceb526f9f43aced398d7729fd8457fe8c2",
        "bytes": 1317086,
        "alpha_bbox": [172, 111, 1086, 1090],
    },
}
SEA_ADDITION_IDS = set(UNRETAINED_ORIGINALS)


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_file_budget(path: Path, byte_limit: int, role: str) -> None:
    if not path.is_file():
        fail(f"{role}: missing {path}")
    if path.stat().st_size > byte_limit:
        fail(f"{role}: {path} is {path.stat().st_size} bytes, exceeds {byte_limit}")


def load_tool_module(filename: str, module_name: str):
    path = ROOT / "tools" / filename
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        fail(f"could not load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_polish_module():
    return load_tool_module("polish_runtime_sources.py", "aop_map_polish")


def load_ship_fleet_module():
    return load_tool_module("ship_fleet.py", "aop_ship_fleet")


def check_rgba(path: Path, size: tuple[int, int], byte_limit: int) -> Image.Image:
    check_file_budget(path, byte_limit, "RGBA image")
    image = Image.open(path)
    if image.mode != "RGBA":
        fail(f"{path}: mode {image.mode}, expected RGBA")
    if image.size != size:
        fail(f"{path}: size {image.size}, expected {size}")
    alpha = np.asarray(image.getchannel("A"))
    if int(alpha.min()) != 0 or int(alpha.max()) != 255:
        fail(f"{path}: expected both fully transparent and fully opaque pixels")
    if any(int(alpha[y, x]) != 0 for x, y in ((0, 0), (size[0] - 1, 0), (0, size[1] - 1), (size[0] - 1, size[1] - 1))):
        fail(f"{path}: transparent sentinel corner is nonzero")
    return image


def check_metadata(additions: dict[str, object]) -> None:
    if additions.get("schema") != 2:
        fail("runtime-additions must use retained/unretained provenance schema 2")
    if additions.get("model") is not None or additions.get("seed") is not None:
        fail("runtime-additions model and seed must remain null because the interface hid them")
    if additions.get("interface_model_exposed") is not False:
        fail("runtime-additions must record model identifier as unavailable")
    if additions.get("interface_seed_exposed") is not False:
        fail("runtime-additions must record seed as unavailable")
    if additions.get("generation_inputs") != []:
        fail("top-level sea-replacement provenance must record that no image was attached")
    reference = additions.get("reviewed_reference", {})
    if not isinstance(reference, dict):
        fail("runtime additions lack reviewed-reference provenance")
    reference_path = ROOT / str(reference.get("path", ""))
    if not reference_path.is_file() or sha256(reference_path) != reference.get("sha256"):
        fail("runtime reviewed Direction B reference is missing or its hash drifted")
    if not additions.get("billing_path") or not additions.get("usage_license_basis"):
        fail("runtime additions lack billing or usage/license basis")
    normalization = additions.get("normalization", {})
    if not isinstance(normalization, dict):
        fail("runtime additions lack retained-source normalization metadata")
    if not additions.get("retention_policy") or not normalization.get("operation"):
        fail("runtime additions lack the retained/original transformation explanation")
    if normalization.get("hard_ceiling_bytes") != SOURCE_LIMIT:
        fail("retained-source normalization ceiling drifted")
    if normalization.get("tool") != "tools/polish_runtime_sources.py --normalize-retained-sources":
        fail("retained-source normalization tool is not reproducibly identified")

    fleet = additions.get("ship_fleet", {})
    ship_tool = load_ship_fleet_module()
    expected_fleet_metadata = {
        "identity_count": 20,
        "generated_count": 18,
        "reused_count": 2,
        "factions": FACTIONS,
        "classes": SHIP_CLASSES,
        "generation_service": "OpenAI built-in image generator in Codex",
        "generation_tool": "image_gen.imagegen",
        "generation_date": "2026-09-04",
        "model": None,
        "seed": None,
        "interface_model_exposed": False,
        "interface_seed_exposed": False,
    }
    if not isinstance(fleet, dict):
        fail("runtime additions lack 20-ship fleet provenance")
    for key, expected in expected_fleet_metadata.items():
        if fleet.get(key) != expected:
            fail(f"ship fleet {key} provenance drifted")
    if fleet.get("generation_inputs") != ship_tool.REFERENCE_INPUTS:
        fail("ship fleet input-reference roles or hashes drifted")
    for reference in fleet["generation_inputs"]:
        path = ROOT / str(reference["path"])
        if not path.is_file() or sha256(path) != reference["sha256"] or not reference.get("role"):
            fail(f"ship fleet input reference is missing or drifted: {path}")
    fleet_normalization = fleet.get("normalization", {})
    if not isinstance(fleet_normalization, dict):
        fail("ship fleet normalization provenance is missing")
    if (
        fleet_normalization.get("tool") != "tools/ship_fleet.py --normalize-sources"
        or fleet_normalization.get("hard_ceiling_bytes") != SOURCE_LIMIT
        or not fleet_normalization.get("operation")
    ):
        fail("ship fleet normalization provenance drifted")
    if not fleet.get("usage_license_basis"):
        fail("ship fleet usage/license basis is missing")
    if fleet.get("rejections") != ship_tool.rejection_rows():
        fail("ship fleet rejected-output provenance drifted")
    for rejection in fleet["rejections"]:
        if rejection.get("retained") is not False or not rejection.get("reason"):
            fail(f"{rejection.get('id')}: rejected output is not explicitly unretained")
        if rejection.get("bytes", 0) <= SOURCE_LIMIT or len(str(rejection.get("sha256", ""))) != 64:
            fail(f"{rejection.get('id')}: rejected output hash/byte record is malformed")

    assets = additions.get("assets", [])
    expected_addition_ids = SEA_ADDITION_IDS | GENERATED_SHIP_IDS
    if not isinstance(assets, list):
        fail("runtime additions assets must be a list")
    asset_ids = [asset.get("id") for asset in assets]
    if set(asset_ids) != expected_addition_ids or len(asset_ids) != len(expected_addition_ids):
        fail("runtime additions must map exactly two sea replacements and 18 generated ships")
    if asset_ids[:2] != ["encounter:natives", "encounter:settlers"] or asset_ids[2:] != ship_tool.generated_ids():
        fail("runtime additions ordering drifted from the deterministic two-sea-plus-fleet build")

    prompts = PROMPTS.read_text()
    for asset in assets:
        asset_id = str(asset["id"])
        if "raw_file" in asset or "raw_sha256" in asset:
            fail(f"{asset_id}: ambiguous raw fields must not identify the normalized retained file")
        path = ROOT / str(asset.get("retained_source_file", ""))
        check_file_budget(path, SOURCE_LIMIT, f"{asset_id} retained source")
        if sha256(path) != asset.get("retained_source_sha256"):
            fail(f"{asset_id}: retained normalized source hash drifted")
        if path.stat().st_size != asset.get("retained_source_bytes"):
            fail(f"{asset_id}: retained normalized source byte receipt drifted")
        image = Image.open(path)
        if list(image.size) != asset.get("retained_source_dimensions") or image.mode != asset.get(
            "retained_source_mode"
        ):
            fail(f"{asset_id}: retained normalized source shape/mode drifted")
        alpha = image.getchannel("A")
        if alpha.getextrema() != (0, 255):
            fail(f"{asset_id}: retained normalized source lacks full-range alpha")
        bbox = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
        if list(bbox) != asset.get("retained_alpha_bbox"):
            fail(f"{asset_id}: retained normalized alpha bounds drifted")

        rgba = np.asarray(image.convert("RGBA"))
        if np.any(rgba[rgba[:, :, 3] == 0, :3] != 0):
            fail(f"{asset_id}: transparent retained-source pixels contain RGB matte residue")

        original = asset.get("unretained_original", {})
        if not isinstance(original, dict) or original.get("retained") is not False:
            fail(f"{asset_id}: original byte stream must be truthfully marked unretained")
        if original.get("sha256") == asset.get("retained_source_sha256"):
            fail(f"{asset_id}: retained and original-unretained hashes are ambiguously identical")

        if asset_id in SEA_ADDITION_IDS:
            expected = UNRETAINED_ORIGINALS[asset_id]
            if original.get("sha256") != expected["sha256"] or original.get("bytes") != expected["bytes"]:
                fail(f"{asset_id}: original unretained hash/byte provenance drifted")
            if (
                original.get("dimensions") != [1254, 1254]
                or original.get("mode") != "RGBA"
                or original.get("alpha_bbox_at_threshold_8") != expected["alpha_bbox"]
                or original.get("capture_path") != asset.get("retained_source_file")
                or not original.get("disposition")
            ):
                fail(f"{asset_id}: original unretained capture metadata drifted")
            continue

        _, faction, ship_class = asset_id.split(":")
        prompt_section, request_kind, exact_prompt = ship_tool.selected_prompt(asset_id)
        expected_prompt_key = f"ship-{faction}-{ship_class}-runtime"
        if (
            asset.get("category") != "ships"
            or asset.get("faction") != faction
            or asset.get("ship_class") != ship_class
            or asset.get("prompt_key") != expected_prompt_key
            or asset.get("selected_prompt_section") != prompt_section
            or asset.get("selected_prompt_sha256")
            != hashlib.sha256(exact_prompt.encode()).hexdigest()
        ):
            fail(f"{asset_id}: identity or exact selected-prompt binding drifted")
        if f"## {expected_prompt_key}\n\n```text\n{ship_tool.exact_prompt(asset_id)}\n```" not in prompts:
            fail(f"{asset_id}: exact distinct concept-call prompt is missing")
        if f"## {prompt_section}\n\n```text\n{exact_prompt}\n```" not in prompts:
            fail(f"{asset_id}: exact selected-output prompt is missing")

        generation = asset.get("generation", {})
        if not isinstance(generation, dict):
            fail(f"{asset_id}: generation receipt is missing")
        if (
            generation.get("service") != expected_fleet_metadata["generation_service"]
            or generation.get("tool") != expected_fleet_metadata["generation_tool"]
            or generation.get("date") != expected_fleet_metadata["generation_date"]
            or generation.get("request_kind") != request_kind
            or generation.get("model") is not None
            or generation.get("seed") is not None
            or generation.get("interface_model_exposed") is not False
            or generation.get("interface_seed_exposed") is not False
            or generation.get("input_references") != fleet["generation_inputs"]
        ):
            fail(f"{asset_id}: per-call generation provenance drifted")

        if (
            asset.get("public_path") != ship_tool.public_path(asset_id)
            or asset.get("url") != "/" + str(asset["public_path"]).removeprefix("apps/web/public/")
        ):
            fail(f"{asset_id}: public ship path drifted")
        if list(image.size) != [512, 512] or bbox is None or bbox[3] != 448:
            fail(f"{asset_id}: source canvas or shared optical baseline drifted")
        if asset.get("subject_max_dimension") not in (384, 368, 352, 336, 320):
            fail(f"{asset_id}: normalized subject size is not an allowed deterministic step")
        expected_alpha_source = (
            "deterministic neutral-checkerboard recovery from selected built-in output"
            if asset_id in ship_tool.CHECKERBOARD_RECOVERY_IDS
            else "native full-range RGBA from built-in output"
        )
        if asset.get("alpha_source") != expected_alpha_source:
            fail(f"{asset_id}: alpha-source truth drifted")
        if (
            original.get("project_bound_path") != asset.get("retained_source_file")
            or original.get("bytes", 0) <= SOURCE_LIMIT
            or len(str(original.get("sha256", ""))) != 64
            or not original.get("capture_path")
            or not original.get("dimensions")
            or original.get("mode") not in ("RGB", "RGBA")
            or not original.get("disposition")
        ):
            fail(f"{asset_id}: original generated-byte provenance is incomplete")
        expected_capture = f"{ship_tool.GENERATION_ROOT}/{ship_tool.CAPTURE_PATHS[asset_id]}"
        if original.get("capture_path") != expected_capture:
            fail(f"{asset_id}: selected generated capture path drifted")

    generated_assets = [asset for asset in assets if asset.get("id") in GENERATED_SHIP_IDS]
    raw_hashes = [str(asset["unretained_original"]["sha256"]) for asset in generated_assets]
    capture_paths = [str(asset["unretained_original"]["capture_path"]) for asset in generated_assets]
    base_prompt_hashes = [
        hashlib.sha256(ship_tool.exact_prompt(str(asset["id"])).encode()).hexdigest()
        for asset in generated_assets
    ]
    if len(set(raw_hashes)) != 18 or len(set(capture_paths)) != 18 or len(set(base_prompt_hashes)) != 18:
        fail("the 18 generated ships do not have distinct raw captures and concept prompts")


def check_contamination_witnesses(
    asset_id: str,
    input_alpha: np.ndarray,
    output_alpha: np.ndarray,
    expected_witnesses: tuple[tuple[int, int], ...],
    receipt_witnesses: object,
) -> None:
    if asset_id in CONTAMINATION_REQUIRED_IDS and len(expected_witnesses) < 2:
        fail(f"{asset_id}: lacks multiple explicit contamination witnesses")
    expected_receipt: list[dict[str, int]] = []
    for x, y in expected_witnesses:
        source_value = int(input_alpha[y, x])
        output_value = int(output_alpha[y, x])
        if source_value < 8:
            fail(f"{asset_id}: contamination witness {(x, y)} was already transparent in source")
        if output_value != 0:
            fail(f"{asset_id}: contamination witness {(x, y)} is {output_value}, expected zero")
        expected_receipt.append(
            {"x": x, "y": y, "source_alpha": source_value, "output_alpha": output_value}
        )
    if receipt_witnesses != expected_receipt:
        fail(f"{asset_id}: contamination witness receipt drifted")


def check_runtime_sheet_coverage(
    row: dict[str, object],
    ids: list[str],
    polish_by_id: dict[str, dict[str, object]],
    *,
    expected_kind: str,
    label: str,
) -> None:
    if row.get("kind") != expected_kind:
        fail(f"{label} contact sheet has kind {row.get('kind')!r}, expected {expected_kind!r}")
    if row.get("identity_ids") != ids:
        fail(f"{label} contact sheet does not cover its complete identity set in registry order")
    if row.get("sizes_css_px") != RUNTIME_SIZES:
        fail(f"{label} contact sheet must show exact 24/32/48/96 CSS pixel sizes")
    if row.get("grayscale_factions") != FACTIONS:
        fail(f"{label} contact sheet lacks the five-faction grayscale comparison")
    if row.get("public_binding") != "runtime-public-receipt.json byte identity":
        fail(f"{label} contact sheet lacks an explicit public-receipt byte binding")
    runtime_inputs = row.get("runtime_inputs", [])
    if not isinstance(runtime_inputs, list) or [item.get("id") for item in runtime_inputs] != ids:
        fail(f"{label} contact sheet input list is not the complete shipping identity set")
    for item in runtime_inputs:
        asset_id = str(item["id"])
        source = ROOT / str(item.get("source", ""))
        if source != ROOT / str(polish_by_id[asset_id]["output_256"]):
            fail(f"{asset_id}: runtime contact sheet used a non-shipping source")
        if item.get("sha256") != sha256(source):
            fail(f"{asset_id}: runtime contact-sheet input hash drifted")


def check_ship_fleet_sheet_coverage(
    row: dict[str, object], polish_by_id: dict[str, dict[str, object]]
) -> None:
    if row.get("kind") != "ship-fleet-runtime-contact-sheet":
        fail("20-ship sheet is not marked as production/runtime evidence")
    if row.get("identity_ids") != FLEET_IDS:
        fail("20-ship sheet lacks the exact five-faction by four-class matrix")
    if row.get("sizes_css_px") != RUNTIME_SIZES:
        fail("20-ship sheet must show every identity at exact 24/32/48/96 CSS pixels")
    if row.get("grayscale_identity_ids") != FLEET_IDS:
        fail("20-ship sheet lacks the complete all-faction/class grayscale comparison")
    if row.get("public_binding") != "runtime-public-receipt.json byte identity":
        fail("20-ship sheet lacks an explicit public-receipt byte binding")
    runtime_inputs = row.get("runtime_inputs", [])
    if not isinstance(runtime_inputs, list) or [item.get("id") for item in runtime_inputs] != FLEET_IDS:
        fail("20-ship sheet input list is incomplete or out of matrix order")
    for item in runtime_inputs:
        asset_id = str(item["id"])
        source = ROOT / str(item.get("source", ""))
        if source != ROOT / str(polish_by_id[asset_id]["output_256"]):
            fail(f"{asset_id}: 20-ship sheet used a non-shipping source")
        if item.get("sha256") != sha256(source):
            fail(f"{asset_id}: 20-ship sheet input hash drifted")


def check_ship_stress_coverage(row: dict[str, object]) -> None:
    ids = row.get("identity_ids", [])
    if row.get("kind") != "ship-fleet-alpha-stress-96":
        fail("ship alpha-stress proof kind drifted")
    if not isinstance(ids, list) or set(ids) != set(FLEET_IDS) or len(ids) != len(FLEET_IDS):
        fail("ship alpha-stress proof does not cover all 20 distinct ships")
    if row.get("size_css_px") != 96:
        fail("ship alpha-stress proof must use exact 96 CSS px tokens")
    if row.get("background_modes") != ["representative", "dark", "magenta", "cyan"]:
        fail("ship alpha-stress proof lacks water/dark/magenta/cyan fields")


def check_referenced_image_census(
    registry: dict[str, object],
    additions: dict[str, object],
    public_rows: list[dict[str, object]],
) -> int:
    paths = {
        path.resolve()
        for path in ROOT.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    }
    reference = registry.get("reference", {})
    reviewed = additions.get("reviewed_reference", {})
    paths.add((ROOT / str(reference.get("path", ""))).resolve())
    paths.add((ROOT / str(reviewed.get("path", ""))).resolve())
    for flag in registry.get("proof_only_existing_flags", []):
        paths.add((ROOT / str(flag.get("path", ""))).resolve())
    for row in public_rows:
        paths.add((REPO / str(row.get("public_path", ""))).resolve())
    paths.update(
        {
            (REPO / "apps/web/public/art/tiles/land.png").resolve(),
            (REPO / "apps/web/public/art/tiles/deep.png").resolve(),
        }
    )
    for path in sorted(paths):
        check_file_budget(path, SOURCE_LIMIT, "committed/referenced image census")
    return len(paths)


def check_runtime_captures() -> None:
    capture_root = ROOT / "runtime-captures"
    captures = {path.name: path for path in capture_root.glob("*.jpg")}
    if set(captures) != set(EXPECTED_RUNTIME_CAPTURES):
        fail("runtime capture inventory drifted")
    record = (ROOT / "RUNTIME-CAPTURES.md").read_text()
    for name, (dimensions, byte_count, digest) in EXPECTED_RUNTIME_CAPTURES.items():
        path = captures[name]
        check_file_budget(path, PROOF_LIMIT, "runtime capture")
        if path.stat().st_size != byte_count or sha256(path) != digest:
            fail(f"{name}: runtime capture bytes/hash drifted")
        with Image.open(path) as image:
            if image.format != "JPEG" or image.mode != "RGB" or image.size != dimensions:
                fail(f"{name}: runtime capture format/dimensions drifted")
        if name not in record or digest not in record:
            fail(f"{name}: runtime capture record drifted")


def expect_negative_control(name: str, check) -> None:
    try:
        check()
    except SystemExit as error:
        if not str(error).startswith("FAIL:"):
            raise
        return
    raise AssertionError(f"negative control did not fail: {name}")


def run_negative_controls() -> None:
    with tempfile.TemporaryDirectory(prefix="aop-map-negative-") as temporary:
        oversized = Path(temporary) / "oversized.png"
        oversized.write_bytes(b"x" * (SOURCE_LIMIT + 1))
        expect_negative_control(
            "literal per-image budget",
            lambda: check_file_budget(oversized, SOURCE_LIMIT, "negative oversized image"),
        )

    input_alpha = np.full((2, 2), 255, dtype=np.uint8)
    output_alpha = input_alpha.copy()
    expect_negative_control(
        "nonzero contamination witness",
        lambda: check_contamination_witnesses(
            "party:spanish",
            input_alpha,
            output_alpha,
            ((1, 1), (0, 0)),
            [
                {"x": 1, "y": 1, "source_alpha": 255, "output_alpha": 255},
                {"x": 0, "y": 0, "source_alpha": 255, "output_alpha": 255},
            ],
        ),
    )

    ids = [f"identity:{index}" for index in range(41)]
    fake_rows = {
        asset_id: {"output_256": f"sources/runtime/{index}.webp"}
        for index, asset_id in enumerate(ids)
    }
    expect_negative_control(
        "checkpoint-only/missing runtime identity coverage",
        lambda: check_runtime_sheet_coverage(
            {
                "kind": "runtime-public-contact-sheet",
                "identity_ids": ids[:-2],
                "sizes_css_px": RUNTIME_SIZES,
                "grayscale_factions": FACTIONS,
                "public_binding": "runtime-public-receipt.json byte identity",
                "runtime_inputs": [],
            },
            ids,
            fake_rows,
            expected_kind="runtime-public-contact-sheet",
            label="shipping-41",
        ),
    )
    expect_negative_control(
        "checkpoint-only sheet cannot satisfy runtime evidence",
        lambda: check_runtime_sheet_coverage(
            {
                "kind": "legacy-runtime-public-contact-sheet",
                "identity_ids": ids,
                "sizes_css_px": RUNTIME_SIZES,
                "grayscale_factions": FACTIONS,
                "public_binding": "runtime-public-receipt.json byte identity",
                "runtime_inputs": [],
            },
            ids,
            fake_rows,
            expected_kind="runtime-public-contact-sheet",
            label="shipping-41",
        ),
    )
    expect_negative_control(
        "incomplete ship-fleet matrix",
        lambda: check_ship_fleet_sheet_coverage(
            {
                "kind": "ship-fleet-runtime-contact-sheet",
                "identity_ids": FLEET_IDS[:-1],
                "sizes_css_px": RUNTIME_SIZES,
                "grayscale_identity_ids": FLEET_IDS,
                "public_binding": "runtime-public-receipt.json byte identity",
                "runtime_inputs": [],
            },
            {},
        ),
    )
    print(
        "PASS: negative controls reject oversized images, nonzero witnesses, incomplete "
        "runtime sheets, checkpoint-only evidence, and incomplete ship matrices"
    )


def main() -> None:
    registry = json.loads(REGISTRY.read_text())
    additions = json.loads(ADDITIONS.read_text())
    check_metadata(additions)
    assets = [*registry["assets"], *additions["assets"]]
    ids = [asset["id"] for asset in assets]
    if len(registry["assets"]) != 21 or len(additions["assets"]) != 20:
        fail("runtime family must retain 21 checkpoint assets plus 20 runtime additions")
    if len(ids) != 41 or len(set(ids)) != 41:
        fail(f"expected 41 distinct runtime identities, found {len(ids)}/{len(set(ids))}")
    ship_ids = [asset_id for asset_id in ids if asset_id.startswith("ship:")]
    if set(ship_ids) != set(FLEET_IDS) or len(ship_ids) != len(FLEET_IDS):
        fail("runtime family does not contain exactly all five factions by four ship classes")

    prompts = PROMPTS.read_text()
    for asset in additions["assets"]:
        if f"## {asset['prompt_key']}\n" not in prompts:
            fail(f"{asset['id']}: exact runtime prompt section is missing")
        retained_path = ROOT / asset["retained_source_file"]
        retained = Image.open(retained_path)
        if retained.mode != "RGBA" or retained.getchannel("A").getextrema() != (0, 255):
            fail(f"{asset['id']}: retained generated source is not genuine full-range RGBA")

    polish_receipt = json.loads(POLISH_RECEIPT.read_text())
    if polish_receipt.get("schema") != 3:
        fail("polish receipt must use expanded-fleet schema 3")
    polish_rows = polish_receipt.get("assets", [])
    polish_by_id = {row["id"]: row for row in polish_rows}
    public_receipt = json.loads(PUBLIC_RECEIPT.read_text())
    if public_receipt.get("schema") != 1:
        fail("public receipt schema drifted")
    public_rows = public_receipt.get("assets", [])
    public_by_id = {row["id"]: row for row in public_rows}
    if set(polish_by_id) != set(ids) or len(polish_rows) != len(ids):
        fail("polish receipt does not map exactly one row to every runtime identity")
    if set(public_by_id) != set(ids) or len(public_rows) != len(ids):
        fail("public receipt does not map exactly one row to every runtime identity")

    polish = load_polish_module()
    runtime_total = 0
    for asset in assets:
        asset_id = asset["id"]
        row = polish_by_id[asset_id]
        source_path = ROOT / row["output_512"]
        token_path = ROOT / row["output_256"]
        source = check_rgba(source_path, (512, 512), SOURCE_LIMIT)
        token = check_rgba(token_path, (256, 256), TOKEN_CEILING)
        if token_path.stat().st_size > TOKEN_TARGET:
            fail(f"{asset_id}: ordinary token misses the 128 KiB target")
        if row["output_512_sha256"] != sha256(source_path):
            fail(f"{asset_id}: polished 512 source differs from its receipt")
        if row["output_256_sha256"] != sha256(token_path):
            fail(f"{asset_id}: polished 256 token differs from its receipt")

        if "project_source" in asset:
            input_alpha = np.asarray(Image.open(ROOT / asset["project_source"]).convert("RGBA").getchannel("A"))
        else:
            input_alpha = np.asarray(
                Image.open(ROOT / asset["retained_source_file"]).convert("RGBA").getchannel("A")
            )
        output_alpha = np.asarray(source.getchannel("A"))
        if np.any((input_alpha == 0) & (output_alpha != 0)):
            fail(f"{asset_id}: cleanup introduced nonzero pixels outside the input silhouette")
        removed = (
            row["boundary_pixels_removed"]
            + row["contact_pixels_removed"]
            + row["contamination_pixels_removed"]
        )
        if asset_id in MATTE_REQUIRED_IDS and removed == 0:
            fail(f"{asset_id}: required matte cleanup removed no pixels")
        expected_witnesses = polish.SPECS.get(asset_id, polish.MatteSpec()).contamination_witnesses
        check_contamination_witnesses(
            asset_id,
            input_alpha,
            output_alpha,
            expected_witnesses,
            row.get("contamination_witnesses"),
        )
        if asset_id in CONTAMINATION_REQUIRED_IDS and row["contamination_pixels_removed"] == 0:
            fail(f"{asset_id}: semantic contamination mask removed no new pixels")

        public = public_by_id[asset_id]
        public_path = REPO / public["public_path"]
        if not public_path.is_file() or public_path.read_bytes() != token_path.read_bytes():
            fail(f"{asset_id}: public runtime file is not the byte-identical polished token")
        if public["sha256"] != sha256(public_path) or public["bytes"] != public_path.stat().st_size:
            fail(f"{asset_id}: public receipt hash/bytes drifted")
        runtime_total += public_path.stat().st_size

    expected_proofs = {
        **EXPECTED_PROOFS,
        **{
            f"proofs/matte-stress/matte-full-footprint-512-{asset['prompt_key']}.webp": (
                1024,
                1024,
            )
            for asset in assets
        },
    }
    proof_rows = polish_receipt.get("proofs", [])
    proof_by_path = {row["path"]: row for row in proof_rows}
    if set(proof_by_path) != set(expected_proofs):
        fail("matte/actual-size proof set is incomplete")
    for relative, dimensions in expected_proofs.items():
        path = ROOT / relative
        if not path.is_file() or path.stat().st_size > PROOF_LIMIT:
            fail(f"{relative}: missing or exceeds proof budget")
        if Image.open(path).size != dimensions:
            fail(f"{relative}: dimensions drifted")
        if proof_by_path[relative]["sha256"] != sha256(path):
            fail(f"{relative}: differs from polish receipt")
        if proof_by_path[relative]["bytes"] != path.stat().st_size:
            fail(f"{relative}: byte receipt drifted")
    legacy_ids = ids[:23]
    check_runtime_sheet_coverage(
        proof_by_path["proofs/matte-stress/runtime-public-contact-sheet-23.webp"],
        legacy_ids,
        polish_by_id,
        expected_kind="legacy-runtime-public-contact-sheet",
        label="legacy-23",
    )
    check_runtime_sheet_coverage(
        proof_by_path["proofs/matte-stress/runtime-public-contact-sheet-41.webp"],
        ids,
        polish_by_id,
        expected_kind="runtime-public-contact-sheet",
        label="shipping-41",
    )
    check_ship_fleet_sheet_coverage(
        proof_by_path["proofs/matte-stress/ship-fleet-runtime-contact-sheet-20.webp"],
        polish_by_id,
    )
    check_ship_stress_coverage(
        proof_by_path["proofs/matte-stress/ship-fleet-alpha-stress-96-all.webp"]
    )
    check_runtime_captures()

    image_count = check_referenced_image_census(registry, additions, public_rows)

    critical_urls = [
        "art/tiles/land.png",
        "art/tiles/port.png",
        *[f"art/cities/{name}.webp" for name in ("british", "dutch", "french", "pirates", "spanish", "neutral")],
        *[f"art/encounters/{name}" for name in ("merchant-v2.webp", "natives-v2.webp", "settlers-v2.webp", "native-village.webp", "hermit.webp", "bandit-camp.webp")],
        *[f"art/sites/{name}.webp" for name in ("mine", "sawmill", "lumber-camp", "ruins")],
        *[f"art/parties/{name}.webp" for name in ("british", "dutch", "french", "pirates", "spanish")],
        *[f"art/factions/{name}/flag.png" for name in ("british", "dutch", "french", "pirates", "spanish")],
        *[
            str(public_by_id[asset_id]["public_path"]).removeprefix("apps/web/public/")
            for asset_id in FLEET_IDS
        ],
    ]
    critical_bytes = sum((REPO / "apps" / "web" / "public" / url).stat().st_size for url in critical_urls)
    if critical_bytes > CRITICAL_LIMIT:
        fail(f"conservative all-family initial critical set is {critical_bytes} bytes > 3 MiB")

    subprocess.run([sys.executable, str(ROOT / "tools" / "validate_checkpoint.py")], check=True)
    subprocess.run(
        [sys.executable, str(ROOT / "tools" / "polish_runtime_sources.py"), "--check"], check=True
    )
    print(
        f"PASS: 41 runtime identities including all 20 faction/class ships, real alpha/matte/"
        f"privacy sentinels, public copies, expanded runtime proofs, and {image_count} committed/"
        f"referenced image budgets; runtime={runtime_total} bytes critical={critical_bytes} bytes"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--negative-controls", action="store_true")
    arguments = parser.parse_args()
    if arguments.negative_controls:
        run_negative_controls()
    else:
        main()
