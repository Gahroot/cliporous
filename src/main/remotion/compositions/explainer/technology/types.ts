/** Authored, React-free contracts. Every ...At value is an absolute beat in seconds. */
export const TECHNOLOGY_PRESETS = {
  'agent-workflow': ['tool-success', 'tool-retry', 'approval-gate'],
  'retrieval-grounding': ['evidence-found', 'no-evidence', 'two-sources'],
  'context-window': ['overflow', 'summarisation', 'memory-retrieval'],
  'software-release': ['fix-pass', 'regression-rollback', 'parallel-release'],
  'request-routing': ['cache-hit', 'cache-miss', 'timeout-fallback'],
} as const;

export type TechnologyKind = keyof typeof TECHNOLOGY_PRESETS;
export type TechnologyStatus = 'waiting' | 'active' | 'passed' | 'blocked';
export const TECHNOLOGY_KINDS = [
  'agent-workflow',
  'retrieval-grounding',
  'context-window',
  'software-release',
  'request-routing',
] as const satisfies readonly TechnologyKind[];

export const TECHNOLOGY_LIMITS = {
  minDuration: 5,
  maxDuration: 12,
  minGaps: [0.6, 1, 1, 1],
  finalHold: 0.8,
  label: 32,
  subject: 24,
  outcome: 40,
  condition: 56,
  actorLabel: 22,
  excerpt: 40,
} as const;

export const TECHNOLOGY_LAYOUTS = ['stack', 'stack-flipped', 'takeover', 'over'] as const;
export const TECHNOLOGY_WORD_FIELDS = [
  'setupWord',
  'actionWord',
  'responseWord',
  'checkWord',
  'resolveWord',
] as const;
export type TechnologyWordField = (typeof TECHNOLOGY_WORD_FIELDS)[number];

export interface TechnologyBeats {
  setupAt: number;
  actionAt: number;
  responseAt: number;
  checkAt: number;
  resolveAt: number;
}

export interface TechnologyStory extends TechnologyBeats {
  label: string;
  /** Identity retained by the primary moving actor. */
  subject: string;
  outcome: string;
  /** Exact source condition; required for conditional rather than observed outcomes. */
  condition?: string;
}

export interface AgentWorkflowScene extends TechnologyStory {
  kind: 'agent-workflow';
  preset: (typeof TECHNOLOGY_PRESETS)['agent-workflow'][number];
  toolLabel: string;
  /** Opt-in only for approval-gate; omission retains historical clay appearance. */
  visualMode?: 'diagram' | 'hybrid';
}

export interface RetrievalGroundingScene extends TechnologyStory {
  kind: 'retrieval-grounding';
  preset: (typeof TECHNOLOGY_PRESETS)['retrieval-grounding'][number];
  /** Zero for no-evidence, one for evidence-found, two for two-sources. */
  sources: { label: string; excerpt: string }[];
}

export interface ContextWindowScene extends TechnologyStory {
  kind: 'context-window';
  preset: (typeof TECHNOLOGY_PRESETS)['context-window'][number];
  detailLabel: string;
  memoryLabel: string;
  /** Source-backed replacement, only for summarisation. */
  summaryLabel?: string;
}

export interface SoftwareReleaseScene extends TechnologyStory {
  kind: 'software-release';
  preset: (typeof TECHNOLOGY_PRESETS)['software-release'][number];
  /** One check, or exactly two named checks for the parallel join. */
  checkLabels: string[];
  /** Required for rollback; never invent a version. */
  previousVersion?: string;
}

export interface RequestRoutingScene extends TechnologyStory {
  kind: 'request-routing';
  preset: (typeof TECHNOLOGY_PRESETS)['request-routing'][number];
  serviceLabel: string;
  /** Required only for the explicitly supported fallback branch. */
  fallbackLabel?: string;
}

export type TechnologyScene =
  | AgentWorkflowScene
  | RetrievalGroundingScene
  | ContextWindowScene
  | SoftwareReleaseScene
  | RequestRoutingScene;

/** All family coordinates are authored on the existing virtual stage, not supplied by AI. */
export const TECHNOLOGY_STAGE = {
  width: 1080,
  height: 960,
  left: 64,
  right: 1016,
  contentTop: 200,
  contentBottom: 790,
  outcomeTop: 818,
} as const;
