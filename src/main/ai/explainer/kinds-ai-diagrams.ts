import type {
  InferenceTradeoffScene,
  TokenAttentionScene,
} from '../../remotion/compositions/explainer/ai-systems/types';
import { DIAGRAM_LAYOUTS } from '../../remotion/compositions/explainer/diagrams/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import { parseInferenceTradeoff, parseTokenAttention } from './ai-diagram-contract';

export const inferenceTradeoffSpec = {
  kind: 'inference-tradeoff',
  family: 'compare',
  layouts: DIAGRAM_LAYOUTS,
  durationSec: [5, 12],
  describe:
    'Compare source-stated model cost, latency and task score on the same task and basis. Unknown stays unknown; a constraint choice is task/budget specific, not a universal winner.',
  schema:
    '{"kind":"inference-tradeoff","preset":"measured-comparison|constraint-choice","visualMode":"diagram","label":"Model tradeoffs","subject":"Model A","outcome":"No universal winner","evidence":"illustrative","models":[{"id":"a","label":"Model A"},{"id":"b","label":"Model B"}],"task":"sorting","basis":"one test","metrics":[{"kind":"cost","unit":"USD/task","values":[{"modelId":"a","measurement":{"state":"measured","value":2,"unit":"USD/task"}},{"modelId":"b","measurement":{"state":"measured","value":1,"unit":"USD/task"}}]},{"kind":"latency","unit":"ms/task","values":[{"modelId":"a","measurement":{"state":"measured","value":100,"unit":"ms/task"}},{"modelId":"b","measurement":{"state":"measured","value":200,"unit":"ms/task"}}]},{"kind":"score","unit":"score/100","values":[{"modelId":"a","measurement":{"state":"unknown"}},{"modelId":"b","measurement":{"state":"unknown"}}]}],"setupWord":0,"actionWord":14,"responseWord":25,"checkWord":36,"resolveWord":47}',
  limits:
    '2–3 models; exactly cost/latency/score, including unknowns. Titles 48, actors/task/basis 28, outcome 54, condition 96. Five local source beats, 5–12s, 0.8s final hold. Setup names models and says Both/All models run TASK on BASIS. Action/response/check: MODEL cost/latency/score is VALUE UNIT or is not stated. Explicit units USD/task, EUR/task, GBP/task, ms/task, score/100; bounded nonnegative values, at most 2 decimals, score ≤100. Optional repeated task/basis must agree. Constraint: {metric:cost|latency,maximum,unit,selectedId}; resolve MODEL fits MAX UNIT budget for TASK and quote MODEL fits the stated budget. Otherwise No universal winner / Tradeoffs depend on the task. Hypothetical examples remain illustrative.',
  triggers: [
    /\b(?:model|inference)\b.{0,100}\b(?:cost|latency|tradeoffs?|benchmark)\b/i,
    /\b(?:cost|latency)\b.{0,100}\b(?:task score|model|benchmark)\b/i,
  ],
  avoid:
    'Not a generic model evaluation, invented telemetry, mismatched benchmarks, converted currencies or universal ranking.',
  parse: parseInferenceTradeoff,
  cues: (scene: InferenceTradeoffScene): SceneCue[] => [
    { kind: 'tick', at: scene.actionAt, gain: 0.25 },
    { kind: 'tick', at: scene.responseAt, gain: 0.25 },
    { kind: 'tick', at: scene.checkAt, gain: 0.25 },
  ],
} as const;

export const tokenAttentionSpec = {
  kind: 'token-attention',
  family: 'framework',
  layouts: DIAGRAM_LAYOUTS,
  durationSec: [5, 12],
  describe:
    'Illustrate an explicitly stated word-reference/context link in a short source sentence. No attention weights, heatmap or claim to measure a named model.',
  schema:
    '{"kind":"token-attention","preset":"reference-link|context-link","visualMode":"diagram","label":"Word attention","subject":"Maya","outcome":"Words use earlier context","evidence":"illustrative","sentence":"Maya opened her shop. It sells bread.","targetIndex":4,"contextIndex":3,"setupWord":0,"actionWord":12,"responseWord":18,"checkWord":28,"resolveWord":36}',
  limits:
    'Title 48, subject 34, outcome 54, condition 96. Five source clause-start beats, 5–12s, 0.8s final hold. Exact setup sentence 2–12 whitespace word tiles, token length ≤16, sentence ≤150. Target/context zero-based sentence positions, context earlier, selected words unambiguous. Action: Select/Highlight TARGET. Response: TARGET refers to/points back to CONTEXT (reference) or TARGET uses CONTEXT as context (context). Resolve: Words use earlier context / The link supplies context. Persistent illustrative treatment required.',
  triggers: [
    /\b(?:attention|reference|pronoun)\b.{0,100}\b(?:word|token|sentence|context|refers?)\b/i,
    /\b(?:refers to|points back to)\b/i,
  ],
  avoid:
    'Not retrieval, context-window limits or token-choice probabilities. Never measured model activations.',
  parse: parseTokenAttention,
  cues: (scene: TokenAttentionScene): SceneCue[] => [
    { kind: 'tick', at: scene.actionAt, gain: 0.3 },
    { kind: 'slide', at: scene.responseAt, gain: 0.3 },
  ],
} as const;
