"""Established AoP art-generation prompts (durable copy, issue #444).

These are the prompt families behind the shipped art, previously scattered
across session scripts (gen_city_art.py, party_art.py, tier1_unit_art.py at
~/aop-ai-tools). Import alongside comfyui_client, e.g.:

    from aop_styles import BUILDING_STYLE, BUILDING_NEGATIVE, BUILDINGS
    from comfyui_client import txt2img
    pngs = txt2img(BUILDING_STYLE.format(subject=BUILDINGS["tavern"]),
                   negative=BUILDING_NEGATIVE, seed=1001,
                   steps=32, cfg=7.5, sampler="dpmpp_2m", scheduler="karras")

Tuned for DreamShaper 8 (SD1.5). The negative prompts carry hard-won
counters to its known failure modes: circular badge/medallion framing,
baked-in scenery, stock-photo grids, garbled sign text.
"""

# --- Building sprites (matches apps/web/public/art/cities/*, #436/#482) ---
# Anchored to own.png: stylized isometric, flat shading, dark charcoal roofs,
# cream stone walls, small circular grass island, plain background.
# Params used: steps=32, cfg=7.5, DPM++ 2M Karras, 512x512.

BUILDING_STYLE = (
    "stylized isometric game asset of a single {subject}, "
    "flat cel shading, clean vector-like game art, dark charcoal roof, "
    "cream stone and timber walls, sitting on a small round grass island base, "
    "centered, plain solid white background, no text, high quality"
)
BUILDING_NEGATIVE = (
    "photo, realistic, blurry, ugly, deformed, text, watermark, frame, border, "
    "multiple buildings, people, cluttered background, scenery, sky, clouds, "
    "warm yellow tint, sepia"
)

BUILDINGS = {
    "townhall": "grand pirate-port town hall with a bell tower and an empty flagpole on the roof",
    "barracks": "rough wooden pirate barracks training yard with weapon racks and a sparring dummy",
    "shipyard": "small shipyard dry dock with a half-built wooden ship hull on a slipway and a crane",
    "tavern": "cozy crooked pirate tavern with a hanging rum-barrel sign and glowing windows",
    "sawmill": "lumber camp with felled trees, tree stumps, an axe embedded in a stump, big stacks of cut timber logs and a small saw hut",
    "ironmine": "dark mine cave entrance tunneled into a rocky hillside, wooden support beams, rail track and an iron ore minecart, ore piles, no house",
    "distillery": "rum distillery dominated by many large wooden barrels stacked prominently in front, copper still and chimney behind",
    "tradehouse": "prosperous merchant trade house with a market awning, surrounded by abundant wares: crates, barrels, sacks of goods, rolled carpets",
    "garrisonHall": "sturdy stone garrison hall with iron-banded doors and a watch post",
    "fortressArmory": "fortified armory keep with thick stone walls and cannon emplacements",
    "grandArsenal": "grand arsenal fortress with towers, banners and heavy cannons",
    "palisade": "complete enclosing defensive ring of sharpened wooden palisade stakes with a wooden gate, empty grass courtyard in the center, no buildings inside, city wall",
    "stoneWall": "complete enclosing defensive ring of stone city walls with battlements and a fortified gatehouse, empty grass courtyard in the center, no buildings inside",
    "citadel": "mighty complete enclosing ring of high fortress city walls with corner towers, battlements and a grand fortified gatehouse, empty courtyard in the center, no buildings inside",
    "turret": "very tall slender stone defensive turret tower, several stories high, narrow watchtower silhouette with a mounted swivel cannon platform on top",
}

# --- Unit / captain / party sprite family (matches art/factions/*, #482) ---
# Params used: steps=28, cfg=7, Euler a (euler_ancestral/normal), 512x512.

UNIT_STYLE_SUFFIX = (
    ", flat cartoon illustration style, thick black outlines, simple flat color "
    "shading, product shot on plain white studio background, isolated single "
    "object, video game asset, no scenery"
)
UNIT_NEGATIVE = (
    "photorealistic, 3d render, blurry, watermark, text, signature, gradient, "
    "shadow, multiple panels, comic panel, border, frame, collage, icon, app icon, "
    "rounded square, logo, sky, ocean, water, waves, landscape, horizon, clouds, "
    "stock photo, stock image, dreamstime, shutterstock, getty images, alamy, "
    "istockphoto, product catalog, multiple objects, grid of objects, many items, "
    "assortment, collection, variations, circle, circular frame, disc, badge, "
    "roundel, medallion, coaster, sticker, coin-shaped border, vignette, halo, "
    "ring border, black circle, solid black background shape, grass, trees, "
    "foliage, ground plane, extra limbs, extra heads, deformed hands, fused "
    "figures, mutated"
)

# Faction flavor strings mirror packages/content/src/factions.ts (read-only
# reference; keep in sync when faction identity changes).
FACTION_FLAVOR = {
    "pirates": "ragged black and brown leather, a tattered black flag with a "
    "white skull planted in the ground, menacing outlaw raiders",
    "british": "disciplined red coats and navy blue trim, a small British "
    "banner planted in the ground, orderly Royal Navy landing squad",
    "spanish": "ornate cream and gold conquistador armor, a small gold and "
    "cream banner planted in the ground, opulent treasure-fleet raiders",
    "dutch": "sturdy dark wood-brown coats with orange and white accents, a "
    "small orange banner planted in the ground, practical VOC company guards",
    "french": "deep blue coats with gold trim, a small blue and gold fleur-de-lis "
    "banner planted in the ground, elegant aggressive corsair raiders",
}

PARTY_SUBJECT_TEMPLATE = (
    "game asset icon of a small landing party of two armed pirate-era crew "
    "members storming ashore, cutlasses and pistols drawn, standing together as "
    "a group, {flavor}, dynamic action pose, waist-up group composition, "
    "character icon"
)
