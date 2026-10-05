/**
 * Explainer scenes on the segmented (9:16 shorts) render path.
 *
 *   plan (Gemini, word-indexed, reviewed)  →  group chained scenes  →  splice
 *   each group into the segment list as ONE `split-image` segment  →  render
 *   the group with the `ExplainerSequence` Remotion composition (continuous
 *   stage, scene-to-scene transitions, layout-sized canvas, alpha for `over`)
 *   →  segment-render composites it with the group's `explainerLayout`.
 *
 * Scenes win over whatever archetype the segment had inside their window
 * (including b-roll). Any failure degrades that window to the speaker; a
 * planner failure leaves the segment list untouched. Sound cues for every
 * rendered beat are returned in SOURCE time for the post-concat SFX mix.
 */

import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PlannerGenerator } from '../ai/explainer/planner-generation';
import type { PlannerProfileId } from '../ai/explainer/planner-profiles';
import type { PlanningObserver } from '../ai/explainer/planning-diagnostics';
import type { QuoteWindow } from '../ai/explainer/quote-selection';
import { summarizeUsage, type UsageChoice, type UsageRecord } from '../ai/explainer/recent-usage';
import {
  type PlanBounds,
  type PlannedExplainerScene,
  type PlannerEditPlan,
  type PlannerWord,
  planExplainerEditPlan,
  toSceneRelative,
} from '../ai/explainer-scenes';
import type { CaptionLayoutWindow } from '../captions';
import { log } from '../logger';
import {
  EXPLAINER_FPS,
  type ExplainerAspect,
  type ExplainerLayout,
  type ExplainerPalette,
  type ExplainerScene,
  type ExplainerSequenceProps,
  isCausalSceneKind,
  mapSceneTimes,
  type SceneCue,
  type SceneTransitionKind,
  type StageSafeBox,
  stageCanvasFor,
} from '../remotion/compositions/explainer/types';
import {
  type FaceMeasurement,
  faceBandOnCanvas,
  type OverPlacement,
  placeOverCard,
  type SpeakerFraming,
} from './over-placement';
import type { ResolvedSegment } from './segment-render';

/** Window edges within this distance of a segment boundary snap onto it. */
const SNAP_SEC = 0.5;
/** Minimum scene length after snapping. */
const MIN_SCENE_SEC = 2;
/** Extra render length so boundary rebalancing (≤0.15s) never loops the scene. */
const RENDER_PAD_SEC = 0.3;
const CONTIGUOUS_EPS = 1e-3;
/** Scene-to-scene transition length inside a chained group. */
const CHAIN_TRANSITION_FRAMES = 14;

/** One or more chained scenes that share a stage and render as one video. */
export interface SceneGroup {
  startTime: number;
  endTime: number;
  layout: ExplainerLayout;
  /** Scenes in order; each keeps its own absolute window + beats. */
  scenes: PlannedExplainerScene[];
}

export interface SplicedPiece {
  segment: ResolvedSegment;
  /** Present when this piece is an explainer group (beats in absolute time). */
  group?: SceneGroup;
}

