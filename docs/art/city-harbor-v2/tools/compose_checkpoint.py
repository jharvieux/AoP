#!/usr/bin/env python3
"""Build the issue #608 checkpoint-one city proofs from retained source art.

This is authoring-only tooling. It deliberately mirrors the current CityScene
16:11 canvas and SCENE_SLOTS geometry without changing runtime code or assets.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps
from scipy import ndimage


PACKAGE = Path(__file__).resolve().parents[1]
MASTER_SIZE = (2048, 1408)
RUNTIME_SIZE = (1024, 704)

INK = "#20150e"
WOOD = "#2c190f"
WOOD_2 = "#3b2315"
PARCHMENT = "#e4cf9a"
PARCHMENT_DIM = "#c8ac70"
BRASS = "#d2a820"
RUST = "#8c3723"
SEA = "#2c91a0"
WHITE = "#f7e9c7"


@dataclass(frozen=True)
class Slot:
    asset: str
    label: str
    role: str
    left: float
    top: float
    width: float
    height: float
    depth: str


# Exact values copied from CityScene.tsx at base 29ce63e0. Only this proof uses
# the table; issue #608 has not changed runtime placement yet.
SLOTS = (
    Slot("townhall", "Town hall", "civic anchor", 37, 6, 26, 36, "P0"),
    Slot("shipyard", "Shipyard", "shoreline", 80, 75, 19, 24, "P1"),
    Slot("tavern", "Tavern", "hospitality", 4, 24, 14, 20, "P2"),
    Slot("tradehouse", "Trade house", "economy", 19, 28, 14, 18, "P2"),
    Slot("barracks", "Barracks", "recruitment", 47, 46, 13, 17, "P2"),
    Slot("stonewall", "Stone wall", "fortification", 24, 66, 17, 12, "P3"),
)

SOURCE_NAMES = {
    "townhall": "townhall-source-r1.webp",
    "tavern": "tavern-source-r1.webp",
    "tradehouse": "tradehouse-source-r1.webp",
    "barracks": "barracks-source-r1.webp",
    "stonewall": "stonewall-source-r1.webp",
    "shipyard": "shipyard-source-r2.webp",
}


def font(size: int, bold: bool = False, display: bool = False) -> ImageFont.FreeTypeFont:
    if display:
        path = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
    elif bold:
        path = "/System/Library/Fonts/Supplemental/Trebuchet MS Bold.ttf"
    else:
        path = "/System/Library/Fonts/Supplemental/Trebuchet MS.ttf"
    return ImageFont.truetype(path, size)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fit_cover(image: Image.Image, size: tuple[int, int], align_x: float = 0.5) -> Image.Image:
    scale = max(size[0] / image.width, size[1] / image.height)
    resized = image.resize(
        (math.ceil(image.width * scale), math.ceil(image.height * scale)),
        Image.Resampling.LANCZOS,
    )
    left = round((resized.width - size[0]) * align_x)
    top = round((resized.height - size[1]) / 2)
    return resized.crop((left, top, left + size[0], top + size[1]))


def apply_subject_mask(image: Image.Image, mask: Image.Image) -> Image.Image:
    """Apply a retained semantic subject mask without a pale edge matte."""

    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    alpha = np.asarray(mask.convert("L"), dtype=np.uint8)
    if rgb.shape[:2] != alpha.shape:
        raise ValueError(f"source/mask size mismatch: {image.size} vs {mask.size}")

    # The reviewed mask already owns subject/background classification. Extend
    # trustworthy interior color through its soft edge so resampling cannot
    # blend in the generator's painted white checker.
    interior = alpha >= 240
    if not interior.any():
        raise ValueError("subject mask has no opaque interior")
    _, indices = ndimage.distance_transform_edt(~interior, return_indices=True)
    filled = rgb.copy()
    edge = alpha < 240
    filled[edge] = rgb[indices[0][edge], indices[1][edge]]
    rgba = np.dstack((filled, alpha))
    result = Image.fromarray(rgba, "RGBA")

    bbox = result.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("checkerboard extraction produced an empty cutout")
    pad = 26
    crop = (
        max(0, bbox[0] - pad),
        max(0, bbox[1] - pad),
        min(result.width, bbox[2] + pad),
        min(result.height, bbox[3] + pad),
    )
    result = result.crop(crop)
    if max(result.size) > 900:
        scale = 900 / max(result.size)
        result = result.resize(
            (round(result.width * scale), round(result.height * scale)), Image.Resampling.LANCZOS
        )
    return result


def save_webp(image: Image.Image, path: Path, quality: int = 84) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=quality, method=6, exact=True)


def render_assets(root: Path) -> dict[str, Image.Image]:
    source_root = PACKAGE / "sources"
    mask_root = PACKAGE / "masks"
    cutout_root = root / "cutouts"
    cutouts: dict[str, Image.Image] = {}
    for asset, filename in SOURCE_NAMES.items():
        source = Image.open(source_root / filename)
        mask = Image.open(mask_root / f"{asset}-mask.png")
        cutout = apply_subject_mask(source, mask)
        cutouts[asset] = cutout
        save_webp(cutout, cutout_root / f"{asset}.webp", 90)
    return cutouts


def slot_box(slot: Slot, size: tuple[int, int]) -> tuple[int, int, int, int]:
    return (
        round(size[0] * slot.left / 100),
        round(size[1] * slot.top / 100),
        round(size[0] * (slot.left + slot.width) / 100),
        round(size[1] * (slot.top + slot.height) / 100),
    )


def contained(image: Image.Image, box: tuple[int, int, int, int]) -> tuple[Image.Image, int, int]:
    width = box[2] - box[0]
    height = box[3] - box[1]
    scale = min(width / image.width, height / image.height)
    rendered = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.LANCZOS,
    )
    x = round((box[0] + box[2] - rendered.width) / 2)
    y = box[3] - rendered.height
    return rendered, x, y


def shadow_layer(slot: Slot, size: tuple[int, int]) -> Image.Image:
    box = slot_box(slot, size)
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    width = box[2] - box[0]
    height = box[3] - box[1]
    ellipse = (
        box[0] + round(width * 0.12),
        box[3] - round(height * 0.18),
        box[2] + round(width * 0.08),
        box[3] + round(height * 0.07),
    )
    draw.ellipse(ellipse, fill=(18, 22, 17, 82))
    return layer.filter(ImageFilter.GaussianBlur(max(3, round(size[0] * 0.006))))


def render_scene(root: Path, cutouts: dict[str, Image.Image]) -> tuple[Image.Image, Image.Image]:
    raw_backdrop = Image.open(PACKAGE / "sources" / "empty-harbor-source-r2.webp").convert("RGB")
    backdrop = fit_cover(raw_backdrop, MASTER_SIZE, align_x=0.48)
    backdrop = ImageEnhance.Color(backdrop).enhance(0.94)
    backdrop = ImageEnhance.Contrast(backdrop).enhance(1.03)
    save_webp(backdrop, root / "layers" / "empty-backdrop-2048x1408.webp", 63)

    scene = backdrop.convert("RGBA")
    shadow_group = Image.new("RGBA", MASTER_SIZE, (0, 0, 0, 0))
    for slot in SLOTS:
        shadow_group = Image.alpha_composite(shadow_group, shadow_layer(slot, MASTER_SIZE))
    save_webp(shadow_group, root / "layers" / "contact-shadows.webp", 88)
    scene = Image.alpha_composite(scene, shadow_group)

    for slot in SLOTS:
        rendered, x, y = contained(cutouts[slot.asset], slot_box(slot, MASTER_SIZE))
        scene.alpha_composite(rendered, (x, y))

    runtime = scene.convert("RGB").resize(RUNTIME_SIZE, Image.Resampling.LANCZOS)
    save_webp(runtime, root / "proofs" / "scene-runtime-1024x704.webp", 84)
    empty_runtime = backdrop.resize(RUNTIME_SIZE, Image.Resampling.LANCZOS)
    save_webp(empty_runtime, root / "proofs" / "empty-runtime-1024x704.webp", 82)
    return scene.convert("RGB"), empty_runtime


def framed_panel(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int = 12) -> None:
    draw.rounded_rectangle(box, radius, fill=WOOD, outline=BRASS, width=2)
    inner = (box[0] + 5, box[1] + 5, box[2] - 5, box[3] - 5)
    draw.rounded_rectangle(inner, max(4, radius - 4), outline="#76591d", width=1)


def render_desktop(root: Path, scene: Image.Image) -> Image.Image:
    canvas = Image.new("RGB", (1440, 900), INK)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, 1439, 899), outline=BRASS, width=3)
    draw.text((28, 22), "PORT PROVIDENCE", font=font(34, display=True), fill=WHITE)
    draw.text((30, 64), "CITY ART CHECKPOINT · DIRECTION B", font=font(13, bold=True), fill=BRASS)
    scene_runtime = scene.resize(RUNTIME_SIZE, Image.Resampling.LANCZOS)
    canvas.paste(scene_runtime, (28, 126))
    draw.rectangle((27, 125, 1052, 830), outline=BRASS, width=2)

    framed_panel(draw, (1072, 126, 1410, 830))
    draw.text((1096, 152), "SIX CLEAR ROLES", font=font(24, display=True), fill=WHITE)
    draw.line((1096, 192, 1386, 192), fill="#7f6133", width=1)
    y = 218
    for slot in SLOTS:
        draw.ellipse((1098, y + 3, 1112, y + 17), fill=BRASS if slot.depth != "P3" else RUST)
        draw.text((1124, y), slot.label.upper(), font=font(16, bold=True), fill=PARCHMENT)
        draw.text((1124, y + 23), f"{slot.role} · {slot.depth}", font=font(13), fill=PARCHMENT_DIM)
        y += 76
    draw.line((1096, 691, 1386, 691), fill="#7f6133", width=1)
    draw.text((1096, 714), "CURRENT SCENE_SLOTS", font=font(14, bold=True), fill=BRASS)
    draw.text((1096, 741), "No runtime placement changes", font=font(14), fill=PARCHMENT)
    draw.text((1096, 765), "Buildings remain separable", font=font(14), fill=PARCHMENT)
    return canvas


def render_phone(root: Path, scene: Image.Image) -> Image.Image:
    canvas = Image.new("RGB", (375, 812), INK)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, 374, 811), outline=BRASS, width=2)
    draw.text((16, 14), "PORT PROVIDENCE", font=font(23, display=True), fill=WHITE)
    draw.text((16, 45), "REPRESENTATIVE CITY", font=font(10, bold=True), fill=BRASS)
    phone_scene = scene.resize((375, 258), Image.Resampling.LANCZOS)
    canvas.paste(phone_scene, (0, 68))
    draw.line((0, 67, 374, 67), fill=BRASS, width=2)
    draw.line((0, 326, 374, 326), fill=BRASS, width=2)

    framed_panel(draw, (12, 344, 363, 794), 14)
    draw.text((30, 366), "READABLE AT 375 PX", font=font(21, display=True), fill=WHITE)
    draw.text((30, 404), "Actual scene: 375 × 258", font=font(12, bold=True), fill=BRASS)
    y = 446
    for left, right in ((SLOTS[0], SLOTS[1]), (SLOTS[2], SLOTS[3]), (SLOTS[4], SLOTS[5])):
        for x, slot in ((30, left), (199, right)):
            draw.ellipse((x, y + 2, x + 11, y + 13), fill=BRASS if slot.depth != "P3" else RUST)
            draw.text((x + 19, y), slot.label, font=font(13, bold=True), fill=PARCHMENT)
            draw.text((x + 19, y + 22), slot.role, font=font(11), fill=PARCHMENT_DIM)
        y += 76
    draw.line((30, 673, 345, 673), fill="#7f6133", width=1)
    draw.text((30, 695), "FORTRESS MASS REDUCED", font=font(12, bold=True), fill=BRASS)
    draw.text((30, 722), "Civic, trade, tavern, barracks,", font=font(12), fill=PARCHMENT)
    draw.text((30, 744), "shipyard, and wall read independently.", font=font(12), fill=PARCHMENT)
    return canvas


def render_zoom(root: Path, scene: Image.Image) -> Image.Image:
    runtime = scene.resize(RUNTIME_SIZE, Image.Resampling.LANCZOS)
    zoomed = runtime.resize((RUNTIME_SIZE[0] * 3, RUNTIME_SIZE[1] * 3), Image.Resampling.LANCZOS)
    # This is one real 1024×704 viewport into the current 3× city scene. The
    # left district fits both the tavern and trade house, making edge quality
    # and role separation easier to judge than an arbitrary center crop.
    return zoomed.crop((0, 300, 1024, 1004))


def stress_background(size: tuple[int, int]) -> Image.Image:
    """Use saturated fields that cannot conceal pale checker or matte art."""

    image = Image.new("RGB", size, "#ff00ff")
    draw = ImageDraw.Draw(image)
    draw.rectangle((size[0] // 2, 0, size[0] - 1, size[1] - 1), fill="#00383f")
    draw.line((size[0] // 2, 0, size[0] // 2, size[1] - 1), fill=WHITE, width=2)
    return image


def render_stress_proofs(root: Path, cutouts: dict[str, Image.Image]) -> None:
    for slot in SLOTS:
        canvas = stress_background((1024, 1024))
        draw = ImageDraw.Draw(canvas)
        draw.rectangle((0, 0, 1023, 103), fill=INK)
        draw.text((28, 19), f"{slot.label.upper()} · ALPHA STRESS", font=font(26, display=True), fill=WHITE)
        draw.text(
            (30, 61),
            "Native 900 px cutout · magenta / dark-teal backgrounds",
            font=font(14, bold=True),
            fill=BRASS,
        )
        art = cutouts[slot.asset]
        x = (canvas.width - art.width) // 2
        y = 112 + (900 - art.height) // 2
        canvas.paste(art, (x, y), art)
        save_webp(canvas, root / "proofs" / "stress" / f"{slot.asset}-magenta-1024.webp", 86)


def render_layer_sheet(root: Path, scene: Image.Image, empty: Image.Image, cutouts: dict[str, Image.Image]) -> Image.Image:
    canvas = Image.new("RGB", (1600, 1000), "#f0dfb2")
    draw = ImageDraw.Draw(canvas)
    draw.text((48, 34), "CITY LAYER SEPARATION", font=font(36, display=True), fill=INK)
    draw.text((50, 83), "Exact current slots · bottom anchors · explicit P0–P3 depth", font=font(17, bold=True), fill=RUST)

    # Empty layer.
    draw.rounded_rectangle((48, 128, 790, 604), 12, fill="#fff3d3", outline=WOOD, width=3)
    draw.text((70, 148), "1 · EMPTY TERRAIN / COAST / ROADS / FOUNDATIONS", font=font(16, bold=True), fill=INK)
    empty_thumb = empty.resize((690, 474), Image.Resampling.LANCZOS).crop((0, 44, 690, 456))
    canvas.paste(empty_thumb, (74, 184))

    # Alpha cutouts.
    draw.rounded_rectangle((816, 128, 1552, 604), 12, fill="#fff3d3", outline=WOOD, width=3)
    draw.text((838, 148), "2 · RGBA CUTOUTS / SATURATED ALPHA STRESS", font=font(16, bold=True), fill=INK)
    board = stress_background((690, 390))
    for index, slot in enumerate(SLOTS):
        col = index % 3
        row = index // 3
        cell_box = (col * 230, row * 195, (col + 1) * 230, (row + 1) * 195)
        art = cutouts[slot.asset]
        max_w, max_h = 180, 132
        scale = min(max_w / art.width, max_h / art.height)
        art = art.resize((round(art.width * scale), round(art.height * scale)), Image.Resampling.LANCZOS)
        x = cell_box[0] + (230 - art.width) // 2
        y = cell_box[1] + 8 + (132 - art.height)
        board.paste(art, (x, y), art)
        ImageDraw.Draw(board).text((cell_box[0] + 16, cell_box[1] + 151), slot.label, font=font(13, bold=True), fill=INK)
        ImageDraw.Draw(board).text((cell_box[0] + 16, cell_box[1] + 171), f"{slot.depth} · bottom-center", font=font(11), fill=RUST)
    canvas.paste(board, (838, 192))

    # Slot and anchor proof.
    draw.rounded_rectangle((48, 634, 1552, 952), 12, fill="#fff3d3", outline=WOOD, width=3)
    draw.text((70, 654), "3 · RECOMPOSED SCENE / SLOT + BASELINE PROOF", font=font(16, bold=True), fill=INK)
    scene_small = scene.resize((1024, 704), Image.Resampling.LANCZOS).resize((360, 248), Image.Resampling.LANCZOS)
    canvas.paste(scene_small, (76, 690))
    overlay = ImageDraw.Draw(canvas)
    for slot in SLOTS:
        box = slot_box(slot, (360, 248))
        moved = (box[0] + 76, box[1] + 690, box[2] + 76, box[3] + 690)
        color = BRASS if slot.depth != "P3" else RUST
        overlay.rectangle(moved, outline=color, width=2)
        anchor_x = round((moved[0] + moved[2]) / 2)
        anchor_y = moved[3]
        overlay.ellipse((anchor_x - 4, anchor_y - 4, anchor_x + 4, anchor_y + 4), fill=color, outline=INK)

    x = 478
    y = 700
    for slot in SLOTS:
        overlay.text((x, y), f"{slot.depth}  {slot.label}", font=font(15, bold=True), fill=INK)
        overlay.text(
            (x + 235, y),
            f"slot {slot.left:g},{slot.top:g} · {slot.width:g}×{slot.height:g}%",
            font=font(14),
            fill=RUST,
        )
        y += 37
    overlay.text((1102, 704), "COMPOSITION RULE", font=font(14, bold=True), fill=BRASS)
    overlay.text((1102, 737), "Backdrop is opaque and empty.", font=font(14), fill=INK)
    overlay.text((1102, 766), "Cutouts carry real alpha.", font=font(14), fill=INK)
    overlay.text((1102, 795), "Shadows are a separate layer.", font=font(14), fill=INK)
    overlay.text((1102, 824), "Labels / flags / values stay UI.", font=font(14), fill=INK)
    overlay.text((1102, 866), "Recomposition is byte-stable.", font=font(14, bold=True), fill=RUST)
    return canvas


def render_contact_sheet(root: Path) -> Image.Image:
    desktop = Image.open(root / "proofs" / "desktop-1440x900.webp").convert("RGB")
    phone = Image.open(root / "proofs" / "phone-375x812.webp").convert("RGB")
    zoom = Image.open(root / "proofs" / "max-zoom-1024x704.webp").convert("RGB")
    layers = Image.open(root / "proofs" / "layer-separation-1600x1000.webp").convert("RGB")

    canvas = Image.new("RGB", (1600, 1120), "#ead5a2")
    draw = ImageDraw.Draw(canvas)
    draw.text((42, 28), "ISSUE #608 · CITY ART CHECKPOINT 1", font=font(34, display=True), fill=INK)
    draw.text((44, 74), "Gilded Harbor Diorama · representative six-role integrated proof", font=font(16, bold=True), fill=RUST)

    desktop_thumb = desktop.resize((864, 540), Image.Resampling.LANCZOS)
    canvas.paste(desktop_thumb, (42, 116))
    draw.rectangle((41, 115, 907, 657), outline=WOOD, width=2)
    draw.text((42, 670), "DESKTOP · scene rendered at native 1024×704", font=font(15, bold=True), fill=INK)

    phone_thumb = phone.resize((248, 537), Image.Resampling.LANCZOS)
    canvas.paste(phone_thumb, (936, 116))
    draw.rectangle((935, 115, 1185, 655), outline=WOOD, width=2)
    draw.text((936, 670), "PHONE · 375×812", font=font(15, bold=True), fill=INK)

    zoom_thumb = zoom.resize((344, 237), Image.Resampling.LANCZOS)
    canvas.paste(zoom_thumb, (1214, 116))
    draw.rectangle((1213, 115, 1559, 354), outline=WOOD, width=2)
    draw.text((1214, 367), "MAX ZOOM · TAVERN + TRADE", font=font(15, bold=True), fill=INK)

    layers_thumb = layers.resize((344, 215), Image.Resampling.LANCZOS)
    canvas.paste(layers_thumb, (1214, 413))
    draw.rectangle((1213, 412, 1559, 629), outline=WOOD, width=2)
    draw.text((1214, 642), "LAYER / ANCHOR PROOF", font=font(15, bold=True), fill=INK)

    draw.rounded_rectangle((42, 732, 1558, 1072), 12, fill="#fff2ce", outline=WOOD, width=3)
    draw.text((68, 756), "WHAT THIS CHECKPOINT ASKS YOU TO APPROVE", font=font(23, display=True), fill=INK)
    notes = (
        "1  One authored harbor: luminous water, warm limestone, weathered timber, coherent northwest light.",
        "2  Reduced fortress dominance: a low perimeter wall supports the city instead of swallowing it.",
        "3  Clear silhouettes: town hall, tavern, economy, recruitment, and shipyard read as different jobs.",
        "4  Reviewed masks: enclosed gaps clear; no detached pale floor mattes or checker islands.",
        "5  Responsive proof: roles remain legible in the actual 375×258 phone scene and at the existing 3× zoom.",
    )
    y = 812
    for line in notes:
        draw.text((72, y), line, font=font(16, bold=line.startswith("1")), fill=INK)
        y += 46
    draw.text((72, 1040), "Checkpoint only · no runtime assets or code changed", font=font(14, bold=True), fill=RUST)
    return canvas


def build(root: Path) -> dict[str, str]:
    root.mkdir(parents=True, exist_ok=True)
    cutouts = render_assets(root)
    scene, empty = render_scene(root, cutouts)

    save_webp(render_desktop(root, scene), root / "proofs" / "desktop-1440x900.webp", 82)
    save_webp(render_phone(root, scene), root / "proofs" / "phone-375x812.webp", 84)
    save_webp(render_zoom(root, scene), root / "proofs" / "max-zoom-1024x704.webp", 84)
    render_stress_proofs(root, cutouts)
    save_webp(
        render_layer_sheet(root, scene, empty, cutouts),
        root / "proofs" / "layer-separation-1600x1000.webp",
        82,
    )
    save_webp(render_contact_sheet(root), root / "proofs" / "checkpoint-contact-sheet-1600x1120.webp", 80)

    generated = sorted(
        path
        for directory in (root / "cutouts", root / "layers", root / "proofs")
        for path in directory.rglob("*.webp")
    )
    return {str(path.relative_to(root)): sha256(path) for path in generated}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=PACKAGE)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    if args.check:
        with tempfile.TemporaryDirectory(prefix="aop-city-checkpoint-") as temp:
            candidate = Path(temp)
            candidate_hashes = build(candidate)
            current_hashes = {
                str(path.relative_to(args.output)): sha256(path)
                for directory in (args.output / "cutouts", args.output / "layers", args.output / "proofs")
                for path in directory.rglob("*.webp")
            }
            if candidate_hashes != current_hashes:
                print(json.dumps({"expected": current_hashes, "rendered": candidate_hashes}, indent=2))
                raise SystemExit("rendered checkpoint differs from retained files")
            print(f"PASS: deterministic recomposition matched {len(current_hashes)} files")
    else:
        hashes = build(args.output)
        print(json.dumps(hashes, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
