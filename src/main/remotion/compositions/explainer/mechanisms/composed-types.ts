import type { DetailTreatment } from '../editorial/types';

/** Bounded, serializable composed scenes. Every beat is absolute seconds before rebasing. */
export interface SynchronizationScene {
  kind: 'synchronization';
  label: string;
  disagreeAt: number;
  rhythmAt: number;
  alignAt: number;
  /** The mail reaches the receiving belt; both belts stop exactly here. */
  transferAt: number;
}

export const RELAY_PRESETS = [
  'unlock',
  'nurture',
  'attract-process',
  'power-insight',
  'complete-system',
  'idea-process-result',
] as const;
export type RelayPreset = (typeof RELAY_PRESETS)[number];
export interface RelayScene {
  kind: 'relay';
  preset: RelayPreset;
  label: string;
  sourceAt: number;
  /** Transfer starts after the source has engaged its connection. */
  transferAt: number;
  /** Physical arrival/contact, before any receiving action. */
  receiveAt: number;
  /** Receiving action is complete; the entire scene holds still. */
  outcomeAt: number;
}

export const EXPLODED_TEMPLATES = ['mechanism', 'parcel', 'computing'] as const;
export type ExplodedTemplate = (typeof EXPLODED_TEMPLATES)[number];
export const EXPLODED_TARGETS = {
  mechanism: ['housing', 'shaft', 'gear'],
  parcel: ['base', 'contents', 'lid'],
  computing: ['board', 'chip', 'heatsink'],
} as const satisfies Record<ExplodedTemplate, readonly string[]>;
export type ExplodedTarget = (typeof EXPLODED_TARGETS)[ExplodedTemplate][number];
export interface ExplodedViewScene {
  kind: 'exploded-view';
  template: ExplodedTemplate;
  target: ExplodedTarget;
  label: string;
  detailLabel: string;
  detail?: DetailTreatment;
  assembleAt: number;
  /** Separation starts; the three parts reach their exploded positions by explainAt. */
  separateAt: number;
  explainAt: number;
  /** Reassembly starts; completed within EXPLODED_RETURN_SECONDS, then holds. */
  returnAt: number;
}
export const EXPLODED_RETURN_SECONDS = 0.65;
