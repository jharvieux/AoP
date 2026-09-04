#!/usr/bin/env python3
"""Build the issue #608 production city art and review proofs.

This is authoring-only tooling. It mirrors the current CityScene 16:11 canvas
and SCENE_SLOTS geometry while producing the separately layered runtime assets.
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
REPOSITORY = PACKAGE.parents[2]
PUBLIC_ART = REPOSITORY / "apps" / "web" / "public" / "art"
RUNTIME_CITY = PUBLIC_ART / "city"
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
    Slot("sawmill", "Sawmill", "wood economy", 2, 48, 13, 16, "P2"),
    Slot("ironmine", "Iron mine", "ore economy", 16, 50, 13, 16, "P2"),
    Slot("distillery", "Distillery", "rum economy", 30, 50, 13, 16, "P2"),
    Slot("barracks", "Barracks", "recruitment", 47, 46, 13, 17, "P2"),
    Slot("garrisonHall", "Garrison hall", "recruitment", 62, 46, 13, 18, "P2"),
    Slot("fortressArmory", "Fortress armory", "recruitment", 64, 24, 13, 19, "P2"),
    Slot("grandArsenal", "Grand arsenal", "recruitment", 80, 20, 15, 22, "P2"),
    Slot("palisade", "Palisade", "fortification", 4, 66, 17, 12, "P3"),
    Slot("stonewall", "Stone wall", "fortification", 24, 66, 17, 12, "P3"),
    Slot("citadel", "Citadel", "fortification", 44, 62, 16, 16, "P3"),
)

SOURCE_NAMES = {
    "townhall": "townhall-source-r1.webp",
    "tavern": "tavern-source-r1.webp",
    "tradehouse": "tradehouse-source-r1.webp",
    "sawmill": "sawmill-source-r1.webp",
    "ironmine": "ironmine-source-r1.webp",
    "distillery": "distillery-source-r1.webp",
    "barracks": "barracks-source-r2.webp",
    "garrisonHall": "garrisonhall-source-r1.webp",
    "fortressArmory": "fortress-armory-source-r1.webp",
    "grandArsenal": "grand-arsenal-source-r1.webp",
    "palisade": "palisade-source-r1.webp",
    "stonewall": "stonewall-source-r1.webp",
    "citadel": "citadel-source-r1.webp",
    "citadel-tower": "citadel-tower-source-r1.webp",
    "shipyard": "shipyard-source-r2.webp",
}

STARTING_STATE = ("townhall", "barracks")
MIDGAME_STATE = (
    "townhall",
    "tavern",
    "tradehouse",
    "sawmill",
    "barracks",
    "garrisonHall",
    "palisade",
    "shipyard",
)
FULL_STATE = tuple(slot.asset for slot in SLOTS)
FACTION_IDS = ("pirates", "british", "spanish", "french", "dutch")


def paint_order(slot: Slot) -> tuple[int, float, str]:
    """Match CityScene's depth, bottom-baseline, and content-id ordering."""

    return int(slot.depth[1:]), slot.top + slot.height, slot.asset


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
    # Reserve a real transparent edge in the retained file even when the
    # semantic subject touched its generated source canvas. This is stronger
    # than relying on the generator's requested margin.
    max_subject_edge = 876
    if max(result.size) > max_subject_edge:
        scale = max_subject_edge / max(result.size)
        result = result.resize(
            (round(result.width * scale), round(result.height * scale)), Image.Resampling.LANCZOS
        )
    return ImageOps.expand(result, border=12, fill=(0, 0, 0, 0))


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


