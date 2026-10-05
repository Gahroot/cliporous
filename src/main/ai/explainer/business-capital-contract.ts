import { capitalReadingFits } from '../../remotion/compositions/explainer/business/capital/presentation';
import {
  type CapitalCountFact,
  type CapitalMoneyFact,
  type CapitalObligation,
  type CapitalOutcome,
  type CapitalOwnership,
  type CapitalRound,
  type CapitalScene,
  type CapitalStatement,
  type CapitalStructureScene,
  capitalHoldCount,
  capitalIdentities,
  capitalRelationCount,
  type EconomicRightsScene,
  type InvestmentOutcomesScene,
  CAPITAL_LIMITS as L,
} from '../../remotion/compositions/explainer/business/capital/types';
import type {
  BusinessIdentity,
  BusinessWordSpan,
} from '../../remotion/compositions/explainer/business/types';
import {
  boundedBusinessInput,
  businessEvidence,
  businessEvidenceText,
  businessIdentity,
  businessSpan,
  compatibleQuantityBases,
  quantityBasis,
  versionedIdentity,
} from './business-contract';
import { escaped, quantityPattern } from './concept-business-operations-contract';
import {
  compatibleBasis,
  currency,
  distinctActors,
  financeClaim,
  moneyPattern,
  parseMoney,
  shareCount,
  validOwnership,
} from './finance-contract';
import { hybridPhrase, hybridStory, onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

const COMMON_FIELDS = [
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
  'company',
  'period',
  'modelSource',
];
type Phase = 'setup' | 'action' | 'response' | 'check';
const PHASES = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
function sameSpan(a: BusinessWordSpan, b: BusinessWordSpan): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}
/** Exact complete local clause. Neither a nearby actor nor a cropped qualifier is evidence. */
function clause(source: BusinessWordSpan, pattern: string, ctx: ParseContext): boolean {
  const before = ctx.words[source.fromWord - 1]?.text ?? '';
  const text = businessEvidenceText(source, ctx);
  return (
    (source.fromWord === ctx.win.startWord || /[.!?;]$/u.test(before)) &&
    /[.!?;]$/u.test(ctx.words[source.toWord]?.text ?? '') &&
    new RegExp(`^${pattern}[.]?$`, 'iu').test(text)
  );
}
function inPhase(source: BusinessWordSpan, raw: Rec, phase: Phase, ctx: ParseContext): boolean {
  const position = ['setup', 'action', 'response', 'check'].indexOf(phase);
  const from = ctx.inWin(raw[PHASES[position]]),
    to = ctx.inWin(raw[PHASES[position + 1]]);
  return from !== null && to !== null && source.fromWord >= from && source.toWord < to;
}
function identity(
  value: unknown,
  roles: string,
  raw: Rec,
  ctx: ParseContext,
): BusinessIdentity | null {
  const parsed = businessIdentity(value, ctx);
  return parsed &&
    inPhase(parsed.source, raw, 'setup', ctx) &&
    clause(parsed.source, `${escaped(parsed.label)} is (?:${roles})`, ctx)
    ? parsed
    : mechanismIssue(
        ctx,
        'capital identity needs its complete setup clause and explicit financial/physical role',
      );
}
function begin(raw: Rec, ctx: ParseContext, kind: string, fields: string[]) {
  // Must precede all property reads, including kind and preset.
  if (
    !boundedBusinessInput(raw, ctx) ||
    !isRec(raw) ||
    !onlyFields(raw, [...COMMON_FIELDS, ...fields], ctx)
  )
    return null;
  if (
    raw.kind !== kind ||
    raw.startWord !== ctx.win.startWord ||
    raw.endWord !== ctx.win.endWord ||
    typeof raw.layout !== 'string' ||
    !['stack', 'stack-flipped', 'takeover', 'pip', 'over'].includes(raw.layout)
  )
    return mechanismIssue(ctx, 'capital kind, layout and full source window must be explicit');
  const parsed = hybridStory(raw, ctx, ['company', 'period', 'modelSource', ...fields]);
  const company = identity(raw.company, 'company|financial asset|financial report', raw, ctx);
  const period = hybridPhrase(raw.period, ctx, 28);
  if (
    !parsed ||
    !company ||
    !period ||
    company.label !== parsed.story.subject ||
    !financeClaim(
      parsed.spans.setup,
      `${escaped(company.label)} opens source facts for ${escaped(period)}`,
    ) ||
    parsed.story.outcome !== 'Source facts remain distinct'
  )
    return mechanismIssue(
      ctx,
      'capital subject/period and neutral resolve must be locally source-stated',
    );
  const finalHoldSeconds = ctx.win.endTime - parsed.story.resolveAt;
  if (!Number.isFinite(finalHoldSeconds) || finalHoldSeconds < 0.8)
    return mechanismIssue(
      ctx,
      'capital needs an actual settled final hold of at least 0.8 seconds',
    );
  return { ...parsed.story, company, period, finalHoldSeconds };
}
function modelSource(raw: Rec, pattern: string, ctx: ParseContext): BusinessWordSpan | null {
  const source = businessSpan(raw.modelSource, ctx);
  return source && inPhase(source, raw, 'action', ctx) && clause(source, pattern, ctx)
    ? source
    : mechanismIssue(
        ctx,
        'native records require a source-named subject and authored asset meaning',
      );
}
function finish<T extends CapitalScene>(scene: T, ctx: ParseContext): T | null {
  const identities = capitalIdentities(scene);
  if (
    !distinctActors(identities) ||
    identities.length > L.identities ||
    capitalRelationCount(scene) > L.relations ||
    capitalHoldCount(scene) > L.holds ||
    !capitalReadingFits(scene)
  )
    return mechanismIssue(
      ctx,
      'capital exceeds identity/relation/hold caps or complete fixed-font page budget after handoff',
    );
  return scene;
}
function statement(
  value: unknown,
  raw: Rec,
  phase: Phase,
  ctx: ParseContext,
  patterns: Partial<Record<CapitalStatement['state'], string>>,
): CapitalStatement | null {
  if (!isRec(value) || !onlyFields(value, ['state', 'label', 'source'], ctx)) return null;
  const state = value.state;
  if (
    state !== 'source-stated' &&
    state !== 'unknown' &&
    state !== 'negative' &&
    state !== 'conditional'
  )
    return null;
  const source = businessSpan(value.source, ctx),
    label = hybridPhrase(value.label, ctx, 96);
  const pattern = patterns[state];
  if (
    !source ||
    !label ||
    !pattern ||
    !inPhase(source, raw, phase, ctx) ||
    !clause(source, pattern, ctx) ||
    businessEvidenceText(source, ctx).replace(/[.]$/u, '') !== label
  )
    return null;
  // Shared evidence checks retain unknown/scenario markers; the complete local pattern above
  // supplies the refined negative/conditional action contract (not financeClaim's optional strip).
  const marker =
    state === 'unknown' ? 'unknown' : state === 'conditional' ? 'If' : label.split(' ')[0];
  const evidence = businessEvidence(
    {
      state:
        state === 'conditional' ? 'scenario' : state === 'unknown' ? 'unknown' : 'source-stated',
      label: marker,
      source,
    },
    ctx,
  );
  return evidence ? { state, label, source } : null;
}
function suffix(basis: { period: string; population: string; denominator: number | null }): string {
  return `during ${escaped(basis.period)} ${basis.denominator === null ? `with unknown ${escaped(basis.population)} denominator` : `per ${quantityPattern(basis.denominator, basis.population)}`}`;
}
/** Validates shared Money and every basis dimension; callers additionally bind the exact action. */
function moneyFact(
  value: unknown,
  raw: Rec,
  company: BusinessIdentity,
  period: string,
  ctx: ParseContext,
  condition?: string,
): CapitalMoneyFact | null {
  if (!isRec(value) || !onlyFields(value, ['state', 'money', 'basis', 'source'], ctx)) return null;
  const state = value.state;
  if (
    state !== 'source-stated' &&
    state !== 'unknown' &&
    state !== 'negative' &&
    state !== 'conditional' &&
    state !== 'pending'
  )
    return null;
  const source = businessSpan(value.source, ctx);
  const money = value.money === null ? null : parseMoney(value.money, ctx);
  if (
    !source ||
    !inPhase(source, raw, 'response', ctx) ||
    (state === 'unknown' || state === 'negative' ? value.money !== null : !money)
  )
    return null;
  const basis = quantityBasis(
    value.basis,
    [company],
    ctx,
    state === 'conditional' && condition ? { state: 'conditional', condition, source } : undefined,
  );
  if (
    !basis ||
    basis.period !== period ||
    !currency(basis.unit) ||
    (money && money.currency !== basis.unit) ||
    !['investors', 'investments', 'funds', 'portfolios', 'obligations', 'rounds'].includes(
      basis.population,
    ) ||
    (state === 'conditional'
      ? !condition ||
        basis.source.fromWord !== source.fromWord + condition.split(/\s+/u).length ||
        basis.source.toWord !== source.toWord
      : !sameSpan(source, basis.source))
  )
    return null;
  return { state, money, basis, source };
}
function amountPattern(fact: CapitalMoneyFact): string {
  return fact.money
    ? moneyPattern(fact.money)
    : `${fact.state === 'negative' ? 'absent' : 'unknown'} ${escaped(fact.basis.unit)}`;
}
function ownership(
  value: unknown,
  raw: Rec,
  company: BusinessIdentity,
  holder: BusinessIdentity,
  period: string,
  ctx: ParseContext,
): CapitalOwnership | null {
  if (!isRec(value) || !onlyFields(value, ['shares', 'total', 'percent', 'basis', 'source'], ctx))
    return null;
  const shares = shareCount(value.shares),
    total = shareCount(value.total);
  const percent = value.percent;
  const source = businessSpan(value.source, ctx),
    basis = quantityBasis(value.basis, [company], ctx);
  if (
    shares === null ||
    total === null ||
    typeof percent !== 'number' ||
    !validOwnership(shares, total, 0, total, percent, percent) ||
    !source ||
    !basis ||
    !sameSpan(source, basis.source) ||
    !inPhase(source, raw, 'response', ctx) ||
    basis.unit !== 'shares' ||
    basis.population !== 'shares' ||
    basis.denominator !== total ||
    basis.period !== period ||
    !clause(
      source,
      `${escaped(holder.label)} owns ${shares} of ${total} shares in ${escaped(company.label)} at ${escaped(String(percent))} percent ${suffix(basis)}`,
      ctx,
    )
  )
    return null;
  return { shares, total, percent, basis, source };
}

