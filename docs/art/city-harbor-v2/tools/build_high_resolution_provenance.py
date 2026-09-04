#!/usr/bin/env python3
"""Build exact, hash-bound provenance for the issue #608 high-resolution pass."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


PACKAGE = Path(__file__).resolve().parents[1]
STYLE = PACKAGE.parent / "commercial-visual-v2/sources/b-gilded-harbor-diorama-full-r3.webp"
TILE_PROMPT = """Use case: precise-object-edit
Asset type: high-density game-environment backdrop tile for a commercial strategy-game city screen
Input images: Image 1 is edit target {tile_id} and exact spatial/composition authority; Image 2 is a style/material reference only
Primary request: Re-render Image 1 as the same exact square terrain crop with genuinely newly authored high-frequency detail suitable for close 3× zoom. Preserve every road centerline, road width, empty building foundation outline, rock silhouette, plant cluster, shoreline or water boundary, and their exact positions at all four tile edges. Add only finer painterly surface articulation in dirt, stone, foliage, foam, and water.
Style/medium: luxurious hand-painted 2D strategy-game environment art; layered gouache and oil-brush texture; dimensional but illustrated; match Image 1 first and Image 2 only for commercial finish
Camera/lighting: preserve Image 1's exact weak-orthographic camera and northwest sunlight; no perspective or shadow-direction change
Composition/framing: preserve Image 1 in composition and exact square framing; do not crop, rotate, widen, or shift
Constraints: building-free empty terrain only; no constructed buildings, ships, people, animals, flags, banners, names, letters, numbers, UI, selection rings, logos, signatures, or watermarks; no new scenery; no edge vignette; no border; preserve all edge continuity"""
TOWNHALL_PROMPT = """Use case: precise-object-edit
Asset type: high-density transparent constructed-building source for a commercial strategy-game city screen
Input images: Image 1 is the {side} overlapping half of the active town-hall source and the exact edit target; Image 2 is a style/material reference only
Primary request: Re-render exactly the same {side} town-hall half with genuinely newly authored high-frequency architectural detail suitable for close 3× zoom. Preserve every visible wall, roof plane, dome, arch, stair, railing, window, chimney, ornament, crop boundary, camera angle, proportions, and lighting. Do not redesign or move anything.
Style/medium: luxurious hand-painted 2D strategy-game building cutout; layered gouache and oil-brush texture; dimensional but illustrated; match Image 1 first and Image 2 only for commercial finish
Camera/lighting: preserve the exact weak-orthographic camera and northwest light in Image 1
Composition/framing: preserve Image 1's exact portrait framing and overlap content; do not crop, rotate, widen, shift, or add margin
Transparency: output genuine RGBA transparency outside the physical building, not a painted white/gray checkerboard and not a matte; preserve fine roof, finial, railing, stair, and arch edges
Constraints: town hall only; no terrain, foundation island, detached floor shadow, people, animals, flags, banners, names, letters, numbers, UI, selection rings, logos, signatures, or watermarks; no new objects"""


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def image_record(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        return {
            "path": str(path.relative_to(PACKAGE)),
            "sha256": sha256(path),
            "dimensions": list(image.size),
            "mode": image.mode,
            "bytes": path.stat().st_size,
        }


def build() -> dict[str, object]:
    calls: list[dict[str, object]] = []
    for row in range(1, 5):
        for column in range(1, 7):
            sequence = (row - 1) * 6 + column
            tile_id = f"C{column}R{row}"
            target = PACKAGE / f"sources/backdrop-detail-inputs/backdrop-detail-c{column}r{row}-input.webp"
            output = PACKAGE / f"sources/backdrop-detail-tiles/backdrop-detail-c{column}r{row}-r2.webp"
            calls.append(
                {
                    "call_id": f"H{sequence:02}",
                    "asset": f"backdrop detail {tile_id}",
                    "use_case": "precise-object-edit",
                    "prompt": TILE_PROMPT.format(tile_id=tile_id),
                    "input_references": [
                        {**image_record(target), "role": "edit target and spatial authority"},
                        {
                            "path": "../commercial-visual-v2/sources/b-gilded-harbor-diorama-full-r3.webp",
                            "sha256": sha256(STYLE),
                            "role": "style/material/camera/light reference only",
                        },
                    ],
                    "retained_output": image_record(output),
                    "transparent_requested": False,
                    "service_alpha_delivered": False,
                }
            )

    for index, side in enumerate(("left", "right"), 25):
        target = PACKAGE / f"sources/townhall-detail-inputs/townhall-{side}-input.webp"
        output = PACKAGE / f"sources/townhall-detail-outputs/townhall-{side}-r1.webp"
        calls.append(
            {
                "call_id": f"H{index:02}",
                "asset": f"town hall {side} detail",
                "use_case": "precise-object-edit",
                "prompt": TOWNHALL_PROMPT.format(side=side),
                "input_references": [
                    {**image_record(target), "role": "edit target and composition authority"},
                    {
                        "path": "../commercial-visual-v2/sources/b-gilded-harbor-diorama-full-r3.webp",
                        "sha256": sha256(STYLE),
                        "role": "style/material/camera/light reference only",
                    },
                ],
                "retained_output": image_record(output),
                "transparent_requested": True,
                "service_alpha_delivered": "RGB only; historical P2 semantic mask was upscaled and reviewed",
            }
        )

    masks = []
    for path in sorted((PACKAGE / "masks").glob("*.png")):
        role = "active semantic mask"
        if path.name == "barracks-mask-p5.png":
            role = "historical P5 semantic mask; superseded for runtime by P11 barracks-mask.png"
        elif path.name == "townhall-mask.png":
            role = "historical P2 mask; source authority for active townhall-detail-mask.png"
        masks.append({**image_record(path), "role": role})

    return {
        "schema": 1,
        "batch": "issue-608-city-art-high-resolution-production-pass",
        "date": "2026-09-03",
        "service": "OpenAI built-in image generator",
        "tool_mode": "subscription-included built-in image_gen tool; no CLI, API key, paid API path, or ComfyUI generation",
        "license_usage_basis": "Project-directed generated source using only project-generated references; no stock image, external logo, or copied game screenshot. Service terms and applicable law govern use; this record is provenance, not legal advice.",
        "interface_fields_not_exposed": [
            "model identifier",
            "model version",
            "sampler",
            "seed",
            "quality control",
            "size control",
        ],
        "accepted_calls": calls,
        "composed_sources": [
            {
                **image_record(PACKAGE / "sources/townhall-source-r3.webp"),
                "inputs": ["H25", "H26", "P2 townhall source", "townhall-detail-mask.png"],
                "method": "P2 spatial/alpha authority plus similarity-gated high-frequency luminance from the two overlapping generated detail halves; no geometric upscale claimed as new detail",
            }
        ],
        "recorded_masks": masks,
        "rejected_calls": {
            "count": 6,
            "disposition": "All pilot outputs discarded after review; no rejected output is project-bound.",
            "reason": "Five-column 512-pixel input grid yielded only a 5016-pixel effective authored width, or 0.858x of the 1920x1080 DPR2 3x device requirement.",
            "prompt_family": "Same precise backdrop-detail edit request as H01-H24, using an earlier 512-pixel target grid and corresponding C1R1/C2R1/C3R1/C4R1/C5R1/C1R2 tile identifiers.",
        },
    }


def main() -> None:
    output = PACKAGE / "HIGH-RES-PROVENANCE.json"
    output.write_text(json.dumps(build(), indent=2) + "\n")
    print(f"wrote {output.relative_to(PACKAGE)}")


if __name__ == "__main__":
    main()
