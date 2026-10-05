import {
  makeParseContext,
  type ParseContext,
  type PlannerWord,
  type Rec,
  type SceneWindow,
} from '../../../../../ai/explainer/kind-spec';
import type { BusinessIdentity, BusinessRecipeId, BusinessWordSpan, QuantityBasis } from '../types';

export const MARKETS_RECIPE_IDS = [
  'OP-24',
  'OP-41',
  'OP-42',
  'OP-43',
  'OP-44',
  'OP-45',
  'OP-46',
  'OP-47',
  'OP-48',
] as const;
export type MarketsRecipeId = (typeof MARKETS_RECIPE_IDS)[number];
const PRESETS = {
  'OP-24': 'channel-concentration',
  'OP-41': 'demand-access',
  'OP-42': 'migration-constraints',
  'OP-43': 'participation-matching',
  'OP-44': 'stated-participation-benefit',
  'OP-45': 'differentiated-offering',
  'OP-46': 'supplier-distribution-boundaries',
  'OP-47': 'request-quote-authorize-pay',
  'OP-48': 'complementary-specialists',
} as const;
export interface MarketsSourceFixture {
  id: BusinessRecipeId;
  fixtureId: string;
  raw: Rec;
  words: PlannerWord[];
}
export interface MarketsFixtureSource {
  span: (clause: string) => BusinessWordSpan;
  identity: (id: string, label: string, clause: string) => BusinessIdentity;
  fact: (state: string, clause: string) => Rec;
  basis: (
    subjectId: string,
    unit: string,
    population: string,
    period: string,
    denominator: number,
    clause: string,
  ) => QuantityBasis;
}
/** Five authored source blocks inside the production 0.25s lead-in / 0.35s tail. */
export function makeMarketsSourceFixture(
  id: MarketsRecipeId,
  paragraphs: readonly [string, string, string, string, string],
  build: (source: MarketsFixtureSource) => Rec,
  options: { subject?: string; condition?: string; fixtureId?: string } = {},
): MarketsSourceFixture {
  const starts = [0.25, 1.1, 2.3, 7.8, 10];
  const ends = [0.95, 2.1, 7.5, 9.4, 11.35];
  const beats: number[] = [];
  const words: PlannerWord[] = [];
  paragraphs.forEach((paragraph, phase) => {
    beats.push(words.length);
    const tokens = paragraph.split(/\s+/u);
    const step = (ends[phase] - starts[phase]) / tokens.length;
    tokens.forEach((text, index) => {
      const start = starts[phase] + index * step;
      words.push({ text, start, end: starts[phase] + (index + 1) * step });
    });
  });
  function span(text: string): BusinessWordSpan {
    const tokens = text.split(/\s+/u);
    const fromWord = words.findIndex((_, from) =>
      tokens.every((token, offset) => words[from + offset]?.text === token),
    );
    if (fromWord < 0) throw new Error(`${id}: missing authored clause ${text}`);
    return { fromWord, toWord: fromWord + tokens.length - 1 };
  }
  const source: MarketsFixtureSource = {
    span,
    identity: (identityId, label, text) => ({ id: identityId, label, source: span(text) }),
    fact: (state, text) => ({ state, source: span(text) }),
    basis: (subjectId, unit, population, period, denominator, text) => ({
      subjectId,
      unit,
      population,
      period,
      denominator,
      source: span(text),
    }),
  };
  const subject =
    options.subject ??
    (['OP-43', 'OP-44', 'OP-48'].includes(id) ? 'Harbor' : id === 'OP-47' ? 'Mira' : 'Lumen');
  const outcome = paragraphs[4].replace(/\.$/u, '');
  return {
    id,
    fixtureId: options.fixtureId ?? `${id}:primary`,
    words,
    raw: {
      kind: id === 'OP-47' ? 'procurement-commitment' : 'market-dependency',
      preset: PRESETS[id],
      visualMode: 'diagram',
      label: subject,
      subject,
      outcome,
      evidence: 'source-stated',
      ...(options.condition ? { condition: options.condition } : {}),
      startWord: 0,
      endWord: words.length - 1,
      layout: 'stack',
      setupWord: beats[0],
      actionWord: beats[1],
      responseWord: beats[2],
      checkWord: beats[3],
      resolveWord: beats[4],
      factEvidence: { state: 'source-stated', label: outcome, source: span(paragraphs[4]) },
      ...build(source),
    },
  };
}
/** Same unclamped source-window arithmetic as the production planner, not synthetic ctx.at. */
export function marketsSourceWindow(fixture: {
  raw: Rec;
  words: readonly PlannerWord[];
}): SceneWindow {
  const startWord = Number(fixture.raw.startWord),
    endWord = Number(fixture.raw.endWord);
  return {
    startWord,
    endWord,
    startTime: fixture.words[startWord].start - 0.25,
    endTime: fixture.words[endWord].end + 0.35,
  };
}
export function marketsSourceContext(fixture: {
  raw: Rec;
  words: readonly PlannerWord[];
}): ParseContext {
  return makeParseContext(fixture.words, marketsSourceWindow(fixture));
}

