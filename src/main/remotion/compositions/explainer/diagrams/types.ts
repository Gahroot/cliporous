import type { TechnologyBeats } from '../technology/types';

export const EXPLANATION_VISUAL_MODES = ['diagram', 'hybrid'] as const;
export type ExplanationVisualMode = (typeof EXPLANATION_VISUAL_MODES)[number];
export const DIAGRAM_LAYOUTS = ['stack', 'stack-flipped', 'pip', 'over'] as const;
export const DIAGRAM_LIMITS = {
  entities: 8,
  edges: 12,
  holders: 4,
  holdings: 6,
  tokens: 12,
  models: 3,
  metrics: 3,
  label: 48,
  subject: 34,
  actor: 28,
  condition: 96,
  outcome: 54,
  finalHold: 0.8,
} as const;

export const SYMBOL_ROLES = [
  'account',
  'investor',
  'company',
  'share',
  'invoice',
  'holding',
  'model',
  'token',
  'task',
  'clock',
  'evidence',
] as const;
export type SymbolRole = (typeof SYMBOL_ROLES)[number];
export type EdgeRole = 'payment' | 'ownership' | 'shared' | 'reference';
export type Measurement =
  | { state: 'measured'; value: number; unit: string }
  | { state: 'unknown' }
  | { state: 'illustrative' };

/** Common semantic contract, not a model-programmable graph language. */
export interface DiagramStory extends TechnologyBeats {
  visualMode: ExplanationVisualMode;
  label: string;
  subject: string;
  outcome: string;
  condition?: string;
  evidence: 'source-stated' | 'illustrative';
}

export interface DiagramEntity {
  id: string;
  label: string;
  role: SymbolRole;
}
export interface DiagramPoint {
  x: number;
  y: number;
}
export interface DiagramRect extends DiagramPoint {
  width: number;
  height: number;
}
