import type { BusinessExplanationSource } from './business-explanation-source';

/** Saved source vocabulary only. Authored geometry belongs to the deterministic compiler. */
export const STORYBOARD_SPEC_VERSION = 2 as const;
export type StoryboardSpecVersion = 1 | 2;
export const STORYBOARD_STYLES = ['polish', 'ink'] as const;
export type StoryboardStyle = (typeof STORYBOARD_STYLES)[number];
export const DEFAULT_STORYBOARD_STYLE: StoryboardStyle = 'polish';
export const STORYBOARD_PANEL_KINDS = [
  'statement',
  'comparison',
  'process',
  'notes',
  'quantity',
  'hero',
] as const;
export type LegacyStoryboardPanelKind = (typeof STORYBOARD_PANEL_KINDS)[number];
export type StoryboardPanelKind = LegacyStoryboardPanelKind | 'explanation';
export const STORYBOARD_MODELS = [
  'lightbulb',
  'clapperboard',
  'laptop',
  'hourglass',
  'battery',
  'gears',
  'book',
] as const;
export type StoryboardModel = (typeof STORYBOARD_MODELS)[number];
export const STORYBOARD_ACTIONS = ['reveal', 'activate', 'deactivate'] as const;
export type StoryboardAction = (typeof STORYBOARD_ACTIONS)[number];
export const STORYBOARD_MODEL_ACTIONS: Record<StoryboardModel, readonly StoryboardAction[]> = {
  lightbulb: ['reveal', 'activate', 'deactivate'],
  clapperboard: ['reveal', 'activate'],
  laptop: ['reveal', 'activate'],
  hourglass: ['reveal', 'activate'],
  battery: ['reveal', 'activate', 'deactivate'],
  gears: ['reveal', 'activate'],
  book: ['reveal', 'activate'],
};
export const STORYBOARD_MOTIONS = [
  'reveal',
  'draw',
  'highlight',
  'note-settle',
  'counter',
  'prop-action',
  'pan',
  'push',
  'overview',
] as const;
export const STORYBOARD_LIMITS = {
  minPanels: 1,
  maxPanels: 5,
  minDurationSec: 4,
  maxDurationSec: 40,
  maxElements: 48,
  maxProps: 6,
  maxItems: 4,
  maxLabelChars: 96,
  maxLabelWords: 16,
  maxSpecBytes: 24_576,
  maxSpecNodes: 1_500,
  maxSpecDepth: 8,
  minZoom: 0.22,
  maxZoom: 1.15,
  maxWorldWidth: 8_400,
  maxWorldHeight: 1_800,
  maxWorldArea: 12_000_000,
  maxModelMeshes: 180,
  minHoldSec: 0.8,
  minOverviewHoldSec: 1.5,
  maxBoards: 32,
  minSeparationSec: 10,
  longSourceSec: 90,
  maxCoverage: 0.3,
  proposalTimeoutMs: 45_000,
  maxResponseBytes: 32_768,
  maxCues: 12,
} as const;

export interface StoryboardSourceSpan {
  startWord: number;
  endWord: number;
}
/** Text must match the normalized source phrase in this inclusive span. */
export interface StoryboardLabel extends StoryboardSourceSpan {
  text: string;
}
export interface StoryboardPropSource {
  /** Stable subject identity; repeated appearances must retain model and evidence. */
  id: string;
  model: StoryboardModel;
  action: StoryboardAction;
  atWord: number;
  evidence: StoryboardSourceSpan;
}
interface StoryboardPanelBase extends StoryboardSourceSpan {
  id: string;
  title: StoryboardLabel;
  revealWord: number;
  /** Source-anchored move toward this already-revealing panel. */
  moveWord: number;
  prop?: StoryboardPropSource;
}
export type LegacyStoryboardPanel =
  | (StoryboardPanelBase & { kind: 'statement'; body: StoryboardLabel })
  | (StoryboardPanelBase & {
      kind: 'comparison';
      left: StoryboardLabel;
      right: StoryboardLabel;
      evidence: StoryboardSourceSpan;
    })
  | (StoryboardPanelBase & {
      kind: 'process';
      items: StoryboardLabel[];
      relationship: 'sequence' | 'causes';
      evidence: StoryboardSourceSpan;
    })
  | (StoryboardPanelBase & { kind: 'notes'; items: StoryboardLabel[] })
  | (StoryboardPanelBase & {
      kind: 'quantity';
      value: number;
      unit: StoryboardLabel;
      evidence: StoryboardLabel;
    })
  | (StoryboardPanelBase & { kind: 'hero'; caption: StoryboardLabel; prop: StoryboardPropSource });

