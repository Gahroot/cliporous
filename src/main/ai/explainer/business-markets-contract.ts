import {
  marketsContentFits,
  marketsIdentities,
  marketsPresentationFits,
  marketsRows,
  PROCUREMENT_ROLES,
} from '../../remotion/compositions/explainer/business/markets/presentation';
import type {
  AcceptanceState,
  ChannelConcentrationScene,
  ComplementarySpecialistsScene,
  DemandAccessScene,
  DifferentiatedOfferingScene,
  MarketDependencyScene,
  MarketFact,
  MarketMatch,
  MarketParticipation,
  MarketSidedParticipant,
  MarketsScene,
  MarketVolume,
  MigrationConstraintsScene,
  ParticipationMatchingScene,
  PaymentState,
  ProcurementCommitmentScene,
  ProcurementMoneyFact,
  ProcurementRole,
  ProcurementRoleFact,
  QuoteState,
  StatedParticipationBenefitScene,
  SupplierDistributionScene,
} from '../../remotion/compositions/explainer/business/markets/types';
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
import { moneyPattern, parseMoney, shareCount } from './finance-contract';
import { hybridPhrase, hybridStory, normalizedPhrase, onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

const ENVELOPE = [
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
];
const END = /[!?;]|\.(?=\s|$)/u;

/** Complete sentence boundaries prevent cropping off if/not/pending or a trailing qualifier. */
function clause(
  raw: unknown,
  ctx: ParseContext,
): { source: BusinessWordSpan; text: string } | null {
  const source = businessSpan(raw, ctx);
  if (!source) return mechanismIssue(ctx, 'market fact needs a bounded local source span');
  const text = businessEvidenceText(source, ctx);
  if (
    (source.fromWord > ctx.win.startWord &&
      !END.test(ctx.words[source.fromWord - 1]?.text ?? '')) ||
    (source.toWord < ctx.win.endWord && !END.test(ctx.words[source.toWord]?.text ?? '')) ||
    !text.trim() ||
    END.test(text.trim().replace(/[.!?;]$/u, ''))
  )
    return mechanismIssue(
      ctx,
      'market evidence must retain one complete local clause and its qualifications',
    );
  return { source, text };
}
function matchClause(text: string, pattern: string): boolean {
  return new RegExp(`^(?:${pattern})[.!?;\\s]*$`, 'iu').test(text.replace(/’/gu, "'").trim());
}
function fact<S extends string>(
  raw: unknown,
  patterns: Readonly<Partial<Record<S, string>>>,
  condition: string | undefined,
  ctx: ParseContext,
): MarketFact<S> | null {
  if (!isRec(raw) || !onlyFields(raw, ['state', 'source'], ctx))
    return mechanismIssue(
      ctx,
      'market facts accept only state and source, never raw text or rendering fields',
    );
  const state = Object.keys(patterns).find((key): key is S => key === raw.state);
  const local = clause(raw.source, ctx);
  if (!state || !local)
    return mechanismIssue(ctx, 'market fact requires its concrete allowlisted source state');
  let pattern = patterns[state];
  if (!pattern) return null;
  if (state === 'conditional') {
    if (!condition)
      return mechanismIssue(ctx, 'conditional market facts require the complete source condition');
    pattern = `(?:${escaped(condition)}[,\\s]+${pattern}|${pattern}\\s+${escaped(condition)})`;
  }
  if (
    !matchClause(local.text, pattern) ||
    ([
      'source-stated',
      'completed',
      'participating',
      'matched',
      'requested',
      'quoted',
      'granted',
      'accepted',
      'paid',
      'satisfied',
    ].includes(state) &&
      !assertedBusinessClaim(local.text))
  )
    return mechanismIssue(
      ctx,
      'market clause must bind its own actors, action, target and literal state; co-occurrence is not evidence',
    );
  return { state, ...local };
}
/** Each action's negative/unknown form stays attached to the same endpoints. */
function relationship(
  raw: unknown,
  subject: string,
  verb: string,
  infinitive: string,
  target: string,
  condition: string | undefined,
  ctx: ParseContext,
): MarketFact | null {
  const positive = `${subject} ${verb} ${target}`;
  return fact(
    raw,
    {
      'source-stated': positive,
      negative: `${subject} (?:does not|did not|cannot) ${infinitive} ${target}`,
      conditional: `${subject} (?:may|might|could|will|would) ${infinitive} ${target}`,
      unknown: `Whether ${positive} is (?:unknown|unstated|unresolved)`,
    },
    condition,
    ctx,
  );
}
function identity(raw: unknown, ctx: ParseContext): BusinessIdentity | null {
  const result = businessIdentity(raw, ctx);
  return (
    result ??
    mechanismIssue(ctx, 'market endpoint needs a bounded ID, label and its own source identity')
  );
}
function identities(
  raw: unknown,
  min: number,
  max: number,
  ctx: ParseContext,
): BusinessIdentity[] | null {
  if (!Array.isArray(raw) || raw.length < min || raw.length > max)
    return mechanismIssue(
      ctx,
      `market identities require an authored array of ${min}..${max} entries`,
    );
  const result: BusinessIdentity[] = [];
  for (const value of raw) {
    const entry = identity(value, ctx);
    if (!entry) return null;
    result.push(entry);
  }
  return distinct(result, ctx) ? result : null;
}
function distinct(entries: readonly BusinessIdentity[], ctx: ParseContext): boolean {
  if (
    entries.length > 8 ||
    new Set(entries.map((e) => e.id)).size !== entries.length ||
    new Set(entries.map((e) => normalizedPhrase(e.label))).size !== entries.length
  ) {
    mechanismIssue(
      ctx,
      'market identities must be distinct and remain within eight entities; do not split or merge actors',
    );
    return false;
  }
  return true;
}
function array(raw: unknown, min: number, max: number, ctx: ParseContext): unknown[] | null {
  return Array.isArray(raw) && raw.length >= min && raw.length <= max
    ? raw
    : mechanismIssue(ctx, `market recipe requires ${min}..${max} concrete entries; no truncation`);
}
function completeText(text: string): string {
  return text
    .normalize('NFKC')
    .trim()
    .replace(/[.!?;]$/u, '')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
}
function base(raw: Rec, fields: readonly string[], ctx: ParseContext): BusinessStory | null {
  if (!onlyFields(raw, [...ENVELOPE, ...fields], ctx)) return null;
  if (
    !hybridPhrase(raw.label, ctx, 28) ||
    !hybridPhrase(raw.subject, ctx, 28) ||
    !hybridPhrase(raw.outcome, ctx, 40) ||
    (raw.condition !== undefined && !hybridPhrase(raw.condition, ctx, 64))
  )
    return mechanismIssue(
      ctx,
      'market labels or complete condition exceed fixed-font authored bounds',
    );
  const parsed = hybridStory(raw, ctx, ['factEvidence', ...fields]);
  const factEvidence = businessEvidence(raw.factEvidence, ctx);
  if (!parsed || !factEvidence) return null;
  const evidenceClause = clause(factEvidence.source, ctx);
  const resolveWord = ctx.inWin(raw.resolveWord);
  if (
    !evidenceClause ||
    resolveWord === null ||
    factEvidence.source.fromWord < resolveWord ||
    completeText(evidenceClause.text) !== completeText(parsed.story.outcome) ||
    completeText(evidenceClause.text) !== completeText(factEvidence.label)
  )
    return mechanismIssue(
      ctx,
      'market outcome/evidence must retain the complete resolve clause, including negation, condition and pending state',
    );
  if (
    (raw.layout !== undefined &&
      (typeof raw.layout !== 'string' ||
        !['stack', 'stack-flipped', 'pip', 'over', 'takeover'].includes(raw.layout))) ||
    (raw.startWord !== undefined && ctx.inWin(raw.startWord) !== ctx.win.startWord) ||
    (raw.endWord !== undefined && ctx.inWin(raw.endWord) !== ctx.win.endWord)
  )
    return mechanismIssue(
      ctx,
      'market envelope must preserve its actual full source window and authored layout',
    );
  return { ...parsed.story, factEvidence };
}
function marketBase(
  raw: Rec,
  fields: readonly string[],
  ctx: ParseContext,
): { story: BusinessStory; business: BusinessIdentity } | null {
  const story = base(raw, ['business', ...fields], ctx);
  const business = identity(raw.business, ctx);
  if (!story || !business) return null;
  if (normalizedPhrase(story.subject) !== normalizedPhrase(business.label))
    return mechanismIssue(ctx, 'market setup subject must be the same source-named business');
  return { story, business };
}
function finish<T extends MarketsScene>(scene: T, ctx: ParseContext): T | null {
  if (!distinct(marketsIdentities(scene), ctx)) return null;
  const outcome = completeText(scene.outcome);
  const promotion =
    /\b(?:paid|pays?|payments?|purchase|winner|wins?|profit|profits|success|successful|sales|conversions?|network value|dominance)\b/iu.test(
      outcome,
    );
  const caveat =
    /^(?:matching is not a paid purchase|alternatives have no stated winner|dependency is not permanent dominance)$/iu.test(
      outcome,
    );
  if (
    promotion &&
    !caveat &&
    !marketsRows(scene).some((row) => row.id !== 'identities' && completeText(row.text) === outcome)
  )
    return mechanismIssue(
      ctx,
      'resolve cannot promote success, payment, a winner or network value beyond its source-validated core facts',
    );
  if (!marketsContentFits(scene))
    return mechanismIssue(
      ctx,
      'market content exceeds eight identities, twelve facts or four holds (including unknown roles and money)',
    );
  if (!marketsPresentationFits(scene, ctx.win.endTime))
    return mechanismIssue(
      ctx,
      'market fixed-font facts need complete >=1.5s pages and >=0.8s final hold; split rather than shrink or drop facts',
    );
  return scene;
}
function sameSpan(a: BusinessWordSpan, b: BusinessWordSpan): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}

