/** Source-grounded contracts for expansion 11–12; no renderers or global KindSpec. */
import type {
  ExpansionConditioningScene,
  ExpansionPopulationCount,
  ExpansionPopulationDisplay,
  ExpansionSamplingEligibility,
  ExpansionSamplingMeasurement,
  ExpansionSelectionBiasScene,
} from '../../remotion/compositions/explainer/expansion/probability/conditioning-sampling-types';
import type { ExpansionEntity } from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  compare,
  divide,
  isDerivationAllowed,
  rational,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  EXPANSION_LIMITS,
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

const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
type Base = NonNullable<ReturnType<typeof expansionStoryBase>>;

function normalized(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/’/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
function literal(text: string): string {
  return normalized(text)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function match(text: string, body: string): boolean {
  return new RegExp(`^(?:${body})$`, 'iu').test(normalized(text).replace(/\.$/, ''));
}
function quoted(text: string): string {
  return `(?:"${literal(text)}"|${literal(text)})`;
}
function label(
  raw: unknown,
  evidence: ExpansionSourceEvidence | string,
  ctx: ParseContext,
): string | null {
  const value = expansionSourceLabel(raw, evidence, ctx, EXPANSION_LIMITS.qualifier);
  return value && !/["“”{}[\]\\;]|=>/.test(value)
    ? value
    : mechanismIssue(ctx, 'selection rules must be bounded plain local source text');
}
function reference(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  return (
    (typeof raw === 'string' ? entities.find((entity) => entity.label === raw) : undefined) ??
    mechanismIssue(ctx, 'use an exact declared entity label, never a caller ID or alias')
  );
}
function baseStory(
  raw: Rec,
  ctx: ParseContext,
  id: '11' | '12',
  fields: readonly string[],
): Base | null {
  const base = expansionStoryBase(raw, ctx, id, fields);
  if (!base) return null;
  const indices = BEATS.map((field) => ctx.inWin(raw[field]));
  if (indices[0] !== ctx.win.startWord)
    return mechanismIssue(ctx, 'setup must begin the complete source window');
  for (const [index, fromWord] of indices.entries()) {
    const next = indices[index + 1];
    const toWord =
      index === 4 ? ctx.win.endWord : next === null || next === undefined ? null : next - 1;
    if (fromWord === null || toWord === null || !expansionSourceSpan({ fromWord, toWord }, ctx))
      return mechanismIssue(
        ctx,
        'five ordered beats must introduce five complete local source clauses',
      );
  }
  return base;
}

/** No conversion, rounding, default zero or unknown-as-zero count. */
function knownCount(quantity: ExpansionQuantity): ExpansionRational | undefined {
  return quantity.state === 'known' &&
    quantity.basis.unit === 'count' &&
    quantity.amount.kind === 'rational'
    ? quantity.amount.value
    : undefined;
}
function countShape(quantity: ExpansionQuantity, ctx: ParseContext): boolean {
  if (quantity.basis.unit !== 'count' || quantity.basis.denominator !== undefined) {
    mechanismIssue(
      ctx,
      'population counts need count units, not a hidden rate or invented denominator',
    );
    return false;
  }
  const amounts =
    quantity.state === 'disputed'
      ? quantity.alternatives
      : 'amount' in quantity
        ? [quantity.amount]
        : [];
  if (
    amounts.some(
      (amount) =>
        amount.kind !== 'rational' || amount.value.denominator !== 1 || amount.value.numerator < 0,
    )
  ) {
    mechanismIssue(ctx, 'population counts must retain exact nonnegative integer source amounts');
    return false;
  }
  return true;
}
function display(
  raw: unknown,
  quantity: ExpansionQuantity,
  ctx: ParseContext,
): ExpansionPopulationDisplay | undefined | null {
  const amount = knownCount(quantity);
  if (!amount) {
    return raw === undefined
      ? undefined
      : mechanismIssue(
          ctx,
          'qualified, unknown, missing and disputed quantities cannot be rendered as a definite population',
        );
  }
  if (
    !isRec(raw) ||
    !onlyFields(raw, ['mode', 'marks'], ctx) ||
    (raw.mode !== 'individual' && raw.mode !== 'aggregate') ||
    typeof raw.marks !== 'number' ||
    !Number.isSafeInteger(raw.marks) ||
    raw.marks < 0 ||
    raw.marks > EXPANSION_LIMITS.populationMarks
  )
    return mechanismIssue(
      ctx,
      'known counts need an explicit individual/aggregate display with at most 100 marks',
    );
  if (amount.numerator === 0) {
    if (raw.mode !== 'individual' || raw.marks !== 0)
      return mechanismIssue(ctx, 'only a source-stated known zero can have zero individual marks');
    return { mode: 'individual', marks: 0, membersPerMark: { numerator: 1, denominator: 1 } };
  }
  if (
    raw.marks === 0 ||
    (raw.mode === 'individual' && raw.marks !== amount.numerator) ||
    (raw.mode === 'aggregate' && raw.marks >= amount.numerator)
  )
    return mechanismIssue(
      ctx,
      'individual marks must equal the source count; large counts require explicit aggregation rather than truncation',
    );
  const divisor = rational(raw.marks);
  const weight = divisor.ok ? divide(amount, divisor.value) : divisor;
  if (!weight.ok) return mechanismIssue(ctx, 'aggregate mark weight must be exact and bounded');
  return { mode: raw.mode, marks: raw.marks, membersPerMark: weight.value };
}
function countRecord(raw: unknown, ctx: ParseContext): ExpansionPopulationCount | null {
  if (!isRec(raw) || !onlyFields(raw, ['quantity', 'display'], ctx))
    return mechanismIssue(
      ctx,
      'count records need only a source quantity and optional explicit display',
    );
  const quantity = parseExpansionQuantity(raw.quantity, ctx);
  if (!quantity || !countShape(quantity, ctx)) return null;
  const populationDisplay = display(raw.display, quantity, ctx);
  return populationDisplay === null
    ? null
    : { quantity, ...(populationDisplay ? { display: populationDisplay } : {}) };
}
function within(
  first: ExpansionRational | undefined,
  second: ExpansionRational | undefined,
  ctx: ParseContext,
): boolean {
  if (!first || !second) return true; // No fabricated inequality or zero for an unknown operand.
  const result = compare(first, second);
  if (!result.ok || result.value > 0) {
    mechanismIssue(
      ctx,
      'stated event count must not exceed subset count, nor subset the original population',
    );
    return false;
  }
  return true;
}

export function parseExpansionConditioning(
  raw: Rec,
  ctx: ParseContext,
): ExpansionConditioningScene | null {
  if (!isRec(raw)) return mechanismIssue(ctx, 'conditioning proposal must be an object');
  const base = baseStory(raw, ctx, '11', [
    'entities',
    'owner',
    'population',
    'event',
    'subset',
    'denominator',
    'inclusion',
    'counts',
    'derive',
  ]);
  if (!base) return null;
  const entities = expansionEntities(raw.entities, ctx, '11');
  if (!entities) return null;
  const owner = reference(raw.owner, entities, ctx);
  const population = reference(raw.population, entities, ctx);
  const event = reference(raw.event, entities, ctx);
  const subset = reference(raw.subset, entities, ctx);
  const denominator = reference(raw.denominator, entities, ctx);
  if (!owner || !population || !event || !subset || !denominator) return null;
  if (
    new Set([owner.id, population.id, event.id, subset.id]).size !== 4 ||
    denominator.id !== subset.id ||
    entities.length !== 4
  )
    return mechanismIssue(
      ctx,
      'conditioning needs distinct owner, original population, event and subset identities; the subset is the denominator',
    );
  if (base.story.subject !== owner.label || base.story.label !== population.label)
    return mechanismIssue(
      ctx,
      'conditioning title/subject must name its source population and owner',
    );
  if (!isRec(raw.inclusion) || !onlyFields(raw.inclusion, ['rule', 'evidence'], ctx))
    return mechanismIssue(ctx, 'include an explicit locally grounded subset inclusion rule');
  const evidence = expansionSourceSpan(raw.inclusion.evidence, ctx);
  if (!evidence || evidence.text !== base.spans.setup)
    return mechanismIssue(ctx, 'inclusion must be stated in the complete setup clause');
  const rule = label(raw.inclusion.rule, evidence, ctx);
  if (!rule) return null;
  const intro = `${literal(owner.label)}'s\\s+${literal(population.label)}`;
  const inclusion = `(?:${intro}\\s+(?:includes|contains)\\s+(?:the\\s+)?${literal(subset.label)}\\s+subset\\s+for\\s+(?:the\\s+)?${literal(event.label)}\\s+event\\s+under\\s+(?:selection\\s+)?rule\\s+${quoted(rule)}|${intro}\\s+selects\\s+(?:the\\s+)?${literal(subset.label)}\\s+subset\\s+by\\s+rule\\s+${quoted(rule)}\\s+for\\s+(?:the\\s+)?${literal(event.label)}\\s+event)`;
  if (!match(evidence.text, inclusion))
    return mechanismIssue(
      ctx,
      'inclusion must locally bind the actual owner, original population, event, subset and full authored rule',
    );
  if (!isRec(raw.counts) || !onlyFields(raw.counts, ['population', 'subset', 'event'], ctx))
    return mechanismIssue(
      ctx,
      'conditioning counts must preserve the original, subset and subset-event records',
    );
  const original = countRecord(raw.counts.population, ctx);
  const subsetCount = countRecord(raw.counts.subset, ctx);
  const eventCount = countRecord(raw.counts.event, ctx);
  if (!original || !subsetCount || !eventCount) return null;
  const records = [original, subsetCount, eventCount];
  const roles = ['population count', 'subset count', `${event.label} count`];
  const groups = [population.label, subset.label, subset.label];
  const sourceClauses = [base.spans.action, base.spans.response, base.spans.check];
  const period = original.quantity.basis.period;
  for (const [index, record] of records.entries()) {
    const quantity = record.quantity;
    const local = expansionSourceSpan(quantity.evidence, ctx);
    if (
      !local ||
      local.text !== sourceClauses[index] ||
      quantity.actor !== `${owner.label}'s ${population.label}` ||
      quantity.claim !== roles[index] ||
      quantity.basis.population !== groups[index] ||
      quantity.basis.period !== period
    )
      return mechanismIssue(
        ctx,
        'each count must bind its owner/population, correct count role, exact period and denominator group in its own phase clause',
      );
    if (quantity.state === 'conditional' && quantity.condition !== base.story.condition)
      return mechanismIssue(ctx, 'conditional counts must retain the exact stated scene condition');
    if (
      (quantity.state === 'illustrative' || quantity.state === 'simulated') &&
      base.story.evidence !== 'illustrative'
    )
      return mechanismIssue(
        ctx,
        'teaching/simulated population quantities must remain visibly illustrative',
      );
  }
  if (
    records.reduce((total, record) => total + (record.display?.marks ?? 0), 0) >
    EXPANSION_LIMITS.populationMarks
  )
    return mechanismIssue(
      ctx,
      'at most 100 displayed population marks across all trays; aggregate explicitly',
    );
  const originalValue = knownCount(original.quantity);
  const subsetValue = knownCount(subsetCount.quantity);
  const eventValue = knownCount(eventCount.quantity);
  if (!within(eventValue, subsetValue, ctx) || !within(subsetValue, originalValue, ctx))
    return null;
  const conclusion = `${literal(owner.label)}'s\\s+denominator\\s+for\\s+${literal(event.label)}\\s+(?:is|remains|stays)\\s+${literal(subset.label)}(?:,\\s*not\\s+${literal(population.label)})?`;
  if (base.story.outcome !== subset.label || !match(base.spans.resolve, conclusion))
    return mechanismIssue(
      ctx,
      'resolve must state the event denominator as this exact subset, not the original population or another actor scope',
    );
  let derived: ExpansionConditioningScene['derived'];
  if (raw.derive !== undefined) {
    if (
      raw.derive !== 'ratio' ||
      !isDerivationAllowed('11', 'ratio') ||
      !eventValue ||
      !subsetValue ||
      subsetValue.numerator <= 0
    )
      return mechanismIssue(
        ctx,
        'only a whitelisted exact ratio of source-known event/subset counts with a positive denominator may be derived',
      );
    const result = divide(eventValue, subsetValue);
    if (!result.ok) return mechanismIssue(ctx, 'conditioning ratio must remain exact and bounded');
    derived = {
      state: 'derived',
      operation: 'ratio',
      operands: [eventValue, subsetValue],
      result: result.value,
      basis: { unit: 'ratio', period, population: subset.label, denominator: subsetValue },
      evidence: [eventCount.quantity.evidence, subsetCount.quantity.evidence],
    };
  }
  return {
    ...base.story,
    storyId: '11',
    kind: 'probability-workbench',
    preset: 'conditioning',
    entities,
    ownerId: owner.id,
    populationId: population.id,
    eventId: event.id,
    subsetId: subset.id,
    denominatorId: denominator.id,
    inclusion: { rule, evidence: evidence.span },
    counts: { population: original, subset: subsetCount, event: eventCount },
    ...(derived ? { derived } : {}),
    resolutionText: base.spans.resolve,
  };
}

interface EligibilityInput {
  group: ExpansionEntity;
  rule: string;
  status: 'represented' | 'excluded';
  evidence: ExpansionSourceEvidence;
}

export function parseExpansionSelectionBias(
  raw: Rec,
  ctx: ParseContext,
): ExpansionSelectionBiasScene | null {
  if (!isRec(raw)) return mechanismIssue(ctx, 'selection-bias proposal must be an object');
  const base = baseStory(raw, ctx, '12', [
    'entities',
    'owner',
    'frame',
    'selection',
    'eligibility',
    'measurements',
    'resolveGroup',
  ]);
  if (!base) return null;
  const entities = expansionEntities(raw.entities, ctx, '12');
  if (!entities) return null;
  const owner = reference(raw.owner, entities, ctx);
  const frame = reference(raw.frame, entities, ctx);
  if (
    !owner ||
    !frame ||
    owner.id === frame.id ||
    base.story.subject !== owner.label ||
    base.story.label !== frame.label
  )
    return mechanismIssue(
      ctx,
      'selection needs a distinct named frame and its actual source owner',
    );
  if (!isRec(raw.selection) || !onlyFields(raw.selection, ['rule', 'evidence'], ctx))
    return mechanismIssue(ctx, 'selection needs a source-stated rule and local evidence');
  const setupEvidence = expansionSourceSpan(raw.selection.evidence, ctx);
  if (!setupEvidence || setupEvidence.text !== base.spans.setup)
    return mechanismIssue(ctx, 'selection rule must be introduced in the complete setup clause');
  const rule = label(raw.selection.rule, setupEvidence, ctx);
  if (!rule) return null;
  const scope = `${literal(owner.label)}'s\\s+${literal(frame.label)}`;
  if (
    !match(
      setupEvidence.text,
      `${scope}\\s+(?:uses|applies|follows)\\s+(?:selection\\s+)?rule\\s+${quoted(rule)}`,
    )
  )
    return mechanismIssue(
      ctx,
      'rule must locally belong to the actual owner and named selection frame',
    );
  if (
    !Array.isArray(raw.eligibility) ||
    raw.eligibility.length < 2 ||
    raw.eligibility.length > EXPANSION_LIMITS.records
  )
    return mechanismIssue(
      ctx,
      'selection needs bounded explicit represented and excluded group records',
    );
  const entries: EligibilityInput[] = [];
  for (const entry of raw.eligibility) {
    if (!isRec(entry) || !onlyFields(entry, ['group', 'rule', 'status', 'evidence'], ctx))
      return mechanismIssue(
        ctx,
        'eligibility records contain only group, rule, status and evidence',
      );
    const group = reference(entry.group, entities, ctx);
    const evidence = expansionSourceSpan(entry.evidence, ctx);
    if (!group || !evidence) return null;
    const localRule = label(entry.rule, evidence, ctx);
    if (
      !localRule ||
      localRule !== rule ||
      (entry.status !== 'represented' && entry.status !== 'excluded') ||
      group.id === owner.id ||
      group.id === frame.id ||
      entries.some((candidate) => candidate.group.id === group.id)
    )
      return mechanismIssue(
        ctx,
        'eligibility must retain a distinct declared group and the exact selection rule/status',
      );
    entries.push({ group, rule: localRule, status: entry.status, evidence });
  }
  if (
    !entries.some((entry) => entry.status === 'represented') ||
    !entries.some((entry) => entry.status === 'excluded')
  )
    return mechanismIssue(
      ctx,
      'the source must explicitly name both represented and excluded groups',
    );
  const evidenceGroups = new Map<string, EligibilityInput[]>();
  for (const entry of entries) {
    const key = `${entry.evidence.span.fromWord}:${entry.evidence.span.toWord}`;
    const peers = evidenceGroups.get(key) ?? [];
    peers.push(entry);
    evidenceGroups.set(key, peers);
  }
  for (const peers of evidenceGroups.values()) {
    const first = peers[0];
    if (peers.some((entry) => entry.status !== first.status))
      return mechanismIssue(
        ctx,
        'do not infer mixed inclusion/exclusion from a shared ambiguous clause',
      );
    const verb =
      first.status === 'represented'
        ? '(?:represents|covers|includes)'
        : '(?:excludes|does not cover|does not represent)';
    const names = peers.map((entry) => literal(entry.group.label)).join('\\s+and\\s+');
    const body = `${scope}\\s+${verb}\\s+${names}\\s+(?:under|using)\\s+(?:selection\\s+)?rule\\s+${quoted(rule)}`;
    if (!match(first.evidence.text, body))
      return mechanismIssue(
        ctx,
        'eligibility must explicitly bind the actual owner/frame, complete group labels and rule in one entire local clause',
      );
    if (
      first.evidence.text !== base.spans.action &&
      first.evidence.text !== base.spans.response &&
      first.evidence.text !== base.spans.check
    )
      return mechanismIssue(ctx, 'eligibility must belong to an action, response or check clause');
  }
  if (
    !Array.isArray(raw.measurements) ||
    raw.measurements.length + entries.length > EXPANSION_LIMITS.records
  )
    return mechanismIssue(
      ctx,
      'selection eligibility plus source measurement records must stay within twelve',
    );
  const measurements: ExpansionSamplingMeasurement[] = [];
  const consumed = new Set(entries.map((entry) => entry.evidence.text));
  for (const entry of raw.measurements) {
    if (!isRec(entry) || !onlyFields(entry, ['quantity', 'display'], ctx))
      return mechanismIssue(
        ctx,
        'selection measurements contain only a source quantity and optional count display',
      );
    const quantity = parseExpansionQuantity(entry.quantity, ctx);
    if (!quantity) return null;
    const group = entries.find(
      (candidate) => candidate.group.label === quantity.basis.population,
    )?.group;
    const evidence = expansionSourceSpan(quantity.evidence, ctx);
    if (
      !group ||
      !evidence ||
      quantity.actor !== `${owner.label}'s ${frame.label}` ||
      ![base.spans.action, base.spans.response, base.spans.check].includes(evidence.text)
    )
      return mechanismIssue(
        ctx,
        'a measurement must bind this owner/frame and an explicitly represented/excluded group in its own source clause',
      );
    if (quantity.state === 'conditional' && quantity.condition !== base.story.condition)
      return mechanismIssue(
        ctx,
        'selection measurements must preserve their exact local condition',
      );
    if (
      (quantity.state === 'illustrative' || quantity.state === 'simulated') &&
      base.story.evidence !== 'illustrative'
    )
      return mechanismIssue(
        ctx,
        'illustrative/simulated sampling measurements cannot become observed demographics',
      );
    let populationDisplay: ExpansionPopulationDisplay | undefined | null;
    if (quantity.basis.unit === 'count') {
      if (!countShape(quantity, ctx)) return null;
      populationDisplay = display(entry.display, quantity, ctx);
      if (populationDisplay === null) return null;
    } else if (entry.display !== undefined)
      return mechanismIssue(
        ctx,
        'rates and unknown demographics must not become anonymous population marks',
      );
    measurements.push({
      groupId: group.id,
      quantity,
      ...(populationDisplay ? { display: populationDisplay } : {}),
    });
    consumed.add(evidence.text);
  }
  if (
    measurements.reduce((total, record) => total + (record.display?.marks ?? 0), 0) >
    EXPANSION_LIMITS.populationMarks
  )
    return mechanismIssue(
      ctx,
      'sampling displays need explicit aggregation within the total 100-mark ceiling',
    );
  for (const clause of [base.spans.action, base.spans.response, base.spans.check]) {
    if (!consumed.has(clause))
      return mechanismIssue(
        ctx,
        'each selection phase must have validated local eligibility or measurement evidence, not unbound demographic claims',
      );
  }
  const resolveGroup = reference(raw.resolveGroup, entities, ctx);
  if (
    !resolveGroup ||
    !entries.some((entry) => entry.group.id === resolveGroup.id && entry.status === 'excluded')
  )
    return mechanismIssue(
      ctx,
      'resolution must identify one source-excluded group, not infer absent people',
    );
  const conclusion = `${scope}\\s+(?:keeps|leaves)\\s+${literal(resolveGroup.label)}\\s+excluded from\\s+${literal(frame.label)},\\s*not absent from the (?:population|world)`;
  if (
    base.story.outcome !== `excluded from ${frame.label}` ||
    !match(base.spans.resolve, conclusion)
  )
    return mechanismIssue(
      ctx,
      'resolution must preserve exclusion from this frame, explicitly not absence from the world/population',
    );
  const used = new Set([owner.id, frame.id, ...entries.map((entry) => entry.group.id)]);
  if (entities.some((entity) => !used.has(entity.id)))
    return mechanismIssue(
      ctx,
      'selection entities must be bound source actors, frame or explicitly qualified groups',
    );
  const eligibility: ExpansionSamplingEligibility[] = entries.map((entry) => ({
    ownerId: owner.id,
    frameId: frame.id,
    groupId: entry.group.id,
    rule: entry.rule,
    status: entry.status,
    scope: 'sampling-frame',
    evidence: entry.evidence.span,
  }));
  return {
    ...base.story,
    storyId: '12',
    kind: 'sampling-frame',
    preset: 'selection-bias',
    entities,
    ownerId: owner.id,
    frameId: frame.id,
    selection: { rule, evidence: setupEvidence.span },
    eligibility,
    representedIds: entries
      .filter((entry) => entry.status === 'represented')
      .map((entry) => entry.group.id),
    excludedIds: entries
      .filter((entry) => entry.status === 'excluded')
      .map((entry) => entry.group.id),
    measurements,
    resolveGroupId: resolveGroup.id,
    resolutionText: base.spans.resolve,
  };
}
