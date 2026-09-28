import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FACE_DETECTION_TIMEOUT_MS } from '@shared/constants';
import type { OutputAspectRatio } from './aspect-ratios';
import { computeCenterCropForRatio } from './aspect-ratios';
import { runPythonScript } from './python';

// ---------------------------------------------------------------------------
// Types (canonical definitions live in @shared/types)
// ---------------------------------------------------------------------------

import type { CropRegion, CropTimelineEntry, FaceDetectionProgress } from '@shared/types';

export type { CropRegion, CropTimelineEntry, FaceDetectionProgress };

/** Crop for one clip: dominant-scene rect + optional per-scene timeline. */
export interface FaceCropResult {
  crop: CropRegion;
  /** Populated when PySceneDetect found >1 scene inside the segment. */
  timeline?: CropTimelineEntry[];
  /**
   * Rows (source px) covered by the tracked face across every scene of the
   * window; absent when no face was found or detection was unreliable.
   */
  faceBand?: { top: number; bottom: number };
  /**
   * True only when the accurate detector (MediaPipe) ran, so "no face" can
   * be trusted. The Haar fallback mistakes patterns for faces.
   */
  facesReliable?: boolean;
}

interface PythonFaceRows {
  face_top?: unknown;
  face_bottom?: unknown;
}

/** Union of the face rows reported for a window. Untrusted input. */
function faceBandOf(entries: PythonFaceRows[]): { top: number; bottom: number } | undefined {
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const e of entries) {
    const t = e.face_top;
    const b = e.face_bottom;
    if (typeof t !== 'number' || typeof b !== 'number') continue;
    if (!Number.isFinite(t) || !Number.isFinite(b) || b <= t) continue;
    top = Math.min(top, t);
    bottom = Math.max(bottom, b);
  }
  return Number.isFinite(top) && Number.isFinite(bottom) ? { top, bottom } : undefined;
}

interface Segment {
  start: number;
  end: number;
}

interface PythonCropEntry extends PythonFaceRows {
  x: number;
  y: number;
  width: number;
  height: number;
  face_detected: boolean;
  faces_reliable?: unknown;
  /** Per-scene timeline; entries carry start_abs/end_abs in source seconds. */
  timeline?: Array<{
    face_top?: unknown;
    face_bottom?: unknown;
    start_abs: number;
    end_abs: number;
    x: number;
    y: number;
    width: number;
    height: number;
    face_detected: boolean;
  }>;
}

// Python script output types
interface PythonProgressLine {
  type: 'progress';
  segment: number;
  total: number;
}

interface PythonDoneLine {
  type: 'done';
  crops: PythonCropEntry[];
}

interface PythonErrorLine {
  type: 'error';
  message: string;
}

type PythonOutputLine = PythonProgressLine | PythonDoneLine | PythonErrorLine;

// ---------------------------------------------------------------------------
// detectFaceCrops
// ---------------------------------------------------------------------------

function toResult(entries: PythonCropEntry[]): FaceCropResult[] {
  return entries.map((c) => {
    const crop: CropRegion = {
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      faceDetected: c.face_detected,
    };
    const timeline: CropTimelineEntry[] | undefined =
      Array.isArray(c.timeline) && c.timeline.length > 1
        ? c.timeline.map((t) => ({
            startTime: t.start_abs,
            endTime: t.end_abs,
            x: t.x,
            y: t.y,
            width: t.width,
            height: t.height,
            faceDetected: t.face_detected,
          }))
        : undefined;
    const faceBand = faceBandOf([c, ...(Array.isArray(c.timeline) ? c.timeline : [])]);
    return {
      crop,
      timeline,
      ...(faceBand ? { faceBand } : {}),
      facesReliable: c.faces_reliable === true,
    };
  });
}

/**
 * Run MediaPipe face detection + PySceneDetect on a video for the given
 * segments. Returns one FaceCropResult per segment (dominant crop + optional
 * per-scene timeline). Falls back to centre crop when no face is found or
 * the Python environment is unavailable.
 */
export async function detectFaceCrops(
  videoPath: string,
  segments: Segment[],
  onProgress: (p: FaceDetectionProgress) => void,
): Promise<FaceCropResult[]> {
  const stamp = Date.now();
  const segmentsJson = join(tmpdir(), `batchcontent-segments-${stamp}.json`);
  const outputJson = join(tmpdir(), `batchcontent-crops-${stamp}.json`);

  // Write segments to temp file
  await writeFile(segmentsJson, JSON.stringify(segments), 'utf-8');

  let doneResults: FaceCropResult[] | null = null;

  try {
    await runPythonScript(
      'face_detect.py',
      ['--input', videoPath, '--segments', segmentsJson, '--output', outputJson],
      {
        timeoutMs: FACE_DETECTION_TIMEOUT_MS,
        onStdout: (line: string) => {
          try {
            const parsed = JSON.parse(line) as PythonOutputLine;
            if (parsed.type === 'progress') {
              onProgress({ segment: parsed.segment, total: parsed.total });
            } else if (parsed.type === 'done') {
              doneResults = toResult(parsed.crops);
            } else if (parsed.type === 'error') {
              console.error('[FaceDetection] Python error:', parsed.message);
            }
          } catch {
            // Non-JSON stdout line — ignore
          }
        },
      },
    );

    // If we didn't receive a "done" line on stdout, try reading the output file
    if (doneResults === null) {
      try {
        const raw = await readFile(outputJson, 'utf-8');
        const parsed = JSON.parse(raw) as PythonDoneLine;
        if (parsed.type === 'done' && Array.isArray(parsed.crops)) {
          doneResults = toResult(parsed.crops);
        }
      } catch {
        // Output file not readable — will fall back below
      }
    }
  } finally {
    // Clean up temp files (best effort)
    for (const p of [segmentsJson, outputJson]) {
      unlink(p).catch(() => undefined);
    }
  }

  if (doneResults !== null) {
    return doneResults;
  }

  console.warn('[FaceDetection] No crops returned by Python script — returning empty array');
  return [];
}

// ---------------------------------------------------------------------------
// calculateCenterCrop
// ---------------------------------------------------------------------------

/**
 * Compute a centre crop from known video dimensions for the target aspect ratio.
 * Defaults to 9:16 when no ratio is specified for backwards compatibility.
 * Rounds to even numbers for H.264 compatibility.
 */
export function calculateCenterCrop(
  videoWidth: number,
  videoHeight: number,
  targetRatio: OutputAspectRatio = '9:16',
): CropRegion {
  const { x, y, width, height } = computeCenterCropForRatio(videoWidth, videoHeight, targetRatio);
  return { x, y, width, height, faceDetected: false };
}
