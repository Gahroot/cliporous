import { contactOffset, phaseProgress, type TechnologyPoint, travelPoint } from './motion';
import type { ContextWindowScene } from './types';

/** Two finite document bays, an ejection shelf, and an unconnected archive cabinet. */
export const CONTEXT_WINDOW_GEOMETRY = {
  tray: { x: 64, y: 350, width: 632, height: 268 },
  archive: { x: 752, y: 350, width: 264, height: 430 },
  waiting: { x: 392, y: 210 },
  lip: { x: 392, y: 310 },
  working: { x: 392, y: 454 },
  outside: { x: 392, y: 642 },
  question: { x: 88, y: 454 },
  stored: { x: 776, y: 520 },
  cardWidth: 260,
  cardHeight: 132,
  storedWidth: 216,
} as const;

type ActorPose = TechnologyPoint & { opacity: number };

export interface ContextWindowPose {
  subject: ActorPose;
  detail: ActorPose;
  summary: ActorPose;
  retrieved: ActorPose;
  /** Storage never vanishes when a working copy leaves or is selected. */
  archiveOpacity: number;
  selected: number;
  outsideOpacity: number;
  trayOffset: number;
  outcomeOpacity: number;
}

/** Stateless absolute-second sampling; all movement ends by resolveAt, not after it. */
export function contextWindowPose(
  scene: ContextWindowScene,
  timeSeconds: number,
): ContextWindowPose {
  const G = CONTEXT_WINDOW_GEOMETRY;
  const t = Number.isFinite(timeSeconds) ? Math.min(timeSeconds, scene.resolveAt) : 0;
  const overflow = scene.preset === 'overflow';
  const summary = scene.preset === 'summarisation';
  const retrieval = scene.preset === 'memory-retrieval';
  const exitStart = overflow ? scene.responseAt : scene.actionAt;
  const exitEnd = overflow ? scene.checkAt : scene.responseAt;
  const entered = travelPoint(t, scene.responseAt, scene.checkAt, G.lip, G.working);
  const incoming =
    t <= scene.responseAt
      ? travelPoint(t, scene.actionAt, scene.responseAt, G.waiting, G.lip)
      : entered;
  return {
    subject: {
      ...(overflow ? incoming : G.question),
      opacity: summary ? 0 : 1,
    },
    detail: {
      ...travelPoint(t, exitStart, exitEnd, G.working, G.outside),
      opacity: retrieval ? 0 : 1,
    },
    summary: {
      ...entered,
      opacity: summary ? phaseProgress(t, scene.responseAt, scene.responseAt + 0.25) : 0,
    },
    retrieved: {
      ...travelPoint(t, scene.responseAt, scene.checkAt, G.stored, G.working),
      opacity: retrieval ? phaseProgress(t, scene.actionAt, scene.responseAt) : 0,
    },
    archiveOpacity: 1,
    selected: retrieval ? phaseProgress(t, scene.actionAt, scene.responseAt) : 0,
    outsideOpacity: retrieval ? 0 : phaseProgress(t, exitStart, exitEnd),
    trayOffset: contactOffset(t, scene.checkAt, 4),
    // Reveal only after the replacement/copy is seated, finishing at the resolution beat.
    outcomeOpacity: phaseProgress(t, scene.resolveAt - 0.25, scene.resolveAt),
  };
}
