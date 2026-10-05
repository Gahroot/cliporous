/** Local, source-owned quantity contracts. Arithmetic is never a model expression. */
import type {
  ExpansionDenominatorDerived,
  ExpansionDenominatorRecord,
  ExpansionDenominatorScene,
  ExpansionPartitionRecord,
  ExpansionPartitionScene,
} from '../../remotion/compositions/explainer/expansion/quantities/denominator-partition-types';
import type {
  ExpansionEntity,
  ExpansionRelation,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  add,
  compare,
  compatibleBasis,
  divide,
  isDerivationAllowed,
  multiply,
  rational,
  subtract,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  EXPANSION_LIMITS,
  type ExpansionAmount,
  type ExpansionBasis,
  type ExpansionQuantity,
  type ExpansionRational,
} from '../../remotion/compositions/explainer/expansion/value-types';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import {
  type ExpansionSourceEvidence,
  expansionEntities,
  expansionSourceSpan,
  expansionStoryBase,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

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
function ref(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  return (
    (typeof raw === 'string' ? entities.find((entity) => entity.label === raw) : undefined) ??
    mechanismIssue(
      ctx,
      'references must use exact declared entity labels, never caller IDs or aliases',
    )
  );
}
function scope(owner: ExpansionEntity, whole: ExpansionEntity): string {
  return `${owner.label}'s ${whole.label}`;
}
function amounts(quantity: ExpansionQuantity): readonly ExpansionAmount[] {
  return quantity.state === 'disputed'
    ? quantity.alternatives
    : 'amount' in quantity
      ? [quantity.amount]
      : [];
}
function exact(amount: ExpansionAmount, ctx: ParseContext): ExpansionRational | null {
  const result =
    amount.kind === 'money'
      ? rational(amount.value.minorUnits, 100)
      : rational(amount.value.numerator, amount.value.denominator);
  return result.ok
    ? result.value
    : mechanismIssue(ctx, 'source operands must fit the exact bounded arithmetic range');
}
function validateAmount(quantity: ExpansionQuantity, ctx: ParseContext): boolean {
  for (const amount of amounts(quantity)) {
    if (amount.kind === 'money' && amount.value.currency !== quantity.basis.unit) {
      mechanismIssue(ctx, 'money currency must equal its explicit source unit');
      return false;
    }
    if (amount.kind === 'rational' && ['USD', 'EUR', 'GBP'].includes(quantity.basis.unit)) {
      mechanismIssue(ctx, 'currency values must retain exact source minor-unit money');
      return false;
    }
    if (!exact(amount, ctx)) return false;
  }
  return true;
}
function known(quantity: ExpansionQuantity, ctx: ParseContext): ExpansionRational | null {
  return quantity.state === 'known'
    ? exact(quantity.amount, ctx)
    : mechanismIssue(
        ctx,
        'derivation requires complete known source operands, not missing, unknown, conditional, illustrative or disputed values',
      );
}
function positiveReference(quantity: ExpansionQuantity, ctx: ParseContext): boolean {
  for (const amount of amounts(quantity)) {
    const value = exact(amount, ctx);
    if (!value || value.numerator <= 0) {
      mechanismIssue(
        ctx,
        'reference totals must be positive; zero or negative denominators are not meaningful relative values',
      );
      return false;
    }
  }
  return true;
}
function sourceQuantity(raw: unknown, ctx: ParseContext): ExpansionQuantity | null {
  if (!isRec(raw))
    return mechanismIssue(ctx, 'a supplied amount, reference, total or part quantity is missing');
  const value = parseExpansionQuantity(raw, ctx);
  if (!value)
    return mechanismIssue(
      ctx,
      'quantity contains illegal fields, incomplete data or unbound source evidence',
    );
  return validateAmount(value, ctx) ? value : null;
}
function basisAcrossPeriods(first: ExpansionBasis, second: ExpansionBasis): boolean {
  return compatibleBasis(first, { ...second, period: first.period });
}

interface ComparisonInput {
  entity: ExpansionEntity;
  actor: ExpansionEntity;
  amount: ExpansionQuantity;
  reference: ExpansionQuantity;
}

export function parseExpansionDenominator(
  raw: Rec,
  ctx: ParseContext,
): ExpansionDenominatorScene | null {
  if (!isRec(raw)) return mechanismIssue(ctx, 'denominator proposal must be an object');
  const base = expansionStoryBase(raw, ctx, '19', [
    'entities',
    'owner',
    'metric',
    'comparisons',
    'ordering',
    'derive',
  ]);
  if (!base) return null;
  const entities = expansionEntities(raw.entities, ctx, '19');
  if (!entities) return null;
  const owner = ref(raw.owner, entities, ctx),
    metric = ref(raw.metric, entities, ctx);
  if (!owner || !metric) return null;
  if (
    owner.id === metric.id ||
    base.story.subject !== owner.label ||
    base.story.label !== metric.label
  )
    return mechanismIssue(ctx, 'named comparison must retain its distinct source owner and metric');
  if (!Array.isArray(raw.comparisons) || raw.comparisons.length !== 2)
    return mechanismIssue(
      ctx,
      'denominator comparison needs exactly two named source records with their own reference totals',
    );
  const records: ComparisonInput[] = [];
  for (const entry of raw.comparisons) {
    if (!isRec(entry) || !onlyFields(entry, ['entity', 'actor', 'amount', 'reference'], ctx))
      return mechanismIssue(
        ctx,
        'comparison records need only entity, actor, amount and explicit reference',
      );
    const entity = ref(entry.entity, entities, ctx),
      actor = ref(entry.actor, entities, ctx);
    const amount = sourceQuantity(entry.amount, ctx),
      reference = sourceQuantity(entry.reference, ctx);
    if (!entity || !actor || !amount || !reference) return null;
    if (
      entity.id === actor.id ||
      entity.id === owner.id ||
      entity.id === metric.id ||
      records.some((record) => record.entity.id === entity.id)
    )
      return mechanismIssue(
        ctx,
        'records need distinct named identities, separate from actors and metric',
      );
    if (
      amount.actor !== actor.label ||
      reference.actor !== actor.label ||
      amount.claim !== `${entity.label} ${metric.label} amount` ||
      reference.claim !== `${entity.label} ${metric.label} reference total` ||
      !compatibleBasis(amount.basis, reference.basis)
    )
      return mechanismIssue(
        ctx,
        'amount and reference must bind the same actor, record, metric, unit, population and period',
      );
    if (!positiveReference(reference, ctx)) return null;
    records.push({ entity, actor, amount, reference });
  }
  if (records.some((record) => records.some((other) => other.actor.id === record.entity.id)))
    return mechanismIssue(ctx, 'a named measurement record cannot masquerade as an actor');
  const used = new Set([
    owner.id,
    metric.id,
    ...records.flatMap((record) => [record.entity.id, record.actor.id]),
  ]);
  if (used.size !== entities.length)
    return mechanismIssue(ctx, 'unused/invented comparison entities are not accepted');
  const title = `${literal(owner.label)}'s\\s+${literal(metric.label)}\\s+comparison`;
  let ordering: ExpansionDenominatorScene['ordering'];
  if (raw.ordering !== undefined) {
    const input = raw.ordering;
    if (!isRec(input) || !onlyFields(input, ['from', 'to', 'evidence'], ctx))
      return mechanismIssue(
        ctx,
        'ordering needs two named records and complete local source evidence',
      );
    const from = records.find((record) => record.entity.label === input.from),
      to = records.find((record) => record.entity.label === input.to);
    const evidence = expansionSourceSpan(input.evidence, ctx);
    if (
      !from ||
      !to ||
      from === to ||
      !evidence ||
      from.actor.id !== to.actor.id ||
      from.actor.id !== owner.id ||
      !match(
        evidence.text,
        `${title}\\s+orders\\s+${literal(from.entity.label)}\\s+during\\s+${literal(from.amount.basis.period)}\\s+before\\s+${literal(to.entity.label)}\\s+during\\s+${literal(to.amount.basis.period)}`,
      ) ||
      evidence.text !== base.spans.setup
    )
      return mechanismIssue(
        ctx,
        'percent-change chronology must be explicitly actor/record/period-bound in setup, not inferred from labels or list order',
      );
    ordering = { fromId: from.entity.id, toId: to.entity.id, evidence: evidence.span };
  } else if (
    !match(
      base.spans.setup,
      `${title}\\s+(?:compares|contrasts|considers)\\s+${literal(records[0].entity.label)}\\s+and\\s+${literal(records[1].entity.label)}`,
    )
  )
    return mechanismIssue(
      ctx,
      'setup must name the owner, metric and both comparison records together',
    );
  const derived: ExpansionDenominatorDerived[] = [];
  if (raw.derive !== undefined) {
    if (!Array.isArray(raw.derive) || raw.derive.length < 1 || raw.derive.length > 4)
      return mechanismIssue(
        ctx,
        'at most four authored ratio/difference/percent-change requests are accepted',
      );
    const seen = new Set<string>();
    for (const request of raw.derive) {
      if (!isRec(request))
        return mechanismIssue(
          ctx,
          'derivation requests must be authored records, never expressions',
        );
      const operation = request.operation;
      if (operation !== 'ratio' && operation !== 'difference' && operation !== 'percent-change')
        return mechanismIssue(ctx, 'unsupported arithmetic operation');
      if (!isDerivationAllowed('19', operation))
        return mechanismIssue(ctx, 'operation is not catalog-whitelisted for story 19');
      const allowed =
        operation === 'ratio'
          ? ['operation', 'row']
          : operation === 'difference'
            ? ['operation', 'left', 'right']
            : ['operation', 'from', 'to'];
      if (!onlyFields(request, allowed, ctx)) return null;
      const first = records.find(
        (record) =>
          record.entity.label ===
          (operation === 'ratio'
            ? request.row
            : operation === 'difference'
              ? request.left
              : request.from),
      );
      const second =
        operation === 'ratio'
          ? first
          : records.find(
              (record) =>
                record.entity.label === (operation === 'difference' ? request.right : request.to),
            );
      if (!first || !second || (operation !== 'ratio' && first === second))
        return mechanismIssue(
          ctx,
          'derivation operands must identify the actual distinct source records',
        );
      const pair: readonly [ExpansionQuantity, ExpansionQuantity] =
        operation === 'ratio' ? [first.amount, first.reference] : [first.amount, second.amount];
      if (operation === 'difference' && !compatibleBasis(pair[0].basis, pair[1].basis))
        return mechanismIssue(
          ctx,
          'differences require compatible source units, populations and periods',
        );
      if (
        operation === 'percent-change' &&
        (!ordering ||
          ordering.fromId !== first.entity.id ||
          ordering.toId !== second.entity.id ||
          !basisAcrossPeriods(pair[0].basis, pair[1].basis))
      )
        return mechanismIssue(
          ctx,
          'percent change needs explicit source order and compatible source units/population; periods are retained separately',
        );
      const operands: readonly [ExpansionRational, ExpansionRational] | null = (() => {
        const a = known(pair[0], ctx),
          b = known(pair[1], ctx);
        return a && b ? [a, b] : null;
      })();
      if (!operands) return null;
      let result: ReturnType<typeof divide>;
      if (operation === 'ratio') result = divide(operands[0], operands[1]);
      else if (operation === 'difference') result = subtract(operands[0], operands[1]);
      else {
        if (operands[0].numerator <= 0)
          return mechanismIssue(
            ctx,
            'percent-change baseline must be positive; zero/negative bases are not promoted into a percentage',
          );
        const change = subtract(operands[1], operands[0]);
        const fraction = change.ok ? divide(change.value, operands[0]) : change;
        result = fraction.ok
          ? multiply(fraction.value, { numerator: 100, denominator: 1 })
          : fraction;
      }
      if (!result.ok)
        return mechanismIssue(
          ctx,
          'derivation overflow or zero denominator; no approximate fallback',
        );
      const key = `${operation}/${first.entity.id}/${second.entity.id}`;
      if (seen.has(key)) return mechanismIssue(ctx, 'duplicate derivation request');
      seen.add(key);
      const basis: ExpansionBasis =
        operation === 'ratio'
          ? { ...pair[0].basis, unit: 'ratio', denominator: operands[1] }
          : operation === 'percent-change'
            ? { ...pair[1].basis, unit: 'percent-change' }
            : {
                ...pair[0].basis,
                unit: pair[0].basis.unit === 'percent' ? 'percentage-point' : pair[0].basis.unit,
              };
      derived.push({
        state: 'derived',
        operation,
        operands,
        result: result.value,
        basis,
        evidence: pair.map((quantity) => quantity.evidence),
        sourceQuantities: pair,
        operandBases: [pair[0].basis, pair[1].basis],
      });
    }
  }
  if (
    !match(
      base.spans.resolve,
      `${title}\\s+(?:keeps|retains|preserves)\\s+amounts and reference totals distinct`,
    )
  )
    return mechanismIssue(
      ctx,
      'resolve must preserve the named source comparison, not certify a winner or invent a relative result',
    );
  return {
    ...base.story,
    storyId: '19',
    kind: 'quantity-comparison',
    preset: 'denominator',
    entities,
    ownerId: owner.id,
    metricId: metric.id,
    comparisons: records.map(
      (record): ExpansionDenominatorRecord => ({
        entityId: record.entity.id,
        actorId: record.actor.id,
        amount: record.amount,
        reference: record.reference,
      }),
    ),
    ...(ordering ? { ordering } : {}),
    derived,
    resolutionText: base.spans.resolve,
  };
}

interface PartInput {
  entity: ExpansionEntity;
  role: 'part' | 'remainder';
  quantity: ExpansionQuantity;
  membership: ExpansionSourceEvidence;
}
function membershipBody(
  owner: ExpansionEntity,
  whole: ExpansionEntity,
  parts: readonly PartInput[],
): string {
  const names = parts.map((part) => literal(part.entity.label));
  const list =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]}\\s+and\\s+${names[1]}`
        : `${names.slice(0, -1).join(',\\s+')}\\s*,?\\s+and\\s+${names.at(-1)}`;
  return `${literal(scope(owner, whole))}\\s+(?:includes|contains|comprises)\\s+${list}\\s+as\\s+(?:a part|parts)\\s+(?:of\\s+${literal(whole.label)})?`;
}

export function parseExpansionPartition(
  raw: Rec,
  ctx: ParseContext,
): ExpansionPartitionScene | null {
  if (!isRec(raw)) return mechanismIssue(ctx, 'partition proposal must be an object');
  const base: Base | null = expansionStoryBase(raw, ctx, '20', [
    'entities',
    'owner',
    'whole',
    'total',
    'parts',
  ]);
  if (!base) return null;
  const entities = expansionEntities(raw.entities, ctx, '20');
  if (!entities) return null;
  const owner = ref(raw.owner, entities, ctx),
    whole = ref(raw.whole, entities, ctx);
  if (!owner || !whole) return null;
  if (
    owner.id === whole.id ||
    base.story.subject !== owner.label ||
    base.story.label !== whole.label
  )
    return mechanismIssue(ctx, 'partition needs distinct source owner and whole identities');
  const total = sourceQuantity(raw.total, ctx);
  if (!total) return null;
  if (total.actor !== scope(owner, whole) || total.claim !== 'total')
    return mechanismIssue(ctx, 'total must be locally attributed to this owner and whole');
  if (
    !Array.isArray(raw.parts) ||
    raw.parts.length < 2 ||
    raw.parts.length > EXPANSION_LIMITS.records ||
    raw.parts.length > EXPANSION_LIMITS.relations
  )
    return mechanismIssue(
      ctx,
      'partition needs 2–12 supplied part records, bounded to 16 membership links',
    );
  const parts: PartInput[] = [];
  for (const entry of raw.parts) {
    if (!isRec(entry) || !onlyFields(entry, ['entity', 'role', 'quantity', 'membership'], ctx))
      return mechanismIssue(
        ctx,
        'parts need exact entity, part/remainder role, source quantity and membership evidence',
      );
    const entity = ref(entry.entity, entities, ctx),
      quantity = sourceQuantity(entry.quantity, ctx),
      membership = expansionSourceSpan(entry.membership, ctx);
    if (!entity || !quantity || !membership) return null;
    if (
      (entry.role !== 'part' && entry.role !== 'remainder') ||
      entity.id === owner.id ||
      entity.id === whole.id ||
      parts.some((part) => part.entity.id === entity.id)
    )
      return mechanismIssue(
        ctx,
        'part identities and part/remainder roles must be distinct and authored',
      );
    if (
      quantity.actor !== scope(owner, whole) ||
      quantity.claim !== `${entity.label} part` ||
      !compatibleBasis(quantity.basis, total.basis)
    )
      return mechanismIssue(
        ctx,
        'each part must bind its actual owner/whole/label and the supplied total unit, population and period',
      );
    parts.push({ entity, quantity, membership, role: entry.role });
  }
  if (
    parts.filter((part) => part.role === 'remainder').length !== 1 ||
    !parts.some((part) => part.role === 'part')
  )
    return mechanismIssue(
      ctx,
      'one explicitly source-supplied remainder is required; it is never inferred from a gap',
    );
  if (
    new Set([owner.id, whole.id, ...parts.map((part) => part.entity.id)]).size !== entities.length
  )
    return mechanismIssue(ctx, 'unused/invented partition entities are not accepted');
  const relations: ExpansionRelation[] = [];
  for (const part of parts) {
    const local = parts.filter(
      (other) =>
        other.membership.span.fromWord === part.membership.span.fromWord &&
        other.membership.span.toWord === part.membership.span.toWord,
    );
    if (!match(part.membership.text, membershipBody(owner, whole, local)))
      return mechanismIssue(
        ctx,
        'complete local membership must explicitly bind this owner, whole and every named part; labels alone do not prove inclusion',
      );
    relations.push({
      fromId: part.entity.id,
      toId: whole.id,
      role: 'membership',
      evidence: part.membership.span,
    });
  }
  // Validation only: never publish a sum, difference or missing remainder for story 20.
  let sum: ExpansionRational = { numerator: 0, denominator: 1 };
  for (const part of parts) {
    for (const amount of amounts(part.quantity)) {
      const value = exact(amount, ctx);
      if (!value || value.numerator < 0)
        return mechanismIssue(ctx, 'composition parts must be nonnegative source amounts');
    }
    if (part.quantity.state === 'known') {
      const value = exact(part.quantity.amount, ctx);
      if (!value) return null;
      const result = add(sum, value);
      if (!result.ok)
        return mechanismIssue(ctx, 'known-part validation exceeds exact arithmetic bounds');
      sum = result.value;
    }
  }
  for (const amount of amounts(total)) {
    const value = exact(amount, ctx);
    if (!value || value.numerator < 0)
      return mechanismIssue(ctx, 'composition total must be nonnegative');
    if (total.state === 'known' || total.state === 'disputed') {
      const comparison = compare(sum, value);
      if (!comparison.ok || comparison.value > 0)
        return mechanismIssue(
          ctx,
          'known source parts exceed the supplied total; do not fix the gap by inventing a remainder',
        );
      if (
        total.state === 'known' &&
        parts.every((part) => part.quantity.state === 'known') &&
        comparison.value !== 0
      )
        return mechanismIssue(
          ctx,
          'a fully known partition, including its stated remainder, must equal its source total; do not invent a missing part',
        );
    }
  }
  const remainder = parts.find((part) => part.role === 'remainder');
  const resolve = expansionSourceSpan(remainder?.quantity.evidence, ctx);
  if (!resolve || resolve.text !== base.spans.resolve)
    return mechanismIssue(
      ctx,
      'final resolve must retain the actual source-supplied remainder and its qualification',
    );
  return {
    ...base.story,
    storyId: '20',
    kind: 'composition-view',
    preset: 'partition',
    entities,
    ownerId: owner.id,
    wholeId: whole.id,
    total,
    parts: parts.map(
      (part): ExpansionPartitionRecord => ({
        entityId: part.entity.id,
        role: part.role,
        quantity: part.quantity,
      }),
    ),
    relations,
    resolutionText: base.spans.resolve,
  };
}
