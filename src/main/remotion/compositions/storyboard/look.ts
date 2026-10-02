/** Geometry/typography vary by treatment; every semantic colour comes from the shared resolver. */
import type { Palette } from '../../../../shared/palettes';
import { resolveStoryboardPalette } from '../../../../shared/storyboard-palette';
import type { ExplainerPalette } from '../explainer/types';
import type { BoardSkin, BoardTone } from './types';

export interface BoardLook {
  skin: BoardSkin;
  backdrop: string;
  paper: string;
  ink: string;
  muted: string;
  accent: string;
  highlight: string;
  highlightText: string;
  line: string;
  card: string;
  cardRaised: string;
  cardBorder: string;
  noteFill: string;
  noteText: string;
  tape: string;
  tapeText: string;
  shadow: string;
  stroke: number;
  /** Hand wobble amplitude (px); 0 = clean vector lines. */
  wobble: number;
  hand: string;
  ui: string;
  serif: string;
  mono: string;
  palette: ExplainerPalette;
}

// No OS font fallbacks: BoardFonts aborts if any bundled face is unavailable.
const HAND = "'Caveat'";
const UI = "'Inter'";
const SERIF = "'Instrument Serif'";
const MONO = "'JetBrains Mono'";

export function boardLook(skin: BoardSkin, palette: Palette): BoardLook {
  const p = resolveStoryboardPalette(skin, palette);
  return {
    skin,
    backdrop: p.canvas,
    paper: p.paper,
    ink: p.ink,
    muted: p.muted,
    accent: p.accent,
    highlight: p.marker,
    highlightText: p.markerText,
    line: p.stroke,
    card: p.card,
    cardRaised: p.cardRaised,
    cardBorder: p.stroke,
    noteFill: p.note,
    noteText: p.noteText,
    tape: p.tape,
    tapeText: p.tapeText,
    shadow: p.shadow,
    stroke: skin === 'ink' ? 3.4 : 4,
    wobble: skin === 'ink' ? 1.6 : 0,
    hand: skin === 'ink' ? HAND : UI,
    ui: UI,
    serif: SERIF,
    mono: MONO,
    palette: {
      bgOuter: p.canvas,
      bgInner: p.canvas,
      card: p.card,
      cardRaised: p.cardRaised,
      cardBorder: p.stroke,
      text: p.ink,
      muted: p.muted,
      accent: p.accent,
      accent2: p.accent2,
      accentSoft: p.marker,
      positive: p.accent,
      negative: p.accent2,
      paper: p.paper,
      paperText: p.ink,
      clay: p.clay,
    },
  };
}

export function toneColor(look: BoardLook, tone: BoardTone): string {
  if (tone === 'accent') return look.accent;
  if (tone === 'muted') return look.muted;
  return look.ink;
}
