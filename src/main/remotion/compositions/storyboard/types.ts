/**
 * Story board: one large world canvas that a camera glides over while drawn
 * elements and clay props build in sync with speech. All times are seconds on
 * the composition clock; all positions are world pixels.
 *
 * Prototype scope: the spec is hand-authored (board-proof.ts). The shape is
 * meant to be what a future planner emits, so it stays plain data.
 */

import type { Palette } from '../../../../shared/palettes';
import type {
  StoryboardAction,
  StoryboardPanelKind,
  StoryboardStyle,
} from '../../../../shared/storyboards';
import type { HeroProp } from '../explainer/types';
import type { BoardBusinessPanel } from './business-types';

/** `ink` = paper + hand-drawn ink + clay; `polish` = current dark editorial stage. */
export type BoardSkin = 'ink' | 'polish';

export interface Pt {
  x: number;
  y: number;
}

export type BoardTone = 'ink' | 'accent' | 'muted';

interface ElementBase {
  id: string;
  /** Seconds — the element starts drawing here and then stays on the board. */
  at: number;
}

export interface TextSegment {
  text: string;
  at: number;
}

export type BoardElement =
  | (ElementBase & {
      kind: 'frame';
      x: number;
      y: number;
      w: number;
      h: number;
      /** Title-bar text, written segment by segment (e.g. "Codex" then " / Claude Code"). */
      title?: TextSegment[];
      /** Placeholder "code" rows drawn inside the frame from this time. */
      rowsAt?: number;
      rows?: number;
    })
  | (ElementBase & {
      kind: 'text';
      x: number;
      y: number;
      text: string;
      size: number;
      /** Authored wrapping bounds; never supplied by the model. */
      width?: number;
      tone: BoardTone;
      align?: 'left' | 'center';
      /** Marker swipe behind the text from this time. */
      highlightAt?: number;
    })
  | (ElementBase & {
      kind: 'arrow';
      from: Pt;
      to: Pt;
      /** Perpendicular bow as a fraction of length (+ = left of travel). */
      bend: number;
      dur?: number;
      dashed?: boolean;
      head?: boolean;
      tone: BoardTone;
    })
  | (ElementBase & { kind: 'ring'; cx: number; cy: number; rx: number; ry: number })
  | (ElementBase & { kind: 'neq'; x: number; y: number; size: number })
  | (ElementBase & { kind: 'glyph'; x: number; y: number; text: string; size: number })
  | (ElementBase & {
      kind: 'curve';
      x: number;
      y: number;
      w: number;
      h: number;
      /** A dot rides the curve from this time (optional). */
      dotAt?: number;
    })
  | (ElementBase & {
      kind: 'tracks';
      x: number;
      y: number;
      w: number;
      h: number;
      /** Playhead sweeps from this time. */
      playAt: number;
    })
  | (ElementBase & {
      kind: 'note';
      x: number;
      y: number;
      rot: number;
      title: string;
      width?: number;
      height?: number;
    })
  | (ElementBase & {
      kind: 'counter';
      x: number;
      y: number;
      value: number;
      unit: string;
      size: number;
      width: number;
    });

/** A clay prop on the board, drawn by the single shared WebGL layer. */
export interface BoardProp {
  id: string;
  model: 'bulb' | HeroProp;
  /** Appears (or launches) at this time. */
  at: number;
  /** Resting world position (centre) and size in world px. */
  x: number;
  y: number;
  size: number;
  /** Optional flight that ends at the rest position. */
  flight?: { from: Pt; via: Pt; dur: number; spins?: number };
  /** Optional path following a board curve element (id) over `dur`. */
  ride?: { curveId: string; dur: number };
  /** Bulb only: lights up from this time. */
  glowAt?: number;
  /** Short shake (a "this is wrong" reaction). */
  shakeAt?: number;
  yaw?: number;
  /** Completed actions are frozen at this absolute source time before rebasing. */
  actionEndAt?: number;
  action?: StoryboardAction;
  semanticId?: string;
}

export interface CameraShot {
  /** Seconds the move starts. The first shot is the opening pose. */
  at: number;
  /** Move duration in seconds (0 = cut). */
  dur: number;
  x: number;
  y: number;
  zoom: number;
  /** Slow drift after the move settles, world px per second. */
  driftX?: number;
}

export interface StoryBoardSpec {
  durationSec: number;
  panels?: {
    id: string;
    kind: StoryboardPanelKind;
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    at: number;
  }[];
  worldBounds?: { x: number; y: number; width: number; height: number };
  shots: CameraShot[];
  elements: BoardElement[];
  props: BoardProp[];
  /** Reconstructed native facts for source-validated business panels, never planner geometry. */
  businessPanels?: BoardBusinessPanel[];
  /** Board dissolves in over the source footage here … */
  boardIn: { at: number; dur: number };
  /** … and back out to the footage here. */
  boardOut: { at: number; dur: number };
}

/** Production input; no media, URLs, source-code strings or model-authored geometry. */
export type ProductionStoryBoardProps = {
  spec: StoryBoardSpec;
  style: StoryboardStyle;
  palette: Palette;
};

/** Proof-only historical props; production uses ProductionStoryBoardProps. */
export type StoryBoardProps = {
  skin: BoardSkin;
  /** When true, `proof-source.mp4` from the bundle's public dir plays under the board. */
  withSource?: boolean;
};
