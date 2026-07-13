#!/usr/bin/env python3
"""ComfyUI txt2img client for AoP art generation (issue #444).

Replaces the AUTOMATIC1111 `/sdapi/v1/txt2img` REST calls used by earlier art
scripts. ComfyUI has no flat txt2img endpoint; you submit a workflow *graph*
(checkpoint -> prompt encodes -> sampler -> VAE decode -> save) to `/prompt`,
poll `/history/<id>`, then download each image via `/view`.

Server: ComfyUI at ~/aop-ai-tools/ComfyUI, launched with
    cd ~/aop-ai-tools/ComfyUI && ./venv/bin/python main.py --listen 127.0.0.1 --port 8188
Existing A1111 checkpoints are mapped in via extra_model_paths.yaml.

Library use:
    from comfyui_client import txt2img
    images = txt2img("a pirate tavern", negative="text, frame", seed=1001)
    # -> list of PNG bytes, one per batch image

CLI use (writes PNGs to --out):
    python3 scripts/art/comfyui_client.py "a pirate tavern" --seed 1001 --batch 4

Stdlib only — safe to run with any system python3, no venv required.
"""

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "http://127.0.0.1:8188"

# Matches the shipped AoP art: DreamShaper 8 via the A1111 model dir mapping.
DEFAULT_CHECKPOINT = "DreamShaper_8_pruned.safetensors"

# A1111 sampler names -> (comfy sampler, comfy scheduler). A1111 folds the
# schedule into the sampler name ("DPM++ 2M Karras"); ComfyUI splits them.
A1111_SAMPLER_MAP = {
    "Euler a": ("euler_ancestral", "normal"),
    "Euler": ("euler", "normal"),
    "DPM++ 2M": ("dpmpp_2m", "normal"),
    "DPM++ 2M Karras": ("dpmpp_2m", "karras"),
    "DPM++ SDE Karras": ("dpmpp_sde", "karras"),
    "DDIM": ("ddim", "normal"),
}


def _api(path, payload=None, timeout=1800):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json"} if payload is not None else {},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def build_graph(
    prompt,
    negative="",
    checkpoint=DEFAULT_CHECKPOINT,
    seed=0,
    steps=28,
    cfg=7.0,
    sampler="euler_ancestral",
    scheduler="normal",
    width=512,
    height=512,
    batch=1,
    filename_prefix="aop",
):
    """The standard txt2img graph, keyed by arbitrary string node ids."""
    return {
        "ckpt": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": checkpoint},
        },
        "pos": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": prompt, "clip": ["ckpt", 1]},
        },
        "neg": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": negative, "clip": ["ckpt", 1]},
        },
        "latent": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": width, "height": height, "batch_size": batch},
        },
        "sampler": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["ckpt", 0],
                "positive": ["pos", 0],
                "negative": ["neg", 0],
                "latent_image": ["latent", 0],
                "seed": seed,
                "steps": steps,
                "cfg": cfg,
                "sampler_name": sampler,
                "scheduler": scheduler,
                "denoise": 1.0,
            },
        },
        "decode": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["sampler", 0], "vae": ["ckpt", 2]},
        },
        "save": {
            "class_type": "SaveImage",
            "inputs": {"images": ["decode", 0], "filename_prefix": filename_prefix},
        },
    }


def run_graph(graph, poll_interval=1.0, timeout=1800):
    """Submit a graph, wait for completion, return list of PNG bytes."""
    prompt_id = _api("/prompt", {"prompt": graph})["prompt_id"]
    deadline = time.time() + timeout
    while time.time() < deadline:
        history = _api(f"/history/{prompt_id}")
        if prompt_id in history:
            entry = history[prompt_id]
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                msgs = [m for m in status.get("messages", []) if m[0] == "execution_error"]
                raise RuntimeError(f"ComfyUI execution error: {msgs or status}")
            images = []
            for node_output in entry["outputs"].values():
                for img in node_output.get("images", []):
                    qs = urllib.parse.urlencode(
                        {"filename": img["filename"], "subfolder": img["subfolder"], "type": img["type"]}
                    )
                    with urllib.request.urlopen(f"{API}/view?{qs}", timeout=300) as r:
                        images.append(r.read())
            if not images:
                # ComfyUI caches executions: resubmitting a byte-identical graph
                # (same seed, prompt, AND filename_prefix) skips every node and
                # yields no outputs. Vary filename_prefix to force a re-save.
                raise RuntimeError(
                    "prompt completed with no images — identical graph was "
                    "served from ComfyUI's execution cache; change "
                    "filename_prefix (or any input) to force re-execution"
                )
            return images
        time.sleep(poll_interval)
    raise TimeoutError(f"ComfyUI prompt {prompt_id} did not finish within {timeout}s")


def txt2img(prompt, **kwargs):
    return run_graph(build_graph(prompt, **kwargs))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("prompt")
    ap.add_argument("--negative", default="")
    ap.add_argument("--checkpoint", default=DEFAULT_CHECKPOINT)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--steps", type=int, default=28)
    ap.add_argument("--cfg", type=float, default=7.0)
    ap.add_argument(
        "--sampler",
        default="Euler a",
        help="A1111-style name (%s) or a raw ComfyUI sampler name"
        % ", ".join(A1111_SAMPLER_MAP),
    )
    ap.add_argument("--width", type=int, default=512)
    ap.add_argument("--height", type=int, default=512)
    ap.add_argument("--batch", type=int, default=1)
    ap.add_argument("--out", type=Path, default=Path("."), help="output directory")
    ap.add_argument("--prefix", default="aop", help="output filename prefix")
    args = ap.parse_args()

    sampler, scheduler = A1111_SAMPLER_MAP.get(args.sampler, (args.sampler, "normal"))
    t0 = time.time()
    images = txt2img(
        args.prompt,
        negative=args.negative,
        checkpoint=args.checkpoint,
        seed=args.seed,
        steps=args.steps,
        cfg=args.cfg,
        sampler=sampler,
        scheduler=scheduler,
        width=args.width,
        height=args.height,
        batch=args.batch,
        filename_prefix=f"{args.prefix}-seed{args.seed}",
    )
    args.out.mkdir(parents=True, exist_ok=True)
    for i, png in enumerate(images):
        path = args.out / f"{args.prefix}-seed{args.seed}-{i + 1}.png"
        path.write_bytes(png)
        print(path)
    print(f"{len(images)} image(s) in {time.time() - t0:.1f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
