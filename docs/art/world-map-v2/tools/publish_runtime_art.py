#!/usr/bin/env python3
"""Copy the approved matte-cleaned candidates into their runtime URL paths."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[2]
SOURCE_DIR = ROOT / "sources" / "runtime"
RECEIPT = ROOT / "runtime-public-receipt.json"

PUBLIC_PATHS = {
    "city:british": "apps/web/public/art/cities/british.webp",
    "city:dutch": "apps/web/public/art/cities/dutch.webp",
    "city:french": "apps/web/public/art/cities/french.webp",
    "city:pirates": "apps/web/public/art/cities/pirates.webp",
    "city:spanish": "apps/web/public/art/cities/spanish.webp",
    "city:neutral": "apps/web/public/art/cities/neutral.webp",
    "ship:british:sloop": "apps/web/public/art/factions/british/ship_sloop.webp",
    "ship:pirates:galleon": "apps/web/public/art/factions/pirates/ship_galleon_v2.webp",
    "party:british": "apps/web/public/art/parties/british.webp",
    "party:dutch": "apps/web/public/art/parties/dutch.webp",
    "party:french": "apps/web/public/art/parties/french.webp",
    "party:pirates": "apps/web/public/art/parties/pirates.webp",
    "party:spanish": "apps/web/public/art/parties/spanish.webp",
    "encounter:merchant": "apps/web/public/art/encounters/merchant-v2.webp",
    "encounter:natives": "apps/web/public/art/encounters/natives-v2.webp",
    "encounter:settlers": "apps/web/public/art/encounters/settlers-v2.webp",
    "encounter:nativeVillage": "apps/web/public/art/encounters/native-village.webp",
    "encounter:hermit": "apps/web/public/art/encounters/hermit.webp",
    "encounter:banditCamp": "apps/web/public/art/encounters/bandit-camp.webp",
    "landSite:mine": "apps/web/public/art/sites/mine.webp",
    "landSite:sawmill": "apps/web/public/art/sites/sawmill.webp",
    "landSite:lumberCamp": "apps/web/public/art/sites/lumber-camp.webp",
    "landSite:ruins": "apps/web/public/art/sites/ruins.webp",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    registry = json.loads((ROOT / "asset-registry.json").read_text())
    additions = json.loads((ROOT / "runtime-additions.json").read_text())
    assets = [*registry["assets"], *additions["assets"]]
    ids = {asset["id"] for asset in assets}
    if ids != set(PUBLIC_PATHS):
        raise ValueError("public-path map must cover every checkpoint and runtime identity")

    rows: list[dict[str, object]] = []
    for asset in assets:
        asset_id = str(asset["id"])
        source = SOURCE_DIR / f"{asset['prompt_key']}-256.webp"
        destination = REPO / PUBLIC_PATHS[asset_id]
        if not source.is_file():
            raise FileNotFoundError(source)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        if source.read_bytes() != destination.read_bytes():
            raise ValueError(f"{destination}: runtime copy differs from polished candidate")
        rows.append(
            {
                "id": asset_id,
                "source": str(source.relative_to(ROOT)),
                "public_path": str(destination.relative_to(REPO)),
                "url": "/" + str(destination.relative_to(REPO / "apps" / "web" / "public")),
                "sha256": sha256(destination),
                "bytes": destination.stat().st_size,
            }
        )

    RECEIPT.write_text(json.dumps({"schema": 1, "assets": rows}, indent=2) + "\n")
    print(f"published {len(rows)} byte-identical runtime assets")


if __name__ == "__main__":
    main()
