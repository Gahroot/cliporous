/** Step 10: exact source-owned deviations and genuinely shared-basis small multiples. */
import type {
  ExpansionDeviationResult,
  ExpansionDeviationScene,
  ExpansionMultipleRecord,
  ExpansionSmallMultiplesScene,
} from '../../remotion/compositions/explainer/expansion/quantities/deviation-multiples-types';
import type { ExpansionEntity } from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  add,
  compare,
  compatibleBasis,
  isDerivationAllowed,
  rational,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  EXPANSION_LIMITS,
  type ExpansionBasis,
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
function sameLabel(a: string, b: string): boolean {
  return canonical(a).toLowerCase() === canonical(b).toLowerCase();
}
function sameSpan(a: ExpansionEvidenceSpan, b: ExpansionEvidenceSpan): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}
/** Every endpoint is escaped. No model regex, expression or partial keyword evidence is run. */
function clause(evidence: ExpansionSourceEvidence, body: string): boolean {
  if (
    /[<>`]|https?:\/\/|www\./i.test(evidence.text) ||
    [...evidence.text].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return false;
  const text = canonical(evidence.text)
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
    (label ? entities.find((entity) => sameLabel(entity.label, label)) : undefined) ??
    mechanismIssue(
      ctx,
      'references must be locally declared source entity labels, never supplied IDs or invented aliases',
    )
  );
}
function atBeat(
  raw: unknown,
  expected: ExpansionSourceEvidence,
  ctx: ParseContext,
): ExpansionSourceEvidence | null {
  const evidence = expansionSourceSpan(raw, ctx);
  return evidence && sameSpan(evidence.span, expected.span)
    ? evidence
    : mechanismIssue(ctx, 'relationship evidence must retain its exact complete local beat clause');
}
function envelope(raw: Rec, ctx: ParseContext, id: '23' | '24', fields: readonly string[]) {
  const base = expansionStoryBase(raw, ctx, id, ['entities', 'domain', 'comparison', ...fields]);
  if (!base) return null;
  const { treatment, ...story } = base.story;
  if (treatment !== undefined) return mechanismIssue(ctx, 'no arbitrary treatment is supported');
  const locals: ExpansionSourceEvidence[] = [];
  for (const beat of BEATS) {
    const index = ctx.inWin(raw[`${beat}Word`]);
    if (index === null) return null;
    const evidence = expansionSourceSpan(
      { fromWord: index, toWord: index + base.spans[beat].split(/\s+/).length - 1 },
      ctx,
    );
    if (!evidence)
      return mechanismIssue(ctx, 'five distinct complete clause-start beats are required');
    locals.push(evidence);
  }
  const [setup, action, response, check, resolve] = locals;
  if (!setup || !action || !response || !check || !resolve) return null;
  const entities = expansionEntities(raw.entities, ctx, id);
  const domain = expansionSourceLabel(raw.domain, setup, ctx, 32);
  if (
    !entities ||
    !domain ||
    !isRec(raw.comparison) ||
    !onlyFields(raw.comparison, ['evidence'], ctx)
  )
    return mechanismIssue(
      ctx,
      'bounded named identities, source domain and explicit comparison evidence are required',
    );
  const comparison = atBeat(raw.comparison.evidence, check, ctx);
  if (!comparison) return null;
  return {
    story,
    entities,
    domain,
    comparison,
    beats: { setup, action, response, check, resolve },
  };
}
function contextual(body: string, basis: ExpansionBasis, denominator = false): string {
  const period = literal(basis.period);
  const population = literal(basis.population);
  const den =
    denominator && basis.denominator
      ? `\\s+with\\s+denominator\\s+(?:[+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,6})?)`
      : '';
  // Numeric denominator is additionally parsed below; this authored grammar never evaluates it.
  const place = `(?:during|in|for)\\s+${period}\\s+(?:among|for)\\s+${population}${den}`;
  return `(?:${body}\\s+${place}|${place},\\s*${body})`;
}
function setupContext(body: string, basis: ExpansionBasis): string {
  return contextual(body, basis);
}
function teachingPrefix(body: string, quantity: ExpansionQuantity): string {
  return quantity.state === 'illustrative' || quantity.state === 'simulated'
    ? `(?:in\\s+this|in\\s+the)\\s+${literal(quantity.qualifier)},\\s*${body}`
    : body;
}
function numberOf(quantity: ExpansionQuantity, ctx: ParseContext): ExpansionRational | null {
  if (!('amount' in quantity))
    return mechanismIssue(ctx, 'missing/unknown/disputed is not a measured zero operand');
  if (quantity.amount.kind === 'rational') return quantity.amount.value;
  const value = rational(quantity.amount.value.minorUnits, 100);
  return value.ok
    ? value.value
    : mechanismIssue(ctx, 'money operand is outside exact bounded minor-unit arithmetic');
}
function sourceStatus(
  raw: Rec,
  quantities: readonly ExpansionQuantity[],
  ctx: ParseContext,
): boolean {
  const teaching = quantities.some(
    (quantity) => quantity.state === 'illustrative' || quantity.state === 'simulated',
  );
  if (
    (teaching && raw.evidence !== 'illustrative') ||
    (raw.evidence === 'illustrative' && quantities.every((quantity) => quantity.state === 'known'))
  ) {
    mechanismIssue(
      ctx,
      'preserve teaching/simulation status rather than silently calling those quantities measured',
    );
    return false;
  }
  const conditional = quantities.filter((quantity) => quantity.state === 'conditional');
  if (
    (raw.condition !== undefined && !conditional.length) ||
    conditional.some(
      (quantity) =>
        quantity.state === 'conditional' &&
        (typeof raw.condition !== 'string' || !sameLabel(quantity.condition, raw.condition)),
    )
  ) {
    mechanismIssue(
      ctx,
      'preserve the complete condition on its own quantity, not another actor or a blanket invented condition',
    );
    return false;
  }
  return true;
}
function validDenominator(basis: ExpansionBasis, ctx: ParseContext): boolean {
  if (
    ['count', 'ratio', 'percent', 'percentage-point', 'percent-change'].includes(basis.unit) &&
    !basis.denominator
  ) {
    mechanismIssue(
      ctx,
      'count/proportion comparisons need a supplied explicit positive denominator',
    );
    return false;
  }
  return true;
}
function comparisonClause(
  evidence: ExpansionSourceEvidence,
  body: string,
  basis: ExpansionBasis,
  ctx: ParseContext,
): boolean {
  if (!clause(evidence, contextual(body, basis, true))) {
    mechanismIssue(
      ctx,
      'the shared unit, domain, period, population and denominator must be expressly related in the check clause',
    );
    return false;
  }
  if (basis.denominator) {
    const match = /\bwith\s+denominator\s+([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,6})?)/i.exec(
      evidence.text,
    );
    // Reuse the quantity contract to bind the comparison denominator exactly, without Number rounding.
    if (!match) return false;
    const expected = basis.denominator;
    const decimal = match[1]?.replace(/,/g, '') ?? '';
    const pieces = decimal.split('.');
    const fraction = pieces[1] ?? '';
    const supplied = rational(Number(`${pieces[0]}${fraction}`), 10 ** fraction.length);
    const equal = supplied.ok ? compare(supplied.value, expected) : null;
    if (!equal?.ok || equal.value !== 0) {
      mechanismIssue(ctx, 'comparison denominator must equal the exact quantity denominator');
      return false;
    }
  }
  return true;
}

/**
 * Raw 23: actor:label, domain, entities, target/observation:ExpansionQuantity raw,
 * comparison:{evidence}, result:{state:'derived',operation:'difference',quantity:known raw}
 * or {state:'source-qualified',quantity:qualified raw}; optional supplied relative:quantity raw.
 */
export function parseExpansionDeviation(
  raw: Rec,
  ctx: ParseContext,
): ExpansionDeviationScene | null {
  const base = envelope(raw, ctx, '23', ['actor', 'target', 'observation', 'result', 'relative']);
  if (!base) return null;
  const { story, entities, domain, comparison, beats } = base;
  const actor = ref(raw.actor, entities, ctx);
  const target = parseExpansionQuantity(raw.target, ctx);
  const observation = parseExpansionQuantity(raw.observation, ctx);
  if (!actor || entities.length !== 1 || !target || !observation)
    return mechanismIssue(
      ctx,
      'deviation requires one actual actor with complete source-owned target and observation',
    );
  if (
    !sameLabel(target.actor, actor.label) ||
    !sameLabel(observation.actor, actor.label) ||
    !sameLabel(target.claim, `${domain} target`) ||
    !sameLabel(observation.claim, `${domain} observation`) ||
    !sameSpan(actor.evidence, beats.setup.span) ||
    !sameLabel(story.subject, actor.label) ||
    !sameSpan(target.evidence, beats.action.span) ||
    !sameSpan(observation.evidence, beats.response.span) ||
    !compatibleBasis(target.basis, observation.basis) ||
    !validDenominator(target.basis, ctx)
  )
    return mechanismIssue(
      ctx,
      'target/observation must retain the same actor, actual domain and compatible unit/period/population/denominator',
    );
  const setupBody = `${literal(story.label)}\\s+(?:compares|reviews|tracks|examines)\\s+${literal(actor.label)}\\s+${literal(target.claim)}\\s+and\\s+${literal(observation.claim)}`;
  if (!clause(beats.setup, teachingPrefix(setupContext(setupBody, target.basis), target)))
    return mechanismIssue(
      ctx,
      'setup must actually compare this actor’s target and observation in their source domain/basis',
    );
  const checkBody = `${literal(actor.label)}\\s+${literal(target.claim)}\\s+and\\s+${literal(observation.claim)}\\s+(?:share|use)\\s+(?:the\\s+same|a\\s+common)\\s+${literal(target.basis.unit)}\\s+basis\\s+for\\s+${literal(domain)}`;
  if (!comparisonClause(comparison, checkBody, target.basis, ctx)) return null;
  if (
    !isRec(raw.result) ||
    !onlyFields(raw.result, ['state', 'operation', 'quantity', 'evidence'], ctx)
  )
    return mechanismIssue(
      ctx,
      'result needs an authored subtraction relation or a separately source-owned result quantity',
    );
  let source: ExpansionQuantity | undefined;
  let relation: ExpansionSourceEvidence | undefined;
  if (raw.result.quantity !== undefined) {
    source = parseExpansionQuantity(raw.result.quantity, ctx) ?? undefined;
    if (
      !source ||
      raw.result.evidence !== undefined ||
      !sameLabel(source.actor, actor.label) ||
      !sameLabel(source.claim, `${domain} deviation`) ||
      !compatibleBasis(source.basis, target.basis) ||
      !sameSpan(source.evidence, beats.resolve.span) ||
      !story.outcome.toLowerCase().includes(`${domain} deviation`.toLowerCase()) ||
      !story.outcome.toLowerCase().includes(source.state === 'known' ? ' is ' : source.state)
    )
      return mechanismIssue(
        ctx,
        'resolve must retain the actor-owned deviation, exact basis and source result status',
      );
  } else {
    relation = atBeat(raw.result.evidence, beats.resolve, ctx) ?? undefined;
    const unit = target.basis.unit === 'count' ? '(?:count|counts)' : literal(target.basis.unit);
    const body = `${literal(actor.label)}\\s+${literal(domain)}\\s+deviation\\s+(?:is defined as|equals|is)\\s+${literal(observation.claim)}\\s+minus\\s+${literal(target.claim)}\\s+(?:in|using)\\s+${unit}`;
    if (
      !relation ||
      !comparisonClause(relation, body, target.basis, ctx) ||
      !story.outcome
        .toLowerCase()
        .includes(`${observation.claim} minus ${target.claim}`.toLowerCase())
    )
      return mechanismIssue(
        ctx,
        'derived result must quote the complete actor/domain/basis-bound observation-minus-target relation, not fabricate a numeric outcome',
      );
  }
  let result: ExpansionDeviationResult;
  if (target.state === 'known' && observation.state === 'known') {
    if (
      raw.result.state !== 'derived' ||
      raw.result.operation !== 'difference' ||
      (source && source.state !== 'known') ||
      !isDerivationAllowed('23', 'difference')
    )
      return mechanismIssue(
        ctx,
        'only the whitelisted known observation-minus-target difference can be derived',
      );
    const a = numberOf(observation, ctx);
    const b = numberOf(target, ctx);
    const negative = b ? rational(-b.numerator, b.denominator) : null;
    const difference = a && negative?.ok ? add(a, negative.value) : null;
    if (!a || !b || !difference?.ok)
      return mechanismIssue(
        ctx,
        'exact bounded difference overflow; no rounded or invented result',
      );
    if (source) {
      const stated = numberOf(source, ctx);
      const equal = stated ? compare(stated, difference.value) : null;
      if (!equal?.ok || equal.value !== 0)
        return mechanismIssue(
          ctx,
          'signed difference must equal the supplied result; no rounding or invented rate',
        );
    }
    const evidence = source?.evidence ?? relation?.span;
    if (!evidence)
      return mechanismIssue(ctx, 'the difference needs complete source relation evidence');
    result = {
      state: 'derived',
      operation: 'difference',
      operands: [a, b],
      result: difference.value,
      basis: target.basis,
      evidence: [observation.evidence, target.evidence, evidence],
      ...(source ? { source } : {}),
    };
  } else {
    if (
      !source ||
      raw.result.state !== 'source-qualified' ||
      raw.result.operation !== undefined ||
      source.state === 'known'
    )
      return mechanismIssue(
        ctx,
        'qualified/absent/disputed operands never produce an unqualified measured or derived result',
      );
    result = { state: 'source-qualified', quantity: source };
  }
  let relative: ExpansionQuantity | undefined;
  if (raw.relative !== undefined) {
    relative = parseExpansionQuantity(raw.relative, ctx) ?? undefined;
    if (
      !relative ||
      !sameLabel(relative.actor, actor.label) ||
      !sameLabel(relative.claim, `${domain} relative deviation`) ||
      !sameLabel(relative.basis.period, target.basis.period) ||
      !sameLabel(relative.basis.population, target.basis.population) ||
      !relative.basis.denominator ||
      !target.basis.denominator ||
      relative.evidence.fromWord <= comparison.span.toWord ||
      relative.evidence.toWord >= beats.resolve.span.fromWord
    )
      return mechanismIssue(
        ctx,
        'optional relative values must be separately supplied, actor/basis-bound check-phase evidence, never derived rates',
      );
    const sameDen = compare(relative.basis.denominator, target.basis.denominator);
    if (!sameDen.ok || sameDen.value !== 0)
      return mechanismIssue(
        ctx,
        'relative value denominator must retain the comparison population basis',
      );
  }
  if (
    !sourceStatus(
      raw,
      [target, observation, ...(source ? [source] : []), ...(relative ? [relative] : [])],
      ctx,
    )
  )
    return null;
  return {
    ...story,
    storyId: '23',
    kind: 'quantity-comparison',
    preset: 'deviation',
    entities,
    actorId: actor.id,
    domain,
    target,
    observation,
    comparisonEvidence: comparison.span,
    result,
    ...(relative ? { relative } : {}),
  };
}

function labels(values: readonly string[]): string {
  if (values.length === 2)
    return `${literal(values[0] ?? '')}\\s+and\\s+${literal(values[1] ?? '')}`;
  return `${values.slice(0, -1).map(literal).join(',\\s*')},?\\s+and\\s+${literal(values[values.length - 1] ?? '')}`;
}
/** Raw 24: domain, entities, records:[{entity:label,quantity}], comparison:{evidence}, conclusion:{qualification,evidence}. */
export function parseExpansionSmallMultiples(
  raw: Rec,
  ctx: ParseContext,
): ExpansionSmallMultiplesScene | null {
  const base = envelope(raw, ctx, '24', ['records', 'conclusion']);
  if (!base) return null;
  const { story, entities, domain, comparison, beats } = base;
  if (
    !Array.isArray(raw.records) ||
    raw.records.length < 2 ||
    raw.records.length > 4 ||
    entities.length !== raw.records.length
  )
    return mechanismIssue(
      ctx,
      'portrait small-multiples supports two to four named options and one supplied record per option',
    );
  const records: ExpansionMultipleRecord[] = [];
  const names: string[] = [];
  let first: ExpansionQuantity | undefined;
  for (const [index, entry] of raw.records.entries()) {
    if (!isRec(entry) || !onlyFields(entry, ['entity', 'quantity'], ctx))
      return mechanismIssue(
        ctx,
        'records accept only a named source entity and its actual quantity',
      );
    const entity = ref(entry.entity, entities, ctx);
    const quantity = parseExpansionQuantity(entry.quantity, ctx);
    if (
      !entity ||
      !quantity ||
      !sameLabel(quantity.actor, entity.label) ||
      !sameLabel(quantity.claim, domain) ||
      !sameSpan(entity.evidence, quantity.evidence) ||
      quantity.evidence.fromWord < beats.action.span.fromWord ||
      quantity.evidence.toWord >= beats.check.span.fromWord ||
      records.some((record) => record.entityId === entity.id)
    )
      return mechanismIssue(
        ctx,
        'each distinct option must own its complete local domain assertion; another actor’s evidence is not its value',
      );
    if (
      (first && !compatibleBasis(first.basis, quantity.basis)) ||
      !validDenominator(quantity.basis, ctx)
    )
      return mechanismIssue(
        ctx,
        'small multiples require explicitly compatible units/period/population/denominator, not forced comparability',
      );
    first ??= quantity;
    names.push(entity.label);
    records.push({ id: `expansion-24-record-${index}`, entityId: entity.id, quantity });
  }
  if (
    !first ||
    !records.some((record) => sameSpan(record.quantity.evidence, beats.action.span)) ||
    !records.some((record) => sameSpan(record.quantity.evidence, beats.response.span)) ||
    !sameLabel(story.subject, domain)
  )
    return mechanismIssue(
      ctx,
      'both value beats must supply actual options in the introduced domain',
    );
  const list = labels(names);
  const setupBody = `${literal(story.label)}\\s+(?:compares|reviews|tracks|examines)\\s+${list}\\s+for\\s+${literal(domain)}`;
  if (!clause(beats.setup, teachingPrefix(setupContext(setupBody, first.basis), first)))
    return mechanismIssue(
      ctx,
      'setup must introduce these named options and explicitly shared comparison domain',
    );
  const checkBody = `${list}\\s+(?:share|use)\\s+(?:the\\s+same|a\\s+common)\\s+${literal(first.basis.unit)}\\s+basis\\s+for\\s+${literal(domain)}`;
  if (!comparisonClause(comparison, checkBody, first.basis, ctx)) return null;
  if (!isRec(raw.conclusion) || !onlyFields(raw.conclusion, ['qualification', 'evidence'], ctx))
    return mechanismIssue(
      ctx,
      'a source-qualified descriptive conclusion is required, not an invented winner',
    );
  const resolve = atBeat(raw.conclusion.evidence, beats.resolve, ctx);
  const qualification = resolve
    ? expansionSourceLabel(raw.conclusion.qualification, resolve, ctx, EXPANSION_LIMITS.qualifier)
    : null;
  const allowed = [
    'no universal winner is established',
    'no winner is implied',
    'comparisons remain descriptive',
    'the comparison remains qualified',
    'the comparison remains conditional',
  ];
  if (
    !resolve ||
    !qualification ||
    !allowed.some((value) => sameLabel(value, qualification)) ||
    (sameLabel(qualification, 'the comparison remains conditional') &&
      !records.some((record) => record.quantity.state === 'conditional')) ||
    !clause(
      resolve,
      contextual(`for\\s+${literal(domain)},?\\s+${literal(qualification)}`, first.basis),
    ) ||
    !sameLabel(story.outcome, qualification)
  )
    return mechanismIssue(
      ctx,
      'resolve must locally preserve the domain/basis and complete no-winner/qualified meaning',
    );
  if (
    !sourceStatus(
      raw,
      records.map((record) => record.quantity),
      ctx,
    )
  )
    return null;
  return {
    ...story,
    storyId: '24',
    kind: 'quantity-comparison',
    preset: 'small-multiples',
    entities,
    domain,
    records,
    comparisonEvidence: comparison.span,
    conclusion: { qualification, evidence: resolve.span },
  };
}