/** Merge chained planned scenes into groups. Pure. */
export function groupPlannedScenes(
  planned: readonly PlannedExplainerScene[],
  observe?: PlanningObserver,
): SceneGroup[] {
  const groups: SceneGroup[] = [];
  for (const p of planned) {
    const prev = groups[groups.length - 1];
    if (
      p.chained &&
      prev &&
      prev.layout === p.layout &&
      Math.abs(p.startTime - prev.endTime) < 0.05
    ) {
      prev.scenes.push(p);
      prev.endTime = p.endTime;
    } else {
      groups.push({ startTime: p.startTime, endTime: p.endTime, layout: p.layout, scenes: [p] });
    }
  }
  groups.forEach((group, index) => {
    observe?.({
      stage: 'group',
      action: 'accepted',
      reason: 'shared-stage',
      index,
      count: group.scenes.length,
    });
  });
  return groups;
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
function coversContiguously(
  segments: readonly ResolvedSegment[],
  start: number,
  end: number,
  epsilon = CONTIGUOUS_EPS,
): boolean {
  const overlapping = segments.filter((s) => s.endTime > start && s.startTime < end);
  const first = overlapping[0];
  const last = overlapping[overlapping.length - 1];
  if (!first || !last) return false;
  if (first.startTime > start + epsilon || last.endTime < end - epsilon) {
    return false;
  }
  for (let i = 1; i < overlapping.length; i++) {
    const prev = overlapping[i - 1];
    const cur = overlapping[i];
    if (!prev || !cur || Math.abs(cur.startTime - prev.endTime) > epsilon) return false;
  }
  return true;
}

/**
 * Splice scene groups into a segment list. Pure.
 *
 * Group edges snap to nearby segment boundaries (so no sliver segments are
 * created); groups that cross a gap in the source timeline, overlap an
 * earlier group, or become shorter than {@link MIN_SCENE_SEC} are dropped.
 * Speaker pieces that resume after a scene hard-cut back in.
 */
export function spliceExplainerScenes(
  segments: readonly ResolvedSegment[],
  groups: readonly SceneGroup[],
  minStart: number,
  observe?: PlanningObserver,
): SplicedPiece[] {
  const boundaries = segments.flatMap((s) => [s.startTime, s.endTime]);
  const windows: SceneGroup[] = [];
  for (const [index, g] of groups.entries()) {
    // Do not trim causal setup/contact/settling to remove a small speaker sliver.
    // Outward snaps preserve every word-locked beat and the final readable hold.
    const causal = g.scenes.some((planned) => isCausalSceneKind(planned.scene.kind));
    const startBoundaries = causal ? boundaries.filter((b) => b <= g.startTime) : boundaries;
    const endBoundaries = causal ? boundaries.filter((b) => b >= g.endTime) : boundaries;
    const startTime = snapEdge(g.startTime, startBoundaries, minStart);
    const endTime = snapEdge(g.endTime, endBoundaries, startTime + MIN_SCENE_SEC);
    const prev = windows[windows.length - 1];
    const reason =
      endTime - startTime < MIN_SCENE_SEC
        ? 'too-short'
        : startTime < minStart - CONTIGUOUS_EPS
          ? 'protected-opening'
          : prev && startTime < prev.endTime
            ? 'overlap'
            : !coversContiguously(segments, startTime, endTime)
              ? 'source-gap'
              : undefined;
    if (reason) {
      observe?.({ stage: 'splice', action: 'removed', reason, index, count: g.scenes.length });
      continue;
    }
    if (startTime !== g.startTime || endTime !== g.endTime)
      observe?.({
        stage: 'splice',
        action: 'repaired',
        reason: 'boundary-snap',
        index,
        count: g.scenes.length,
      });
    observe?.({
      stage: 'splice',
      action: 'accepted',
      reason: 'timeline-admitted',
      index,
      count: g.scenes.length,
    });
    windows.push({ ...g, startTime, endTime });
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
      if (tail?.group === win) {
        // Same window continuing across a segment boundary — extend it.
        tail.segment = { ...tail.segment, endTime: pieceEnd };
      } else {
        out.push({
          group: win,
          segment: {
            ...seg,
            startTime: Math.max(cursor, win.startTime),
            endTime: pieceEnd,
            archetype: 'split-image',
            explainerLayout: win.layout,
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
        segment:
          cursor === seg.startTime && !resumed
            ? seg
            : {
                ...seg,
                startTime: cursor,
                ...(resumed ? { transitionIn: 'hard-cut' as const } : {}),
              },
      });
    }
  }
  return out;
}

/** Identity of the exact final-timeline parser input; independent of files and property order. */
export function plannerInputFingerprint(words: readonly PlannerWord[], bounds: PlanBounds): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        words: words.map(({ text, start, end }) => ({ text, start, end })),
        bounds: { minStart: bounds.minStart, maxEnd: bounds.maxEnd },
      }),
    )
    .digest('hex');
}

/** Admit an already parsed plan without changing source segments or saved scene objects. */
export function prepareExplainerTimeline(
  segments: readonly ResolvedSegment[],
  plan: PlannerEditPlan,
  bounds: PlanBounds,
  observe?: PlanningObserver,
): {
  pieces: SplicedPiece[];
  segments: ResolvedSegment[];
  captionWindows: CaptionLayoutWindow[];
  quotes: QuoteWindow[];
  choices: UsageChoice[];
} {
  // Saved plans may still contain decorative text. Omit it before grouping,
  // leaving the source timeline intact and breaking any chain through a removed scene.
  const scenes: PlannedExplainerScene[] = [];
  let chainBroken = false;
  for (const [index, planned] of plan.scenes.entries()) {
    if (planned.scene.kind === 'statement') {
      observe?.({
        stage: 'splice',
        action: 'removed',
        reason: 'short-form-redundant-text',
        index,
        count: 1,
      });
      chainBroken = true;
      continue;
    }
    scenes.push(chainBroken && planned.chained ? { ...planned, chained: false } : planned);
    chainBroken = false;
  }
  for (const [index] of plan.quotes.entries()) {
    observe?.({ stage: 'quote', action: 'rejected', reason: 'short-form-redundant-text', index });
  }
  const pieces = spliceExplainerScenes(
    segments,
    groupPlannedScenes(scenes, observe),
    bounds.minStart,
    observe,
  );
  const clipStart = segments[0]?.startTime ?? 0;
  return {
    pieces,
    segments: pieces.map((p) => p.segment),
    quotes: [],
    captionWindows: pieces.flatMap(({ segment: s }) =>
      s.explainerLayout
        ? [
            {
              startTime: s.startTime - clipStart,
              endTime: s.endTime - clipStart,
              layout: s.explainerLayout,
            },
          ]
        : [],
    ),
    choices: summarizeUsage(pieces.flatMap((p) => p.group?.scenes ?? [])),
  };
}

