import {
  economicsFacts,
  economicsIdentities,
} from '../../remotion/compositions/explainer/business/economics/identities';
import { economicsReadingFits } from '../../remotion/compositions/explainer/business/economics/readability';
import {
  type AccountingBasesScene,
  type AllocationComponent,
  type EconomicsCarrier,
  type EconomicsCostComponent,
  type EconomicsCountFact,
  type EconomicsMoneyFact,
  type EconomicsScene,
  type FixedVariableSample,
  type ImplementationPeriod,
  ECONOMICS_LIMITS as L,
  type OperatingCostScene,
  type OutputStaffingSample,
  type PricingOffer,
  type ScaleEconomicsScene,
  type ValueCaptureScene,
} from '../../remotion/compositions/explainer/business/economics/types';
import type {
  BusinessIdentity,
  BusinessStory,
  BusinessWordSpan,
  QuantityBasis,
} from '../../remotion/compositions/explainer/business/types';
import type { Money } from '../../remotion/compositions/explainer/finance/types';
import {
  boundedBusinessInput,
  businessEvidence,
  businessEvidenceText,
  businessIdentity,
  businessSpan,
  compatibleQuantityBases,
  quantityBasis,
} from './business-contract';
import {
  assertedBusinessClaim,
  escaped,
  quantityPattern,
} from './concept-business-operations-contract';
import {
  conservesMoney,
  currency,
  moneyPattern,
  parseMoney,
  sameCurrency,
  shareCount,
} from './finance-contract';
import {
  hybridPhrase,
  hybridStory,
  includesPhrase,
  normalizedPhrase,
  onlyFields,
} from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

const COMMON = [
  'kind',
  'preset',
  'visualMode',
  'label',
  'subject',
  'outcome',
  'condition',
  'evidence',
  'startWord',
  'endWord',
  'layout',
  'setupWord',
  'actionWord',
  'responseWord',
  'checkWord',
  'resolveWord',
  'factEvidence',
  'business',
  'activity',
  'carrier',
];
interface Base {
  story: BusinessStory;
  business: BusinessIdentity;
  activity: BusinessIdentity;
  carrier: EconomicsCarrier | null;
  finalHoldSeconds: number;
}
type Fact = EconomicsMoneyFact | EconomicsCountFact;

/** Complete sentences: a span cannot crop off an if/not, or a trailing qualification. */
function clause(source: BusinessWordSpan, ctx: ParseContext): string | null {
  const boundary = /[!?;.]$/u;
  if (
    (source.fromWord > 0 && !boundary.test(ctx.words[source.fromWord - 1]?.text ?? '')) ||
    (source.toWord < ctx.words.length - 1 && !boundary.test(ctx.words[source.toWord]?.text ?? ''))
  )
    return mechanismIssue(ctx, 'economics evidence must include its complete local clause');
  const text = businessEvidenceText(source, ctx).replace(/’/gu, "'").trim();
  // Decimal points are not sentence separators. Commas remain visible for conditions.
  if (text.split(/[!?;]|\.(?=\s|$)/u).filter((part) => part.trim()).length !== 1)
    return mechanismIssue(ctx, 'economics evidence cannot combine independent source clauses');
  return text;
}
function matches(source: BusinessWordSpan, pattern: string, ctx: ParseContext): boolean {
  const text = clause(source, ctx);
  return text !== null && new RegExp(`^${pattern}[.\\s]*$`, 'iu').test(text);
}
function asserted(source: BusinessWordSpan, pattern: string, ctx: ParseContext): boolean {
  const text = clause(source, ctx);
  return text !== null && assertedBusinessClaim(text) && matches(source, pattern, ctx);
}
function identity(raw: unknown, ctx: ParseContext): BusinessIdentity | null {
  const result = businessIdentity(raw, ctx);
  if (!result)
    return mechanismIssue(ctx, 'economics identity needs its own bounded local evidence');
  const text = clause(result.source, ctx);
  if (
    !text ||
    !assertedBusinessClaim(text) ||
    /\b(?:if|unless|assuming|unknown|unresolved)\b/iu.test(text)
  )
    return mechanismIssue(
      ctx,
      'named economics identities cannot be inferred from conditional or negated evidence',
    );
  return result;
}
function span(raw: unknown, ctx: ParseContext): BusinessWordSpan | null {
  const result = businessSpan(raw, ctx);
  return result && clause(result, ctx) !== null
    ? result
    : mechanismIssue(ctx, 'economics needs an explicit complete bounded evidence span');
}
function sameSpan(a: BusinessWordSpan, b: BusinessWordSpan): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}
function items<T>(
  raw: unknown,
  min: number,
  max: number,
  parse: (raw: Rec) => T | null,
  ctx: ParseContext,
): T[] | null {
  if (!Array.isArray(raw) || raw.length < min || raw.length > max)
    return mechanismIssue(ctx, 'economics list exceeds its concrete recipe bound');
  const result: T[] = [];
  for (const entry of raw) {
    if (!isRec(entry))
      return mechanismIssue(ctx, 'economics list entries must be concrete records');
    const parsed = parse(entry);
    if (!parsed)
      return mechanismIssue(ctx, 'economics list entry failed its local source contract');
    result.push(parsed);
  }
  return result;
}
function distinct(entries: readonly BusinessIdentity[], ctx: ParseContext): boolean {
  if (
    entries.length > L.entities ||
    new Set(entries.map((entry) => entry.id)).size !== entries.length ||
    new Set(entries.map((entry) => normalizedPhrase(entry.label))).size !== entries.length
  ) {
    mechanismIssue(
      ctx,
      'economics requires distinct identities, including review/retry, within eight entities',
    );
    return false;
  }
  return true;
}
function basisSuffix(basis: QuantityBasis): string {
  const denominator =
    basis.denominator === null
      ? `with unknown ${escaped(basis.population)} denominator`
      : `(?:per|among) ${quantityPattern(basis.denominator, basis.population)}`;
  return `during ${escaped(basis.period)} ${denominator}`;
}

