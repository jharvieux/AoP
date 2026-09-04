#!/usr/bin/env python3
"""Prompt and deterministic build helpers for issue #609's 20-ship fleet."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ADDITIONS = ROOT / "runtime-additions.json"
PROMPTS = ROOT / "PROMPTS.md"
SOURCE_DIR = ROOT / "sources" / "openai" / "ships"
SOURCE_LIMIT = 300 * 1024
CANVAS_SIZE = 512

FACTION_ORDER = ("british", "dutch", "french", "pirates", "spanish")
CLASS_ORDER = ("sloop", "brigantine", "frigate", "galleon")
REUSED_IDS = {"ship:british:sloop", "ship:pirates:galleon"}

REFERENCE_INPUTS = [
    {
        "path": "../commercial-visual-v2/sources/b-gilded-harbor-diorama-map-r1.webp",
        "sha256": "c80a488f0e2c02a4eaaabcc0e4b08fe481cd238bcc44b97dbf89f339e939c9f9",
        "role": "Direction B painted material, palette, overhead camera, and northwest-light reference only",
    },
    {
        "path": "sources/runtime/ship-british-sloop-512.webp",
        "sha256": "ee89df4c18e8ca42f213b2fbf7f15499636d55a8a04f5f937c194292a20eb6e2",
        "role": "approved small-class finish, clean-alpha, optical-baseline, and scale reference only",
    },
    {
        "path": "sources/runtime/ship-pirates-galleon-512.webp",
        "sha256": "643f44b884ac4dccf89c9aae746d1c79fe09d98ada4a902fe358ff8120c13648",
        "role": "approved heavy-class finish, clean-alpha, optical-baseline, and scale reference only",
    },
]

CAPTURE_PATHS = {
    "ship:british:brigantine": "exec-3993a37d-563c-4f12-936e-e93522974f2e.png",
    "ship:british:frigate": "exec-38fe7379-6ef9-42d4-924e-52e53ed0a8ab.png",
    "ship:british:galleon": "exec-ade15897-b41b-4ecc-85f9-55545fe16a8a.png",
    "ship:dutch:sloop": "exec-5b647c69-9fb6-40c5-a265-0b53839c6dd8.png",
    "ship:dutch:brigantine": "exec-a84aae9a-214d-4de0-a1bb-e7ccb62d6e15.png",
    "ship:dutch:frigate": "exec-a6787bb3-227e-4851-b994-c83ebb8702ae.png",
    "ship:dutch:galleon": "exec-ff04692a-b1b9-478a-871b-271aee791de4.png",
    "ship:french:sloop": "exec-ff497b33-9aed-4ebb-9571-aa81f9e9bb69.png",
    "ship:french:brigantine": "exec-ae9b7bd2-2e4b-4e03-a1ab-b9f22f84294f.png",
    "ship:french:frigate": "exec-8b3ca46a-1a91-40fc-8948-d66084d6e0c2.png",
    "ship:french:galleon": "exec-7bd929f4-d648-4fa6-a1a5-eaa6ba5f94d6.png",
    "ship:pirates:sloop": "exec-0b232131-fc5c-4b7e-9a06-192a756dc21b.png",
    "ship:pirates:brigantine": "exec-ba777ee8-891e-41e0-9834-04eb2685f4ce.png",
    "ship:pirates:frigate": "exec-c95a1888-44de-43c1-8423-6fd0a2ca1655.png",
    "ship:spanish:sloop": "exec-46e588a3-bae7-4d06-be67-f5c907edb9fd.png",
    "ship:spanish:brigantine": "exec-b76edbef-f32a-4434-a27d-199d980297ea.png",
    "ship:spanish:frigate": "exec-a36ab5f7-73e5-4348-a420-a598967733c3.png",
    "ship:spanish:galleon": "exec-92ae9e4c-cff5-4a35-bed9-1a20cde0d46e.png",
}

GENERATION_ROOT = (
    "/Users/johnharvieux/.codex/generated_images/"
    "01a06998-3b51-7112-b350-4c5f41382196"
)

CHECKERBOARD_RECOVERY_IDS = {"ship:pirates:frigate", "ship:spanish:sloop"}

FACTIONS = {
    "british": {
        "name": "British Royal Navy",
        "construction": (
            "disciplined naval construction: a squared transom, straight gunport rhythm, "
            "taut orderly rigging, clean cream canvas, and one restrained navy-and-red "
            "rectangular sail panel"
        ),
        "cue": (
            "The squared stern, ruler-straight spars, and rectangular panel are the "
            "British non-color cues; never use a diagonal cross or Spanish-style castle."
        ),
    },
    "dutch": {
        "name": "Dutch charter-company",
        "construction": (
            "broad practical merchant-naval construction: a rounded full bow, low wide "
            "cargo hull, stepped boxy transom, compact sturdy rigging, and one restrained "
            "orange-and-indigo horizontal sail band"
        ),
        "cue": (
            "The broad beam, stepped transom, and low mercantile stance are the Dutch "
            "non-color cues; avoid crown-navy symmetry and ornate castles."
        ),
    },
    "french": {
        "name": "French crown and corsair",
        "construction": (
            "elegant fast naval construction: a long narrow hull, swept curved stern rail, "
            "slender raked masts, restrained gold scroll at bow and stern, and one muted "
            "blue-and-cream crescent sail panel"
        ),
        "cue": (
            "The elongated hull, swept stern, and crescent panel are the French non-color "
            "cues; keep the silhouette graceful rather than broad or blocky."
        ),
    },
    "pirates": {
        "name": "independent pirate",
        "construction": (
            "improvised predatory construction: a dark salt-blackened hull, asymmetric "
            "yards, mismatched rope repairs, two large irregular canvas patches, and one "
            "jagged repaired sail edge"
        ),
        "cue": (
            "The broken symmetry, patched canvas, and jagged edge are the pirate non-color "
            "cues; no skull, bones, flag, or heraldic emblem."
        ),
    },
    "spanish": {
        "name": "Spanish treasure-fleet",
        "construction": (
            "high-sided Iberian construction: a rounded forecastle, tiered curved "
            "sterncastle, heavy warm timber, restrained gold trim, and one muted "
            "red-and-ochre diagonal-lattice sail panel"
        ),
        "cue": (
            "The rounded tiered castles and diagonal lattice are the Spanish non-color "
            "cues; they must remain distinct from the British squared stern and rectangles."
        ),
    },
}

CLASSES = {
    "sloop": {
        "name": "sloop",
        "subject": (
            "one small, very narrow single-masted sloop with a long bowsprit, one broad "
            "fore-and-aft mainsail and one triangular headsail; low open deck, no gun deck"
        ),
        "silhouette": (
            "one mast and the slim needle-like hull must be unmistakable at 24 pixels"
        ),
    },
    "brigantine": {
        "name": "brigantine",
        "subject": (
            "one medium two-masted brigantine: square sails on the forward mast, one large "
            "fore-and-aft gaff sail on the aft mast, pronounced bowsprit, low fighting hull, "
            "and a compact raised quarterdeck"
        ),
        "silhouette": (
            "exactly two masts and the mixed square-plus-gaff rig must read at 24 pixels"
        ),
    },
    "frigate": {
        "name": "frigate",
        "subject": (
            "one long lean three-masted frigate with three disciplined square-rig towers, "
            "a visibly extended single gun deck, sharp bow, low stern, and a fast narrow hull"
        ),
        "silhouette": (
            "three tall masts over a long low hull must read as faster and leaner than the galleon"
        ),
    },
    "galleon": {
        "name": "galleon",
        "subject": (
            "one massive three-masted ocean galleon with a broad deep hull, high forecastle, "
            "towering multi-level stern, stacked square sails, and a short heavy bowsprit"
        ),
        "silhouette": (
            "the tall stern mass and broad deep hull must read as the heaviest class at 24 pixels"
        ),
    },
}


def asset_id(faction: str, ship_class: str) -> str:
    return f"ship:{faction}:{ship_class}"


def generated_ids() -> list[str]:
    return [
        asset_id(faction, ship_class)
        for faction in FACTION_ORDER
        for ship_class in CLASS_ORDER
        if asset_id(faction, ship_class) not in REUSED_IDS
    ]


def exact_prompt(identifier: str) -> str:
    _, faction, ship_class = identifier.split(":")
    faction_spec = FACTIONS[faction]
    class_spec = CLASSES[ship_class]
    return f"""Use case: stylized-concept
