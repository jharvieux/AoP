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
    "proofs/matte-stress/matte-stress-512-page-4.webp": (1120, 558),
    "proofs/matte-stress/matte-stress-96-all.webp": (1092, 568),
    "proofs/matte-stress/matte-full-footprint-96-all.webp": (590, 2424),
    "proofs/matte-stress/faction-marker-24-color-grayscale.webp": (850, 310),
    "proofs/matte-stress/runtime-public-contact-sheet-23.webp": (1024, 2992),
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
IMAGE_SUFFIXES = {".png", ".webp", ".jpg", ".jpeg"}
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


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_file_budget(path: Path, byte_limit: int, role: str) -> None:
    if not path.is_file():
        fail(f"{role}: missing {path}")
    if path.stat().st_size > byte_limit:
        fail(f"{role}: {path} is {path.stat().st_size} bytes, exceeds {byte_limit}")


def load_polish_module():
    path = ROOT / "tools" / "polish_runtime_sources.py"
    spec = importlib.util.spec_from_file_location("aop_map_polish", path)
    if spec is None or spec.loader is None:
        fail("could not load polish_runtime_sources.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


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
        fail("runtime additions must truthfully record that no image was attached to generation")
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

    assets = additions.get("assets", [])
    if not isinstance(assets, list) or {asset.get("id") for asset in assets} != set(UNRETAINED_ORIGINALS):
        fail("runtime additions must map exactly the two generated sea replacements")
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

        original = asset.get("unretained_original", {})
        expected = UNRETAINED_ORIGINALS[asset_id]
        if not isinstance(original, dict) or original.get("retained") is not False:
            fail(f"{asset_id}: original byte stream must be truthfully marked unretained")
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
        if original.get("sha256") == asset.get("retained_source_sha256"):
            fail(f"{asset_id}: retained and original-unretained hashes are ambiguously identical")


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
) -> None:
    if row.get("kind") != "runtime-public-contact-sheet":
        fail("runtime contact sheet is not marked as production/public evidence")
    if row.get("identity_ids") != ids:
        fail("runtime contact sheet does not cover all 23 shipping identities in registry order")
    if row.get("sizes_css_px") != RUNTIME_SIZES:
        fail("runtime contact sheet must show exact 24/32/48/96 CSS pixel sizes")
    if row.get("grayscale_factions") != FACTIONS:
        fail("runtime contact sheet lacks the five-faction grayscale comparison")
    if row.get("public_binding") != "runtime-public-receipt.json byte identity":
        fail("runtime contact sheet lacks an explicit public-receipt byte binding")
    runtime_inputs = row.get("runtime_inputs", [])
    if not isinstance(runtime_inputs, list) or [item.get("id") for item in runtime_inputs] != ids:
        fail("runtime contact sheet input list is not the complete shipping identity set")
    for item in runtime_inputs:
        asset_id = str(item["id"])
        source = ROOT / str(item.get("source", ""))
        if source != ROOT / str(polish_by_id[asset_id]["output_256"]):
            fail(f"{asset_id}: runtime contact sheet used a non-shipping source")
        if item.get("sha256") != sha256(source):
            fail(f"{asset_id}: runtime contact-sheet input hash drifted")


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

    ids = [f"identity:{index}" for index in range(23)]
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
        ),
    )
    print("PASS: negative controls reject oversized images, nonzero witnesses, and incomplete runtime sheets")


def main() -> None:
    registry = json.loads(REGISTRY.read_text())
    additions = json.loads(ADDITIONS.read_text())
    check_metadata(additions)
    assets = [*registry["assets"], *additions["assets"]]
    ids = [asset["id"] for asset in assets]
    if len(ids) != 23 or len(set(ids)) != 23:
        fail(f"expected 23 distinct runtime identities, found {len(ids)}/{len(set(ids))}")

    prompts = PROMPTS.read_text()
    for asset in additions["assets"]:
        if f"## {asset['prompt_key']}\n" not in prompts:
            fail(f"{asset['id']}: exact runtime prompt section is missing")
        retained_path = ROOT / asset["retained_source_file"]
        retained = Image.open(retained_path)
        if retained.mode != "RGBA" or retained.getchannel("A").getextrema() != (0, 255):
            fail(f"{asset['id']}: retained generated source is not genuine full-range RGBA")

    polish_receipt = json.loads(POLISH_RECEIPT.read_text())
    if polish_receipt.get("schema") != 2:
        fail("polish receipt must use semantic-witness schema 2")
    polish_rows = polish_receipt.get("assets", [])
    polish_by_id = {row["id"]: row for row in polish_rows}
    public_rows = json.loads(PUBLIC_RECEIPT.read_text()).get("assets", [])
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
    runtime_sheet = proof_by_path["proofs/matte-stress/runtime-public-contact-sheet-23.webp"]
    check_runtime_sheet_coverage(runtime_sheet, ids, polish_by_id)

    image_count = check_referenced_image_census(registry, additions, public_rows)

    critical_urls = [
        "art/tiles/land.png",
        "art/tiles/port.png",
        *[f"art/cities/{name}.webp" for name in ("british", "dutch", "french", "pirates", "spanish", "neutral")],
        *[f"art/encounters/{name}" for name in ("merchant-v2.webp", "natives-v2.webp", "settlers-v2.webp", "native-village.webp", "hermit.webp", "bandit-camp.webp")],
        *[f"art/sites/{name}.webp" for name in ("mine", "sawmill", "lumber-camp", "ruins")],
        *[f"art/parties/{name}.webp" for name in ("british", "dutch", "french", "pirates", "spanish")],
        *[f"art/factions/{name}/flag.png" for name in ("british", "dutch", "french", "pirates", "spanish")],
        "art/factions/british/ship_sloop.webp",
        "art/factions/pirates/ship_galleon_v2.webp",
        *[f"art/factions/{name}/ship.png" for name in ("dutch", "french", "spanish")],
    ]
    critical_bytes = sum((REPO / "apps" / "web" / "public" / url).stat().st_size for url in critical_urls)
    if critical_bytes > CRITICAL_LIMIT:
        fail(f"conservative all-family initial critical set is {critical_bytes} bytes > 3 MiB")

    subprocess.run([sys.executable, str(ROOT / "tools" / "validate_checkpoint.py")], check=True)
    subprocess.run(
        [sys.executable, str(ROOT / "tools" / "polish_runtime_sources.py"), "--check"], check=True
    )
    print(
        f"PASS: 23 runtime identities, real alpha/matte/privacy sentinels, public copies, proofs, "
        f"and {image_count} committed/referenced image budgets; runtime={runtime_total} bytes "
        f"critical={critical_bytes} bytes"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--negative-controls", action="store_true")
    arguments = parser.parse_args()
    if arguments.negative_controls:
        run_negative_controls()
    else:
        main()
