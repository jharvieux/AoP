#!/usr/bin/env python3
"""Fail-loud validation for the issue #609 checkpoint-1 art package."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "asset-registry.json"
PROMPTS = ROOT / "PROMPTS.md"
RECEIPT = ROOT / "sources" / "selected" / "normalization-receipt.json"
TOKEN_LIMIT = 128 * 1024
SOURCE_LIMIT = 300 * 1024
PROOF_LIMIT = 300 * 1024
EXPECTED_COUNTS = Counter({"cities": 6, "ships": 2, "parties": 5, "encounters": 4, "sites": 4})
EXPECTED_PROOFS = {
    "proofs/token-contact-sheet-2400x3108.webp": (2400, 3108),
    "proofs/faction-color-grayscale-2200x1800.webp": (2200, 1800),
    "proofs/fog-truth-2100x1040.webp": (2100, 1040),
}


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_rgba(path: Path, size: tuple[int, int], byte_limit: int) -> None:
    if not path.is_file():
        fail(f"missing {path.relative_to(ROOT)}")
    if path.stat().st_size > byte_limit:
        fail(f"{path.relative_to(ROOT)} is {path.stat().st_size} bytes > {byte_limit}")
    image = Image.open(path)
    if image.mode != "RGBA":
        fail(f"{path.relative_to(ROOT)} mode is {image.mode}, expected RGBA")
    if image.size != size:
        fail(f"{path.relative_to(ROOT)} size is {image.size}, expected {size}")
    low, high = image.getchannel("A").getextrema()
    if low != 0 or high != 255:
        fail(f"{path.relative_to(ROOT)} alpha extrema are {(low, high)}, expected (0, 255)")
    alpha = image.getchannel("A")
    histogram = alpha.histogram()
    pixels = image.width * image.height
    transparent = sum(histogram[:8]) / pixels
    opaque = sum(histogram[248:]) / pixels
    if transparent < 0.10 or opaque < 0.05:
        fail(f"{path.relative_to(ROOT)} suspicious alpha coverage transparent={transparent:.3f} opaque={opaque:.3f}")
    bbox = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
    if bbox is None:
        fail(f"{path.relative_to(ROOT)} has no visible pixels")
    margin = min(bbox[0], bbox[1], image.width - bbox[2], image.height - bbox[3])
    if margin < round(image.width * 0.10):
        fail(f"{path.relative_to(ROOT)} optical safety margin {margin}px is below 10%")


def main() -> None:
    registry = json.loads(REGISTRY.read_text())
    if registry.get("model") is not None or registry.get("seed") is not None:
        fail("model/seed must remain null because built-in imagegen did not expose them")
    if registry.get("interface_model_exposed") is not False or registry.get("interface_seed_exposed") is not False:
        fail("interface exposure flags must record that model and seed were unavailable")
    reference = registry.get("reference", {})
    reference_path = ROOT / reference.get("path", "")
    if not reference_path.is_file() or sha256(reference_path) != reference.get("sha256"):
        fail("Direction B generation reference is missing or its hash drifted")
    for flag in registry.get("proof_only_existing_flags", []):
        flag_path = ROOT / flag.get("path", "")
        if not flag_path.is_file() or sha256(flag_path) != flag.get("sha256"):
            fail(f"proof-only {flag.get('faction', 'unknown')} flag is missing or its hash drifted")
    assets = registry.get("assets", [])
    if len(assets) != 21:
        fail(f"expected 21 assets, found {len(assets)}")
    counts = Counter(asset["category"] for asset in assets)
    if counts != EXPECTED_COUNTS:
        fail(f"category counts {dict(counts)} != {dict(EXPECTED_COUNTS)}")
    ids = [asset["id"] for asset in assets]
    if len(ids) != len(set(ids)):
        fail("duplicate asset IDs")
    prompts = PROMPTS.read_text()
    receipt_rows = json.loads(RECEIPT.read_text()).get("assets", [])
    receipt_by_id = {row.get("id"): row for row in receipt_rows}
    if len(receipt_rows) != len(receipt_by_id) or set(receipt_by_id) != set(ids):
        fail("normalization receipt does not map exactly one row to every asset")
    for asset in assets:
        for field in ("prompt_key", "raw_sha256", "project_source", "token", "anchor", "context"):
            if not asset.get(field):
                fail(f"{asset['id']} lacks {field}")
        if len(asset["raw_sha256"]) != 64:
            fail(f"{asset['id']} has malformed raw source hash")
        if f"## {asset['prompt_key']}\n" not in prompts:
            fail(f"{asset['id']} has no exact prompt section")
        source_path = ROOT / asset["project_source"]
        receipt = receipt_by_id[asset["id"]]
        expected_input_hash = asset.get("preferred_raw_sha256", asset["raw_sha256"])
        if receipt.get("input_sha256") != expected_input_hash:
            fail(f"{asset['id']} normalization input hash does not match its selected raw source")
        if receipt.get("output") != asset["project_source"]:
            fail(f"{asset['id']} normalization output path drifted")
        if receipt.get("output_sha256") != sha256(source_path) or receipt.get("bytes") != source_path.stat().st_size:
            fail(f"{asset['id']} normalized source differs from its receipt")
        check_rgba(source_path, (512, 512), SOURCE_LIMIT)
        check_rgba(ROOT / asset["token"], (256, 256), TOKEN_LIMIT)

    coverage_path = ROOT / "proofs" / "coverage.json"
    coverage = json.loads(coverage_path.read_text())
    if coverage.get("sizes") != [24, 32, 48, 96]:
        fail("contact-sheet sizes must be exactly 24, 32, 48, 96")
    covered = {row["id"]: row for row in coverage.get("assets", [])}
    if set(covered) != set(ids):
        fail("contact-sheet asset coverage does not match registry")
    for asset_id, row in covered.items():
        sizes = [cell["size"] for cell in row["cells"]]
        if sizes != [24, 32, 48, 96]:
            fail(f"{asset_id} contact-sheet size coverage is {sizes}")
        frontier = [cell for cell in row["cells"] if cell["context"] == "fog-frontier-visible-side"]
        if len(frontier) != 1 or not frontier[0]["token_drawn"]:
            fail(f"{asset_id} lacks one visible-side fog-frontier proof")
    grayscale = set(coverage.get("grayscale_ids", []))
    faction_ids = {asset["id"] for asset in assets if asset.get("faction") and asset["faction"] != "neutral"}
    faction_ids.add("city:neutral")
    if grayscale != faction_ids:
        fail("grayscale proof does not cover every city, faction party, and representative ship")
    fog_rows = coverage.get("fog_examples", [])
    fog_counts = Counter(row["state"] for row in fog_rows)
    if fog_counts != Counter({"visible": 5, "frontier": 5, "hidden": 5}):
        fail(f"fog-state coverage is {dict(fog_counts)}")
    if any(row["token_drawn"] for row in fog_rows if row["state"] == "hidden"):
        fail("hidden fog example draws an entity")

    for relative, dimensions in EXPECTED_PROOFS.items():
        path = ROOT / relative
        if not path.is_file():
            fail(f"missing {relative}")
        if path.stat().st_size > PROOF_LIMIT:
            fail(f"{relative} exceeds the 300 KiB proof ceiling")
        image = Image.open(path)
        if image.size != dimensions:
            fail(f"{relative} dimensions {image.size} != {dimensions}")

    subprocess.run([sys.executable, str(ROOT / "tools" / "compose_checkpoint.py"), "--check"], check=True)
    print("PASS: 21/21 RGBA tokens, all size/grayscale/fog coverage, budgets, and deterministic bytes")
    for asset in assets:
        path = ROOT / asset["token"]
        print(f"{asset['id']}: {path.stat().st_size} bytes sha256={sha256(path)[:12]}")


if __name__ == "__main__":
    main()
