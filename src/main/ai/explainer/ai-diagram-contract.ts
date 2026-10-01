import type {
  ComparisonMetric,
  InferenceTradeoffScene,
  TokenAttentionScene,
} from '../../remotion/compositions/explainer/ai-systems/types';
import { businessClaims, escaped, quantityPattern } from './concept-business-operations-contract';
import { actorPattern, distinctActors, financeActor, financeClaim } from './finance-contract';
import { hybridPhrase, hybridStory, includesPhrase, onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

const METRIC_UNITS = {
  cost: ['USD/task', 'EUR/task', 'GBP/task'],
  latency: ['ms/task'],
  score: ['score/100'],
} as const;
function metricValue(value: unknown, kind: ComparisonMetric['kind']): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= (kind === 'score' ? 100 : 1_000_000) &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-7
    ? value
    : null;
}
export function parseInferenceTradeoff(raw: Rec, ctx: ParseContext): InferenceTradeoffScene | null {
  const parsed = hybridStory(raw, ctx, ['models', 'task', 'basis', 'metrics', 'constraint']);
  if (!parsed) return null;
  const preset = raw.preset;
  if (preset !== 'measured-comparison' && preset !== 'constraint-choice')
    return mechanismIssue(ctx, 'unsupported model comparison preset');
  if (!Array.isArray(raw.models) || raw.models.length < 2 || raw.models.length > 3)
    return mechanismIssue(ctx, 'compare two or three explicitly named models');
  const models = raw.models
    .map((model) => financeActor(model, ctx))
    .flatMap((model) => (model ? [model] : []));
  const task = hybridPhrase(raw.task, ctx, 28),
    basis = hybridPhrase(raw.basis, ctx, 28);
  if (
    models.length !== raw.models.length ||
    !distinctActors(models) ||
    !task ||
    !basis ||
    models.some((model) => !includesPhrase(parsed.spans.setup, model.label)) ||
    !financeClaim(
      parsed.spans.setup,
      `(?:Both|All) models (?:run|perform) ${escaped(task)} (?:on|with) ${escaped(basis)}`,
      parsed.story.condition,
    )
  )
    return mechanismIssue(
      ctx,
      'all models need the same source-stated task and measurement basis in setup',
    );
  if (!Array.isArray(raw.metrics) || raw.metrics.length !== 3)
    return mechanismIssue(
      ctx,
      'include cost, latency and score; unstated metrics are explicitly unknown',
    );
  const metrics: ComparisonMetric[] = [];
  for (const entry of raw.metrics) {
    if (!isRec(entry) || !onlyFields(entry, ['kind', 'unit', 'values'], ctx)) return null;
    const kind = entry.kind;
    if (kind !== 'cost' && kind !== 'latency' && kind !== 'score')
      return mechanismIssue(ctx, 'only cost, latency and score are supported');
    const unit = METRIC_UNITS[kind].find((unit) => unit === entry.unit);
    if (
      !unit ||
      metrics.some((metric) => metric.kind === kind) ||
      !Array.isArray(entry.values) ||
      entry.values.length !== models.length
    )
      return mechanismIssue(
        ctx,
        'each metric has one compatible explicit unit and one value/state per model',
      );
    const values: ComparisonMetric['values'] = [];
    const span =
      kind === 'cost'
        ? parsed.spans.action
        : kind === 'latency'
          ? parsed.spans.response
          : parsed.spans.check;
    for (const [i, rawValue] of entry.values.entries()) {
      const model = models[i];
      if (
        !isRec(rawValue) ||
        !onlyFields(rawValue, ['modelId', 'measurement'], ctx) ||
        rawValue.modelId !== model.id ||
        !isRec(rawValue.measurement)
      )
        return mechanismIssue(
          ctx,
          'metric values must retain model identity and ordered bounded states',
        );
      const measurement = rawValue.measurement;
      if (measurement.state === 'unknown' && onlyFields(measurement, ['state'], ctx)) {
        if (
          !businessClaims(span).some((claim) =>
            new RegExp(
              `^${actorPattern(model)} ${kind} is (?:not stated|unknown)[.\\s]*$`,
              'i',
            ).test(claim),
          )
        )
          return mechanismIssue(ctx, 'unknown metric needs a source-stated unknown, never a zero');
        values.push({ modelId: model.id, measurement: { state: 'unknown' } });
      } else if (
        measurement.state === 'measured' &&
        onlyFields(measurement, ['state', 'value', 'unit'], ctx)
      ) {
        const value = metricValue(measurement.value, kind);
        if (
          value === null ||
          measurement.unit !== unit ||
          !financeClaim(
            span,
            `${actorPattern(model)} ${kind} is ${quantityPattern(value, unit)}(?: for ${escaped(task)} (?:on|with) ${escaped(basis)})?`,
            parsed.story.condition,
          )
        )
          return mechanismIssue(
            ctx,
            'metric must bind model, value, compatible unit and common task/basis in its local beat',
          );
        values.push({ modelId: model.id, measurement: { state: 'measured', value, unit } });
      } else
        return mechanismIssue(
          ctx,
          'metric states are measured or unknown, never invented estimates',
        );
    }
    metrics.push({ kind, unit, values });
  }
  metrics.sort(
    (a, b) =>
      ['cost', 'latency', 'score'].indexOf(a.kind) - ['cost', 'latency', 'score'].indexOf(b.kind),
  );
  let constraint: InferenceTradeoffScene['constraint'] = null;
  if (preset === 'constraint-choice') {
    if (
      !isRec(raw.constraint) ||
      !onlyFields(raw.constraint, ['metric', 'maximum', 'unit', 'selectedId'], ctx) ||
      (raw.constraint.metric !== 'cost' && raw.constraint.metric !== 'latency')
    )
      return mechanismIssue(
        ctx,
        'constraint choice needs an explicit cost/latency budget and source-selected model',
      );
    const rule = raw.constraint;
    const metric = metrics.find((metric) => metric.kind === rule.metric);
    const selected = models.find((model) => model.id === rule.selectedId);
    const maximum = metricValue(raw.constraint.maximum, raw.constraint.metric);
    const measurement = metric?.values.find((v) => v.modelId === selected?.id)?.measurement;
    if (
      !metric ||
      !selected ||
      maximum === null ||
      raw.constraint.unit !== metric.unit ||
      measurement?.state !== 'measured' ||
      measurement.value > maximum ||
      !financeClaim(
        parsed.spans.resolve,
        `${actorPattern(selected)} fits (?:the )?${quantityPattern(maximum, metric.unit)} budget for ${escaped(task)}`,
        parsed.story.condition,
      ) ||
      parsed.story.outcome !== `${selected.label} fits the stated budget`
    )
      return mechanismIssue(
        ctx,
        'selection must meet a compatible stated budget on this task; no universal winner',
      );
    constraint = {
      metric: raw.constraint.metric,
      maximum,
      unit: metric.unit,
      selectedId: selected.id,
    };
  } else if (
    raw.constraint != null ||
    !/^(?:No universal winner|Tradeoffs depend on the task)$/i.test(parsed.story.outcome)
  )
    return mechanismIssue(ctx, 'ordinary comparison must not manufacture a winner');
  return {
    kind: 'inference-tradeoff',
    preset,
    ...parsed.story,
    models,
    task,
    basis,
    metrics,
    constraint,
  };
}