/** Clamp every beat time into [0, max]. */
function clampScene<T extends ExplainerScene>(scene: T, max: number): T {
  return mapSceneTimes(scene, (t) => Math.min(max, Math.max(0, t)));
}

export interface GroupRenderPlan {
  props: ExplainerSequenceProps;
  durationSec: number;
  /** Cues in absolute (source) time, clipped to the rendered window. */
  cues: SceneCue[];
}

/**
 * Build the composition props for a spliced group. Pure.
 *
 * Scene i's TransitionSeries sequence starts exactly at its own window start
 * (relative to the group start): each non-final sequence is lengthened by the
 * transition that overlaps the next one, so beats stay locked to the words.
 */
export function buildGroupRenderPlan(
  group: SceneGroup,
  window: { startTime: number; endTime: number },
  palette: ExplainerPalette,
  aspect: ExplainerAspect = '9:16',
  safeBox?: StageSafeBox,
): GroupRenderPlan {
  const fps = EXPLAINER_FPS;
  const total = window.endTime - window.startTime;
  const starts = group.scenes.map((s, i) =>
    i === 0 ? window.startTime : Math.min(window.endTime, Math.max(window.startTime, s.startTime)),
  );
  const totalFrames = Math.max(1, Math.round((total + RENDER_PAD_SEC) * fps));
  const scenes: ExplainerSequenceProps['scenes'] = [];
  const transitions: { kind: SceneTransitionKind; durationInFrames: number }[] = [];
  let usedFrames = 0;
  for (let i = 0; i < group.scenes.length; i++) {
    const planned = group.scenes[i];
    const start = starts[i];
    if (!planned || start === undefined) continue;
    const nextStart = starts[i + 1];
    const isLast = nextStart === undefined;
    const spanFrames = isLast
      ? Math.max(1, totalFrames - usedFrames)
      : Math.max(1, Math.round((nextStart - start) * fps));
    const next = group.scenes[i + 1];
    const trFrames = isLast ? 0 : Math.min(CHAIN_TRANSITION_FRAMES, Math.floor(spanFrames / 2));
    const durationSec = (spanFrames + trFrames) / fps;
    const rel = toSceneRelative(planned.scene, start);
    scenes.push({
      scene: clampScene(rel, Math.max(0, durationSec - 0.15)),
      durationInFrames: spanFrames + trFrames,
    });
    if (!isLast && next) {
      transitions.push({ kind: next.transition, durationInFrames: trFrames });
    }
    usedFrames += spanFrames;
  }

  const cues = group.scenes
    .flatMap((s) => s.cues)
    .filter((c) => c.at >= window.startTime - 0.05 && c.at <= window.endTime - 0.05);
  // Stage entrance/exit get a soft air cue.
  cues.push({ kind: 'whoosh', at: window.startTime + 0.02, gain: 0.45 });

  return {
    props: {
      scenes,
      transitions,
      layout: group.layout,
      aspect,
      palette,
      enter: true,
      exit: true,
      visibleSec: total,
      ...(safeBox ? { safeBox } : {}),
    },
    durationSec: totalFrames / fps,
    cues: cues.sort((a, b) => a.at - b.at),
  };
}

