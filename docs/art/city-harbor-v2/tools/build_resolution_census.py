#!/usr/bin/env python3
"""Write the reproducible DPR2/zoom source-resolution census for issue #608."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


PACKAGE = Path(__file__).resolve().parents[1]
REPOSITORY = PACKAGE.parents[2]
LAYOUT = json.loads((REPOSITORY / "apps/web/src/citySceneLayout.json").read_text())
RUNTIME = REPOSITORY / "apps/web/public/art/city"
VIEWPORTS = ((375, 812), (1440, 900), (1920, 1080))
ASSET_FILES = {
    content_id: f"{'stoneWall' if content_id == 'stoneWall' else content_id}.webp"
    for content_id in LAYOUT["slots"]
}
BACKDROP_TILE_BLEED = 2


def rounded(value: float) -> float:
    return round(value, 6)


def source_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as image:
        return image.size


def build() -> dict[str, object]:
    sources = {
        content_id: source_size(RUNTIME / filename)
        for content_id, filename in ASSET_FILES.items()
    }
    sources["citadel-tower"] = source_size(RUNTIME / "citadel-tower.webp")
    first_tile = RUNTIME / Path(LAYOUT["backdrop"]["tiles"][0]["src"]).name
    tile_width, tile_height = source_size(first_tile)
    backdrop_source = (
        (tile_width - 2 * BACKDROP_TILE_BLEED) * LAYOUT["backdrop"]["columns"],
        (tile_height - 2 * BACKDROP_TILE_BLEED) * LAYOUT["backdrop"]["rows"],
    )
    records: list[dict[str, object]] = []
    worst: dict[str, dict[str, object]] = {}

    for viewport_width, viewport_height in VIEWPORTS:
        base_width = min(
            viewport_width,
            viewport_height * LAYOUT["scene"]["maxBaseHeightVh"] / 100 * 16 / 11,
        )
        for zoom in LAYOUT["zoomStops"]:
            device_width = base_width * zoom * 2
            device_height = device_width * 11 / 16
            backdrop_ratio = min(
                backdrop_source[0] / device_width,
                backdrop_source[1] / device_height,
            )
            assets: dict[str, object] = {}
            for content_id, slot in LAYOUT["slots"].items():
                source_width, source_height = sources[content_id]
                required_width = device_width * slot["width"] / 100
                required_height = device_height * slot["height"] / 100
                ratio = min(source_width / required_width, source_height / required_height)
                assets[content_id] = {
                    "source": [source_width, source_height],
                    "required_box": [rounded(required_width), rounded(required_height)],
                    "conservative_ratio": rounded(ratio),
                }
                if content_id not in worst or ratio < worst[content_id]["ratio"]:
                    worst[content_id] = {
                        "ratio": ratio,
                        "viewport": [viewport_width, viewport_height],
                        "zoom": zoom,
                    }

            citadel = LAYOUT["slots"][LAYOUT["tower"]["slotId"]]
            tower_width, tower_height = sources["citadel-tower"]
            required_tower_width = (
                device_width * citadel["width"] / 100 * LAYOUT["tower"]["widthPercent"] / 100
            )
            required_tower_height = device_height * citadel["height"] / 100
            tower_ratio = min(
                tower_width / required_tower_width, tower_height / required_tower_height
            )
            assets["citadel-tower"] = {
                "source": [tower_width, tower_height],
                "required_box": [
                    rounded(required_tower_width),
                    rounded(required_tower_height),
                ],
                "conservative_ratio": rounded(tower_ratio),
            }
            if "citadel-tower" not in worst or tower_ratio < worst["citadel-tower"]["ratio"]:
                worst["citadel-tower"] = {
                    "ratio": tower_ratio,
                    "viewport": [viewport_width, viewport_height],
                    "zoom": zoom,
                }

            records.append(
                {
                    "viewport": [viewport_width, viewport_height],
                    "dpr": 2,
                    "zoom": zoom,
                    "device_scene": [rounded(device_width), rounded(device_height)],
                    "backdrop_ratio": rounded(backdrop_ratio),
                    "assets": assets,
                }
            )

    worst_backdrop = min(records, key=lambda record: record["backdrop_ratio"])
    return {
        "schema": 1,
        "date": "2026-09-04",
        "contract": "No source is enlarged at any approved zoom stop in the representative DPR2 viewport census.",
        "backdrop_source": list(backdrop_source),
        "backdrop_physical_source": [
            LAYOUT["backdrop"]["authoredWidth"],
            LAYOUT["backdrop"]["authoredHeight"],
        ],
        "backdrop_codec_bleed_px": BACKDROP_TILE_BLEED,
        "worst_backdrop": {
            "ratio": worst_backdrop["backdrop_ratio"],
            "viewport": worst_backdrop["viewport"],
            "zoom": worst_backdrop["zoom"],
        },
        "worst_assets": {
            asset: {
                "ratio": rounded(values["ratio"]),
                "viewport": values["viewport"],
                "zoom": values["zoom"],
            }
            for asset, values in sorted(worst.items())
        },
        "records": records,
    }


def main() -> None:
    output = PACKAGE / "RESOLUTION-CENSUS.json"
    output.write_text(json.dumps(build(), indent=2) + "\n")
    print(f"wrote {output.relative_to(REPOSITORY)}")


if __name__ == "__main__":
    main()