/**
 * Each fact's single sentence repeats actor, action, component/subject, amount,
 * unit, period and denominator. A separate/global basis clause is not evidence.
 * Source-bound contingent numbers remain conditional, never observed or simulated.
 */
function fact(
  raw: unknown,
  base: Base,
  metric: string,
  verb: 'records' | 'quotes' | 'allocates',
  kind: 'money',
  ctx: ParseContext,
): EconomicsMoneyFact | null;
function fact(
  raw: unknown,
  base: Base,
  metric: string,
  verb: 'records',
  kind: 'count',
  ctx: ParseContext,
): EconomicsCountFact | null;
function fact(
  raw: unknown,
  base: Base,
  metric: string,
  verb: 'records' | 'quotes' | 'allocates',
  kind: 'money' | 'count',
  ctx: ParseContext,
): Fact | null {
  const valueKey = kind === 'money' ? 'money' : 'count';
  if (!isRec(raw) || !onlyFields(raw, ['state', valueKey, 'basis', 'source'], ctx))
    return mechanismIssue(
      ctx,
      'economics quantity requires an explicit state, value, basis and source',
    );
  const source = span(raw.source, ctx);
  const state = raw.state;
  const qualification:
    | { state: 'conditional'; condition: string; source: BusinessWordSpan }
    | undefined =
    state === 'conditional' &&
    source &&
    base.story.condition &&
    isRec(raw.basis) &&
    isRec(raw.basis.source) &&
    Number(raw.basis.source.fromWord) > source.fromWord
      ? { state: 'conditional', condition: base.story.condition, source }
      : undefined;
  const basis = quantityBasis(raw.basis, [base.business], ctx, qualification);
  if (!source || !basis || basis.subjectId !== base.business.id)
    return mechanismIssue(
      ctx,
      'quantity and complete basis must bind the same business in their own single source clause',
    );
  const prefix = base.story.condition ? `${base.story.condition},` : '';
  const conditionalBody =
    state === 'conditional' &&
    prefix &&
    businessEvidenceText(source, ctx).startsWith(`${prefix} `) &&
    basis.source.fromWord === source.fromWord + prefix.split(/\s+/u).length &&
    basis.source.toWord === source.toWord;
  if (!sameSpan(source, basis.source) && !conditionalBody)
    return mechanismIssue(
      ctx,
      'basis cannot swap evidence; only the exact bound conditional sentence body may omit its condition prefix',
    );
  if (
    state !== 'source-stated' &&
    state !== 'unknown' &&
    state !== 'negative' &&
    state !== 'conditional'
  )
    return mechanismIssue(
      ctx,
      'economics quantity state must be source-stated, unknown, negative or conditional',
    );
  const supplied = state === 'source-stated' || (state === 'conditional' && raw[valueKey] !== null);
  const money = kind === 'money' && supplied ? parseMoney(raw.money, ctx) : null;
  const count = kind === 'count' && supplied ? shareCount(raw.count, true) : null;
  if (
    (supplied && (kind === 'money' ? !money : count === null)) ||
    (!supplied && raw[valueKey] !== null)
  )
    return mechanismIssue(
      ctx,
      'observed/explicit contingent quantities require bounded values; unknown or negative remains null, never zero',
    );
  if (kind === 'money' && (!currency(basis.unit) || (money && basis.unit !== money.currency)))
    return mechanismIssue(
      ctx,
      'monetary basis.unit must be its exact currency; money is never workers, jobs or tokens',
    );
  if (
    kind === 'count' &&
    !(/staffing$/u.test(metric)
      ? /^(?:workers|people|employees|staff)$/u.test(basis.unit)
      : /^(?:tasks|jobs|outcomes|orders|appointments|services|units)$/u.test(basis.unit))
  )
    return mechanismIssue(
      ctx,
      'count keeps its source output/staffing unit; no currency or worker/output conversion',
    );
  const b = escaped(base.business.label),
    a = escaped(base.activity.label),
    m = escaped(metric);
  const value = money
    ? moneyPattern(money)
    : count !== null
      ? quantityPattern(count, basis.unit)
      : `unknown ${escaped(basis.unit)}`;
  const target = `for ${a} ${basisSuffix(basis)}`;
  const infinitive = { records: 'record', quotes: 'quote', allocates: 'allocate' }[verb];
  const core = `${m} ${value} ${target}`;
  const pattern =
    state === 'negative'
      ? `${b} does not ${infinitive} ${core}`
      : state === 'conditional'
        ? base.story.condition
          ? `${escaped(base.story.condition)}[,\\s]+${b} (?:${verb}|would ${infinitive}) ${core}`
          : ''
        : `${b} ${verb} ${core}`;
  if (
    !pattern ||
    !matches(source, pattern, ctx) ||
    (state === 'source-stated' && !asserted(source, pattern, ctx))
  )
    return mechanismIssue(
      ctx,
      'quantity clause must anchor its own actor, action, component, state, amount and entire basis; no evidence swaps',
    );
  // quantityBasis already rejects a conditional/negated numeric denominator.
  // Such qualitative clauses can explicitly retain an unknown denominator.
  return kind === 'money' ? { state, money, basis, source } : { state, count, basis, source };
}
function moneyFact(
  raw: unknown,
  base: Base,
  metric: string,
  ctx: ParseContext,
  verb: 'records' | 'quotes' | 'allocates' = 'records',
) {
  return fact(raw, base, metric, verb, 'money', ctx);
}
function countFact(raw: unknown, base: Base, metric: string, ctx: ParseContext) {
  return fact(raw, base, metric, 'records', 'count', ctx);
}
function compatible(facts: readonly Fact[]): boolean {
  return (
    facts.length > 0 && facts.every((entry) => compatibleQuantityBases(facts[0].basis, entry.basis))
  );
}
// Only source-stated relationships may relate unlike axes. This NEVER licenses
// arithmetic/comparison between currencies, count units, prices or periods.
function sameContext(a: QuantityBasis, b: QuantityBasis): boolean {
  return (
    a.denominator !== null &&
    a.denominator === b.denominator &&
    a.subjectId === b.subjectId &&
    normalizedPhrase(a.population) === normalizedPhrase(b.population) &&
    normalizedPhrase(a.period) === normalizedPhrase(b.period)
  );
}
function observed(entry: EconomicsMoneyFact): boolean {
  return entry.state === 'source-stated' && entry.money !== null;
}
function safeSum(values: readonly Money[], ctx: ParseContext): number | null {
  let sum = 0;
  for (const value of values) {
    sum += value.minorUnits;
    if (!Number.isSafeInteger(sum))
      return mechanismIssue(ctx, 'economics money sum exceeds safe integer arithmetic');
  }
  return sum;
}
/** No unknown component is filled with a residual or treated as an invented zero. */
function decomposition(
  total: EconomicsMoneyFact,
  parts: readonly EconomicsMoneyFact[],
  ctx: ParseContext,
): boolean {
  if (!observed(total) || !total.money) return true;
  const measured = parts.filter(observed);
  const money = measured.flatMap((entry) => (entry.money ? [entry.money] : []));
  if (!compatible([total, ...measured]) || !sameCurrency([total.money, ...money])) {
    mechanismIssue(
      ctx,
      'numeric economics decomposition requires compatible subject/population/unit/period/denominator and one currency',
    );
    return false;
  }
  const sum = safeSum(money, ctx);
  if (
    sum === null ||
    sum > total.money.minorUnits ||
    (measured.length === parts.length && !conservesMoney([total.money], money, null))
  ) {
    mechanismIssue(
      ctx,
      'stated cost/allocation components must safely conserve their explicit total; no inferred remainder',
    );
    return false;
  }
  return true;
}
function carrier(
  raw: unknown,
  expected: EconomicsCarrier['asset'] | null,
  business: BusinessIdentity,
  activity: BusinessIdentity,
  ctx: ParseContext,
): EconomicsCarrier | null | false {
  if (raw === null) return null;
  if (
    !expected ||
    !isRec(raw) ||
    !onlyFields(raw, ['asset', 'source'], ctx) ||
    raw.asset !== expected
  ) {
    mechanismIssue(
      ctx,
      'carrier asset is code-owned by this preset; raw asset must equal its exact allowlisted assembly',
    );
    return false;
  }
  const source = span(raw.source, ctx);
  if (!source) return false;
  const b = escaped(business.label),
    a = escaped(activity.label);
  const pattern = {
    'A-02': `${b} uses ${a} as (?:a service station|an explicit service-station illustration)`,
    'A-04': `${b} uses ${a} as an operating record`,
    'A-07': `${b} uses ${a} as an implementation playbook`,
    'A-10': `${b} records ${a} allocations in four trays`,
  }[expected];
  if (asserted(source, pattern, ctx))
    return {
      asset: expected,
      source,
      ...(expected === 'A-10' ? { representation: 'numeric' as const } : {}),
    };
  if (
    expected === 'A-10' &&
    asserted(source, `${b} uses ${a} as a nonnumeric four-tray illustration`, ctx)
  )
    return { asset: expected, source, representation: 'nonnumeric' };
  mechanismIssue(
    ctx,
    'carrier needs its own actual named task/station/playbook/allocation source dependency; not an asset label alone',
  );
  return false;
}
function base(
  raw: Rec,
  fields: readonly string[],
  expected: EconomicsCarrier['asset'] | null,
  ctx: ParseContext,
): Base | null {
  if (!onlyFields(raw, [...COMMON, ...fields], ctx)) return null;
  const first = ctx.words[ctx.win.startWord],
    last = ctx.words[ctx.win.endWord];
  if (
    !first ||
    !last ||
    !Number.isFinite(first.start) ||
    !Number.isFinite(last.end) ||
    ctx.win.startTime < first.start - 0.25 - 1e-7 ||
    ctx.win.endTime > last.end + 0.35 + 1e-7
  )
    return mechanismIssue(
      ctx,
      'economics full window must fit real speech plus the planner 0.25s lead-in/0.35s tail, not an artificial hold',
    );
  if (
    (raw.startWord !== undefined && raw.startWord !== ctx.win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== ctx.win.endWord) ||
    (raw.layout !== undefined &&
      !['stack', 'stack-flipped', 'takeover', 'pip', 'over'].includes(String(raw.layout)))
  )
    return mechanismIssue(
      ctx,
      'economics envelope must preserve the complete source window and allowlisted layout',
    );
  const parsed = hybridStory(raw, ctx, [
    'factEvidence',
    'business',
    'activity',
    'carrier',
    ...fields,
  ]);
  const factEvidence = businessEvidence(raw.factEvidence, ctx);
  const business = identity(raw.business, ctx),
    activity = identity(raw.activity, ctx);
  if (!parsed || !factEvidence || !business || !activity)
    return mechanismIssue(
      ctx,
      'economics needs its five-beat source story, identities and explicit evidence',
    );
  if (raw.evidence !== 'source-stated' || factEvidence.state !== 'source-stated')
    return mechanismIssue(
      ctx,
      'economics records are source-stated; this pack does not simulate or forecast financial outcomes',
    );
  if (
    normalizedPhrase(parsed.story.subject) !== normalizedPhrase(business.label) ||
    !includesPhrase(factEvidence.label, parsed.story.outcome) ||
    !clause(factEvidence.source, ctx) ||
    factEvidence.source.fromWord < Number(raw.resolveWord) ||
    !matches(factEvidence.source, escaped(factEvidence.label), ctx) ||
    normalizedPhrase(factEvidence.label) !== normalizedPhrase(parsed.story.outcome)
  )
    return mechanismIssue(
      ctx,
      'economics story subject and final evidence must belong to this business and its source resolve outcome',
    );
  if (
    /\d|\b(?:profit|profits|cash|paid|payback|cheapest|better|best|optimal|optimum|returns?|growth|savings|layoffs?|winner|forecast|simulation|guaranteed?)\b/iu.test(
      parsed.story.outcome,
    )
  )
    return mechanismIssue(
      ctx,
      'keep the resolve outcome a neutral source record, not an inferred financial result, winner, forecast or advice',
    );
  const assembly = carrier(raw.carrier, expected, business, activity, ctx);
  if (assembly === false || (parsed.story.visualMode === 'hybrid' && assembly === null))
    return mechanismIssue(
      ctx,
      'hybrid economics requires its independently source-gated preset assembly',
    );
  const finalHoldSeconds = ctx.win.endTime - parsed.story.resolveAt;
  if (finalHoldSeconds + 1e-7 < L.finalHold)
    return mechanismIssue(ctx, 'economics needs at least 0.8s of full-window final hold');
  return {
    story: { ...parsed.story, factEvidence },
    business,
    activity,
    carrier: assembly,
    finalHoldSeconds,
  };
}
function finish<T extends EconomicsScene>(scene: T, ctx: ParseContext): T | null {
  const identities = economicsIdentities(scene),
    facts = economicsFacts(scene);
  const links =
    facts.length +
    (scene.carrier ? 1 : 0) +
    (scene.preset === 'source-stated-allocation' ||
    scene.preset === 'output-staffing' ||
    scene.preset === 'comparable-pricing-bases'
      ? 1
      : 0);
  if (
    !distinct(identities, ctx) ||
    links > L.relationships ||
    facts.filter((entry) => entry.fact.state !== 'source-stated').length > L.holds ||
    new Set(facts.map((entry) => entry.id)).size !== facts.length
  )
    return mechanismIssue(
      ctx,
      'economics exceeds eight entities, twelve supported links or four holds, or duplicates a component/fact identity',
    );
  const amounts = facts.flatMap(({ fact: entry }) =>
    'money' in entry && entry.money ? [entry.money] : [],
  );
  const moneyUnits = facts.flatMap(({ fact: entry }) =>
    'money' in entry ? [entry.basis.unit] : [],
  );
  if (new Set(moneyUnits).size > 1 || (amounts.length && !sameCurrency(amounts)))
    return mechanismIssue(
      ctx,
      'economics costs require one explicit currency; no FX conversion is inferred',
    );
  if (!economicsReadingFits(scene))
    return mechanismIssue(
      ctx,
      'economics exceeds natural fixed-font density or 1.5s complete-page visibility; split the source, never shrink or omit facts',
    );
  return scene;
}
function fields(raw: Rec, allowed: readonly string[], ctx: ParseContext): boolean {
  return onlyFields(raw, allowed, ctx);
}
function components(
  raw: unknown,
  b: Base,
  prefix: string,
  suffix: string,
  ctx: ParseContext,
): EconomicsCostComponent[] | null {
  const result = items(
    raw,
    1,
    L.components,
    (entry) => {
      if (!fields(entry, ['identity', 'cost'], ctx)) return null;
      const named = identity(entry.identity, ctx);
      const cost = named
        ? moneyFact(entry.cost, b, `${prefix}${named.label} ${suffix}`, ctx)
        : null;
      return named && cost ? { identity: named, cost } : null;
    },
    ctx,
  );
  if (result && !distinct([b.business, b.activity, ...result.map((entry) => entry.identity)], ctx))
    return null;
  return result;
}
function alternatives(
  raw: unknown,
  b: Base,
  names: readonly BusinessIdentity[],
  ctx: ParseContext,
): BusinessWordSpan | null {
  const source = span(raw, ctx);
  const pattern = `${escaped(b.business.label)} lists ${names.map((entry) => escaped(entry.label)).join(' versus ')} as alternatives for ${escaped(b.activity.label)}`;
  return source && asserted(source, pattern, ctx)
    ? source
    : mechanismIssue(
        ctx,
        'equal-baseline alternatives must locally bind this business, both actual sample/offer identities and activity; no inferred optimum',
      );
}