function volume(
  raw: unknown,
  business: BusinessIdentity,
  channel: BusinessIdentity,
  group: BusinessIdentity,
  condition: string | undefined,
  ctx: ParseContext,
): MarketVolume | null {
  if (!isRec(raw) || !onlyFields(raw, ['state', 'count', 'basis', 'source'], ctx))
    return mechanismIssue(
      ctx,
      'each channel/customer group requires an explicit distribution volume state',
    );
  const b = escaped(business.label),
    c = escaped(channel.label),
    g = escaped(group.label);
  const local = clause(raw.source, ctx);
  if (!local) return null;
  if (raw.state !== 'source-stated') {
    if (raw.count !== null || raw.basis !== null)
      return mechanismIssue(
        ctx,
        'unknown, negative or conditional volume remains null, never zero or measured conversion',
      );
    const parsed = fact(
      { state: raw.state, source: raw.source },
      {
        unknown: `${b} distribution volume through ${c} to ${g} is (?:unknown|unstated|unresolved)`,
        negative: `${b} does not distribute through ${c} to ${g}`,
        conditional: `${b} may distribute through ${c} to ${g}`,
      },
      condition,
      ctx,
    );
    return parsed ? { ...parsed, count: null, basis: null } : null;
  }
  const count = shareCount(raw.count, true);
  const basis = quantityBasis(raw.basis, [business, channel, group], ctx);
  if (
    count === null ||
    !basis ||
    basis.denominator === null ||
    basis.subjectId !== business.id ||
    !sameSpan(basis.source, local.source) ||
    /\b(?:sales|conversions|revenue|profit|payments)\b/iu.test(basis.unit)
  )
    return mechanismIssue(
      ctx,
      'stated distribution count needs its own compatible finite quantity basis, not sales or inferred conversion',
    );
  const pattern = `${b} distributes ${quantityPattern(count, basis.unit)} through ${c} to ${g} during ${escaped(basis.period)} among ${quantityPattern(basis.denominator, basis.population)}`;
  if (!matchClause(local.text, pattern) || !assertedBusinessClaim(local.text))
    return mechanismIssue(
      ctx,
      'distribution quantity must bind this channel/customer group, value, unit, period and denominator in one clause',
    );
  return {
    state: 'source-stated',
    count,
    basis: { ...basis, denominator: basis.denominator },
    ...local,
  };
}
function channelConcentration(raw: Rec, ctx: ParseContext): ChannelConcentrationScene | null {
  const parsed = marketBase(raw, ['customerGroups', 'channels'], ctx);
  const customerGroups = identities(raw.customerGroups, 2, 3, ctx);
  const entries = array(raw.channels, 2, 4, ctx);
  if (!parsed || !customerGroups || !entries) return null;
  const channels: ChannelConcentrationScene['channels'][number][] = [];
  for (const entry of entries) {
    if (
      !isRec(entry) ||
      !onlyFields(entry, ['identity', 'customerGroupId', 'dependency', 'volume'], ctx)
    )
      return null;
    const channel = identity(entry.identity, ctx);
    const group = customerGroups.find((g) => g.id === entry.customerGroupId);
    if (!channel || !group)
      return mechanismIssue(ctx, 'each distribution channel needs its own known customer group ID');
    const dependency = relationship(
      entry.dependency,
      escaped(parsed.business.label),
      'relies on',
      'rely on',
      `${escaped(channel.label)} to reach ${escaped(group.label)}`,
      parsed.story.condition,
      ctx,
    );
    const measured = volume(
      entry.volume,
      parsed.business,
      channel,
      group,
      parsed.story.condition,
      ctx,
    );
    if (!dependency || !measured) return null;
    channels.push({ identity: channel, customerGroupId: group.id, dependency, volume: measured });
  }
  if (customerGroups.some((g) => !channels.some((c) => c.customerGroupId === g.id)))
    return mechanismIssue(
      ctx,
      'every customer group must have a source-supported channel relationship',
    );
  const numeric = channels.flatMap((c) => (c.volume.count === null ? [] : [c.volume.basis]));
  if (numeric.some((b) => !compatibleQuantityBases(numeric[0], b)))
    return mechanismIssue(
      ctx,
      'channel/customer quantities require identical subject, population, unit, period and denominator; unknown groups are not zero',
    );
  return finish(
    {
      kind: 'market-dependency',
      preset: 'channel-concentration',
      ...parsed.story,
      business: parsed.business,
      customerGroups,
      channels,
    },
    ctx,
  );
}
function demandAccess(raw: Rec, ctx: ParseContext): DemandAccessScene | null {
  const parsed = marketBase(
    raw,
    ['offering', 'demand', 'channel', 'production', 'demandFact', 'access'],
    ctx,
  );
  const offering = identity(raw.offering, ctx),
    demand = identity(raw.demand, ctx),
    channel = identity(raw.channel, ctx);
  if (!parsed || !offering || !demand || !channel) return null;
  const b = escaped(parsed.business.label),
    o = escaped(offering.label),
    d = escaped(demand.label),
    c = escaped(channel.label);
  const production = relationship(
    raw.production,
    b,
    'produces',
    'produce',
    o,
    parsed.story.condition,
    ctx,
  );
  const demandFact = relationship(
    raw.demandFact,
    d,
    'demand',
    'demand',
    `${o} from ${b}`,
    parsed.story.condition,
    ctx,
  );
  const access = relationship(
    raw.access,
    b,
    'accesses',
    'access',
    `${d} through ${c} for ${o}`,
    parsed.story.condition,
    ctx,
  );
  return production && demandFact && access
    ? finish(
        {
          kind: 'market-dependency',
          preset: 'demand-access',
          ...parsed.story,
          business: parsed.business,
          offering,
          demand,
          channel,
          production,
          demandFact,
          access,
        },
        ctx,
      )
    : null;
}
function migrationConstraints(raw: Rec, ctx: ParseContext): MigrationConstraintsScene | null {
  const parsed = marketBase(raw, ['fromProvider', 'toProvider', 'migration', 'constraints'], ctx);
  const fromProvider = identity(raw.fromProvider, ctx),
    toProvider = identity(raw.toProvider, ctx);
  const entries = array(raw.constraints, 1, 3, ctx);
  if (
    !parsed ||
    !fromProvider ||
    !toProvider ||
    !entries ||
    !isRec(raw.migration) ||
    !onlyFields(raw.migration, ['identity', 'state', 'source'], ctx)
  )
    return null;
  const migrationIdentity = identity(raw.migration.identity, ctx);
  if (!migrationIdentity) return null;
  const b = escaped(parsed.business.label),
    m = escaped(migrationIdentity.label),
    f = escaped(fromProvider.label),
    t = escaped(toProvider.label);
  const target = `${m} from ${f} to ${t}`;
  const migration = fact(
    { state: raw.migration.state, source: raw.migration.source },
    {
      completed: `${b} completed migration ${target}`,
      pending: `${b} migration ${target} remains pending`,
      negative: `${b} did not complete migration ${target}`,
      unknown: `${b} migration ${target} is unknown`,
      conditional: `${b} may complete migration ${target}`,
    },
    parsed.story.condition,
    ctx,
  );
  if (!migration) return null;
  const constraints: MigrationConstraintsScene['constraints'][number][] = [];
  for (const entry of entries) {
    if (!isRec(entry) || !onlyFields(entry, ['identity', 'state', 'source'], ctx)) return null;
    const constraint = identity(entry.identity, ctx);
    if (!constraint) return null;
    const c = escaped(constraint.label);
    const check = fact(
      { state: entry.state, source: entry.source },
      {
        unmet: `${b} migration ${target} requires ${c} and ${c} remains unmet`,
        satisfied: `${b} satisfied ${c} for migration ${target}`,
        negative: `${b} migration ${target} does not require ${c}`,
        unknown: `${b} constraint ${c} for migration ${target} is unknown`,
        conditional: `${b} may satisfy ${c} for migration ${target}`,
      },
      parsed.story.condition,
      ctx,
    );
    if (!check) return null;
    constraints.push({ identity: constraint, ...check });
  }
  if (
    migration.state === 'completed' &&
    constraints.some((c) => c.state !== 'satisfied' && c.state !== 'negative')
  )
    return mechanismIssue(
      ctx,
      'migration cannot complete across a still-unmet, conditional or unknown constraint',
    );
  return finish(
    {
      kind: 'market-dependency',
      preset: 'migration-constraints',
      ...parsed.story,
      business: parsed.business,
      fromProvider,
      toProvider,
      migration: { identity: migrationIdentity, ...migration },
      constraints,
    },
    ctx,
  );
}
function participation(
  raw: unknown,
  participant: BusinessIdentity,
  business: BusinessIdentity,
  condition: string | undefined,
  ctx: ParseContext,
): MarketParticipation | null {
  if (
    !isRec(raw) ||
    !onlyFields(raw, ['participantId', 'state', 'source'], ctx) ||
    raw.participantId !== participant.id
  )
    return mechanismIssue(ctx, 'participation must reference its own named participant ID');
  const p = escaped(participant.label),
    b = escaped(business.label);
  const parsed = fact(
    { state: raw.state, source: raw.source },
    {
      participating: `${p} participates on ${b}`,
      negative: `${p} does not participate on ${b}`,
      conditional: `${p} may participate on ${b}`,
      unknown: `Whether ${p} participates on ${b} is unknown`,
    },
    condition,
    ctx,
  );
  return parsed ? { participantId: participant.id, ...parsed } : null;
}
function participationList(
  raw: unknown,
  participants: readonly BusinessIdentity[],
  business: BusinessIdentity,
  condition: string | undefined,
  ctx: ParseContext,
): MarketParticipation[] | null {
  const entries = array(raw, participants.length, participants.length, ctx);
  if (!entries) return null;
  const result: MarketParticipation[] = [];
  for (const entry of entries) {
    const participant = isRec(entry)
      ? participants.find((p) => p.id === entry.participantId)
      : undefined;
    if (!participant)
      return mechanismIssue(
        ctx,
        'participation IDs must resolve to this scene roster, not unrelated actors',
      );
    const parsed = participation(entry, participant, business, condition, ctx);
    if (!parsed) return null;
    result.push(parsed);
  }
  return new Set(result.map((p) => p.participantId)).size === participants.length
    ? result
    : mechanismIssue(ctx, 'every participant needs exactly one independent participation fact');
}
function matchAcceptance(
  raw: unknown,
  left: BusinessIdentity,
  right: BusinessIdentity,
  business: BusinessIdentity,
  condition: string | undefined,
  ctx: ParseContext,
): MarketFact<AcceptanceState> | null {
  const l = escaped(left.label),
    r = escaped(right.label),
    b = escaped(business.label);
  return fact(
    raw,
    {
      accepted: `${l} accepted match with ${r} on ${b}`,
      pending: `Acceptance by ${l} of match with ${r} on ${b} is pending`,
      negative: `${l} did not accept match with ${r} on ${b}`,
      conditional: `${l} may accept match with ${r} on ${b}`,
      unknown: `Acceptance by ${l} of match with ${r} on ${b} is unknown`,
    },
    condition,
    ctx,
  );
}
function participationMatching(raw: Rec, ctx: ParseContext): ParticipationMatchingScene | null {
  const parsed = marketBase(raw, ['participants', 'participations', 'matches'], ctx);
  const entries = array(raw.participants, 2, 4, ctx),
    matchEntries = array(raw.matches, 1, 3, ctx);
  if (!parsed || !entries || !matchEntries) return null;
  const participants: MarketSidedParticipant[] = [];
  for (const entry of entries) {
    if (!isRec(entry) || !onlyFields(entry, ['identity', 'side', 'role'], ctx)) return null;
    const actor = identity(entry.identity, ctx);
    if (!actor || (entry.side !== 'buyer' && entry.side !== 'seller'))
      return mechanismIssue(
        ctx,
        'market exchange requires an explicitly sourced buyer or seller side per participant',
      );
    const role = fact(
      entry.role,
      {
        'source-stated': `${escaped(actor.label)} is (?:a |the )?${entry.side} on ${escaped(parsed.business.label)}`,
      },
      undefined,
      ctx,
    );
    if (!role) return null;
    participants.push({ identity: actor, side: entry.side, role });
  }
  if (
    !distinct(
      participants.map((p) => p.identity),
      ctx,
    ) ||
    !participants.some((p) => p.side === 'buyer') ||
    !participants.some((p) => p.side === 'seller')
  )
    return mechanismIssue(ctx, 'two-sided matching requires both actual source-named sides');
  const participations = participationList(
    raw.participations,
    participants.map((p) => p.identity),
    parsed.business,
    parsed.story.condition,
    ctx,
  );
  if (!participations) return null;
  const matches: MarketMatch[] = [];
  for (const entry of matchEntries) {
    if (
      !isRec(entry) ||
      !onlyFields(entry, ['leftId', 'rightId', 'state', 'source', 'acceptance'], ctx)
    )
      return null;
    const left = participants.find((p) => p.identity.id === entry.leftId),
      right = participants.find((p) => p.identity.id === entry.rightId);
    if (!left || !right || left.side !== 'buyer' || right.side !== 'seller')
      return mechanismIssue(
        ctx,
        'matching endpoints must be the locally named buyer and seller, not swapped or same-side actors',
      );
    const b = escaped(parsed.business.label),
      l = escaped(left.identity.label),
      r = escaped(right.identity.label);
    const matched = fact(
      { state: entry.state, source: entry.source },
      {
        matched: `${b} matched ${l} with ${r}`,
        pending: `${b} match of ${l} with ${r} is pending`,
        negative: `${b} did not match ${l} with ${r}`,
        conditional: `${b} may match ${l} with ${r}`,
        unknown: `${b} match of ${l} with ${r} is unknown`,
      },
      parsed.story.condition,
      ctx,
    );
    const acceptance = matchAcceptance(
      entry.acceptance,
      left.identity,
      right.identity,
      parsed.business,
      parsed.story.condition,
      ctx,
    );
    if (!matched || !acceptance) return null;
    matches.push({ leftId: left.identity.id, rightId: right.identity.id, ...matched, acceptance });
  }
  if (new Set(matches.map((m) => `${m.leftId}:${m.rightId}`)).size !== matches.length)
    return mechanismIssue(ctx, 'matching facts may not duplicate a buyer/seller pair');
  return finish(
    {
      kind: 'market-dependency',
      preset: 'participation-matching',
      ...parsed.story,
      business: parsed.business,
      participants,
      participations,
      matches,
    },
    ctx,
  );
}
function statedBenefit(raw: Rec, ctx: ParseContext): StatedParticipationBenefitScene | null {
  const parsed = marketBase(raw, ['participants', 'participations', 'benefit'], ctx);
  const participants = identities(raw.participants, 2, 3, ctx);
  if (!parsed || !participants || parsed.story.visualMode !== 'diagram' || !parsed.story.condition)
    return mechanismIssue(
      ctx,
      'stated-participation-benefit is diagram-only and needs an explicit source condition',
    );
  const participations = participationList(
    raw.participations,
    participants,
    parsed.business,
    parsed.story.condition,
    ctx,
  );
  if (
    !participations ||
    !isRec(raw.benefit) ||
    !onlyFields(raw.benefit, ['label', 'state', 'source'], ctx)
  )
    return null;
  const label = hybridPhrase(raw.benefit.label, ctx, 28);
  if (
    !label ||
    /[\d%]|\b(?:network value|revenue|profit|sales|conversion|guaranteed|winner)\b/iu.test(label)
  )
    return mechanismIssue(
      ctx,
      'conditional participation benefit must be source-stated, not a measured network-value claim',
    );
  const people = participants.map((p) => escaped(p.label)).join(' and ');
  const benefit = fact(
    { state: raw.benefit.state, source: raw.benefit.source },
    {
      conditional: `${escaped(parsed.business.label)} states participation by ${people} may provide ${escaped(label)}`,
    },
    parsed.story.condition,
    ctx,
  );
  return benefit
    ? finish(
        {
          kind: 'market-dependency',
          preset: 'stated-participation-benefit',
          ...parsed.story,
          visualMode: 'diagram',
          condition: parsed.story.condition,
          business: parsed.business,
          participants,
          participations,
          benefit: { label, ...benefit },
        },
        ctx,
      )
    : null;
}
function differentiatedOffering(raw: Rec, ctx: ParseContext): DifferentiatedOfferingScene | null {
  const parsed = marketBase(raw, ['comparisonSubject', 'baseline', 'offerings'], ctx);
  const comparisonSubject = identity(raw.comparisonSubject, ctx),
    entries = array(raw.offerings, 2, 3, ctx);
  if (
    !parsed ||
    !comparisonSubject ||
    !entries ||
    !isRec(raw.baseline) ||
    !onlyFields(raw.baseline, ['label', 'source'], ctx)
  )
    return null;
  const baselineLabel = hybridPhrase(raw.baseline.label, ctx, 28);
  if (!baselineLabel) return null;
  const offerings: DifferentiatedOfferingScene['offerings'][number][] = [];
  const b = escaped(parsed.business.label),
    subject = escaped(comparisonSubject.label),
    bl = escaped(baselineLabel);
  for (const entry of entries) {
    if (
      !isRec(entry) ||
      !onlyFields(entry, ['identity', 'differentiation'], ctx) ||
      !isRec(entry.differentiation) ||
      !onlyFields(entry.differentiation, ['label', 'state', 'source'], ctx)
    )
      return null;
    const offering = identity(entry.identity, ctx),
      label = hybridPhrase(entry.differentiation.label, ctx, 28);
    if (
      !offering ||
      !label ||
      /\b(?:best|better|winner|outperform|dominant|superior|guaranteed)\b/iu.test(label)
    )
      return mechanismIssue(
        ctx,
        'differentiation names sourced attributes, never a winner or inferred advantage',
      );
    const difference = relationship(
      { state: entry.differentiation.state, source: entry.differentiation.source },
      b,
      'offers',
      'offer',
      `${escaped(offering.label)} for ${subject} on ${bl} with ${escaped(label)}`,
      parsed.story.condition,
      ctx,
    );
    if (!difference) return null;
    offerings.push({ identity: offering, differentiation: { label, ...difference } });
  }
  const names = offerings.map((o) => escaped(o.identity.label)).join(' and ');
  const baseline = fact(
    { state: 'source-stated', source: raw.baseline.source },
    { 'source-stated': `For ${b}, ${names} share ${subject} with ${bl}` },
    undefined,
    ctx,
  );
  return baseline
    ? finish(
        {
          kind: 'market-dependency',
          preset: 'differentiated-offering',
          ...parsed.story,
          business: parsed.business,
          comparisonSubject,
          baseline: { label: baselineLabel, ...baseline },
          offerings,
        },
        ctx,
      )
    : null;
}
function supplierDistribution(raw: Rec, ctx: ParseContext): SupplierDistributionScene | null {
  const parsed = marketBase(raw, ['supplier', 'item', 'channel', 'supply', 'distribution'], ctx);
  const supplier = identity(raw.supplier, ctx),
    item = identity(raw.item, ctx),
    channel = identity(raw.channel, ctx);
  if (!parsed || !supplier || !item || !channel) return null;
  const b = escaped(parsed.business.label),
    s = escaped(supplier.label),
    i = escaped(item.label),
    c = escaped(channel.label);
  const supply = relationship(
    raw.supply,
    s,
    'supplies',
    'supply',
    `${i} to ${b}`,
    parsed.story.condition,
    ctx,
  );
  const distribution = relationship(
    raw.distribution,
    b,
    'distributes',
    'distribute',
    `${i} through ${c}`,
    parsed.story.condition,
    ctx,
  );
  return supply && distribution
    ? finish(
        {
          kind: 'market-dependency',
          preset: 'supplier-distribution-boundaries',
          ...parsed.story,
          business: parsed.business,
          supplier,
          item,
          channel,
          supply,
          distribution,
        },
        ctx,
      )
    : null;
}
function complementarySpecialists(
  raw: Rec,
  ctx: ParseContext,
): ComplementarySpecialistsScene | null {
  const parsed = marketBase(raw, ['specialists', 'pairs'], ctx),
    entries = array(raw.specialists, 2, 3, ctx),
    pairEntries = array(raw.pairs, 1, 3, ctx);
  if (!parsed || !entries || !pairEntries) return null;
  const specialists: ComplementarySpecialistsScene['specialists'][number][] = [];
  for (const entry of entries) {
    if (
      !isRec(entry) ||
      !onlyFields(entry, ['identity', 'capability'], ctx) ||
      !isRec(entry.capability) ||
      !onlyFields(entry.capability, ['identity', 'state', 'source'], ctx)
    )
      return null;
    const person = identity(entry.identity, ctx),
      capabilityIdentity = identity(entry.capability.identity, ctx);
    if (!person || !capabilityIdentity) return null;
    const capability = relationship(
      { state: entry.capability.state, source: entry.capability.source },
      escaped(person.label),
      'provides',
      'provide',
      `${escaped(capabilityIdentity.label)} for ${escaped(parsed.business.label)}`,
      parsed.story.condition,
      ctx,
    );
    if (!capability) return null;
    specialists.push({
      identity: person,
      capability: { identity: capabilityIdentity, ...capability },
    });
  }
  const pairs: ComplementarySpecialistsScene['pairs'][number][] = [];
  for (const entry of pairEntries) {
    if (
      !isRec(entry) ||
      !onlyFields(
        entry,
        ['leftId', 'rightId', 'leftCapabilityId', 'rightCapabilityId', 'state', 'source'],
        ctx,
      )
    )
      return null;
    const left = specialists.find((s) => s.identity.id === entry.leftId),
      right = specialists.find((s) => s.identity.id === entry.rightId);
    if (
      !left ||
      !right ||
      left === right ||
      left.capability.identity.id !== entry.leftCapabilityId ||
      right.capability.identity.id !== entry.rightCapabilityId
    )
      return mechanismIssue(
        ctx,
        "complementary pair must reference each named specialist and that specialist's own capability",
      );
    const l = escaped(left.identity.label),
      lc = escaped(left.capability.identity.label),
      r = escaped(right.identity.label),
      rc = escaped(right.capability.identity.label),
      b = escaped(parsed.business.label);
    const pair = fact(
      { state: entry.state, source: entry.source },
      {
        'source-stated': `For ${b}, ${l}'s ${lc} complements ${r}'s ${rc}`,
        negative: `For ${b}, ${l}'s ${lc} does not complement ${r}'s ${rc}`,
        conditional: `For ${b}, ${l}'s ${lc} may complement ${r}'s ${rc}`,
        unknown: `Whether ${l}'s ${lc} complements ${r}'s ${rc} for ${b} is unknown`,
      },
      parsed.story.condition,
      ctx,
    );
    if (!pair) return null;
    if (
      pair.state === 'source-stated' &&
      (left.capability.state !== 'source-stated' || right.capability.state !== 'source-stated')
    )
      return mechanismIssue(
        ctx,
        'complementarity requires independently supported capabilities; links alone are not synergy',
      );
    pairs.push({
      leftId: left.identity.id,
      rightId: right.identity.id,
      leftCapabilityId: left.capability.identity.id,
      rightCapabilityId: right.capability.identity.id,
      ...pair,
    });
  }
  if (
    new Set(pairs.map((p) => [p.leftId, p.rightId].sort().join(':'))).size !== pairs.length ||
    specialists.some(
      (s) => !pairs.some((p) => p.leftId === s.identity.id || p.rightId === s.identity.id),
    )
  )
    return mechanismIssue(
      ctx,
      'every specialist must belong to a distinct supported pair, not an unrelated roster',
    );
  return finish(
    {
      kind: 'market-dependency',
      preset: 'complementary-specialists',
      ...parsed.story,
      business: parsed.business,
      specialists,
      pairs,
    },
    ctx,
  );
}

