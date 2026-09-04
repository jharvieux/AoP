#!/usr/bin/env python3
"""Deterministically compose issue #609 checkpoint-1 token and review proofs."""

from __future__ import annotations

import argparse
import filecmp
import json
import re
import shutil
import tempfile
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[2]
REGISTRY = ROOT / "asset-registry.json"
TOKEN_SIZE = 256
TOKEN_LIMIT = 128 * 1024
PROOF_LIMIT = 300 * 1024
SIZES = [24, 32, 48, 96]

INK = "#2c1810"
BRASS = "#c8962c"
PARCHMENT = "#f3e5c2"
PARCHMENT_DARK = "#cbb17a"
DEEP_SEA = "#1b4a6b"
SHALLOWS = "#2a6a8f"
LAND = "#4a7c3f"
FOG = "#0b1a26"
WOOD = "#1d1511"

DISPLAY_FONT = "/System/Library/Fonts/Supplemental/Georgia.ttf"
BODY_FONT = "/System/Library/Fonts/Supplemental/Trebuchet MS.ttf"
BODY_BOLD = "/System/Library/Fonts/Supplemental/Trebuchet MS Bold.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def save_budget(image: Image.Image, path: Path, start: int, stop: int, limit: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    for quality in range(start, stop - 1, -2):
        image.save(path, "WEBP", quality=quality, method=6, exact=True)
        if path.stat().st_size <= limit:
            return
    raise ValueError(f"{path}: cannot meet {limit} byte budget")


def token_image(asset: dict[str, object], destination_root: Path) -> Image.Image:
    source = Image.open(ROOT / str(asset["project_source"])).convert("RGBA")
    token = source.resize((TOKEN_SIZE, TOKEN_SIZE), Image.Resampling.LANCZOS)
    output = destination_root / str(asset["token"])
    save_budget(token, output, 90, 72, TOKEN_LIMIT)
    return token


