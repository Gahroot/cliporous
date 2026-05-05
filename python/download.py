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
        "format": "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b",
        "merge_output_format": "mp4",
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
        "postprocessors": [{"key": "FFmpegVideoConvertor", "preferedformat": "mp4"}],
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

    emit({"type": "done", "path": downloaded_path, "title": video_title, "duration": video_duration})
    eprint(f"[download] Done. Saved to: {downloaded_path}")


if __name__ == "__main__":
    main()
