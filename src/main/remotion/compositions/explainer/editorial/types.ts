/** Optional, bounded editorial contracts. Omission always keeps the legacy presentation. */
import type { ExplodedTarget } from '../mechanisms/composed-types';

export const STAMP_CONTACT_SECONDS = 0.12;
export const STAMP_FINISHES = ['letterpress', 'embossed'] as const;
export type StampFinish = (typeof STAMP_FINISHES)[number];

export interface LabelTreatment {
  kind: 'peel-back' | 'redaction';
  /** Reveal of the existing label, never replacement/hidden text. */
  revealAt: number;
  /** Required on statement; omitted on the single hero label. */
  targetIndex?: number;
}

export const SEMANTIC_MOTIONS = ['compress', 'separate', 'align'] as const;
export interface SemanticTextTreatment {
  kind: (typeof SEMANTIC_MOTIONS)[number];
  targetIndex: number;
  at: number;
}

export const NUMBER_PRESENTATIONS = ['odometer', 'split-flap'] as const;
export type NumberPresentation = (typeof NUMBER_PRESENTATIONS)[number];

export const DETAIL_KINDS = [
  'magnified-inset',
  'tracked-callout',
  'measurement',
  'focus-isolation',
] as const;

/** Targets come ONLY from the authored assembly, not arbitrary coordinates/model names. */
export type DetailTreatment = {
  kind: (typeof DETAIL_KINDS)[number];
  target: ExplodedTarget;
  at: number;
  /** Exact transcript text, ≤24 chars. Measurement units/value are never calculated/invented. */
  label: string;
};

/** Structural helper for checking budgets without widening the legacy scene union. */
export interface EditorialFields {
  finish?: StampFinish;
  labelTreatment?: LabelTreatment;
  semanticText?: SemanticTextTreatment;
  presentation?: NumberPresentation;
  detail?: DetailTreatment;
}
