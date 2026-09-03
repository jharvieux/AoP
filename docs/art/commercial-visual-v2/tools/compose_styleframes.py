#!/usr/bin/env python3
"""Compose #607 generated sources into deterministic gameplay-size review frames.

This script does not make runtime assets. It adds legible reference chrome, entity-state
proofs, responsive crops, and implementation diagrams around the model-generated art.
Run with the ComfyUI venv (Pillow is already installed there).
"""

from __future__ import annotations

import textwrap
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


REPO = Path(__file__).resolve().parents[4]
ROOT = REPO / "docs" / "art" / "commercial-visual-v2"
SOURCES = ROOT / "sources"
CANDIDATES = ROOT / "candidates"
CONTRACTS = ROOT / "contracts"

DISPLAY_FONT = Path("/System/Library/Fonts/Supplemental/Georgia Bold.ttf")
BODY_FONT = Path("/System/Library/Fonts/Supplemental/Trebuchet MS.ttf")
BODY_BOLD_FONT = Path("/System/Library/Fonts/Supplemental/Trebuchet MS Bold.ttf")

INK = (44, 24, 12)
INK_SOFT = (83, 53, 29)
PANEL = (44, 29, 15)
PANEL_ALT = (60, 40, 20)
PARCHMENT = (203, 177, 119)
PARCHMENT_LIGHT = (243, 229, 194)
GOLD = (201, 162, 39)
RUST = (122, 46, 26)
TEXT = (243, 230, 200)
TEXT_DIM = (208, 188, 150)
DEEP = (27, 74, 107)
SHALLOWS = (42, 106, 143)
FOG = (11, 26, 38)
SUCCESS = (63, 125, 84)
ENEMY = (166, 64, 47)
NEUTRAL = (154, 151, 137)
ROUTE = (224, 182, 79)
LATER = (92, 122, 148)


@dataclass(frozen=True)
class Direction:
    id: str
    source_stem: str
    source_tag: str
    name: str
    short_name: str
    subtitle: str
    chrome: str


DIRECTIONS = {
    "a": Direction(
        id="a",
        source_stem="chartmakers-gouache",
        source_tag="r2",
        name="Direction A — Chartmaker's Gouache",
        short_name="Chartmaker's Gouache",
        subtitle="Flat atlas clarity · matte pigment · inked silhouettes",
        chrome="paper",
    ),
    "b": Direction(
        id="b",
        source_stem="gilded-harbor-diorama",
        source_tag="r2",
        name="Direction B — Gilded Harbor Diorama",
        short_name="Gilded Harbor Diorama",
        subtitle="Layered depth · richer materials · selective brass detail",
        chrome="wood",
    ),
}

COMPARISON_DECISION_LINE = (
    "Direction B is approved for #608–#613 production. "
    "Direction A was not selected and remains comparison evidence."
)
COMPARISON_DIRECTION_STATUS = {
    "a": "NOT SELECTED · REJECTED DIRECTION",
    "b": "APPROVED · PRODUCTION TARGET",
}
VISUAL_SYSTEM_DECISION_LINE = (
    "Direction B approved · Direction A retained as comparison evidence · shared palette stays fixed"
)


MAP_SOURCE_SIZE = (1024, 704)
MAP_VIEWPORTS = {
    "desktop": ((1440, 760), (0.50, 0.48)),
    "tablet": ((768, 878), (0.46, 0.48)),
    "phone": ((375, 628), (0.45, 0.48)),
}

DS8_MAP_ISLANDS = [
    [(65, 106), (152, 60), (274, 79), (351, 139), (335, 220), (250, 259), (143, 240), (71, 188)],
    [(469, 86), (581, 43), (728, 62), (832, 117), (923, 191), (902, 295), (814, 351), (695, 332), (624, 276), (512, 250), (446, 174)],
    [(105, 421), (206, 370), (311, 397), (349, 474), (290, 554), (171, 568), (84, 512)],
    [(509, 477), (602, 424), (714, 452), (762, 532), (705, 605), (602, 620), (519, 573)],
    [(849, 474), (924, 444), (991, 486), (987, 558), (916, 592), (850, 551)],
]

# Every gameplay semantic below is anchored once in the 1024x704 map source. Responsive
# screens project this state through the same cover transform as the terrain; they never
# place entities as fractions of the post-crop viewport.
MAP_WORLD_STATES = {
    "a": {
        "own_city": (315, 170),
        "enemy_city": (620, 180),
        "neutral_city": (570, 520),
        "own_ship": (410, 460),
        "enemy_ship": (400, 300),
        "sea_encounter": (520, 370),
        "land_encounter": (540, 210),
        "land_site": (660, 500),
        "route_target": (510, 410),
    },
    "b": {
        "own_city": (500, 345),
        "enemy_city": (600, 240),
        "neutral_city": (650, 520),
        "own_ship": (390, 520),
        "enemy_ship": (350, 220),
        "sea_encounter": (500, 200),
        "land_encounter": (540, 330),
        "land_site": (660, 440),
        "route_target": (485, 455),
    },
}

MAP_LAND_REGIONS = {
    "a": DS8_MAP_ISLANDS,
    "b": [
        [(395, 285), (470, 250), (560, 255), (635, 300), (650, 365), (600, 410), (535, 445), (445, 425), (382, 370)],
        [(570, 170), (680, 170), (705, 300), (630, 310), (575, 255)],
        [(625, 365), (800, 330), (850, 600), (650, 600), (600, 520)],
    ],
}

MAP_FOG_REGIONS = {
    "a": [(650, 0), (1024, 0), (1024, 704), (650, 704), (680, 560), (690, 420), (675, 260), (660, 120)],
    "b": [(650, 0), (1024, 0), (1024, 704), (650, 704), (675, 560), (680, 420), (680, 260), (660, 120)],
}

MAP_TERRAIN_REQUIREMENTS = {
    "own_city": "land",
    "enemy_city": "land",
    "neutral_city": "land",
    "own_ship": "water",
    "enemy_ship": "water",
    "sea_encounter": "water",
    "land_encounter": "land",
    "land_site": "land",
    "route_target": "water",
}

RANGE_OFFSETS = [(-48, -20), (-12, -48), (34, -24), (62, 16), (18, 52)]

MAP_ROUTE_PATHS = {
    "a": [(410, 460), (430, 450), (450, 442), (470, 435), (490, 423), (510, 410)],
    "b": [(390, 520), (410, 510), (430, 500), (450, 488), (468, 472), (485, 455)],
}
MAP_ROUTE_TURN_INDEX = 3

SELECTED_FLEET_LABEL = "Venture · 5/8"
SELECTED_FLEET_LABEL_OFFSETS = {
    "desktop": (-46, 28),
    "tablet": (-46, 28),
    "phone": (-42, 24),
}
SELECTED_FLEET_LABEL_SIZES = {"desktop": 13, "tablet": 13, "phone": 11}


def font(size: int, bold: bool = False, display: bool = False) -> ImageFont.FreeTypeFont:
    path = DISPLAY_FONT if display else BODY_BOLD_FONT if bold else BODY_FONT
    return ImageFont.truetype(str(path), size)


def rgba(color: tuple[int, int, int], alpha: int) -> tuple[int, int, int, int]:
    return (*color, alpha)


def source_path(direction: Direction, asset: str) -> Path:
    if direction.id == "b" and asset == "map":
        tag = "r1"
    elif direction.id == "b" and asset == "full":
        tag = "r3"
    else:
        tag = direction.source_tag
    return SOURCES / f"{direction.id}-{direction.source_stem}-{asset}-{tag}.webp"