export function parseEconomicRightsScene(raw: Rec, ctx: ParseContext): EconomicRightsScene | null {
  const story = begin(raw, ctx, 'economic-rights', [
    'holder',
    'claim',
    'claimEvidence',
    'ownership',
    'control',
    'priority',
    'payout',
    'transfer',
    'liquidity',
  ]);
  if (!story) return null;
  const preset = raw.preset;
  if (preset !== 'ownership-versus-claims' && preset !== 'claim-asset-distinction')
    return mechanismIssue(ctx, 'unsupported economic-rights preset');
  if (
    !onlyFields(
      raw,
      [
        ...COMMON_FIELDS,
        'holder',
        'claim',
        'claimEvidence',
        ...(preset === 'ownership-versus-claims'
          ? ['ownership', 'control', 'priority', 'payout']
          : ['transfer', 'liquidity']),
      ],
      ctx,
    )
  )
    return null;
  const holder = identity(raw.holder, 'share and claim holder|claim holder', raw, ctx);
  const claim = identity(raw.claim, 'economic claim', raw, ctx);
  const claimEvidence = businessEvidence(raw.claimEvidence, ctx);
  const model = modelSource(
    raw,
    `${escaped(story.company.label)} maintains asset ownership and economic claim records`,
    ctx,
  );
  if (
    !holder ||
    !claim ||
    !claimEvidence ||
    claimEvidence.state !== 'source-stated' ||
    !model ||
    claimEvidence.label !== `${holder.label} holds ${claim.label} on ${story.company.label}` ||
    !inPhase(claimEvidence.source, raw, 'action', ctx) ||
    !clause(
      claimEvidence.source,
      `${escaped(holder.label)} holds ${escaped(claim.label)} on ${escaped(story.company.label)} during ${escaped(story.period)}`,
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'claim holder, claim and underlying subject must bind in one local action clause',
    );
  const c = escaped(story.company.label),
    h = escaped(holder.label),
    q = escaped(claim.label),
    p = escaped(story.period);
  const base = {
    ...story,
    kind: 'economic-rights' as const,
    holder,
    claim,
    claimEvidence,
    modelSource: model,
  };
  if (preset === 'ownership-versus-claims') {
    if (story.condition)
      return mechanismIssue(
        ctx,
        'ownership/control facts must not be made actual by a conditional claim',
      );
    const own = ownership(raw.ownership, raw, story.company, holder, story.period, ctx);
    const control = statement(raw.control, raw, 'response', ctx, {
      'source-stated': `${h} controls ${c} during ${p}`,
      negative: `${h} does not control ${c} during ${p}`,
      unknown: `${h} control of ${c} is unknown during ${p}`,
    });
    const priority = statement(raw.priority, raw, 'check', ctx, {
      'source-stated': `${q} has stated payout priority before shares in ${c} during ${p}`,
      unknown: `${q} payout priority in ${c} is unknown during ${p}`,
    });
    const payout = moneyFact(raw.payout, raw, story.company, story.period, ctx);
    if (
      !own ||
      !control ||
      !priority ||
      !payout ||
      !['source-stated', 'unknown', 'negative'].includes(payout.state) ||
      !clause(
        payout.source,
        `${c} records ${q} payout ${amountPattern(payout)} ${suffix(payout.basis)}`,
        ctx,
      )
    )
      return mechanismIssue(
        ctx,
        'shares, control, priority and payout need separate complete source clauses; priority is not a legal judgment',
      );
    return finish({ ...base, preset, ownership: own, control, priority, payout }, ctx);
  }
  const transfer = statement(raw.transfer, raw, 'response', ctx, {
    'source-stated': `${h} can transfer ${q} on ${c} during ${p}`,
    negative: `${h} cannot transfer ${q} on ${c} during ${p}`,
    unknown: `${q} transferability on ${c} is unknown during ${p}`,
    ...(story.condition
      ? { conditional: `${escaped(story.condition)}, ${h} may transfer ${q} on ${c} during ${p}` }
      : {}),
  });
  const liquidity = statement(raw.liquidity, raw, 'check', ctx, {
    'source-stated': `${c} underlying asset is liquid during ${p}`,
    negative: `${c} underlying asset is illiquid during ${p}`,
    unknown: `${c} underlying asset liquidity is unknown during ${p}`,
  });
  if (!transfer || !liquidity || Boolean(story.condition) !== (transfer.state === 'conditional'))
    return mechanismIssue(
      ctx,
      'claim transfer conditions and independent underlying liquidity must be preserved',
    );
  return finish({ ...base, preset, transfer, liquidity }, ctx);
}

export function parseInvestmentOutcomesScene(
  raw: Rec,
  ctx: ParseContext,
): InvestmentOutcomesScene | null {
  const story = begin(raw, ctx, 'investment-outcomes', ['setMode', 'setEvidence', 'outcomes']);
  if (!story) return null;
  if (
    raw.preset !== 'source-outcome-set' ||
    story.visualMode !== 'diagram' ||
    raw.modelSource !== null ||
    story.condition ||
    (raw.setMode !== 'alternatives' &&
      raw.setMode !== 'samples' &&
      raw.setMode !== 'distribution') ||
    !Array.isArray(raw.outcomes) ||
    raw.outcomes.length < 2 ||
    raw.outcomes.length > L.outcomes
  )
    return mechanismIssue(
      ctx,
      'financial outcome sets require diagram-only, 2–3 supplied outcomes and no native carrier',
    );
  const setEvidence = businessEvidence(raw.setEvidence, ctx);
  const outcomes: CapitalOutcome[] = [];
  for (const value of raw.outcomes) {
    if (!isRec(value) || !onlyFields(value, ['identity', 'measure', 'amount', 'probability'], ctx))
      return null;
    const name = identity(value.identity, 'financial outcome', raw, ctx);
    const measure = value.measure;
    const amount = moneyFact(value.amount, raw, story.company, story.period, ctx);
    if (
      !name ||
      (measure !== 'proceeds' && measure !== 'loss' && measure !== 'return') ||
      !amount ||
      (amount.state !== 'source-stated' && amount.state !== 'unknown') ||
      !['investments', 'funds', 'portfolios'].includes(amount.basis.population) ||
      !clause(
        amount.source,
        `${escaped(story.company.label)} records ${escaped(name.label)} ${measure} ${amountPattern(amount)} ${suffix(amount.basis)}`,
        ctx,
      )
    )
      return mechanismIssue(
        ctx,
        'financial proceeds/loss magnitude/return need explicit money direction, cohort and period; unknown is not zero',
      );
    let probability: CapitalOutcome['probability'] = null;
    if (value.probability !== null) {
      if (
        raw.setMode !== 'distribution' ||
        amount.state !== 'source-stated' ||
        !isRec(value.probability) ||
        !onlyFields(value.probability, ['numerator', 'denominator', 'source'], ctx)
      )
        return null;
      const numerator = shareCount(value.probability.numerator, true),
        denominator = shareCount(value.probability.denominator);
      const source = businessSpan(value.probability.source, ctx);
      if (
        numerator === null ||
        denominator === null ||
        numerator > denominator ||
        !source ||
        denominator !== amount.basis.denominator ||
        !inPhase(source, raw, 'check', ctx) ||
        !clause(
          source,
          `${escaped(story.company.label)} reports ${escaped(name.label)} probability ${numerator} of ${denominator} ${escaped(amount.basis.population)} during ${escaped(story.period)}`,
          ctx,
        )
      )
        return null;
      probability = { numerator, denominator, source };
    } else if (raw.setMode === 'distribution') return null;
    outcomes.push({ identity: name, measure, amount, probability });
  }
  const first = outcomes[0];
  if (
    outcomes.some(
      (o) =>
        !compatibleQuantityBases(first.amount.basis, o.amount.basis) ||
        (first.amount.money &&
          o.amount.money &&
          !compatibleBasis(
            { currency: first.amount.money.currency, period: first.amount.basis.period },
            { currency: o.amount.money.currency, period: o.amount.basis.period },
          )),
    )
  )
    return mechanismIssue(
      ctx,
      'outcome comparisons require the same financial unit, source cohort denominator and period; no FX or cohort conversion',
    );
  if (
    raw.setMode === 'distribution' &&
    outcomes.reduce((n, o) => n + (o.probability?.numerator ?? 0), 0) !==
      first.probability?.denominator
  )
    return mechanismIssue(
      ctx,
      'source probabilities must sum exactly to their common denominator; no invented rounding or duplicated outcomes',
    );
  const labels = outcomes.map((o) => escaped(o.identity.label)).join(', ');
  const mode =
    raw.setMode === 'distribution'
      ? 'a supplied financial distribution'
      : `financial ${raw.setMode}`;
  if (
    !setEvidence ||
    setEvidence.state !== 'source-stated' ||
    setEvidence.label !==
      (raw.setMode === 'distribution'
        ? 'supplied financial distribution'
        : `financial ${raw.setMode}`) ||
    !inPhase(setEvidence.source, raw, 'action', ctx) ||
    !clause(
      setEvidence.source,
      `${escaped(story.company.label)} lists ${labels} as ${mode} during ${escaped(story.period)}`,
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'outcome identities must belong to this one supplied financial set, not tasks, orders or a forecast',
    );
  return finish(
    {
      ...story,
      kind: 'investment-outcomes',
      preset: 'source-outcome-set',
      visualMode: 'diagram',
      modelSource: null,
      setMode: raw.setMode,
      setEvidence,
      outcomes,
    },
    ctx,
  );
}

function rounds(
  raw: Rec,
  ctx: ParseContext,
  story: NonNullable<ReturnType<typeof begin>>,
  holder: BusinessIdentity,
  own: CapitalOwnership,
): CapitalRound[] | null {
  if (!Array.isArray(raw.rounds) || raw.rounds.length < 1 || raw.rounds.length > L.rounds)
    return null;
  const result: CapitalRound[] = [];
  let observedTotal = own.total,
    observedPercent = own.percent;
  for (const value of raw.rounds) {
    if (
      !isRec(value) ||
      !onlyFields(
        value,
        [
          'identity',
          'commitment',
          'status',
          'issued',
          'beforeTotal',
          'afterTotal',
          'beforePercent',
          'afterPercent',
          'shareBasis',
          'source',
        ],
        ctx,
      )
    )
      return null;
    const revision = versionedIdentity(value.identity, ctx);
    if (
      !revision ||
      !inPhase(revision.identity.source, raw, 'setup', ctx) ||
      !inPhase(revision.source, raw, 'setup', ctx) ||
      !clause(
        revision.identity.source,
        `${escaped(revision.identity.label)} is a capital round`,
        ctx,
      ) ||
      !clause(
        revision.source,
        `${escaped(revision.identity.label)} has source version ${escaped(revision.version)}`,
        ctx,
      )
    )
      return null;
    const status = value.status;
    if (status !== 'issued' && status !== 'pending' && status !== 'conditional') return null;
    const commitment = moneyFact(
      value.commitment,
      raw,
      story.company,
      story.period,
      ctx,
      story.condition,
    );
    const source = businessSpan(value.source, ctx);
    const issued = shareCount(value.issued),
      beforeTotal = shareCount(value.beforeTotal),
      afterTotal = shareCount(value.afterTotal);
    const beforePercent = value.beforePercent,
      afterPercent = value.afterPercent;
    const shareBasis = quantityBasis(
      value.shareBasis,
      [story.company],
      ctx,
      status === 'conditional' && story.condition && source
        ? { state: 'conditional', condition: story.condition, source }
        : undefined,
    );
    if (
      !commitment ||
      !source ||
      !shareBasis ||
      issued === null ||
      beforeTotal === null ||
      afterTotal === null ||
      typeof beforePercent !== 'number' ||
      typeof afterPercent !== 'number' ||
      !validOwnership(own.shares, beforeTotal, issued, afterTotal, beforePercent, afterPercent) ||
      !sameSpan(source, commitment.source) ||
      !sameSpan(shareBasis.source, commitment.basis.source) ||
      shareBasis.unit !== 'shares' ||
      shareBasis.population !== 'shares' ||
      shareBasis.denominator !== beforeTotal ||
      shareBasis.period !== story.period ||
      beforeTotal !== observedTotal ||
      beforePercent !== observedPercent ||
      commitment.state !== (status === 'issued' ? 'source-stated' : status)
    )
      return null;
    const verb =
      status === 'issued' ? 'records' : status === 'pending' ? 'records pending' : 'may record';
    if (status === 'conditional' && !story.condition) return null;
    const prefix = status === 'conditional' ? `${escaped(story.condition ?? '')}, ` : '';
    const pattern = `${prefix}${escaped(story.company.label)} ${verb} ${escaped(revision.identity.label)} commitment ${amountPattern(commitment)} with ${status === 'issued' ? 'issued' : 'proposed'} issuance of ${issued} new shares from ${beforeTotal} to ${afterTotal} total shares with ${escaped(holder.label)} retaining ${own.shares} shares from ${escaped(String(beforePercent))} to ${escaped(String(afterPercent))} percent ${suffix(commitment.basis)} over ${beforeTotal} shares`;
    if (!clause(source, pattern, ctx)) return null;
    if (status === 'issued') {
      observedTotal = afterTotal;
      observedPercent = afterPercent;
    }
    result.push({
      identity: revision,
      commitment,
      status,
      issued,
      beforeTotal,
      afterTotal,
      beforePercent,
      afterPercent,
      shareBasis,
      source,
    });
  }
  if (Boolean(story.condition) !== result.some((r) => r.status === 'conditional')) return null;
  return result;
}
function obligations(
  raw: Rec,
  ctx: ParseContext,
  story: NonNullable<ReturnType<typeof begin>>,
  lender: BusinessIdentity,
): CapitalObligation[] | null {
  if (
    !Array.isArray(raw.obligations) ||
    raw.obligations.length < 1 ||
    raw.obligations.length > L.obligations
  )
    return null;
  const result: CapitalObligation[] = [];
  for (const value of raw.obligations) {
    if (!isRec(value) || !onlyFields(value, ['identity', 'principal', 'maturity', 'source'], ctx))
      return null;
    const name = identity(value.identity, 'debt obligation', raw, ctx);
    const principal = moneyFact(value.principal, raw, story.company, story.period, ctx);
    const maturity = hybridPhrase(value.maturity, ctx, 28),
      source = businessSpan(value.source, ctx);
    if (
      !name ||
      !principal ||
      !['source-stated', 'unknown'].includes(principal.state) ||
      !maturity ||
      !source ||
      !inPhase(source, raw, 'check', ctx) ||
      !clause(
        principal.source,
        `${escaped(story.company.label)} records ${escaped(name.label)} principal ${amountPattern(principal)} ${suffix(principal.basis)}`,
        ctx,
      ) ||
      !clause(
        source,
        `${escaped(lender.label)} holds ${escaped(name.label)} against ${escaped(story.company.label)} due on ${escaped(maturity)} during ${escaped(story.period)}`,
        ctx,
      )
    )
      return null;
    result.push({ identity: name, principal, maturity, source });
  }
  return result;
}
function capacity(
  value: unknown,
  metric: string,
  raw: Rec,
  ctx: ParseContext,
  story: NonNullable<ReturnType<typeof begin>>,
  asset: BusinessIdentity,
): CapitalCountFact | null {
  if (
    !isRec(value) ||
    !onlyFields(value, ['state', 'count', 'basis', 'source'], ctx) ||
    (value.state !== 'source-stated' && value.state !== 'unknown')
  )
    return null;
  const count = value.count === null ? null : shareCount(value.count, true);
  const source = businessSpan(value.source, ctx),
    basis = quantityBasis(value.basis, [story.company], ctx);
  if (
    !source ||
    !basis ||
    !inPhase(source, raw, 'response', ctx) ||
    !sameSpan(source, basis.source) ||
    basis.period !== story.period ||
    basis.unit !== 'racks' ||
    basis.population !== 'racks' ||
    (value.state === 'unknown' ? value.count !== null : count === null) ||
    !clause(
      source,
      `${escaped(story.company.label)} records ${escaped(asset.label)} ${metric} ${count === null ? 'unknown racks' : quantityPattern(count, 'racks')} ${suffix(basis)}`,
      ctx,
    )
  )
    return null;
  return { state: value.state, count, basis, source };
}
export function parseCapitalStructureScene(
  raw: Rec,
  ctx: ParseContext,
): CapitalStructureScene | null {
  const story = begin(raw, ctx, 'capital-structure', [
    'holder',
    'ownership',
    'rounds',
    'lender',
    'asset',
    'assetEvidence',
    'obligations',
    'installed',
    'commissioned',
    'duration',
    'liquidity',
  ]);
  if (!story) return null;
  const preset = raw.preset;
  if (preset === 'conditional-rounds') {
    if (!onlyFields(raw, [...COMMON_FIELDS, 'holder', 'ownership', 'rounds'], ctx)) return null;
    const holder = identity(raw.holder, 'share holder', raw, ctx);
    const model = modelSource(
      raw,
      `${escaped(story.company.label)} uses commitment records beside ownership and economic claim records`,
      ctx,
    );
    const own = holder
      ? ownership(raw.ownership, raw, story.company, holder, story.period, ctx)
      : null;
    const entries = holder && own ? rounds(raw, ctx, story, holder, own) : null;
    if (!holder || !model || !own || !entries)
      return mechanismIssue(
        ctx,
        'rounds require source versions, exact share arithmetic and full proposed/conditional bodies; proposals never become observed dilution',
      );
    return finish(
      {
        ...story,
        kind: 'capital-structure',
        preset,
        holder,
        ownership: own,
        rounds: entries,
        modelSource: model,
      },
      ctx,
    );
  }
  if (preset !== 'financing-versus-capacity' && preset !== 'obligations-and-maturity')
    return mechanismIssue(ctx, 'unsupported capital-structure preset');
  if (
    story.condition ||
    !onlyFields(
      raw,
      [
        ...COMMON_FIELDS,
        'lender',
        'asset',
        'assetEvidence',
        'obligations',
        ...(preset === 'financing-versus-capacity'
          ? ['installed', 'commissioned']
          : ['duration', 'liquidity']),
      ],
      ctx,
    )
  )
    return null;
  const lender = identity(raw.lender, 'lender', raw, ctx);
  const asset = identity(
    raw.asset,
    preset === 'financing-versus-capacity' ? 'data-center rack installation' : 'underlying asset',
    raw,
    ctx,
  );
  const assetEvidence = businessEvidence(raw.assetEvidence, ctx);
  const entries = lender ? obligations(raw, ctx, story, lender) : null;
  if (
    !asset ||
    !lender ||
    !entries ||
    !assetEvidence ||
    assetEvidence.state !== 'source-stated' ||
    assetEvidence.label !==
      `${story.company.label} ${preset === 'financing-versus-capacity' ? 'operates' : 'owns'} ${asset.label}` ||
    !inPhase(assetEvidence.source, raw, 'action', ctx) ||
    !clause(
      assetEvidence.source,
      `${escaped(story.company.label)} ${preset === 'financing-versus-capacity' ? 'operates' : 'owns'} ${escaped(asset.label)} during ${escaped(story.period)}`,
      ctx,
    )
  )
    return mechanismIssue(
      ctx,
      'lender, debt amounts/dates and an independently source-owned/operated asset are required',
    );
  const model = modelSource(
    raw,
    `${escaped(story.company.label)} uses dated debt records beside ${preset === 'financing-versus-capacity' ? 'data-center rack' : 'asset'} records for ${escaped(asset.label)}`,
    ctx,
  );
  if (!model) return null;
  const base = {
    ...story,
    kind: 'capital-structure' as const,
    lender,
    asset,
    assetEvidence,
    obligations: entries,
    modelSource: model,
  };
  if (preset === 'financing-versus-capacity') {
    const installed = capacity(raw.installed, 'installed', raw, ctx, story, asset);
    const commissioned = capacity(raw.commissioned, 'commissioned', raw, ctx, story, asset);
    if (
      !installed ||
      !commissioned ||
      !compatibleQuantityBases(installed.basis, commissioned.basis) ||
      (installed.count !== null &&
        commissioned.count !== null &&
        commissioned.count > installed.count)
    )
      return mechanismIssue(
        ctx,
        'installed and commissioned racks need independent compatible physical counts, never a monetary conversion',
      );
    return finish({ ...base, preset, installed, commissioned }, ctx);
  }
  const a = escaped(asset.label),
    p = escaped(story.period);
  const duration = statement(raw.duration, raw, 'check', ctx, {
    'source-stated': `${a} asset duration is (?:long term|short term) during ${p}`,
    unknown: `${a} asset duration is unknown during ${p}`,
  });
  const liquidity = statement(raw.liquidity, raw, 'check', ctx, {
    'source-stated': `${a} underlying asset is liquid during ${p}`,
    negative: `${a} underlying asset is illiquid during ${p}`,
    unknown: `${a} underlying asset liquidity is unknown during ${p}`,
  });
  if (!duration || !liquidity)
    return mechanismIssue(
      ctx,
      'asset duration/liquidity are separately stated facts, not inferred from debt dates or refinancing',
    );
  return finish({ ...base, preset, duration, liquidity }, ctx);
}
