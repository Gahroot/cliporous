#!/usr/bin/env python3
"""
face_detect.py — Face detection + per-scene crop timelines for 9:16 framing.

For each segment we:
  1. Detect visual scene cuts inside [start, end] via PySceneDetect
     (ContentDetector, threshold=27). If PySceneDetect isn't installed, the
     whole segment is treated as one scene.
  2. For each scene, sample ~2 fps (min 15, max 60 frames) and run MediaPipe
     face detection (full-range model, confidence >= 0.5), with a Haar cascade
     fallback.
  3. Cluster face-center bounding boxes across samples (KMeans with k set to
     the max number of faces seen in any single frame). Pick the largest
     cluster, tie-break by mean-face-area and closeness to frame center. This
     replaces the old weighted-average approach that landed on the gap between
     two people in multi-face frames.
  4. Compute a 9:16 crop centered on that cluster's centroid.

Output per segment:
  {
    "x": 100, "y": 0, "width": 607, "height": 1080, "face_detected": true,
    "timeline": [
      {"start_abs": 10.5, "end_abs": 22.3,
       "x": 100, "y": 0, "width": 607, "height": 1080, "face_detected": true},
      ...
    ]
  }

The top-level x/y/w/h is the dominant-scene crop (used for preview overlay
and for render fallback when timeline is empty). timeline[] is populated only
when PySceneDetect finds >1 scene inside the segment.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from typing import Optional


# ---------------------------------------------------------------------------
# IO helpers
# ---------------------------------------------------------------------------

def eprint(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def emit(obj: dict) -> None:
    print(json.dumps(obj), flush=True)


# ---------------------------------------------------------------------------
# Rounding — round-to-nearest then snap up to even (not round-down).
# The old `v - v%2` always biased crops left/up by 1 px.
# ---------------------------------------------------------------------------

def round_to_even(value: float) -> int:
    r = int(round(value))
    return r if r % 2 == 0 else r + 1


# ---------------------------------------------------------------------------
# Crop geometry
# ---------------------------------------------------------------------------

def target_crop_dims(frame_width: int, frame_height: int) -> tuple[int, int]:
    """Return (crop_w, crop_h) of the 9:16 rectangle inscribed in the source."""
    if frame_width / frame_height > 9 / 16:
        crop_w = round_to_even(frame_height * 9 / 16)
        crop_h = round_to_even(frame_height)
    else:
        crop_w = round_to_even(frame_width)
        crop_h = round_to_even(frame_width * 16 / 9)
    # Clamp to frame bounds
    crop_w = min(crop_w, frame_width - (frame_width % 2))
    crop_h = min(crop_h, frame_height - (frame_height % 2))
    return crop_w, crop_h


def center_crop(frame_width: int, frame_height: int) -> dict:
    """9:16 center crop fallback (face_detected=False)."""
    crop_w, crop_h = target_crop_dims(frame_width, frame_height)
    crop_x = round_to_even((frame_width - crop_w) / 2)
    crop_y = round_to_even(max(0, (frame_height - crop_h) / 2))
    crop_x = max(0, min(crop_x, frame_width - crop_w))
    crop_y = max(0, min(crop_y, frame_height - crop_h))
    return {"x": crop_x, "y": crop_y, "width": crop_w, "height": crop_h, "face_detected": False}


def crop_centered_on(cx: float, cy: float, frame_width: int, frame_height: int) -> dict:
    """Build a 9:16 crop rect centered on (cx, cy), clamped to frame bounds."""
    crop_w, crop_h = target_crop_dims(frame_width, frame_height)

    crop_x = round_to_even(cx - crop_w / 2)
    crop_y = round_to_even(cy - crop_h / 2)

    crop_x = max(0, min(crop_x, frame_width - crop_w))
    crop_y = max(0, min(crop_y, frame_height - crop_h))
    # Re-even after clamping in case the boundary snap pushed us off
    crop_x -= crop_x % 2
    crop_y -= crop_y % 2
    return {"x": crop_x, "y": crop_y, "width": crop_w, "height": crop_h, "face_detected": True}


# ---------------------------------------------------------------------------
# Face detection
# ---------------------------------------------------------------------------

def _detect_faces_in_frame(
    frame,
    mp_detector,
    haar_cascade,
    frame_width: int,
    frame_height: int,
    min_bbox_frac: float = 0.04,
):
    """
    Run MediaPipe on a frame; fall back to Haar cascade.
    Returns list of (cx, cy, area, confidence) tuples in absolute pixels.
    Applies quality filters: bbox width >= min_bbox_frac of frame, aspect
    ratio in [0.6, 1.4], relative area in [0.5%, 30%].
    """
    import cv2

    detections: list[tuple[int, int, int, int, float]] = []  # (x, y, w, h, conf)

    if mp_detector is not None:
        try:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = mp_detector.process(rgb)
            if result.detections:
                for det in result.detections:
                    bbox = det.location_data.relative_bounding_box
                    conf = float(det.score[0]) if det.score else 0.0
                    x = int(bbox.xmin * frame_width)
                    y = int(bbox.ymin * frame_height)
                    w = int(bbox.width * frame_width)
                    h = int(bbox.height * frame_height)
                    detections.append((x, y, w, h, conf))
        except Exception as exc:
            eprint(f"[face_detect] MediaPipe frame error: {exc}")

    if not detections and haar_cascade is not None:
        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = haar_cascade.detectMultiScale(
                gray,
                scaleFactor=1.05,
                minNeighbors=3,
                minSize=(40, 40),
                maxSize=(int(frame_width * 0.7), int(frame_height * 0.7)),
            )
            frame_area = frame_width * frame_height
            for (x, y, w, h) in faces:
                rel = (w * h) / frame_area
                conf = min(0.9, 0.3 + rel * 2.0)
                detections.append((x, y, w, h, conf))
        except Exception as exc:
            eprint(f"[face_detect] Haar cascade error: {exc}")

    min_bbox_w = max(40, int(min_bbox_frac * frame_width))
    frame_area = frame_width * frame_height
    out: list[tuple[int, int, int, float]] = []

    for (x, y, w, h, conf) in detections:
        if w < min_bbox_w:
            continue
        # Aspect ratio sanity (filters obvious false positives like thin bars)
        ar = w / h if h > 0 else 0
        if ar < 0.6 or ar > 1.4:
            continue
        rel_area = (w * h) / frame_area
        if rel_area < 0.005 or rel_area > 0.3:
            continue
        cx = x + w // 2
        cy = y + h // 2
        out.append((cx, cy, w * h, conf))

    return out


def _sample_frame_times(start_sec: float, end_sec: float, target_fps: float = 2.0,
                        min_samples: int = 15, max_samples: int = 60) -> list[float]:
    """Uniformly spaced sample timestamps inside [start, end]."""
    duration = max(0.0, end_sec - start_sec)
    if duration <= 0:
        return [start_sec]
    n = int(round(duration * target_fps))
    n = max(min_samples, min(max_samples, n))
    if n <= 1:
        return [start_sec]
    return [start_sec + duration * i / (n - 1) for i in range(n)]


def _collect_face_observations(
    cap,
    fps: float,
    frame_width: int,
    frame_height: int,
    times: list[float],
    mp_detector,
    haar_cascade,
) -> tuple[list[list[tuple[int, int, int, float]]], int]:
    """
    Sample frames at `times` and collect face observations.
    Returns (per_frame_observations, max_faces_in_any_frame).
    """
    import cv2

    per_frame: list[list[tuple[int, int, int, float]]] = []
    max_faces = 0

    for t in times:
        frame_idx = int(t * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ok, frame = cap.read()
        if not ok:
            per_frame.append([])
            continue
        obs = _detect_faces_in_frame(frame, mp_detector, haar_cascade, frame_width, frame_height)
        per_frame.append(obs)
        if len(obs) > max_faces:
            max_faces = len(obs)

    return per_frame, max_faces


# ---------------------------------------------------------------------------
# Cluster-based face picker (replaces the old weighted-average approach)
# ---------------------------------------------------------------------------

def _pick_face_center(
    per_frame_obs: list[list[tuple[int, int, int, float]]],
    frame_width: int,
    frame_height: int,
) -> Optional[tuple[float, float]]:
    """
    Return (cx, cy) in absolute pixels of the best face cluster, or None if no
    usable detections.

    Strategy:
      1. Flatten all observations across frames.
      2. k = max faces seen in any single frame (so two-speaker clips → k=2).
      3. KMeans clusters the (cx, cy) points. If sklearn isn't installed or
         k==1, fall back to the area-weighted mean of the single group.
      4. Pick the cluster with the MOST detections across frames (most
         persistent face). Break ties by mean face area (closer = larger),
         then by closeness to the frame center.
    """
    flat: list[tuple[int, int, int, float]] = []
    for obs in per_frame_obs:
        flat.extend(obs)
    if not flat:
        return None

    # Single-face case — just return the area-weighted mean.
    k = max((len(o) for o in per_frame_obs), default=0)
    if k <= 1:
        total_w = sum(area * conf for _, _, area, conf in flat)
        if total_w <= 0:
            return None
        cx = sum(x * area * conf for x, _, area, conf in flat) / total_w
        cy = sum(y * area * conf for _, y, area, conf in flat) / total_w
        return (cx, cy)

    # Multi-face: cluster
    try:
        import numpy as np
        from sklearn.cluster import KMeans
    except ImportError:
        # sklearn missing — fall back to largest-face-wins
        eprint("[face_detect] sklearn missing — falling back to largest-face selection")
        best = max(flat, key=lambda o: o[2] * o[3])
        return (float(best[0]), float(best[1]))

    pts = np.array([[x, y] for x, y, _, _ in flat], dtype=np.float32)
    try:
        km = KMeans(n_clusters=k, init="k-means++", n_init=3, random_state=0).fit(pts)
    except Exception as exc:
        eprint(f"[face_detect] KMeans failed ({exc}) — falling back to largest-face")
        best = max(flat, key=lambda o: o[2] * o[3])
        return (float(best[0]), float(best[1]))

    labels = km.labels_
    cluster_info = []  # (label, count, mean_area, centroid)
    frame_center = (frame_width / 2, frame_height / 2)

    for label in range(k):
        mask = labels == label
        count = int(mask.sum())
        if count == 0:
            continue
        members = [flat[i] for i in range(len(flat)) if mask[i]]
        mean_area = sum(m[2] for m in members) / count
        cent = km.cluster_centers_[label]
        dist_center = math.hypot(cent[0] - frame_center[0], cent[1] - frame_center[1])
        cluster_info.append((label, count, mean_area, (float(cent[0]), float(cent[1])), dist_center))

    if not cluster_info:
        return None

    # Rank: most-persistent → largest-face → closest-to-center
    cluster_info.sort(key=lambda c: (-c[1], -c[2], c[4]))
    winner = cluster_info[0]
    return winner[3]


# ---------------------------------------------------------------------------
# Scene detection (PySceneDetect)
# ---------------------------------------------------------------------------

def _detect_scenes_in_window(video_path: str, start_sec: float, end_sec: float) -> list[tuple[float, float]]:
    """
    Return a list of (scene_start_sec, scene_end_sec) inside [start, end].
    Uses PySceneDetect's high-level `detect()` with ContentDetector.
    If PySceneDetect isn't installed or the call fails, returns a single
    [(start, end)] so the caller still gets one crop for the whole window.
    """
    try:
        from scenedetect import detect, ContentDetector  # type: ignore
    except ImportError:
        return [(start_sec, end_sec)]

    try:
        # ContentDetector threshold=27 is the library default and empirically
        # good for hard cuts. min_scene_len=15 frames = ~0.5s @ 30fps avoids
        # sub-second flicker segments.
        scene_list = detect(
            video_path,
            ContentDetector(threshold=27.0, min_scene_len=15),
            start_time=start_sec,
            end_time=end_sec,
        )
    except Exception as exc:
        eprint(f"[face_detect] PySceneDetect error in [{start_sec:.2f}, {end_sec:.2f}]: {exc}")
        return [(start_sec, end_sec)]

    if not scene_list:
        return [(start_sec, end_sec)]

    scenes: list[tuple[float, float]] = []
    for entry in scene_list:
        s = float(entry[0].get_seconds())
        e = float(entry[1].get_seconds())
        # Clamp into window (PySceneDetect may return overlapping boundaries)
        s = max(s, start_sec)
        e = min(e, end_sec)
        if e - s >= 0.5:
            scenes.append((s, e))

    # Guarantee coverage — if we end up with nothing (e.g. all scenes were
    # filtered too short), return the whole window.
    if not scenes:
        return [(start_sec, end_sec)]

    # Guarantee first scene starts at start_sec and last ends at end_sec so
    # the timeline covers the full segment without gaps.
    first_s, first_e = scenes[0]
    if first_s > start_sec:
        scenes[0] = (start_sec, first_e)
    last_s, last_e = scenes[-1]
    if last_e < end_sec:
        scenes[-1] = (last_s, end_sec)

    return scenes


# ---------------------------------------------------------------------------
# Main per-segment routine
# ---------------------------------------------------------------------------

def _crop_for_window(
    cap,
    fps: float,
    frame_width: int,
    frame_height: int,
    start_sec: float,
    end_sec: float,
    mp_detector,
    haar_cascade,
) -> dict:
    """Compute a single face-centered 9:16 crop for [start, end]."""
    times = _sample_frame_times(start_sec, end_sec, target_fps=2.0, min_samples=15, max_samples=60)
    per_frame, _max_faces = _collect_face_observations(
        cap, fps, frame_width, frame_height, times, mp_detector, haar_cascade,
    )
    center = _pick_face_center(per_frame, frame_width, frame_height)
    if center is None:
        return center_crop(frame_width, frame_height)
    cx, cy = center
    return crop_centered_on(cx, cy, frame_width, frame_height)


def _dominant_crop(timeline: list[dict]) -> dict:
    """Return the crop from the longest scene in the timeline."""
    best = max(timeline, key=lambda e: e["end_abs"] - e["start_abs"])
    # Strip timeline-only keys before returning
    return {
        "x": best["x"],
        "y": best["y"],
        "width": best["width"],
        "height": best["height"],
        "face_detected": best["face_detected"],
    }


# ---------------------------------------------------------------------------
# Argument parsing + main
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Detect faces and generate 9:16 crop rectangles")
    parser.add_argument("--input", required=True, help="Path to input video file")
    parser.add_argument("--segments", required=True, help="Path to segments JSON file")
    parser.add_argument("--output", required=True, help="Path to write output JSON")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if not os.path.isfile(args.input):
        emit({"type": "error", "message": f"Input video not found: {args.input}"})
        sys.exit(1)
    if not os.path.isfile(args.segments):
        emit({"type": "error", "message": f"Segments file not found: {args.segments}"})
        sys.exit(1)

    with open(args.segments, "r", encoding="utf-8") as f:
        segments = json.load(f)

    total = len(segments)
    eprint(f"[face_detect] Processing {total} segment(s) from: {args.input}")

    try:
        import cv2
    except ImportError as exc:
        emit({"type": "error", "message": f"OpenCV not installed: {exc}"})
        sys.exit(1)

    mp_face_module = None
    try:
        import mediapipe as mp
        mp_face_module = mp.solutions.face_detection  # type: ignore[attr-defined]
        eprint("[face_detect] MediaPipe loaded OK")
    except ImportError:
        eprint("[face_detect] MediaPipe not available — will use Haar cascade only")
    except Exception as exc:
        eprint(f"[face_detect] MediaPipe init error: {exc}")

    try:
        import sklearn  # noqa: F401
    except ImportError:
        eprint("[face_detect] sklearn not installed — clustering disabled, "
               "will fall back to largest-face for multi-face scenes")

    try:
        import scenedetect  # noqa: F401
        eprint("[face_detect] PySceneDetect loaded OK")
    except ImportError:
        eprint("[face_detect] PySceneDetect not installed — "
               "per-scene timelines disabled (one crop per segment)")

    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        emit({"type": "error", "message": f"Cannot open video: {args.input}"})
        sys.exit(1)

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    eprint(f"[face_detect] Video: {frame_width}x{frame_height} @ {fps:.2f} fps")

    haar_cascade = None
    try:
        haar_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        haar_cascade = cv2.CascadeClassifier(haar_path)
        if haar_cascade.empty():
            haar_cascade = None
            eprint("[face_detect] Haar cascade XML not found — cascade fallback disabled")
    except Exception as exc:
        eprint(f"[face_detect] Haar cascade load error: {exc}")

    crops: list[dict] = []

    mp_ctx = (
        mp_face_module.FaceDetection(model_selection=1, min_detection_confidence=0.5)
        if mp_face_module is not None
        else None
    )

    try:
        for idx, seg in enumerate(segments):
            emit({"type": "progress", "segment": idx, "total": total})

            start_sec = float(seg.get("start", 0.0))
            end_sec = float(seg.get("end", start_sec + 1.0))
            if end_sec <= start_sec:
                end_sec = start_sec + 1.0

            try:
                scenes = _detect_scenes_in_window(args.input, start_sec, end_sec)
                if len(scenes) > 1:
                    eprint(f"[face_detect] Segment {idx}: {len(scenes)} scene(s) detected")

                timeline: list[dict] = []
                for (s_start, s_end) in scenes:
                    scene_crop = _crop_for_window(
                        cap, fps, frame_width, frame_height,
                        s_start, s_end, mp_ctx, haar_cascade,
                    )
                    timeline.append({
                        "start_abs": s_start,
                        "end_abs": s_end,
                        **scene_crop,
                    })

                dominant = _dominant_crop(timeline)
                out_entry = {**dominant}
                if len(timeline) > 1:
                    out_entry["timeline"] = timeline
                crops.append(out_entry)

                eprint(
                    f"[face_detect] Segment {idx}: crop x={dominant['x']} y={dominant['y']} "
                    f"({'face' if dominant['face_detected'] else 'center'})"
                    + (f", {len(timeline)} scene crops" if len(timeline) > 1 else "")
                )

            except Exception as exc:
                eprint(f"[face_detect] Segment {idx} error: {exc}")
                crops.append(center_crop(frame_width, frame_height))

    finally:
        if mp_ctx is not None:
            try:
                mp_ctx.close()
            except Exception:
                pass
        cap.release()

    result: dict = {"type": "done", "crops": crops}
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    emit(result)
    eprint(f"[face_detect] Done. Output written to: {args.output}")


if __name__ == "__main__":
    main()
