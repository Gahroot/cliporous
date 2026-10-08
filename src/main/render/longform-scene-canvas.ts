/**
 * Export-time scene canvas grouping. Pure and deterministic: consecutive approved, panel-safe
 * scenes in one planning section become one canvas segment that replaces their scene segments
 * and the short speaker windows between them. Approved plans are never rewritten.
 */

import type { PhraseEmphasis } from '@shared/types';
import { LANDSCAPE_FPS } from '../aspect-ratios';
import { mapSceneTimes } from '../remotion/compositions/explainer/types';
import {
  isSceneCanvasKind,
  SCENE_CANVAS_LIMITS,
  SCENE_CANVAS_WEBGL_KINDS,
  type SceneCanvasNote,
  type SceneCanvasPanel,
} from '../remotion/compositions/scene-canvas/types';
import type { LongformSceneSegment } from './longform-scene-timeline';

type SceneSegment = Extract<LongformSceneSegment, { kind: 'scene' }>;

export interface SceneCanvasGroup {
  startFrame: number;
  endFrame: number;
  startTime: number;
  endTime: number;
  members: SceneSegment[];
}

/** Timeline entry after grouping: plain segments pass through untouched. */
export type CanvasTimelineEntry =
  | { kind: 'segment'; segment: LongformSceneSegment }
  | { kind: 'canvas'; group: SceneCanvasGroup };

function eligible(segment: LongformSceneSegment): segment is SceneSegment {
  return (
    segment.kind === 'scene' &&
    segment.compiled.kind === 'explainer' &&
    isSceneCanvasKind(segment.compiled.planned.scene.kind)
  );
}

function isWebgl(segment: SceneSegment): boolean {
  return (
    segment.compiled.kind === 'explainer' &&
    SCENE_CANVAS_WEBGL_KINDS.has(segment.compiled.planned.scene.kind)
  );
}

/**
 * Greedy left→right runs. A run continues while the next eligible scene is in the same
 * section, the speaker gap is short, the span stays bounded and the WebGL budget holds.
 * Runs shorter than `minPanels` stay as ordinary scenes.
 */
export function groupSceneCanvases(
  segments: readonly LongformSceneSegment[],
  totalFrames: number,
): CanvasTimelineEntry[] {
  const L = SCENE_CANVAS_LIMITS;
  const runs: SceneSegment[][] = [];
  let run: SceneSegment[] = [];
  const close = (): void => {
    if (run.length >= L.minPanels) runs.push(run);
    run = [];
  };
  for (const segment of segments) {
    if (segment.kind === 'speaker') continue;
    if (!eligible(segment)) {
      close();
      continue;
    }
    const first = run[0];
    const last = run[run.length - 1];
    const fits =
      first !== undefined &&
      last !== undefined &&
      last.compiled.placement.sectionId === segment.compiled.placement.sectionId &&
      segment.startTime - last.endTime <= L.maxGapSec &&
      segment.endTime - first.startTime <= L.maxSpanSec &&
      run.length < L.maxPanels &&
      run.filter(isWebgl).length + Number(isWebgl(segment)) <= L.maxWebglPanels;
    if (!fits) close();
    run.push(segment);
  }
  close();

  const byStart = new Map<number, SceneCanvasGroup>();
  for (const members of runs) {
    const first = members[0];
    const last = members[members.length - 1];
    if (!first || !last) continue;
    byStart.set(first.startFrame, {
      startFrame: first.startFrame,
      endFrame: last.endFrame,
      startTime: first.startTime,
      endTime: last.endTime,
      members,
    });
  }
  // Borrow a short closing pull-back from the following speaker window when it is long enough.
  const entries: CanvasTimelineEntry[] = [];
  let active: SceneCanvasGroup | undefined;
  for (const segment of segments) {
    if (active && segment.startFrame < active.endFrame) continue;
    const group = byStart.get(segment.startFrame);
    if (group && segment.kind === 'scene') {
      active = group;
      entries.push({ kind: 'canvas', group });
      continue;
    }
    if (active && segment.kind === 'speaker' && segment.startFrame === active.endFrame) {
      const tail = Math.round(L.tailSec * LANDSCAPE_FPS);
      const left = segment.endFrame - segment.startFrame - tail;
      if (left >= Math.round(L.minSpeakerAfterTailSec * LANDSCAPE_FPS)) {
        active.endFrame += tail;
        active.endTime = active.endFrame / LANDSCAPE_FPS;
        entries.push({
          kind: 'segment',
          segment: { ...segment, startFrame: active.endFrame, startTime: active.endTime },
        });
        active = undefined;
        continue;
      }
    }
    active = undefined;
    entries.push({ kind: 'segment', segment });
  }
  if (entries.length > 0) {
    const covered = entries.reduce(
      (sum, e) =>
        sum +
        (e.kind === 'canvas'
          ? e.group.endFrame - e.group.startFrame
          : e.segment.endFrame - e.segment.startFrame),
      0,
    );
    const lastSegment = segments[segments.length - 1];
    if (lastSegment && covered !== lastSegment.endFrame - (segments[0]?.startFrame ?? 0))
      throw new Error('Scene canvas grouping changed the timeline length.');
  }
  if (totalFrames < 1) throw new Error('Invalid scene canvas timeline.');
  return entries;
}