Asset type: production world-map ship token for a commercial pirate strategy game
Input images: Image 1 is the approved Direction B map reference for painted material, palette, strict overhead camera, and northwest lighting only. Image 2 is the approved British sloop reference for token finish, clean alpha, optical baseline, and small-class scale only. Image 3 is the approved pirate galleon reference for token finish, clean alpha, optical baseline, and heavy-class scale only. Do not copy terrain, water, wakes, shadows, flags, exact hull decoration, or either reference ship as another class.
Primary request: create one isolated {faction_spec['name']} {class_spec['name']} as a genuinely distinct faction-and-class production asset.
Subject: {class_spec['subject']}. Apply {faction_spec['construction']}.
Class-readability rule: {class_spec['silhouette']}.
Faction-readability rule: {faction_spec['cue']}
Style/medium: Direction B “Gilded Harbor Diorama”; premium hand-painted strategy-game miniature with layered gouache and restrained oil-brush texture, simplified warm weathered timber and canvas, deep readable value separation, broad authored shapes over micro-detail, dimensional but clearly illustrated, not photorealistic and not generic 3D.
Composition/framing: strict orthographic near-overhead camera at about 82 degrees, no horizon; bow points toward the upper-right and stern toward the lower-left; centered single ship; bottom-center optical anchor shared with the reference fleet; the complete rig and hull fill about 72% of a square canvas with at least 13% transparent safety on every edge; preserve natural ship aspect ratio; no cropping. Use only two or three major value planes so the silhouette survives at exact 24, 32, 48, and 96 CSS pixels.
Lighting/mood: warm northwest/top-left key light at about 35 degrees elevation, cool blue-green ambient shadow, consistent across hull and sails. No disconnected cast shadow.
Output requirements: one isolated ship only on a genuinely transparent RGBA background. Transparent pixels must be truly transparent, never a checkerboard, white/gray plate, pale matte, or halo. Straight clean alpha with no baked background. No water, terrain, wake, foam, contact shadow, icon ring, selection state, UI, text, letters, numbers, signature, logo, watermark, people, animals, smoke, fire, flag, pennant, coat of arms, cross, skull, bones, or gameplay modifier. Do not add another boat or loose object."""


def pirate_frigate_recovery_prompt() -> str:
    return (
        exact_prompt("ship:pirates:frigate")
        + "\nRecovery requirement after a rejected alpha result: create a genuinely new "
        "Pirate frigate variant, not an edit of the rejected image. Transparency is "
        "load-bearing. The canvas outside the connected ship silhouette must contain actual "
        "alpha-zero pixels at the file level. Do not visualize transparency with any "
        "checkerboard, gradient, vignette, glow, shadow, color field, or black backdrop."
    )


def spanish_sloop_alpha_prompt() -> str:
    return """Use case: background-extraction