def terrain_patch(size: tuple[int, int], context: str, fog_frontier: bool = False) -> Image.Image:
    width, height = size
    image = Image.new("RGBA", size, DEEP_SEA if context == "water" else LAND)
    draw = ImageDraw.Draw(image, "RGBA")
    if context == "water":
        draw.polygon(
            [(0, height * 0.70), (width * 0.34, height * 0.54), (width * 0.68, height * 0.66), (width, height * 0.38), (width, height), (0, height)],
            fill=(42, 106, 143, 210),
        )
        for offset in (0.18, 0.46, 0.76):
            x = int(width * offset)
            y = int(height * (0.23 + 0.11 * (offset > 0.4)))
            draw.arc((x - 36, y - 8, x + 36, y + 18), 200, 340, fill=(243, 229, 194, 150), width=2)
    else:
        draw.polygon(
            [(0, height * 0.78), (width * 0.28, height * 0.65), (width * 0.58, height * 0.74), (width, height * 0.53), (width, height), (0, height)],
            fill=(203, 177, 122, 230),
        )
        draw.polygon(
            [(0, 0), (width, 0), (width, height * 0.20), (width * 0.72, height * 0.29), (width * 0.38, height * 0.18), (0, height * 0.35)],
            fill=(46, 87, 48, 125),
        )
        for x, y, radius in ((0.16, 0.42, 8), (0.72, 0.31, 11), (0.88, 0.65, 7)):
            cx, cy = int(width * x), int(height * y)
            draw.ellipse((cx - radius, cy - radius // 2, cx + radius, cy + radius // 2), fill=(44, 57, 39, 100))
    draw.rectangle((0, 0, width - 1, height - 1), outline=(201, 162, 39, 115), width=2)
    if fog_frontier:
        frontier = [
            (int(width * 0.58), 0),
            (int(width * 0.53), int(height * 0.30)),
            (int(width * 0.62), int(height * 0.56)),
            (int(width * 0.55), height),
            (width, height),
            (width, 0),
        ]
        draw.polygon(frontier, fill=(11, 26, 38, 224))
        draw.line(frontier[:4], fill=(42, 106, 143, 190), width=3)
    return image


def grayscale_rgba(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    gray = ImageOps.grayscale(image.convert("RGB")).convert("RGBA")
    gray.putalpha(alpha)
    return gray


def paste_token(canvas: Image.Image, token: Image.Image, center: tuple[int, int], size: int) -> None:
    scaled = token.resize((size, size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(scaled, (center[0] - size // 2, center[1] - size // 2))


def heading(draw: ImageDraw.ImageDraw, title: str, subtitle: str, width: int) -> None:
    draw.text((58, 42), title, font=font(DISPLAY_FONT, 54), fill=INK)
    draw.text((60, 112), subtitle, font=font(BODY_BOLD, 24), fill="#7a2e1a")
    draw.line((58, 152, width - 58, 152), fill=BRASS, width=3)


def compose_contact_sheet(assets: list[dict[str, object]], tokens: dict[str, Image.Image]) -> tuple[Image.Image, list[dict[str, object]]]:
    width = 2400
    row_h = 124
    group_h = 54
    groups = [("CITIES", "cities"), ("SHIP CLASSES", "ships"), ("FACTION PARTIES", "parties"), ("ENCOUNTERS", "encounters"), ("LAND SITES", "sites")]
    height = 190 + len(assets) * row_h + len(groups) * group_h + 44
    canvas = Image.new("RGBA", (width, height), PARCHMENT)
    draw = ImageDraw.Draw(canvas, "RGBA")
    heading(draw, "Direction B · world-map token proof", "Every candidate at exact 24, 32, 48, and 96 CSS pixels · checkpoint 1 · not runtime art", width)

    label_x = 60
    first_x = 480
    cell_w = 448
    for index, size in enumerate(SIZES):
        x = first_x + index * cell_w
        suffix = "VISIBLE" if size != 32 else "FOG FRONTIER / VISIBLE SIDE"
        draw.text((x + 18, 168), f"{size} px · {suffix}", font=font(BODY_BOLD, 19), fill=INK)

    y = 202
    coverage: list[dict[str, object]] = []
    for group_name, category in groups:
        draw.rounded_rectangle((54, y, width - 54, y + group_h - 8), radius=8, fill=(44, 24, 16, 238), outline=BRASS, width=2)
        draw.text((76, y + 10), group_name, font=font(BODY_BOLD, 22), fill=PARCHMENT)
        y += group_h
        for asset in [item for item in assets if item["category"] == category]:
            row_top = y
            draw.text((label_x, row_top + 30), str(asset["label"]), font=font(BODY_BOLD, 23), fill=INK)
            draw.text((label_x, row_top + 65), str(asset["id"]), font=font(BODY_FONT, 17), fill="#6a4b37")
            cells: list[dict[str, object]] = []
            for index, size in enumerate(SIZES):
                x = first_x + index * cell_w
                fog = size == 32
                patch = terrain_patch((cell_w - 18, row_h - 14), str(asset["context"]), fog_frontier=fog)
                canvas.alpha_composite(patch, (x, row_top + 3))
                center_x = x + (128 if fog else (cell_w - 18) // 2)
                center_y = row_top + row_h // 2
                paste_token(canvas, tokens[str(asset["id"])], (center_x, center_y), size)
                cells.append(
                    {
                        "size": size,
                        "context": "fog-frontier-visible-side" if fog else str(asset["context"]),
                        "token_drawn": True,
                        "center": [center_x, center_y],
                    }
                )
            coverage.append({"id": asset["id"], "cells": cells})
            draw.line((54, row_top + row_h - 1, width - 54, row_top + row_h - 1), fill=(44, 24, 16, 44), width=1)
            y += row_h
    return canvas, coverage


def flag_image(faction: str, gray: bool = False) -> Image.Image | None:
    if faction == "neutral":
        return None
    path = REPO / "apps" / "web" / "public" / "art" / "factions" / faction / "flag.png"
    image = Image.open(path).convert("RGBA")
    if gray:
        image = grayscale_rgba(image)
    return image.resize((52, 52), Image.Resampling.LANCZOS)


def compose_faction_sheet(assets: list[dict[str, object]], tokens: dict[str, Image.Image]) -> tuple[Image.Image, list[str]]:
    width, height = 2200, 1800
    canvas = Image.new("RGBA", (width, height), PARCHMENT)
    draw = ImageDraw.Draw(canvas, "RGBA")
    heading(draw, "Faction identity · color and grayscale", "Architecture, formation, class silhouette, and existing authored flag geometry must survive without hue", width)

    columns = [(520, "CITY · COLOR"), (790, "CITY · GRAYSCALE"), (1120, "PARTY · COLOR"), (1390, "PARTY · GRAYSCALE"), (1735, "EXISTING FLAG / PATTERN")]
    for x, label in columns:
        draw.text((x, 180), label, font=font(BODY_BOLD, 19), fill=INK)
    draw.text((60, 180), "IDENTITY + SILHOUETTE CUE", font=font(BODY_BOLD, 19), fill=INK)

    cities = [asset for asset in assets if asset["category"] == "cities"]
    party_by_faction = {str(asset["faction"]): asset for asset in assets if asset["category"] == "parties"}
    grayscale_ids: list[str] = []
    y = 230
    cues = {
        "british": "square bastion · disciplined rank",
        "dutch": "stepped gable · low wedge",
        "french": "mansard crown · crescent rank",
        "pirates": "ragged palisade · broken rank",
        "spanish": "bell tower · cape arrowhead",
        "neutral": "low market · no raised standard",
    }
    for city in cities:
        faction = str(city["faction"])
        draw.rounded_rectangle((54, y - 8, width - 54, y + 174), radius=9, fill=(255, 248, 224, 180), outline=(44, 24, 16, 55), width=2)
        draw.text((70, y + 30), faction.title(), font=font(DISPLAY_FONT, 31), fill=INK)
        draw.text((70, y + 82), cues[faction], font=font(BODY_FONT, 18), fill="#6a4b37")
        city_token = tokens[str(city["id"])]
        paste_token(canvas, city_token, (650, y + 82), 128)
        paste_token(canvas, grayscale_rgba(city_token), (920, y + 82), 128)
        grayscale_ids.append(str(city["id"]))
        party = party_by_faction.get(faction)
        if party:
            party_token = tokens[str(party["id"])]
            paste_token(canvas, party_token, (1248, y + 82), 112)
            paste_token(canvas, grayscale_rgba(party_token), (1518, y + 82), 112)
            grayscale_ids.append(str(party["id"]))
        else:
            draw.text((1182, y + 70), "NO NEUTRAL PARTY", font=font(BODY_BOLD, 17), fill="#7a6653")
            draw.text((1452, y + 70), "NO NEUTRAL PARTY", font=font(BODY_BOLD, 17), fill="#7a6653")
        flag = flag_image(faction)
        flag_gray = flag_image(faction, gray=True)
        if flag and flag_gray:
            canvas.alpha_composite(flag, (1800, y + 25))
            canvas.alpha_composite(flag_gray, (1880, y + 25))
            draw.text((1800, y + 95), "color", font=font(BODY_FONT, 16), fill=INK)
            draw.text((1880, y + 95), "gray", font=font(BODY_FONT, 16), fill=INK)
        else:
            draw.ellipse((1810, y + 28, 1860, y + 78), fill=(203, 177, 122, 255), outline=INK, width=3)
            draw.text((1795, y + 95), "muted crest", font=font(BODY_FONT, 16), fill=INK)
        y += 194

    draw.rounded_rectangle((54, y, width - 54, height - 40), radius=10, fill=(44, 24, 16, 238), outline=BRASS, width=2)
    draw.text((78, y + 24), "SHIP CLASS + FACTION PROOF", font=font(BODY_BOLD, 22), fill=PARCHMENT)
    ships = [asset for asset in assets if asset["category"] == "ships"]
    x = 520
    for ship in ships:
        token = tokens[str(ship["id"])]
        paste_token(canvas, token, (x, y + 150), 144)
        paste_token(canvas, grayscale_rgba(token), (x + 210, y + 150), 144)
        draw.text((x - 70, y + 230), str(ship["label"]), font=font(BODY_BOLD, 18), fill=PARCHMENT)
        draw.text((x + 155, y + 230), "grayscale", font=font(BODY_FONT, 17), fill=PARCHMENT_DARK)
        grayscale_ids.append(str(ship["id"]))
        x += 720
    draw.text((78, y + 285), "Generated art carries no baked flag. Existing authored flag geometry remains a separate runtime overlay.", font=font(BODY_FONT, 18), fill=PARCHMENT_DARK)
    return canvas, grayscale_ids


def compose_fog_sheet(assets: list[dict[str, object]], tokens: dict[str, Image.Image]) -> tuple[Image.Image, list[dict[str, object]]]:
    width, height = 2100, 1040
    canvas = Image.new("RGBA", (width, height), PARCHMENT)
    draw = ImageDraw.Draw(canvas, "RGBA")
    heading(draw, "Fog truth · presentation never changes visibility", "Visible tokens render; fog-frontier examples stay on the visible side; hidden cells contain no entity pixels", width)
    examples = [
        next(asset for asset in assets if asset["id"] == "city:british"),
        next(asset for asset in assets if asset["id"] == "ship:british:sloop"),
        next(asset for asset in assets if asset["id"] == "party:pirates"),
        next(asset for asset in assets if asset["id"] == "encounter:nativeVillage"),
        next(asset for asset in assets if asset["id"] == "landSite:mine"),
    ]
    cell_w = 388
    first_x = 110
    rows = [(230, "VISIBLE", "visible"), (485, "FOG FRONTIER", "frontier"), (740, "HIDDEN", "hidden")]
    coverage: list[dict[str, object]] = []
    for column, asset in enumerate(examples):
        x = first_x + column * cell_w
        draw.text((x + 46, 176), str(asset["label"]), font=font(BODY_BOLD, 20), fill=INK)
        for y, label, state in rows:
            fog = state == "frontier"
            patch = terrain_patch((348, 196), str(asset["context"]), fog_frontier=fog)
            if state == "hidden":
                dark = Image.new("RGBA", patch.size, (11, 26, 38, 238))
                patch.alpha_composite(dark)
            canvas.alpha_composite(patch, (x, y))
            token_drawn = state != "hidden"
            if token_drawn:
                center_x = x + (102 if fog else 174)
                paste_token(canvas, tokens[str(asset["id"])], (center_x, y + 98), 96)
            else:
                draw.text((x + 72, y + 80), "ENTITY SUPPRESSED", font=font(BODY_BOLD, 18), fill=PARCHMENT_DARK)
            if column == 0:
                draw.text((22, y + 80), label, font=font(BODY_BOLD, 18), fill=INK)
            coverage.append({"id": asset["id"], "state": state, "token_drawn": token_drawn})
    draw.text((110, 970), "Proof rule: no silhouette, highlight, shadow, label, or high-detail substitute is drawn for a hidden entity.", font=font(BODY_BOLD, 20), fill="#7a2e1a")
    return canvas, coverage


def build(destination_root: Path) -> None:
    registry = json.loads(REGISTRY.read_text())
    assets = registry["assets"]
    counts = Counter(asset["category"] for asset in assets)
    if counts != Counter({"cities": 6, "ships": 2, "parties": 5, "encounters": 4, "sites": 4}):
        raise ValueError(f"unexpected asset coverage: {dict(counts)}")

    tokens: dict[str, Image.Image] = {}
    for asset in assets:
        tokens[str(asset["id"])] = token_image(asset, destination_root)

    contact, contact_coverage = compose_contact_sheet(assets, tokens)
    faction, grayscale_ids = compose_faction_sheet(assets, tokens)
    fog, fog_coverage = compose_fog_sheet(assets, tokens)
    proof_paths = {
        "contact": destination_root / "proofs" / "token-contact-sheet-2400x3108.webp",
        "faction": destination_root / "proofs" / "faction-color-grayscale-2200x1800.webp",
        "fog": destination_root / "proofs" / "fog-truth-2100x1040.webp",
    }
    if contact.size != (2400, 3108):
        raise ValueError(f"contact-sheet dimensions drifted: {contact.size}")
    save_budget(contact.convert("RGB"), proof_paths["contact"], 78, 48, PROOF_LIMIT)
    save_budget(faction.convert("RGB"), proof_paths["faction"], 80, 52, PROOF_LIMIT)
    save_budget(fog.convert("RGB"), proof_paths["fog"], 82, 56, PROOF_LIMIT)

    coverage = {
        "schema": 1,
        "sizes": SIZES,
        "assets": contact_coverage,
        "grayscale_ids": sorted(grayscale_ids),
        "fog_examples": fog_coverage,
        "proofs": {key: str(path.relative_to(destination_root)) for key, path in proof_paths.items()},
    }
    coverage_path = destination_root / "proofs" / "coverage.json"
    coverage_path.parent.mkdir(parents=True, exist_ok=True)
    coverage_json = json.dumps(coverage, indent=2)
    coverage_json = coverage_json.replace(
        '"sizes": [\n    24,\n    32,\n    48,\n    96\n  ]',
        '"sizes": [24, 32, 48, 96]',
    )
    coverage_json = re.sub(
        r'"center": \[\n\s+(\d+),\n\s+(\d+)\n\s+\]',
        r'"center": [\1, \2]',
        coverage_json,
    )
    coverage_path.write_text(coverage_json + "\n")


def compare_tree(expected: Path, actual: Path) -> None:
    expected_files = sorted(path.relative_to(expected) for path in expected.rglob("*") if path.is_file())
    actual_files = sorted(path.relative_to(actual) for path in actual.rglob("*") if path.is_file())
    if expected_files != actual_files:
        raise ValueError("deterministic check produced a different file set")
    mismatches = [str(path) for path in expected_files if not filecmp.cmp(expected / path, actual / path, shallow=False)]
    if mismatches:
        raise ValueError("deterministic bytes differ: " + ", ".join(mismatches))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.check:
        build(ROOT)
        print("composed 21 tokens and 3 checkpoint proofs")
        return
    with tempfile.TemporaryDirectory(prefix="aop-map-proof-") as temp:
        destination = Path(temp) / "actual"
        # Project sources are immutable inputs and are not regenerated by this compositor.
        build(destination)
        expected = Path(temp) / "expected"
        expected.mkdir()
        for relative in [str(asset["token"]) for asset in json.loads(REGISTRY.read_text())["assets"]]:
            source = ROOT / relative
            target = expected / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        for relative in [
            "proofs/token-contact-sheet-2400x3108.webp",
            "proofs/faction-color-grayscale-2200x1800.webp",
            "proofs/fog-truth-2100x1040.webp",
            "proofs/coverage.json",
        ]:
            source = ROOT / relative
            target = expected / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        compare_tree(expected, destination)
    print("deterministic recomposition is byte-identical")


if __name__ == "__main__":
    main()