function perOutcome(raw: Rec, ctx: ParseContext): OperatingCostScene | null {
  const b = base(raw, ['components', 'total', 'resolved', 'perOutcome'], 'A-04', ctx);
  if (!b) return null;
  const parts = components(raw.components, b, '', 'cost', ctx);
  const total = moneyFact(raw.total, b, 'total cost', ctx);
  const resolved = countFact(raw.resolved, b, 'resolved output', ctx);
  const per = moneyFact(raw.perOutcome, b, 'per resolved task cost', ctx);
  if (
    !parts ||
    !total ||
    !resolved ||
    !per ||
    !decomposition(
      total,
      parts.map((entry) => entry.cost),
      ctx,
    )
  )
    return null;
  if (observed(per) && per.money) {
    if (
      !observed(total) ||
      !total.money ||
      parts.some((entry) => !observed(entry.cost)) ||
      resolved.state !== 'source-stated' ||
      resolved.count === null ||
      resolved.count <= 0 ||
      !compatible([total, per, ...parts.map((entry) => entry.cost)]) ||
      !sameContext(total.basis, resolved.basis) ||
      per.money.currency !== total.money.currency ||
      BigInt(per.money.minorUnits) * BigInt(resolved.count) !== BigInt(total.money.minorUnits)
    )
      return mechanismIssue(
        ctx,
        'per-outcome money needs explicit positive resolved tasks, complete compatible costs and an exact stated minor-unit quotient; unresolved/zero is never divided',
      );
  }
  return finish(
    {
      ...b.story,
      business: b.business,
      activity: b.activity,
      carrier: b.carrier,
      finalHoldSeconds: b.finalHoldSeconds,
      kind: 'operating-cost',
      preset: 'per-outcome',
      components: parts,
      total,
      resolved,
      perOutcome: per,
    },
    ctx,
  );
}
function implementationPeriods(raw: Rec, ctx: ParseContext): OperatingCostScene | null {
  const b = base(raw, ['periods'], 'A-07', ctx);
  if (!b) return null;
  const periods = items<ImplementationPeriod>(
    raw.periods,
    1,
    L.periods,
    (entry) => {
      if (!fields(entry, ['identity', 'version', 'date', 'source', 'cost', 'output'], ctx))
        return null;
      const named = identity(entry.identity, ctx),
        source = span(entry.source, ctx);
      const version = hybridPhrase(entry.version, ctx, 16),
        date = hybridPhrase(entry.date, ctx, 24);
      const cost = named
        ? moneyFact(entry.cost, b, `${named.label} implementation cost`, ctx)
        : null;
      const output = named
        ? countFact(entry.output, b, `${named.label} observed output`, ctx)
        : null;
      if (!named || !source || !version || !date || !cost || !output) return null;
      const pattern = `${escaped(b.business.label)} records ${escaped(b.activity.label)} version ${escaped(version)} for ${escaped(named.label)} period ${escaped(cost.basis.period)} dated ${escaped(date)}`;
      if (
        normalizedPhrase(cost.basis.period) !== normalizedPhrase(output.basis.period) ||
        !asserted(source, pattern, ctx)
      )
        return mechanismIssue(
          ctx,
          'implementation dates, actual playbook revision, period identity and reporting period must bind locally; no beat-date or payback inference',
        );
      return { identity: named, version, date, source, cost, output };
    },
    ctx,
  );
  if (
    !periods ||
    new Set(periods.map((entry) => normalizedPhrase(entry.version))).size !== periods.length
  )
    return mechanismIssue(
      ctx,
      'implementation binder revisions must be distinct, explicit source versions, not automatic updates',
    );
  return finish(
    {
      ...b.story,
      business: b.business,
      activity: b.activity,
      carrier: b.carrier,
      finalHoldSeconds: b.finalHoldSeconds,
      kind: 'operating-cost',
      preset: 'implementation-periods',
      periods,
    },
    ctx,
  );
}
function pricingBases(raw: Rec, ctx: ParseContext): OperatingCostScene | null {
  if (raw.visualMode !== 'diagram')
    return mechanismIssue(ctx, 'comparable-pricing-bases is diagram only');
  const b = base(raw, ['offers', 'alternativesSource'], null, ctx);
  if (!b || b.carrier !== null) return null;
  const offers = items<PricingOffer>(
    raw.offers,
    2,
    L.offers,
    (entry) => {
      if (!fields(entry, ['identity', 'price'], ctx)) return null;
      const named = identity(entry.identity, ctx);
      const price = named ? moneyFact(entry.price, b, `${named.label} price`, ctx, 'quotes') : null;
      return named && price ? { identity: named, price } : null;
    },
    ctx,
  );
  if (!offers) return null;
  const alternativesSource = alternatives(
    raw.alternativesSource,
    b,
    offers.map((entry) => entry.identity),
    ctx,
  );
  if (!alternativesSource) return null;
  const numeric =
    offers.every((entry) => observed(entry.price)) &&
    compatible(offers.map((entry) => entry.price));
  return finish(
    {
      ...b.story,
      business: b.business,
      activity: b.activity,
      carrier: null,
      finalHoldSeconds: b.finalHoldSeconds,
      kind: 'operating-cost',
      preset: 'comparable-pricing-bases',
      visualMode: 'diagram',
      offers,
      alternativesSource,
      comparison: numeric ? 'compatible' : 'separate',
    },
    ctx,
  );
}
function accountingBases(raw: Rec, ctx: ParseContext): OperatingCostScene | null {
  const b = base(
    raw,
    ['revenue', 'costs', 'statedCostRemainder', 'profit', 'cash', 'receivable'],
    'A-04',
    ctx,
  );
  if (!b || !isRec(raw.revenue) || !fields(raw.revenue, ['accounting', 'fact'], ctx))
    return mechanismIssue(
      ctx,
      'accounting revenue must explicitly declare its own accrual/gross/net basis',
    );
  const accounting = raw.revenue.accounting;
  if (accounting !== 'accrual' && accounting !== 'gross' && accounting !== 'net')
    return mechanismIssue(
      ctx,
      'revenue accounting basis is accrual, gross or net; never automatically cash',
    );
  const revenue = moneyFact(raw.revenue.fact, b, `${accounting} revenue`, ctx);
  const costs = components(raw.costs, b, `${accounting} `, 'stated cost', ctx);
  const remainder = moneyFact(
    raw.statedCostRemainder,
    b,
    `${accounting} stated-cost remainder`,
    ctx,
  );
  if (!revenue || !costs || !remainder) return null;
  if (observed(remainder) && (!observed(revenue) || costs.some((entry) => !observed(entry.cost))))
    return mechanismIssue(
      ctx,
      'numeric stated-cost remainder needs its source revenue and every declared cost; missing expenses are not zero or profit',
    );
  if (
    observed(remainder) &&
    !decomposition(revenue, [...costs.map((entry) => entry.cost), remainder], ctx)
  )
    return null;
  let profit: AccountingBasesScene['profit'] = null;
  if (raw.profit !== null) {
    if (
      !isRec(raw.profit) ||
      !fields(raw.profit, ['accounting', 'fact'], ctx) ||
      (raw.profit.accounting !== 'gross' && raw.profit.accounting !== 'net')
    )
      return mechanismIssue(
        ctx,
        'profit needs its own explicit source-stated gross/net record, not a cost remainder',
      );
    const amount = moneyFact(raw.profit.fact, b, `${raw.profit.accounting} profit`, ctx);
    if (!amount) return null;
    profit = { accounting: raw.profit.accounting, fact: amount };
  }
  let cash: AccountingBasesScene['cash'] = null;
  if (raw.cash !== null) {
    if (
      !isRec(raw.cash) ||
      !fields(raw.cash, ['accounting', 'fact'], ctx) ||
      (raw.cash.accounting !== 'received' && raw.cash.accounting !== 'held')
    )
      return mechanismIssue(
        ctx,
        'cash must be a separately sourced received/held amount, not revenue or a receivable',
      );
    const amount = moneyFact(raw.cash.fact, b, `${raw.cash.accounting} cash`, ctx);
    if (!amount) return null;
    cash = { accounting: raw.cash.accounting, fact: amount };
  }
  const receivable =
    raw.receivable === null ? null : moneyFact(raw.receivable, b, 'receivable', ctx);
  if (raw.receivable !== null && !receivable) return null;
  return finish(
    {
      ...b.story,
      business: b.business,
      activity: b.activity,
      carrier: b.carrier,
      finalHoldSeconds: b.finalHoldSeconds,
      kind: 'operating-cost',
      preset: 'accounting-bases',
      revenue: { accounting, fact: revenue },
      costs,
      statedCostRemainder: remainder,
      profit,
      cash,
      receivable,
    },
    ctx,
  );
}

