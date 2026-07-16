#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Acme Video Generator v2.1 (ContentForge edition)
====================================================
Generates videos from MASTER_PROMPTS.json using:
- Google Veo 3.1   (provider: veo3 | gemini)
- RunwayML Gen4.5  (provider: runway)
- OpenAI gpt-image-1 / DALL-E 3 → FFmpeg loop (provider: chatgpt | openai)

CONFIGURATION
-------------
All API keys come from environment variables (or tools/.env via python-dotenv).
NEVER paste keys into this file.

Required env vars:
    GEMINI_API_KEY      (Google Cloud / AI Studio)
    OPENAI_API_KEY      (OpenAI platform)
    RUNWAY_API_KEY      (RunwayML dev API)

Optional:
    RUNWAY_API_VERSION  (default: 2024-11-06)
    GEMINI_VIDEO_MODEL  (default: veo-3.1-fast-generate-preview)
    OPENAI_IMAGE_MODEL  (default: gpt-image-1; falls back to dall-e-3 if 404)
"""

import argparse
import base64
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional

import requests

# Load tools/.env automatically if present (no error if missing).
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv(Path(__file__).with_name(".env"))
except ImportError:
    pass  # python-dotenv is optional; env vars also work

# Fix Windows console encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]


# =============================================================================
# CONFIGURATION (env-driven)
# =============================================================================

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
GEMINI_API_KEY = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
RUNWAY_API_KEY = os.environ.get("RUNWAY_API_KEY", "").strip()

RUNWAY_API_VERSION = os.environ.get("RUNWAY_API_VERSION", "2024-11-06")
RUNWAY_BASE_URL = "https://api.dev.runwayml.com/v1"

GEMINI_VIDEO_MODEL = os.environ.get("GEMINI_VIDEO_MODEL", "veo-3.1-fast-generate-preview")
OPENAI_IMAGE_MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1")

NEGATIVE_PROMPT = (
    "handheld shake, jitter, fast cuts, rapid editing, warped faces, "
    "crooked vertical lines, distorted architecture, blurry, low quality"
)

# Aspect ratio mappings
RUNWAY_RATIOS = {
    "9:16": "720:1280",
    "1:1":  "1024:1024",
    "16:9": "1280:720",
    "2:3":  "720:1080",
}
VEO_RATIOS = {
    "9:16": "9:16", "1:1": "1:1", "16:9": "16:9", "2:3": "2:3",
}

SCRIPT_DIR = Path(__file__).parent
PROMPTS_JSON = SCRIPT_DIR / "MASTER_PROMPTS.json"


def _require_key(name: str, value: str) -> str:
    if not value:
        print(
            f"[ERROR] {name} not set. Add it to tools/.env or export it:\n"
            f"        export {name}='...'   (bash)\n"
            f"        $env:{name}='...'      (PowerShell)"
        )
        sys.exit(1)
    return value


# =============================================================================
# PROMPT LOADING
# =============================================================================

def load_prompts() -> Dict:
    if not PROMPTS_JSON.exists():
        print(f"[ERROR] MASTER_PROMPTS.json not found at {PROMPTS_JSON}")
        sys.exit(1)
    with open(PROMPTS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


# =============================================================================
# RUNWAY ML
# =============================================================================

def _runway_headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {_require_key('RUNWAY_API_KEY', RUNWAY_API_KEY)}",
        "X-Runway-Version": RUNWAY_API_VERSION,
        "Content-Type": "application/json",
    }


def runway_text_to_video(prompt: str, aspect_ratio: str, duration: int, model: str) -> Optional[str]:
    payload = {
        "model": model,
        "promptText": prompt,
        "ratio": RUNWAY_RATIOS.get(aspect_ratio, "720:1280"),
        "duration": min(duration, 10),
    }
    try:
        r = requests.post(f"{RUNWAY_BASE_URL}/text_to_video", headers=_runway_headers(), json=payload, timeout=30)
        r.raise_for_status()
        return r.json().get("id")
    except requests.RequestException as e:
        print(f"  [RUNWAY] Request failed: {e}")
        if getattr(e, "response", None) is not None:
            print(f"  [RUNWAY] Response: {e.response.text[:500]}")
        return None


def runway_check_task(task_id: str) -> Dict:
    try:
        r = requests.get(f"{RUNWAY_BASE_URL}/tasks/{task_id}", headers=_runway_headers(), timeout=30)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        return {"status": "ERROR", "error": str(e)}


def runway_download_video(url: str, output_path: Path) -> bool:
    try:
        print(f"  [RUNWAY] Downloading video...")
        r = requests.get(url, stream=True, timeout=120)
        r.raise_for_status()
        with open(output_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"  [RUNWAY] Saved: {output_path}")
        return True
    except Exception as e:
        print(f"  [RUNWAY] Download failed: {e}")
        return False


def generate_with_runway(clip: Dict, format_data: Dict, output_dir: Path, model: str) -> Optional[Path]:
    clip_id = clip["id"]
    output_path = output_dir / f"clip_{clip_id}.mp4"
    if output_path.exists():
        print(f"  [SKIP] Already exists: {output_path.name}")
        return output_path

    print(f"  [RUNWAY] Model: {model} | Ratio: {format_data['aspect_ratio']} | Duration: {clip.get('duration', 8)}s")
    task_id = runway_text_to_video(clip["prompt"], format_data["aspect_ratio"], clip.get("duration", 8), model)
    if not task_id:
        return None
    print(f"  [RUNWAY] Task ID: {task_id}")

    for wait_count in range(1, 121):
        time.sleep(10)
        status = runway_check_task(task_id)
        s = status.get("status", "UNKNOWN")
        if s == "SUCCEEDED":
            outputs = status.get("output", [])
            if outputs and runway_download_video(outputs[0], output_path):
                return output_path
            return None
        if s in ("FAILED", "ERROR"):
            print(f"  [RUNWAY] {s}: {status.get('failure_reason', status.get('error', ''))}")
            return None
        print(f"  [RUNWAY] Status: {s} ({wait_count * 10}s)")

    print(f"  [RUNWAY] Timeout after 1200s")
    return None


# =============================================================================
# GOOGLE VEO 3.1 (Gemini)
# =============================================================================

def generate_with_veo3(clip: Dict, format_data: Dict, output_dir: Path) -> Optional[Path]:
    try:
        from google import genai  # type: ignore
        from google.genai import types  # type: ignore
    except ImportError:
        print("  [VEO3] google-genai not installed. Run: pip install google-genai")
        return None

    api_key = _require_key("GEMINI_API_KEY", GEMINI_API_KEY)

    clip_id = clip["id"]
    output_path = output_dir / f"clip_{clip_id}.mp4"
    if output_path.exists():
        print(f"  [SKIP] Already exists: {output_path.name}")
        return output_path

    veo_ratio = VEO_RATIOS.get(format_data["aspect_ratio"], "9:16")
    print(f"  [VEO3] Model: {GEMINI_VIDEO_MODEL} | Ratio: {veo_ratio}")

    client = genai.Client(http_options={"api_version": "v1beta"}, api_key=api_key)
    config = types.GenerateVideosConfig(
        aspect_ratio=veo_ratio,
        number_of_videos=1,
        duration_seconds=8,
        resolution="720p",
        negative_prompt=NEGATIVE_PROMPT,
    )

    try:
        print(f"  [VEO3] Starting video generation...")
        operation = client.models.generate_videos(model=GEMINI_VIDEO_MODEL, prompt=clip["prompt"], config=config)
        wait_count = 0
        while not operation.done:
            wait_count += 1
            print(f"  [VEO3] Generating... ({wait_count * 10}s)")
            time.sleep(10)
            operation = client.operations.get(operation)

        if operation.result and operation.result.generated_videos:
            video = operation.result.generated_videos[0]
            client.files.download(file=video.video)
            video.video.save(str(output_path))
            print(f"  [VEO3] SUCCESS: {output_path}")
            return output_path
        print(f"  [VEO3] No video generated")
        return None
    except Exception as e:
        print(f"  [VEO3] Error: {e}")
        return None


# =============================================================================
# OPENAI gpt-image-1 / DALL-E 3 → FFmpeg loop
# =============================================================================

def _openai_image_size(aspect_ratio: str) -> str:
    """gpt-image-1 supports: 1024x1024, 1024x1536, 1536x1024, auto.
    DALL-E 3 supports: 1024x1024, 1024x1792, 1792x1024."""
    if aspect_ratio in ("9:16", "2:3"):
        return "1024x1536" if OPENAI_IMAGE_MODEL == "gpt-image-1" else "1024x1792"
    if aspect_ratio == "16:9":
        return "1536x1024" if OPENAI_IMAGE_MODEL == "gpt-image-1" else "1792x1024"
    return "1024x1024"


def _openai_request_image(prompt: str, size: str) -> Optional[bytes]:
    """Returns raw image bytes (PNG). Tries OPENAI_IMAGE_MODEL first, falls back to dall-e-3."""
    api_key = _require_key("OPENAI_API_KEY", OPENAI_API_KEY)
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    for model in (OPENAI_IMAGE_MODEL, "dall-e-3"):
        if model == OPENAI_IMAGE_MODEL == "dall-e-3":
            continue  # would duplicate
        payload: Dict = {"model": model, "prompt": prompt, "n": 1, "size": size}
        if model == "gpt-image-1":
            payload["quality"] = "high"        # 'low'|'medium'|'high'|'auto'
        else:
            payload["quality"] = "standard"
            payload["response_format"] = "url"
        try:
            print(f"  [OPENAI] Trying model={model}, size={size}")
            r = requests.post("https://api.openai.com/v1/images/generations", headers=headers, json=payload, timeout=180)
            if r.status_code == 404 or (r.status_code == 400 and "model" in r.text.lower()):
                print(f"  [OPENAI] {model} unavailable — falling back")
                continue
            r.raise_for_status()
            data = r.json().get("data", [])
            if not data:
                print(f"  [OPENAI] Empty data array")
                return None
            entry = data[0]
            # gpt-image-1 returns b64_json by default; dall-e-3 returns url
            if entry.get("b64_json"):
                return base64.b64decode(entry["b64_json"])
            if entry.get("url"):
                img_res = requests.get(entry["url"], timeout=60)
                img_res.raise_for_status()
                return img_res.content
            print(f"  [OPENAI] Response had no b64_json or url")
            return None
        except requests.HTTPError as e:
            print(f"  [OPENAI] HTTP {e.response.status_code}: {e.response.text[:300]}")
            if model == "gpt-image-1":
                print(f"  [OPENAI] Retrying with dall-e-3")
                continue
            return None
        except Exception as e:
            print(f"  [OPENAI] Error: {e}")
            return None
    return None


def generate_with_chatgpt(clip: Dict, format_data: Dict, output_dir: Path) -> Optional[Path]:
    clip_id = clip["id"]
    output_path = output_dir / f"clip_{clip_id}.mp4"
    if output_path.exists():
        print(f"  [SKIP] Already exists: {output_path.name}")
        return output_path

    size = _openai_image_size(format_data["aspect_ratio"])
    duration = clip.get("duration", 8)
    print(f"  [OPENAI] Aspect: {format_data['aspect_ratio']} | Duration: {duration}s")

    img_bytes = _openai_request_image(clip["prompt"], size)
    if not img_bytes:
        return None

    temp_img_path = output_dir / f"temp_{clip_id}.png"
    with open(temp_img_path, "wb") as f:
        f.write(img_bytes)

    print(f"  [FFMPEG] Looping image into {duration}s MP4...")
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", str(temp_img_path),
        "-c:v", "libx264", "-t", str(duration),
        "-pix_fmt", "yuv420p",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        str(output_path),
    ]
    try:
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    except subprocess.CalledProcessError as e:
        print(f"  [FFMPEG] Conversion failed: {(e.stderr or b'').decode('utf-8', errors='replace')[:500]}")
        if temp_img_path.exists():
            temp_img_path.unlink()
        return None
    finally:
        if temp_img_path.exists():
            temp_img_path.unlink()

    if output_path.exists():
        print(f"  [OPENAI] SUCCESS: {output_path}")
        return output_path
    return None


# =============================================================================
# WORKFLOW
# =============================================================================

def generate_format(format_num: int, provider: str, model: str) -> List[Path]:
    prompts = load_prompts()
    format_key = f"format_{format_num:02d}"
    if format_key not in prompts.get("formats", {}):
        print(f"[ERROR] Format {format_num} not found")
        return []

    format_data = prompts["formats"][format_key]
    format_name = format_data["name"].lower().replace(" ", "_").replace("/", "_")
    output_dir = SCRIPT_DIR / f"format_{format_num:02d}_{format_name}"
    output_dir.mkdir(exist_ok=True)

    print(f"\n{'='*60}")
    print(f"Generating: {format_data['name']}")
    print(f"Platform: {format_data['platform']} | Aspect: {format_data['aspect_ratio']}")
    print(f"Clips: {len(format_data['clips'])} | Provider: {provider.upper()}")
    print(f"{'='*60}\n")

    results: List[Path] = []
    for i, clip in enumerate(format_data["clips"], 1):
        print(f"\n[{i}/{len(format_data['clips'])}] {clip['name']}")
        print(f"  Duration: {clip['duration']}s")

        if provider == "runway":
            result = generate_with_runway(clip, format_data, output_dir, model)
        elif provider in ("veo3", "gemini"):
            result = generate_with_veo3(clip, format_data, output_dir)
        elif provider in ("chatgpt", "openai"):
            result = generate_with_chatgpt(clip, format_data, output_dir)
        else:
            print(f"  [ERROR] Unknown provider: {provider}")
            continue

        if result:
            results.append(result)
        else:
            print(f"  [FAIL] Could not generate clip")
        time.sleep(2)

    print(f"\n{'='*60}")
    print(f"Generated {len(results)}/{len(format_data['clips'])} clips")
    print(f"Output: {output_dir}")
    print(f"{'='*60}\n")
    return results


def generate_all(provider: str, model: str) -> None:
    total: List[Path] = []
    for i in range(1, 11):
        total.extend(generate_format(i, provider, model))
        if i < 10:
            print("[INFO] Pausing 30s before next format...")
            time.sleep(30)
    print(f"\nCOMPLETE: Generated {len(total)} total clips\n")


def show_status() -> None:
    prompts = load_prompts()
    print(f"\n{'='*60}\nGENERATION STATUS\n{'='*60}\n")
    total_generated = 0
    total_clips = 0
    for i in range(1, 11):
        format_key = f"format_{i:02d}"
        format_data = prompts["formats"][format_key]
        format_name = format_data["name"].lower().replace(" ", "_").replace("/", "_")
        output_dir = SCRIPT_DIR / f"format_{i:02d}_{format_name}"
        clips = format_data["clips"]
        generated = sum(1 for c in clips if (output_dir / f"clip_{c['id']}.mp4").exists())
        total_generated += generated
        total_clips += len(clips)
        status = "DONE" if generated == len(clips) else f"{generated}/{len(clips)}"
        print(f"Format {i:02d}: {format_data['name'][:35]:<35} [{status}]")
    print(f"\nTotal: {total_generated}/{total_clips} clips\n")


def test_apis() -> None:
    print("\n[TEST] Checking configured providers...")
    print(f"  GEMINI_API_KEY: {'set' if GEMINI_API_KEY else 'MISSING'}")
    print(f"  OPENAI_API_KEY: {'set' if OPENAI_API_KEY else 'MISSING'}")
    print(f"  RUNWAY_API_KEY: {'set' if RUNWAY_API_KEY else 'MISSING'}")
    if RUNWAY_API_KEY:
        try:
            r = requests.get(f"{RUNWAY_BASE_URL}/organization", headers=_runway_headers(), timeout=10)
            if r.status_code == 200:
                d = r.json()
                print(f"  [RUNWAY] OK — tier={d.get('tier')} credits={d.get('credits')}")
            else:
                print(f"  [RUNWAY] FAIL {r.status_code}: {r.text[:200]}")
        except Exception as e:
            print(f"  [RUNWAY] FAIL: {e}")
    if OPENAI_API_KEY:
        try:
            r = requests.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"}, timeout=10,
            )
            print(f"  [OPENAI] {'OK' if r.status_code == 200 else f'FAIL {r.status_code}'}")
        except Exception as e:
            print(f"  [OPENAI] FAIL: {e}")


# =============================================================================
# CLI
# =============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Acme Video Generator v2.1",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Providers:
  veo3 | gemini   — Google Veo 3.1 (video)
  runway          — RunwayML Gen4.5 / Veo3.1 (video)
  chatgpt | openai — OpenAI gpt-image-1 / DALL-E 3 → FFmpeg loop (image→video)

Examples:
  python generate_videos.py --test
  python generate_videos.py --format 1 --provider veo3
  python generate_videos.py --format 6 --provider openai
  python generate_videos.py --all --provider runway --model gen4.5
""",
    )
    parser.add_argument("--test", action="store_true", help="Check configured API keys")
    parser.add_argument("--status", action="store_true", help="Show generation status")
    parser.add_argument("--format", "-f", type=int, choices=range(1, 11), metavar="N", help="Format number (1-10)")
    parser.add_argument("--all", action="store_true", help="Generate all formats")
    parser.add_argument("--provider", "-p", choices=["runway", "veo3", "gemini", "chatgpt", "openai"], default="veo3")
    parser.add_argument("--model", "-m", default="gen4.5", choices=["gen4.5", "veo3.1", "veo3.1_fast", "gen4_turbo"])
    args = parser.parse_args()

    if args.test:
        test_apis()
    elif args.status:
        show_status()
    elif args.format:
        generate_format(args.format, args.provider, args.model)
    elif args.all:
        generate_all(args.provider, args.model)
    else:
        parser.print_help()
