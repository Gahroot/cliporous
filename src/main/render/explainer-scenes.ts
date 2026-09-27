/**
 * Explainer scenes on the segmented (9:16 shorts) render path.
 *
 *   plan (Gemini, word-indexed)  →  splice into the segment list as
 *   `split-image` segments  →  render each scene with Remotion (1080×960 H.264)
 *   →  the existing split layout vstacks it above the speaker.
 *
 * Scenes win over whatever archetype the segment had inside their window
 * (including b-roll). Any failure degrades that window to the speaker; a
 * planner failure leaves the segment list untouched.
 */

import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type PlanBounds,
  type PlannedExplainerScene,
  type PlannerWord,
  planExplainerScenes,
  toSceneRelative,
} from '../ai/explainer-scenes';
import { log } from '../logger';
import {
  EXPLAINER_FPS,
  EXPLAINER_STAGE_HEIGHT,
  EXPLAINER_STAGE_WIDTH,
  type ExplainerScene,
  type ExplainerSceneProps,
} from '../remotion/compositions/explainer/types';
import type { ResolvedSegment } from './segment-render';

/** Window edges within this distance of a segment boundary snap onto it. */
const SNAP_SEC = 0.5;
/** Minimum scene length after snapping. */
const MIN_SCENE_SEC = 2;
/** Extra render length so boundary rebalancing (≤0.15s) never loops the scene. */
const RENDER_PAD_SEC = 0.3;
const CONTIGUOUS_EPS = 1e-3;

export interface SplicedPiece {
  segment: ResolvedSegment;
  /** Present when this piece is an explainer scene (beats in absolute time). */
  scene?: ExplainerScene;
}

function snapEdge(t: number, boundaries: number[], floor: number): number {
  let best = t;
  let bestDist = SNAP_SEC;
  for (const b of boundaries) {
    const d = Math.abs(b - t);
    if (d <= bestDist && b >= floor) {
      best = b;
      bestDist = d;
    }
  }
  return best;
}

/** True when the segments overlapping [start, end) form one contiguous run. */
function coversContiguously(segments: ResolvedSegment[], start: number, end: number): boolean {
  const overlapping = segments.filter((s) => s.endTime > start && s.startTime < end);
  const first = overlapping[0];
  const last = overlapping[overlapping.length - 1];
  if (!first || !last) return false;
  if (first.startTime > start + CONTIGUOUS_EPS || last.endTime < end - CONTIGUOUS_EPS) {
    return false;
  }
  for (let i = 1; i < overlapping.length; i++) {
    const prev = overlapping[i - 1];
    const cur = overlapping[i];
    if (!prev || !cur || Math.abs(cur.startTime - prev.endTime) > CONTIGUOUS_EPS) return false;
  }
  return true;
}

/**
 * Splice planned scene windows into a segment list. Pure.
 *
 * Window edges snap to nearby segment boundaries (so no sliver segments are
 * created); windows that cross a gap in the source timeline, overlap an
 * earlier window, or become shorter than {@link MIN_SCENE_SEC} are dropped.
 * Speaker pieces that resume after a scene hard-cut back in.
 */
export function spliceExplainerScenes(
  segments: ResolvedSegment[],
  planned: PlannedExplainerScene[],
  minStart: number,
): SplicedPiece[] {
  const boundaries = segments.flatMap((s) => [s.startTime, s.endTime]);
  const windows: PlannedExplainerScene[] = [];
  for (const p of planned) {
    const startTime = snapEdge(p.startTime, boundaries, minStart);
    const endTime = snapEdge(p.endTime, boundaries, startTime + MIN_SCENE_SEC);
    const prev = windows[windows.length - 1];
    if (endTime - startTime < MIN_SCENE_SEC) continue;
    if (startTime < minStart - CONTIGUOUS_EPS) continue;
    if (prev && startTime < prev.endTime) continue;
    if (!coversContiguously(segments, startTime, endTime)) continue;
    windows.push({ ...p, startTime, endTime });
  }
  if (windows.length === 0) return segments.map((segment) => ({ segment }));

  const out: SplicedPiece[] = [];
  for (const seg of segments) {
    let cursor = seg.startTime;
    let resumed = false;
    for (const win of windows) {
      if (win.endTime <= seg.startTime || win.startTime >= seg.endTime) continue;
      if (win.startTime > cursor + CONTIGUOUS_EPS) {
        out.push({
          segment: {
            ...seg,
            startTime: cursor,
            endTime: win.startTime,
            ...(resumed ? { transitionIn: 'hard-cut' as const } : {}),
          },
        });
      }
      const pieceEnd = Math.min(seg.endTime, win.endTime);
      const tail = out[out.length - 1];
      if (tail?.scene === win.scene) {
        // Same window continuing across a segment boundary — extend it.
        tail.segment = { ...tail.segment, endTime: pieceEnd };
      } else {
        out.push({
          scene: win.scene,
          segment: {
            ...seg,
            startTime: Math.max(cursor, win.startTime),
            endTime: pieceEnd,
            archetype: 'split-image',
            zoom: { style: 'none', intensity: 1 },
            transitionIn: 'hard-cut',
            videoPath: undefined,
            imagePath: undefined,
            fallbackReason: undefined,
          },
        });
      }
      cursor = pieceEnd;
      resumed = true;
    }
    if (cursor < seg.endTime - CONTIGUOUS_EPS) {
      out.push({
        segment: {
          ...seg,
          startTime: cursor,
          ...(resumed ? { transitionIn: 'hard-cut' as const } : {}),
        },
      });
    }
  }
  return out;
}

