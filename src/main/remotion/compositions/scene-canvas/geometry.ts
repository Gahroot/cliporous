/**
 * Pure scene-canvas geometry: panel placement on the world strip, connector paths, the camera
 * shot list and a seeded handheld drift. No React and no clock — every value derives from the
 * validated panel timing, so any frame renders identically in isolation.
 *
 * Camera grammar (lead into the beat, exact rests, never fully still, pull back to show the
 * accumulated board) follows the MIT-licensed GG Motion camera rig in KenKaiii/gg-framework.
 */

import { EXPLAINER_STAGE_HEIGHT, EXPLAINER_STAGE_WIDTH } from '../explainer/types';
import { boundedZoom, type CameraPose, cameraAt, seeded } from '../storyboard/camera';
import type { CameraShot, Pt } from '../storyboard/types';
import { SCENE_CANVAS_LIMITS, type SceneCanvasPanel } from './types';

export const CANVAS_VIEW = { width: 1920, height: 1080 } as const;
/** Space between a panel's stage and its drawn frame. */
export const PANEL_PAD = 44;
const PANEL_GAP = 420;
const MAX_WANDER = 130;
/** The camera arrives this long before the panel's first spoken beat. */
export const ARRIVE_LEAD_SEC = 0.35;
const TRAVEL_SEC = 1.15;
const MIN_TRAVEL_SEC = 0.6;
const OVERVIEW_MOVE_SEC = 1.3;
const FADE_SEC = 0.35;

export interface PanelBox {
  id: string;
  /** Stage origin (top-left of the 1080×960 stage) in world pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasConnector {
  from: Pt;
  to: Pt;
  at: number;
  dur: number;
}

export interface CanvasLayout {
  panels: PanelBox[];
  connectors: CanvasConnector[];
  shots: CameraShot[];
  /** Seconds each frame starts sketching on, by panel index. */
  frameAt: number[];
  fadeIn: { at: number; dur: number };
  fadeOut: { at: number; dur: number };
}

const W = EXPLAINER_STAGE_WIDTH;
const H = EXPLAINER_STAGE_HEIGHT;

function centre(box: PanelBox): Pt {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Pose that frames one panel with its drawn border and a little breathing room. */
export function focusPose(box: PanelBox): CameraPose {
  const zoom = Math.min(
    CANVAS_VIEW.width / (box.width + PANEL_PAD * 2 + 120),
    CANVAS_VIEW.height / (box.height + PANEL_PAD * 2 + 70),
  );
  return { ...centre(box), zoom: boundedZoom(Math.min(1, zoom)) };
}

/** Pose that shows every listed panel at once. */
export function overviewPose(boxes: readonly PanelBox[]): CameraPose {
  const first = boxes[0];
  if (!first) return { x: 0, y: 0, zoom: 1 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const b of boxes) {
    minX = Math.min(minX, b.x - PANEL_PAD);
    minY = Math.min(minY, b.y - PANEL_PAD);
    maxX = Math.max(maxX, b.x + b.width + PANEL_PAD);
    maxY = Math.max(maxY, b.y + b.height + PANEL_PAD);
  }
  const zoom = Math.min(
    (CANVAS_VIEW.width * 0.9) / (maxX - minX),
    (CANVAS_VIEW.height * 0.86) / (maxY - minY),
  );
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom: boundedZoom(Math.min(1, zoom)) };
}

/** Left→right strip on a gently wandering, seeded baseline — never a rigid grid. */
export function placePanels(panels: readonly Pick<SceneCanvasPanel, 'id'>[]): PanelBox[] {
  const seed = panels.map((p) => p.id).join('|');
  return panels.map((p, i) => ({
    id: p.id,
    x: i * (W + PANEL_PAD * 2 + PANEL_GAP),
    y: i === 0 ? 0 : Math.round((seeded(seed, i) * 2 - 1) * MAX_WANDER),
    width: W,
    height: H,
  }));
}

function shot(at: number, dur: number, pose: CameraPose): CameraShot {
  return { at, dur, x: pose.x, y: pose.y, zoom: pose.zoom };
}

/** Panels must be sorted, non-overlapping and inside [0, durationSec]. */
export function sceneCanvasProblem(
  panels: readonly SceneCanvasPanel[],
  durationSec: number,
): string | null {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 'Invalid canvas duration.';
  if (panels.length < 1 || panels.length > SCENE_CANVAS_LIMITS.maxPanels)
    return 'Invalid canvas panel count.';
  let previousEnd = 0;
  for (const p of panels) {
    if (
      !Number.isFinite(p.startSec) ||
      !Number.isFinite(p.endSec) ||
      p.startSec < previousEnd - 1e-6 ||
      p.endSec <= p.startSec ||
      p.endSec > durationSec + 1e-6
    )
      return `Canvas panel ${p.id} has invalid timing.`;
    previousEnd = p.endSec;
  }
  return null;
}

