#!/usr/bin/env python3
"""Fail-loud structural checks for the issue #607 visual-direction package."""

import re
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 300 * 1024

DIRECTION_FILES = {
    "world-map-desktop-1440x900.webp": (1440, 900),
    "world-map-tablet-768x1024.webp": (768, 1024),
    "world-map-phone-375x812.webp": (375, 812),
    "city-desktop-1440x900.webp": (1440, 900),
    "city-tablet-768x1024.webp": (768, 1024),
    "city-phone-375x812.webp": (375, 812),
    "city-start-mid-full-1440x560.webp": (1440, 560),
    "direction-summary-1600x1040.webp": (1600, 1040),
}

SHARED_FILES = {
    "candidates/comparison-contact-sheet-1600x1160.webp": (1600, 1160),
    "candidates/rejected-generation-contact-sheet-1600x930.webp": (1600, 930),
    "contracts/city-scale-depth-anchor-1600x1000.webp": (1600, 1000),
    "contracts/map-token-lod-1600x930.webp": (1600, 930),
    "contracts/readability-grayscale-1600x1030.webp": (1600, 1030),
    "contracts/visual-system-1600x1040.webp": (1600, 1040),
}

DOCS = ["README.md", "VISUAL-BIBLE.md", "RUNTIME-SPEC.md", "PROMPTS.md", "MANIFEST.md"]
LINK = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")


def check_image(path: Path, expected_size: tuple[int, int]) -> None:
    if not path.is_file() or path.is_symlink():
        raise AssertionError(f"missing or non-regular image: {path.relative_to(ROOT)}")
    with Image.open(path) as image:
        if image.format != "WEBP":
            raise AssertionError(f"not WebP: {path.relative_to(ROOT)}")
        if image.size != expected_size:
            raise AssertionError(
                f"wrong size: {path.relative_to(ROOT)} {image.size} != {expected_size}"
            )
        if image.mode != "RGB":
            raise AssertionError(f"wrong mode: {path.relative_to(ROOT)} {image.mode} != RGB")
        image.verify()
    if path.stat().st_size >= MAX_BYTES:
        raise AssertionError(
            f"review image exceeds 300 KiB comparison ceiling: {path.relative_to(ROOT)}"
        )


def main() -> None:
    checked = 0
    sources = sorted((ROOT / "sources").glob("*.webp"))
    if len(sources) != 17:
        raise AssertionError(f"expected 17 retained sources, found {len(sources)}")
    for path in sources:
        check_image(path, (1024, 704))
        checked += 1
    for direction in ("a", "b"):
        folder = ROOT / "candidates" / f"direction-{direction}"
        actual = {path.name for path in folder.glob("*.webp")}
        if actual != set(DIRECTION_FILES):
            raise AssertionError(
                f"direction {direction} file set mismatch: {sorted(actual ^ set(DIRECTION_FILES))}"
            )
        for filename, size in DIRECTION_FILES.items():
            check_image(folder / filename, size)
            checked += 1
    for relative, size in SHARED_FILES.items():
        check_image(ROOT / relative, size)
        checked += 1
    for filename in DOCS:
        document = ROOT / filename
        if not document.is_file():
            raise AssertionError(f"missing document: {filename}")
        for target in LINK.findall(document.read_text()):
            if target.startswith(("http://", "https://", "#")):
                continue
            relative = target.split("#", 1)[0]
            if not (document.parent / relative).is_file():
                raise AssertionError(f"broken link in {filename}: {target}")
    manifest = (ROOT / "MANIFEST.md").read_text()
    if "NOT OPERATOR-APPROVED" not in manifest or "Current record: NOT APPROVED" not in manifest:
        raise AssertionError("manifest must keep the approval gate fail-loud")
    compositor = (ROOT / "tools" / "compose_styleframes.py").read_text()
    forbidden_glyphs = {
        "anchor": chr(0x2693),
        "house": chr(0x2302),
        "fit": chr(0x25CE),
        "check": chr(0x2713),
    }
    present = [name for name, glyph in forbidden_glyphs.items() if glyph in compositor]
    if present:
        raise AssertionError(f"font-dependent chrome glyphs remain: {', '.join(present)}")
    required_icons = {"fleet", "city", "course", "zoom_in", "zoom_out", "overview", "end_turn"}
    missing = [name for name in sorted(required_icons) if f'"{name}"' not in compositor]
    if missing:
        raise AssertionError(f"core maritime icon definitions missing: {', '.join(missing)}")
    print(f"validated {checked} WebP files: 17 sources + 22 review outputs")
    print("validated 5 required documents, local icon family, and unapproved operator gate")


if __name__ == "__main__":
    main()