/** Strict untrusted entrypoint for OP-33/37/38/40. No root-union casts. */
export function parseOperatingCostScene(raw: Rec, ctx: ParseContext): OperatingCostScene | null {
  if (!boundedBusinessInput(raw, ctx) || !isRec(raw))
    return mechanismIssue(ctx, 'operating-cost requires bounded JSON');
  if (raw.kind !== 'operating-cost') return mechanismIssue(ctx, 'operating-cost kind mismatch');
  switch (raw.preset) {
    case 'per-outcome':
      return perOutcome(raw, ctx);
    case 'implementation-periods':
      return implementationPeriods(raw, ctx);
    case 'comparable-pricing-bases':
      return pricingBases(raw, ctx);
    case 'accounting-bases':
      return accountingBases(raw, ctx);
    default:
      return mechanismIssue(ctx, 'unsupported concrete operating-cost preset');
  }
}

/** Strict untrusted entrypoint for OP-34/36. Finite samples, never a forecast curve. */
export function parseScaleEconomicsScene(raw: Rec, ctx: ParseContext): ScaleEconomicsScene | null {
  if (!boundedBusinessInput(raw, ctx) || !isRec(raw))
    return mechanismIssue(ctx, 'scale-economics requires bounded JSON');
  if (raw.kind !== 'scale-economics') return mechanismIssue(ctx, 'scale-economics kind mismatch');
  if (raw.preset === 'fixed-variable') {
    const b = base(raw, ['fixed', 'variable', 'samples'], 'A-02', ctx);
    if (!b) return null;
    const fixed = identity(raw.fixed, ctx),
      variable = identity(raw.variable, ctx);
    if (!fixed || !variable) return null;
    const samples = items<FixedVariableSample>(
      raw.samples,
      1,
      L.samples,
      (entry) => {
        if (!fields(entry, ['identity', 'output', 'fixedCost', 'variableCost', 'total'], ctx))
          return null;
        const named = identity(entry.identity, ctx);
        if (!named) return null;
        const output = countFact(entry.output, b, `${named.label} output`, ctx);
        const fixedCost = moneyFact(
          entry.fixedCost,
          b,
          `${named.label} ${fixed.label} fixed cost`,
          ctx,
        );
        const variableCost = moneyFact(
          entry.variableCost,
          b,
          `${named.label} ${variable.label} variable cost`,
          ctx,
        );
        const total = moneyFact(entry.total, b, `${named.label} total cost`, ctx);
        if (
          !output ||
          !fixedCost ||
          !variableCost ||
          !total ||
          !decomposition(total, [fixedCost, variableCost], ctx)
        )
          return null;
        if (
          output.state === 'source-stated' &&
          observed(total) &&
          !sameContext(output.basis, total.basis)
        )
          return mechanismIssue(
            ctx,
            'a numeric fixed/variable sample must bind output and cost to its own compatible basis; no task/period conversion',
          );
        return { identity: named, output, fixedCost, variableCost, total };
      },
      ctx,
    );
    if (!samples) return null;
    return finish(
      {
        ...b.story,
        business: b.business,
        activity: b.activity,
        carrier: b.carrier,
        finalHoldSeconds: b.finalHoldSeconds,
        kind: 'scale-economics',
        preset: 'fixed-variable',
        fixed,
        variable,
        samples,
      },
      ctx,
    );
  }
  if (raw.preset === 'output-staffing') {
    const b = base(raw, ['samples', 'alternativesSource'], 'A-02', ctx);
    if (!b) return null;
    const samples = items<OutputStaffingSample>(
      raw.samples,
      2,
      L.samples,
      (entry) => {
        if (!fields(entry, ['identity', 'output', 'staffing'], ctx)) return null;
        const named = identity(entry.identity, ctx);
        const output = named ? countFact(entry.output, b, `${named.label} output`, ctx) : null;
        const staffing = named
          ? countFact(entry.staffing, b, `${named.label} staffing`, ctx)
          : null;
        return named && output && staffing ? { identity: named, output, staffing } : null;
      },
      ctx,
    );
    if (!samples) return null;
    const alternativesSource = alternatives(
      raw.alternativesSource,
      b,
      samples.map((entry) => entry.identity),
      ctx,
    );
    if (!alternativesSource) return null;
    return finish(
      {
        ...b.story,
        business: b.business,
        activity: b.activity,
        carrier: b.carrier,
        finalHoldSeconds: b.finalHoldSeconds,
        kind: 'scale-economics',
        preset: 'output-staffing',
        samples,
        alternativesSource,
      },
      ctx,
    );
  }
  return mechanismIssue(ctx, 'unsupported concrete scale-economics preset');
}