Asset type: transparent production world-map ship token
Input images: Image 1 is the sole edit target, the accepted Spanish sloop concept.
Primary request: remove the entire dark brown and black vignette, glow, and background outside the Spanish sloop and replace it with genuine transparent alpha.
Constraints: preserve the complete Spanish sloop exactly—its narrow hull, single mast, bowsprit, cream sails, red-and-ochre diagonal lattice, tiered curved stern, rigging, northwest lighting, camera, proportions, color, internal shadows, edges, and composition. Keep every connected ship pixel and remove every disconnected backdrop pixel. Return a clean isolated RGBA cutout with at least fully transparent and fully opaque pixels. No checkerboard, white or gray matte, colored halo, terrain, water, wake, contact shadow, new object, crop, restyle, text, signature, logo, or watermark."""


def pirate_frigate_alpha_prompt() -> str:
    return """Use case: background-extraction
Asset type: transparent production world-map ship token
Input images: Image 1 is the sole edit target, the accepted Pirate frigate concept.
Primary request: remove the entire dark brown and black vignette, glow, and background outside the Pirate frigate and replace it with genuine transparent alpha.
Constraints: preserve the complete Pirate frigate exactly—its hull, all three masts, spars, rigging, patched and torn sails, cannons, northwest lighting, camera, proportions, color, internal shadows, edges, and composition. Keep every connected ship pixel and remove every disconnected backdrop pixel. Return a clean isolated RGBA cutout with at least fully transparent and fully opaque pixels. No checkerboard, white or gray matte, colored halo, terrain, water, wake, contact shadow, new object, crop, restyle, text, signature, logo, or watermark."""


def selected_prompt(identifier: str) -> tuple[str, str, str]:
    if identifier == "ship:pirates:frigate":
        return (
            "ship-pirates-frigate-runtime-r2",
            "stylized-concept-recovery",
            pirate_frigate_recovery_prompt(),
        )
    if identifier == "ship:spanish:sloop":
        return (
            "ship-spanish-sloop-runtime-alpha-edit",
            "background-extraction",
            spanish_sloop_alpha_prompt(),
        )
    _, faction, ship_class = identifier.split(":")
    return (
        f"ship-{faction}-{ship_class}-runtime",
        "stylized-concept",
        exact_prompt(identifier),
    )


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def alpha_bbox(image: Image.Image) -> list[int] | None:
    if "A" not in image.getbands():
        return None
    bbox = image.getchannel("A").point(lambda value: 255 if value >= 8 else 0).getbbox()
    return list(bbox) if bbox else None


def has_real_alpha(image: Image.Image) -> bool:
    return image.mode == "RGBA" and image.getchannel("A").getextrema() == (0, 255)


def checkerboard_to_rgba(image: Image.Image) -> Image.Image:
    """Recover alpha from the built-in generator's neutral checkerboard visualization."""

    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    maximum = rgb.max(axis=2)
    minimum = rgb.min(axis=2)
    chroma = maximum - minimum
    luminance = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]

    alpha = np.full(luminance.shape, 255.0, dtype=np.float32)
    neutral = chroma <= 9.0
    alpha[neutral & (luminance >= 235.0)] = 0.0
    feather = neutral & (luminance >= 205.0) & (luminance < 235.0)
    alpha[feather] = (235.0 - luminance[feather]) / 30.0 * 255.0

    fraction = alpha / 255.0
    soft = (fraction > 0.0) & (fraction < 1.0)
    for channel in range(3):
        values = rgb[:, :, channel]
        values[soft] = np.clip(
            (values[soft] - 249.0 * (1.0 - fraction[soft])) / fraction[soft],
            0.0,
            255.0,
        )
    rgba = np.dstack((rgb.clip(0, 255).astype(np.uint8), alpha.clip(0, 255).astype(np.uint8)))
    return Image.fromarray(rgba, "RGBA")


