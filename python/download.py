#!/usr/bin/env python3
"""
download.py — YouTube video downloader using yt-dlp.

Usage:
    python download.py --url <youtube_url> --output-dir <dir>

Stdout (JSON lines):
    {"type": "progress", "percent": 45.2, "speed": "5.2MiB/s", "eta": "00:30"}
    {"type": "done", "path": "/path/to/video.mp4", "title": "Video Title", "duration": 123.4}
    {"type": "error", "message": "error details"}
"""

import argparse
import json
import importlib
import importlib.util
import os
import re
import shutil
import sys
from urllib.parse import urlparse, parse_qs


def emit(data: dict) -> None:
    """Print a JSON line to stdout and flush immediately."""
    print(json.dumps(data), flush=True)


def eprint(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download a YouTube video with yt-dlp")
    parser.add_argument("--url", required=True, help="YouTube video URL")
    parser.add_argument("--output-dir", required=True, help="Directory to save the downloaded file")
    return parser.parse_args()


# ---------------------------------------------------------------------------
# URL validation
# ---------------------------------------------------------------------------

_YT_PATTERNS = [
    r"(?:youtube\.com/(?:.*v=|v/|embed/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{11})",
    r"youtube\.com/watch\?v=([A-Za-z0-9_-]{11})",
    r"youtube\.com/embed/([A-Za-z0-9_-]{11})",
    r"youtube\.com/v/([A-Za-z0-9_-]{11})",
    r"youtu\.be/([A-Za-z0-9_-]{11})",
    r"youtube\.com/shorts/([A-Za-z0-9_-]{11})",
    r"m\.youtube\.com/watch\?v=([A-Za-z0-9_-]{11})",
]


def get_video_id(url: str):
    """Extract the 11-character YouTube video ID from a URL, or return None."""
    if not isinstance(url, str) or not url.strip():
        return None
    url = url.strip()
    for pattern in _YT_PATTERNS:
        match = re.search(pattern, url, re.IGNORECASE)
        if match and len(match.group(1)) == 11:
            return match.group(1)
    # Fallback: query string
    try:
        parsed = urlparse(url)
        if "youtube.com" in parsed.netloc.lower():
            qs = parse_qs(parsed.query)
            ids = qs.get("v")
            if ids and len(ids[0]) == 11:
                return ids[0]
    except Exception:
        pass
    return None


def is_youtube_url(url: str) -> bool:
    return get_video_id(url) is not None


# ---------------------------------------------------------------------------
# YouTube JS challenge support
# ---------------------------------------------------------------------------

def find_js_runtimes() -> dict:
    """Locate JavaScript runtimes yt-dlp can use to solve YouTube's signature
    and `n` challenges. Without one, YouTube only yields ~360p formats.

    Order: Deno from the `deno` PyPI package (bundled with the app venv), Deno
    on PATH, then Node on PATH.
    """
    runtimes: dict = {}

    deno_path = None
    try:
        deno_module = importlib.import_module("deno")
        deno_path = deno_module.find_deno_bin()
    except Exception:
        deno_path = None
    deno_path = deno_path or shutil.which("deno")
    if deno_path and os.path.isfile(deno_path):
        runtimes["deno"] = {"path": deno_path}

    node_path = shutil.which("node")
    if node_path:
        runtimes["node"] = {"path": node_path}

    return runtimes


# Player clients that serve full-quality (up to 4K) streams without a PO token.
# The old `android` client is limited to ~360p, and the default `tv` client
# answers 403 on the high-res media URLs. Verified: this list downloads 4K AV1.
PREFERRED_PLAYER_CLIENTS = [
    "web_safari", "web_embedded", "android_vr", "-tv", "-tv_downgraded",
]


def youtube_challenge_opts() -> dict:
    """yt-dlp options that let it solve YouTube's JS challenges and pick
    clients that return high-quality formats.

    The solver script comes from the `yt-dlp-ejs` package; if that isn't
    installed, fall back to letting yt-dlp fetch it from GitHub.
    """
    opts: dict = {}
    opts["extractor_args"] = {"youtube": {"player_client": PREFERRED_PLAYER_CLIENTS}}
    runtimes = find_js_runtimes()
    if runtimes:
        opts["js_runtimes"] = runtimes
    else:
        eprint("[download] WARNING: no JavaScript runtime (deno/node) found; "
               "YouTube formats will be limited to low quality")

    if importlib.util.find_spec("yt_dlp_ejs") is None:
        opts["remote_components"] = ["ejs:github"]
    return opts


# ---------------------------------------------------------------------------
# Progress hook
# ---------------------------------------------------------------------------

def make_progress_hook():
    """Return a yt-dlp progress hook that emits JSON lines to stdout."""

    def hook(d: dict) -> None:
        status = d.get("status")
        if status == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            percent = (downloaded / total * 100) if total > 0 else 0.0

            speed_bytes = d.get("speed") or 0
            if speed_bytes >= 1024 * 1024:
                speed_str = f"{speed_bytes / 1024 / 1024:.1f}MiB/s"
            elif speed_bytes >= 1024:
                speed_str = f"{speed_bytes / 1024:.1f}KiB/s"
            else:
                speed_str = f"{int(speed_bytes)}B/s"

            eta_secs = d.get("eta")
            if eta_secs is not None:
                m, s = divmod(int(eta_secs), 60)
                eta_str = f"{m:02d}:{s:02d}"
            else:
                eta_str = "--:--"

            emit({"type": "progress", "percent": round(percent, 1), "speed": speed_str, "eta": eta_str})

        elif status == "finished":
            emit({"type": "progress", "percent": 100.0, "speed": "", "eta": "00:00"})

    return hook


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    args = parse_args()

    # Validate URL
    if not is_youtube_url(args.url):
        emit({"type": "error", "message": f"Not a valid YouTube URL: {args.url}"})
        sys.exit(1)

    video_id = get_video_id(args.url)
    os.makedirs(args.output_dir, exist_ok=True)

    try:
        import yt_dlp
    except ImportError as e:
        emit({"type": "error", "message": f"yt-dlp not installed: {e}"})
        sys.exit(1)

    eprint(f"[download] Fetching info for: {args.url}")

    # ---- Info extraction (no download) ----
    info_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "socket_timeout": 30,
        **youtube_challenge_opts(),
    }

    try:
        with yt_dlp.YoutubeDL(info_opts) as ydl:
            info = ydl.extract_info(args.url, download=False)
            video_title = info.get("title", "Unknown")
            video_duration = float(info.get("duration") or 0.0)
    except Exception as e:
        emit({"type": "error", "message": f"Failed to fetch video info: {e}"})
        sys.exit(1)

    eprint(f"[download] Downloading: '{video_title}' ({video_duration:.0f}s)")

    # ---- Download ----
    output_template = os.path.join(args.output_dir, f"{video_id}.%(ext)s")

    download_opts = {
        "outtmpl": output_template,
        # Prefer higher-quality codecs at higher resolution. YouTube's AV1 and
        # VP9 streams are encoded at materially higher bitrates than the AVC
        # (H.264) stream for the same pixel dimensions, so picking AV1/VP9 at
        # ≥1080p gives us the cleanest source to crop + re-encode from.
        #
        # Try the entire quality chain with English audio first, then fall back
        # to any language only when no English format is available. `en` also
        # matches regional tags (en-US/en-GB) and the three-letter `eng` tag.
        # Use video-only `bv` for English branches so a combined video stream
        # cannot bring along a different-language audio track.
        # Within each language tier, the format chain walks down in priority:
        #   1. AV1 @ ≥1080p   — best quality, smallest file
        #   2. VP9 @ ≥1080p   — nearly as good
        #   3. Any codec @ ≥1080p
        #   4. AV1 @ ≥720p    — acceptable fallback for low-res sources
        #   5. VP9 @ ≥720p
        #   6. Any codec @ ≥720p
        #   7. Best available  — last resort, may be 480p or worse
        "format": (
            "bv[height>=1080][vcodec^=av01]+ba[language^=en]/"
            "bv[height>=1080][vcodec^=vp9]+ba[language^=en]/"
            "bv[height>=1080][vcodec^=vp09]+ba[language^=en]/"
            "bv[height>=1080]+ba[language^=en]/"
            "bv[height>=720][vcodec^=av01]+ba[language^=en]/"
            "bv[height>=720][vcodec^=vp9]+ba[language^=en]/"
            "bv[height>=720][vcodec^=vp09]+ba[language^=en]/"
            "bv[height>=720]+ba[language^=en]/"
            "bv+ba[language^=en]/b[language^=en]/"
            "bv*[height>=1080][vcodec^=av01]+ba/"
            "bv*[height>=1080][vcodec^=vp9]+ba/"
            "bv*[height>=1080][vcodec^=vp09]+ba/"
            "bv*[height>=1080]+ba/"
            "bv*[height>=720][vcodec^=av01]+ba/"
            "bv*[height>=720][vcodec^=vp9]+ba/"
            "bv*[height>=720][vcodec^=vp09]+ba/"
            "bv*[height>=720]+ba/"
            "bv*+ba/b"
        ),
        # Preserve YouTube's original/default audio preference before bitrate;
        # otherwise a higher-bitrate auto-dub can outrank the original track.
        "format_sort": [
            "lang", "res", "vcodec:av01", "vcodec:vp9", "vcodec:vp09", "vcodec:h264", "br"
        ],
        # Merge into mkv — a permissive container that doesn't trigger a codec
        # re-encode for VP9/AV1 streams. (mp4 used to be the merge target, but
        # combined with the FFmpegVideoConvertor postprocessor it forced a
        # full re-encode to H.264 at yt-dlp's default CRF — silent generational
        # loss before our pipeline ever sees the file.) Our render pipeline
        # accepts mkv/mp4/webm transparently via ffprobe.
        "merge_output_format": "mkv",
        "socket_timeout": 30,
        "retries": 5,
        "fragment_retries": 5,
        "quiet": True,
        "no_warnings": False,
        # No custom http_headers / http_chunk_size: yt-dlp sets per-client
        # headers itself, and overriding the User-Agent or forcing chunked
        # ranges makes YouTube answer 403 on the media URLs.
        **youtube_challenge_opts(),
        # NOTE: no FFmpegVideoConvertor postprocessor here — leaving it on
        # forces a lossy H.264 transcode of VP9/AV1 streams during merge.
        # The merge_output_format above handles container muxing without
        # touching the video codec.
        "progress_hooks": [make_progress_hook()],
    }

    downloaded_info: dict = {}
    try:
        try:
            with yt_dlp.YoutubeDL(download_opts) as ydl:
                downloaded_info = ydl.extract_info(args.url, download=True) or {}
        except Exception as first_err:
            # Fall back to yt-dlp's default clients in case the preferred set
            # stops working (YouTube changes these often).
            eprint(f"[download] Preferred clients failed ({first_err}); retrying with defaults")
            download_opts.pop("extractor_args", None)
            with yt_dlp.YoutubeDL(download_opts) as ydl:
                downloaded_info = ydl.extract_info(args.url, download=True) or {}
    except Exception as e:
        emit({"type": "error", "message": f"Download failed: {e}"})
        sys.exit(1)

    # ---- Locate the output file ----
    downloaded_path = None
    for fname in os.listdir(args.output_dir):
        if fname.startswith(video_id) and fname.lower().endswith((".mp4", ".mkv", ".webm")):
            downloaded_path = os.path.join(args.output_dir, fname)
            break

    if not downloaded_path or not os.path.isfile(downloaded_path):
        emit({"type": "error", "message": "Download completed but output file not found"})
        sys.exit(1)

    # Log what we actually got — resolution + codec + bitrate — so we can
    # see in the session log whether YouTube served us a degraded stream.
    try:
        width = downloaded_info.get("width")
        height = downloaded_info.get("height")
        vcodec = downloaded_info.get("vcodec")
        vbr = downloaded_info.get("vbr") or downloaded_info.get("tbr")
        size_mb = os.path.getsize(downloaded_path) / (1024 * 1024)
        eprint(
            f"[download] Got: {width}x{height} {vcodec} "
            f"vbr={vbr}kbps size={size_mb:.1f}MB"
        )
    except Exception as probe_err:
        eprint(f"[download] Could not read downloaded file info: {probe_err}")

    emit({"type": "done", "path": downloaded_path, "title": video_title, "duration": video_duration})
    eprint(f"[download] Done. Saved to: {downloaded_path}")


if __name__ == "__main__":
    main()