/** OP-39: conservation only, not a take rate, profit, payout or priority waterfall. */
export function parseValueCaptureScene(raw: Rec, ctx: ParseContext): ValueCaptureScene | null {
  if (!boundedBusinessInput(raw, ctx) || !isRec(raw))
    return mechanismIssue(ctx, 'value-capture requires bounded JSON');
  if (raw.kind !== 'value-capture' || raw.preset !== 'source-stated-allocation')
    return mechanismIssue(ctx, 'unsupported concrete value-capture kind/preset');
  const b = base(raw, ['total', 'allocations', 'remainder', 'orderSource'], 'A-10', ctx);
  if (!b) return null;
  const total = moneyFact(raw.total, b, 'allocation total', ctx);
  const allocations = items<AllocationComponent>(
    raw.allocations,
    3,
    3,
    (entry) => {
      if (!fields(entry, ['identity', 'amount'], ctx)) return null;
      const named = identity(entry.identity, ctx);
      const amount = named
        ? moneyFact(entry.amount, b, `${named.label} allocation`, ctx, 'allocates')
        : null;
      return named && amount ? { identity: named, amount } : null;
    },
    ctx,
  );
  if (
    !total ||
    !allocations ||
    !isRec(raw.remainder) ||
    !fields(raw.remainder, ['identity', 'amount'], ctx)
  )
    return null;
  const named = identity(raw.remainder.identity, ctx);
  const amount = named
    ? moneyFact(raw.remainder.amount, b, `${named.label} retained remainder`, ctx)
    : null;
  if (!named || !amount) return null;
  const remainder: AllocationComponent = { identity: named, amount };
  const orderSource = span(raw.orderSource, ctx);
  const ordered = [...allocations.map((entry) => entry.identity), named];
  const pattern = `${escaped(b.business.label)} lists ${ordered.map((entry) => escaped(entry.label)).join(' followed by ')} as ordered allocations for ${escaped(b.activity.label)}`;
  if (!orderSource || !asserted(orderSource, pattern, ctx))
    return mechanismIssue(
      ctx,
      'A-10 needs four actual ordered allocation identities in their own local source clause; order does not imply priority eligibility',
    );
  if (!decomposition(total, [...allocations.map((entry) => entry.amount), amount], ctx))
    return null;
  if (
    b.carrier?.representation === 'numeric' &&
    (!observed(total) ||
      !total.money ||
      !observed(amount) ||
      allocations.some((entry) => !observed(entry.amount)) ||
      total.money.minorUnits <= 0 ||
      !compatible([total, amount, ...allocations.map((entry) => entry.amount)]))
  )
    return mechanismIssue(
      ctx,
      'numeric A-10 fills require four source-stated exact compatible allocations and positive total; otherwise use an explicit nonnumeric illustration',
    );
  return finish(
    {
      ...b.story,
      business: b.business,
      activity: b.activity,
      carrier: b.carrier,
      finalHoldSeconds: b.finalHoldSeconds,
      kind: 'value-capture',
      preset: 'source-stated-allocation',
      total,
      allocations,
      remainder,
      orderSource,
    },
    ctx,
  );
}