export function channelSourceFixture(unknownSecond = false): MarketsSourceFixture {
  const intro = 'Lumen reviews its distribution channels.';
  const portal = 'Lumen relies on Portal to reach Local.';
  const direct = 'Lumen relies on Direct to reach Remote.';
  const local =
    'Lumen distributes 6 referrals through Portal to Local during June among 10 prospects.';
  const remote = unknownSecond
    ? 'Lumen distribution volume through Direct to Remote is unknown.'
    : 'Lumen distributes 4 referrals through Direct to Remote during June among 10 prospects.';
  return makeMarketsSourceFixture(
    'OP-24',
    [
      intro,
      `${portal} ${direct}`,
      `${local} ${remote}`,
      'Channel and customer groups stay distinct.',
      'Dependency is not permanent dominance.',
    ],
    (s) => ({
      business: s.identity('lumen', 'Lumen', intro),
      customerGroups: [
        s.identity('local', 'Local', portal),
        s.identity('remote', 'Remote', direct),
      ],
      channels: [
        {
          identity: s.identity('portal', 'Portal', portal),
          customerGroupId: 'local',
          dependency: s.fact('source-stated', portal),
          volume: {
            ...s.fact('source-stated', local),
            count: 6,
            basis: s.basis('lumen', 'referrals', 'prospects', 'June', 10, local),
          },
        },
        {
          identity: s.identity('direct', 'Direct', direct),
          customerGroupId: 'remote',
          dependency: s.fact('source-stated', direct),
          volume: unknownSecond
            ? { ...s.fact('unknown', remote), count: null, basis: null }
            : {
                ...s.fact('source-stated', remote),
                count: 4,
                basis: s.basis('lumen', 'referrals', 'prospects', 'June', 10, remote),
              },
        },
      ],
    }),
    { fixtureId: `OP-24:${unknownSecond ? 'unknown-volume' : 'primary'}` },
  );
}
export function demandSourceFixture(
  state: 'negative' | 'conditional' | 'source-stated' = 'negative',
): MarketsSourceFixture {
  const intro = 'Lumen reviews demand and production.';
  const demand = 'Buyers demand Repair from Lumen.';
  const condition = state === 'conditional' ? 'If tools arrive' : undefined;
  const production =
    state === 'conditional'
      ? 'If tools arrive, Lumen may produce Repair.'
      : state === 'negative'
        ? 'Lumen does not produce Repair.'
        : 'Lumen produces Repair.';
  const access = 'Whether Lumen accesses Buyers through Portal for Repair is unknown.';
  return makeMarketsSourceFixture(
    'OP-41',
    [
      intro,
      demand,
      `${production} ${access}`,
      'Access is not measured conversion.',
      'Views remain distinct.',
    ],
    (s) => ({
      business: s.identity('lumen', 'Lumen', intro),
      offering: s.identity('repair', 'Repair', demand),
      demand: s.identity('buyers', 'Buyers', demand),
      channel: s.identity('portal', 'Portal', access),
      production: s.fact(state, production),
      demandFact: s.fact('source-stated', demand),
      access: s.fact('unknown', access),
    }),
    { condition, fixtureId: `OP-41:${state}` },
  );
}
export function migrationSourceFixture(completed = false): MarketsSourceFixture {
  const intro = 'Lumen reviews a provider migration.';
  const migration = completed
    ? 'Lumen completed migration Move from Old to New.'
    : 'Lumen migration Move from Old to New remains pending.';
  const constraint = completed
    ? 'Lumen satisfied Export for migration Move from Old to New.'
    : 'Lumen migration Move from Old to New requires Export and Export remains unmet.';
  return makeMarketsSourceFixture(
    'OP-42',
    [
      intro,
      migration,
      constraint,
      'Each constraint needs actual resolution.',
      'Migration keeps its stated status.',
    ],
    (s) => ({
      business: s.identity('lumen', 'Lumen', intro),
      fromProvider: s.identity('old', 'Old', migration),
      toProvider: s.identity('new', 'New', migration),
      migration: {
        identity: s.identity('move', 'Move', migration),
        ...s.fact(completed ? 'completed' : 'pending', migration),
      },
      constraints: [
        {
          identity: s.identity('export', 'Export', constraint),
          ...s.fact(completed ? 'satisfied' : 'unmet', constraint),
        },
      ],
    }),
    { fixtureId: `OP-42:${completed ? 'completed' : 'pending'}` },
  );
}
export function matchingSourceFixture(matched = false): MarketsSourceFixture {
  const intro = 'Harbor reviews both market sides.';
  const buyer = 'Iris is a buyer on Harbor.',
    seller = 'Theo is a seller on Harbor.';
  const iris = 'Iris participates on Harbor.',
    theo = 'Theo participates on Harbor.';
  const match = matched
    ? 'Harbor matched Iris with Theo.'
    : 'Harbor match of Iris with Theo is pending.';
  const accept = matched
    ? 'Iris accepted match with Theo on Harbor.'
    : 'Acceptance by Iris of match with Theo on Harbor is pending.';
  return makeMarketsSourceFixture(
    'OP-43',
    [
      intro,
      `${buyer} ${seller}`,
      `${iris} ${theo} ${match}`,
      accept,
      'Matching is not a paid purchase.',
    ],
    (s) => ({
      business: s.identity('harbor', 'Harbor', intro),
      participants: [
        {
          identity: s.identity('iris', 'Iris', buyer),
          side: 'buyer',
          role: s.fact('source-stated', buyer),
        },
        {
          identity: s.identity('theo', 'Theo', seller),
          side: 'seller',
          role: s.fact('source-stated', seller),
        },
      ],
      participations: [
        { participantId: 'iris', ...s.fact('participating', iris) },
        { participantId: 'theo', ...s.fact('participating', theo) },
      ],
      matches: [
        {
          leftId: 'iris',
          rightId: 'theo',
          ...s.fact(matched ? 'matched' : 'pending', match),
          acceptance: s.fact(matched ? 'accepted' : 'pending', accept),
        },
      ],
    }),
    { fixtureId: `OP-43:${matched ? 'matched' : 'pending'}` },
  );
}
export function benefitSourceFixture(): MarketsSourceFixture {
  const intro = 'Harbor reviews participation.';
  const iris = 'Iris participates on Harbor.',
    theo = 'Theo participates on Harbor.';
  const benefit =
    'If both attend, Harbor states participation by Iris and Theo may provide Shared feedback.';
  return makeMarketsSourceFixture(
    'OP-44',
    [
      intro,
      `${iris} ${theo}`,
      benefit,
      'Connections alone do not prove benefit.',
      'Benefit remains conditional.',
    ],
    (s) => ({
      business: s.identity('harbor', 'Harbor', intro),
      participants: [s.identity('iris', 'Iris', iris), s.identity('theo', 'Theo', theo)],
      participations: [
        { participantId: 'iris', ...s.fact('participating', iris) },
        { participantId: 'theo', ...s.fact('participating', theo) },
      ],
      benefit: { label: 'Shared feedback', ...s.fact('conditional', benefit) },
    }),
    { condition: 'If both attend' },
  );
}
export function offeringSourceFixture(): MarketsSourceFixture {
  const intro = 'Lumen reviews service alternatives.';
  const baseline = 'For Lumen, Repair and Tune share Service with basic support.';
  const repair = 'Lumen offers Repair for Service on basic support with Weekend hours.';
  const tune = 'Lumen offers Tune for Service on basic support with Remote checks.';
  return makeMarketsSourceFixture(
    'OP-45',
    [
      intro,
      baseline,
      `${repair} ${tune}`,
      'Attributes are separately stated.',
      'Alternatives have no stated winner.',
    ],
    (s) => ({
      business: s.identity('lumen', 'Lumen', intro),
      comparisonSubject: s.identity('service', 'Service', baseline),
      baseline: { label: 'basic support', source: s.span(baseline) },
      offerings: [
        {
          identity: s.identity('repair', 'Repair', repair),
          differentiation: { label: 'Weekend hours', ...s.fact('source-stated', repair) },
        },
        {
          identity: s.identity('tune', 'Tune', tune),
          differentiation: { label: 'Remote checks', ...s.fact('source-stated', tune) },
        },
      ],
    }),
  );
}
export function supplierSourceFixture(conditional = false): MarketsSourceFixture {
  const intro = 'Lumen separates suppliers and distribution.';
  const supply = 'Forge supplies Kit to Lumen.';
  const distribution = conditional
    ? 'If licensing clears, Lumen may distribute Kit through Portal.'
    : 'Lumen does not distribute Kit through Portal.';
  return makeMarketsSourceFixture(
    'OP-46',
    [
      intro,
      supply,
      distribution,
      'A supplier is not a distribution channel.',
      'Views remain distinct.',
    ],
    (s) => ({
      business: s.identity('lumen', 'Lumen', intro),
      supplier: s.identity('forge', 'Forge', supply),
      item: s.identity('kit', 'Kit', supply),
      channel: s.identity('portal', 'Portal', distribution),
      supply: s.fact('source-stated', supply),
      distribution: s.fact(conditional ? 'conditional' : 'negative', distribution),
    }),
    {
      condition: conditional ? 'If licensing clears' : undefined,
      fixtureId: `OP-46:${conditional ? 'conditional' : 'negative'}`,
    },
  );
}
export function specialistsSourceFixture(negative = false): MarketsSourceFixture {
  const intro = 'Harbor reviews specialist capabilities.';
  const design = 'Iris provides Design for Harbor.',
    build = 'Theo provides Build for Harbor.';
  const pair = negative
    ? "For Harbor, Iris's Design does not complement Theo's Build."
    : "For Harbor, Iris's Design complements Theo's Build.";
  return makeMarketsSourceFixture(
    'OP-48',
    [
      intro,
      `${design} ${build}`,
      pair,
      'A link alone is not synergy.',
      'Capabilities keep named relationships.',
    ],
    (s) => ({
      business: s.identity('harbor', 'Harbor', intro),
      specialists: [
        {
          identity: s.identity('iris', 'Iris', design),
          capability: {
            identity: s.identity('design', 'Design', design),
            ...s.fact('source-stated', design),
          },
        },
        {
          identity: s.identity('theo', 'Theo', build),
          capability: {
            identity: s.identity('build', 'Build', build),
            ...s.fact('source-stated', build),
          },
        },
      ],
      pairs: [
        {
          leftId: 'iris',
          rightId: 'theo',
          leftCapabilityId: 'design',
          rightCapabilityId: 'build',
          ...s.fact(negative ? 'negative' : 'source-stated', pair),
        },
      ],
    }),
    { fixtureId: `OP-48:${negative ? 'negative' : 'primary'}` },
  );
}
export type ProcurementFixtureCase =
  | 'pending'
  | 'paid'
  | 'paid-pending-authority'
  | 'unknown-approver'
  | 'unpaid'
  | 'shared-requester-delegate'
  | 'pending-amount'
  | 'conditional-quote'
  | 'conditional-payment';
