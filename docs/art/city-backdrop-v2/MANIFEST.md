# City backdrop v2 — provenance

Operator-approved 2026-07-13 (playthrough feedback: the v1 backdrop read as an
extreme close-up of featureless grass with a pond in the lower-left, which also
put the sawmill slot "in the water"). Replaces `apps/web/public/art/city/backdrop.png`.

First art asset produced with the ComfyUI pipeline (#444).

|          |                                                                   |
| -------- | ----------------------------------------------------------------- |
| File     | `apps/web/public/art/city/backdrop.png` (1024×704, RGB)           |
| Model    | `DreamShaperXL_Turbo_V2-SFW.safetensors` (SDXL Turbo, Lykon)      |
| Seed     | 8001                                                              |
| Params   | steps 8, cfg 2.0, dpmpp_sde / karras, 1024×704                    |
| Pipeline | ComfyUI v0.27.0, torch 2.13 MPS (`scripts/art/comfyui_client.py`) |

Prompt:

> empty green meadow game background, high-angle aerial view of vacant
> grassland with nothing built on it, completely empty open grass field
> covering most of the frame, a single calm blue sea strip along the very
> bottom edge, one straight horizontal sandy shoreline near the bottom, a few
> tiny pine trees at the top corners, flat cel shading, clean vector-like video
> game background art, soft muted greens and blues, uncluttered minimalist
> empty game background, high quality

Negative:

> buildings, houses, village, town, city, streets, roads, paths, towers,
> castle, farm, fields, crops, ships, boats, docks, people, animals, river,
> lake, pond, winding water, waves, text, watermark, photo, realistic, blurry,
> frame, border, dense forest, mountains, snow, clouds, sky, horizon line,
> vignette, dark, detailed, busy, cluttered

Selection: round 1 (6 candidates, both checkpoints, isometric-town phrasing)
rejected — DS8 drifted photorealistic, XL baked in houses/rivers. Round 2
(this prompt) picked XL seed 8001 from 6; DS8's three round-2 outputs were
unusable (abstract pyramid / horizon vista / ground-level forest).
`SCENE_SLOTS` in `apps/web/src/CityScene.tsx` was re-tuned against this image
in the same PR (notably: shipyard into the bottom-right sea corner, walls
above the shoreline).