/** Canvas-local panel specs: scene beats rebased to each panel's own first frame. */
export function buildSceneCanvasPanels(group: SceneCanvasGroup): SceneCanvasPanel[] {
  return group.members.map((member) => {
    if (member.compiled.kind !== 'explainer') throw new Error('Canvas panels must be explainers.');
    return {
      id: member.compiled.placement.id,
      scene: mapSceneTimes(member.compiled.planned.scene, (time) => time - member.startTime),
      startSec: (member.startFrame - group.startFrame) / LANDSCAPE_FPS,
      endSec: (member.endFrame - group.startFrame) / LANDSCAPE_FPS,
    };
  });
}

/** Shouted phrases read as handwriting in sentence case; mixed-case phrases are kept as written. */
function boardCase(text: string): string {
  const trimmed = text.trim().replace(/\s+/gu, ' ');
  if (trimmed !== trimmed.toUpperCase() || trimmed === trimmed.toLowerCase()) return trimmed;
  const lower = trimmed.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * The plan's approved phrases that fall entirely inside a canvas become board notes there
 * (canvas-local times). The caller removes the same phrases from the speaker overlay pass.
 */
export function buildSceneCanvasNotes(
  group: SceneCanvasGroup,
  phrases: readonly PhraseEmphasis[],
): { notes: SceneCanvasNote[]; absorbed: PhraseEmphasis[]; closeBySec?: number } {
  const duration = group.endTime - group.startTime;
  const spoken = phrases.filter((p) => p.text.trim().length > 0);
  const absorbed = spoken
    .filter(
      (p) =>
        p.startTime >= group.startTime &&
        p.startTime <= group.endTime - SCENE_CANVAS_LIMITS.noteEndMarginSec,
    )
    .sort((a, b) => a.startTime - b.startTime || a.text.localeCompare(b.text));
  const notes = absorbed.map((p, i) => ({
    id: `note-${i}`,
    text: boardCase(p.text),
    startSec: p.startTime - group.startTime,
    endSec: Math.min(duration, p.endTime - group.startTime),
  }));
  // A phrase starting in the canvas tail stays a speaker overlay; the board must be gone by then.
  const tailStarts = spoken
    .filter((p) => !absorbed.includes(p) && p.startTime > group.startTime)
    .filter((p) => p.startTime < group.endTime)
    .map((p) => p.startTime - group.startTime);
  if (tailStarts.length === 0) return { notes, absorbed };
  return { notes, absorbed, closeBySec: Math.min(...tailStarts) };
}

/** `sceneCanvas` is absent on older plans; absent means enabled. */
export function sceneCanvasEnabled(plan: { sceneCanvas?: boolean | undefined }): boolean {
  return plan.sceneCanvas !== false;
}
