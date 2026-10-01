import type { TechnologyStory } from '../../technology/types';

/** React-free, bounded authored stories; all beat times use TechnologyStory's seconds. */
export const INFERENCE_PRESETS = {
  'token-choice': ['next-token', 'uncertain-choice'],
  'expert-selection': ['single-specialist', 'specialist-team'],
  'edge-cloud': ['local-processing', 'split-processing'],
} as const;

export const INFERENCE_LAYOUTS = ['stack', 'stack-flipped', 'takeover', 'over'] as const;
export const INFERENCE_LIMITS = { actors: 3, word: 16, actor: 22, sentence: 32 } as const;

/** Inclusive source-word span, retained for relationship provenance (not time-rebased). */
export interface InferenceEvidence {
  fromWord: number;
  toWord: number;
}

export interface WordCandidate {
  /** Ordered identity, never inferred from text or randomized. */
  id: string;
  label: string;
}

export interface TokenChoiceScene extends TechnologyStory {
  kind: 'token-choice';
  preset: (typeof INFERENCE_PRESETS)['token-choice'][number];
  sentence: string;
  /** Two or three alternatives remain identifiable after one is selected. */
  candidates: WordCandidate[];
  selectedId: string;
  nextCandidates: WordCandidate[];
  candidateEvidence: InferenceEvidence;
  selectionEvidence: InferenceEvidence;
  nextEvidence: InferenceEvidence;
  /** Required for uncertain-choice; exact source qualifier, not a confidence score. */
  uncertainty?: string;
}

export type ExpertRole = 'language' | 'math' | 'vision' | 'code';
export interface InferenceExpert {
  id: string;
  label: string;
  role: ExpertRole;
  selected: boolean;
  /** Selection or explicit nonselection, bound to this expert and the named task. */
  evidence: InferenceEvidence;
  /** Only selected experts contribute; contribution must return to this same task. */
  contribution?: string;
  returnEvidence?: InferenceEvidence;
}

export interface ExpertSelectionScene extends TechnologyStory {
  kind: 'expert-selection';
  preset: (typeof INFERENCE_PRESETS)['expert-selection'][number];
  /** Two or three experts, including at least one explicitly inactive expert. */
  experts: InferenceExpert[];
}

export interface EdgeCloudScene extends TechnologyStory {
  kind: 'edge-cloud';
  preset: (typeof INFERENCE_PRESETS)['edge-cloud'][number];
  device: 'phone' | 'camera';
  localWork: string;
  localResult: string;
  localEvidence: InferenceEvidence;
  localResultEvidence: InferenceEvidence;
  /** Absent for local-processing: absence illustrates only this work, not total privacy. */
  remote?: {
    service: string;
    work: string;
    result: string;
    sendEvidence: InferenceEvidence;
    returnEvidence: InferenceEvidence;
  };
}

export type InferenceScene = TokenChoiceScene | ExpertSelectionScene | EdgeCloudScene;