export function procurementSourceFixture(
  variant: ProcurementFixtureCase = 'pending',
): MarketsSourceFixture {
  const intro = 'Mira reviews the procurement facts.';
  const delegateName = variant === 'shared-requester-delegate' ? 'Mira' : 'Dex';
  const unknownApprover = variant === 'unknown-approver';
  const isPaid = variant === 'paid' || variant === 'paid-pending-authority';
  const granted = variant === 'paid';
  const accepted = isPaid || unknownApprover || variant === 'conditional-quote';
  const condition = ['conditional-quote', 'conditional-payment'].includes(variant)
    ? 'If purchasing clears'
    : undefined;
  const valuedPayment = isPaid || variant === 'pending-amount' || variant === 'conditional-payment';
  const requesterRole = 'Mira is requester for Acquire of Kit.';
  const delegateRole = `${delegateName} is delegate for Acquire of Kit.`;
  const approverRole = unknownApprover
    ? 'Approver for Acquire of Kit is unknown.'
    : 'Fran is approver for Acquire of Kit.';
  const payeeRole = 'Pike is payee for Acquire of Kit.';
  const request = `Mira requested ${delegateName} to Acquire Kit from Pike.`;
  const quote =
    variant === 'conditional-quote'
      ? 'If purchasing clears, Pike may quote Estimate for Acquire of Kit to Mira with amount 12 USD during June among 1 kits.'
      : 'Pike quoted Estimate for Acquire of Kit to Mira with amount 12 USD during June among 1 kits.';
  const authority = granted
    ? `Fran authorized ${delegateName} to Acquire Kit from Pike for Mira.`
    : unknownApprover
      ? `Authorization for ${delegateName} to Acquire Kit from Pike for Mira is pending with approver unknown.`
      : `Authorization by Fran of ${delegateName} to Acquire Kit from Pike for Mira is pending.`;
  const acceptance = accepted
    ? 'Mira accepted Estimate from Pike for Acquire of Kit.'
    : 'Acceptance by Mira of Estimate from Pike for Acquire of Kit is pending.';
  const payment = isPaid
    ? 'Mira paid Pike via Transfer for Acquire of Kit with amount 12 USD during June among 1 kits.'
    : variant === 'conditional-payment'
      ? 'If purchasing clears, Mira may pay Pike via Transfer for Acquire of Kit with amount 12 USD during June among 1 kits.'
      : variant === 'pending-amount'
        ? 'Payment Transfer by Mira to Pike for Acquire of Kit is pending with amount 12 USD during June among 1 kits.'
        : variant === 'unpaid'
          ? 'Mira did not pay Pike via Transfer for Acquire of Kit with amount unknown.'
          : 'Payment Transfer by Mira to Pike for Acquire of Kit is pending with amount unknown.';
  return makeMarketsSourceFixture(
    'OP-47',
    [
      `${intro} ${requesterRole}`,
      `${request} ${delegateRole}`,
      `${approverRole} ${payeeRole} ${quote}`,
      `${authority} ${acceptance} ${payment}`,
      'Each action keeps its own status.',
    ],
    (s) => ({
      actors: [
        s.identity('mira', 'Mira', requesterRole),
        ...(delegateName === 'Dex' ? [s.identity('dex', 'Dex', delegateRole)] : []),
        ...(!unknownApprover ? [s.identity('fran', 'Fran', approverRole)] : []),
        s.identity('pike', 'Pike', payeeRole),
      ],
      roles: {
        requester: { actorId: 'mira', source: s.span(requesterRole) },
        delegate: {
          actorId: delegateName === 'Mira' ? 'mira' : 'dex',
          source: s.span(delegateRole),
        },
        approver: { actorId: unknownApprover ? null : 'fran', source: s.span(approverRole) },
        payee: { actorId: 'pike', source: s.span(payeeRole) },
      },
      task: s.identity('acquire', 'Acquire', requesterRole),
      item: s.identity('kit', 'Kit', requesterRole),
      request: s.fact('requested', request),
      quote: {
        identity: s.identity('estimate', 'Estimate', quote),
        ...s.fact(variant === 'conditional-quote' ? 'conditional' : 'quoted', quote),
        amount: { minorUnits: 1200, currency: 'USD' },
        basis: s.basis(
          'pike',
          'USD',
          'kits',
          'June',
          1,
          variant === 'conditional-quote' ? quote.slice('If purchasing clears, '.length) : quote,
        ),
      },
      authority: s.fact(granted ? 'granted' : 'pending', authority),
      acceptance: s.fact(accepted ? 'accepted' : 'pending', acceptance),
      payment: {
        identity: s.identity('transfer', 'Transfer', payment),
        ...s.fact(
          isPaid
            ? 'paid'
            : variant === 'conditional-payment'
              ? 'conditional'
              : variant === 'unpaid'
                ? 'negative'
                : 'pending',
          payment,
        ),
        amount: valuedPayment ? { minorUnits: 1200, currency: 'USD' } : null,
        basis: valuedPayment
          ? s.basis(
              'mira',
              'USD',
              'kits',
              'June',
              1,
              variant === 'conditional-payment'
                ? payment.slice('If purchasing clears, '.length)
                : payment,
            )
          : null,
      },
    }),
    { fixtureId: `OP-47:${variant}`, condition },
  );
}
/** One primary raw fixture per recipe. Catalog integration expands modes, never duplicate IDs. */
export const MARKETS_SOURCE_FIXTURES: readonly MarketsSourceFixture[] = [
  channelSourceFixture(),
  demandSourceFixture(),
  migrationSourceFixture(),
  matchingSourceFixture(),
  benefitSourceFixture(),
  offeringSourceFixture(),
  supplierSourceFixture(),
  procurementSourceFixture(),
  specialistsSourceFixture(),
];
export const MARKETS_ADDITIONAL_SOURCE_FIXTURES: readonly MarketsSourceFixture[] = [
  channelSourceFixture(true),
  demandSourceFixture('conditional'),
  demandSourceFixture('source-stated'),
  migrationSourceFixture(true),
  matchingSourceFixture(true),
  supplierSourceFixture(true),
  specialistsSourceFixture(true),
  procurementSourceFixture('paid'),
  procurementSourceFixture('paid-pending-authority'),
  procurementSourceFixture('unknown-approver'),
  procurementSourceFixture('unpaid'),
  procurementSourceFixture('shared-requester-delegate'),
  procurementSourceFixture('pending-amount'),
  procurementSourceFixture('conditional-quote'),
  procurementSourceFixture('conditional-payment'),
];