export interface ApplyExplainerOptions {
  onDiagnostic?: PlanningObserver;
  /** Must come from the real planner/parser using exactly `words` and `bounds`. */
  precomputedPlan?: PlannerEditPlan;
  precomputedWordsHash?: string;
  noAi?: boolean;
  profile?: PlannerProfileId;
  generator?: PlannerGenerator;
  signal?: AbortSignal;
  recentUse?: readonly UsageRecord[];
  onPlanned?: (choices: UsageChoice[]) => void;
  apiKey: string;
  segments: ResolvedSegment[];
  words: PlannerWord[];
  bounds: PlanBounds;
  palette: ExplainerPalette;
  /** Absolute times of stressed words, for emphasis reactions. */
  emphasisTimes?: readonly number[];
  /**
   * Face position per source window (source rows), for placing floating
   * `over` cards clear of the face. One entry per window, same order. Without
   * it, `over` scenes use the split-screen `stack` layout instead.
   */
  measureFaces?: (windows: readonly { start: number; end: number }[]) => Promise<FaceMeasurement[]>;
  /** Source + output size, to map face rows onto the canvas. */
  framing?: Omit<SpeakerFraming, 'cropRect'>;
  onProgress?: (message: string, fraction: number) => void;
  isCancelled?: () => boolean;
}

/**
 * Decide, per `over` piece, where its card sits (or switch it to `stack`).
 * Never throws: a failed measurement means "face position unknown".
 */
