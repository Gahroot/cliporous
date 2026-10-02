import {
  STORYBOARD_LIMITS,
  STORYBOARD_MODEL_ACTIONS,
  STORYBOARD_MODELS,
  type StoryboardModel,
} from '../../../../shared/storyboards';
import {
  alongPolyline,
  type CameraPose,
  easeCurvePoints,
  easeInOut,
  quad,
  worldToScreen,
} from './camera';
import type { BoardElement, BoardProp, Pt } from './types';

export const BOARD_CAMERA_FOV = 24;
export const MODEL_BOX = 2.4;
export const pixelCameraDistance = (height: number): number =>
  height / 2 / Math.tan((BOARD_CAMERA_FOV * Math.PI) / 360);

/** Native clocks reach an authored final pose, then stop (including gear rotation and battery blink). */
const ACTION_DURATION: Record<StoryboardModel, number> = {
  lightbulb: 1.8,
  clapperboard: 2,
  laptop: 2.4,
  hourglass: 6.5,
  battery: 2.4,
  gears: 2,
  book: 2.4,
};

export function supportedModel(prop: BoardProp): StoryboardModel {
  if (!(STORYBOARD_MODELS as readonly string[]).includes(prop.model))
    throw new Error(`Unsupported storyboard model: ${prop.model}`);
  const model = prop.model as StoryboardModel;
  if (!STORYBOARD_MODEL_ACTIONS[model].includes(prop.action ?? 'reveal'))
    throw new Error(`Unsupported storyboard action: ${model}/${prop.action}`);
  return model;
}

export function actionEnd(prop: BoardProp): number {
  return Math.max(
    prop.at,
    prop.actionEndAt ??
      Math.max(
        prop.at + 1.2,
        (prop.glowAt ?? prop.at) + 0.35,
        (prop.shakeAt ?? prop.at) + 1.2,
        prop.at + (prop.flight?.dur ?? 0) + 1.2,
        prop.at + (prop.ride?.dur ?? 0) + 0.2,
      ),
  );
}

export function actionClock(
  prop: BoardProp,
  t: number,
  fps: number,
): { frame: number; tone: 'up' | 'down'; progress: number } {
  const model = supportedModel(prop);
  const end = actionEnd(prop);
  const progress = Math.min(1, Math.max(0, (t - prop.at) / Math.max(0.001, end - prop.at)));
  return {
    frame:
      prop.action === 'activate' || prop.action === 'deactivate'
        ? Math.round(progress * ACTION_DURATION[model] * fps)
        : 0,
    tone: prop.action === 'deactivate' ? 'down' : 'up',
    progress,
  };
}

export interface PropPose {
  visible: boolean;
  world: Pt;
  scale: number;
  spin: number;
  roll: number;
  glow: number;
  lift: number;
}

function wobble(t: number, at: number, frequency: number, decay: number): number {
  const d = t - at;
  return d <= 0 || d >= 1.2 ? 0 : Math.sin(d * frequency) * Math.exp(-d * decay);
}

/** Segment-local, frame-seekable placement. Retains the proof's flight/curve choreography. */
export function propPose(
  prop: BoardProp,
  elements: readonly BoardElement[],
  time: number,
): PropPose {
  const t = Math.min(time, actionEnd(prop));
  const since = Math.max(0, t - prop.at);
  let world: Pt = { x: prop.x, y: prop.y };
  let spin = 0;
  let lift = 0;
  if (prop.flight) {
    const f = prop.flight;
    const k = 1 - (1 - Math.min(1, since / Math.max(0.001, f.dur))) ** 2;
    world = quad(f.from, f.via, world, k);
    spin = (1 - k) * Math.PI * 2 * (f.spins ?? 0);
    lift = 1 - k;
  }
  if (prop.ride) {
    const curve = elements.find((el) => el.id === prop.ride?.curveId);
    if (curve?.kind === 'curve') {
      world = alongPolyline(
        easeCurvePoints(curve.x + 10, curve.y + 10, curve.w - 30, curve.h - 20),
        easeInOut((since - 0.2) / Math.max(0.001, prop.ride.dur)),
      );
      lift = 0.35;
    }
  }
  const landed = since - (prop.flight?.dur ?? 0);
  const settle = wobble(landed, 0, 16, 7) * 0.18;
  const shake = prop.shakeAt === undefined ? 0 : wobble(t, prop.shakeAt, 34, 4.5) * 0.32;
  const glowStart = prop.glowAt ?? prop.at;
  const glowEnd = prop.glowAt === undefined ? actionEnd(prop) : prop.glowAt + 0.35;
  const glowProgress =
    t >= glowEnd
      ? 1
      : Math.min(1, Math.max(0, (t - glowStart) / Math.max(0.001, glowEnd - glowStart)));
  const glow =
    prop.model !== 'lightbulb'
      ? 0
      : prop.action === 'deactivate'
        ? 1 - glowProgress
        : prop.action === 'activate' || prop.glowAt !== undefined
          ? glowProgress
          : 0;
  return {
    visible: time >= prop.at,
    world,
    scale: Math.min(1, 1 - (1 - Math.min(1, since / 0.28)) ** 3) * (1 + settle * 0.4),
    spin,
    roll: shake + settle * 0.3,
    glow,
    lift,
  };
}

export interface VisibleProp {
  prop: BoardProp;
  pose: PropPose;
}

export function visibleBoardProps(
  props: readonly BoardProp[],
  elements: readonly BoardElement[],
  cam: CameraPose,
  t: number,
  width: number,
  height: number,
): VisibleProp[] {
  if (props.length > STORYBOARD_LIMITS.maxProps)
    throw new Error('Storyboard exceeds model instance budget');
  return props
    .map((prop) => {
      supportedModel(prop);
      return { prop, pose: propPose(prop, elements, t) };
    })
    .filter(({ prop, pose }) => {
      if (!pose.visible || pose.scale <= 0) return false;
      const s = worldToScreen(pose.world, cam, width, height);
      // Conservative full silhouette + contact shadow margin; never clip models at their centres.
      const radius = prop.size * cam.zoom * 1.6;
      return (
        s.x + radius >= 0 && s.x - radius <= width && s.y + radius >= 0 && s.y - radius <= height
      );
    });
}

export function boardCanvasCount(visible: readonly VisibleProp[]): 0 | 1 {
  return visible.length === 0 ? 0 : 1;
}
