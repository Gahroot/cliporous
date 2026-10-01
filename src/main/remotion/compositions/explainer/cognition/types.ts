import type { TechnologyStory } from '../technology/types';

export const COGNITION_PRESETS = {
  'agent-team': ['parallel-specialists', 'contractor-crew'],
  'agent-plan': ['replan', 'fixed-vs-adaptive'],
  'agent-budget': ['stop', 'request-more'],
  'model-training': ['train-then-use', 'examples-correction'],
  'model-evaluation': ['same-tests', 'tradeoffs'],
  'evidence-conflict': ['unresolved', 'human-review'],
} as const;

export const COGNITION_KINDS = [
  'agent-team',
  'agent-plan',
  'agent-budget',
  'model-training',
  'model-evaluation',
  'evidence-conflict',
] as const satisfies readonly (keyof typeof COGNITION_PRESETS)[];

export interface AgentTeamScene extends TechnologyStory {
  kind: 'agent-team';
  preset: (typeof COGNITION_PRESETS)['agent-team'][number];
  /** Two or three distinct source-backed specialists, not an implied team size statistic. */
  roles: string[];
}

export interface AgentPlanScene extends TechnologyStory {
  kind: 'agent-plan';
  preset: (typeof COGNITION_PRESETS)['agent-plan'][number];
  obstacleLabel: string;
  revisedLabel: string;
}

export interface AgentBudgetScene extends TechnologyStory {
  kind: 'agent-budget';
  preset: (typeof COGNITION_PRESETS)['agent-budget'][number];
  resourceLabel: string;
  actionLabel: string;
}

export interface ModelTrainingScene extends TechnologyStory {
  kind: 'model-training';
  preset: (typeof COGNITION_PRESETS)['model-training'][number];
  exampleLabel: string;
  inputLabel: string;
}

export interface ModelEvaluationScene extends TechnologyStory {
  kind: 'model-evaluation';
  preset: (typeof COGNITION_PRESETS)['model-evaluation'][number];
  /** Exactly two approaches and two criteria; do not manufacture numerical scores. */
  approaches: string[];
  criteria: string[];
}

export interface EvidenceConflictScene extends TechnologyStory {
  kind: 'evidence-conflict';
  preset: (typeof COGNITION_PRESETS)['evidence-conflict'][number];
  /** Exactly two source names and their conflicting claims. */
  sources: string[];
  claims: string[];
}

export type CognitionScene =
  | AgentTeamScene
  | AgentPlanScene
  | AgentBudgetScene
  | ModelTrainingScene
  | ModelEvaluationScene
  | EvidenceConflictScene;
