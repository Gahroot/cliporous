import type { TechnologyStory } from '../../technology/types';

/** Pack A: bounded authored stories; all ...At fields are absolute seconds. */
export const INFORMATION_PRESETS = {
  'system-layers': ['business-stack', 'device-stack'],
  'semantic-sort': ['topic-clusters', 'closest-match', 'skill-match'],
  'information-transform': ['structured-report', 'multimodal-fusion'],
} as const;

export const INFORMATION_LAYOUTS = ['stack', 'stack-flipped', 'takeover', 'over'] as const;
export const INFORMATION_LIMITS = {
  layers: 4,
  targets: 3,
  items: 6,
  inputs: 3,
  actorLabel: 22,
  detail: 28,
  evidenceWords: 32,
} as const;

/** Inclusive source indices, retained so a relationship can be audited. */
export interface InformationEvidence {
  fromWord: number;
  toWord: number;
  phrase: string;
}

export type LayerRole = 'people' | 'workflow' | 'records' | 'interface' | 'compute' | 'power';

export interface SystemLayersScene extends TechnologyStory {
  kind: 'system-layers';
  preset: (typeof INFORMATION_PRESETS)['system-layers'][number];
  /** Bottom to top. IDs follow validated order, never labels or random placement. */
  layers: {
    id: string;
    label: string;
    role: LayerRole;
    evidence: InformationEvidence;
  }[];
}

export interface SemanticSortScene extends TechnologyStory {
  kind: 'semantic-sort';
  preset: (typeof INFORMATION_PRESETS)['semantic-sort'][number];
  /** Topic trays, candidate documents, or skill workstations, depending on preset. */
  targets: { id: string; label: string }[];
  items: {
    id: string;
    label: string;
    /** Null is explicitly unpaired: the actor remains on its original document stand. */
    targetId: string | null;
    evidence: InformationEvidence;
  }[];
}

export type InformationMedium = 'text' | 'image' | 'audio';

export interface InformationTransformScene extends TechnologyStory {
  kind: 'information-transform';
  preset: (typeof INFORMATION_PRESETS)['information-transform'][number];
  resultLabel: string;
  /** One traceable content fragment per input, not unsupported generated prose. */
  inputs: {
    id: string;
    label: string;
    medium: InformationMedium;
    detail: string;
    field: string;
    evidence: InformationEvidence;
  }[];
}

export type InformationScene = SystemLayersScene | SemanticSortScene | InformationTransformScene;