def render_scene(root: Path, cutouts: dict[str, Image.Image]) -> None:
    raw_backdrop = Image.open(PACKAGE / "sources" / "empty-harbor-source-r3.webp").convert("RGB")
    backdrop = fit_cover(raw_backdrop, MASTER_SIZE, align_x=0.48)
    # P10 supplies the complete fourteen-foundation production terrain. Retain
    # P8's deliberately extended lower-right natural coast so the immutable
    # shipyard slot still spans dry shore and open water. The two built-in
    # edits share the same camera and source composition; a broad feather keeps
    # this deterministic local merge free of a visible seam.
    shore_source = Image.open(PACKAGE / "sources" / "empty-harbor-source-r2.webp").convert("RGB")
    shore = fit_cover(shore_source, MASTER_SIZE, align_x=0.48)
    shore_mask = Image.new("L", MASTER_SIZE, 0)
    ImageDraw.Draw(shore_mask).polygon(
        ((1540, 710), (2048, 640), (2048, 1408), (1330, 1408), (1440, 1030)),
        fill=255,
    )
    shore_mask = shore_mask.filter(ImageFilter.GaussianBlur(38))
    backdrop = Image.composite(shore, backdrop, shore_mask)
    shore_shifted = Image.new("RGB", MASTER_SIZE)
    shore_shifted.paste(shore.crop((0, 0, MASTER_SIZE[0], MASTER_SIZE[1] - 96)), (0, 96))
    shore_shifted.paste(shore.crop((0, 0, MASTER_SIZE[0], 96)), (0, 0))
    shore_extension_mask = Image.new("L", MASTER_SIZE, 0)
    ImageDraw.Draw(shore_extension_mask).polygon(
        ((1780, 780), (2048, 730), (2048, 1270), (1860, 1230), (1800, 1000)),
        fill=255,
    )
    shore_extension_mask = shore_extension_mask.filter(ImageFilter.GaussianBlur(28))
    backdrop = Image.composite(shore_shifted, backdrop, shore_extension_mask)
    backdrop = ImageEnhance.Color(backdrop).enhance(0.94)
    backdrop = ImageEnhance.Contrast(backdrop).enhance(1.03)
    save_webp(backdrop, root / "layers" / "empty-backdrop-2048x1408.webp", 60)

    scene = backdrop.convert("RGBA")
    shadow_group = Image.new("RGBA", MASTER_SIZE, (0, 0, 0, 0))
    for slot in SLOTS:
        shadow_group = Image.alpha_composite(shadow_group, shadow_layer(slot, MASTER_SIZE))
    save_webp(shadow_group, root / "layers" / "contact-shadows.webp", 88)
    scene = Image.alpha_composite(scene, shadow_group)

    for slot in sorted(SLOTS, key=paint_order):
        rendered, x, y = contained(cutouts[slot.asset], slot_box(slot, MASTER_SIZE))
        scene.alpha_composite(rendered, (x, y))

    runtime = scene.convert("RGB").resize(RUNTIME_SIZE, Image.Resampling.LANCZOS)
    save_webp(runtime, root / "proofs" / "scene-runtime-1024x704.webp", 84)
    empty_runtime = backdrop.resize(RUNTIME_SIZE, Image.Resampling.LANCZOS)
    save_webp(empty_runtime, root / "proofs" / "empty-runtime-1024x704.webp", 82)


def framed_panel(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int = 12) -> None:
    draw.rounded_rectangle(box, radius, fill=WOOD, outline=BRASS, width=2)
    inner = (box[0] + 5, box[1] + 5, box[2] - 5, box[3] - 5)
    draw.rounded_rectangle(inner, max(4, radius - 4), outline="#76591d", width=1)


def render_desktop(root: Path, scene: Image.Image) -> Image.Image:
    canvas = Image.new("RGB", (1440, 900), INK)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, 1439, 899), outline=BRASS, width=3)
    draw.text((28, 22), "PORT PROVIDENCE", font=font(34, display=True), fill=WHITE)
    draw.text((30, 64), "PRODUCTION CANDIDATE · DIRECTION B", font=font(13, bold=True), fill=BRASS)
    scene_runtime = scene.resize(RUNTIME_SIZE, Image.Resampling.LANCZOS)
    canvas.paste(scene_runtime, (28, 126))
    draw.rectangle((27, 125, 1052, 830), outline=BRASS, width=2)

    framed_panel(draw, (1072, 126, 1410, 830))
    draw.text((1096, 152), "COMPLETE CITY", font=font(24, display=True), fill=WHITE)
    draw.line((1096, 192, 1386, 192), fill="#7f6133", width=1)
    y = 218
    categories = (
        ("CIVIC", "town hall anchor", BRASS),
        ("ECONOMY", "four distinct roles", BRASS),
        ("RECRUITMENT", "four-tier progression", BRASS),
        ("FORTIFICATION", "three low perimeter stages", RUST),
        ("SHORE", "connected shipyard", SEA),
    )
    for label, detail, color in categories:
        draw.ellipse((1098, y + 3, 1112, y + 17), fill=color)
        draw.text((1124, y), label, font=font(16, bold=True), fill=PARCHMENT)
        draw.text((1124, y + 23), detail, font=font(13), fill=PARCHMENT_DIM)
        y += 84
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