def _soft_patch(
    image: Image.Image,
    center: tuple[int, int],
    radius: tuple[int, int],
    color: tuple[int, int, int],
    alpha: int,
) -> None:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    cx, cy = center
    rx, ry = radius
    draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=rgba(color, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(max(8, min(rx, ry) // 3)))
    image.alpha_composite(layer)


def ds8_map_base() -> Image.Image:
    """Build the DS8 continuity map around the checkpoint's proven token shape.

    The wide-scene r1/r2 model outputs are deliberately not used: they are retained as
    rejected evidence. This deterministic atlas ground lets the approved DS8 cutout style
    carry landmarks without asking SD1.5 to solve an environment composition it cannot.
    """
    image = Image.new("RGBA", (1024, 704), rgba(DEEP, 255))
    draw = ImageDraw.Draw(image, "RGBA")
    for y in range(704):
        t = y / 703
        color = (
            round(30 + 7 * t),
            round(101 + 27 * t),
            round(126 + 35 * t),
            255,
        )
        draw.line((0, y, 1024, y), fill=color)
    for center, radius in [((180, 115), (210, 120)), ((728, 258), (310, 180)), ((480, 610), (300, 96))]:
        _soft_patch(image, center, radius, (78, 174, 181), 42)
    # Hand-painted wave hatching, kept sparse enough for 24–40 px tokens.
    for row in range(18, 704, 44):
        offset = (row * 17) % 61
        for x in range(-30 + offset, 1024, 92):
            draw.arc((x, row, x + 50, row + 16), 196, 344, fill=rgba((211, 235, 222), 66), width=2)
    for index, poly in enumerate(DS8_MAP_ISLANDS):
        # Sand and surf are wider silhouettes beneath the land.
        draw.polygon(poly, fill=rgba((221, 202, 150), 255), outline=rgba((227, 239, 220), 210))
        cx = sum(p[0] for p in poly) // len(poly)
        cy = sum(p[1] for p in poly) // len(poly)
        inner = [(round(cx + (x - cx) * 0.91), round(cy + (y - cy) * 0.89)) for x, y in poly]
        draw.polygon(inner, fill=rgba((87, 123, 64), 255), outline=rgba((47, 80, 43), 255))
        # Layered gouache washes and deterministic forest marks.
        _soft_patch(image, (cx - 20, cy - 10), (max(35, (max(x for x, _ in poly) - min(x for x, _ in poly)) // 3), 70), (135, 153, 81), 42)
        min_x, max_x = min(x for x, _ in inner), max(x for x, _ in inner)
        min_y, max_y = min(y for _, y in inner), max(y for _, y in inner)
        for n in range(9 + index * 2):
            tx = min_x + 20 + ((n * 73 + index * 47) % max(24, max_x - min_x - 40))
            ty = min_y + 20 + ((n * 41 + index * 29) % max(24, max_y - min_y - 40))
            r = 8 + (n % 3) * 3
            draw.ellipse((tx - r, ty - r // 2, tx + r, ty + r // 2), fill=rgba((40, 80, 44), 175))
            draw.line((tx, ty, tx - 3, ty + 8), fill=rgba((50, 53, 31), 180), width=2)
    # A few shallow banks and reef marks make navigation space legible.
    for box in [(365, 247, 474, 306), (756, 371, 842, 421), (356, 550, 472, 614)]:
        draw.ellipse(box, outline=rgba((180, 227, 218), 120), width=8)
    return image.convert("RGB")


CITY_ASSET_PATH = REPO / "apps" / "web" / "public" / "art" / "city"


CITY_PLACEMENTS = {
    "townhall": (506, 208, 188),
    "tavern": (170, 342, 142),
    "tradehouse": (322, 340, 138),
    "sawmill": (160, 482, 126),
    "ironmine": (302, 492, 116),
    "distillery": (432, 476, 124),
    "barracks": (576, 412, 134),
    "garrisonHall": (708, 408, 124),
    "fortressArmory": (760, 300, 145),
    "grandArsenal": (884, 286, 158),
    "shipyard": (832, 558, 202),
    "citadel": (520, 590, 116),
}


CITY_STATES = {
    "empty": [],
    "start": ["townhall", "barracks"],
    "mid": ["townhall", "tavern", "shipyard", "sawmill", "tradehouse", "barracks", "garrisonHall", "palisade"],
    # The highest fortification art replaces lower visual tiers; all 14 underlying IDs remain.
    "full": ["townhall", "tavern", "shipyard", "sawmill", "tradehouse", "ironmine", "distillery", "barracks", "garrisonHall", "fortressArmory", "grandArsenal", "citadel"],
}


def _paste_building(scene: Image.Image, name: str, anchor: tuple[int, int, int]) -> None:
    cx, baseline, height = anchor
    asset_name = "citadel.png" if name == "citadel" else f"{name}.png"
    sprite = Image.open(CITY_ASSET_PATH / asset_name).convert("RGBA")
    scale = height / sprite.height
    sprite = sprite.resize((max(1, round(sprite.width * scale)), height), Image.Resampling.LANCZOS)
    sprite = ImageEnhance.Color(sprite).enhance(0.82)
    sprite = ImageEnhance.Contrast(sprite).enhance(1.06)
    x = round(cx - sprite.width / 2)
    y = baseline - sprite.height
    shadow_alpha = sprite.getchannel("A").filter(ImageFilter.GaussianBlur(8))
    shadow = Image.new("RGBA", sprite.size, rgba((25, 22, 13), 0))
    shadow.putalpha(shadow_alpha.point(lambda a: round(a * 0.26)))
    scene.alpha_composite(shadow, (x + 10, y + 13))
    scene.alpha_composite(sprite, (x, y))
    if name == "citadel":
        tower = Image.open(CITY_ASSET_PATH / "citadel-tower.png").convert("RGBA")
        tower_h = 126
        tower = tower.resize((round(tower.width * tower_h / tower.height), tower_h), Image.Resampling.LANCZOS)
        scene.alpha_composite(tower, (cx + 155, baseline - tower_h - 7))
        scene.alpha_composite(tower.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (cx - 210, baseline - tower_h - 7))


def ds8_city_base() -> Image.Image:
    image = Image.new("RGBA", (1024, 704), rgba((101, 129, 66), 255))
    draw = ImageDraw.Draw(image, "RGBA")
    # Broad painterly ground bands; the shoreline and roads are backdrop-safe.
    for y in range(704):
        t = y / 703
        color = (round(115 - 35 * t), round(143 - 33 * t), round(76 - 24 * t), 255)
        draw.line((0, y, 1024, y), fill=color)
    _soft_patch(image, (470, 264), (380, 210), (174, 169, 93), 34)
    sea = [(0, 620), (190, 605), (358, 619), (520, 596), (683, 574), (831, 542), (1024, 510), (1024, 704), (0, 704)]
    sand = [(0, 590), (185, 575), (355, 590), (515, 567), (676, 545), (825, 512), (1024, 478), (1024, 704), (0, 704)]
    draw.polygon(sand, fill=rgba((214, 188, 131), 255))
    draw.polygon(sea, fill=rgba((47, 133, 149), 255))
    draw.line(sand[:7], fill=rgba((247, 229, 181), 230), width=12, joint="curve")
    for i in range(8):
        y = 614 + i * 12
        draw.arc((70 + i * 87, y, 210 + i * 87, y + 28), 195, 345, fill=rgba((216, 240, 226), 78), width=3)
    # Roads converge naturally without becoming a baked gameplay overlay.
    road = rgba((189, 164, 105), 210)
    for points, width in [
        ([(503, 236), (489, 346), (507, 466), (522, 561)], 34),
        ([(492, 350), (348, 382), (182, 449)], 27),
        ([(515, 371), (675, 379), (866, 337)], 27),
        ([(520, 510), (685, 526), (830, 548)], 24),
    ]:
        draw.line(points, fill=road, width=width, joint="curve")
        draw.line(points, fill=rgba((111, 91, 49), 85), width=2, joint="curve")
    # Empty foundations are subtle terrain clearings, not object silhouettes.
    for cx, cy, rx, ry in [(170, 340, 78, 31), (327, 340, 72, 29), (580, 408, 76, 30), (722, 405, 70, 28), (852, 326, 78, 30)]:
        draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=rgba((170, 151, 92), 62), outline=rgba((84, 82, 47), 70), width=2)
    # Edge vegetation frames the playfield and preserves a calm center.
    for i in range(22):
        x = 18 + (i * 83) % 988
        y = 38 + (i * 47) % 150 if i < 14 else 455 + (i * 31) % 70
        r = 15 + (i % 4) * 4
        draw.ellipse((x - r, y - r // 2, x + r, y + r // 2), fill=rgba((43, 87, 45), 180))
        draw.line((x, y, x - 4, y + 16), fill=rgba((68, 57, 31), 190), width=3)
    return image


def ds8_city_state(asset: str) -> Image.Image:
    scene = ds8_city_base()
    entries = CITY_STATES[asset]
    for name in sorted(entries, key=lambda item: CITY_PLACEMENTS.get(item, (0, 0, 0))[1]):
        if name == "palisade":
            palisade = Image.open(CITY_ASSET_PATH / "palisade.png").convert("RGBA")
            palisade = palisade.resize((490, 189), Image.Resampling.LANCZOS)
            scene.alpha_composite(palisade, (270, 430))
            continue
        _paste_building(scene, name, CITY_PLACEMENTS[name])
    return scene.convert("RGB")


def load_source(direction: Direction, asset: str) -> Image.Image:
    if direction.id == "a":
        return ds8_map_base() if asset == "map" else ds8_city_state(asset)
    path = source_path(direction, asset)
    if not path.exists():
        raise FileNotFoundError(f"missing source: {path}")
    return Image.open(path).convert("RGB")


def proof_source(direction: Direction, asset: str) -> Image.Image:
    """Return a state-accurate modular proof, separate from the mood/style source.

    Direction B's generated r1/r2 state frames are retained as rejected evidence because
    diffusion did not honor exact construction counts. The proof deliberately uses the
    current separable cutouts so reviewers can verify arbitrary subsets and the empty
    backdrop independently of the final repaint.
    """
    if direction.id == "a":
        return ds8_city_state(asset)
    backdrop = Image.open(CITY_ASSET_PATH / "backdrop.png").convert("RGBA")
    entries = CITY_STATES[asset]
    for name in sorted(entries, key=lambda item: CITY_PLACEMENTS.get(item, (0, 0, 0))[1]):
        if name == "palisade":
            palisade = Image.open(CITY_ASSET_PATH / "palisade.png").convert("RGBA")
            palisade = palisade.resize((490, 189), Image.Resampling.LANCZOS)
            backdrop.alpha_composite(palisade, (270, 430))
            continue
        _paste_building(backdrop, name, CITY_PLACEMENTS[name])
    # A cool-shadow/warm-highlight glaze previews the richer material direction without
    # pretending these v1 cutouts are the final XL production library.
    glaze = Image.new("RGBA", backdrop.size, rgba((35, 73, 84), 24))
    backdrop.alpha_composite(glaze)
    return backdrop.convert("RGB")


@dataclass(frozen=True)
class CoverTransform:
    source_size: tuple[int, int]
    target_size: tuple[int, int]
    resized_size: tuple[int, int]
    crop_offset: tuple[int, int]

    def project(self, point: tuple[int, int]) -> tuple[int, int]:
        scale_x = self.resized_size[0] / self.source_size[0]
        scale_y = self.resized_size[1] / self.source_size[1]
        return (
            round(point[0] * scale_x - self.crop_offset[0]),
            round(point[1] * scale_y - self.crop_offset[1]),
        )

    def unproject(self, point: tuple[int, int]) -> tuple[float, float]:
        scale_x = self.resized_size[0] / self.source_size[0]
        scale_y = self.resized_size[1] / self.source_size[1]
        return (
            (point[0] + self.crop_offset[0]) / scale_x,
            (point[1] + self.crop_offset[1]) / scale_y,
        )


def cover_transform(
    source_size: tuple[int, int],
    target_size: tuple[int, int],
    focus: tuple[float, float] = (0.5, 0.5),
) -> CoverTransform:
    target_w, target_h = target_size
    scale = max(target_w / source_size[0], target_h / source_size[1])
    resized_size = (round(source_size[0] * scale), round(source_size[1] * scale))
    crop_offset = (
        round((resized_size[0] - target_w) * focus[0]),
        round((resized_size[1] - target_h) * focus[1]),
    )
    return CoverTransform(source_size, target_size, resized_size, crop_offset)


def cover_with_transform(
    image: Image.Image,
    size: tuple[int, int],
    focus: tuple[float, float] = (0.5, 0.5),
) -> tuple[Image.Image, CoverTransform]:
    transform = cover_transform(image.size, size, focus)
    resized = image.resize(transform.resized_size, Image.Resampling.LANCZOS)
    x, y = transform.crop_offset
    return resized.crop((x, y, x + size[0], y + size[1])), transform


def cover(image: Image.Image, size: tuple[int, int], focus: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    return cover_with_transform(image, size, focus)[0]


def contain(image: Image.Image, size: tuple[int, int], color: tuple[int, int, int] = INK) -> Image.Image:
    scale = min(size[0] / image.width, size[1] / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    out = Image.new("RGB", size, color)
    out.paste(resized, ((size[0] - resized.width) // 2, (size[1] - resized.height) // 2))
    return out


def paper_texture(size: tuple[int, int], light: bool = False) -> Image.Image:
    base = PARCHMENT_LIGHT if light else PARCHMENT
    image = Image.new("RGB", size, base)
    draw = ImageDraw.Draw(image, "RGBA")
    for y in range(0, size[1], 7):
        tone = 16 if (y // 7) % 3 == 0 else 8
        draw.line((0, y, size[0], y + (y % 13) // 3), fill=(74, 43, 18, tone), width=1)
    for x in range(5, size[0], 19):
        draw.line((x, 0, x + 5, size[1]), fill=(255, 246, 213, 7), width=1)
    return image


def panel(
    image: Image.Image,
    box: tuple[int, int, int, int],
    direction: Direction,
    *,
    radius: int = 12,
    fill_alpha: int = 236,
    paper: bool = False,
) -> None:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    fill = PARCHMENT_LIGHT if paper else (INK_SOFT if direction.chrome == "paper" else PANEL)
    border = INK if paper else GOLD if direction.chrome == "wood" else (107, 74, 42)
    draw.rounded_rectangle(box, radius=radius, fill=rgba(fill, fill_alpha), outline=rgba(border, 245), width=2)
    if direction.chrome == "wood" and not paper:
        inset = (box[0] + 5, box[1] + 5, box[2] - 5, box[3] - 5)
        draw.rounded_rectangle(inset, radius=max(2, radius - 5), outline=rgba((133, 91, 42), 150), width=1)
    image.alpha_composite(layer)


def text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    value: str,
    size: int,
    *,
    fill: tuple[int, int, int] | tuple[int, int, int, int] = TEXT,
    bold: bool = False,
    display: bool = False,
    anchor: str | None = None,
) -> None:
    draw.text(xy, value, font=font(size, bold=bold, display=display), fill=fill, anchor=anchor)


def wrapped_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    value: str,
    size: int,
    width_chars: int,
    *,
    fill: tuple[int, int, int] = TEXT_DIM,
    spacing: int = 5,
) -> None:
    draw.multiline_text(
        xy,
        textwrap.fill(value, width=width_chars),
        font=font(size),
        fill=fill,
        spacing=spacing,
    )


def draw_maritime_icon(
    draw: ImageDraw.ImageDraw,
    center: tuple[int, int],
    kind: str,
    size: int,
    *,
    color: tuple[int, int, int] = TEXT,
) -> None:
    """Draw the shared navigation icon family without relying on font glyphs."""
    cx, cy = center
    radius = max(7, size // 2)
    stroke = max(2, round(size / 10))
    fill = rgba(color, 255)

    if kind == "fleet":
        draw.polygon(
            [
                (cx - radius + 1, cy + 3),
                (cx + radius - 1, cy + 3),
                (cx + radius - 5, cy + radius - 3),
                (cx - radius + 5, cy + radius - 3),
            ],
            fill=fill,
        )
        draw.line((cx, cy - radius + 1, cx, cy + 3), fill=fill, width=stroke)
        draw.polygon([(cx - 2, cy - radius + 2), (cx - radius + 3, cy + 1), (cx - 2, cy + 1)], fill=fill)
        draw.polygon([(cx + 2, cy - radius + 5), (cx + radius - 3, cy + 1), (cx + 2, cy + 1)], fill=fill)
    elif kind == "city":
        draw.polygon(
            [
                (cx - radius + 2, cy + radius - 2),
                (cx - radius + 2, cy - 1),
                (cx - radius // 2, cy - 1),
                (cx - radius // 2, cy - radius + 3),
                (cx, cy - radius),
                (cx + radius // 2, cy - radius + 3),
                (cx + radius // 2, cy - 3),
                (cx + radius - 2, cy - 3),
                (cx + radius - 2, cy + radius - 2),
            ],
            fill=fill,
        )
    elif kind == "course":
        points = [(cx - radius + 2, cy + radius // 2), (cx - 2, cy), (cx + radius // 2, cy - radius // 2)]
        for px, py in points:
            dot = max(2, stroke)
            draw.ellipse((px - dot, py - dot, px + dot, py + dot), fill=fill)
        draw.line(points, fill=fill, width=stroke, joint="curve")
        draw.polygon(
            [
                (cx + radius - 1, cy - radius + 2),
                (cx + radius // 2 - 2, cy - radius + 3),
                (cx + radius - 2, cy - radius // 2 + 4),
            ],
            fill=fill,
        )
    elif kind == "end_turn":
        draw.line(
            [
                (cx - radius + 2, cy),
                (cx - radius // 4, cy + radius - 3),
                (cx + radius - 1, cy - radius + 2),
            ],
            fill=fill,
            width=stroke + 1,
            joint="curve",
        )
    elif kind in {"zoom_in", "zoom_out"}:
        glass = (cx - radius + 1, cy - radius + 1, cx + radius // 2, cy + radius // 2)
        draw.ellipse(glass, outline=fill, width=stroke)
        draw.line((cx + radius // 3, cy + radius // 3, cx + radius - 1, cy + radius - 1), fill=fill, width=stroke + 1)
        lens_cx = (glass[0] + glass[2]) // 2
        lens_cy = (glass[1] + glass[3]) // 2
        half = max(3, radius // 3)
        draw.line((lens_cx - half, lens_cy, lens_cx + half, lens_cy), fill=fill, width=stroke)
        if kind == "zoom_in":
            draw.line((lens_cx, lens_cy - half, lens_cx, lens_cy + half), fill=fill, width=stroke)
    elif kind == "overview":
        arm = max(4, radius // 2)
        left, top, right, bottom = cx - radius, cy - radius, cx + radius, cy + radius
        for points in [
            [(left, top + arm), (left, top), (left + arm, top)],
            [(right - arm, top), (right, top), (right, top + arm)],
            [(left, bottom - arm), (left, bottom), (left + arm, bottom)],
            [(right - arm, bottom), (right, bottom), (right, bottom - arm)],
        ]:
            draw.line(points, fill=fill, width=stroke, joint="curve")
        draw.polygon(
            [(cx, cy - radius // 2), (cx + radius // 2, cy), (cx, cy + radius // 2), (cx - radius // 2, cy)],
            fill=fill,
        )
    else:
        raise ValueError(f"unknown maritime icon: {kind}")


def chip_dimensions(label: str, size: int) -> tuple[int, int]:
    f = font(size, bold=True)
    bbox = f.getbbox(label)
    w = bbox[2] - bbox[0] + 20
    h = bbox[3] - bbox[1] + 14
    return w, h


def chip(
    image: Image.Image,
    xy: tuple[int, int],
    label: str,
    direction: Direction,
    *,
    color: tuple[int, int, int] = GOLD,
    size: int = 14,
) -> tuple[int, int, int, int]:
    f = font(size, bold=True)
    w, h = chip_dimensions(label, size)
    box = (xy[0], xy[1], xy[0] + w, xy[1] + h)
    panel(image, box, direction, radius=h // 2, fill_alpha=224)
    draw = ImageDraw.Draw(image)
    draw.ellipse((xy[0] + 8, xy[1] + h // 2 - 3, xy[0] + 14, xy[1] + h // 2 + 3), fill=color)
    draw.text((xy[0] + 18, xy[1] + h // 2), label, font=f, fill=TEXT, anchor="lm")
    return box


def draw_city_marker(draw: ImageDraw.ImageDraw, center: tuple[int, int], kind: str, size: int) -> None:
    cx, cy = center
    color = GOLD if kind == "own" else ENEMY if kind == "enemy" else NEUTRAL
    draw.ellipse((cx - size, cy - size // 2, cx + size, cy + size // 2), fill=rgba((0, 0, 0), 70))
    draw.ellipse((cx - size, cy - size, cx + size, cy + size), fill=rgba(INK, 220), outline=rgba(color, 255), width=max(2, size // 7))
    tower = [(cx - size // 2, cy + size // 3), (cx - size // 2, cy - size // 4), (cx, cy - size // 2), (cx + size // 2, cy - size // 4), (cx + size // 2, cy + size // 3)]
    draw.polygon(tower, fill=rgba(PARCHMENT_LIGHT, 255), outline=rgba(INK, 255))
    draw.rectangle((cx - size // 6, cy, cx + size // 6, cy + size // 3), fill=rgba(INK, 255))
    if kind != "neutral":
        draw.line((cx, cy - size // 2, cx, cy - size - 6), fill=rgba(INK, 255), width=2)
        if kind == "own":
            flag = [(cx + 1, cy - size - 6), (cx + size, cy - size - 3), (cx + 1, cy - size // 2 - 1)]
            draw.polygon(flag, fill=rgba((20, 20, 18), 255), outline=rgba(PARCHMENT_LIGHT, 255))
            draw.ellipse((cx + size // 3, cy - size - 2, cx + size // 2, cy - size + 3), fill=rgba(PARCHMENT_LIGHT, 255))
        else:
            draw.polygon([(cx + 1, cy - size - 6), (cx + size, cy - size - 3), (cx + 1, cy - size // 2 - 1)], fill=rgba((245, 235, 210), 255), outline=rgba(ENEMY, 255))
            draw.line((cx + 3, cy - size - 4, cx + size - 2, cy - size // 2 - 2), fill=rgba(ENEMY, 255), width=2)


def draw_ship(draw: ImageDraw.ImageDraw, center: tuple[int, int], kind: str, size: int, selected: bool = False) -> None:
    cx, cy = center
    color = GOLD if kind == "own" else ENEMY
    if selected:
        draw.ellipse((cx - size, cy - size, cx + size, cy + size), outline=rgba(ROUTE, 250), width=max(2, size // 6))
        draw.ellipse((cx - size - 5, cy - size - 5, cx + size + 5, cy + size + 5), outline=rgba(ROUTE, 90), width=2)
    draw.ellipse((cx - size, cy + size // 3, cx + size, cy + size // 2), fill=rgba((0, 0, 0), 85))
    draw.polygon([(cx - size, cy + size // 4), (cx + size, cy + size // 4), (cx + size // 2, cy + size // 2), (cx - size // 2, cy + size // 2)], fill=rgba(INK, 255), outline=rgba(color, 255))
    draw.line((cx, cy + size // 4, cx, cy - size), fill=rgba(INK, 255), width=max(1, size // 8))
    draw.polygon([(cx - 2, cy - size + 1), (cx - size // 2, cy + size // 8), (cx - 2, cy + size // 8)], fill=rgba(PARCHMENT_LIGHT, 255), outline=rgba(INK, 220))
    draw.polygon([(cx + 2, cy - size + 3), (cx + size // 2, cy + size // 8), (cx + 2, cy + size // 8)], fill=rgba(color, 230), outline=rgba(INK, 220))


def route_segment_samples(start: tuple[int, int], end: tuple[int, int]) -> list[tuple[int, int]]:
    steps = max(abs(end[0] - start[0]), abs(end[1] - start[1]), 1)
    return [
        (
            round(start[0] + (end[0] - start[0]) * index / steps),
            round(start[1] + (end[1] - start[1]) * index / steps),
        )
        for index in range(steps + 1)
    ]


def draw_route_markers(
    draw: ImageDraw.ImageDraw,
    route: list[tuple[int, int]],
    turn_index: int,
    scale: float = 1.0,
) -> None:
    if not 1 <= turn_index < len(route):
        raise AssertionError(f"route turn index outside path: {turn_index}")
    for index, (x, y) in enumerate(route[1:], start=1):
        color = ROUTE if index <= turn_index else LATER
        r = max(2, round(3.5 * scale))
        draw.ellipse((x - r, y - r, x + r, y + r), fill=rgba(color, 240))
        if index == turn_index:
            draw.ellipse((x - r * 2, y - r * 2, x + r * 2, y + r * 2), outline=rgba(color, 240), width=max(1, round(2 * scale)))


def point_in_polygon(point: tuple[int, int], polygon: list[tuple[int, int]]) -> bool:
    x, y = point
    inside = False
    previous = polygon[-1]
    for current in polygon:
        x1, y1 = previous
        x2, y2 = current
        crosses = (y1 > y) != (y2 > y)
        if crosses and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
        previous = current
    return inside


def map_terrain(direction_id: str, point: tuple[int, int]) -> str:
    return "land" if any(point_in_polygon(point, polygon) for polygon in MAP_LAND_REGIONS[direction_id]) else "water"


def pixel_terrain(color: tuple[int, int, int]) -> str:
    red, green, blue = color
    return "land" if red >= 0.65 * green and blue < 0.90 * green else "water"


def map_coordinate_evidence() -> dict[str, dict[str, dict[str, tuple[int, int]]]]:
    evidence: dict[str, dict[str, dict[str, tuple[int, int]]]] = {}
    for direction_id, state in MAP_WORLD_STATES.items():
        evidence[direction_id] = {}
        for viewport, (size, focus) in MAP_VIEWPORTS.items():
            transform = cover_transform(MAP_SOURCE_SIZE, size, focus)
            evidence[direction_id][viewport] = {name: transform.project(point) for name, point in state.items()}
    return evidence


def selected_fleet_label_origin(
    direction_id: str,
    viewport: str,
    transform: CoverTransform,
) -> tuple[int, int]:
    anchor = transform.project(MAP_WORLD_STATES[direction_id]["own_ship"])
    offset = SELECTED_FLEET_LABEL_OFFSETS[viewport]
    return anchor[0] + offset[0], anchor[1] + offset[1]


def validate_map_world_states() -> None:
    expected_names = set(MAP_TERRAIN_REQUIREMENTS)
    evidence = map_coordinate_evidence()
    for direction_id, state in MAP_WORLD_STATES.items():
        if set(state) != expected_names:
            raise AssertionError(f"map semantic set mismatch for direction {direction_id}")
        fog = MAP_FOG_REGIONS[direction_id]
        source = load_source(DIRECTIONS[direction_id], "map").convert("RGB")
        for name, point in state.items():
            observed = map_terrain(direction_id, point)
            expected = MAP_TERRAIN_REQUIREMENTS[name]
            if observed != expected:
                raise AssertionError(
                    f"{direction_id} {name} must be on {expected}, got {observed} at source {point}"
                )
            pixel_observed = pixel_terrain(source.getpixel(point))
            if pixel_observed != expected:
                raise AssertionError(
                    f"{direction_id} {name} source pixel must be {expected}, got {pixel_observed} at {point}"
                )
            if point_in_polygon(point, fog):
                raise AssertionError(f"{direction_id} {name} is hidden by the proof fog at source {point}")
            for viewport in MAP_VIEWPORTS:
                screen_point = evidence[direction_id][viewport][name]
                size, focus = MAP_VIEWPORTS[viewport]
                transform = cover_transform(MAP_SOURCE_SIZE, size, focus)
                source_point = transform.unproject(screen_point)
                if max(abs(source_point[0] - point[0]), abs(source_point[1] - point[1])) > 1.0:
                    raise AssertionError(f"{direction_id} {name} loses source correspondence in {viewport}")
                if not (10 <= screen_point[0] <= size[0] - 10 and 10 <= screen_point[1] <= size[1] - 10):
                    raise AssertionError(f"{direction_id} {name} is cropped in {viewport}: {screen_point}")
        route = MAP_ROUTE_PATHS[direction_id]
        if route[0] != state["own_ship"] or route[-1] != state["route_target"]:
            raise AssertionError(f"{direction_id} route is detached from its canonical endpoints")
        dense_route = {
            point
            for start, end in zip(route[:-1], route[1:], strict=True)
            for point in route_segment_samples(start, end)
        }
        for point in dense_route:
            if map_terrain(direction_id, point) != "water" or pixel_terrain(source.getpixel(point)) != "water":
                raise AssertionError(f"{direction_id} route crosses non-navigable terrain at source {point}")
            if point_in_polygon(point, fog):
                raise AssertionError(f"{direction_id} route enters fog at source {point}")
        for point in route[1:]:
            for viewport, (size, focus) in MAP_VIEWPORTS.items():
                transform = cover_transform(MAP_SOURCE_SIZE, size, focus)
                screen_point = transform.project(point)
                source_point = transform.unproject(screen_point)
                if max(abs(source_point[0] - point[0]), abs(source_point[1] - point[1])) > 1.0:
                    raise AssertionError(f"{direction_id} route marker loses correspondence in {viewport}")
                if not (5 <= screen_point[0] <= size[0] - 5 and 5 <= screen_point[1] <= size[1] - 5):
                    raise AssertionError(f"{direction_id} route marker is cropped in {viewport}: {screen_point}")
        for viewport, (size, focus) in MAP_VIEWPORTS.items():
            transform = cover_transform(MAP_SOURCE_SIZE, size, focus)
            ship_anchor = transform.project(state["own_ship"])
            label_origin = selected_fleet_label_origin(direction_id, viewport, transform)
            offset = SELECTED_FLEET_LABEL_OFFSETS[viewport]
            if (label_origin[0] - offset[0], label_origin[1] - offset[1]) != ship_anchor:
                raise AssertionError(f"{direction_id} fleet label detached in {viewport}")
            source_anchor = transform.unproject(ship_anchor)
            if max(abs(source_anchor[0] - state["own_ship"][0]), abs(source_anchor[1] - state["own_ship"][1])) > 1.0:
                raise AssertionError(f"{direction_id} fleet label anchor loses correspondence in {viewport}")
            label_width, label_height = chip_dimensions(
                SELECTED_FLEET_LABEL,
                SELECTED_FLEET_LABEL_SIZES[viewport],
            )
            if not (
                4 <= label_origin[0]
                and label_origin[0] + label_width <= size[0] - 4
                and 4 <= label_origin[1]
                and label_origin[1] + label_height <= size[1] - 4
            ):
                raise AssertionError(f"{direction_id} fleet label is cropped in {viewport}")
        for point in fog:
            if not (0 <= point[0] <= MAP_SOURCE_SIZE[0] and 0 <= point[1] <= MAP_SOURCE_SIZE[1]):
                raise AssertionError(f"{direction_id} fog point outside source: {point}")
        frontier = [fog[0], fog[7], fog[6], fog[5], fog[4], fog[3]]
        for viewport, (size, focus) in MAP_VIEWPORTS.items():
            transform = cover_transform(MAP_SOURCE_SIZE, size, focus)
            projected_frontier = [transform.project(point) for point in frontier]
            visible_frontier = [point for point in projected_frontier if -1 <= point[1] <= size[1] + 1]
            if not visible_frontier or size[0] - min(point[0] for point in visible_frontier) < 12:
                raise AssertionError(f"{direction_id} fog is not visibly represented in {viewport}")


def annotate_map_world(image: Image.Image, direction: Direction) -> None:
    if image.size != MAP_SOURCE_SIZE:
        raise AssertionError(f"map source must be {MAP_SOURCE_SIZE}, got {image.size}")
    state = MAP_WORLD_STATES[direction.id]
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    fog = MAP_FOG_REGIONS[direction.id]
    draw.polygon(fog, fill=rgba(FOG, 205))
    draw.line([fog[3], fog[4], fog[5], fog[6], fog[7], fog[0]], fill=rgba((90, 126, 142), 65), width=7, joint="curve")

    own_ship = state["own_ship"]
    for (ox, oy), color in zip(RANGE_OFFSETS, [SUCCESS, SUCCESS, SUCCESS, ENEMY, GOLD], strict=True):
        rr = 24
        cx, cy = own_ship[0] + ox, own_ship[1] + oy
        draw.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=rgba(color, 45), outline=rgba(color, 110), width=2)
    draw_route_markers(draw, MAP_ROUTE_PATHS[direction.id], MAP_ROUTE_TURN_INDEX)
    draw_city_marker(draw, state["own_city"], "own", 17)
    draw_city_marker(draw, state["enemy_city"], "enemy", 17)
    draw_city_marker(draw, state["neutral_city"], "neutral", 17)
    draw_ship(draw, own_ship, "own", 13, selected=True)
    draw_ship(draw, state["enemy_ship"], "enemy", 12)

    # Sea encounter, land encounter, and site use distinct silhouettes as well as color.
    sea = state["sea_encounter"]
    sr = 11
    draw.regular_polygon((sea[0], sea[1], sr), n_sides=4, rotation=45, fill=rgba(GOLD, 245), outline=rgba(INK, 255), width=2)
    draw.line((sea[0] - sr // 2, sea[1], sea[0] + sr // 2, sea[1]), fill=rgba(INK, 255), width=2)
    land_enc = state["land_encounter"]
    lr = 10
    draw.regular_polygon((land_enc[0], land_enc[1], lr), n_sides=3, rotation=0, fill=rgba(RUST, 245), outline=rgba(PARCHMENT_LIGHT, 255), width=2)
    site = state["land_site"]
    rr = 10
    draw.rounded_rectangle((site[0] - rr, site[1] - rr, site[0] + rr, site[1] + rr), radius=3, fill=rgba((138, 155, 88), 245), outline=rgba(INK, 255), width=2)
    draw.line((site[0] - rr // 2, site[1] + rr // 2, site[0] + rr // 2, site[1] - rr // 2), fill=rgba(PARCHMENT_LIGHT, 255), width=2)
    image.alpha_composite(layer)


def annotate_map_ui(
    image: Image.Image,
    box: tuple[int, int, int, int],
    direction: Direction,
    transform: CoverTransform,
    viewport: str,
) -> None:
    x0, y0, _, _ = box
    label_origin = selected_fleet_label_origin(direction.id, viewport, transform)
    chip(
        image,
        (x0 + label_origin[0], y0 + label_origin[1]),
        SELECTED_FLEET_LABEL,
        direction,
        color=GOLD,
        size=SELECTED_FLEET_LABEL_SIZES[viewport],
    )
    if viewport != "phone":
        chip(image, (x0 + 18, y0 + 18), "NORMAL ZOOM · FOG SAFE", direction, color=SUCCESS, size=12)


def draw_resources(draw: ImageDraw.ImageDraw, x: int, y: int, compact: bool = False) -> None:
    values = [("G", "2,480", GOLD), ("T", "46", (138, 90, 43)), ("I", "22", NEUTRAL), ("R", "18", (178, 59, 216))]
    step = 72 if compact else 100
    for i, (symbol, value, color) in enumerate(values):
        cx = x + i * step
        draw.ellipse((cx, y, cx + 22, y + 22), fill=rgba(color, 255), outline=rgba(INK, 255), width=1)
        text(draw, (cx + 11, y + 11), symbol, 11, fill=INK, bold=True, anchor="mm")
        text(draw, (cx + 29, y + 11), value, 14 if compact else 16, bold=True, anchor="lm")


def draw_minimap(image: Image.Image, box: tuple[int, int, int, int], direction: Direction) -> None:
    panel(image, box, direction, radius=5, fill_alpha=246)
    draw = ImageDraw.Draw(image, "RGBA")
    inner = (box[0] + 5, box[1] + 5, box[2] - 5, box[3] - 5)
    draw.rectangle(inner, fill=rgba(DEEP, 255))
    w, h = inner[2] - inner[0], inner[3] - inner[1]
    island = [
        (inner[0] + int(w * 0.08), inner[1] + int(h * 0.56)),
        (inner[0] + int(w * 0.25), inner[1] + int(h * 0.24)),
        (inner[0] + int(w * 0.55), inner[1] + int(h * 0.34)),
        (inner[0] + int(w * 0.78), inner[1] + int(h * 0.72)),
        (inner[0] + int(w * 0.42), inner[1] + int(h * 0.86)),
    ]
    draw.polygon(island, fill=rgba((74, 124, 63), 255), outline=rgba(PARCHMENT, 255))
    draw.rectangle((inner[0] + int(w * 0.27), inner[1] + int(h * 0.32), inner[0] + int(w * 0.67), inner[1] + int(h * 0.71)), outline=rgba(PARCHMENT_LIGHT, 255), width=2)


def header(image: Image.Image, direction: Direction, phone: bool = False) -> int:
    h = 92 if phone else 68
    panel(image, (0, 0, image.width - 1, h), direction, radius=0, fill_alpha=252)
    draw = ImageDraw.Draw(image, "RGBA")
    if phone:
        text(draw, (14, 19), "ROUND 12 · YOUR TURN", 14, fill=GOLD, bold=True)
        draw_resources(draw, 14, 53, compact=True)
    else:
        text(draw, (22, 19), "AGE OF PLUNDER", 26, display=True)
        text(draw, (300, 27), "ROUND 12 · YOUR TURN", 14, fill=GOLD, bold=True)
        draw_resources(draw, image.width - 430, 23)
    return h


def command_dock(image: Image.Image, direction: Direction, phone: bool = False) -> int:
    h = 92 if phone else 72
    y = image.height - h
    panel(image, (0, y, image.width - 1, image.height - 1), direction, radius=0, fill_alpha=252)
    draw = ImageDraw.Draw(image, "RGBA")
    commands = [("Fleet", "fleet"), ("City", "city"), ("Course", "course"), ("End turn", "end_turn")]
    margin = 8 if phone else image.width // 2 - 250
    gap = 6 if phone else 12
    total_w = image.width - margin * 2
    button_w = (total_w - gap * 3) // 4
    for i, (label, icon) in enumerate(commands):
        x = margin + i * (button_w + gap)
        fill = GOLD if label == "End turn" else PANEL_ALT
        outline = INK if label == "End turn" else (107, 74, 42)
        draw.rounded_rectangle((x, y + 12, x + button_w, y + h - 12), radius=8, fill=rgba(fill, 255), outline=rgba(outline, 255), width=2)
        draw_maritime_icon(
            draw,
            (x + button_w // 2, y + 30),
            icon,
            18 if phone else 20,
            color=INK if label == "End turn" else TEXT,
        )
        text(draw, (x + button_w // 2, y + 57 if phone else y + 51), label, 11 if phone else 13, fill=INK if label == "End turn" else TEXT, bold=True, anchor="mm")
    return y


def responsive_map_art(direction: Direction, viewport: str) -> tuple[Image.Image, CoverTransform]:
    size, focus = MAP_VIEWPORTS[viewport]
    source = load_source(direction, "map").convert("RGBA")
    annotate_map_world(source, direction)
    return cover_with_transform(source, size, focus)


def compose_map_desktop(direction: Direction) -> Image.Image:
    image = Image.new("RGBA", (1440, 900), rgba(INK, 255))
    top = header(image, direction)
    bottom = command_dock(image, direction)
    art, transform = responsive_map_art(direction, "desktop")
    if art.size != (1440, bottom - top):
        raise AssertionError(f"desktop map viewport drifted: {art.size}")
    image.paste(art, (0, top))
    annotate_map_ui(image, (0, top, 1440, bottom), direction, transform, "desktop")
    draw = ImageDraw.Draw(image, "RGBA")
    for i, icon in enumerate(("zoom_in", "zoom_out", "overview")):
        box = (1378, top + 18 + i * 48, 1424, top + 60 + i * 48)
        panel(image, box, direction, radius=8, fill_alpha=225)
        draw_maritime_icon(draw, ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2), icon, 20)
    draw_minimap(image, (1256, bottom - 142, 1424, bottom - 18), direction)
    panel(image, (18, top + 60, 286, top + 132), direction, radius=9, fill_alpha=218)
    text(draw, (32, top + 74), "FLEET SIGHTING", 12, fill=GOLD, bold=True)
    text(draw, (32, top + 98), "Merchant convoy spotted near shoals", 14)
    return image


def compose_map_phone(direction: Direction) -> Image.Image:
    image = Image.new("RGBA", (375, 812), rgba(INK, 255))
    top = header(image, direction, phone=True)
    bottom = command_dock(image, direction, phone=True)
    art, transform = responsive_map_art(direction, "phone")
    if art.size != (375, bottom - top):
        raise AssertionError(f"phone map viewport drifted: {art.size}")
    image.paste(art, (0, top))
    annotate_map_ui(image, (0, top, 375, bottom), direction, transform, "phone")
    draw = ImageDraw.Draw(image, "RGBA")
    panel(image, (12, top + 12, 210, top + 50), direction, radius=19, fill_alpha=220)
    text(draw, (26, top + 31), "COURSE READY · TAP TO SAIL", 11, bold=True, anchor="lm")
    for i, icon in enumerate(("zoom_in", "zoom_out", "overview")):
        box = (327, top + 12 + i * 44, 365, top + 50 + i * 44)
        panel(image, box, direction, radius=7, fill_alpha=225)
        draw_maritime_icon(draw, ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2), icon, 18)
    draw_minimap(image, (266, bottom - 92, 365, bottom - 12), direction)
    return image


def compose_map_tablet(direction: Direction) -> Image.Image:
    image = Image.new("RGBA", (768, 1024), rgba(INK, 255))
    panel(image, (0, 0, 767, 74), direction, radius=0, fill_alpha=252)
    draw = ImageDraw.Draw(image, "RGBA")
    text(draw, (18, 18), "AGE OF PLUNDER", 23, display=True)
    text(draw, (258, 25), "ROUND 12 · YOUR TURN", 12, fill=GOLD, bold=True)
    draw_resources(draw, 456, 23, compact=True)
    bottom = command_dock(image, direction)
    art, transform = responsive_map_art(direction, "tablet")
    if art.size != (768, bottom - 74):
        raise AssertionError(f"tablet map viewport drifted: {art.size}")
    image.paste(art, (0, 74))
    annotate_map_ui(image, (0, 74, 768, bottom), direction, transform, "tablet")
    draw = ImageDraw.Draw(image, "RGBA")
    for i, icon in enumerate(("zoom_in", "zoom_out", "overview")):
        box = (710, 92 + i * 48, 754, 134 + i * 48)
        panel(image, box, direction, radius=8, fill_alpha=225)
        draw_maritime_icon(draw, ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2), icon, 19)
    draw_minimap(image, (622, bottom - 126, 754, bottom - 14), direction)
    return image


def selected_city_overlay(
    image: Image.Image,
    box: tuple[int, int, int, int],
    direction: Direction,
    phone: bool = False,
) -> None:
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    # Both treatments point to the shipyard: the modular A anchor sits on the
    # lower-right shoreline, while B's painted drydock occupies the left curtain.
    target = (0.81, 0.79) if direction.id == "a" else (0.29, 0.53)
    cx = x0 + int(w * target[0])
    cy = y0 + int(h * target[1])
    rx = max(22, int(w * 0.055))
    ry = max(12, int(h * 0.035))
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=rgba(GOLD, 35), outline=rgba(GOLD, 245), width=max(2, w // 340))
    draw.ellipse((cx - rx - 6, cy - ry - 5, cx + rx + 6, cy + ry + 5), outline=rgba(GOLD, 85), width=2)
    image.alpha_composite(layer)
    if not phone:
        chip(image, (cx - 42, cy + ry + 7), "SELECTED", direction, color=GOLD, size=11)


def management_panel(image: Image.Image, box: tuple[int, int, int, int], direction: Direction, phone: bool = False) -> None:
    panel(image, box, direction, radius=14 if not phone else 18, fill_alpha=250)
    draw = ImageDraw.Draw(image, "RGBA")
    x, y, right, bottom = box
    pad = 18 if phone else 22
    text(draw, (x + pad, y + pad), "SHIPWRIGHT'S YARD", 23 if phone else 27, display=True)
    text(draw, (x + pad, y + pad + 39), "SHIPYARD · FLEET", 12, fill=GOLD, bold=True)
    wrapped_text(
        draw,
        (x + pad, y + pad + 70),
        "Commission seaworthy hulls and refit the fleet for its next passage.",
        15 if phone else 16,
        38 if phone else 32,
    )
    rule_y = y + pad + (134 if phone else 150)
    draw.line((x + pad, rule_y, right - pad, rule_y), fill=rgba((107, 74, 42), 255), width=2)
    text(draw, (x + pad, rule_y + 20), "VESSELS IN BERTH", 12, fill=TEXT_DIM, bold=True)
    row_y = rule_y + 50
    draw.ellipse((x + pad, row_y, x + pad + 44, row_y + 44), fill=rgba(RUST, 255), outline=rgba(GOLD, 255), width=2)
    text(draw, (x + pad + 58, row_y + 5), "Swift Gull", 17, bold=True)
    text(draw, (x + pad + 58, row_y + 29), "Sloop · Ready", 13, fill=TEXT_DIM)
    cost_y = row_y + 74
    text(draw, (x + pad, cost_y), "Commission a sloop", 15, bold=True)
    text(draw, (right - pad, cost_y), "1,200 gold", 15, fill=GOLD, bold=True, anchor="ra")
    button_y = bottom - (66 if phone else 72)
    draw.rounded_rectangle((x + pad, button_y, right - pad, bottom - pad), radius=9, fill=rgba(GOLD, 255), outline=rgba(INK, 255), width=2)
    text(draw, ((x + right) // 2, (button_y + bottom - pad) // 2), "COMMISSION", 15, fill=INK, bold=True, anchor="mm")


def compose_city_desktop(direction: Direction) -> Image.Image:
    image = Image.new("RGBA", (1440, 900), rgba(INK, 255))
    panel(image, (0, 0, 1439, 899), direction, radius=0, fill_alpha=255)
    draw = ImageDraw.Draw(image, "RGBA")
    text(draw, (24, 20), "PORT PROVIDENCE", 30, display=True)
    text(draw, (24, 53), "PIRATE FREE PORT · PROSPEROUS", 12, fill=GOLD, bold=True)
    text(draw, (1396, 37), "×", 28, anchor="mm")
    scene_box = (24, 82, 1048, 786)
    image.paste(load_source(direction, "full"), (scene_box[0], scene_box[1]))
    draw.rectangle(scene_box, outline=rgba(GOLD if direction.chrome == "wood" else INK, 255), width=3)
    selected_city_overlay(image, scene_box, direction)
    management_panel(image, (1068, 82, 1416, 786), direction)
    panel(image, (24, 804, 1416, 876), direction, radius=10, fill_alpha=245, paper=direction.chrome == "paper")
    draw = ImageDraw.Draw(image, "RGBA")
    body_fill = INK if direction.chrome == "paper" else TEXT
    text(draw, (44, 828), "14 BUILDINGS", 13, fill=body_fill, bold=True)
    text(draw, (190, 828), "2 SHIPS IN PORT", 13, fill=body_fill, bold=True)
    text(draw, (384, 828), "GARRISON: ANNE VANE", 13, fill=body_fill, bold=True)
    text(draw, (1392, 840), "‹  CITY 2 OF 3  ›", 13, fill=body_fill, bold=True, anchor="rm")
    return image


def compose_city_phone(direction: Direction) -> Image.Image:
    image = Image.new("RGBA", (375, 812), rgba(INK, 255))
    panel(image, (0, 0, 374, 811), direction, radius=0, fill_alpha=255)
    draw = ImageDraw.Draw(image, "RGBA")
    text(draw, (16, 17), "PORT PROVIDENCE", 22, display=True)
    text(draw, (16, 45), "CITY 2 OF 3", 11, fill=GOLD, bold=True)
    text(draw, (351, 31), "×", 25, anchor="mm")
    scene_box = (0, 66, 375, 324)
    scene = cover(load_source(direction, "full"), (375, 258), focus=(0.48, 0.52))
    image.paste(scene, (0, 66))
    draw.rectangle(scene_box, outline=rgba(GOLD, 220), width=2)
    selected_city_overlay(image, scene_box, direction, phone=True)
    management_panel(image, (0, 314, 375, 812), direction, phone=True)
    return image


def compose_city_tablet(direction: Direction) -> Image.Image:
    image = Image.new("RGBA", (768, 1024), rgba(INK, 255))
    panel(image, (0, 0, 767, 1023), direction, radius=0, fill_alpha=255)
    draw = ImageDraw.Draw(image, "RGBA")
    text(draw, (22, 18), "PORT PROVIDENCE", 27, display=True)
    text(draw, (22, 50), "PIRATE FREE PORT · PROSPEROUS", 11, fill=GOLD, bold=True)
    text(draw, (742, 34), "×", 27, anchor="mm")
    scene_box = (0, 72, 768, 600)
    scene = cover(load_source(direction, "full"), (768, 528), focus=(0.5, 0.5))
    image.paste(scene, (0, 72))
    draw.rectangle(scene_box, outline=rgba(GOLD, 230), width=2)
    selected_city_overlay(image, scene_box, direction)
    management_panel(image, (18, 586, 750, 1006), direction, phone=False)
    return image


def compose_city_stages(direction: Direction) -> Image.Image:
    image = paper_texture((1440, 560), light=True).convert("RGBA")
    draw = ImageDraw.Draw(image, "RGBA")
    text(draw, (42, 28), f"{direction.short_name} · dynamic city-state proof", 30, fill=INK, display=True)
    text(draw, (42, 68), "The runtime backdrop remains empty; these are reference composites, never backdrop exports.", 15, fill=INK_SOFT)
    stages = [("start", "STARTING · 2 BUILT", "Town hall + barracks"), ("mid", "MIDGAME · 8 BUILT", "Active harbor + open plots"), ("full", "FULL · 14 BUILT", "Citadel and complete districts")]
    for i, (asset, label, note) in enumerate(stages):
        x = 42 + i * 466
        box = (x, 112, x + 432, 409)
        frame = cover(proof_source(direction, asset), (432, 297))
        image.paste(frame, (x, 112))
        draw.rectangle(box, outline=rgba(INK, 255), width=3)
        text(draw, (x, 431), label, 17, fill=INK, bold=True)
        text(draw, (x, 461), note, 14, fill=INK_SOFT)
        text(draw, (x, 500), "Same camera · same ground plane · additive layers", 12, fill=RUST, bold=True)
    return image


def compose_candidate_summary(direction: Direction) -> Image.Image:
    image = paper_texture((1600, 1040), light=True).convert("RGBA")
    draw = ImageDraw.Draw(image, "RGBA")
    text(draw, (52, 35), direction.name, 38, fill=INK, display=True)
    text(draw, (54, 84), direction.subtitle, 17, fill=RUST, bold=True)
    map_frame = compose_map_desktop(direction).resize((736, 460), Image.Resampling.LANCZOS)
    city_frame = compose_city_desktop(direction).resize((736, 460), Image.Resampling.LANCZOS)
    image.paste(map_frame.convert("RGB"), (52, 128))
    image.paste(city_frame.convert("RGB"), (812, 128))
    draw.rectangle((52, 128, 788, 588), outline=rgba(INK, 255), width=3)
    draw.rectangle((812, 128, 1548, 588), outline=rgba(INK, 255), width=3)
    text(draw, (52, 607), "WORLD MAP · normal zoom", 15, fill=INK, bold=True)
    text(draw, (812, 607), "HARBOR CITY · fully built + selected building", 15, fill=INK, bold=True)
    stages = compose_city_stages(direction).resize((1496, 582), Image.Resampling.LANCZOS).crop((0, 0, 1496, 340))
    image.paste(stages.convert("RGB"), (52, 666))
    return image


def save(image: Image.Image, path: Path, quality: int = 88) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(path, "WEBP", quality=quality, method=6)
    print(path)


def city_contract() -> Image.Image:
    image = paper_texture((1600, 1000), light=True).convert("RGBA")
    draw = ImageDraw.Draw(image, "RGBA")
    text(draw, (52, 40), "City scene production contract", 38, fill=INK, display=True)
    text(draw, (54, 91), "2048×1408 master → 1024×704 runtime · exact 16:11 · transparent modular layers", 17, fill=RUST, bold=True)
    scene = (52, 148, 1084, 858)
    draw.rectangle(scene, fill=rgba((107, 122, 63), 255), outline=rgba(INK, 255), width=4)
    x0, y0, x1, y1 = scene
    for i in range(1, 16):
        x = x0 + (x1 - x0) * i // 16
        draw.line((x, y0, x, y1), fill=rgba(PARCHMENT_LIGHT, 60), width=1)
    for i in range(1, 11):
        y = y0 + (y1 - y0) * i // 11
        draw.line((x0, y, x1, y), fill=rgba(PARCHMENT_LIGHT, 60), width=1)
    draw.polygon([(x0, y0 + 535), (x1, y0 + 470), (x1, y1), (x0, y1)], fill=rgba(SHALLOWS, 240))
    draw.line((x0, y0 + 535, x1, y0 + 470), fill=rgba(PARCHMENT_LIGHT, 255), width=10)
    slots = {
        "TOWN HALL\nprimary anchor": (0.50, 0.27, 150, 175, "P0"),
        "ECONOMY\nleft district": (0.24, 0.50, 122, 112, "P2"),
        "RECRUITMENT\nright district": (0.67, 0.48, 132, 124, "P2"),
        "FORTIFICATION\nfront curtain": (0.48, 0.72, 300, 76, "P3"),
        "SHIPYARD\nshoreline": (0.83, 0.80, 148, 130, "P1"),
    }
    colors = {"P0": GOLD, "P1": (46, 93, 163), "P2": (138, 109, 59), "P3": NEUTRAL}
    for label, (rx, ry, w, h, depth) in slots.items():
        cx, cy = x0 + int((x1 - x0) * rx), y0 + int((y1 - y0) * ry)
        draw.ellipse((cx - w // 2, cy + h // 3, cx + w // 2, cy + h // 2), fill=rgba((0, 0, 0), 65))
        draw.rounded_rectangle((cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2), radius=10, fill=rgba(colors[depth], 215), outline=rgba(INK, 255), width=3)
        text(draw, (cx, cy - 8), label, 13, fill=INK, bold=True, anchor="mm")
        text(draw, (cx, cy + h // 2 - 13), f"baseline y={round(ry * 100)}% · {depth}", 11, fill=INK, anchor="ms")
    draw.line((x0 + 120, y0 + 84, x0 + 48, y0 + 150), fill=rgba(GOLD, 255), width=5)
    draw.polygon([(x0 + 48, y0 + 150), (x0 + 55, y0 + 132), (x0 + 68, y0 + 145)], fill=rgba(GOLD, 255))
    text(draw, (x0 + 135, y0 + 70), "NW light · 35° elevation", 15, fill=PARCHMENT_LIGHT, bold=True)
    panel_box = (1120, 148, 1548, 858)
    draw.rounded_rectangle(panel_box, radius=16, fill=rgba(PARCHMENT, 255), outline=rgba(INK, 255), width=3)
    text(draw, (1150, 178), "LAYER RULES", 22, fill=INK, display=True)
    rules = [
        "Backdrop: RGB/WebP; terrain, coast, roads and empty foundations only.",
        "Buildings: RGBA/WebP or PNG; 8 px transparent safety at runtime scale.",
        "Anchor: bottom-center at the contact baseline; record normalized x/y.",
        "Contact shadow: separate soft multiply layer; never a rectangular baked plane.",
        "Depth sort: explicit P0–P3, then baseline y; no DOM-order accidents.",
        "Fortifications replace their predecessor visually; state IDs remain unchanged.",
        "Flags, selection, labels, values and UI are always runtime overlays.",
        "Fallback: current category block remains until art loads or after an error.",
    ]
    y = 228
    for i, rule in enumerate(rules, 1):
        draw.ellipse((1150, y + 4, 1162, y + 16), fill=rgba(GOLD, 255))
        text(draw, (1156, y + 10), str(i), 9, fill=INK, bold=True, anchor="mm")
        wrapped_text(draw, (1174, y), rule, 14, 37, fill=INK_SOFT, spacing=4)
        y += 76
    text(draw, (52, 900), "Safe bounds", 14, fill=INK, bold=True)
    text(draw, (158, 900), "no meaningful alpha inside 8 px runtime edge", 14, fill=INK_SOFT)
    text(draw, (610, 900), "Optical scale", 14, fill=INK, bold=True)
    text(draw, (720, 900), "doors ≈ 18–24 px; people ≈ 12–18 px at 1024×704", 14, fill=INK_SOFT)
    return image


def map_lod_contract() -> Image.Image:
    image = paper_texture((1600, 930), light=True).convert("RGBA")
    draw = ImageDraw.Draw(image, "RGBA")
    text(draw, (52, 40), "World-map semantic zoom and token contract", 38, fill=INK, display=True)
    text(draw, (54, 91), "One world state · three presentation bands · fog rules never change", 17, fill=RUST, bold=True)
    bands = [
        ("STRATEGIC · 0.08–0.39×", "12–18 px marks", ["coast silhouette", "city ownership crest", "fleet strength pennant", "fog frontier"], False),
        ("NORMAL · 0.40–1.49×", "24–40 px tokens", ["class silhouette", "route + turn breaks", "encounter/site shape", "selection ring"], True),
        ("CLOSE · 1.50–3.00×", "40–64 px art", ["painted ship/city art", "wake/contact shadow", "terrain decals", "on-demand label"], True),
    ]
    for i, (label, scale_note, items, detailed) in enumerate(bands):
        x = 52 + i * 510
        box = (x, 150, x + 472, 720)
        draw.rounded_rectangle(box, radius=14, fill=rgba((38, 82, 100), 255), outline=rgba(INK, 255), width=3)
        # Shared landmass makes the level-of-detail change easy to compare.
        island = [(x + 38, 405), (x + 92, 286), (x + 232, 240), (x + 399, 320), (x + 425, 482), (x + 280, 545), (x + 104, 514)]
        draw.polygon(island, fill=rgba((74, 124, 63), 255), outline=rgba(PARCHMENT, 255))
        if detailed:
            for ox, oy in [(120, 350), (172, 300), (270, 345), (340, 390), (198, 442)]:
                r = 16 if i == 1 else 22
                draw.ellipse((x + ox - r, oy - r // 2, x + ox + r, oy + r // 2), fill=rgba((47, 84, 38), 140))
        marker_size = 9 if i == 0 else 16 if i == 1 else 24
        draw_city_marker(draw, (x + 178, 348), "own", marker_size)
        ship_point = (x + 410, 535)
        draw_ship(draw, ship_point, "enemy", max(7, marker_size - 2), selected=i > 0)
        if i > 0:
            route = [
                ship_point,
                (x + 430, 505),
                (x + 445, 475),
                (x + 450, 440),
                (x + 448, 402),
                (x + 445, 365),
            ]
            if any(
                point_in_polygon(point, island)
                for start, end in zip(route[:-1], route[1:], strict=True)
                for point in route_segment_samples(start, end)
            ):
                raise AssertionError("LOD route must remain on water between every marker")
            draw_route_markers(draw, route, 3, 0.75 if i == 1 else 1.0)
        text(draw, (x + 22, 170), label, 16, fill=PARCHMENT_LIGHT, bold=True)
        text(draw, (x + 22, 198), scale_note, 13, fill=GOLD, bold=True)
        y = 590
        for item in items:
            draw.ellipse((x + 24, y + 5, x + 34, y + 15), fill=rgba(GOLD, 255))
            text(draw, (x + 44, y), item, 13, fill=PARCHMENT_LIGHT)
            y += 29
    text(draw, (52, 762), "MASTER / RUNTIME", 16, fill=INK, bold=True)
    rows = [
        "Map tokens: 256×256 RGBA master → 64×64 runtime source; evaluate at 24, 32 and 40 px.",
        "Optical padding: 12.5% transparent safety; subject fills 70–78%; bottom-center visual anchor.",
        "Terrain: 256×256 base/decal masters → 128×128 runtime; variants keyed by deterministic coordinate hash.",
        "Decorative variants change texture and silhouette only; never imply movement, income or combat modifiers.",
        "Responsive views project one source-world semantic state through the terrain crop; viewport-relative placement is forbidden.",
    ]
    y = 796
    for row in rows:
        text(draw, (72, y), "•", 15, fill=RUST, bold=True)
        text(draw, (94, y), row, 14, fill=INK_SOFT)
        y += 28
    return image


def visual_system_contract() -> Image.Image:
    image = paper_texture((1600, 1040), light=True).convert("RGBA")
    draw = ImageDraw.Draw(image, "RGBA")
    text(draw, (52, 40), "Shared visual system · Weathered Parchment & Rope", 38, fill=INK, display=True)
    text(draw, (54, 91), VISUAL_SYSTEM_DECISION_LINE, 17, fill=RUST, bold=True)
    swatches = [
        ("Parchment", PARCHMENT, "#cbb17a family"), ("Ink", INK, "#2c1810"), ("Gold", GOLD, "#c9a227"),
        ("Rust", RUST, "#7a2e1a"), ("Deep sea", DEEP, "#1b4a6b"), ("Shallows", SHALLOWS, "#2a6a8f"),
        ("Land", (74, 124, 63), "#4a7c3f"), ("Fog", FOG, "#0b1a26"), ("Danger", ENEMY, "#a6402f"),
    ]
    for i, (name, color, value) in enumerate(swatches):
        col, row = i % 3, i // 3
        x, y = 52 + col * 260, 150 + row * 112
        draw.rounded_rectangle((x, y, x + 74, y + 74), radius=10, fill=rgba(color, 255), outline=rgba(INK, 255), width=2)
        text(draw, (x + 88, y + 12), name, 14, fill=INK, bold=True)
        text(draw, (x + 88, y + 39), value, 12, fill=INK_SOFT)
    text(draw, (52, 508), "TYPE", 18, fill=INK, bold=True)
    text(draw, (52, 543), "Port Providence", 36, fill=INK, display=True)
    text(draw, (52, 594), "Pirata One · display only · title case", 13, fill=INK_SOFT)
    text(draw, (52, 628), "Cabin keeps controls, counts, hints and long copy immediately readable.", 17, fill=INK)
    text(draw, (52, 662), "12 px minimum at 1× · 14–16 px default · tabular numerals for resources", 13, fill=INK_SOFT)
    text(draw, (870, 150), "LIGHT + MATERIAL", 18, fill=INK, bold=True)
    draw.line((1010, 245, 914, 335), fill=rgba(GOLD, 255), width=8)
    draw.polygon([(914, 335), (925, 308), (944, 326)], fill=rgba(GOLD, 255))
    text(draw, (1040, 222), "NW / TOP-LEFT KEY", 15, fill=INK, bold=True)
    text(draw, (1040, 252), "35° elevation · warm key", 13, fill=INK_SOFT)
    text(draw, (1040, 280), "cool blue-green ambient bounce", 13, fill=INK_SOFT)
    materials = [("timber", (93, 55, 28)), ("limestone", (206, 194, 160)), ("cloth", (122, 46, 26)), ("brass", GOLD), ("rope", (153, 116, 68)), ("water", SHALLOWS)]
    for i, (name, color) in enumerate(materials):
        x, y = 870 + (i % 3) * 220, 374 + (i // 3) * 96
        draw.rounded_rectangle((x, y, x + 66, y + 58), radius=8, fill=rgba(color, 255), outline=rgba(INK, 255), width=2)
        text(draw, (x + 78, y + 17), name, 13, fill=INK, bold=True)
    text(draw, (870, 586), "INTERACTION STATES", 18, fill=INK, bold=True)
    states = [("default", (107, 74, 42)), ("hover", GOLD), ("selected", ROUTE), ("focus", PARCHMENT_LIGHT), ("disabled", NEUTRAL), ("danger", ENEMY)]
    for i, (name, color) in enumerate(states):
        x = 870 + (i % 3) * 220
        y = 630 + (i // 3) * 92
        draw.rounded_rectangle((x, y, x + 178, y + 54), radius=9, fill=rgba(PANEL, 255), outline=rgba(color, 255), width=4 if name in {"selected", "focus"} else 2)
        text(draw, (x + 89, y + 27), name.upper(), 13, fill=color if name != "focus" else TEXT, bold=True, anchor="mm")
    text(draw, (52, 740), "ICON GRAMMAR · 20 PX REFERENCE FAMILY", 18, fill=INK, bold=True)
    icon_examples = [
        ("fleet", "FLEET"),
        ("city", "CITY"),
        ("course", "COURSE"),
        ("zoom_in", "ZOOM +"),
        ("zoom_out", "ZOOM -"),
        ("overview", "OVERVIEW"),
        ("end_turn", "END TURN"),
    ]
    for i, (icon, label) in enumerate(icon_examples):
        x = 52 + i * 108
        draw.rounded_rectangle((x, 778, x + 96, 834), radius=8, fill=rgba(PANEL, 255), outline=rgba((107, 74, 42), 255), width=2)
        draw_maritime_icon(draw, (x + 48, 794), icon, 20)
        text(draw, (x + 48, 820), label, 10, fill=TEXT_DIM, bold=True, anchor="mm")
    icon_notes = [
        "Filled silhouettes at 16–24 px; one interior cut only.",
        "Map ownership pairs flag pattern + silhouette + ring; never red/green alone.",
        "Hover brightens 8%; selected adds a two-ring brass pulse; focus is a static 2 px high-contrast outline.",
        "Labels appear on selection/hover/focus or in the inspector—never permanent black pills over every building.",
        "Motion: 150–220 ms; reduced-motion removes bob, pulse and parallax while retaining static state cues.",
    ]
    y = 858
    for note in icon_notes:
        draw.ellipse((68, y + 4, 78, y + 14), fill=rgba(RUST, 255))
        text(draw, (94, y), note, 14, fill=INK_SOFT)
        y += 30
    return image


def comparison_sheet() -> Image.Image:
    image = paper_texture((1600, 1160), light=True).convert("RGBA")
    draw = ImageDraw.Draw(image, "RGBA")
    text(draw, (52, 38), "Commercial visual direction · operator decision sheet", 38, fill=INK, display=True)
    text(draw, (54, 88), COMPARISON_DECISION_LINE, 17, fill=RUST, bold=True)
    for i, direction in enumerate(DIRECTIONS.values()):
        x = 52 + i * 766
        text(draw, (x, 138), direction.short_name, 25, fill=INK, display=True)
        status_color = RUST if direction.id == "a" else SUCCESS
        text(
            draw,
            (x, 172),
            f"{COMPARISON_DIRECTION_STATUS[direction.id]} · {direction.subtitle}",
            13,
            fill=status_color,
            bold=True,
        )
        map_frame = compose_map_desktop(direction).resize((734, 459), Image.Resampling.LANCZOS)
        city_frame = compose_city_desktop(direction).resize((734, 459), Image.Resampling.LANCZOS)
        image.paste(map_frame.convert("RGB"), (x, 210))
        image.paste(city_frame.convert("RGB"), (x, 692))
        draw.rectangle((x, 210, x + 734, 669), outline=rgba(INK, 255), width=3)
        draw.rectangle((x, 692, x + 734, 1151), outline=rgba(INK, 255), width=3)
    return image


def rejected_sheet() -> Image.Image:
    image = paper_texture((1600, 930), light=True).convert("RGBA")
    draw = ImageDraw.Draw(image, "RGBA")
    text(draw, (52, 38), "Rejected generation evidence", 38, fill=INK, display=True)
    text(draw, (54, 88), "These are source experiments, not the two finished candidate directions. Retained for traceable model selection.", 16, fill=RUST, bold=True)
    items = [
        ("A · DS8 map r1", "a-chartmakers-gouache-map-r1.webp", "Landscape horizon; not a playable overhead map."),
        ("A · DS8 map r2", "a-chartmakers-gouache-map-r2.webp", "Baked frame/text and icon-like single landmass."),
        ("A · DS8 empty r2", "a-chartmakers-gouache-empty-r2.webp", "Hallucinated huts; detached square ground plane."),
        ("A · DS8 full r2", "a-chartmakers-gouache-full-r2.webp", "Collapsed to a castle badge; no harbor districts."),
        ("B · XL empty r1", "b-gilded-harbor-diorama-empty-r1.webp", "Buildings baked into the supposedly empty state."),
        ("B · XL start r1", "b-gilded-harbor-diorama-start-r1.webp", "Architecture drift and incorrect construction count."),
        ("B · XL empty r2", "b-gilded-harbor-diorama-empty-r2.webp", "Camera fixed; lighthouse and fort still baked in."),
        ("B · XL mid r2", "b-gilded-harbor-diorama-mid-r2.webp", "Good material target, but overbuilt and non-modular."),
    ]
    for i, (label, filename, reason) in enumerate(items):
        col, row = i % 4, i // 4
        x, y = 52 + col * 386, 142 + row * 382
        source = Image.open(SOURCES / filename).convert("RGB")
        frame = cover(source, (354, 244), focus=(0.5, 0.5))
        image.paste(frame, (x, y))
        draw.rectangle((x, y, x + 354, y + 244), outline=rgba(INK, 255), width=3)
        text(draw, (x, y + 260), label, 15, fill=INK, bold=True)
        wrapped_text(draw, (x, y + 288), reason, 13, 44, fill=INK_SOFT, spacing=3)
    return image


def grayscale_readability_sheet() -> Image.Image:
    image = paper_texture((1600, 1030), light=True).convert("RGBA")
    draw = ImageDraw.Draw(image, "RGBA")
    text(draw, (52, 38), "Actual-size grayscale readability check", 38, fill=INK, display=True)
    text(draw, (54, 88), "Ownership, route, selection, silhouettes and panel hierarchy must survive without hue.", 16, fill=RUST, bold=True)
    for i, direction in enumerate(DIRECTIONS.values()):
        x = 52 + i * 766
        text(draw, (x, 132), direction.short_name, 23, fill=INK, display=True)
        map_frame = compose_map_desktop(direction).convert("L").convert("RGB").resize((734, 459), Image.Resampling.LANCZOS)
        city_frame = cover(compose_city_desktop(direction).convert("L").convert("RGB"), (734, 367))
        image.paste(map_frame, (x, 170))
        image.paste(city_frame, (x, 650))
        draw.rectangle((x, 170, x + 734, 629), outline=rgba(INK, 255), width=3)
        draw.rectangle((x, 650, x + 734, 1017), outline=rgba(INK, 255), width=3)
    return image


def compose_all() -> None:
    validate_map_world_states()
    for direction in DIRECTIONS.values():
        out = CANDIDATES / f"direction-{direction.id}"
        save(compose_map_desktop(direction), out / "world-map-desktop-1440x900.webp")
        save(compose_map_phone(direction), out / "world-map-phone-375x812.webp")
        save(compose_map_tablet(direction), out / "world-map-tablet-768x1024.webp")
        save(compose_city_desktop(direction), out / "city-desktop-1440x900.webp")
        save(compose_city_phone(direction), out / "city-phone-375x812.webp")
        save(compose_city_tablet(direction), out / "city-tablet-768x1024.webp")
        save(compose_city_stages(direction), out / "city-start-mid-full-1440x560.webp")
        save(compose_candidate_summary(direction), out / "direction-summary-1600x1040.webp")
    save(comparison_sheet(), CANDIDATES / "comparison-contact-sheet-1600x1160.webp")
    save(rejected_sheet(), CANDIDATES / "rejected-generation-contact-sheet-1600x930.webp")
    save(city_contract(), CONTRACTS / "city-scale-depth-anchor-1600x1000.webp")
    save(map_lod_contract(), CONTRACTS / "map-token-lod-1600x930.webp")
    save(visual_system_contract(), CONTRACTS / "visual-system-1600x1040.webp")
    save(grayscale_readability_sheet(), CONTRACTS / "readability-grayscale-1600x1030.webp")


if __name__ == "__main__":
    compose_all()
