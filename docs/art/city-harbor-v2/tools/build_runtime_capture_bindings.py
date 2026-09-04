#!/usr/bin/env python3
"""Bind live city captures to the exact shipping consumer sources."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

from PIL import Image


PACKAGE = Path(__file__).resolve().parents[1]
REPOSITORY = PACKAGE.parents[2]
SHIPPING_SOURCES = (
    "apps/web/src/CityScene.tsx",
    "apps/web/src/citySceneLayout.json",
    "apps/web/src/styles.css",
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    captures = []
    for path in sorted((PACKAGE / "runtime-captures").glob("*.jpg")):
        with Image.open(path) as image:
            assert image.format == "JPEG" and image.mode == "RGB"
            dimensions = list(image.size)
        captures.append(
            {
                "path": str(path.relative_to(PACKAGE)),
                "dimensions": dimensions,
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            }
        )

    payload = {
        "schema": 1,
        "date": date.today().isoformat(),
        "shipping_sources": [
            {"path": relative, "sha256": sha256(REPOSITORY / relative)}
            for relative in SHIPPING_SOURCES
        ],
        "captures": captures,
    }
    output = PACKAGE / "RUNTIME-CAPTURE-BINDINGS.json"
    output.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"bound {len(captures)} captures to {len(SHIPPING_SOURCES)} shipping sources")


if __name__ == "__main__":
    main()
