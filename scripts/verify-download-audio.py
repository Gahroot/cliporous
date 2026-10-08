"""Offline regression check using the installed yt-dlp's real format selector."""

import ast
from pathlib import Path

from yt_dlp import YoutubeDL


def download_options() -> dict[str, object]:
    source = Path(__file__).resolve().parents[1] / "python" / "download.py"
    tree = ast.parse(source.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign) or not isinstance(node.value, ast.Dict):
            continue
        if not any(isinstance(t, ast.Name) and t.id == "download_opts" for t in node.targets):
            continue
        return {
            key.value: ast.literal_eval(value)
            for key, value in zip(node.value.keys, node.value.values, strict=True)
            if isinstance(key, ast.Constant) and key.value in ("format", "format_sort")
        }
    raise AssertionError("Download options not found")


def audio(
    identifier: str, language: str | None, preference: int, bitrate: int
) -> dict[str, object]:
    return {
        "format_id": identifier,
        "url": "https://example.invalid/audio",
        "ext": "webm",
        "vcodec": "none",
        "acodec": "opus",
        "language": language,
        "language_preference": preference,
        "abr": bitrate,
        "tbr": bitrate,
    }


def video(height: int = 1080, language: str | None = None) -> dict[str, object]:
    return {
        "format_id": "combined" if language else "video",
        "url": "https://example.invalid/video",
        "ext": "mp4",
        "vcodec": "h264",
        "acodec": "aac" if language else "none",
        "height": height,
        "language": language,
    }


def main() -> None:
    options = download_options()
    original = audio("original", "en", 10, 64)
    dub = audio("dub", "id", -1, 256)
    cases = [
        ("English original beats higher-bitrate dub", [original, dub, video()], "original"),
        ("Regional English", [audio("english", "en-US", -1, 64), dub, video()], "english"),
        ("Three-letter English", [audio("english", "eng", -1, 64), dub, video()], "english"),
        ("Low-resolution English", [original, dub, video(480)], "original"),
        ("No English: prefer original", [audio("french", "fr", 10, 64), dub, video()], "french"),
        ("Unknown language fallback", [audio("unknown", None, -1, 64), video()], "unknown"),
        ("Combined dub excluded", [original, dub, video(), video(2160, "id")], "original"),
        ("Combined English preferred", [video(1080, "en"), video(2160, "id")], "combined"),
        (
            "Original beats higher-bitrate English dub",
            [original, audio("english-dub", "en", -1, 256), video()],
            "original",
        ),
    ]
    with YoutubeDL({**options, "quiet": True, "no_warnings": True}) as ydl:
        for label, formats, expected in cases:
            info = {"formats": formats}
            ydl.sort_formats(info)
            selected = ydl._select_formats(info["formats"], ydl.format_selector)[0]
            selected_audio = selected.get("requested_formats", [selected])[-1]
            assert selected_audio["format_id"] == expected, (label, selected_audio)
            if label == "Combined English preferred":
                assert selected_audio["language"] == "en", selected_audio
            print(f"PASS: {label}")
    format_spec = options["format"]
    assert isinstance(format_spec, str)
    old_options = {
        "format": "bv*[height>=1080]" + format_spec.split("bv*[height>=1080]", 1)[1],
        "format_sort": ["res", "vcodec:av01", "vcodec:vp9", "vcodec:vp09", "vcodec:h264", "br"],
        "quiet": True,
    }
    with YoutubeDL(old_options) as ydl:
        info = {"formats": [original, dub, video()]}
        ydl.sort_formats(info)
        selected = ydl._select_formats(info["formats"], ydl.format_selector)[0]
        assert selected["requested_formats"][-1]["format_id"] == "dub"
        print("PASS: old options reproduce auto-dub selection")


if __name__ == "__main__":
    main()