export function buildCanvasLayout(
  panels: readonly SceneCanvasPanel[],
  durationSec: number,
): CanvasLayout {
  const problem = sceneCanvasProblem(panels, durationSec);
  if (problem) throw new Error(problem);
  const boxes = placePanels(panels);
  const first = boxes[0];
  if (!first) throw new Error('Canvas has no panels.');
  const shots: CameraShot[] = [shot(0, 0, focusPose(first))];
  const connectors: CanvasConnector[] = [];
  const frameAt: number[] = [0];
  const push = (s: CameraShot): void => {
    const last = shots[shots.length - 1];
    shots.push({ ...s, at: Math.max(s.at, last ? last.at : 0) });
  };
  for (let i = 1; i < panels.length; i++) {
    const prev = panels[i - 1];
    const cur = panels[i];
    const box = boxes[i];
    const prevBox = boxes[i - 1];
    if (!prev || !cur || !box || !prevBox) continue;
    const arriveBy = Math.max(prev.endSec - 0.3, cur.startSec - ARRIVE_LEAD_SEC);
    const gap = cur.startSec - prev.endSec;
    let travelAt: number;
    let travelDur: number;
    if (gap >= SCENE_CANVAS_LIMITS.overviewGapSec) {
      // Show the accumulated story while the speaker talks between panels.
      push(shot(prev.endSec + 0.2, OVERVIEW_MOVE_SEC, overviewPose(boxes.slice(0, i))));
      travelDur = TRAVEL_SEC;
      travelAt = arriveBy - travelDur;
    } else {
      travelDur = Math.min(TRAVEL_SEC, Math.max(MIN_TRAVEL_SEC, arriveBy - (prev.endSec - 0.3)));
      travelAt = arriveBy - travelDur;
    }
    push(shot(travelAt, travelDur, focusPose(box)));
    const settled = shots[shots.length - 1];
    const moveAt = settled ? settled.at : travelAt;
    const a = centre(prevBox);
    const b = centre(box);
    connectors.push({
      from: { x: prevBox.x + prevBox.width + PANEL_PAD + 24, y: a.y },
      to: { x: box.x - PANEL_PAD - 24, y: b.y },
      at: moveAt,
      dur: Math.max(0.45, travelDur * 0.8),
    });
    frameAt.push(Math.max(moveAt + travelDur * 0.35, cur.startSec - 0.6));
  }
  const last = panels[panels.length - 1];
  const tail = last ? durationSec - last.endSec : 0;
  if (panels.length > 1 && tail >= 0.9)
    push(shot(durationSec - tail, Math.min(OVERVIEW_MOVE_SEC, tail), overviewPose(boxes)));
  return {
    panels: boxes,
    connectors,
    shots,
    frameAt,
    fadeIn: { at: 0, dur: FADE_SEC },
    fadeOut: { at: Math.max(0, durationSec - FADE_SEC), dur: FADE_SEC },
  };
}

/** Seeded low-frequency handheld drift so a resting board is never frozen. */
export function handheld(pose: CameraPose, t: number, seed: string): CameraPose {
  const p1 = seeded(seed, 11) * Math.PI * 2;
  const p2 = seeded(seed, 12) * Math.PI * 2;
  const p3 = seeded(seed, 13) * Math.PI * 2;
  const amp = 7 / Math.max(0.2, pose.zoom);
  return {
    x: pose.x + amp * (Math.sin(t * 0.41 + p1) * 0.7 + Math.sin(t * 0.97 + p2) * 0.3),
    y: pose.y + amp * 0.6 * Math.sin(t * 0.33 + p3),
    zoom: pose.zoom * (1 + 0.006 * Math.sin(t * 0.27 + p1)),
  };
}

export function canvasCameraAt(layout: CanvasLayout, t: number, seed: string): CameraPose {
  return handheld(cameraAt(layout.shots, t), t, seed);
}

/** Smoothstep envelope for the whole board over the source underlay. */
export function canvasOpacity(layout: Pick<CanvasLayout, 'fadeIn' | 'fadeOut'>, t: number): number {
  const p = (at: number, dur: number): number =>
    dur <= 0 ? Number(t >= at) : Math.min(1, Math.max(0, (t - at) / dur));
  const s = (v: number): number => v * v * (3 - 2 * v);
  return (
    s(p(layout.fadeIn.at, layout.fadeIn.dur)) * (1 - s(p(layout.fadeOut.at, layout.fadeOut.dur)))
  );
}

/** True when the panel (with its frame) intersects the viewport, plus a margin. */
export function panelInView(box: PanelBox, cam: CameraPose, margin = 120): boolean {
  const halfW = CANVAS_VIEW.width / 2 / cam.zoom + margin;
  const halfH = CANVAS_VIEW.height / 2 / cam.zoom + margin;
  return (
    box.x + box.width + PANEL_PAD > cam.x - halfW &&
    box.x - PANEL_PAD < cam.x + halfW &&
    box.y + box.height + PANEL_PAD > cam.y - halfH &&
    box.y - PANEL_PAD < cam.y + halfH
  );
}
