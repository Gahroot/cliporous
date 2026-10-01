import { contactOffset, phaseProgress, revealAt, travelPoint } from './motion';
import type { RetrievalGroundingScene } from './types';

/** The library and writing sheet have separate silhouettes; these are slip origins, not boxes. */
export const RETRIEVAL_GROUNDING_GEOMETRY = {
  libraryX: 102,
  answerX: 624,
  rows: [432, 612],
  slipWidth: 364,
  slipHeight: 162,
  questionFrom: { x: 64, y: 248 },
  questionTo: { x: 92, y: 274 },
} as const;

export interface RetrievalEvidencePose {
  id: string;
  label: string;
  excerpt: string;
  reference: number;
  x: number;
  y: number;
  opacity: number;
  selected: boolean;
  inAnswer: boolean;
  progress: number;
}

export interface RetrievalGroundingPose {
  question: { x: number; y: number; opacity: number };
  searchProgress: number;
  searched: boolean;
  noMatch: boolean;
  slips: RetrievalEvidencePose[];
  referenceEmphasis: number;
  workspaceOffset: number;
  outcomeOpacity: number;
}

/** Pure absolute-second sampling; no caches, clocks, random motion or post-resolution drift. */
export function retrievalGroundingPose(
  scene: RetrievalGroundingScene,
  timeSeconds: number,
): RetrievalGroundingPose {
  const t = Number.isFinite(timeSeconds) ? timeSeconds : scene.setupAt - 1;
  const G = RETRIEVAL_GROUNDING_GEOMETRY;
  const sources = scene.preset === 'no-evidence' ? [] : scene.sources.slice(0, 2);
  const leg = (scene.checkAt - scene.responseAt) / Math.max(1, sources.length);
  const slips = sources.map((source, index): RetrievalEvidencePose => {
    // Two-source transfers are sequential, not a cloud of concurrent evidence.
    const departure = scene.responseAt + leg * index;
    // Pin the final contact to the authored beat, avoiding accumulated float drift.
    const arrival =
      index === sources.length - 1 ? scene.checkAt : scene.responseAt + leg * (index + 1);
    const origin = { x: G.libraryX, y: G.rows[index] };
    const destination = { x: G.answerX, y: G.rows[index] };
    return {
      id: `${index + 1}:${source.label}:${source.excerpt}`,
      ...source,
      reference: index + 1,
      ...travelPoint(t, departure, arrival, origin, destination),
      opacity: revealAt(t, scene.setupAt),
      selected: t >= departure,
      inAnswer: t >= arrival,
      progress: phaseProgress(t, departure, arrival),
    };
  });
  return {
    question: {
      ...travelPoint(t, scene.setupAt, scene.actionAt, G.questionFrom, G.questionTo),
      opacity: revealAt(t, scene.setupAt),
    },
    searchProgress: phaseProgress(t, scene.actionAt, scene.responseAt),
    searched: t >= scene.responseAt,
    noMatch: scene.preset === 'no-evidence' && t >= scene.responseAt,
    slips,
    referenceEmphasis: sources.length ? revealAt(t, scene.checkAt, 0.3) : 0,
    workspaceOffset: sources.length ? contactOffset(t, scene.checkAt, 3) : 0,
    // A discrete editorial resolution leaves the entire required 0.8s exactly static.
    outcomeOpacity: t >= scene.resolveAt ? 1 : 0,
  };
}
