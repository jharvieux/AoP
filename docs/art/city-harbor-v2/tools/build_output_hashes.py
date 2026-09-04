#!/usr/bin/env python3
"""Hash every retained #608 production output for later drift validation."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


PACKAGE = Path(__file__).resolve().parents[1]
REPOSITORY = PACKAGE.parents[2]
RUNTIME = REPOSITORY / "apps/web/public/art/city"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def files() -> list[Path]:
    retained = []
    for directory in (PACKAGE / "cutouts", PACKAGE / "layers", PACKAGE / "proofs"):
        retained.extend(directory.rglob("*.webp"))
    retained.extend(RUNTIME.glob("*.webp"))
    retained.extend((PACKAGE / "sources/backdrop-detail-inputs").glob("*.webp"))
    retained.extend((PACKAGE / "sources/backdrop-detail-tiles").glob("*-r2.webp"))
    retained.extend((PACKAGE / "sources/townhall-detail-inputs").glob("*.webp"))
    retained.extend((PACKAGE / "sources/townhall-detail-outputs").glob("*.webp"))
    retained.append(PACKAGE / "sources/townhall-source-r3.webp")
    return sorted(set(retained))


def main() -> None:
    output = PACKAGE / "PRODUCTION-OUTPUT-HASHES.json"
    payload = {
        "schema": 1,
        "date": "2026-09-03",
        "files": [
            {
                "path": str(path.relative_to(REPOSITORY)),
                "sha256": sha256(path),
                "bytes": path.stat().st_size,
            }
            for path in files()
        ],
    }
    output.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"hashed {len(payload['files'])} retained production files")


if __name__ == "__main__":
    main()
