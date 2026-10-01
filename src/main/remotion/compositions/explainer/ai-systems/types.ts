import type { DiagramStory, Measurement } from '../diagrams/types';
import type { FinanceActor } from '../finance/types';
export const AI_DIAGRAM_PRESETS = {
  'token-attention': ['reference-link', 'context-link'],
  'inference-tradeoff': ['measured-comparison', 'constraint-choice'],
} as const;
export interface TokenAttentionScene extends DiagramStory {
  kind: 'token-attention';
  preset: (typeof AI_DIAGRAM_PRESETS)['token-attention'][number];
  sentence: string;
  tokens: { id: string; text: string }[];
  targetIndex: number;
  contextIndex: number;
}
export interface ComparisonMetric {
  kind: 'cost' | 'latency' | 'score';
  unit: 'USD/task' | 'EUR/task' | 'GBP/task' | 'ms/task' | 'score/100';
  values: { modelId: string; measurement: Measurement }[];
}
export interface InferenceTradeoffScene extends DiagramStory {
  kind: 'inference-tradeoff';
  preset: (typeof AI_DIAGRAM_PRESETS)['inference-tradeoff'][number];
  models: FinanceActor[];
  task: string;
  basis: string;
  metrics: ComparisonMetric[];
  constraint: {
    metric: 'cost' | 'latency';
    maximum: number;
    unit: ComparisonMetric['unit'];
    selectedId: string;
  } | null;
}
export type AiDiagramScene = TokenAttentionScene | InferenceTradeoffScene;