def render_contact_sheet(root: Path) -> Image.Image:
    desktop = Image.open(root / "proofs" / "desktop-1440x900.webp").convert("RGB")
    phone = Image.open(root / "proofs" / "phone-375x812.webp").convert("RGB")
    zoom = Image.open(root / "proofs" / "max-zoom-1024x704.webp").convert("RGB")
    layers = Image.open(root / "proofs" / "layer-separation-1600x1000.webp").convert("RGB")

    canvas = Image.new("RGB", (1600, 1120), "#ead5a2")
    draw = ImageDraw.Draw(canvas)
    draw.text((42, 28), "ISSUE #608 · CITY ART PRODUCTION CANDIDATE", font=font(34, display=True), fill=INK)
    draw.text((44, 74), "Gilded Harbor Diorama · complete fourteen-building integrated proof", font=font(16, bold=True), fill=RUST)

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
    draw.text((68, 756), "WHAT CHECKPOINT 2 ASKS YOU TO APPROVE", font=font(23, display=True), fill=INK)
    notes = (
        "1  One authored harbor: luminous water, warm limestone, weathered timber, coherent northwest light.",
        "2  Reduced fortress dominance: a low perimeter wall supports the city instead of swallowing it.",
        "3  Clear silhouettes: all economy and recruitment tiers read as different jobs.",
        "4  Reviewed masks: all fifteen cutouts clear enclosed checker, matte, and detached-island defects.",
        "5  Responsive proof: the complete city remains legible at 375×258 and the existing 3× zoom.",
    )
    y = 812
    for line in notes:
        draw.text((72, y), line, font=font(16, bold=line.startswith("1")), fill=INK)
        y += 46
    draw.text((72, 1040), "Production candidate · checkpoint 2 is not yet approved", font=font(14, bold=True), fill=RUST)
    return canvas


