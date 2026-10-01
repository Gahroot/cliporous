import {
  type LongformSceneRenderResult,
  type SceneFirstLongformPlan,
  scheduleLongformScenes,
} from '@shared/longform-scenes';
import type { CompiledLongformScene } from '../ai/longform-scene-contract';
import { LANDSCAPE_FPS } from '../aspect-ratios';

interface FrameWindow {
  /** Half-open output frame interval; source time remains frame / 30. */
  startFrame: number;
  endFrame: number;
  startTime: number;
  endTime: number;
}

export type LongformSceneSegment = FrameWindow &
  ({ kind: 'speaker' } | { kind: 'scene'; compiled: CompiledLongformScene });

export interface LongformSceneTimeline {
  segments: LongformSceneSegment[];
  totalFrames: number;
  omitted: LongformSceneRenderResult[];
}

/** Outward rounding protects complete setup/final-hold beats, including subframe edges. */
export function longformSceneFrameWindow(start: number, end: number): FrameWindow {
  const startFrame = Math.floor(start * LANDSCAPE_FPS + 1e-6);
  const endFrame = Math.ceil(end * LANDSCAPE_FPS - 1e-6);
  return {
    startFrame,
    endFrame,
    startTime: startFrame / LANDSCAPE_FPS,
    endTime: endFrame / LANDSCAPE_FPS,
  };
}

/** No legacy spacing/capping policy, snapping, AI, or invisible conflict drops. */
export function buildLongformSceneTimeline(
  plan: SceneFirstLongformPlan,
  compiled: readonly CompiledLongformScene[],
): LongformSceneTimeline {
  const schedule = scheduleLongformScenes(plan.scenes, plan.sourceDuration);
  if (schedule.rejected.length > 0) {
    throw new Error(`Approved scene ${schedule.rejected[0]?.id}: ${schedule.rejected[0]?.reason}`);
  }
  const totalFrames = Math.ceil(plan.sourceDuration * LANDSCAPE_FPS - 1e-6);
  if (!Number.isFinite(totalFrames) || totalFrames < 1)
    throw new Error('Invalid scene timeline duration.');
  const byId = new Map(compiled.map((scene) => [scene.placement.id, scene]));
  const segments: LongformSceneSegment[] = [];
  const speaker = (startFrame: number, endFrame: number): void => {
    if (endFrame > startFrame)
      segments.push({
        kind: 'speaker',
        startFrame,
        endFrame,
        startTime: startFrame / LANDSCAPE_FPS,
        endTime: endFrame / LANDSCAPE_FPS,
      });
  };
  let cursor = 0;
  for (const placement of schedule.scenes) {
    const scene = byId.get(placement.id);
    if (!scene) throw new Error(`Approved scene ${placement.id} was not reconstructed.`);
    const window = longformSceneFrameWindow(placement.startTime, placement.endTime);
    speaker(cursor, window.startFrame);
    segments.push({ kind: 'scene', ...window, compiled: scene });
    cursor = window.endFrame;
  }
  speaker(cursor, totalFrames);
  return {
    segments,
    totalFrames,
    omitted: plan.scenes
      .filter((scene) => scene.omitted)
      .map((scene) => ({
        id: scene.id,
        kind: scene.kind,
        startTime: scene.startTime,
        endTime: scene.endTime,
        status: 'omitted',
        reason: 'Omitted in the approved plan.',
      })),
  };
}
