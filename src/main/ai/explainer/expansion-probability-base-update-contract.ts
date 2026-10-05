/** Stories 09–10: bounded source-owned quantities and authored ratios, never a truth evaluator. */
import type {
  BaseRateRecordRole,
  BayesRatioDerivation,
  BayesUpdateRecordRole,
  ExpansionBaseRateScene,
  ExpansionBayesUpdateScene,
  ProbabilityBeatEvidence,
  ProbabilityQuantityRecord,
} from '../../remotion/compositions/explainer/expansion/probability/base-update-types';
import {
  type ExpansionEntity,
  expansionEntityId,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  add,
  compare,
  divide,
  isDerivationAllowed,
  multiply,
  subtract,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  EXPANSION_LIMITS,
  type ExpansionDerivedValue,
  type ExpansionEvidenceSpan,
  type ExpansionQuantity,
  type ExpansionRational,
} from '../../remotion/compositions/explainer/expansion/value-types';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import {
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
  expansionStoryBase,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

const ONE: ExpansionRational = { numerator: 1, denominator: 1 };
const HUNDRED: ExpansionRational = { numerator: 100, denominator: 1 };
const DISPLAY = { markCount: 100, aggregation: 'schematic-not-individual-counts' } as const;
const BEATS = ['setup', 'action', 'response', 'check', 'resolve'] as const;
function key(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/’/g, "'")
    .replace(/−/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
function literal(text: string): string {
  return key(text)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function named(text: string): string {
  return `(?:the\\s+)?${literal(text)}`;
}
function clause(text: string, body: string, condition?: string): boolean {
  if (/[<>`{}]|https?:\/\/|www\./i.test(text) || [...text].some((c) => c.charCodeAt(0) < 32))
    return false;
  const source = key(text)
    .replace(/[.;][”"’')\]]*$/, '')
    .trim();
  const full = condition
    ? `(?:${literal(condition)},\\s*${body}|${body},?\\s+${literal(condition)})`
    : body;
  return new RegExp(`^(?:${full})$`, 'i').test(source);
}
function terminal(text: string): boolean {
  return /[.!?;][”"’')\]]*$/.test(text);
}
function beatSpan(raw: unknown, ctx: ParseContext): ExpansionEvidenceSpan | null {
  const index = ctx.inWin(raw);
  if (index === null || !ctx.words[index])
    return mechanismIssue(ctx, 'beat must identify a source clause');
  let fromWord = index;
  let toWord = index;
  while (fromWord > ctx.win.startWord && !terminal(ctx.words[fromWord - 1]?.text ?? '')) fromWord--;
  while (toWord < ctx.win.endWord && !terminal(ctx.words[toWord]?.text ?? '')) toWord++;
  return expansionSourceSpan({ fromWord, toWord }, ctx)?.span ?? null;
}
function envelope(raw: Rec, ctx: ParseContext, id: '09' | '10') {
  const fields =
    id === '09'
      ? [
          'entities',
          'population',
          'subset',
          'selection',
          'representation',
          'records',
          'relationEvidence',
        ]
      : [
          'entities',
          'population',
          'hypothesis',
          'evidenceLabel',
          'complement',
          'records',
          'updateMode',
          'relationEvidence',
        ];
  const base = expansionStoryBase(raw, ctx, id, fields);
  if (!base) return null;
  const spans = BEATS.map((beat) => beatSpan(raw[`${beat}Word`], ctx));
  const [setup, action, response, check, resolve] = spans;
  if (!setup || !action || !response || !check || !resolve) return null;
  if (new Set(spans.map((span) => span?.fromWord)).size !== 5)
    return mechanismIssue(
      ctx,
      'five probability beats must refer to five distinct complete clauses',
    );
  const entities = expansionEntities(raw.entities, ctx, id);
  const relation = expansionSourceSpan(raw.relationEvidence, ctx);
  if (!entities || !relation) return null;
  const { treatment: _treatment, ...story } = base.story;
  const sourceSpans: ProbabilityBeatEvidence = { setup, action, response, check, resolve };
  return { story, spans: base.spans, entities, relation, sourceSpans };
}
function entity(
  raw: unknown,
  setup: string,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  const label = expansionSourceLabel(raw, setup, ctx, EXPANSION_LIMITS.actorLabel);
  return (
    (label ? entities.find((value) => key(value.label) === key(label)) : undefined) ??
    mechanismIssue(
      ctx,
      'population, subset, hypothesis and evidence references must be source-named entity labels, not IDs',
    )
  );
}
function exactEntities(
  entities: readonly ExpansionEntity[],
  owned: readonly ExpansionEntity[],
  ctx: ParseContext,
): boolean {
  if (
    new Set(owned.map((value) => value.id)).size !== owned.length ||
    entities.length !== owned.length
  ) {
    mechanismIssue(
      ctx,
      'named probability identities must be distinct; no unused actors or duplicate scopes',
    );
    return false;
  }
  return true;
}
function amountValues(q: ExpansionQuantity): ExpansionRational[] | null {
  if (q.state === 'missing' || q.state === 'unknown') return [];
  const amounts = q.state === 'disputed' ? q.alternatives : 'amount' in q ? [q.amount] : [];
  const values: ExpansionRational[] = [];
  for (const amount of amounts) {
    if (amount.kind !== 'rational') return null;
    if (q.basis.unit === 'percent') {
      const value = divide(amount.value, HUNDRED);
      if (!value.ok) return null;
      values.push(value.value);
    } else values.push(amount.value);
  }
  return values;
}
interface Owner<R extends string> {
  role: R;
  actor: ExpansionEntity;
  population: ExpansionEntity;
}
function quantityRecords<R extends string>(
  raw: unknown,
  ctx: ParseContext,
  id: '09' | '10',
  entities: readonly ExpansionEntity[],
  owners: readonly Owner<R>[],
  mode: 'counts' | 'rates',
): ProbabilityQuantityRecord<R>[] | null {
  if (!Array.isArray(raw) || raw.length !== owners.length || raw.length > EXPANSION_LIMITS.records)
    return mechanismIssue(
      ctx,
      'include exactly the required owned quantity roles, with at most twelve records',
    );
  const output: ProbabilityQuantityRecord<R>[] = [];
  const seen = new Set<R>();
  for (const [index, entry] of raw.entries()) {
    if (!isRec(entry) || !onlyFields(entry, ['role', 'quantity'], ctx))
      return mechanismIssue(
        ctx,
        'quantity records accept only role and the bounded source quantity',
      );
    const owner = owners.find((value) => value.role === entry.role);
    const q = parseExpansionQuantity(entry.quantity, ctx);
    if (!owner || !q || seen.has(owner.role))
      return mechanismIssue(ctx, 'required quantity roles must be present exactly once');
    if (
      key(q.actor) !== key(owner.actor.label) ||
      key(q.basis.population) !== key(owner.population.label)
    )
      return mechanismIssue(
        ctx,
        'quantity actor and population must belong to this exact role, not a nearby actor or another cohort',
      );
    if (
      mode === 'counts'
        ? q.basis.unit !== 'count'
        : q.basis.unit !== 'ratio' && q.basis.unit !== 'percent'
    )
      return mechanismIssue(
        ctx,
        'count and probability units must agree with the authored representation',
      );
    const values = amountValues(q);
    if (
      !values ||
      values.some(
        (value) =>
          value.numerator < 0 ||
          (mode === 'counts' ? value.denominator !== 1 : value.numerator > value.denominator),
      )
    )
      return mechanismIssue(
        ctx,
        'counts must be nonnegative integers; every supplied probability alternative must be in [0,1]',
      );
    if (output.some((record) => key(record.quantity.basis.period) !== key(q.basis.period)))
      return mechanismIssue(ctx, 'all quantities must retain the same explicit source period');
    seen.add(owner.role);
    output.push({
      id: expansionEntityId(id, entities.length + index),
      role: owner.role,
      actorId: owner.actor.id,
      populationId: owner.population.id,
      quantity: q,
    });
  }
  return output;
}
function known<R extends string>(record: ProbabilityQuantityRecord<R>): ExpansionRational | null {
  if (record.quantity.state !== 'known') return null;
  return amountValues(record.quantity)?.[0] ?? null;
}
function role<R extends string>(
  records: readonly ProbabilityQuantityRecord<R>[],
  name: R,
): ProbabilityQuantityRecord<R> {
  const record = records.find((value) => value.role === name);
  if (!record) throw new Error('Authored probability role was not validated');
  return record;
}
function equal(a: ExpansionRational, b: ExpansionRational): boolean {
  const result = compare(a, b);
  return result.ok && result.value === 0;
}
function relationCondition(text: string, condition?: string): string | undefined {
  return /\b(?:if|unless|when|provided that|assuming)\b/i.test(text) ? condition : undefined;
}
function denominator(
  record: ProbabilityQuantityRecord<string>,
  total: ExpansionRational | null,
  ctx: ParseContext,
): boolean {
  const supplied = record.quantity.basis.denominator;
  if (supplied && (!total || !equal(supplied, total))) {
    mechanismIssue(
      ctx,
      'an explicit denominator must equal its own source total, never another population',
    );
    return false;
  }
  return true;
}
function ratioValue(
  id: '09' | '10',
  numerator: ExpansionRational,
  denominatorValue: ExpansionRational,
  period: string,
  population: string,
  evidence: readonly ExpansionEvidenceSpan[],
  ctx: ParseContext,
): ExpansionDerivedValue | null {
  if (!isDerivationAllowed(id, 'ratio'))
    return mechanismIssue(ctx, 'catalog does not permit this exact authored ratio');
  const result = divide(numerator, denominatorValue);
  if (!result.ok) return mechanismIssue(ctx, `bounded ratio rejected: ${result.error}`);
  return {
    state: 'derived',
    operation: 'ratio',
    operands: [numerator, denominatorValue],
    result: result.value,
    basis: { unit: 'ratio', period, population },
    evidence,
  };
}

export function parseExpansionBaseRate(raw: Rec, ctx: ParseContext): ExpansionBaseRateScene | null {
  const base = envelope(raw, ctx, '09');
  if (!base) return null;
  const population = entity(raw.population, base.spans.setup, base.entities, ctx);
  const subset = entity(raw.subset, base.spans.setup, base.entities, ctx);
  const selection = entity(raw.selection, base.spans.setup, base.entities, ctx);
  const representation = raw.representation;
  if (
    !population ||
    !subset ||
    !selection ||
    !exactEntities(base.entities, [population, subset, selection], ctx)
  )
    return null;
  if (representation !== 'counts' && representation !== 'rates')
    return mechanismIssue(ctx, 'base-rate representation must be counts or rates');
  const owners: Owner<BaseRateRecordRole>[] =
    representation === 'counts'
      ? [
          { role: 'population-total', actor: population, population },
          { role: 'subset-total', actor: subset, population },
          { role: 'selected-total', actor: selection, population },
          { role: 'selected-subset', actor: subset, population: selection },
        ]
      : [
          { role: 'prevalence', actor: subset, population },
          { role: 'selection-rate', actor: selection, population },
          { role: 'selected-prevalence', actor: subset, population: selection },
        ];
  const records = quantityRecords(raw.records, ctx, '09', base.entities, owners, representation);
  if (!records) return null;
  const period = records[0]?.quantity.basis.period;
  if (!period) return mechanismIssue(ctx, 'an explicit source period is required');
  const q = (name: BaseRateRecordRole) =>
    `${named(role(records, name).quantity.actor)}\\s+${literal(role(records, name).quantity.claim)}`;
  const body =
    representation === 'counts'
      ? `${q('subset-total')}\\s+(?:is|forms)\\s+(?:the\\s+)?subset\\s+numerator\\s+for\\s+${q('population-total')},\\s*and\\s+${q('selected-total')}\\s+(?:is|forms)\\s+(?:the\\s+)?selected\\s+denominator\\s+for\\s+${q('selected-subset')}\\s+during\\s+${literal(period)}`
      : `${q('prevalence')}\\s+(?:is|describes)\\s+(?:the\\s+)?prevalence\\s+within\\s+${named(population.label)},\\s*and\\s+${q('selection-rate')}\\s+(?:is|describes)\\s+(?:the\\s+)?selection\\s+rate\\s+within\\s+${named(population.label)},\\s*while\\s+${q('selected-prevalence')}\\s+(?:is|describes)\\s+(?:the\\s+)?prevalence\\s+within\\s+${named(selection.label)}\\s+during\\s+${literal(period)}`;
  if (
    !clause(base.relation.text, body, relationCondition(base.relation.text, base.story.condition))
  )
    return mechanismIssue(
      ctx,
      'bind these exact owned numerator, denominator and selection quantities in one complete local relation',
    );
  const resolve = `${named(base.story.subject)}\\s+(?:base\\s+rates|prevalence|selection\\s+rates)\\s+(?:remain|stay|are)\\s+(?:source-qualified|unknown|missing|disputed|conditional|illustrative|simulated)`;
  if (!clause(base.spans.resolve, resolve))
    return mechanismIssue(
      ctx,
      'base-rate resolve must retain source qualification, not medical truth or a winner',
    );
  const derivations: ExpansionBaseRateScene['derivations'][number][] = [];
  if (representation === 'counts') {
    const p = role(records, 'population-total');
    const s = role(records, 'subset-total');
    const d = role(records, 'selected-total');
    const n = role(records, 'selected-subset');
    const pv = known(p);
    const sv = known(s);
    const dv = known(d);
    const nv = known(n);
    if ((pv && pv.numerator === 0) || (dv && dv.numerator === 0))
      return mechanismIssue(
        ctx,
        'population and selected denominators must be positive, not a fabricated zero probability',
      );
    if (
      !denominator(p, null, ctx) ||
      !denominator(s, pv, ctx) ||
      !denominator(d, pv, ctx) ||
      !denominator(n, dv, ctx)
    )
      return null;
    if (
      (pv && sv && sv.numerator > pv.numerator) ||
      (pv && dv && dv.numerator > pv.numerator) ||
      (nv && sv && nv.numerator > sv.numerator) ||
      (nv && dv && nv.numerator > dv.numerator) ||
      (pv &&
        sv &&
        dv &&
        nv &&
        nv.numerator < Math.max(0, sv.numerator + dv.numerator - pv.numerator))
    )
      return mechanismIssue(
        ctx,
        'owned subset and intersection counts must fit both original and selected populations',
      );
    if (pv && sv && dv && nv && !base.story.condition) {
      for (const [name, numeratorRecord, denominatorRecord, a, b] of [
        ['prevalence', s, p, sv, pv],
        ['selected-prevalence', n, d, nv, dv],
      ] as const) {
        const value = ratioValue(
          '09',
          a,
          b,
          period,
          denominatorRecord.quantity.basis.population,
          [
            numeratorRecord.quantity.evidence,
            denominatorRecord.quantity.evidence,
            base.relation.span,
          ],
          ctx,
        );
        if (!value) return null;
        // Selected prevalence belongs to the selected cohort, not the original population.
        const basis = {
          ...value.basis,
          population: name === 'prevalence' ? population.label : selection.label,
          denominator: b,
        };
        derivations.push({
          role: name,
          numeratorRecordId: numeratorRecord.id,
          denominatorRecordId: denominatorRecord.id,
          value: { ...value, basis },
        });
      }
    }
  } else {
    const prior = known(role(records, 'prevalence'));
    const selected = known(role(records, 'selection-rate'));
    const selectedPrior = known(role(records, 'selected-prevalence'));
    if (selected?.numerator === 0)
      return mechanismIssue(ctx, 'prevalence within an empty selected cohort is undefined');
    if (prior && selected && selectedPrior) {
      const joint = multiply(selected, selectedPrior);
      const sum = add(prior, selected);
      if (!joint.ok || !sum.ok)
        return mechanismIssue(ctx, 'rate consistency exceeds bounded exact arithmetic');
      const lower = subtract(sum.value, ONE);
      const upper = compare(joint.value, prior);
      const lowerCheck = lower.ok ? compare(joint.value, lower.value) : null;
      if (!upper.ok || !lowerCheck?.ok || upper.value > 0 || lowerCheck.value < 0)
        return mechanismIssue(
          ctx,
          'selected prevalence and selection rate must be compatible with the owned original prevalence',
        );
    }
  }
  return {
    ...base.story,
    storyId: '09',
    kind: 'probability-workbench',
    preset: 'base-rate',
    representation,
    entities: base.entities,
    populationId: population.id,
    subsetId: subset.id,
    selectionId: selection.id,
    records,
    relationEvidence: base.relation.span,
    sourceSpans: base.sourceSpans,
    derivations,
    status: derivations.length ? 'derived' : 'source-qualified',
    display: { ...DISPLAY },
  };
}

function bayes(
  prior: ProbabilityQuantityRecord<BayesUpdateRecordRole>,
  likelihood: ProbabilityQuantityRecord<BayesUpdateRecordRole>,
  complement: ProbabilityQuantityRecord<BayesUpdateRecordRole>,
  period: string,
  population: string,
  evidence: ExpansionEvidenceSpan,
  ctx: ParseContext,
): BayesRatioDerivation | null {
  const p = known(prior);
  const h = known(likelihood);
  const notH = known(complement);
  if (!p || !h || !notH)
    return mechanismIssue(
      ctx,
      'derived update requires complete known prior and both likelihoods; qualified or absent values remain untouched',
    );
  const inverse = subtract(ONE, p);
  if (!inverse.ok) return mechanismIssue(ctx, 'complement prior exceeds bounded exact arithmetic');
  const numerator = multiply(p, h);
  const other = multiply(inverse.value, notH);
  if (!numerator.ok || !other.ok)
    return mechanismIssue(ctx, 'Bayes likelihood products exceed bounded exact arithmetic');
  const total = add(numerator.value, other.value);
  if (!total.ok)
    return mechanismIssue(ctx, 'Bayes evidence denominator exceeds bounded exact arithmetic');
  const value = ratioValue(
    '10',
    numerator.value,
    total.value,
    period,
    population,
    [prior.quantity.evidence, likelihood.quantity.evidence, complement.quantity.evidence, evidence],
    ctx,
  );
  if (!value) return null;
  return {
    supplied: {
      priorRecordId: prior.id,
      likelihoodHypothesisRecordId: likelihood.id,
      likelihoodComplementRecordId: complement.id,
      prior: p,
      likelihoodHypothesis: h,
      likelihoodComplement: notH,
    },
    complementPrior: inverse.value,
    value,
  };
}
export function parseExpansionBayesUpdate(
  raw: Rec,
  ctx: ParseContext,
): ExpansionBayesUpdateScene | null {
  const base = envelope(raw, ctx, '10');
  if (!base) return null;
  const population = entity(raw.population, base.spans.setup, base.entities, ctx);
  const hypothesis = entity(raw.hypothesis, base.spans.setup, base.entities, ctx);
  const evidence = entity(raw.evidenceLabel, base.spans.setup, base.entities, ctx);
  const complement =
    raw.complement === undefined
      ? undefined
      : entity(raw.complement, base.spans.setup, base.entities, ctx);
  if (!population || !hypothesis || !evidence || complement === null) return null;
  if (
    !exactEntities(
      base.entities,
      [population, hypothesis, evidence, ...(complement ? [complement] : [])],
      ctx,
    )
  )
    return null;
  const mode = raw.updateMode;
  if (mode !== 'derive' && mode !== 'source-stated' && mode !== 'unresolved')
    return mechanismIssue(
      ctx,
      'updateMode must be derive, source-stated or unresolved; no confidence verdict',
    );
  if (mode === 'derive' && (!complement || base.story.condition))
    return mechanismIssue(
      ctx,
      'derive needs an explicit complete nonhypothesis partition and unconditional known source inputs',
    );
  const owners: Owner<BayesUpdateRecordRole>[] = [
    { role: 'prior', actor: hypothesis, population },
    { role: 'likelihood-hypothesis', actor: evidence, population: hypothesis },
    ...(complement
      ? [{ role: 'likelihood-complement' as const, actor: evidence, population: complement }]
      : []),
    ...(mode === 'source-stated'
      ? [{ role: 'posterior' as const, actor: hypothesis, population: evidence }]
      : []),
  ];
  const records = quantityRecords(raw.records, ctx, '10', base.entities, owners, 'rates');
  if (!records) return null;
  const prior = role(records, 'prior');
  const likelihood = role(records, 'likelihood-hypothesis');
  const period = prior.quantity.basis.period;
  const q = (name: BayesUpdateRecordRole) =>
    `${named(role(records, name).quantity.actor)}\\s+${literal(role(records, name).quantity.claim)}`;
  const partition = complement
    ? `${named(complement.label)}\\s+is\\s+(?:the\\s+)?complete\\s+(?:complement|nonhypothesis\\s+complement)\\s+of\\s+${named(hypothesis.label)}\\s+within\\s+${named(population.label)},\\s*and\\s+`
    : '';
  const opposite = complement
    ? `,\\s*while\\s+${q('likelihood-complement')}\\s+(?:is|describes)\\s+(?:the\\s+)?likelihood\\s+given\\s+${named(complement.label)}`
    : '';
  const posterior =
    mode === 'source-stated'
      ? `,\\s*while\\s+${q('posterior')}\\s+(?:is|describes)\\s+(?:the\\s+)?source-stated\\s+update\\s+within\\s+${named(evidence.label)}`
      : '';
  const body = `${partition}${q('prior')}\\s+(?:is|describes)\\s+(?:the\\s+)?prior\\s+within\\s+${named(population.label)},\\s*and\\s+${q('likelihood-hypothesis')}\\s+(?:is|describes)\\s+(?:the\\s+)?likelihood\\s+given\\s+${named(hypothesis.label)}${opposite}${posterior}\\s+during\\s+${literal(period)}`;
  if (
    !clause(base.relation.text, body, relationCondition(base.relation.text, base.story.condition))
  )
    return mechanismIssue(
      ctx,
      'prior, event likelihoods, complete complement and any stated posterior must bind their exact owned quantities in one complete local clause',
    );
  const resolve = `${named(base.story.subject)}\\s+update\\s+(?:remains|stays|is)\\s+(?:source-qualified|unresolved|unknown|missing|disputed|conditional|illustrative|simulated)`;
  if (!clause(base.spans.resolve, resolve))
    return mechanismIssue(
      ctx,
      'update resolve must remain source-qualified or unresolved, never prove a hypothesis',
    );
  let update: ExpansionBayesUpdateScene['update'] = { state: 'unresolved' };
  if (mode === 'derive') {
    const derived = bayes(
      prior,
      likelihood,
      role(records, 'likelihood-complement'),
      period,
      evidence.label,
      base.relation.span,
      ctx,
    );
    if (!derived) return null;
    update = { state: 'derived', derivation: derived };
  } else if (mode === 'source-stated') {
    const supplied = role(records, 'posterior');
    if (
      complement &&
      !base.story.condition &&
      known(prior) &&
      known(likelihood) &&
      known(role(records, 'likelihood-complement')) &&
      known(supplied)
    ) {
      const expected = bayes(
        prior,
        likelihood,
        role(records, 'likelihood-complement'),
        period,
        evidence.label,
        base.relation.span,
        ctx,
      );
      const stated = known(supplied);
      if (!expected || !stated || !equal(expected.value.result, stated))
        return mechanismIssue(
          ctx,
          'a known supplied posterior must agree with its complete owned likelihood basis',
        );
    }
    update = { state: 'source-stated', posteriorRecordId: supplied.id };
  }
  return {
    ...base.story,
    storyId: '10',
    kind: 'probability-workbench',
    preset: 'bayes-update',
    entities: base.entities,
    populationId: population.id,
    hypothesisId: hypothesis.id,
    evidenceId: evidence.id,
    ...(complement ? { complementId: complement.id } : {}),
    records,
    relationEvidence: base.relation.span,
    sourceSpans: base.sourceSpans,
    update,
    meaning: 'source-qualified-not-certainty',
    display: { ...DISPLAY },
  };
}
