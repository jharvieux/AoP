#!/usr/bin/env python3
"""Prepare overlapping town-hall edit targets for native 3x/DPR2 detail."""

from pathlib import Path

from PIL import Image, ImageDraw


PACKAGE = Path(__file__).resolve().parents[1]
SOURCE = PACKAGE / "sources" / "townhall-source-r1.webp"
OUTPUT = PACKAGE / "sources" / "townhall-detail-inputs"
PROOF = PACKAGE / "proofs" / "townhall-detail-input-contact-1200x760.webp"
CROPS = {
    "left": (0, 0, 768, 1254),
    "right": (486, 0, 1254, 1254),
}


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    assert source.size == (1254, 1254)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    contact = Image.new("RGB", (1200, 760), "#20150e")
    draw = ImageDraw.Draw(contact)
    for index, (name, box) in enumerate(CROPS.items()):
        crop = source.crop(box)
        crop.save(OUTPUT / f"townhall-{name}-input.webp", "WEBP", quality=96, method=6)
        preview = crop.resize((462, 700), Image.Resampling.LANCZOS)
        x = 64 + index * 610
        contact.paste(preview, (x, 30))
        draw.rectangle((x, 30, x + 461, 729), outline="#d2a820", width=3)
        draw.text((x + 12, 42), name.upper(), fill="#ffffff", stroke_width=2, stroke_fill="#20150e")
    contact.save(PROOF, "WEBP", quality=78, method=6)
    print("prepared two overlapping town-hall edit targets")


if __name__ == "__main__":
    main()