def compose_state(
    backdrop: Image.Image,
    cutouts: dict[str, Image.Image],
    building_ids: tuple[str, ...],
    faction: str | None = None,
    size: tuple[int, int] = MASTER_SIZE,
) -> Image.Image:
    """Compose one state with the shipping slot and bottom-anchor contract."""

    scene = backdrop.resize(size, Image.Resampling.LANCZOS).convert("RGBA")
    active = set(building_ids)
    for slot in sorted(SLOTS, key=paint_order):
        if slot.asset not in active:
            continue
        scene = Image.alpha_composite(scene, shadow_layer(slot, size))
        rendered, x, y = contained(cutouts[slot.asset], slot_box(slot, size))
        scene.alpha_composite(rendered, (x, y))
        if slot.asset == "citadel":
            box = slot_box(slot, size)
            slot_width = box[2] - box[0]
            tower_box = (
                round(box[2] - slot_width * 0.44),
                box[1],
                round(box[2] - slot_width * 0.06),
                box[3],
            )
            tower, tx, ty = contained(cutouts["citadel-tower"], tower_box)
            scene.alpha_composite(tower, (tx, ty))

    if faction and "townhall" in active:
        hall = slot_box(next(slot for slot in SLOTS if slot.asset == "townhall"), size)
        flag_path = PUBLIC_ART / "factions" / faction / "flag.png"
        flag = Image.open(flag_path).convert("RGBA")
        flag_size = max(16, round((hall[2] - hall[0]) * 0.19))
        flag.thumbnail((flag_size, flag_size), Image.Resampling.LANCZOS)
        mast_x = round(hall[0] + (hall[2] - hall[0]) * 0.67)
        mast_y = round(hall[1] - (hall[3] - hall[1]) * 0.06)
        draw = ImageDraw.Draw(scene)
        draw.line((mast_x, mast_y, mast_x, mast_y + flag.height * 2), fill=(62, 43, 25, 255), width=max(2, size[0] // 512))
        scene.alpha_composite(flag, (mast_x + 2, mast_y))
    return scene.convert("RGB")


def render_state_contact(root: Path, states: dict[str, Image.Image]) -> Image.Image:
    canvas = Image.new("RGB", (1600, 620), "#ead5a2")
    draw = ImageDraw.Draw(canvas)
    draw.text((42, 24), "CITY PROGRESSION · SHIPPING STATE TRUTH", font=font(31, display=True), fill=INK)
    draw.text((44, 67), "Starting, midgame, and fully constructed · exact current SCENE_SLOTS", font=font(15, bold=True), fill=RUST)
    for index, (name, scene) in enumerate(states.items()):
        x = 42 + index * 518
        thumb = scene.resize((492, 338), Image.Resampling.LANCZOS)
        canvas.paste(thumb, (x, 114))
        draw.rectangle((x - 1, 113, x + 493, 453), outline=WOOD, width=2)
        count = len((STARTING_STATE, MIDGAME_STATE, FULL_STATE)[index])
        draw.text((x, 472), name.upper(), font=font(21, display=True), fill=INK)
        draw.text((x, 506), f"{count} city.buildings entries", font=font(14, bold=True), fill=BRASS)
    draw.text((42, 560), "Every constructed element remains a separate alpha layer; the empty backdrop contains no future buildings.", font=font(15, bold=True), fill=INK)
    return canvas


def render_faction_contact(root: Path, scenes: dict[str, Image.Image]) -> Image.Image:
    canvas = Image.new("RGB", (1600, 748), "#ead5a2")
    draw = ImageDraw.Draw(canvas)
    draw.text((42, 24), "FIVE FACTIONS · SAME CITY ART CONTRACT", font=font(31, display=True), fill=INK)
    draw.text((44, 68), "Only the town-hall flag changes; buildings remain content-ID driven and theme-overridable.", font=font(15, bold=True), fill=RUST)
    positions = ((42, 116), (552, 116), (1062, 116), (297, 406), (807, 406))
    for (faction, scene), (x, y) in zip(scenes.items(), positions, strict=True):
        thumb = scene.resize((468, 322), Image.Resampling.LANCZOS)
        canvas.paste(thumb, (x, y))
        draw.rectangle((x - 1, y - 1, x + 469, y + 323), outline=WOOD, width=2)
        draw.rounded_rectangle((x + 12, y + 12, x + 166, y + 43), 8, fill=(32, 21, 14))
        draw.text((x + 24, y + 19), faction.upper(), font=font(14, bold=True), fill=WHITE)
    return canvas


def render_production_layer_sheet(
    backdrop: Image.Image, cutouts: dict[str, Image.Image]
) -> Image.Image:
    canvas = Image.new("RGB", (1800, 1180), "#ead5a2")
    draw = ImageDraw.Draw(canvas)
    draw.text((42, 26), "PRODUCTION LAYERS · 14 BUILDINGS + CITADEL TOWER", font=font(31, display=True), fill=INK)
    draw.text((44, 70), "Reviewed semantic masks · magenta / dark-teal alpha stress · exact bottom anchors", font=font(15, bold=True), fill=RUST)
    empty = backdrop.resize((700, 481), Image.Resampling.LANCZOS)
    canvas.paste(empty, (42, 116))
    draw.rectangle((41, 115, 743, 598), outline=WOOD, width=2)
    draw.text((42, 614), "OPAQUE BUILDING-FREE BACKDROP", font=font(15, bold=True), fill=INK)

    board = stress_background((1000, 960))
    bd = ImageDraw.Draw(board)
    all_assets = list(SOURCE_NAMES)
    for index, asset in enumerate(all_assets):
        col, row = index % 4, index // 4
        cell_x, cell_y = col * 250, row * 240
        art = cutouts[asset]
        scale = min(205 / art.width, 165 / art.height)
        art = art.resize((round(art.width * scale), round(art.height * scale)), Image.Resampling.LANCZOS)
        x = cell_x + (250 - art.width) // 2
        y = cell_y + 10 + 165 - art.height
        board.paste(art, (x, y), art)
        bd.rounded_rectangle((cell_x + 8, cell_y + 182, cell_x + 236, cell_y + 232), 5, fill="#ead5a2")
        bd.text((cell_x + 16, cell_y + 188), asset, font=font(13, bold=True), fill=INK)
        bd.text((cell_x + 16, cell_y + 210), "RGBA · bottom-center", font=font(11), fill=RUST)
    canvas.paste(board, (770, 116))
    draw.rectangle((769, 115, 1771, 1078), outline=WOOD, width=2)
    draw.text((42, 665), "LAYER CONTRACT", font=font(18, display=True), fill=INK)
    lines = (
        "• No building, flag, label, value, ring, UI, signature, or watermark in the terrain layer.",
        "• One connected alpha subject per cutout; enclosed openings remain transparent.",
        "• Common 55° camera, northwest light, warm limestone, weathered timber, red-clay accents.",
        "• Palisade -> stone wall -> citadel reads as a low evolving perimeter, not a dominant keep.",
        "• Shipyard's landward gangway meets the corrected coast while its drydock remains over water.",
    )
    y = 708
    for line in lines:
        draw.text((48, y), line, font=font(14, bold=True), fill=INK)
        y += 43
    return canvas


def render_zoom_evidence(full_master: Image.Image) -> Image.Image:
    canvas = Image.new("RGB", (1600, 1040), "#ead5a2")
    draw = ImageDraw.Draw(canvas)
    draw.text((42, 24), "1× / CURRENT MAX-ZOOM · 2×-EQUIVALENT SOURCE", font=font(30, display=True), fill=INK)
    draw.text((44, 67), "The full scene is sampled from the retained 2048×1408 master; close crops expose source edge quality.", font=font(15, bold=True), fill=RUST)
    full = full_master.resize((760, 523), Image.Resampling.LANCZOS)
    canvas.paste(full, (42, 114))
    draw.rectangle((41, 113, 803, 638), outline=WOOD, width=2)
    draw.text((42, 653), "1× WHOLE CITY", font=font(16, bold=True), fill=INK)

    crop_specs = (
        ("CIVIC + TAVERN", (80, 40, 1120, 920)),
        ("RECRUITMENT TIERS", (850, 330, 1950, 743)),
        ("FORTIFICATION + SHORE", (520, 760, 2048, 1408)),
    )
    y = 114
    for label, box in crop_specs:
        crop = fit_cover(full_master.crop(box), (720, 270))
        x = 838
        canvas.paste(crop, (x, y))
        draw.rectangle((837, y - 1, 1559, y + 271), outline=WOOD, width=2)
        draw.text((850, y + 236), f"3× MAX · {label}", font=font(14, bold=True), fill=WHITE, stroke_width=2, stroke_fill=INK)
        y += 292
    draw.text((42, 714), "SOURCE / DISPLAY CLAIM", font=font(18, display=True), fill=INK)
    claim = (
        "This proves the production direction and shipping-layer resolution at 2×-equivalent capture.",
        "It does not claim vector detail or infinite zoom; the live UI still caps at its existing 3× stop.",
    )
    draw.text((48, 758), claim[0], font=font(14, bold=True), fill=INK)
    draw.text((48, 791), claim[1], font=font(14), fill=RUST)
    return canvas


def capture_legacy_baseline(root: Path) -> None:
    """Capture the pre-replacement PNG consumer states once, before runtime writes."""

    backdrop = fit_cover(Image.open(RUNTIME_CITY / "backdrop.png").convert("RGB"), RUNTIME_SIZE)
    old_cutouts = {
        slot.asset: Image.open(RUNTIME_CITY / f"{slot.asset if slot.asset != 'stonewall' else 'stoneWall'}.png").convert("RGBA")
        for slot in SLOTS
    }
    old_cutouts["citadel-tower"] = Image.open(RUNTIME_CITY / "citadel-tower.png").convert("RGBA")
    scenes = {
        "starting": compose_state(backdrop, old_cutouts, STARTING_STATE, size=RUNTIME_SIZE),
        "midgame": compose_state(backdrop, old_cutouts, MIDGAME_STATE, size=RUNTIME_SIZE),
        "fully constructed": compose_state(backdrop, old_cutouts, FULL_STATE, size=RUNTIME_SIZE),
    }
    save_webp(render_state_contact(root, scenes), root / "proofs" / "baseline-current-states-1600x620.webp", 78)


def write_runtime_assets(cutouts: dict[str, Image.Image], backdrop: Image.Image) -> None:
    for asset, art in cutouts.items():
        runtime_name = "stoneWall" if asset == "stonewall" else asset
        save_webp(art, RUNTIME_CITY / f"{runtime_name}.webp", 88)
    save_webp(backdrop.resize(RUNTIME_SIZE, Image.Resampling.LANCZOS), RUNTIME_CITY / "backdrop.webp", 80)


def build_production(root: Path, write_runtime: bool) -> dict[str, str]:
    root.mkdir(parents=True, exist_ok=True)
    cutouts = render_assets(root)
    render_scene(root, cutouts)
    backdrop_master = Image.open(root / "layers" / "empty-backdrop-2048x1408.webp").convert("RGB")
    states_master = {
        "starting": compose_state(backdrop_master, cutouts, STARTING_STATE, "pirates"),
        "midgame": compose_state(backdrop_master, cutouts, MIDGAME_STATE, "pirates"),
        "fully constructed": compose_state(backdrop_master, cutouts, FULL_STATE, "pirates"),
    }
    states_runtime = {name: scene.resize(RUNTIME_SIZE, Image.Resampling.LANCZOS) for name, scene in states_master.items()}
    for name, scene in states_runtime.items():
        save_webp(scene, root / "proofs" / f"state-{name.replace(' ', '-')}-1024x704.webp", 82)
    save_webp(render_state_contact(root, states_runtime), root / "proofs" / "production-state-contact-1600x620.webp", 78)

    factions = {
        faction: compose_state(backdrop_master, cutouts, FULL_STATE, faction).resize(RUNTIME_SIZE, Image.Resampling.LANCZOS)
        for faction in FACTION_IDS
    }
    for faction, scene in factions.items():
        save_webp(scene, root / "proofs" / "factions" / f"{faction}-full-1024x704.webp", 78)
    faction_contact = render_faction_contact(root, factions)
    save_webp(faction_contact, root / "proofs" / "faction-contact-1600x748.webp", 76)

    full_master = states_master["fully constructed"]
    save_webp(render_zoom_evidence(full_master), root / "proofs" / "zoom-2x-evidence-1600x1040.webp", 76)
    save_webp(render_production_layer_sheet(backdrop_master, cutouts), root / "proofs" / "production-layer-contact-1800x1180.webp", 76)
    save_webp(full_master.resize((375, 258), Image.Resampling.LANCZOS), root / "proofs" / "phone-scene-375x258.webp", 84)
    # Preserve the checkpoint-one review paths while promoting the complete
    # batch to the more explicit production evidence above.
    save_webp(render_desktop(root, full_master), root / "proofs" / "desktop-1440x900.webp", 82)
    save_webp(render_phone(root, full_master), root / "proofs" / "phone-375x812.webp", 84)
    save_webp(render_zoom(root, full_master), root / "proofs" / "max-zoom-1024x704.webp", 84)
    legacy_layer_path = root / "proofs" / "layer-separation-1600x1000.webp"
    production_layers = render_production_layer_sheet(backdrop_master, cutouts)
    save_webp(production_layers.resize((1600, 1000), Image.Resampling.LANCZOS), legacy_layer_path, 80)
    save_webp(render_contact_sheet(root), root / "proofs" / "checkpoint-contact-sheet-1600x1120.webp", 80)
    render_stress_proofs(root, cutouts)
    tower_slot = Slot("citadel-tower", "Citadel tower", "fortification accessory", 0, 0, 0, 0, "P3")
    canvas = stress_background((1024, 1024))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, 1023, 103), fill=INK)
    draw.text((28, 19), "CITADEL TOWER · ALPHA STRESS", font=font(26, display=True), fill=WHITE)
    draw.text((30, 61), "Native cutout · magenta / dark-teal backgrounds", font=font(14, bold=True), fill=BRASS)
    tower = cutouts[tower_slot.asset]
    canvas.paste(tower, ((1024 - tower.width) // 2, 112 + (900 - tower.height) // 2), tower)
    save_webp(canvas, root / "proofs" / "stress" / "citadel-tower-magenta-1024.webp", 84)

    if write_runtime:
        write_runtime_assets(cutouts, backdrop_master)

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
    parser.add_argument("--capture-baseline", action="store_true")
    args = parser.parse_args()

    if args.capture_baseline:
        capture_legacy_baseline(args.output)
        print("captured pre-replacement starting/midgame/full runtime states")
        return
    if args.check:
        with tempfile.TemporaryDirectory(prefix="aop-city-checkpoint-") as temp:
            candidate = Path(temp)
            candidate_hashes = build_production(candidate, write_runtime=False)
            current_hashes = {
                str(path.relative_to(args.output)): sha256(path)
                for directory in (args.output / "cutouts", args.output / "layers", args.output / "proofs")
                for path in directory.rglob("*.webp")
                if path.name != "baseline-current-states-1600x620.webp"
            }
            candidate_hashes.pop("proofs/baseline-current-states-1600x620.webp", None)
            if candidate_hashes != current_hashes:
                print(json.dumps({"expected": current_hashes, "rendered": candidate_hashes}, indent=2))
                raise SystemExit("rendered checkpoint differs from retained files")
            print(f"PASS: deterministic recomposition matched {len(current_hashes)} files")
    else:
        hashes = build_production(args.output, write_runtime=True)
        print(json.dumps(hashes, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