export function parseMarketDependencyScene(
  raw: unknown,
  ctx: ParseContext,
): MarketDependencyScene | null {
  const result = parseMarketDependency(raw, ctx);
  return (
    result ??
    (ctx.issues.length
      ? null
      : mechanismIssue(ctx, 'invalid market recipe fields, array entries or source evidence'))
  );
}
function parseMarketDependency(raw: unknown, ctx: ParseContext): MarketDependencyScene | null {
  if (!boundedBusinessInput(raw, ctx) || !isRec(raw))
    return mechanismIssue(ctx, 'market input must be a bounded JSON object');
  if (raw.kind !== 'market-dependency')
    return mechanismIssue(ctx, 'market dependency requires its concrete kind');
  switch (raw.preset) {
    case 'channel-concentration':
      return channelConcentration(raw, ctx);
    case 'demand-access':
      return demandAccess(raw, ctx);
    case 'migration-constraints':
      return migrationConstraints(raw, ctx);
    case 'participation-matching':
      return participationMatching(raw, ctx);
    case 'stated-participation-benefit':
      return statedBenefit(raw, ctx);
    case 'differentiated-offering':
      return differentiatedOffering(raw, ctx);
    case 'supplier-distribution-boundaries':
      return supplierDistribution(raw, ctx);
    case 'complementary-specialists':
      return complementarySpecialists(raw, ctx);
    default:
      return mechanismIssue(
        ctx,
        'market dependency preset must belong to the authored markets pack',
      );
  }
}