def remove_alpha_islands(image: Image.Image, min_pixels: int = 8) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    visible = pixels[:, :, 3] >= 8
    visited = np.zeros(visible.shape, dtype=bool)
    height, width = visible.shape
    for start_y, start_x in np.argwhere(visible):
        y, x = int(start_y), int(start_x)
        if visited[y, x]:
            continue
        component: list[tuple[int, int]] = []
        queue: deque[tuple[int, int]] = deque([(y, x)])
        visited[y, x] = True
        while queue:
            current_y, current_x = queue.popleft()
            component.append((current_y, current_x))
            for neighbor_y in range(max(0, current_y - 1), min(height, current_y + 2)):
                for neighbor_x in range(max(0, current_x - 1), min(width, current_x + 2)):
                    if visible[neighbor_y, neighbor_x] and not visited[neighbor_y, neighbor_x]:
                        visited[neighbor_y, neighbor_x] = True
                        queue.append((neighbor_y, neighbor_x))
        if len(component) < min_pixels:
            rows, columns = zip(*component)
            pixels[rows, columns] = 0
    return Image.fromarray(pixels, "RGBA")


def premultiplied_resize(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return image.convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")


def normalize_source(image: Image.Image, identifier: str, subject_size: int) -> Image.Image:
    if identifier in CHECKERBOARD_RECOVERY_IDS:
        rgba = checkerboard_to_rgba(image)
    elif has_real_alpha(image):
        rgba = image.convert("RGBA")
    else:
        raise ValueError(f"{identifier}: selected source lacks real alpha")
    bbox = rgba.getchannel("A").point(lambda value: 255 if value >= 8 else 0).getbbox()
    if bbox is None:
        raise ValueError(f"{identifier}: selected source has no visible subject")
    crop = rgba.crop(bbox)
    scale = min(subject_size / crop.width, subject_size / crop.height)
    resized = premultiplied_resize(
        crop,
        (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
    )
    resized = remove_alpha_islands(resized)
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    x = (CANVAS_SIZE - resized.width) // 2
    y = CANVAS_SIZE - 64 - resized.height
    canvas.alpha_composite(resized, (x, y))
    pixels = np.asarray(canvas).copy()
    pixels[pixels[:, :, 3] == 0, :3] = 0
    return Image.fromarray(pixels, "RGBA")


def public_path(identifier: str) -> str:
    _, faction, ship_class = identifier.split(":")
    return f"apps/web/public/art/factions/{faction}/ship_{ship_class}_v2.webp"


def rejection_rows() -> list[dict[str, object]]:
    return [
        {
            "id": "ship:pirates:frigate:concept-r1",
            "prompt_section": "ship-pirates-frigate-runtime",
            "capture_path": f"{GENERATION_ROOT}/exec-870155b2-cdb0-4b48-b7f8-de258e6b6c97.png",
            "sha256": "6b2bd7f49d010c9ae51c4a7bd161d2dcbc5b36a6a243fe27ed1451ad83b47887",
            "bytes": 2011757,
            "dimensions": [1024, 1536],
            "mode": "RGBA",
            "alpha_extrema": [0, 254],
            "retained": False,
            "reason": "baked dark-brown vignette and no fully opaque pixels",
        },
        {
            "id": "ship:pirates:frigate:alpha-edit-r1",
            "prompt_section": "ship-pirates-frigate-runtime-alpha-edit-rejected",
            "capture_path": f"{GENERATION_ROOT}/exec-80c12625-4c28-42f5-91c1-9b7aded74b8b.png",
            "sha256": "ddf243ad208eab7285b13fa06fab5f7312dd57619ecef92e2d6829e5a183c5d6",
            "bytes": 1907076,
            "dimensions": [1024, 1536],
            "mode": "RGB",
            "alpha_extrema": None,
            "retained": False,
            "reason": "painted a checkerboard into RGB instead of returning alpha; composition was superseded",
        },
        {
            "id": "ship:spanish:sloop:concept-r1",
            "prompt_section": "ship-spanish-sloop-runtime",
            "capture_path": f"{GENERATION_ROOT}/exec-f9e3bf44-a734-42e2-9722-d33d232c76d5.png",
            "sha256": "ff80dbef519bbf58856a2571d497ade14fcf3b1a6fc40dc8679b61ef912c55e4",
            "bytes": 1679559,
            "dimensions": [1024, 1536],
            "mode": "RGBA",
            "alpha_extrema": [0, 254],
            "retained": False,
            "reason": "baked dark-brown vignette and no fully opaque pixels; transparent edit selected",
        },
    ]


def prompt_markdown() -> str:
    sections = [
        "## Runtime 20-ship fleet generation note\n\n"
        "The eighteen sections below are the exact request bodies sent on 2026-09-04, "
        "one built-in OpenAI image-generator concept call per missing faction/class identity. "
        "Every call attached the same three locally inspected references in this order: "
        "Direction B map (style/camera/light), approved British sloop (small-class finish/baseline), "
        "approved Pirate galleon (heavy-class finish/baseline). The interface exposed neither "
        "model identifier nor seed; both remain `null` in `runtime-additions.json`.\n"
    ]
    for identifier in generated_ids():
        _, faction, ship_class = identifier.split(":")
        sections.append(
            f"## ship-{faction}-{ship_class}-runtime\n\n```text\n{exact_prompt(identifier)}\n```\n"
        )
    sections.extend(
        [
            "## ship-pirates-frigate-runtime-alpha-edit-rejected\n\n"
            f"```text\n{pirate_frigate_alpha_prompt()}\n```\n",
            "## ship-pirates-frigate-runtime-r2\n\n"
            f"```text\n{pirate_frigate_recovery_prompt()}\n```\n",
            "## ship-spanish-sloop-runtime-alpha-edit\n\n"
            f"```text\n{spanish_sloop_alpha_prompt()}\n```\n",
        ]
    )
    return "\n".join(sections)


def write_prompts() -> None:
    marker = "## Runtime 20-ship fleet generation note"
    existing = PROMPTS.read_text()
    if marker in existing:
        existing = existing.split(marker, 1)[0].rstrip() + "\n\n"
    PROMPTS.write_text(existing + prompt_markdown().rstrip() + "\n")


def verify_reference_inputs() -> None:
    for item in REFERENCE_INPUTS:
        path = ROOT / str(item["path"])
        if not path.is_file() or sha256(path) != item["sha256"]:
            raise ValueError(f"ship reference input drifted: {path}")


def normalize_sources() -> None:
    verify_reference_inputs()
    additions = json.loads(ADDITIONS.read_text())
    prior_assets = [
        asset for asset in additions["assets"] if str(asset["id"]) not in set(generated_ids())
    ]
    prior_by_id = {str(asset["id"]): asset for asset in additions["assets"]}
    rows: list[dict[str, object]] = []
    for identifier in generated_ids():
        _, faction, ship_class = identifier.split(":")
        prompt_key = f"ship-{faction}-{ship_class}-runtime"
        source_relative = f"sources/openai/ships/{faction}-{ship_class}-source.png"
        path = ROOT / source_relative
        prior = prior_by_id.get(identifier)
        if prior and prior.get("retained_source_sha256"):
            if sha256(path) != prior["retained_source_sha256"]:
                raise ValueError(f"{identifier}: retained normalized source hash drifted")
            image = Image.open(path)
            if image.mode != "RGBA" or image.size != (CANVAS_SIZE, CANVAS_SIZE):
                raise ValueError(f"{identifier}: retained normalized source shape drifted")
            if path.stat().st_size > SOURCE_LIMIT:
                raise ValueError(f"{identifier}: retained source exceeds {SOURCE_LIMIT} bytes")
            rows.append(prior)
            continue

        if not path.is_file():
            raise FileNotFoundError(path)
        original_bytes = path.read_bytes()
        original = Image.open(path)
        original_metadata = {
            "capture_path": f"{GENERATION_ROOT}/{CAPTURE_PATHS[identifier]}",
            "project_bound_path": source_relative,
            "sha256": sha256_bytes(original_bytes),
            "bytes": len(original_bytes),
            "dimensions": list(original.size),
            "mode": original.mode,
            "alpha_extrema": (
                list(original.getchannel("A").getextrema())
                if "A" in original.getbands()
                else None
            ),
            "alpha_bbox_at_threshold_8": alpha_bbox(original),
            "retained": False,
            "disposition": (
                "selected generated bytes were copied into the project, measured, then replaced "
                "in place by the deterministic 512 px RGBA normalized source"
            ),
        }
        normalized = None
        subject_size = 0
        for candidate_size in (384, 368, 352, 336, 320):
            candidate = normalize_source(original, identifier, candidate_size)
            candidate.save(path, "PNG", compress_level=9, optimize=False)
            if path.stat().st_size <= SOURCE_LIMIT:
                normalized = candidate
                subject_size = candidate_size
                break
        if normalized is None:
            raise ValueError(f"{identifier}: normalized source cannot meet {SOURCE_LIMIT} bytes")
        section, request_kind, prompt = selected_prompt(identifier)
        public = public_path(identifier)
        rows.append(
            {
                "id": identifier,
                "label": f"{faction.title()} {ship_class}",
                "category": "ships",
                "faction": faction,
                "ship_class": ship_class,
                "context": "water",
                "anchor": "bottom-center",
                "prompt_key": prompt_key,
                "selected_prompt_section": section,
                "selected_prompt_sha256": sha256_bytes(prompt.encode()),
                "generation": {
                    "service": "OpenAI built-in image generator in Codex",
                    "tool": "image_gen.imagegen",
                    "date": "2026-09-04",
                    "request_kind": request_kind,
                    "model": None,
                    "seed": None,
                    "interface_model_exposed": False,
                    "interface_seed_exposed": False,
                    "input_references": REFERENCE_INPUTS,
                },
                "retained_source_file": source_relative,
                "retained_source_sha256": sha256(path),
                "retained_source_bytes": path.stat().st_size,
                "retained_source_dimensions": [CANVAS_SIZE, CANVAS_SIZE],
                "retained_source_mode": "RGBA",
                "retained_alpha_bbox": alpha_bbox(normalized),
                "subject_max_dimension": subject_size,
                "alpha_source": (
                    "deterministic neutral-checkerboard recovery from selected built-in output"
                    if identifier in CHECKERBOARD_RECOVERY_IDS
                    else "native full-range RGBA from built-in output"
                ),
                "unretained_original": original_metadata,
                "public_path": public,
                "url": "/" + public.removeprefix("apps/web/public/"),
            }
        )

    additions["retention_policy"] = (
        "Every selected generated byte stream was measured and then replaced in place by a "
        "deterministic project-bound 512 px RGBA PNG below the 300 KiB ceiling. Original hashes, "
        "sizes, dimensions, alpha bounds, and capture paths remain as unretained provenance; "
        "retained hashes identify committed files."
    )
    additions["ship_fleet"] = {
        "identity_count": 20,
        "generated_count": 18,
        "reused_count": 2,
        "factions": list(FACTION_ORDER),
        "classes": list(CLASS_ORDER),
        "generation_service": "OpenAI built-in image generator in Codex",
        "generation_tool": "image_gen.imagegen",
        "generation_date": "2026-09-04",
        "model": None,
        "seed": None,
        "interface_model_exposed": False,
        "interface_seed_exposed": False,
        "generation_inputs": REFERENCE_INPUTS,
        "normalization": {
            "tool": "tools/ship_fleet.py --normalize-sources",
            "operation": (
                "verify native full-range RGBA, or recover only the two explicitly recorded "
                "checkerboard returns; crop alpha at threshold 8; premultiplied-Lanczos scale; "
                "bottom-align to y=448 on a transparent 512 px canvas; zero transparent RGB; "
                "encode canonical PNG; reduce all only as needed to meet the hard ceiling"
            ),
            "hard_ceiling_bytes": SOURCE_LIMIT,
        },
        "usage_license_basis": (
            "Outputs were created specifically for this project through the user's OpenAI "
            "subscription under D-049 and remain subject to applicable OpenAI terms. No "
            "third-party stock input was used; no exclusivity or copyrightability claim is made."
        ),
        "rejections": rejection_rows(),
    }
    additions["assets"] = [*prior_assets, *rows]
    ADDITIONS.write_text(json.dumps(additions, indent=2) + "\n")
    print(f"normalized and recorded {len(rows)} generated ship sources")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", choices=generated_ids())
    parser.add_argument("--emit-markdown", action="store_true")
    parser.add_argument("--write-prompts", action="store_true")
    parser.add_argument("--normalize-sources", action="store_true")
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args()
    if args.prompt:
        print(exact_prompt(args.prompt))
    elif args.emit_markdown:
        print(prompt_markdown())
    elif args.write_prompts:
        write_prompts()
    elif args.normalize_sources:
        normalize_sources()
    elif args.list:
        print(json.dumps(generated_ids(), indent=2))
    else:
        parser.error(
            "choose --prompt, --emit-markdown, --write-prompts, --normalize-sources, or --list"
        )


if __name__ == "__main__":
    main()