interface StoryboardSourceBase extends StoryboardSourceSpan {
  kind: 'storyboard';
  subject: StoryboardLabel;
  overview?: { atWord: number };
}
export interface LegacyStoryboardSourceSpec extends StoryboardSourceBase {
  specVersion: StoryboardSpecVersion;
  panels: LegacyStoryboardPanel[];
}
/** Version-2 source vocabulary; the adapter/compiler validates these choices before rendering. */
export interface StoryboardExplanationPanel extends StoryboardSourceSpan {
  kind: 'explanation';
  id: string;
  title: StoryboardLabel;
  revealWord: number;
  moveWord: number;
  explanation: BusinessExplanationSource;
  /** Literal hero contracts remain separate; explanation panels cannot attach raw prop choices. */
  prop?: never;
}
export type StoryboardPanel = LegacyStoryboardPanel | StoryboardExplanationPanel;
export interface BusinessStoryboardSourceSpec extends StoryboardSourceBase {
  specVersion: 2;
  panels: StoryboardPanel[];
}
export type StoryboardSourceSpec = LegacyStoryboardSourceSpec | BusinessStoryboardSourceSpec;

export interface StoryboardDiagnostic {
  code:
    | 'shape'
    | 'version'
    | 'budget'
    | 'words'
    | 'evidence'
    | 'timing'
    | 'identity'
    | 'unsupported'
    | 'conflict'
    | 'planning';
  message: string;
  panelId?: string;
  sourceId?: string;
  repairable: boolean;
}
export type StoryboardResult<T> =
  | { ok: true; value: T }
  | { ok: false; diagnostics: StoryboardDiagnostic[] };

/** Inspect descriptors before serialization: reject getters, cycles and non-JSON instances. */
export function storyboardSourceInputBudget(input: unknown): boolean {
  const plain = (value: unknown): value is Record<string, unknown> =>
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  let nodes = 0;
  const seen = new Set<object>();
  const visit = (value: unknown, depth: number): boolean => {
    if (++nodes > STORYBOARD_LIMITS.maxSpecNodes || depth > STORYBOARD_LIMITS.maxSpecDepth)
      return false;
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') return value.length <= STORYBOARD_LIMITS.maxLabelChars;
    if (typeof value !== 'object' || seen.has(value)) return false;
    if (!Array.isArray(value) && !plain(value)) return false;
    seen.add(value);
    const entries = Object.getOwnPropertyDescriptors(value);
    const ok =
      Object.keys(entries).length <= 64 &&
      Object.entries(entries).every(
        ([key, descriptor]) =>
          !['__proto__', 'constructor', 'prototype'].includes(key) &&
          key.length <= 64 &&
          'value' in descriptor &&
          visit(descriptor.value, depth + 1),
      );
    seen.delete(value);
    return ok;
  };
  return (
    plain(input) &&
    visit(input, 0) &&
    new TextEncoder().encode(JSON.stringify(input)).byteLength <= STORYBOARD_LIMITS.maxSpecBytes
  );
}

export function isStoryboardStyle(value: unknown): value is StoryboardStyle {
  return value === 'polish' || value === 'ink';
}
export function normalizeStoryboardStyle(value: unknown): StoryboardStyle {
  return isStoryboardStyle(value) ? value : DEFAULT_STORYBOARD_STYLE;
}