function procurementRoles(
  raw: unknown,
  actors: readonly BusinessIdentity[],
  task: BusinessIdentity,
  item: BusinessIdentity,
  ctx: ParseContext,
): ProcurementCommitmentScene['roles'] | null {
  if (!isRec(raw) || !onlyFields(raw, PROCUREMENT_ROLES, ctx))
    return mechanismIssue(ctx, 'procurement requires four independent role records');
  const result = new Map<ProcurementRole, ProcurementRoleFact>();
  for (const role of PROCUREMENT_ROLES) {
    const entry = raw[role];
    if (!isRec(entry) || !onlyFields(entry, ['actorId', 'source'], ctx))
      return mechanismIssue(ctx, 'each procurement role requires actorId and source');
    const local = clause(entry.source, ctx);
    const actor = actors.find((a) => a.id === entry.actorId);
    if (!local || (!actor && (entry.actorId !== null || role !== 'approver')))
      return mechanismIssue(
        ctx,
        'requester, delegate and payee must be named; only the approver may explicitly remain unknown',
      );
    const target = `${escaped(task.label)} of ${escaped(item.label)}`;
    const pattern = actor
      ? `${escaped(actor.label)} is (?:the )?${role} for ${target}`
      : `Approver for ${target} is (?:unknown|unstated)`;
    if (!matchClause(local.text, pattern) || (actor && !assertedBusinessClaim(local.text)))
      return mechanismIssue(
        ctx,
        'procurement roles must locally bind each actual actor to this task/item; never invent an approver or merge unrelated identities',
      );
    result.set(role, { actorId: actor?.id ?? null, ...local });
  }
  if (actors.some((a) => !Array.from(result.values()).some((r) => r.actorId === a.id)))
    return mechanismIssue(
      ctx,
      'procurement actors may not contain unsupported additional approvers or unused people',
    );
  // Checked four concrete keys, no root-union casts or inferred identity aliases.
  const requester = result.get('requester'),
    delegate = result.get('delegate'),
    approver = result.get('approver'),
    payee = result.get('payee');
  return requester && delegate && approver && payee
    ? { requester, delegate, approver, payee }
    : null;
}
/** Boundary validation only; the shared quantityBasis validates the qualified quantitative body. */
function conditionalMoneyBody(
  raw: unknown,
  full: BusinessWordSpan,
  condition: string | undefined,
  ctx: ParseContext,
): BusinessWordSpan | null {
  if (!condition || !isRec(raw))
    return mechanismIssue(ctx, 'conditional money requires its complete supported condition');
  const conditionWords = condition.split(/\s+/u).length;
  const prefix = { fromWord: full.fromWord, toWord: full.fromWord + conditionWords - 1 };
  const body = { fromWord: prefix.toWord + 1, toWord: full.toWord };
  const source = businessSpan(raw.source, ctx);
  if (
    !source ||
    body.fromWord > body.toWord ||
    !sameSpan(source, body) ||
    !matchClause(businessEvidenceText(prefix, ctx), `${escaped(condition)},`)
  )
    return mechanismIssue(
      ctx,
      'conditional amount/denominator basis must be the complete body after its exact supported prefix condition',
    );
  return body;
}
function procurementValue(
  raw: Rec,
  subject: BusinessIdentity,
  condition: string | undefined,
  ctx: ParseContext,
): { amount: Money | null; basis: QuantityBasis | null; suffix: string } | null {
  if (raw.amount === null) {
    if (raw.basis !== null)
      return mechanismIssue(ctx, 'unknown monetary values require explicit null amount and basis');
    return { amount: null, basis: null, suffix: '(?:unknown|unstated)' };
  }
  const amount = parseMoney(raw.amount, ctx),
    local = clause(raw.source, ctx);
  if (!amount || !local) return null;
  if (raw.state === 'conditional' && !conditionalMoneyBody(raw.basis, local.source, condition, ctx))
    return null;
  const basis = quantityBasis(
    raw.basis,
    [subject],
    ctx,
    raw.state === 'conditional' && condition !== undefined
      ? { state: 'conditional', condition, source: local.source }
      : undefined,
  );
  if (
    !basis ||
    basis.denominator === null ||
    basis.subjectId !== subject.id ||
    basis.unit !== amount.currency ||
    (raw.state !== 'conditional' && !sameSpan(basis.source, local.source))
  )
    return mechanismIssue(
      ctx,
      'money needs exact safe minor units/currency and its own actor-bound population/unit/period/denominator clause',
    );
  return {
    amount,
    basis,
    suffix: `${moneyPattern(amount)} during ${escaped(basis.period)} among ${quantityPattern(basis.denominator, basis.population)}`,
  };
}
function procurementMoney<S extends QuoteState | PaymentState>(
  raw: unknown,
  isPayment: boolean,
  requester: BusinessIdentity,
  payee: BusinessIdentity,
  task: BusinessIdentity,
  item: BusinessIdentity,
  condition: string | undefined,
  ctx: ParseContext,
): ProcurementMoneyFact<S> | null {
  if (!isRec(raw) || !onlyFields(raw, ['identity', 'state', 'amount', 'basis', 'source'], ctx))
    return mechanismIssue(
      ctx,
      'quote/payment facts need their own identity, state and explicit monetary value',
    );
  const id = identity(raw.identity, ctx),
    value = procurementValue(raw, isPayment ? requester : payee, condition, ctx);
  if (!id || !value) return null;
  const r = escaped(requester.label),
    p = escaped(payee.label),
    t = escaped(task.label),
    i = escaped(item.label),
    n = escaped(id.label);
  const valuedStates = isPayment
    ? ['paid', 'pending', 'conditional']
    : ['quoted', 'pending', 'conditional'];
  if (
    (isPayment && raw.state === 'paid' && value.amount === null) ||
    (value.amount !== null && !valuedStates.includes(String(raw.state)))
  )
    return mechanismIssue(
      ctx,
      'paid requires an actual local amount; pending/conditional proposed amounts stay proposed, never settlement',
    );
  const patterns: Partial<Record<QuoteState | PaymentState, string>> = isPayment
    ? {
        paid: `${r} paid ${p} via ${n} for ${t} of ${i} with amount ${value.suffix}`,
        pending: `Payment ${n} by ${r} to ${p} for ${t} of ${i} is pending with amount ${value.suffix}`,
        negative: `${r} did not pay ${p} via ${n} for ${t} of ${i} with amount ${value.suffix}`,
        conditional: `${r} may pay ${p} via ${n} for ${t} of ${i} with amount ${value.suffix}`,
        unknown: `Payment ${n} by ${r} to ${p} for ${t} of ${i} is unknown with amount ${value.suffix}`,
      }
    : {
        quoted: `${p} quoted ${n} for ${t} of ${i} to ${r} with amount ${value.suffix}`,
        pending: `Quote ${n} from ${p} for ${t} of ${i} to ${r} is pending with amount ${value.suffix}`,
        negative: `${p} did not quote ${n} for ${t} of ${i} to ${r} with amount ${value.suffix}`,
        conditional: `${p} may quote ${n} for ${t} of ${i} to ${r} with amount ${value.suffix}`,
        unknown: `Quote ${n} from ${p} for ${t} of ${i} to ${r} is unknown with amount ${value.suffix}`,
      };
  const parsed = fact<S>({ state: raw.state, source: raw.source }, patterns, condition, ctx);
  return parsed ? { identity: id, amount: value.amount, basis: value.basis, ...parsed } : null;
}
export function parseProcurementCommitmentScene(
  raw: unknown,
  ctx: ParseContext,
): ProcurementCommitmentScene | null {
  const result = parseProcurementCommitment(raw, ctx);
  return (
    result ??
    (ctx.issues.length
      ? null
      : mechanismIssue(ctx, 'invalid procurement fields, role entries or source evidence'))
  );
}
function parseProcurementCommitment(
  raw: unknown,
  ctx: ParseContext,
): ProcurementCommitmentScene | null {
  if (!boundedBusinessInput(raw, ctx) || !isRec(raw))
    return mechanismIssue(ctx, 'procurement input must be a bounded JSON object');
  if (raw.kind !== 'procurement-commitment' || raw.preset !== 'request-quote-authorize-pay')
    return mechanismIssue(
      ctx,
      'procurement requires its concrete request-quote-authorize-pay kind/preset',
    );
  const story = base(
    raw,
    ['actors', 'roles', 'task', 'item', 'request', 'quote', 'authority', 'acceptance', 'payment'],
    ctx,
  );
  const actors = identities(raw.actors, 1, 4, ctx),
    task = identity(raw.task, ctx),
    item = identity(raw.item, ctx);
  if (!story || !actors || !task || !item) return null;
  const roles = procurementRoles(raw.roles, actors, task, item, ctx);
  if (!roles) return null;
  const requester = actors.find((a) => a.id === roles.requester.actorId),
    delegate = actors.find((a) => a.id === roles.delegate.actorId),
    payee = actors.find((a) => a.id === roles.payee.actorId),
    approver = actors.find((a) => a.id === roles.approver.actorId);
  if (
    !requester ||
    !delegate ||
    !payee ||
    normalizedPhrase(story.subject) !== normalizedPhrase(requester.label)
  )
    return mechanismIssue(
      ctx,
      "procurement setup subject is this task's actual requester, not an unrelated business",
    );
  const r = escaped(requester.label),
    d = escaped(delegate.label),
    p = escaped(payee.label),
    t = escaped(task.label),
    i = escaped(item.label);
  const requestTarget = `${d} to ${t} ${i} from ${p}`;
  const request = fact(
    raw.request,
    {
      requested: `${r} requested ${requestTarget}`,
      pending: `Request by ${r} to ${requestTarget} is pending`,
      negative: `${r} did not request ${requestTarget}`,
      conditional: `${r} may request ${requestTarget}`,
      unknown: `Request by ${r} to ${requestTarget} is unknown`,
    },
    story.condition,
    ctx,
  );
  const quote = procurementMoney<QuoteState>(
    raw.quote,
    false,
    requester,
    payee,
    task,
    item,
    story.condition,
    ctx,
  );
  const payment = procurementMoney<PaymentState>(
    raw.payment,
    true,
    requester,
    payee,
    task,
    item,
    story.condition,
    ctx,
  );
  const action = `${d} to ${t} ${i} from ${p} for ${r}`;
  const a = approver ? escaped(approver.label) : '';
  const authority = fact(
    raw.authority,
    approver
      ? {
          granted: `${a} authorized ${action}`,
          pending: `Authorization by ${a} of ${action} is pending`,
          denied: `${a} denied authorization for ${action}`,
          conditional: `${a} may authorize ${action}`,
          unknown: `Authorization by ${a} of ${action} is unknown`,
        }
      : {
          pending: `Authorization for ${action} is pending with approver unknown`,
          unknown: `Authorization for ${action} is unknown with approver unknown`,
        },
    story.condition,
    ctx,
  );
  if (!request || !quote || !payment || !authority) return null;
  const q = escaped(quote.identity.label),
    target = `${q} from ${p} for ${t} of ${i}`;
  const acceptance = fact(
    raw.acceptance,
    {
      accepted: `${r} accepted ${target}`,
      pending: `Acceptance by ${r} of ${target} is pending`,
      negative: `${r} did not accept ${target}`,
      conditional: `${r} may accept ${target}`,
      unknown: `Acceptance by ${r} of ${target} is unknown`,
    },
    story.condition,
    ctx,
  );
  return acceptance
    ? finish(
        {
          kind: 'procurement-commitment',
          preset: 'request-quote-authorize-pay',
          ...story,
          actors,
          roles,
          task,
          item,
          request,
          quote,
          authority,
          acceptance,
          payment,
        },
        ctx,
      )
    : null;
}
