import {
  BUSINESS_EXPLANATION_KINDS,
  isBusinessExplanationRecipe,
  isBusinessExplanationSourceEnvelope,
} from '../../../shared/business-explanation-source';
import { compactBusinessSourceChoices } from '../../../shared/business-source-choices';
import type { StoryboardSourceSpec } from '../../../shared/storyboards';
import type { WordTimestamp } from '../../../shared/types';
import { sharedDependencyFixture } from '../../remotion/compositions/explainer/business/capital/dependency-fixtures';
import {
  capitalClaimAssetFixture,
  capitalRightsFixture,
} from '../../remotion/compositions/explainer/business/capital/fixtures';
import { businessAlternativeFixture } from '../../remotion/compositions/explainer/business/decisions/alternative-fixtures';
import { createFundsFixture } from '../../remotion/compositions/explainer/business/funds/fixtures';
import type {
  BusinessIdentity,
  BusinessRecipeId,
  BusinessWordSpan,
} from '../../remotion/compositions/explainer/business/types';
import { isRec, makeParseContext, type Rec } from '../explainer/kind-spec';
import { getKindSpec } from '../explainer/kinds';
import { parseBusinessExplanationSource } from './business-adapters';

export interface BusinessSequenceFixture {
  readonly id: `S-0${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
  readonly words: WordTimestamp[];
  readonly duration: number;
  readonly spec: StoryboardSourceSpec;
  readonly intent: string;
  readonly expectedFacts: readonly string[];
}
interface NativeSource {
  id: BusinessRecipeId;
  raw: Rec;
  words: WordTimestamp[];
}
interface SpeechSource {
  span(text: string): BusinessWordSpan;
  identity(id: string, label: string, text: string): BusinessIdentity;
}

/** Author speech first; every payload clause must be found literally in this speech. */
function speech(
  id: BusinessRecipeId,
  kind: string,
  preset: string,
  subject: string,
  phases: readonly [string, string, string, string, string],
  build: (s: SpeechSource) => Rec,
): NativeSource {
  const words: WordTimestamp[] = [];
  const beats: number[] = [];
  phases.forEach((phase, index) => {
    beats.push(words.length);
    const tokens = phase.split(/\s+/u);
    tokens.forEach((text, slot) => {
      const start = 0.5 + index * 2.2 + (slot * 1.5) / tokens.length;
      words.push({ text, start, end: start + 1.2 / tokens.length });
    });
  });
  const span = (text: string): BusinessWordSpan => {
    const tokens = text.split(/\s+/u);
    const fromWord = words.findIndex((_, from) =>
      tokens.every((token, offset) => words[from + offset]?.text === token),
    );
    if (fromWord < 0) throw Error(`${id}: missing source clause ${text}`);
    return { fromWord, toWord: fromWord + tokens.length - 1 };
  };
  const outcome = phases[4].replace(/\.$/u, '');
  return {
    id,
    words,
    raw: JSON.parse(
      JSON.stringify({
        kind,
        preset,
        visualMode: 'diagram',
        label: subject,
        subject,
        outcome,
        evidence: 'source-stated',
        layout: 'stack',
        startWord: 0,
        endWord: words.length - 1,
        setupWord: beats[0],
        actionWord: beats[1],
        responseWord: beats[2],
        checkWord: beats[3],
        resolveWord: beats[4],
        factEvidence: {
          state: kind === 'authority-handoff' ? 'illustrative' : 'source-stated',
          label: kind === 'authority-handoff' ? 'Illustrative review' : outcome,
          source: span(kind === 'authority-handoff' ? phases[0] : phases[4]),
        },
        ...(kind === 'authority-handoff' ? { evidence: 'illustrative' } : {}),
        ...build({
          span,
          identity: (identityId, label, text) => ({ id: identityId, label, source: span(text) }),
        }),
      }),
    ),
  };
}

function insideOut(): NativeSource[] {
  const offer = 'Harbor offers Repair.';
  const inspect = 'Harbor handles Inspect for Repair.';
  const dispatch = 'Harbor handles Dispatch for Repair.';
  const cutaway = speech(
    'OP-17',
    'business-blueprint',
    'back-office',
    'Harbor',
    [
      `Harbor has a back office. ${offer}`,
      inspect,
      dispatch,
      'Inspect and Dispatch support the same Repair service.',
      'Support tasks remain distinct.',
    ],
    (s) => ({
      business: s.identity('harbor', 'Harbor', offer),
      service: s.identity('repair', 'Repair', offer),
      tasks: [
        ['inspect', 'Inspect', inspect],
        ['dispatch', 'Dispatch', dispatch],
      ].map(([id, label, text]) => ({
        task: s.identity(id, label, text),
        state: 'source-stated',
        source: s.span(text),
      })),
    }),
  );
  const people = 'Mira works. Fran works. Owen works.';
  const inspectRoles =
    'Mira performs Inspect. Fran approves Inspect. Owen remains accountable for Inspect.';
  const dispatchRoles =
    'Mira performs Dispatch. Fran approves Dispatch. Owen remains accountable for Dispatch.';
  const tasks = speech(
    'OP-04',
    'task-map',
    'responsibility',
    'Mira',
    [
      `Harbor is a business. Mira works at Harbor. Inspect is a task. Dispatch is a task. ${people}`,
      'Inspect and Dispatch support Harbor Repair.',
      inspectRoles,
      dispatchRoles,
      'Roles remain separate.',
    ],
    (s) => ({
      actors: ['Mira', 'Fran', 'Owen'].map((label) =>
        s.identity(label.toLowerCase(), label, `${label} works.`),
      ),
      tasks: ['Inspect', 'Dispatch'].map((label) =>
        s.identity(label.toLowerCase(), label, `${label} is a task.`),
      ),
      ownership: [inspectRoles, dispatchRoles].map((text, index) => ({
        taskId: index ? 'dispatch' : 'inspect',
        performerId: 'mira',
        approverId: 'fran',
        accountableOwnerId: 'owen',
        source: s.span(text),
      })),
      holds: [],
    }),
  );
  return [cutaway, tasks];
}

function transaction(): NativeSource[] {
  const intro = 'Mira is requester for Acquire of Kit.';
  const delegate = 'Dex is delegate for Acquire of Kit.';
  const approver = 'Fran is approver for Acquire of Kit.';
  const payee = 'Pike is payee for Acquire of Kit.';
  const request = 'Mira requested Dex to Acquire Kit from Pike.';
  const quote =
    'Pike quoted Estimate for Acquire of Kit to Mira with amount 12 USD during June among 1 kits.';
  const authority = 'Fran authorized Dex to Acquire Kit from Pike for Mira.';
  const acceptance = 'Mira accepted Estimate from Pike for Acquire of Kit.';
  const payment =
    'Payment Transfer by Mira to Pike for Acquire of Kit is pending with amount 12 USD during June among 1 kits.';
  const procurement = speech(
    'OP-47',
    'procurement-commitment',
    'request-quote-authorize-pay',
    'Mira',
    [
      intro,
      `${request} ${delegate}`,
      `${approver} ${payee} ${quote}`,
      `${authority} ${acceptance} ${payment}`,
      'Each action keeps its own status.',
    ],
    (s) => {
      const basis = (subjectId: string, text: string) => ({
        subjectId,
        population: 'kits',
        unit: 'USD',
        period: 'June',
        denominator: 1,
        source: s.span(text),
      });
      const fact = (state: string, text: string) => ({ state, source: s.span(text) });
      return {
        actors: [
          ['mira', 'Mira', intro],
          ['dex', 'Dex', delegate],
          ['fran', 'Fran', approver],
          ['pike', 'Pike', payee],
        ].map(([id, label, text]) => s.identity(id, label, text)),
        roles: {
          requester: { actorId: 'mira', source: s.span(intro) },
          delegate: { actorId: 'dex', source: s.span(delegate) },
          approver: { actorId: 'fran', source: s.span(approver) },
          payee: { actorId: 'pike', source: s.span(payee) },
        },
        task: s.identity('acquire', 'Acquire', intro),
        item: s.identity('kit', 'Kit', intro),
        request: fact('requested', request),
        quote: {
          identity: s.identity('estimate', 'Estimate', quote),
          ...fact('quoted', quote),
          amount: { minorUnits: 1200, currency: 'USD' },
          basis: basis('pike', quote),
        },
        authority: fact('granted', authority),
        acceptance: fact('accepted', acceptance),
        payment: {
          identity: s.identity('transfer', 'Transfer', payment),
          ...fact('pending', payment),
          amount: { minorUnits: 1200, currency: 'USD' },
          basis: basis('mira', payment),
        },
      };
    },
  );
  const cost = 'Mira records Review cost 2 USD for Acquire during June per 1 kits.';
  const total = 'Mira records total cost 2 USD for Acquire during June per 1 kits.';
  const count = 'Mira records resolved output 1 tasks for Acquire during June per 1 kits.';
  const per = 'Mira records per resolved task cost 2 USD for Acquire during June per 1 kits.';
  const economics = speech(
    'OP-33',
    'operating-cost',
    'per-outcome',
    'Mira',
    [
      'Mira is a business. Acquire is a task. Review is a cost component.',
      'Mira opens the records.',
      `${cost} ${total} ${count} ${per}`,
      'The same June kit denominator applies to these costs.',
      'Review cost is not the quoted item price.',
    ],
    (s) => {
      const q = (text: string, unit: string, value: number) => ({
        state: 'source-stated',
        ...(unit === 'USD' ? { money: { minorUnits: value, currency: 'USD' } } : { count: value }),
        basis: {
          subjectId: 'mira',
          population: 'kits',
          unit,
          period: 'June',
          denominator: 1,
          source: s.span(text),
        },
        source: s.span(text),
      });
      return {
        business: s.identity('mira', 'Mira', 'Mira is a business.'),
        activity: s.identity('acquire', 'Acquire', 'Acquire is a task.'),
        components: [
          {
            identity: s.identity('review', 'Review', 'Review is a cost component.'),
            cost: q(cost, 'USD', 200),
          },
        ],
        total: q(total, 'USD', 200),
        resolved: q(count, 'tasks', 1),
        perOutcome: q(per, 'USD', 200),
        carrier: null,
      };
    },
  );
  return [procurement, economics];
}

function network(): NativeSource[] {
  const units = 'East is a local unit of Harbor. West is a local unit of Harbor.';
  const local = 'East has local responsibility for Dispatch within Harbor.';
  const shared = 'West has shared responsibility for Audit with East within Harbor.';
  const organization = speech(
    'OP-25',
    'organization-map',
    'federated-units',
    'Harbor',
    [
      `Harbor is an organization. ${units} Dispatch is a task at Harbor. Audit is a task at Harbor.`,
      local,
      shared,
      'East and West are distinct units.',
      'Branches stay distinct.',
    ],
    (s) => ({
      organization: s.identity('harbor', 'Harbor', 'Harbor is an organization.'),
      units: [
        s.identity('east', 'East', 'East is a local unit of Harbor.'),
        s.identity('west', 'West', 'West is a local unit of Harbor.'),
      ],
      tasks: ['Dispatch', 'Audit'].map((label) =>
        s.identity(label.toLowerCase(), label, `${label} is a task at Harbor.`),
      ),
      responsibilities: [
        {
          unitId: 'east',
          taskId: 'dispatch',
          scope: 'local',
          sharedWithId: null,
          state: 'declared',
          source: s.span(local),
        },
        {
          unitId: 'west',
          taskId: 'audit',
          scope: 'shared',
          sharedWithId: 'east',
          state: 'declared',
          source: s.span(shared),
        },
      ],
    }),
  );
  const handoff = 'If audit clears, Mira hands Audit to Fran.';
  const coordination = speech(
    'OP-03',
    'coordination-map',
    'cross-function',
    'Mira',
    [
      'Mira works. Fran works. Audit is a task. Mira handles shared Audit for West. Fran receives Audit for East.',
      handoff,
      'Fran retains the audit role.',
      'The audit condition has not been resolved.',
      'Coordination remains conditional.',
    ],
    (s) => ({
      condition: 'If audit clears',
      actors: [
        s.identity('mira', 'Mira', 'Mira works.'),
        s.identity('fran', 'Fran', 'Fran works.'),
      ],
      tasks: [s.identity('audit', 'Audit', 'Audit is a task.')],
      handoffs: [
        {
          fromActorId: 'mira',
          toActorId: 'fran',
          taskId: 'audit',
          state: 'conditional',
          source: s.span(handoff),
          condition: { label: 'If audit clears', source: s.span('If audit clears,') },
        },
      ],
    }),
  );
  return [organization, coordination];
}

function learning(): NativeSource[] {
  const roles =
    'Mira performs Inspect. Fran approves Inspect. Owen remains accountable for Inspect.';
  const review = 'Fran review of Escalation for Inspect is pending.';
  const reviewCost =
    'Fran review cost for Inspect is 1 USD for requests during June per 10 requests.';
  const retryCost =
    'Mira retry cost for Inspect is 2 USD for requests during June per 10 requests.';
  const exception = speech(
    'OP-12',
    'authority-handoff',
    'exception-review',
    'Mira',
    [
      'Mira Fran Owen Inspect Escalation. Illustrative review.',
      roles,
      review,
      `${reviewCost} ${retryCost}`,
      'Review stays pending.',
    ],
    (s) => ({
      actors: ['Mira', 'Fran', 'Owen'].map((label) =>
        s.identity(
          label.toLowerCase(),
          label,
          'Mira Fran Owen Inspect Escalation. Illustrative review.',
        ),
      ),
      action: s.identity(
        'inspect',
        'Inspect',
        'Mira Fran Owen Inspect Escalation. Illustrative review.',
      ),
      roles: {
        taskId: 'inspect',
        performerId: 'mira',
        approverId: 'fran',
        accountableOwnerId: 'owen',
        source: s.span(roles),
      },
      exception: s.identity('escalation', 'Escalation', review),
      review: { state: 'pending', source: s.span(review) },
      reviewCost: {
        state: 'known',
        amount: { minorUnits: 100, currency: 'USD' },
        basis: {
          subjectId: 'inspect',
          population: 'requests',
          unit: 'USD',
          period: 'June',
          denominator: 10,
          source: s.span(reviewCost),
        },
        source: s.span(reviewCost),
      },
      retryCost: {
        state: 'known',
        amount: { minorUnits: 200, currency: 'USD' },
        basis: {
          subjectId: 'inspect',
          population: 'requests',
          unit: 'USD',
          period: 'June',
          denominator: 10,
          source: s.span(retryCost),
        },
        source: s.span(retryCost),
      },
    }),
  );
  const capture = 'Bo records expertise from Mira for Inspect in Notes.';
  const approval = 'Fran approves Guide v2 for Inspect.';
  const use = 'Dee uses Guide v2 for Inspect.';
  const playbook = speech(
    'OP-05',
    'work-redesign',
    'expertise-transfer',
    'Mira',
    [
      'Mira has expertise for Inspect. Inspect is a task. Bo works. Fran works. Dee works. Notes is a record. Guide v2 is a playbook.',
      `${capture} Bo records the Inspect expertise after the Escalation review.`,
      `Fran later completes the Escalation review. ${approval}`,
      use,
      'Guide version use remains explicit.',
    ],
    (s) => ({
      expert: s.identity('mira', 'Mira', 'Mira has expertise for Inspect.'),
      expertiseSource: s.span('Mira has expertise for Inspect.'),
      recorder: s.identity('bo', 'Bo', 'Bo works.'),
      approver: s.identity('fran', 'Fran', 'Fran works.'),
      receiver: s.identity('dee', 'Dee', 'Dee works.'),
      task: s.identity('inspect', 'Inspect', 'Inspect is a task.'),
      record: s.identity('notes', 'Notes', 'Notes is a record.'),
      playbook: {
        identity: s.identity('guide', 'Guide', 'Guide v2 is a playbook.'),
        version: 'v2',
        source: s.span('Guide v2 is a playbook.'),
      },
      capture: {
        recorderId: 'bo',
        expertId: 'mira',
        taskId: 'inspect',
        recordId: 'notes',
        state: 'observed',
        source: s.span(capture),
      },
      approval: {
        approverId: 'fran',
        taskId: 'inspect',
        playbookId: 'guide',
        version: 'v2',
        state: 'approved',
        source: s.span(approval),
      },
      use: {
        actorId: 'dee',
        taskId: 'inspect',
        playbookId: 'guide',
        version: 'v2',
        state: 'observed',
        source: s.span(use),
      },
    }),
  );
  return [exception, playbook];
}

/** Rename a constructor-owned scenario consistently in BOTH speech and source choices.
 * No numeric facts, states, spans or evidence are inferred from a name. */
function rename(
  source: NativeSource,
  replacements: Readonly<Record<string, string>>,
): NativeSource {
  const replace = (text: string) =>
    Object.entries(replacements).reduce((value, [from, to]) => value.replaceAll(from, to), text);
  const words: WordTimestamp[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  for (let from = 0; from < source.words.length; ) {
    const match = Object.entries(replacements).find(([label]) =>
      label
        .split(/\s+/u)
        .every(
          (token, offset) => source.words[from + offset]?.text.replace(/[.,;]$/u, '') === token,
        ),
    );
    const length = match ? match[0].split(/\s+/u).length : 1;
    const last = source.words[from + length - 1];
    const punctuation = last.text.match(/[.,;]$/u)?.[0] ?? '';
    const tokens = match
      ? `${match[1]}${punctuation}`.split(/\s+/u)
      : [replace(source.words[from].text)];
    const firstIndex = words.length;
    const start = source.words[from].start;
    tokens.forEach((text, index) => {
      words.push({
        text,
        start: start + ((last.end - start) * index) / tokens.length,
        end: start + ((last.end - start) * (index + 1)) / tokens.length,
      });
    });
    for (let index = from; index < from + length; index++) {
      starts[index] = firstIndex;
      ends[index] = words.length - 1;
    }
    from += length;
  }
  const remap = (value: unknown, key = ''): unknown => {
    if (typeof value === 'number' && /(?:Word|^fromWord$|^toWord$)$/u.test(key))
      return /(?:endWord|EndWord|toWord)$/u.test(key) ? ends[value] : starts[value];
    if (typeof value === 'string') return replace(value);
    if (Array.isArray(value)) return value.map((child) => remap(child));
    if (isRec(value))
      return Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, remap(child, name)]),
      );
    return value;
  };
  const raw = remap(source.raw);
  if (!isRec(raw)) throw Error('Invalid renamed authored source');
  return { ...source, raw, words };
}
const definitions = [
  {
    id: 'S-01',
    intent: 'Company inside-out: Harbor Repair support tasks become explicit task ownership.',
    sources: insideOut,
    facts: ['Inspect', 'Dispatch', 'Owen', 'accountable'],
  },
  {
    id: 'S-02',
    intent:
      'One Kit acquisition: authority and acceptance, comparable June costs, pending payment; no cash implied.',
    sources: transaction,
    facts: ['Kit', '12 USD', '2 USD', 'pending'],
  },
  {
    id: 'S-03',
    intent:
      'Harbor network: distinct East and West units share Audit; coordination remains conditional.',
    sources: network,
    facts: ['East', 'West', 'Audit', 'If audit clears'],
  },
  {
    id: 'S-04',
    intent:
      'Atlas fund: commitment, contribution, deployment and subsequent proceeds; priority tiers are not ownership.',
    sources: () => [
      createFundsFixture('OP-49', {
        period: 'August',
        committedMinor: 12000,
        calledMinor: 8000,
        contributedMinor: 7000,
        deployedMinor: 5000,
        retainedMinor: 2000,
      }),
      rename(
        createFundsFixture('OP-51', {
          period: 'August',
          proceedsMinor: 9000,
          retainedMinor: 2000,
          tierAmounts: [3000, 4000],
          tierCeilings: [3000, 4000],
        }),
        { Cedar: 'Atlas', cedar: 'atlas', Mina: 'Iris', mina: 'iris', Theo: 'Pax', theo: 'pax' },
      ),
    ],
    facts: ['120 USD', '70 USD', '50 USD', '90 USD', 'First', 'Second'],
  },
  {
    id: 'S-05',
    intent:
      'Dependency X-ray: separate firms and holdings share supported Demand, not a measured correlation.',
    sources: () => [
      sharedDependencyFixture({
        driverClauses: ['Acorn depends on Demand.', 'Rowan depends on Demand.'],
        sharedClause: 'Both funds share Demand exposure.',
      }),
    ],
    facts: ['Acorn', 'Rowan', 'Demand', 'correlation are not stated'],
  },
  {
    id: 'S-06',
    intent:
      'Governed learning: Inspect exception review precedes separately approved Guide v2 and later use, without retraining.',
    sources: learning,
    facts: ['Escalation', 'pending', 'Guide v2', 'Dee', 'not model retraining'],
  },
  {
    id: 'S-07',
    intent:
      'Alternative operating designs: one actual baseline, conditional qualitative alternatives and unresolved comparison.',
    sources: () => [
      rename(businessAlternativeFixture({ mode: 'hybrid', count: 2, condition: true }), {
        'Current design': 'Current',
        'Operating alternatives': 'Alternatives',
        'Lower record': 'Lower',
        'Steady record': 'Steady',
      }),
    ],
    facts: [
      'Current',
      'revision alpha',
      'If supplies arrive',
      'unresolved',
      'no stated probability or winner',
    ],
  },
  {
    id: 'S-08',
    intent:
      'Atlas rights X-ray: ownership, Pref priority and unknown payout, separate from conditional transfer and liquidity.',
    sources: () => [
      capitalRightsFixture({
        priority: 'source-stated',
        payout: null,
        payoutState: 'unknown',
        control: 'negative',
      }),
      capitalClaimAssetFixture({ transfer: 'conditional', liquidity: 'unknown' }),
    ],
    facts: ['Pref', 'unknown', 'If Atlas consents', 'does not control'],
  },
] as const;

/** Shift every source-word anchor, including specialized native alternative evidence. */
function shift(value: unknown, offset: number, key = ''): unknown {
  if (typeof value === 'number' && /(?:Word|^fromWord$|^toWord$)$/u.test(key))
    return value + offset;
  if (Array.isArray(value)) return value.map((child) => shift(child, offset));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([name, child]) => [name, shift(child, offset, name)]),
    );
  return value;
}

const contexts: Readonly<Record<BusinessSequenceFixture['id'], string>> = {
  'S-01':
    'Harbor is the business, not a job or a worker. Repair is its service. Inspect and Dispatch are the same named support tasks in both views. Mira performs them, Fran approves them and Owen remains accountable. The inside view explains why the tasks belong in the service; the responsibility view explains who does what. It does not claim that support guarantees profit or growth.',
  'S-02':
    'Mira is the requesting business in this illustration. Acquire concerns the same Kit throughout. Dex acts as its delegate, Fran grants authority and Pike supplies the quotation. The quote is twelve dollars, while the recorded Review cost is two dollars for one kit in June. These are different metrics, not competing prices. Acceptance is not paid cash. Transfer remains pending; the cost calculation cannot change its payment state.',
  'S-03':
    'East and West remain distinct local units of Harbor. West has the shared Audit responsibility with East, while East retains local Dispatch. Mira handles the shared Audit for West and Fran receives it for East. The handoff depends on audit clearance. Naming both ends does not resolve that condition or merge the branches. This is a service relationship with a coordination limit, not a claim that centralization succeeds.',
  'S-04':
    'The Atlas lifecycle distinguishes promises from contributed cash. Its contribution ledger balances seventy dollars with fifty deployed and twenty retained. Later distributable proceeds of ninety dollars are a separate flow, not a second contribution. The priority allocation balances thirty for First, forty for Second and twenty retained. Priority order is not ownership, and none of these labels establishes a general partner split. Both views refer to Atlas and retain the August dollar basis.',
  'S-05':
    'Acorn and Rowan are distinct firms with distinct holdings in the two portfolios. Demand is their source-supported common driver. Shared exposure does not give a numerical correlation, probability or common ownership. It says only which stated dependence the two portfolios have in common. The holdings and the firms remain separately named so that the mechanism cannot be mistaken for one blended company.',
  'S-06':
    'The first Inspect review is pending in its earlier record. Fran later completes the Escalation review and approves Guide version two. Bo records the Inspect expertise from Mira, and Dee later uses that exact approved version for the same task. Owen remains accountable in the review roles. Guidance use is not model retraining. The later approval does not rewrite the earlier pending observation; these are successive authored records.',
  'S-07':
    'Current is the actual baseline, while the revisions are proposed alternatives for the same Press line operating decision. Supplies arriving is an explicit condition. The qualitative comparisons retain their stated unknown counts. No probability, ranking or winner has been established, and the comparison remains unresolved. Presenting alternatives beside the baseline is not evidence that either one has been adopted.',
  'S-08':
    'The same Atlas asset and Pref claim remain identifiable across the rights and liquidity views. Ownership shares use their stated denominator. Pref has a stated priority, but its payout remains unknown. A transfer condition is separate from that priority: Atlas consent does not establish payment or available liquidity. Ada does not control Atlas merely because a claim is named. None of these distinctions invents a return or a sale price.',
};

function board(definition: (typeof definitions)[number]): BusinessSequenceFixture {
  const sources = definition.sources();
  const words: WordTimestamp[] = [];
  // The native narration is part of a three-minute authored source, not a 40-second clip
  // passed an artificially larger ParseContext. Context words continue to the media end.
  const intro =
    'These are illustrative authored business records. We keep identities and conditions separate while explaining the same source facts.';
  intro.split(/\s+/u).forEach((text, index) => {
    words.push({ text, start: index * 0.3, end: index * 0.3 + 0.25 });
  });
  const panels: Extract<StoryboardSourceSpec, { specVersion: 2 }>['panels'] = [];
  let cursor = 10;
  const startWord = words.length;
  sources.forEach((source, index) => {
    source.raw.visualMode =
      definition.id === 'S-07' ||
      definition.id === 'S-05' ||
      (definition.id === 'S-01' && index === 0)
        ? 'hybrid'
        : 'diagram';
    const panelStart = words.length;
    words.push({
      text: `${source.words[0].text.replace(/\.$/u, '')}.`,
      start: cursor,
      end: cursor + 0.2,
    });
    const offset = words.length;
    const raw = shift(source.raw, offset);
    if (!isRec(raw) || !isBusinessExplanationRecipe(source.id))
      throw Error(`${definition.id}: invalid authored source shape`);
    const localEnd = source.words.at(-1)?.end;
    if (!localEnd) throw Error(`${definition.id}: empty native speech`);
    // Slots include the final narration tail; the compiled S-02 window is 39.9s.
    // Give each complete table its measured reading hold without changing board limits.
    const slots =
      definition.id === 'S-02'
        ? [21.5, 18.8]
        : definition.id === 'S-04'
          ? [18.5, 21]
          : definition.id === 'S-08'
            ? [21, 18.5]
            : undefined;
    const slot = slots?.[index] ?? 39.5 / sources.length;
    source.words.forEach((word) => {
      words.push({
        ...word,
        start: cursor + 0.6 + (word.start / localEnd) * 10.6,
        end: cursor + 0.6 + (word.end / localEnd) * 10.6,
      });
    });
    const reconstructed = parseBusinessExplanationSource(
      { sourceVersion: 1, recipe: source.id, sourceChoices: raw, identityLinks: [] },
      words,
      { clipStart: 0, clipEnd: 180 },
    );
    if (!reconstructed.ok) {
      const ctx = makeParseContext(words, {
        startWord: offset,
        endWord: words.length - 1,
        startTime: words[offset].start - 0.25,
        endTime: cursor + 11.55,
      });
      const kind = BUSINESS_EXPLANATION_KINDS.find((candidate) => candidate === raw.kind);
      if (kind) getKindSpec(kind)?.parse(raw, ctx);
      throw Error(
        `${definition.id}/${source.id}: ${JSON.stringify(reconstructed.diagnostics)} ${JSON.stringify(ctx.issues)}`,
      );
    }
    const compact = compactBusinessSourceChoices(raw);
    if (!compact.ok) throw Error(`${definition.id}: ${compact.message}`);
    const title = { text: words[panelStart].text, startWord: panelStart, endWord: panelStart };
    const tail =
      definition.id === 'S-06'
        ? 'Guidance is not model retraining. These records retain their separate identities.'
        : 'These source records retain their separate identities and evidence states.';
    tail.split(/\s+/u).forEach((text, position, tokens) => {
      words.push({
        text,
        start: cursor + slot - 3 + (position * 2) / tokens.length,
        end: cursor + slot - 3 + ((position + 1) * 2) / tokens.length,
      });
    });
    const explanation = {
      sourceVersion: 2,
      recipe: source.id,
      sourceChoices: compact.choices,
      identityLinks: reconstructed.value.identities.map((entry) => ({
        localId: entry.identity.id,
        sharedId: `${definition.id}-${entry.roles[0]}-${entry.identity.label.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}`,
        role: entry.roles[0],
        startWord: entry.identity.source.fromWord,
        endWord: entry.identity.source.toWord,
      })),
    };
    if (!isBusinessExplanationSourceEnvelope(explanation))
      throw Error(`${definition.id}/${source.id}: invalid source envelope`);
    panels.push({
      kind: 'explanation',
      id: `panel-${index}`,
      startWord: panelStart,
      endWord: words.length - 1,
      revealWord: panelStart,
      moveWord: panelStart,
      title,
      explanation,
    });
    cursor += slot;
  });
  const endWord = words.length - 1;
  // A real source tail, with supported context rather than duplicated display facts.
  const context = `${contexts[definition.id]} These illustrations describe only the stated records. The source labels identify the entities being discussed; they do not establish additional relationships. A condition describes what would have to happen, not what has happened. Where an observation is unknown, the explanation keeps that uncertainty visible. We do not fill an empty observation with an estimate. A named role is also not a measurement of performance. Keeping each local clause attached to its source is important when the view changes: the next panel does not silently change the actor, task, period or denominator. Read each amount with its currency and basis, and each status with its own action. This is a walkthrough of these authored facts, not a prediction or an evaluation of a real business. Later records must be evaluated on their own evidence before we connect them to this explanation. That is why the distinctions remain visible through the final hold.`;
  const contextTokens = context.split(/\s+/u);
  contextTokens.forEach((text, index) => {
    words.push({
      text,
      start: 55 + (index * 124) / contextTokens.length,
      end: 55 + ((index + 0.9) * 124) / contextTokens.length,
    });
  });
  words.push({ text: 'End.', start: 179.5, end: 180 });
  const subject = panels[0].title;
  return {
    id: definition.id,
    words,
    duration: 180,
    intent: definition.intent,
    expectedFacts: definition.facts,
    spec: {
      kind: 'storyboard',
      specVersion: 2,
      startWord,
      endWord,
      subject: { ...subject },
      panels,
    },
  };
}

export function createBusinessSequenceFixture(
  id: BusinessSequenceFixture['id'],
): BusinessSequenceFixture {
  const definition = definitions.find((entry) => entry.id === id);
  if (!definition) throw Error(`Unknown authored sequence ${id}`);
  return board(definition);
}

export const BUSINESS_SEQUENCE_FIXTURES: readonly BusinessSequenceFixture[] = definitions.map(
  (definition) => {
    let fixture: BusinessSequenceFixture | undefined;
    const load = () => (fixture ??= board(definition));
    return Object.freeze({
      id: definition.id,
      intent: definition.intent,
      expectedFacts: definition.facts,
      get words() {
        return load().words;
      },
      get duration() {
        return load().duration;
      },
      get spec() {
        return load().spec;
      },
    });
  },
);
