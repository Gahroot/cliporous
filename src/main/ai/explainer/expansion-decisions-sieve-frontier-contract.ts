/** Stories 25–26: bounded authored judgments and exact, comparable Pareto metrics. */
import type {
  DecisionBeatEvidence,
  ExpansionParetoScene,
  ExpansionSieveScene,
  ParetoCriterion,
  ParetoFrontierResult,
  ParetoMetricRecord,
  ParetoOperand,
  SieveCheck,
  SieveJudgment,
  SieveRequirement,
} from '../../remotion/compositions/explainer/expansion/decisions/sieve-frontier-types';
import {
  type ExpansionEntity,
  expansionEntityId,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  compare,
  compatibleBasis,
  isDerivationAllowed,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  EXPANSION_LIMITS,
  type ExpansionEvidenceSpan,
  type ExpansionRational,
} from '../../remotion/compositions/explainer/expansion/value-types';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import {
  type ExpansionLocalEvidence,
  expansionAssertedRelation,
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
  expansionStoryBase,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

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
function unsafe(text: string): boolean {
  return (
    /[<>`{}]|https?:\/\/|www\./i.test(text) ||
    [...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}
function conditionFor(text: string, condition?: string): string | undefined {
  return /\b(?:if|unless|when|provided that|assuming)\b/i.test(text) ? condition : undefined;
}
function asserted(
  evidence: ExpansionLocalEvidence,
  body: string,
  labels: readonly string[],
  condition?: string,
): boolean {
  return expansionAssertedRelation(evidence, new RegExp(body, 'i'), condition, labels);
}
/** Negation/qualification here is part of the authored check state, never stripped or evaluated. */
function stateClause(text: string, body: string, condition?: string): boolean {
  if (unsafe(text) || text.split(/\s+/).length > EXPANSION_LIMITS.evidenceWords) return false;
  const source = key(text)
    .replace(/[.;][”"’')\]]*$/, '')
    .trim();
  const grammar = condition
    ? `(?:${literal(condition)},\\s*${body}|${body},?\\s+${literal(condition)})`
    : body;
  return new RegExp(`^(?:${grammar})$`, 'i').test(source);
}
function localBase(raw: Rec, ctx: ParseContext, id: '25' | '26') {
  const b = expansionStoryBase(raw, ctx, id, [
    'entities',
    'period',
    'population',
    'records',
    ...(id === '25' ? ['requirements'] : ['criteria', 'comparisonEvidence']),
  ]);
  if (!b) return null;
  const entities = expansionEntities(raw.entities, ctx, id);
  const period = expansionSourceLabel(raw.period, b.spans.setup, ctx, EXPANSION_LIMITS.period);
  const population = expansionSourceLabel(
    raw.population,
    b.spans.setup,
    ctx,
    EXPANSION_LIMITS.population,
  );
  if (!entities || !period || !population) return null;
  if (entities.length < 2 || entities.length > 4)
    return mechanismIssue(
      ctx,
      'decision templates accept two to four distinct options, never arbitrary actors',
    );
  const evidence: ExpansionEvidenceSpan[] = [];
  for (const beat of BEATS) {
    const index = ctx.inWin(raw[`${beat}Word`]);
    if (index === null)
      return mechanismIssue(ctx, 'five beats must identify real complete source sentences');
    let fromWord = index,
      toWord = index;
    while (
      fromWord > ctx.win.startWord &&
      !/[.!?;][”"’')\]]*$/.test(ctx.words[fromWord - 1]?.text ?? '')
    )
      fromWord--;
    while (toWord < ctx.win.endWord && !/[.!?;][”"’')\]]*$/.test(ctx.words[toWord]?.text ?? ''))
      toWord++;
    const span = expansionSourceSpan({ fromWord, toWord }, ctx);
    if (!span) return null;
    evidence.push(span.span);
  }
  const [setup, action, response, check, resolve] = evidence;
  if (
    !setup ||
    !action ||
    !response ||
    !check ||
    !resolve ||
    new Set(evidence.map((e) => e.fromWord)).size !== 5
  )
    return mechanismIssue(ctx, 'five different source clauses must retain ordered decision beats');
  const sourceSpans: DecisionBeatEvidence = { setup, action, response, check, resolve };
  const { treatment: _treatment, ...story } = b.story;
  return { story, spans: b.spans, entities, period, population, sourceSpans };
}
function reference(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  return (
    (typeof raw === 'string' ? entities.find((e) => key(e.label) === key(raw)) : undefined) ??
    mechanismIssue(ctx, 'record references must use existing source-owned option labels, not IDs')
  );
}
function matrix(raw: unknown, count: number, ctx: ParseContext): Rec[] | null {
  if (
    !Array.isArray(raw) ||
    raw.length !== count ||
    raw.length > EXPANSION_LIMITS.records ||
    !raw.every(isRec)
  )
    return mechanismIssue(
      ctx,
      'include the complete option-by-requirement/criterion matrix, at most twelve records',
    );
  return raw;
}
function joined(labels: readonly string[]): string {
  return labels.map(named).join('\\s+and\\s+');
}

export function parseExpansionSieve(raw: Rec, ctx: ParseContext): ExpansionSieveScene | null {
  const b = localBase(raw, ctx, '25');
  if (!b) return null;
  if (
    !Array.isArray(raw.requirements) ||
    raw.requirements.length < 1 ||
    raw.requirements.length > 4
  )
    return mechanismIssue(ctx, 'sieve needs one to four actual named requirements');
  const requirements: SieveRequirement[] = [];
  for (const [index, entry] of raw.requirements.entries()) {
    if (!isRec(entry) || !onlyFields(entry, ['label', 'content', 'evidence'], ctx)) return null;
    const evidence = expansionSourceSpan(entry.evidence, ctx);
    const label = evidence ? expansionSourceLabel(entry.label, evidence, ctx, 28) : null;
    const content = evidence ? expansionSourceLabel(entry.content, evidence, ctx, 64) : null;
    if (!evidence || !label || !content || unsafe(content))
      return mechanismIssue(ctx, 'requirements need bounded explicit source content');
    if (requirements.some((r) => key(r.label) === key(label)))
      return mechanismIssue(ctx, 'requirement labels must be unique');
    if (
      !asserted(
        evidence,
        `Requirement\\s+${named(label)}\\s+(?:requires|calls\\s+for)\\s+${literal(content)}\\s+during\\s+${literal(b.period)}\\s+among\\s+${literal(b.population)}`,
        [label, content, b.period, b.population],
        conditionFor(evidence.text, b.story.condition),
      )
    )
      return mechanismIssue(
        ctx,
        'requirement content and scope must be explicitly stated in their own complete clause',
      );
    requirements.push({
      id: expansionEntityId('25', b.entities.length + index),
      label,
      content,
      evidence: evidence.span,
    });
  }
  if (
    !asserted(
      b.spans.setup,
      `${named(b.story.subject)}:\\s*Options\\s+${joined(b.entities.map((e) => e.label))}\\s+(?:face\\s+requirements|are\\s+checked\\s+against\\s+requirements)\\s+${joined(requirements.map((r) => r.label))}\\s+during\\s+${literal(b.period)}\\s+among\\s+${literal(b.population)}`,
      [
        ...b.entities.map((e) => e.label),
        ...requirements.map((r) => r.label),
        // One adjacent, already-grounded scope phrase retains the shared eight-slot cap.
        `${b.period} among ${b.population}`,
      ],
      conditionFor(b.spans.setup, b.story.condition),
    )
  )
    return mechanismIssue(
      ctx,
      'setup must introduce the actual options, complete requirement list and common scope',
    );
  const entries = matrix(raw.records, b.entities.length * requirements.length, ctx);
  if (!entries) return null;
  const records: SieveCheck[] = [];
  for (const [index, entry] of entries.entries()) {
    if (
      !onlyFields(
        entry,
        [
          'option',
          'requirement',
          'state',
          'status',
          'qualifier',
          'condition',
          'alternatives',
          'evidence',
        ],
        ctx,
      )
    )
      return null;
    const option = reference(entry.option, b.entities, ctx);
    const requirement =
      typeof entry.requirement === 'string'
        ? requirements.find((r) => key(r.label) === key(entry.requirement as string))
        : undefined;
    const evidence = expansionSourceSpan(entry.evidence, ctx);
    if (!option || !requirement || !evidence)
      return mechanismIssue(ctx, 'checks must bind named local option and requirement endpoints');
    if (records.some((r) => r.optionId === option.id && r.requirementId === requirement.id))
      return mechanismIssue(ctx, 'each option/requirement check must appear exactly once');
    const endpoint = `${named(option.label)}\\s+${named(requirement.label)}\\s+check\\s+is`;
    const scope = `during\\s+${literal(b.period)}\\s+among\\s+${literal(b.population)}`;
    const passFail =
      entry.status === 'pass'
        ? '(?:passes|meets)'
        : entry.status === 'fail'
          ? '(?:fails|violates|does\\s+not\\s+meet)'
          : null;
    const statusBody = passFail
      ? `${named(option.label)}\\s+${passFail}\\s+requirement\\s+${named(requirement.label)}\\s+${scope}`
      : '';
    let judgment: SieveJudgment;
    if (entry.state === 'known') {
      if (
        !passFail ||
        'qualifier' in entry ||
        'condition' in entry ||
        'alternatives' in entry ||
        !stateClause(evidence.text, statusBody)
      )
        return mechanismIssue(
          ctx,
          'known pass/fail must be an explicit full source judgment, never inferred from numbers',
        );
      judgment = { state: 'known', status: entry.status as 'pass' | 'fail' };
    } else if (entry.state === 'unknown' || entry.state === 'missing') {
      if (
        'status' in entry ||
        'condition' in entry ||
        'alternatives' in entry ||
        entry.qualifier !== entry.state ||
        !stateClause(evidence.text, `${endpoint}\\s+${entry.state}\\s+${scope}`)
      )
        return mechanismIssue(
          ctx,
          'unknown or missing checks retain absence, never a fabricated pass/fail',
        );
      judgment = { state: entry.state, qualifier: entry.state };
    } else if (entry.state === 'disputed') {
      if (
        'status' in entry ||
        'condition' in entry ||
        entry.qualifier !== 'disputed' ||
        !Array.isArray(entry.alternatives) ||
        entry.alternatives.length !== 2 ||
        entry.alternatives[0] !== 'pass' ||
        entry.alternatives[1] !== 'fail' ||
        !stateClause(
          evidence.text,
          `${endpoint}\\s+disputed\\s+between\\s+pass\\s+and\\s+fail\\s+${scope}`,
        )
      )
        return mechanismIssue(
          ctx,
          'disputed checks retain both stated alternatives without adjudication',
        );
      judgment = { state: 'disputed', alternatives: ['pass', 'fail'], qualifier: 'disputed' };
    } else if (entry.state === 'conditional') {
      const condition = expansionSourceLabel(
        entry.condition,
        evidence,
        ctx,
        EXPANSION_LIMITS.qualifier,
      );
      if (
        !passFail ||
        !condition ||
        condition !== b.story.condition ||
        'qualifier' in entry ||
        'alternatives' in entry ||
        !stateClause(evidence.text, statusBody, condition)
      )
        return mechanismIssue(ctx, 'conditional checks retain the exact local source condition');
      judgment = { state: 'conditional', status: entry.status as 'pass' | 'fail', condition };
    } else if (entry.state === 'illustrative' || entry.state === 'simulated') {
      const qualifier = expansionSourceLabel(
        entry.qualifier,
        evidence,
        ctx,
        EXPANSION_LIMITS.qualifier,
      );
      const allowlist =
        entry.state === 'illustrative'
          ? ['illustrative example', 'hypothetical example']
          : ['simulation', 'simulated example'];
      if (
        !passFail ||
        !qualifier ||
        !allowlist.includes(qualifier) ||
        b.story.evidence !== 'illustrative' ||
        'condition' in entry ||
        'alternatives' in entry ||
        !stateClause(evidence.text, `In\\s+this\\s+${literal(qualifier)},\\s*${statusBody}`)
      )
        return mechanismIssue(
          ctx,
          'illustrative and simulated checks retain their authored nonmeasured qualifier',
        );
      judgment = { state: entry.state, status: entry.status as 'pass' | 'fail', qualifier };
    } else return mechanismIssue(ctx, 'unsupported check state; no invented elimination or winner');
    records.push({
      id: expansionEntityId('25', b.entities.length + requirements.length + index),
      optionId: option.id,
      requirementId: requirement.id,
      evidence: evidence.span,
      ...judgment,
    });
  }
  if (
    !stateClause(
      b.spans.resolve,
      `${named(b.story.subject)}\\s+(?:retains|keeps)\\s+source-stated\\s+checks\\s+rather\\s+than\\s+(?:a\\s+)?winner`,
    )
  )
    return mechanismIssue(
      ctx,
      'sieve resolve preserves stated checks, not an inferred winner or elimination',
    );
  return {
    ...b.story,
    storyId: '25',
    kind: 'constraint-choice',
    preset: 'sieve',
    entities: b.entities,
    period: b.period,
    population: b.population,
    requirements,
    records,
    sourceSpans: b.sourceSpans,
    meaning: 'source-stated-checks-not-winner',
  };
}

export function parseExpansionPareto(raw: Rec, ctx: ParseContext): ExpansionParetoScene | null {
  const b = localBase(raw, ctx, '26');
  if (!b) return null;
  if (!Array.isArray(raw.criteria) || raw.criteria.length < 2 || raw.criteria.length > 4)
    return mechanismIssue(ctx, 'Pareto needs two to four explicitly directed comparable criteria');
  const criteria: ParetoCriterion[] = [];
  for (const [index, entry] of raw.criteria.entries()) {
    if (!isRec(entry) || !onlyFields(entry, ['label', 'direction', 'evidence'], ctx)) return null;
    const evidence = expansionSourceSpan(entry.evidence, ctx);
    const label = evidence ? expansionSourceLabel(entry.label, evidence, ctx, 28) : null;
    if (!evidence || !label || (entry.direction !== 'minimize' && entry.direction !== 'maximize'))
      return mechanismIssue(ctx, 'criteria need an explicit local minimize/maximize direction');
    if (criteria.some((c) => key(c.label) === key(label)))
      return mechanismIssue(ctx, 'criterion labels must be distinct');
    const direction =
      entry.direction === 'minimize'
        ? '(?:minimize|prefer\\s+lower)'
        : '(?:maximize|prefer\\s+higher)';
    if (
      !asserted(
        evidence,
        `For\\s+${joined(b.entities.map((e) => e.label))},\\s*${direction}\\s+${literal(label)}\\s+during\\s+${literal(b.period)}\\s+among\\s+${literal(b.population)}`,
        [...b.entities.map((e) => e.label), label, b.period, b.population],
        conditionFor(evidence.text, b.story.condition),
      )
    )
      return mechanismIssue(
        ctx,
        'direction must bind all candidate names, this criterion and its own scope',
      );
    criteria.push({
      id: expansionEntityId('26', b.entities.length + index),
      label,
      direction: entry.direction,
      evidence: evidence.span,
    });
  }
  if (
    !asserted(
      b.spans.setup,
      `${named(b.story.subject)}:\\s*Options\\s+${joined(b.entities.map((e) => e.label))}\\s+(?:compare|report)\\s+${joined(criteria.map((c) => c.label))}\\s+during\\s+${literal(b.period)}\\s+among\\s+${literal(b.population)}`,
      [
        ...b.entities.map((e) => e.label),
        ...criteria.map((c) => c.label),
        `${b.period} among ${b.population}`,
      ],
      conditionFor(b.spans.setup, b.story.condition),
    )
  )
    return mechanismIssue(
      ctx,
      'setup must identify every candidate, criterion and the common comparison scope',
    );
  const entries = matrix(raw.records, b.entities.length * criteria.length, ctx);
  if (!entries) return null;
  const records: ParetoMetricRecord[] = [];
  for (const [index, entry] of entries.entries()) {
    if (!onlyFields(entry, ['option', 'criterion', 'quantity'], ctx)) return null;
    const option = reference(entry.option, b.entities, ctx);
    const criterion =
      typeof entry.criterion === 'string'
        ? criteria.find((c) => key(c.label) === key(entry.criterion as string))
        : undefined;
    const quantity = parseExpansionQuantity(entry.quantity, ctx);
    if (!option || !criterion || !quantity)
      return mechanismIssue(ctx, 'every option/criterion needs one complete locally owned metric');
    if (
      records.some((r) => r.optionId === option.id && r.criterionId === criterion.id) ||
      key(quantity.actor) !== key(option.label) ||
      key(quantity.claim) !== key(criterion.label) ||
      key(quantity.basis.period) !== key(b.period) ||
      key(quantity.basis.population) !== key(b.population)
    )
      return mechanismIssue(
        ctx,
        'metric must own this exact candidate, criterion, period and population',
      );
    const prior = records.find((r) => r.criterionId === criterion.id);
    if (prior && !compatibleBasis(prior.quantity.basis, quantity.basis))
      return mechanismIssue(
        ctx,
        'each criterion needs identical unit and denominator basis across candidates; no conversions or weights',
      );
    const supplied =
      quantity.state === 'disputed'
        ? quantity.alternatives
        : 'amount' in quantity
          ? [quantity.amount]
          : [];
    if (supplied.some((a) => a.kind !== 'rational'))
      return mechanismIssue(
        ctx,
        'this authored Pareto route accepts exact scalar rationals, not currency conversions',
      );
    records.push({
      id: expansionEntityId('26', b.entities.length + criteria.length + index),
      optionId: option.id,
      criterionId: criterion.id,
      quantity,
    });
  }
  const comparison = expansionSourceSpan(raw.comparisonEvidence, ctx);
  if (
    !comparison ||
    !asserted(
      comparison,
      `${joined(b.entities.map((e) => e.label))}\\s+(?:use\\s+the\\s+same|share\\s+the\\s+same)\\s+${joined(criteria.map((c) => c.label))}\\s+measurement\\s+bases\\s+during\\s+${literal(b.period)}\\s+among\\s+${literal(b.population)}`,
      [
        ...b.entities.map((e) => e.label),
        ...criteria.map((c) => c.label),
        `${b.period} among ${b.population}`,
      ],
      conditionFor(comparison?.text ?? '', b.story.condition),
    )
  )
    return mechanismIssue(
      ctx,
      'comparison needs the complete named candidate/criterion common-basis source relation',
    );
  if (
    !stateClause(
      b.spans.resolve,
      `${named(b.story.subject)}\\s+(?:retains|keeps)\\s+(?:only\\s+)?scope-bound\\s+tradeoffs\\s+rather\\s+than\\s+(?:a\\s+)?universal\\s+winner`,
    )
  )
    return mechanismIssue(ctx, 'nondominance is a scoped tradeoff, never universal superiority');
  let result: ParetoFrontierResult = { state: 'source-qualified' };
  if (!b.story.condition && records.every((r) => r.quantity.state === 'known')) {
    if (!isDerivationAllowed('26', 'pareto'))
      return mechanismIssue(ctx, 'catalog forbids this Pareto operation');
    const operands: ParetoOperand[] = [];
    for (const record of records) {
      if (record.quantity.state !== 'known' || record.quantity.amount.kind !== 'rational')
        return mechanismIssue(ctx, 'known-only Pareto never fills absent or qualified metrics');
      operands.push({
        recordId: record.id,
        optionId: record.optionId,
        criterionId: record.criterionId,
        value: record.quantity.amount.value,
        basis: record.quantity.basis,
        evidence: record.quantity.evidence,
      });
    }
    const dominations: { fromId: string; toId: string }[] = [];
    for (const a of b.entities)
      for (const z of b.entities) {
        if (a.id === z.id) continue;
        let weaklyBetter = true,
          strictlyBetter = false;
        for (const criterion of criteria) {
          const left = operands.find(
            (o) => o.optionId === a.id && o.criterionId === criterion.id,
          )?.value;
          const right = operands.find(
            (o) => o.optionId === z.id && o.criterionId === criterion.id,
          )?.value;
          if (!left || !right)
            return mechanismIssue(ctx, 'frontier requires the complete comparable matrix');
          const order = compare(left as ExpansionRational, right as ExpansionRational);
          if (!order.ok)
            return mechanismIssue(ctx, `exact Pareto comparison rejected: ${order.error}`);
          const better = criterion.direction === 'minimize' ? -1 : 1;
          if (order.value !== 0 && order.value !== better) weaklyBetter = false;
          if (order.value === better) strictlyBetter = true;
        }
        if (weaklyBetter && strictlyBetter) dominations.push({ fromId: a.id, toId: z.id });
      }
    if (dominations.length > EXPANSION_LIMITS.relations)
      return mechanismIssue(ctx, 'bounded frontier cannot exceed sixteen relations');
    result = {
      state: 'derived',
      operation: 'pareto',
      operands,
      dominations,
      nondominatedOptionIds: b.entities
        .filter((e) => !dominations.some((d) => d.toId === e.id))
        .map((e) => e.id),
    };
  }
  return {
    ...b.story,
    storyId: '26',
    kind: 'tradeoff-frontier',
    preset: 'pareto',
    entities: b.entities,
    period: b.period,
    population: b.population,
    criteria,
    records,
    comparisonEvidence: comparison.span,
    result,
    sourceSpans: b.sourceSpans,
    meaning: 'nondominated-not-universal-superiority',
  };
}