/** Beats relative to the final window, clamped inside it. */
function relativeScene(piece: SplicedPiece): ExplainerScene | null {
  if (!piece.scene) return null;
  const { startTime, endTime } = piece.segment;
  const rel = toSceneRelative(piece.scene, startTime);
  const max = Math.max(0, endTime - startTime - 0.15);
  const c = (t: number): number => Math.min(max, t);
  switch (rel.kind) {
    case 'checklist':
      return { ...rel, items: rel.items.map((it) => ({ ...it, doneAt: c(it.doneAt) })) };
    case 'versus':
      return {
        ...rel,
        left: { ...rel.left, at: c(rel.left.at) },
        right: { ...rel.right, at: c(rel.right.at) },
      };
    case 'stamp':
      return {
        ...rel,
        stampAt: c(rel.stampAt),
        ...(rel.strikeAt === undefined ? {} : { strikeAt: c(rel.strikeAt) }),
      };
    case 'flow':
      return { ...rel, inputAt: c(rel.inputAt), outputAt: c(rel.outputAt) };
    case 'stack':
      return {
        ...rel,
        layers: rel.layers.map((l) => ({ ...l, at: c(l.at) })),
        ...(rel.dimAt === undefined ? {} : { dimAt: c(rel.dimAt) }),
      };
  }
}

export interface ApplyExplainerOptions {
  apiKey: string;
  segments: ResolvedSegment[];
  words: PlannerWord[];
  bounds: PlanBounds;
  accentColor: string;
  onProgress?: (message: string, fraction: number) => void;
  isCancelled?: () => boolean;
}

export interface ApplyExplainerResult {
  segments: ResolvedSegment[];
  tempFiles: string[];
  rendered: number;
  failed: number;
}

/**
 * Plan, splice and render explainer scenes for one segmented clip. Never
 * throws: every failure falls back to the speaker for that window.
 */
export async function applyExplainerScenes(
  opts: ApplyExplainerOptions,
): Promise<ApplyExplainerResult> {
  const unchanged: ApplyExplainerResult = {
    segments: opts.segments,
    tempFiles: [],
    rendered: 0,
    failed: 0,
  };
  const clipStart = opts.segments[0]?.startTime ?? opts.bounds.minStart;
  const words = opts.words.filter(
    (w) => w.start >= clipStart - CONTIGUOUS_EPS && w.end <= opts.bounds.maxEnd + CONTIGUOUS_EPS,
  );

  opts.onProgress?.('Planning animated scenes…', 0);
  const plan = await planExplainerScenes(opts.apiKey, words, opts.bounds);
  if (!plan.ok) {
    log('warn', 'explainer', `planning failed, keeping original segments: ${plan.error}`);
    return unchanged;
  }
  if (plan.value.length === 0) return unchanged;

  const pieces = spliceExplainerScenes(opts.segments, plan.value, opts.bounds.minStart);
  const scenePieces = pieces.filter((p) => p.scene);
  if (scenePieces.length === 0) return unchanged;

  const { renderRemotionSegment } = await import('../remotion/render');
  const tempFiles: string[] = [];
  let rendered = 0;
  let failed = 0;

  for (const piece of pieces) {
    const scene = relativeScene(piece);
    if (!scene) continue;
    if (opts.isCancelled?.()) {
      piece.segment = { ...piece.segment, archetype: 'talking-head' };
      continue;
    }
    const durationSec = piece.segment.endTime - piece.segment.startTime + RENDER_PAD_SEC;
    const outputPath = join(tmpdir(), `batchcontent-explainer-${randomUUID()}.mp4`);
    const inputProps: ExplainerSceneProps = { scene, accentColor: opts.accentColor };
    const started = Date.now();
    const base = rendered + failed;
    opts.onProgress?.(
      `Animating scene ${base + 1}/${scenePieces.length} (${scene.kind})…`,
      base / scenePieces.length,
    );
    try {
      await renderRemotionSegment({
        compositionId: 'ExplainerScene',
        inputProps: inputProps as unknown as Record<string, unknown>,
        durationSec,
        fps: EXPLAINER_FPS,
        width: EXPLAINER_STAGE_WIDTH,
        height: EXPLAINER_STAGE_HEIGHT,
        outputPath,
        onProgress: (p) =>
          opts.onProgress?.(
            `Animating scene ${base + 1}/${scenePieces.length} (${scene.kind})…`,
            (base + p) / scenePieces.length,
          ),
      });
      tempFiles.push(outputPath);
      piece.segment = { ...piece.segment, videoPath: outputPath };
      rendered++;
      log(
        'info',
        'explainer',
        `rendered ${scene.kind} scene ${durationSec.toFixed(2)}s in ${Date.now() - started}ms`,
      );
    } catch (err) {
      failed++;
      piece.segment = { ...piece.segment, archetype: 'talking-head' };
      log(
        'warn',
        'explainer',
        `scene render failed (${scene.kind}), using speaker instead: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return { segments: pieces.map((p) => p.segment), tempFiles, rendered, failed };
}