async function placeOverPieces(
  pieces: SplicedPiece[],
  opts: Pick<ApplyExplainerOptions, 'measureFaces' | 'framing'>,
): Promise<Map<SplicedPiece, OverPlacement>> {
  const overPieces = pieces.filter((p) => p.group?.layout === 'over');
  const placements = new Map<SplicedPiece, OverPlacement>();
  if (overPieces.length === 0) return placements;

  let measured: FaceMeasurement[] = [];
  if (opts.measureFaces && opts.framing) {
    try {
      measured = await opts.measureFaces(
        overPieces.map((p) => ({ start: p.segment.startTime, end: p.segment.endTime })),
      );
    } catch (err) {
      log(
        'warn',
        'explainer',
        `face check for floating cards failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  overPieces.forEach((piece, i) => {
    const face = measured[i];
    const onCanvas =
      face && opts.framing
        ? faceBandOnCanvas(face, { ...opts.framing, cropRect: piece.segment.cropRect })
        : face;
    placements.set(piece, placeOverCard(onCanvas));
  });
  return placements;
}

export interface ApplyExplainerResult {
  segments: ResolvedSegment[];
  tempFiles: string[];
  /** Sound cues (source time) for every successfully rendered group. */
  cues: SceneCue[];
  rendered: number;
  failed: number;
  renderedChoices: UsageChoice[];
}

/**
 * Plan, splice and render explainer scenes for one segmented clip. Invalid saved
 * input throws before generation; planning/render failures fall back to the speaker.
 */
export async function applyExplainerScenes(
  opts: ApplyExplainerOptions,
): Promise<ApplyExplainerResult> {
  const unchanged: ApplyExplainerResult = {
    segments: opts.segments,
    tempFiles: [],
    cues: [],
    rendered: 0,
    failed: 0,
    renderedChoices: [],
  };
  if (
    (opts.noAi || opts.precomputedPlan !== undefined) &&
    (!opts.precomputedPlan ||
      opts.precomputedWordsHash !== plannerInputFingerprint(opts.words, opts.bounds))
  ) {
    opts.onDiagnostic?.({
      stage: 'validation',
      action: 'rejected',
      reason: 'precomputed-fingerprint-mismatch',
    });
    throw new Error('A valid precomputed plan with an exact words/bounds fingerprint is required');
  }
  const cancelled = (): boolean => !!(opts.signal?.aborted || opts.isCancelled?.());
  let plan = opts.precomputedPlan;
  if (!plan) {
    if (cancelled()) {
      opts.onDiagnostic?.({ stage: 'render', action: 'fallback', reason: 'cancelled' });
      return unchanged;
    }
    if (!opts.apiKey && !opts.generator) {
      opts.onPlanned?.([]);
      return unchanged;
    }
    opts.onProgress?.('Planning animated scenes…', 0);
    const result = await planExplainerEditPlan(opts.apiKey, opts.words, opts.bounds, {
      aspect: '9:16',
      onDiagnostic: opts.onDiagnostic,
      emphasisTimes: opts.emphasisTimes,
      profile: opts.profile,
      generator: opts.generator,
      signal: opts.signal,
      recentUse: opts.recentUse,
    });
    if (!result.ok) {
      opts.onDiagnostic?.({
        stage: 'render',
        action: 'fallback',
        reason: cancelled() ? 'cancelled' : 'planning-failed',
      });
      log('warn', 'explainer', `planning failed, keeping original segments: ${result.error}`);
      return unchanged;
    }
    plan = result.value;
  }
  const timeline = prepareExplainerTimeline(opts.segments, plan, opts.bounds, opts.onDiagnostic);
  opts.onPlanned?.(timeline.choices);
  const pieces = timeline.pieces;
  const scenePieces = pieces.filter((p) => p.group);
  if (scenePieces.length === 0) return { ...unchanged, segments: timeline.segments };

  // Floating cards must not cover the speaker's face: move them into free
  // space, or use the split-screen layout when there is none.
  const placements = cancelled()
    ? new Map<SplicedPiece, OverPlacement>()
    : await placeOverPieces(pieces, opts);
  for (const [piece, placement] of placements) {
    const group = piece.group;
    if (!group) continue;
    if (placement.layout === 'stack') {
      opts.onDiagnostic?.({
        stage: 'splice',
        action: 'repaired',
        reason: 'face-safe-stack',
        count: group.scenes.length,
      });
      piece.group = { ...group, layout: 'stack' };
      piece.segment = { ...piece.segment, explainerLayout: 'stack' };
    }
    log(
      'info',
      'explainer',
      `floating card at ${piece.segment.startTime.toFixed(2)}s: ${
        placement.layout === 'stack'
          ? 'no room beside the face, using split screen'
          : placement.safe
            ? `placed at y=${placement.safe.y} h=${placement.safe.height} (clear of face)`
            : 'no face in shot, default position'
      }`,
    );
  }

  const successful: PlannedExplainerScene[] = [];
  const tempFiles: string[] = [];
  const cues: SceneCue[] = [];
  let rendered = 0;
  let failed = 0;

  for (const piece of pieces) {
    const group = piece.group;
    if (!group) continue;
    if (cancelled()) {
      failed++;
      opts.onDiagnostic?.({
        stage: 'render',
        action: 'fallback',
        reason: 'cancelled',
        count: group.scenes.length,
      });
      piece.segment = { ...piece.segment, archetype: 'talking-head', explainerLayout: undefined };
      continue;
    }
    const placement = placements.get(piece);
    const safeBox = placement?.layout === 'over' ? placement.safe : undefined;
    const canvas = stageCanvasFor(group.layout, '9:16');
    const ext = canvas.transparent ? 'mov' : 'mp4';
    const outputPath = join(tmpdir(), `batchcontent-explainer-${randomUUID()}.${ext}`);
    const label = group.scenes.map((s) => s.scene.kind).join('→');
    const started = Date.now();
    const base = rendered + failed;
    const message = `Animating scene ${base + 1}/${scenePieces.length} (${label})…`;
    opts.onProgress?.(message, base / scenePieces.length);
    try {
      const plan = buildGroupRenderPlan(group, piece.segment, opts.palette, '9:16', safeBox);
      const { renderRemotionSegment } = await import('../remotion/render');
      if (cancelled()) throw new Error('Cancelled');
      tempFiles.push(outputPath);
      await renderRemotionSegment({
        compositionId: 'ExplainerSequence',
        inputProps: plan.props as unknown as Record<string, unknown>,
        durationSec: plan.durationSec,
        fps: EXPLAINER_FPS,
        width: canvas.width,
        height: canvas.height,
        transparent: canvas.transparent,
        outputPath,
        onProgress: (p) => opts.onProgress?.(message, (base + p) / scenePieces.length),
      });
      if (cancelled()) throw new Error('Cancelled');
      piece.segment = { ...piece.segment, videoPath: outputPath };
      cues.push(...plan.cues);
      successful.push(...group.scenes);
      rendered++;
      opts.onDiagnostic?.({
        stage: 'render',
        action: 'rendered',
        reason: 'render-complete',
        count: group.scenes.length,
      });
      log(
        'info',
        'explainer',
        `rendered ${label} [${group.layout}] ${plan.durationSec.toFixed(2)}s ` +
          `${canvas.width}x${canvas.height} in ${Date.now() - started}ms`,
      );
    } catch (err) {
      failed++;
      opts.onDiagnostic?.({
        stage: 'render',
        action: 'fallback',
        reason: cancelled() ? 'cancelled' : 'render-failed',
        count: group.scenes.length,
      });
      piece.segment = { ...piece.segment, archetype: 'talking-head', explainerLayout: undefined };
      log(
        'warn',
        'explainer',
        `scene render failed (${label}), using speaker instead: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return {
    segments: pieces.map((p) => p.segment),
    tempFiles,
    cues: cues.sort((a, b) => a.at - b.at),
    rendered,
    failed,
    renderedChoices: summarizeUsage(successful),
  };
}
