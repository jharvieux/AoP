#!/usr/bin/env python3
"""Fail-loud validation for issue #609's runtime art delivery."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
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


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


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
    if not path.is_file():
        fail(f"missing {path}")
    if path.stat().st_size > byte_limit:
        fail(f"{path}: {path.stat().st_size} bytes exceeds {byte_limit}")
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
        raw_path = ROOT / asset["raw_file"]
        if not raw_path.is_file() or sha256(raw_path) != asset["raw_sha256"]:
            fail(f"{asset['id']}: raw generated source missing or hash drifted")
        raw = Image.open(raw_path)
        if raw.mode != "RGBA" or raw.getchannel("A").getextrema() != (0, 255):
            fail(f"{asset['id']}: generated source is not genuine full-range RGBA")

    polish_rows = json.loads(POLISH_RECEIPT.read_text()).get("assets", [])
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
            normalized = polish.normalize_generated_alpha(Image.open(ROOT / asset["raw_file"]), asset_id)
            input_alpha = np.asarray(normalized.getchannel("A"))
        output_alpha = np.asarray(source.getchannel("A"))
        if np.any((input_alpha == 0) & (output_alpha != 0)):
            fail(f"{asset_id}: cleanup introduced nonzero pixels outside the input silhouette")
        if asset_id in MATTE_REQUIRED_IDS and row["boundary_pixels_removed"] + row["contact_pixels_removed"] == 0:
            fail(f"{asset_id}: required matte cleanup removed no pixels")

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
    proof_rows = json.loads(POLISH_RECEIPT.read_text()).get("proofs", [])
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
        f"and budgets; runtime={runtime_total} bytes critical={critical_bytes} bytes"
    )


if __name__ == "__main__":
    main()
