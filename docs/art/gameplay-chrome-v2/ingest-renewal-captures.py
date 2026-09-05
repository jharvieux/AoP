#!/usr/bin/env python3
"""Create unapproved true-PNG candidates without touching historical approved pixels."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import os
import struct
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops


SOURCE_HEAD = "c1824f22bf14dca6d38f7519fd99affd789a8130"
CONFIRMATION = "PREPARE_UNAPPROVED_RENEWAL"
MAX_BYTES = 300 * 1024
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

SCRIPT = Path(__file__).resolve()
REPOSITORY = SCRIPT.parents[3]
CHROME_ROOT = SCRIPT.parent
TERRAIN_ROOT = REPOSITORY / "docs/art/world-map-v2/terrain"
RECEIPT_PATH = CHROME_ROOT / "renewal-candidates/INGESTION.json"


@dataclass(frozen=True)
class CaptureSpec:
    group: str
    raw_name: str
    output_name: str
    dimensions: tuple[int, int]
    color_type: int | None
    palette_colors: int | None

    @property
    def raw_relative(self) -> Path:
        return Path(self.group) / self.raw_name

    @property
    def output(self) -> Path:
        root = CHROME_ROOT if self.group == "gameplay-chrome-v2" else TERRAIN_ROOT
        return root / "renewal-candidates" / self.output_name

    @property
    def historical(self) -> Path:
        root = CHROME_ROOT if self.group == "gameplay-chrome-v2" else TERRAIN_ROOT
        return root / "runtime-captures" / self.output_name


SPECS = (
    CaptureSpec(
        "gameplay-chrome-v2",
        "runtime-phone-world-375x812.jpg",
        "runtime-phone-world-375x812.png",
        (375, 812),
        2,
        None,
    ),
    CaptureSpec(
        "gameplay-chrome-v2",
        "runtime-city-inspector-1440x900.jpg",
        "runtime-city-inspector-1440x900.png",
        (1440, 900),
        3,
        40,
    ),
    CaptureSpec(
        "gameplay-chrome-v2",
        "runtime-interaction-states-1440x960.jpg",
        "runtime-interaction-states-1440x960.png",
        (1440, 960),
        3,
        40,
    ),
    *(
        CaptureSpec(
            "world-map-terrain-v2",
            f"{name}.jpg",
            f"{name}.png",
            dimensions,
            None,
            -1,
        )
        for name, dimensions in (
            ("desktop-overview", (1440, 900)),
            ("desktop-tactical", (1440, 900)),
            ("desktop-detail", (1440, 900)),
            ("phone-overview", (390, 844)),
            ("phone-tactical", (390, 844)),
            ("phone-detail", (390, 844)),
        )
    ),
)


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def require_regular(path: Path) -> bytes:
    assert path.is_file() and not path.is_symlink(), f"expected regular file: {path}"
    return path.read_bytes()


def png_header(value: bytes) -> tuple[int, int, int]:
    assert value.startswith(PNG_SIGNATURE), "encoded candidate is not a true PNG"
    assert value[12:16] == b"IHDR", "encoded candidate has no PNG IHDR"
    return struct.unpack(">II", value[16:24]) + (value[25],)


def encode_png(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True, compress_level=9)
    return output.getvalue()


def rmse(reference: Image.Image, candidate: Image.Image) -> float:
    difference = ImageChops.difference(reference.convert("RGB"), candidate.convert("RGB"))
    squared_sum = 0
    sample_count = reference.width * reference.height * 3
    for channel in difference.split():
        squared_sum += sum(index * index * count for index, count in enumerate(channel.histogram()))
    return math.sqrt(squared_sum / sample_count)


def encode_candidate(image: Image.Image, spec: CaptureSpec) -> tuple[bytes, int | None, float]:
    rgb = image.convert("RGB")
    if spec.color_type == 2:
        encoded = encode_png(rgb)
        return encoded, None, 0.0

    palette_options = (
        (spec.palette_colors,)
        if spec.palette_colors and spec.palette_colors > 0
        else (256, 192, 160, 128, 96, 80, 64, 48, 40)
    )
    for colors in palette_options:
        quantized = rgb.quantize(
            colors=colors,
            method=Image.Quantize.FASTOCTREE,
            dither=Image.Dither.NONE,
        )
        encoded = encode_png(quantized)
        if len(encoded) <= MAX_BYTES:
            return encoded, colors, rmse(rgb, quantized)
    raise AssertionError(f"{spec.output_name}: no deterministic palette meets 300 KiB")


def historical_pixel_hashes() -> set[str]:
    hashes: set[str] = set()
    for spec in SPECS:
        with Image.open(spec.historical) as image:
            hashes.add(sha256(image.convert("RGB").tobytes()))
    return hashes


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage-root", required=True, type=Path)
    parser.add_argument("--source-head", required=True)
    parser.add_argument("--confirmation", required=True)
    parser.add_argument("--captured-on", required=True)
    arguments = parser.parse_args()

    assert arguments.source_head == SOURCE_HEAD, "capture source head drift"
    assert arguments.confirmation == CONFIRMATION, "explicit unapproved-proposal confirmation missing"
    assert len(arguments.captured_on) == 10, "captured-on must use YYYY-MM-DD"

    stage = arguments.stage_root.resolve(strict=True)
    assert stage.is_dir() and not stage.is_symlink(), "stage root must be a real directory"
    assert REPOSITORY not in stage.parents and stage != REPOSITORY, "stage root must be outside repository"
    expected_raw = {spec.raw_relative for spec in SPECS}
    observed_raw = {
        path.relative_to(stage)
        for path in stage.rglob("*")
        if path.is_file() or path.is_symlink()
    }
    assert observed_raw == expected_raw, (
        f"raw capture inventory drift: missing={sorted(expected_raw - observed_raw)}, "
        f"extra={sorted(observed_raw - expected_raw)}"
    )

    old_pixels = historical_pixel_hashes()
    records = []
    for spec in SPECS:
        raw_path = stage / spec.raw_relative
        raw = require_regular(raw_path)
        with Image.open(io.BytesIO(raw)) as opened:
            opened.load()
            assert opened.size == spec.dimensions, (
                f"{spec.raw_relative}: expected {spec.dimensions}, got {opened.size}"
            )
            rgb = opened.convert("RGB")
            decoded_hash = sha256(rgb.tobytes())
            assert decoded_hash not in old_pixels, f"{spec.raw_relative}: stale historical pixels"
            first, colors, measured_rmse = encode_candidate(rgb, spec)
            second, second_colors, second_rmse = encode_candidate(rgb, spec)
        assert first == second and colors == second_colors and measured_rmse == second_rmse, (
            f"{spec.output_name}: PNG encoding is not deterministic"
        )
        width, height, color_type = png_header(first)
        assert (width, height) == spec.dimensions, f"{spec.output_name}: PNG dimension drift"
        if spec.color_type is not None:
            assert color_type == spec.color_type, (
                f"{spec.output_name}: expected PNG color type {spec.color_type}, got {color_type}"
            )
        assert len(first) <= MAX_BYTES, f"{spec.output_name}: exceeds 300 KiB"
        assert sha256(first) != sha256(require_regular(spec.historical)), (
            f"{spec.output_name}: candidate duplicates historical capture bytes"
        )
        spec.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = spec.output.with_suffix(".tmp")
        temporary.write_bytes(first)
        os.replace(temporary, spec.output)
        records.append(
            {
                "set": spec.group,
                "raw_path": str(spec.raw_relative),
                "raw_format": opened.format,
                "raw_bytes": len(raw),
                "raw_sha256": sha256(raw),
                "decoded_rgb_sha256": decoded_hash,
                "path": str(spec.output.relative_to(REPOSITORY)),
                "dimensions": list(spec.dimensions),
                "png_color_type": color_type,
                "palette_colors": colors,
                "rgb_rmse": round(measured_rmse, 6),
                "bytes": len(first),
                "sha256": sha256(first),
            }
        )

    receipt = {
        "schema": "aop-cross-evidence-ingestion-v1",
        "issue": 613,
        "status": "unapproved-candidates",
        "approval_record": None,
        "source_head": SOURCE_HEAD,
        "captured_on": arguments.captured_on,
        "pillow_version": Image.__version__,
        "policy": (
            "Historical pixels remain untouched. Chrome requires PNG color type 2/3/3; "
            "terrain uses the highest deterministic FASTOCTREE palette that stays at or below 300 KiB."
        ),
        "captures": records,
    }
    serialised = json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode()
    receipt["ingestion_digest"] = sha256(serialised)
    RECEIPT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RECEIPT_PATH.write_text(json.dumps(receipt, indent=2) + "\n")
    print(
        f"ingested {len(records)} fresh true-PNG candidates; "
        f"digest {receipt['ingestion_digest']}; historical captures untouched"
    )


if __name__ == "__main__":
    main()
