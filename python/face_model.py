"""
MediaPipe face detector for face_detect.py, across MediaPipe API generations.

mediapipe >= 0.10.30 removed the legacy `mp.solutions` API; the Tasks API
(`mediapipe.tasks.python.vision.FaceDetector`) needs a model file, which is
downloaded once into the model cache and verified by SHA-256. Older installs
that still ship `mp.solutions` use it directly (no download).

Every detector returns boxes in absolute pixels: (x, y, w, h, confidence).
"""

from __future__ import annotations

import hashlib
import os
import sys
import tempfile
import time
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# BlazeFace short-range, pinned by version and hash (~230 KB).
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_detector/"
    "blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
)
MODEL_SHA256 = "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f"
MODEL_FILENAME = "blaze_face_short_range.tflite"
MODEL_MAX_BYTES = 5 * 1024 * 1024
DOWNLOAD_TIMEOUT_SECONDS = 30
MIN_CONFIDENCE = 0.5

Box = tuple[int, int, int, int, float]


def _eprint(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


@dataclass(slots=True)
class FaceDetector:
    """A loaded detector. `detect` takes an RGB frame; `close` frees it."""

    name: str
    detect: Callable[[Any, int, int], list[Box]]
    close: Callable[[], None]


def model_cache_dir() -> Path:
    """Model cache set by the app (`BATCHCLIP_MODEL_CACHE`), else ~/.cache."""
    configured = os.environ.get("BATCHCLIP_MODEL_CACHE")
    base = Path(configured) if configured else Path.home() / ".cache" / "batchclip"
    return base / "mediapipe"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_model(cache_dir: Path) -> Path | None:
    """Return a verified model path, downloading it if needed; None on failure."""
    target = cache_dir / MODEL_FILENAME
    if target.is_file() and _sha256(target) == MODEL_SHA256:
        return target

    started = time.monotonic()
    tmp_path: Path | None = None
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(prefix="face-model-", dir=cache_dir)
        tmp_path = Path(tmp_name)
        with os.fdopen(fd, "wb") as out, urllib.request.urlopen(
            MODEL_URL, timeout=DOWNLOAD_TIMEOUT_SECONDS
        ) as resp:
            size = 0
            while chunk := resp.read(65536):
                size += len(chunk)
                if size > MODEL_MAX_BYTES:
                    raise ValueError(f"model larger than {MODEL_MAX_BYTES} bytes")
                out.write(chunk)
        actual = _sha256(tmp_path)
        if actual != MODEL_SHA256:
            raise ValueError(f"model hash mismatch ({actual})")
        os.replace(tmp_path, target)
        tmp_path = None
        _eprint(
            f"[face_detect] Downloaded face model ({size} bytes) "
            f"in {time.monotonic() - started:.1f}s to {target}"
        )
        return target
    except (OSError, ValueError) as exc:
        _eprint(f"[face_detect] Face model download failed: {exc}")
        return None
    finally:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)


def _tasks_detector(mp: Any, model_path: Path) -> FaceDetector:
    from mediapipe.tasks.python import BaseOptions, vision

    options = vision.FaceDetectorOptions(
        base_options=BaseOptions(model_asset_path=str(model_path)),
        running_mode=vision.RunningMode.IMAGE,
        min_detection_confidence=MIN_CONFIDENCE,
    )
    detector = vision.FaceDetector.create_from_options(options)

    def detect(rgb: Any, _width: int, _height: int) -> list[Box]:
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        boxes: list[Box] = []
        for det in detector.detect(image).detections:
            bb = det.bounding_box
            score = float(det.categories[0].score) if det.categories else 0.0
            boxes.append((bb.origin_x, bb.origin_y, bb.width, bb.height, score))
        return boxes

    return FaceDetector(name="MediaPipe Tasks (BlazeFace)", detect=detect, close=detector.close)


def _legacy_detector(solutions: Any) -> FaceDetector:
    ctx = solutions.face_detection.FaceDetection(
        model_selection=1, min_detection_confidence=MIN_CONFIDENCE
    )

    def detect(rgb: Any, width: int, height: int) -> list[Box]:
        result = ctx.process(rgb)
        boxes: list[Box] = []
        for det in result.detections or []:
            bb = det.location_data.relative_bounding_box
            score = float(det.score[0]) if det.score else 0.0
            boxes.append(
                (
                    int(bb.xmin * width),
                    int(bb.ymin * height),
                    int(bb.width * width),
                    int(bb.height * height),
                    score,
                )
            )
        return boxes

    return FaceDetector(name="MediaPipe legacy solutions", detect=detect, close=ctx.close)


def load_face_detector() -> FaceDetector | None:
    """Best available MediaPipe detector, or None (caller falls back to Haar)."""
    try:
        import mediapipe as mp
    except ImportError:
        _eprint("[face_detect] MediaPipe not installed")
        return None

    solutions = getattr(mp, "solutions", None)
    if solutions is not None and hasattr(solutions, "face_detection"):
        try:
            return _legacy_detector(solutions)
        except Exception as exc:
            _eprint(f"[face_detect] MediaPipe legacy init failed: {exc}")

    model_path = ensure_model(model_cache_dir())
    if model_path is None:
        return None
    try:
        return _tasks_detector(mp, model_path)
    except Exception as exc:
        _eprint(f"[face_detect] MediaPipe Tasks init failed: {exc}")
        return None
