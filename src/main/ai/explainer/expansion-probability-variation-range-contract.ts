/** Step 9 stories 13–14; finite source values, not a statistical evaluator or runtime registry. */
import type {
  ExpansionQualifiedIntervalScene,
  ExpansionRepeatedSamplesScene,
  ExpansionSampleRecord,
} from '../../remotion/compositions/explainer/expansion/probability/variation-range-types';
import type { ExpansionEntity } from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  add,
  compare,
  compatibleBasis,
  rational,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  EXPANSION_LIMITS,
  type ExpansionEvidenceSpan,
  type ExpansionQuantity,
  type ExpansionRational,
} from '../../remotion/compositions/explainer/expansion/value-types';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import {
  type ExpansionSourceEvidence,
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
  expansionStoryBase,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

const BEATS = ['setup', 'action', 'response', 'check', 'resolve'] as const;
function canonical(text: string): string {
  return text.normalize('NFKC').replace(/’/g, "'").replace(/−/g, '-').replace(/\s+/g, ' ').trim();
}
function literal(text: string): string {
  return canonical(text)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function equalLabel(a: string, b: string): boolean {
  return canonical(a).toLowerCase() === canonical(b).toLowerCase();
}
function equalSpan(a: ExpansionEvidenceSpan, b: ExpansionEvidenceSpan): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}
/** Entire authored clause only. Every interpolated source label/qualifier is escaped. */
function clause(evidence: ExpansionSourceEvidence, body: string): boolean {
  const source = evidence.text;
  if (
    /[<>`]|https?:\/\/|www\./i.test(source) ||
    [...source].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return false;
  const text = canonical(source)
    .replace(/[.;][”"’')\]]*$/, '')
    .trim();
  return (
    text.split(/\s+/).length <= EXPANSION_LIMITS.evidenceWords &&
    new RegExp(`^(?:${body})$`, 'iu').test(text)
  );
}
function ref(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  const label = ctx.str(raw, EXPANSION_LIMITS.actorLabel);
  return (
    (label ? entities.find((entity) => equalLabel(entity.label, label)) : undefined) ??
    mechanismIssue(
      ctx,
      'references must be declared source entity labels, not supplied IDs or aliases',
    )
  );
}
function beatEvidence(
  raw: unknown,
  expected: ExpansionSourceEvidence,
  ctx: ParseContext,
): ExpansionSourceEvidence | null {
  const evidence = expansionSourceSpan(raw, ctx);
  return evidence && equalSpan(evidence.span, expected.span)
    ? evidence
    : mechanismIssue(ctx, 'semantic evidence must retain this complete local beat clause');
}
function envelope(raw: Rec, ctx: ParseContext, id: '13' | '14', fields: readonly string[]) {
  const base = expansionStoryBase(raw, ctx, id, ['entities', 'population', ...fields]);
  if (!base) return null;
  const { treatment, ...story } = base.story;
  if (treatment !== undefined)
    return mechanismIssue(ctx, 'these presets have no supported treatment');
  const local: ExpansionSourceEvidence[] = [];
  for (const beat of BEATS) {
    const index = ctx.inWin(raw[`${beat}Word`]);
    if (index === null) return null;
    const evidence = expansionSourceSpan(
      { fromWord: index, toWord: index + base.spans[beat].split(/\s+/).length - 1 },
      ctx,
    );
    if (!evidence)
      return mechanismIssue(ctx, 'five distinct complete clause-start beats are required');
    local.push(evidence);
  }
  const [setup, action, response, check, resolve] = local;
  if (!setup || !action || !response || !check || !resolve) return null;
  const entities = expansionEntities(raw.entities, ctx, id);
  if (
    !entities ||
    !isRec(raw.population) ||
    !onlyFields(raw.population, ['entity', 'period', 'evidence'], ctx)
  )
    return null;
  const population = ref(raw.population.entity, entities, ctx);
  const populationEvidence = beatEvidence(raw.population.evidence, setup, ctx);
  const period = populationEvidence
    ? expansionSourceLabel(raw.population.period, populationEvidence, ctx, EXPANSION_LIMITS.period)
    : null;
  if (!population || !populationEvidence || !period || !equalSpan(population.evidence, setup.span))
    return mechanismIssue(
      ctx,
      'population identity and period must be explicitly introduced by the local setup clause',
    );
  return {
    story,
    entities,
    population,
    period,
    beats: { setup, action, response, check, resolve },
  };
}
function list(labels: readonly string[]): string {
  if (labels.length === 1) return literal(labels[0] ?? '');
  if (labels.length === 2)
    return `${literal(labels[0] ?? '')}\\s+and\\s+${literal(labels[1] ?? '')}`;
  return `${labels.slice(0, -1).map(literal).join(',\\s*')},?\\s+and\\s+${literal(labels[labels.length - 1] ?? '')}`;
}
function populationPeriod(population: string, period: string): string {
  return `(?:from|among|for)\\s+${literal(population)}\\s+(?:during|in|for)\\s+${literal(period)}`;
}
function contextual(body: string, population: string, period: string): string {
  const place = `(?:during|in|for)\\s+${literal(period)}\\s+(?:among|for)\\s+${literal(population)}`;
  const reversed = `(?:among|for)\\s+${literal(population)}\\s+(?:during|in|for)\\s+${literal(period)}`;
  return `(?:${body}\\s+${place}|${body}\\s+${reversed}|${place},\\s*${body}|${reversed},\\s*${body})`;
}
function quantityMagnitude(
  quantity: ExpansionQuantity,
  ctx: ParseContext,
): ExpansionRational | null {
  if (!('amount' in quantity))
    return mechanismIssue(
      ctx,
      'unknown/missing/disputed endpoints are not zero or an ordered measured value',
    );
  if (quantity.amount.kind === 'rational') return quantity.amount.value;
  const value = rational(quantity.amount.value.minorUnits, 100);
  return value.ok
    ? value.value
    : mechanismIssue(ctx, 'money endpoints must retain exact bounded minor units');
}
function quantityInPopulation(
  quantity: ExpansionQuantity,
  population: ExpansionEntity,
  period: string,
  ctx: ParseContext,
): boolean {
  if (
    !equalLabel(quantity.basis.population, population.label) ||
    !equalLabel(quantity.basis.period, period)
  ) {
    mechanismIssue(
      ctx,
      'every value must bind this exact population and period in its own local assertion',
    );
    return false;
  }
  if (
    ['count', 'ratio', 'percent', 'percentage-point', 'percent-change'].includes(
      quantity.basis.unit,
    ) &&
    !quantity.basis.denominator
  ) {
    mechanismIssue(
      ctx,
      'count/proportion endpoints require an explicit common positive source denominator',
    );
    return false;
  }
  return true;
}
function teachingPrefix(body: string, qualifier?: string): string {
  return qualifier ? `(?:in\\s+this|in\\s+the)\\s+${literal(qualifier)},\\s*${body}` : body;
}

/**
 * Raw: entities:{label,evidence}[]; population:{entity:label,period,evidence};
 * samples:[{entity:label,quantity:ExpansionQuantity raw}]; meaning:{qualification,evidence};
 * resolutionEvidence. Quantities are explicit count assertions, not generated draws.
 */
export function parseExpansionRepeatedSamples(
  raw: Rec,
  ctx: ParseContext,
): ExpansionRepeatedSamplesScene | null {
  const base = envelope(raw, ctx, '13', ['samples', 'meaning', 'resolutionEvidence']);
  if (!base) return null;
  const { story, entities, population, period, beats } = base;
  if (story.condition !== undefined)
    return mechanismIssue(
      ctx,
      'repeated-samples needs supplied counts or an explicit teaching set, not hypothetical observed samples',
    );
  if (
    !Array.isArray(raw.samples) ||
    raw.samples.length < 2 ||
    raw.samples.length > EXPANSION_LIMITS.records
  )
    return mechanismIssue(
      ctx,
      'include two to twelve finite supplied sample records; never generate or truncate a sample set',
    );
  const samples: ExpansionSampleRecord[] = [];
  const sampleLabels: string[] = [];
  const values: ExpansionRational[] = [];
  const seen = new Set<string>();
  let markBudget = { numerator: 0, denominator: 1 };
  let teachingQualifier: string | undefined;
  let teachingState: 'illustrative' | 'simulated' | undefined;
  for (const [index, entry] of raw.samples.entries()) {
    if (!isRec(entry) || !onlyFields(entry, ['entity', 'quantity'], ctx)) return null;
    const entity = ref(entry.entity, entities, ctx);
    const quantity = parseExpansionQuantity(entry.quantity, ctx);
    if (
      !entity ||
      !quantity ||
      entity.id === population.id ||
      seen.has(entity.id) ||
      !equalLabel(quantity.actor, entity.label) ||
      !equalSpan(entity.evidence, quantity.evidence)
    )
      return mechanismIssue(
        ctx,
        'each sample identity must be distinct and own its exact complete source quantity clause',
      );
    if (
      !quantityInPopulation(quantity, population, period, ctx) ||
      quantity.basis.unit !== 'count' ||
      !quantity.basis.denominator ||
      quantity.basis.denominator.denominator !== 1
    )
      return mechanismIssue(
        ctx,
        'samples require explicit integer count denominators on their shared population/period',
      );
    if (
      quantity.evidence.fromWord < beats.action.span.fromWord ||
      quantity.evidence.toWord >= beats.check.span.fromWord
    )
      return mechanismIssue(
        ctx,
        'sample quantities must occur in the complete action/response phase, not another story beat',
      );
    if (
      quantity.state !== 'known' &&
      quantity.state !== 'illustrative' &&
      quantity.state !== 'simulated'
    )
      return mechanismIssue(
        ctx,
        'absent, disputed or conditional samples cannot become supplied observations or zero counts',
      );
    if (story.evidence === 'source-stated' && quantity.state !== 'known')
      return mechanismIssue(
        ctx,
        'teaching/simulation quantities must remain visibly illustrative, never measured samples',
      );
    if (story.evidence === 'illustrative') {
      if (quantity.state === 'known')
        return mechanismIssue(
          ctx,
          'every teaching sample must retain its own source illustrative/simulated qualification',
        );
      if (
        teachingQualifier !== undefined &&
        (!equalLabel(teachingQualifier, quantity.qualifier) || teachingState !== quantity.state)
      )
        return mechanismIssue(
          ctx,
          'do not merge simulated and illustrative samples or change their teaching qualification',
        );
      teachingQualifier = quantity.qualifier;
      teachingState = quantity.state;
    }
    const value = quantityMagnitude(quantity, ctx);
    const lower = value ? compare(value, { numerator: 0, denominator: 1 }) : null;
    const upper = value ? compare(value, quantity.basis.denominator) : null;
    if (
      !value ||
      value.denominator !== 1 ||
      !lower?.ok ||
      lower.value < 0 ||
      !upper?.ok ||
      upper.value > 0
    )
      return mechanismIssue(
        ctx,
        'sample successes must be explicit nonnegative integer counts within their supplied denominator',
      );
    const budget = add(markBudget, quantity.basis.denominator);
    const cap = budget.ok
      ? compare(budget.value, { numerator: EXPANSION_LIMITS.populationMarks, denominator: 1 })
      : null;
    if (!budget.ok || !cap?.ok || cap.value > 0)
      return mechanismIssue(
        ctx,
        'the entire finite sample set may display at most 100 denominator marks',
      );
    markBudget = budget.value;
    const first = samples[0]?.quantity;
    if (
      first &&
      (!compatibleBasis(first.basis, quantity.basis) || !equalLabel(first.claim, quantity.claim))
    )
      return mechanismIssue(
        ctx,
        'sample comparisons require the identical claim, unit, period, population and denominator',
      );
    seen.add(entity.id);
    sampleLabels.push(entity.label);
    values.push(value);
    samples.push({ id: `expansion-13-sample-${index}`, entityId: entity.id, quantity });
  }
  if (
    entities.length !== samples.length + 1 ||
    !equalLabel(story.subject, population.label) ||
    !samples.some((sample) => equalSpan(sample.quantity.evidence, beats.action.span)) ||
    !samples.some((sample) => equalSpan(sample.quantity.evidence, beats.response.span))
  )
    return mechanismIssue(
      ctx,
      'only the named population and actual samples are allowed, with quantities at both source beats',
    );
  const names = list(sampleLabels);
  const scope = populationPeriod(population.label, period);
  const setupBody = `${literal(story.label)}\\s+(?:compares|examines|reviews|tracks)\\s+${names}\\s+${scope}`;
  if (!clause(beats.setup, teachingPrefix(setupBody, teachingQualifier)))
    return mechanismIssue(
      ctx,
      'setup must explicitly compare these named finite samples from this population and period',
    );
  if (!isRec(raw.meaning) || !onlyFields(raw.meaning, ['qualification', 'evidence'], ctx))
    return null;
  const meaningEvidence = beatEvidence(raw.meaning.evidence, beats.check, ctx);
  const qualification = meaningEvidence
    ? expansionSourceLabel(raw.meaning.qualification, meaningEvidence, ctx, 24)
    : null;
  if (
    qualification !== 'supplied samples' &&
    qualification !== 'illustrative samples' &&
    qualification !== 'teaching samples'
  )
    return mechanismIssue(
      ctx,
      'sample meaning must explicitly distinguish supplied observations from bounded teaching samples',
    );
  if (
    (story.evidence === 'source-stated') !== (qualification === 'supplied samples') ||
    !meaningEvidence ||
    !clause(meaningEvidence, `${names}\\s+are\\s+${literal(qualification)}\\s+${scope}`)
  )
    return mechanismIssue(
      ctx,
      'sample status and population ownership must be stated locally; no invented randomness, telemetry or confidence',
    );
  const resolutionEvidence = beatEvidence(raw.resolutionEvidence, beats.resolve, ctx);
  const result = contextual(
    'sample\\s+counts\\s+(?:vary|differ)\\s+across\\s+(?:the\\s+)?(?:supplied|illustrative|teaching)\\s+samples',
    population.label,
    period,
  );
  const firstValue = values[0];
  const differs =
    firstValue &&
    values.some((value) => {
      const comparison = compare(firstValue, value);
      return comparison.ok && comparison.value !== 0;
    });
  if (
    !resolutionEvidence ||
    !clause(resolutionEvidence, result) ||
    !differs ||
    !/\bsample counts (?:vary|differ)\b/i.test(story.outcome)
  )
    return mechanismIssue(
      ctx,
      'resolution must state only the supplied finite count variation, not infer a distribution or confidence',
    );
  return {
    ...story,
    storyId: '13',
    kind: 'probability-workbench',
    preset: 'repeated-samples',
    entities,
    populationId: population.id,
    period,
    samples,
    meaning: { qualification, evidence: meaningEvidence.span },
    resolutionEvidence: resolutionEvidence.span,
  };
}

const INTERVAL_MEANINGS = {
  range: /^(?:(?:a|the|an explicit|a stated) )?(?:range|possible range|range of possible values)$/i,
  bounds: /^(?:(?:the|a set of) )?(?:bounds|stated bounds|lower and upper bounds)$/i,
  estimate: /^(?:(?:an|the|a) )?(?:estimate|estimated range|approximate range)$/i,
  uncertain: /^(?:(?:an|the|a) )?(?:uncertain range|uncertain bounds|uncertain estimate)$/i,
};

/**
 * Raw: entities; population:{entity:label,period,evidence}; actor:label;
 * lower/upper:raw ExpansionQuantity with claims 'lower bound'/'upper bound';
 * meaning:{kind:'range'|'bounds'|'estimate'|'uncertain',qualification,evidence}; resolutionEvidence.
 * No confidence level, derived endpoint, density, distribution, geometry or style fields.
 */
export function parseExpansionQualifiedInterval(
  raw: Rec,
  ctx: ParseContext,
): ExpansionQualifiedIntervalScene | null {
  const base = envelope(raw, ctx, '14', [
    'actor',
    'lower',
    'upper',
    'meaning',
    'resolutionEvidence',
  ]);
  if (!base) return null;
  const { story, entities, population, period, beats } = base;
  const actor = ref(raw.actor, entities, ctx);
  const lower = parseExpansionQuantity(raw.lower, ctx);
  const upper = parseExpansionQuantity(raw.upper, ctx);
  if (
    !actor ||
    actor.id === population.id ||
    entities.length !== 2 ||
    !equalSpan(actor.evidence, beats.setup.span) ||
    !equalLabel(story.subject, actor.label) ||
    !lower ||
    !upper ||
    !equalLabel(lower.actor, actor.label) ||
    !equalLabel(upper.actor, actor.label) ||
    !equalLabel(lower.claim, 'lower bound') ||
    !equalLabel(upper.claim, 'upper bound') ||
    !equalSpan(lower.evidence, beats.action.span) ||
    !equalSpan(upper.evidence, beats.response.span)
  )
    return mechanismIssue(
      ctx,
      'one actor must own the explicit local lower/upper bound assertions on their separate source beats',
    );
  if (
    !quantityInPopulation(lower, population, period, ctx) ||
    !quantityInPopulation(upper, population, period, ctx) ||
    !compatibleBasis(lower.basis, upper.basis)
  )
    return mechanismIssue(
      ctx,
      'interval endpoints require identical source unit, period, population and denominator; no conversion or inferred basis',
    );
  const low = quantityMagnitude(lower, ctx);
  const high = quantityMagnitude(upper, ctx);
  const order = low && high ? compare(low, high) : null;
  if (!order?.ok || order.value > 0)
    return mechanismIssue(
      ctx,
      'supplied finite lower and upper endpoints must be ordered exactly, without swapping or rounding',
    );
  const states = [lower.state, upper.state];
  if (
    story.evidence === 'source-stated' &&
    states.some((state) => state === 'illustrative' || state === 'simulated')
  )
    return mechanismIssue(ctx, 'teaching/simulated bounds cannot become measured source endpoints');
  let teachingQualifier: string | undefined;
  if (story.evidence === 'illustrative') {
    if (
      (lower.state !== 'illustrative' && lower.state !== 'simulated') ||
      upper.state !== lower.state ||
      !('qualifier' in upper) ||
      !equalLabel(lower.qualifier, upper.qualifier)
    )
      return mechanismIssue(
        ctx,
        'both illustrative/simulated endpoints must keep the same explicit teaching state and qualifier',
      );
    teachingQualifier = lower.qualifier;
  }
  const conditional = [lower, upper].filter((quantity) => quantity.state === 'conditional');
  if (
    (story.condition !== undefined) !== conditional.length > 0 ||
    conditional.some(
      (quantity) =>
        quantity.state === 'conditional' &&
        (!story.condition || !equalLabel(quantity.condition, story.condition)),
    )
  )
    return mechanismIssue(
      ctx,
      'preserve an endpoint condition locally and in the envelope; never turn it into an unconditional measured bound',
    );
  const setup = `${literal(story.label)}\\s+(?:reviews|examines|tracks|describes)\\s+${literal(actor.label)}(?:'s)?\\s+interval\\s+${populationPeriod(population.label, period)}`;
  if (!clause(beats.setup, teachingPrefix(setup, teachingQualifier)))
    return mechanismIssue(
      ctx,
      'setup must actually introduce this actor interval, population and period',
    );
  if (!isRec(raw.meaning) || !onlyFields(raw.meaning, ['kind', 'qualification', 'evidence'], ctx))
    return null;
  const kind = raw.meaning.kind;
  if (kind !== 'range' && kind !== 'bounds' && kind !== 'estimate' && kind !== 'uncertain')
    return mechanismIssue(
      ctx,
      'source interval meaning must be range, bounds, estimate or uncertain; never invented statistical confidence',
    );
  const meaningEvidence = beatEvidence(raw.meaning.evidence, beats.check, ctx);
  const qualification = meaningEvidence
    ? expansionSourceLabel(
        raw.meaning.qualification,
        meaningEvidence,
        ctx,
        EXPANSION_LIMITS.qualifier,
      )
    : null;
  if (
    !meaningEvidence ||
    !qualification ||
    !INTERVAL_MEANINGS[kind].test(qualification) ||
    (conditional.length > 0 && kind !== 'uncertain') ||
    !clause(
      meaningEvidence,
      contextual(
        `${literal(actor.label)}(?:'s)?\\s+interval\\s+(?:is|represents)\\s+${literal(qualification)}`,
        population.label,
        period,
      ),
    )
  )
    return mechanismIssue(
      ctx,
      'explicit interval meaning must bind the actor and exact scope locally, preserving uncertainty rather than inventing confidence',
    );
  const resolutionEvidence = beatEvidence(raw.resolutionEvidence, beats.resolve, ctx);
  const finalQualification =
    conditional.length > 0
      ? 'conditional'
      : teachingQualifier
        ? lower.state === 'simulated'
          ? 'simulated'
          : 'illustrative'
        : literal(qualification);
  const final = `${literal(actor.label)}(?:'s)?\\s+interval\\s+(?:remains|stays)\\s+${finalQualification}`;
  if (
    !resolutionEvidence ||
    !clause(resolutionEvidence, contextual(final, population.label, period)) ||
    !clause(
      { span: resolutionEvidence.span, text: story.outcome },
      `(?:${literal(actor.label)}(?:'s)?\\s+)?interval\\s+(?:remains|stays)\\s+${finalQualification}`,
    )
  )
    return mechanismIssue(
      ctx,
      'resolve must retain the exact qualified interval meaning/state, not introduce certainty or a statistical interpretation',
    );
  return {
    ...story,
    storyId: '14',
    kind: 'uncertainty-range',
    preset: 'qualified-interval',
    entities,
    actorId: actor.id,
    populationId: population.id,
    period,
    lower,
    upper,
    meaning: { kind, qualification, evidence: meaningEvidence.span },
    resolutionEvidence: resolutionEvidence.span,
  };
}
