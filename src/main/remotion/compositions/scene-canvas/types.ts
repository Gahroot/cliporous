/**
 * Scene canvas: a run of consecutive approved long-form scenes arranged as panels on one
 * moving whiteboard. Scenes keep their own validated content and beat timing; the canvas only
 * adds world placement, hand-drawn frames/connectors and the camera that travels between them.
 */
import type { Palette } from '../../../../shared/palettes';
import type { ExplainerScene } from '../explainer/types';
import type { BoardSkin } from '../storyboard/types';

/**
 * Self-contained base kinds that read correctly inside a classic 1080×960 panel.
 * Authored causal/concept/business/hybrid stories keep their protected full-window cuts.
 */
export const SCENE_CANVAS_KINDS = [
  'checklist',
  'versus',
  'stamp',
  'flow',
  'stack',
  'statement',
  'number',
  'timeline',
  'notes',
  'question',
  'before-after',
  'chart',
  'chat',
  'network',
  'loop',
  'myth-fact',
  'funnel',
  'hero',
  'equation',
  'quadrant',
  'venn',
  'definition',
  'study',
  'pictogram',
  'ranking',
  'receipt',
  'streak',
  'spectrum',
  'quote',
  'headline',
  'journey',
  'search',
  'code',
  'iceberg',
  'balance',
  'podium',
  'compound',
  'dominoes',
  'stairs',
] as const;
export type SceneCanvasKind = (typeof SCENE_CANVAS_KINDS)[number];

/** Canvas kinds that mount a WebGL stage; a canvas holds at most `maxWebglPanels` of them. */
export const SCENE_CANVAS_WEBGL_KINDS: ReadonlySet<string> = new Set([
  'flow',
  'stack',
  'myth-fact',
  'funnel',
  'hero',
  'iceberg',
  'balance',
  'podium',
  'compound',
  'dominoes',
  'stairs',
]);

const canvasKinds: ReadonlySet<string> = new Set(SCENE_CANVAS_KINDS);
export function isSceneCanvasKind(kind: string): kind is SceneCanvasKind {
  return canvasKinds.has(kind);
}

export const SCENE_CANVAS_LIMITS = {
  minPanels: 2,
  maxPanels: 5,
  maxWebglPanels: 2,
  /** Largest speaker gap between two scenes that still continues the same canvas. */
  maxGapSec: 24,
  maxSpanSec: 90,
  /** Gaps at least this long pull back to show the accumulated board before moving on. */
  overviewGapSec: 5,
  /** Closing pull-back borrowed from the following speaker window when it is long enough. */
  tailSec: 1.5,
  minSpeakerAfterTailSec: 2.5,
} as const;

/** One approved scene placed on the canvas. Times are canvas-local seconds. */
export interface SceneCanvasPanel {
  id: string;
  /** Scene beats rebased so 0 is this panel's first frame. */
  scene: ExplainerScene;
  startSec: number;
  endSec: number;
}

// A type alias (not an interface) so Remotion's Record<string, unknown> props constraint holds.
export type SceneCanvasProps = {
  style: BoardSkin;
  /** Immutable palette snapshot, shared with storyboards. */
  palette: Palette;
  durationSec: number;
  panels: SceneCanvasPanel[];
};