export function parseTokenAttention(raw: Rec, ctx: ParseContext): TokenAttentionScene | null {
  const parsed = hybridStory(raw, ctx, ['sentence', 'targetIndex', 'contextIndex']);
  if (!parsed) return null;
  const preset = raw.preset;
  if (preset !== 'reference-link' && preset !== 'context-link')
    return mechanismIssue(ctx, 'unsupported attention illustration preset');
  if (parsed.story.evidence !== 'illustrative')
    return mechanismIssue(
      ctx,
      'attention relationships are illustrative, never fake measured telemetry',
    );
  const sentence = hybridPhrase(raw.sentence, ctx, 150);
  if (!sentence || !includesPhrase(parsed.spans.setup, sentence))
    return mechanismIssue(ctx, 'the exact short source sentence must be present in setup');
  const text = sentence.split(/\s+/);
  if (text.length < 2 || text.length > 12 || text.some((token) => token.length > 16))
    return mechanismIssue(
      ctx,
      'sentence must fit 2–12 tokens, each at most 16 characters; simplify the source excerpt',
    );
  const targetIndex = raw.targetIndex,
    contextIndex = raw.contextIndex;
  if (
    typeof targetIndex !== 'number' ||
    typeof contextIndex !== 'number' ||
    !Number.isInteger(targetIndex) ||
    !Number.isInteger(contextIndex) ||
    contextIndex < 0 ||
    targetIndex >= text.length ||
    contextIndex >= targetIndex
  )
    return mechanismIssue(
      ctx,
      'link the selected token to a valid earlier token, not an arbitrary coordinate',
    );
  const clean = (word: string): string => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const target = clean(text[targetIndex]),
    context = clean(text[contextIndex]);
  if (
    !target ||
    !context ||
    text.filter((word) => clean(word).toLowerCase() === target.toLowerCase()).length !== 1 ||
    text.filter((word) => clean(word).toLowerCase() === context.toLowerCase()).length !== 1
  )
    return mechanismIssue(ctx, 'selected words must be unambiguous in the short illustration');
  if (
    !financeClaim(
      parsed.spans.action,
      `(?:Select|Highlight|Focus on) ${escaped(target)}(?: as (?:the )?target)?`,
      parsed.story.condition,
    ) ||
    !financeClaim(
      parsed.spans.response,
      preset === 'reference-link'
        ? `${escaped(target)} (?:refers to|points back to) ${escaped(context)}(?: in this illustration)?`
        : `${escaped(target)} uses ${escaped(context)} as context(?: in this illustration)?`,
      parsed.story.condition,
    )
  )
    return mechanismIssue(
      ctx,
      'the selected source word and its earlier relationship need explicit local action/response evidence',
    );
  if (!/^(?:Words use earlier context|The link supplies context)$/i.test(parsed.story.outcome))
    return mechanismIssue(
      ctx,
      'attention illustration cannot prove understanding, truth or a named model behavior',
    );
  return {
    kind: 'token-attention',
    preset,
    ...parsed.story,
    sentence,
    tokens: text.map((word, i) => ({ id: `token-${i}`, text: word })),
    targetIndex,
    contextIndex,
  };
}
