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
import os
import re
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
        "nocheckcertificate": True,
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Connection": "keep-alive",
        },
        "extractor_args": {
            "youtube": {"player_client": ["android", "web"]}
        },
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
        # The format chain walks down in priority:
        #   1. AV1 @ ≥1080p   — best quality, smallest file
        #   2. VP9 @ ≥1080p   — nearly as good
        #   3. Any codec @ ≥1080p
        #   4. AV1 @ ≥720p    — acceptable fallback for low-res sources
        #   5. VP9 @ ≥720p
        #   6. Any codec @ ≥720p
        #   7. Best available  — last resort, may be 480p or worse
        "format": (
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
        "format_sort": ["res", "vcodec:av01", "vcodec:vp9", "vcodec:vp09", "vcodec:h264", "br"],
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
        "http_chunk_size": 10 * 1024 * 1024,
        "quiet": True,
        "no_warnings": False,
        "nocheckcertificate": True,
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
        },
        "extractor_args": {
            "youtube": {"player_client": ["android", "web"]}
        },
        # NOTE: no FFmpegVideoConvertor postprocessor here — leaving it on
        # forces a lossy H.264 transcode of VP9/AV1 streams during merge.
        # The merge_output_format above handles container muxing without
        # touching the video codec.
        "progress_hooks": [make_progress_hook()],
    }

    try:
        with yt_dlp.YoutubeDL(download_opts) as ydl:
            ydl.download([args.url])
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
        probe_opts = {"quiet": True, "no_warnings": True, "skip_download": True}
        with yt_dlp.YoutubeDL(probe_opts) as probe_ydl:
            probe = probe_ydl.extract_info(downloaded_path, download=False)
            width = probe.get("width")
            height = probe.get("height")
            vcodec = probe.get("vcodec")
            vbr = probe.get("vbr") or probe.get("tbr")
            size_mb = os.path.getsize(downloaded_path) / (1024 * 1024)
            eprint(
                f"[download] Got: {width}x{height} {vcodec} "
                f"vbr={vbr}kbps size={size_mb:.1f}MB"
            )
    except Exception as probe_err:
        eprint(f"[download] Could not probe downloaded file: {probe_err}")

    emit({"type": "done", "path": downloaded_path, "title": video_title, "duration": video_duration})
    eprint(f"[download] Done. Saved to: {downloaded_path}")


if __name__ == "__main__":
    main()