export interface MarketsSourceNegative {
  recipeId: BusinessRecipeId;
  name: string;
  fixture: { raw: Rec; words: PlannerWord[] };
}
function record(value: unknown): Rec {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Fixture record expected');
  return value as Rec;
}
function entries(value: unknown): Rec[] {
  if (!Array.isArray(value)) throw new Error('Fixture entries expected');
  return value.map(record);
}
function negative(
  fixture: MarketsSourceFixture,
  name: string,
  mutate: (raw: Rec) => void,
): MarketsSourceNegative {
  const raw = structuredClone(fixture.raw);
  mutate(raw);
  return { recipeId: fixture.id, name, fixture: { raw, words: structuredClone(fixture.words) } };
}
const [
  channels,
  demand,
  migration,
  matching,
  benefit,
  offerings,
  supplier,
  procurement,
  specialists,
] = MARKETS_SOURCE_FIXTURES;
export const MARKETS_SOURCE_NEGATIVES: readonly MarketsSourceNegative[] = [
  negative(channels, 'channel-customer-group-swap', (r) => {
    entries(r.channels)[0].customerGroupId = 'remote';
  }),
  negative(channels, 'channel-volume-source-swap', (r) => {
    const c = entries(r.channels);
    record(c[0].volume).source = record(c[1].volume).source;
  }),
  negative(channelSourceFixture(true), 'unknown-channel-volume-is-not-zero', (r) => {
    record(entries(r.channels)[1].volume).count = 0;
  }),
  negative(demand, 'negative-production-is-not-produced', (r) => {
    record(r.production).state = 'source-stated';
  }),
  negative(demandSourceFixture('conditional'), 'conditional-production-is-not-actual', (r) => {
    record(r.production).state = 'source-stated';
  }),
  negative(demand, 'distribution-access-is-not-demand', (r) => {
    record(r.access).source = record(r.demandFact).source;
  }),
  negative(migration, 'pending-migration-is-not-completed', (r) => {
    record(r.migration).state = 'completed';
  }),
  negative(migration, 'unmet-constraint-is-not-resolved', (r) => {
    entries(r.constraints)[0].state = 'satisfied';
  }),
  negative(migration, 'migration-provider-endpoint-swap', (r) => {
    [r.fromProvider, r.toProvider] = [r.toProvider, r.fromProvider];
  }),
  negative(matching, 'buyer-seller-role-swap', (r) => {
    const p = entries(r.participants);
    p[0].side = 'seller';
    p[1].side = 'buyer';
  }),
  negative(matching, 'participation-is-not-matching', (r) => {
    const m = entries(r.matches)[0];
    m.state = 'matched';
    m.source = entries(r.participations)[0].source;
  }),
  negative(matching, 'pending-acceptance-is-not-accepted', (r) => {
    record(entries(r.matches)[0].acceptance).state = 'accepted';
  }),
  negative(benefit, 'participation-benefit-hybrid-forbidden', (r) => {
    r.visualMode = 'hybrid';
  }),
  negative(benefit, 'participation-alone-is-not-benefit', (r) => {
    record(r.benefit).source = entries(r.participations)[0].source;
  }),
  negative(benefit, 'conditional-benefit-condition-omitted', (r) => {
    delete r.condition;
  }),
  negative(offerings, 'unrelated-offerings-have-no-shared-baseline', (r) => {
    record(r.baseline).source = record(entries(r.offerings)[0].differentiation).source;
  }),
  negative(offerings, 'offering-differentiation-source-swap', (r) => {
    const o = entries(r.offerings);
    record(o[0].differentiation).source = record(o[1].differentiation).source;
  }),
  negative(supplier, 'supplier-is-not-distribution-channel', (r) => {
    [r.supplier, r.channel] = [r.channel, r.supplier];
  }),
  negative(supplier, 'negative-distribution-is-not-access', (r) => {
    record(r.distribution).state = 'source-stated';
  }),
  negative(supplierSourceFixture(true), 'conditional-distribution-is-not-actual', (r) => {
    record(r.distribution).state = 'source-stated';
  }),
  negative(procurement, 'pending-authority-is-not-granted', (r) => {
    record(r.authority).state = 'granted';
  }),
  negative(procurementSourceFixture('pending-amount'), 'proposed-payment-is-not-paid', (r) => {
    record(r.payment).state = 'paid';
  }),
  negative(
    procurementSourceFixture('conditional-quote'),
    'conditional-quote-is-not-quoted',
    (r) => {
      record(r.quote).state = 'quoted';
    },
  ),
  negative(
    procurementSourceFixture('conditional-payment'),
    'conditional-payment-is-not-paid',
    (r) => {
      record(r.payment).state = 'paid';
    },
  ),
  negative(procurement, 'quote-is-not-payment', (r) => {
    const pay = record(r.payment),
      quote = record(r.quote);
    pay.state = 'paid';
    pay.amount = quote.amount;
    pay.basis = quote.basis;
    pay.source = quote.source;
  }),
  negative(procurement, 'pending-acceptance-is-not-agreement', (r) => {
    record(r.acceptance).state = 'accepted';
  }),
  negative(procurement, 'procurement-requester-payee-role-swap', (r) => {
    const roles = record(r.roles);
    [roles.requester, roles.payee] = [roles.payee, roles.requester];
  }),
  negative(procurementSourceFixture('paid'), 'paid-fact-has-wrong-currency', (r) => {
    record(record(r.payment).amount).currency = 'EUR';
  }),
  negative(procurementSourceFixture('unpaid'), 'unpaid-source-is-not-paid', (r) => {
    const pay = record(r.payment);
    pay.state = 'paid';
    pay.amount = { minorUnits: 1200, currency: 'USD' };
    pay.basis = record(r.quote).basis;
  }),
  negative(
    procurementSourceFixture('unknown-approver'),
    'unknown-approver-is-not-requester',
    (r) => {
      record(record(r.roles).approver).actorId = 'mira';
    },
  ),
  negative(specialists, 'complementary-capability-owner-swap', (r) => {
    const p = entries(r.pairs)[0];
    [p.leftCapabilityId, p.rightCapabilityId] = [p.rightCapabilityId, p.leftCapabilityId];
  }),
  negative(specialists, 'specialist-capability-is-not-complementarity', (r) => {
    entries(r.pairs)[0].source = record(entries(r.specialists)[0].capability).source;
  }),
  negative(specialistsSourceFixture(true), 'negated-complementarity-is-not-synergy', (r) => {
    entries(r.pairs)[0].state = 'source-stated';
  }),
];
