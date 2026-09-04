#!/usr/bin/env python3
"""Normalize selected high-resolution generations into retained authoring sources."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


PACKAGE = Path(__file__).resolve().parents[1]
BACKDROP_RAW = PACKAGE / "sources" / "backdrop-detail-tiles"
TOWNHALL_RAW = PACKAGE / "sources" / "townhall-detail-outputs"
TOWNHALL_BASE = PACKAGE / "sources" / "townhall-source-r1.webp"
TOWNHALL_MASK = PACKAGE / "masks" / "townhall-mask.png"
TOWNHALL_DETAIL_MASK = PACKAGE / "masks" / "townhall-detail-mask.png"
TOWNHALL_DETAIL_SOURCE = PACKAGE / "sources" / "townhall-source-r3.webp"
BACKDROP_CONTACT = PACKAGE / "proofs" / "backdrop-detail-output-contact-1600x1080.webp"
TOWNHALL_CONTACT = PACKAGE / "proofs" / "townhall-detail-output-contact-1200x760.webp"
TOWNHALL_SIZE = 1602


def save_webp(image: Image.Image, path: Path, quality: int) -> None:
    image.save(path, "WEBP", quality=quality, method=6, exact=True)


def normalize_backdrop_tiles() -> None:
    contact = Image.new("RGB", (1600, 1080), "#20150e")
    draw = ImageDraw.Draw(contact)
    for row in range(1, 5):
        for column in range(1, 7):
            stem = f"backdrop-detail-c{column}r{row}-r2"
            raw_path = BACKDROP_RAW / f"{stem}.png"
            retained_path = BACKDROP_RAW / f"{stem}.webp"
            raw = Image.open(raw_path if raw_path.is_file() else retained_path).convert("RGB")
            assert raw.size == (1254, 1254)
            if raw_path.is_file():
                save_webp(raw, retained_path, 70)
            preview = raw.resize((250, 250), Image.Resampling.LANCZOS)
            x = (column - 1) * 265 + 5
            y = (row - 1) * 265 + 5
            contact.paste(preview, (x, y))
            draw.rectangle((x, y, x + 249, y + 249), outline="#d2a820", width=2)
            draw.text((x + 8, y + 8), f"C{column} R{row}", fill="#ffffff", stroke_width=2, stroke_fill="#20150e")
    save_webp(contact, BACKDROP_CONTACT, 50)


def high_frequency_luma(image: Image.Image, radius: float = 7) -> np.ndarray:
    gray = np.asarray(image.convert("L"), dtype=np.float32)
    low = np.asarray(image.convert("L").filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32)
    return gray - low


def build_townhall_source() -> None:
    base = Image.open(TOWNHALL_BASE).convert("RGB").resize(
        (TOWNHALL_SIZE, TOWNHALL_SIZE), Image.Resampling.LANCZOS
    )
    base_array = np.asarray(base, dtype=np.float32)
    detail_sum = np.zeros((TOWNHALL_SIZE, TOWNHALL_SIZE), dtype=np.float32)
    weight_sum = np.zeros((TOWNHALL_SIZE, TOWNHALL_SIZE), dtype=np.float32)

    specs = (("left", 0, True), ("right", 621, False))
    for name, left, owns_outer_edge in specs:
        raw_path = TOWNHALL_RAW / f"townhall-{name}-r1.png"
        retained_path = TOWNHALL_RAW / f"townhall-{name}-r1.webp"
        generated = Image.open(raw_path if raw_path.is_file() else retained_path).convert("RGB").resize(
            (981, TOWNHALL_SIZE), Image.Resampling.LANCZOS
        )
        if raw_path.is_file():
            save_webp(generated, retained_path, 82)
        detail = high_frequency_luma(generated)
        base_crop = base.crop((left, 0, left + 981, TOWNHALL_SIZE)).convert("L")
        generated_low = np.asarray(
            generated.convert("L").filter(ImageFilter.GaussianBlur(7)), dtype=np.float32
        )
        base_low = np.asarray(base_crop.filter(ImageFilter.GaussianBlur(7)), dtype=np.float32)
        similarity = np.exp(-np.square((generated_low - base_low) / 28))
        base_gray = np.asarray(base_crop, dtype=np.float32)
        gradient_y, gradient_x = np.gradient(base_gray)
        flatness = np.clip(1 - np.hypot(gradient_x, gradient_y) / 18, 0, 1)
        weight = np.ones((TOWNHALL_SIZE, 981), dtype=np.float32)
        ramp = np.linspace(1, 0, 260, dtype=np.float32)
        if owns_outer_edge:
            weight[:, -260:] *= ramp
        else:
            weight[:, :260] *= ramp[::-1]
        weight *= similarity * flatness
        detail_sum[:, left : left + 981] += detail * weight
        weight_sum[:, left : left + 981] += weight

    combined_detail = np.divide(
        detail_sum,
        np.maximum(weight_sum, 1),
        out=np.zeros_like(detail_sum),
        where=weight_sum > 0,
    )
    result = np.clip(base_array + combined_detail[:, :, None] * 0.52, 0, 255).astype(np.uint8)
    save_webp(Image.fromarray(result, "RGB"), TOWNHALL_DETAIL_SOURCE, 76)

    mask = Image.open(TOWNHALL_MASK).convert("L").resize(
        (TOWNHALL_SIZE, TOWNHALL_SIZE), Image.Resampling.LANCZOS
    )
    mask.save(TOWNHALL_DETAIL_MASK, "PNG", optimize=True)

    contact = Image.new("RGB", (1200, 760), "#20150e")
    draw = ImageDraw.Draw(contact)
    for index, name in enumerate(("left", "right")):
        image = Image.open(TOWNHALL_RAW / f"townhall-{name}-r1.webp").convert("RGB")
        preview = image.resize((462, 700), Image.Resampling.LANCZOS)
        x = 64 + index * 610
        contact.paste(preview, (x, 30))
        draw.rectangle((x, 30, x + 461, 729), outline="#d2a820", width=3)
        draw.text((x + 12, 42), name.upper(), fill="#ffffff", stroke_width=2, stroke_fill="#20150e")
    save_webp(contact, TOWNHALL_CONTACT, 68)


def main() -> None:
    normalize_backdrop_tiles()
    build_townhall_source()
    print("normalized 24 backdrop details and composed the 1602 px town-hall source")


if __name__ == "__main__":
    main()
