#!/usr/bin/env python3
"""Prepare overlapping edit targets for the high-density city backdrop."""

from pathlib import Path

from PIL import Image, ImageDraw


PACKAGE = Path(__file__).resolve().parents[1]
SOURCE = PACKAGE / "layers" / "empty-backdrop-2048x1408.webp"
OUTPUT = PACKAGE / "sources" / "backdrop-detail-inputs"
PROOF = PACKAGE / "proofs" / "backdrop-detail-input-contact-1600x1280.webp"
TILE_SIZE = 416
X_POSITIONS = (0, 326, 653, 979, 1306, 1632)
Y_POSITIONS = (0, 331, 661, 992)


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    assert source.size == (2048, 1408)
    OUTPUT.mkdir(parents=True, exist_ok=True)

    contact = Image.new("RGB", (1600, 1280), "#20150e")
    draw = ImageDraw.Draw(contact)
    preview_width = 250
    preview_height = 250
    for row, top in enumerate(Y_POSITIONS):
        for column, left in enumerate(X_POSITIONS):
            tile = source.crop((left, top, left + TILE_SIZE, top + TILE_SIZE))
            name = f"backdrop-detail-c{column + 1}r{row + 1}-input.webp"
            tile.save(OUTPUT / name, "WEBP", quality=94, method=6)
            preview = tile.resize((preview_width, preview_height), Image.Resampling.LANCZOS)
            x = column * 265 + 5
            y = row * 320 + 10
            contact.paste(preview, (x, y))
            draw.rectangle((x, y, x + preview_width - 1, y + preview_height - 1), outline="#d2a820", width=2)
            draw.text((x + 8, y + 8), f"C{column + 1} R{row + 1}", fill="#ffffff", stroke_width=2, stroke_fill="#20150e")

    contact.save(PROOF, "WEBP", quality=70, method=6)
    print(f"prepared {len(X_POSITIONS) * len(Y_POSITIONS)} overlapping {TILE_SIZE} px edit targets")


if __name__ == "__main__":
    main()
