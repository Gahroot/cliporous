import {
  parseOrganizationMapScene,
  parseSystemReconciliationScene,
} from '../../../../../ai/explainer/business-organization-contract';
import {
  isRec,
  makeParseContext,
  type PlannerWord,
  type Rec,
  type SceneWindow,
} from '../../../../../ai/explainer/kind-spec';
import type { BusinessIdentity, BusinessRecipeId, BusinessWordSpan } from '../types';
import type { OrganizationRecipeId } from './presentation';
import type { OrganizationScene } from './types';

export interface OrganizationSourceFixture {
  id: BusinessRecipeId;
  raw: Rec;
  words: PlannerWord[];
  window: SceneWindow;
}
export interface OrganizationFixtureSource {
  span: (text: string) => BusinessWordSpan;
  identity: (id: string, label: string, text: string) => BusinessIdentity;
}
const PRESETS = {
  'OP-25': 'federated-units',
  'OP-26': 'decision-rights',
  'OP-27': 'rollout-rings',
  'OP-28': 'legacy-boundaries',
  'OP-29': 'merge-identities',
  'OP-30': 'stated-chargeback',
  'OP-31': 'declared-tool-boundaries',
} as const;
/** The actual production padding, not an artificially extended makeParseContext window. */
export function organizationFixtureWindow(words: readonly PlannerWord[]): SceneWindow {
  return {
    startWord: 0,
    endWord: words.length - 1,
    startTime: Math.max(0, words[0].start - 0.25),
    endTime: words[words.length - 1].end + 0.35,
  };
}
/** Five authored speech blocks; local clause spans are real absolute word indices. */
export function makeOrganizationSourceFixture(
  id: OrganizationRecipeId,
  organizationLabel: string,
  paragraphs: readonly [string, string, string, string, string],
  build: (source: OrganizationFixtureSource) => Rec,
): OrganizationSourceFixture {
  const words: PlannerWord[] = [];
  const beats: number[] = [];
  const starts = [0.5, 1.8, 3.1, 4.4, 9.7];
  paragraphs.forEach((paragraph, phase) => {
    beats.push(words.length);
    const tokens = paragraph.split(/\s+/u);
    const step = 1.1 / tokens.length;
    tokens.forEach((text, index) => {
      const start = starts[phase] + index * step;
      words.push({ text, start, end: start + step * 0.8 });
    });
  });
  const span = (text: string): BusinessWordSpan => {
    const tokens = text.split(/\s+/u);
    const fromWord = words.findIndex((_, start) =>
      tokens.every((token, offset) => words[start + offset]?.text === token),
    );
    if (fromWord < 0) throw new Error(`${id}: missing authored clause ${text}`);
    return { fromWord, toWord: fromWord + tokens.length - 1 };
  };
  const source: OrganizationFixtureSource = {
    span,
    identity: (identityId, label, text) => ({ id: identityId, label, source: span(text) }),
  };
  const window = organizationFixtureWindow(words);
  const outcome = paragraphs[4].replace(/\.$/u, '');
  const organizationClause = `${organizationLabel} is an organization.`;
  return {
    id,
    words,
    window,
    raw: {
      kind: id === 'OP-29' ? 'system-reconciliation' : 'organization-map',
      preset: PRESETS[id],
      visualMode: 'diagram',
      label: organizationLabel,
      subject: organizationLabel,
      outcome,
      evidence: 'source-stated',
      startWord: 0,
      endWord: window.endWord,
      layout: 'stack',
      setupWord: beats[0],
      actionWord: beats[1],
      responseWord: beats[2],
      checkWord: beats[3],
      resolveWord: beats[4],
      organization: source.identity(
        organizationLabel.toLowerCase(),
        organizationLabel,
        organizationClause,
      ),
      factEvidence: { state: 'source-stated', label: outcome, source: span(paragraphs[4]) },
      ...build(source),
    },
  };
}
const birch = 'Birch is a local unit of Grove.';
const pine = 'Pine is a local unit of Grove.';
const dispatch = 'Dispatch is a task at Grove.';
const audit = 'Audit is a task at Grove.';
const localResponsibility = 'Birch has local responsibility for Dispatch within Grove.';
const sharedResponsibility = 'Pine has shared responsibility for Audit with Birch within Grove.';
const federated = makeOrganizationSourceFixture(
  'OP-25',
  'Grove',
  [
    `Grove is an organization. ${birch} ${pine} ${dispatch} ${audit}`,
    localResponsibility,
    sharedResponsibility,
    'Responsibilities are checked separately.',
    'Responsibilities stay separately stated.',
  ],
  (s) => ({
    units: [s.identity('birch', 'Birch', birch), s.identity('pine', 'Pine', pine)],
    tasks: [s.identity('dispatch', 'Dispatch', dispatch), s.identity('audit', 'Audit', audit)],
    responsibilities: [
      {
        unitId: 'birch',
        taskId: 'dispatch',
        scope: 'local',
        sharedWithId: null,
        state: 'declared',
        source: s.span(localResponsibility),
      },
      {
        unitId: 'pine',
        taskId: 'audit',
        scope: 'shared',
        sharedWithId: 'birch',
        state: 'declared',
        source: s.span(sharedResponsibility),
      },
    ],
  }),
);
const brook = 'Brook is a local unit of Crest.';
const board = 'Board is a central unit of Crest.';
const fee = 'Fee is a decision at Crest.';
const gate = 'Gate is a decision at Crest.';
const localRight = 'Brook is permitted to decide Fee locally within Crest.';
const centralRight = 'Board has permission to decide Gate centrally within Crest pending.';
const escalation = 'Brook has an escalation route for Fee to Board within Crest.';
const rights = makeOrganizationSourceFixture(
  'OP-26',
  'Crest',
  [
    `Crest is an organization. ${brook} ${board} ${fee} ${gate}`,
    localRight,
    centralRight,
    escalation,
    'Rights remain separately stated.',
  ],
  (s) => ({
    units: [
      { identity: s.identity('brook', 'Brook', brook), role: 'local' },
      { identity: s.identity('board', 'Board', board), role: 'central' },
    ],
    rights: [
      {
        decision: s.identity('fee', 'Fee', fee),
        unitId: 'brook',
        scope: 'local',
        sharedWithId: null,
        permission: 'permitted',
        source: s.span(localRight),
        escalation: { toUnitId: 'board', state: 'declared', source: s.span(escalation) },
      },
      {
        decision: s.identity('gate', 'Gate', gate),
        unitId: 'board',
        scope: 'central',
        sharedWithId: null,
        permission: 'pending',
        source: s.span(centralRight),
        escalation: null,
      },
    ],
  }),
);
const pilot = 'Pilot is a rollout at Quarry.';
const pilotVersion = 'Pilot has version r1 at Quarry.';
const elm = 'Elm is a local unit of Quarry.';
const oak = 'Oak is a local unit of Quarry.';
const ash = 'Ash is a local unit of Quarry.';
const yew = 'Yew is a local unit of Quarry.';
const paused = 'Quarry paused rollout of Pilot version r1 for Ash on September.';
const rolledBack = 'Quarry rolled back rollout of Pilot version r1 for Yew on October.';
const configured = 'Quarry configured rollout of Pilot version r1 for Elm on July.';
const pending = 'Quarry has rollout of Pilot version r1 for Oak on August pending.';
const rollout = makeOrganizationSourceFixture(
  'OP-27',
  'Quarry',
  [
    `Quarry is an organization. ${pilot} ${pilotVersion} ${elm} ${oak} ${ash} ${yew}`,
    configured,
    pending,
    `${paused} ${rolledBack}`,
    'Rollout states remain separate.',
  ],
  (s) => ({
    rollout: {
      identity: s.identity('pilot', 'Pilot', pilot),
      version: 'r1',
      source: s.span(pilotVersion),
    },
    rings: [
      {
        unit: s.identity('elm', 'Elm', elm),
        state: 'configured',
        date: 'July',
        source: s.span(configured),
      },
      {
        unit: s.identity('oak', 'Oak', oak),
        state: 'pending',
        date: 'August',
        source: s.span(pending),
      },
      {
        unit: s.identity('ash', 'Ash', ash),
        state: 'paused',
        date: 'September',
        source: s.span(paused),
      },
      {
        unit: s.identity('yew', 'Yew', yew),
        state: 'rolled-back',
        date: 'October',
        source: s.span(rolledBack),
      },
    ],
  }),
);
const old = 'Ledger is a legacy system at Delta.';
const next = 'Next is a replacement system at Delta.';
const bridge = 'Bridge is an interface at Delta.';
const unsupported = 'Delta states Bridge between Ledger and Next is unsupported.';
const legacy = makeOrganizationSourceFixture(
  'OP-28',
  'Delta',
  [
    `Delta is an organization. ${old} ${next} ${bridge}`,
    unsupported,
    'The interface stays separate.',
    'The boundary is checked.',
    'Boundary remains separately stated.',
  ],
  (s) => ({
    legacy: s.identity('ledger', 'Ledger', old),
    replacement: s.identity('next', 'Next', next),
    interface: s.identity('bridge', 'Bridge', bridge),
    boundary: { state: 'unsupported', source: s.span(unsupported) },
  }),
);
const responsibleOwner = 'Mara is responsible for reconciliation at Union.';
const east = 'East is a source system at Union.';
const west = 'West is a source system at Union.';
const eastVersion = 'East has version v1 at Union.';
const westVersion = 'West has version v2 at Union.';
const recordA = 'Union records Amber with source ID A17 in East version v1.';
const recordB = 'Union records Bronze with source ID B91 in West version v2.';
const conflict =
  'Union states Amber source ID A17 in East version v1 has an unresolved identity conflict with Bronze source ID B91 in West version v2.';
const reconciliation = makeOrganizationSourceFixture(
  'OP-29',
  'Union',
  [
    `Union is an organization. ${responsibleOwner} ${east} ${west} ${eastVersion} ${westVersion}`,
    recordA,
    recordB,
    conflict,
    'Source identities remain distinct.',
  ],
  (s) => ({
    owner: s.identity('mara', 'Mara', responsibleOwner),
    systems: [
      { identity: s.identity('east', 'East', east), version: 'v1', source: s.span(eastVersion) },
      { identity: s.identity('west', 'West', west), version: 'v2', source: s.span(westVersion) },
    ],
    records: [
      {
        identity: s.identity('amber', 'Amber', recordA),
        sourceSystemId: 'east',
        sourceId: 'A17',
        source: s.span(recordA),
      },
      {
        identity: s.identity('bronze', 'Bronze', recordB),
        sourceSystemId: 'west',
        sourceId: 'B91',
        source: s.span(recordB),
      },
    ],
    collisions: [
      {
        leftRecordId: 'amber',
        rightRecordId: 'bronze',
        state: 'unresolved',
        source: s.span(conflict),
      },
    ],
  }),
);
const hub = 'Hub is a shared service at Sol.';
const treasury = 'Treasury is the payer for Hub at Sol.';
const north = 'North is a local unit of Sol.';
const south = 'South is a local unit of Sol.';
const totalCost =
  "Sol states Treasury's chargeback total for Hub is 100.01 USD during July per 10 requests.";
const northCost =
  "Sol allocates 30 USD of Treasury's chargeback for Hub to North for 3 of 10 requests during July.";
const southCost =
  "Sol allocates 50 USD of Treasury's chargeback for Hub to South for 5 of 10 requests during July.";
const remainderCost =
  "Sol states Treasury's chargeback remainder for Hub is 20.01 USD for 2 of 10 requests during July.";
const chargeback = makeOrganizationSourceFixture(
  'OP-30',
  'Sol',
  [
    `Sol is an organization. ${hub} ${treasury} ${north} ${south}`,
    totalCost,
    `${northCost} ${southCost}`,
    remainderCost,
    'Chargeback remains separately stated.',
  ],
  (s) => {
    const quantity = (minorUnits: number, text: string): Rec => ({
      state: 'source-stated',
      amount: { minorUnits, currency: 'USD' },
      source: s.span(text),
      basis: {
        subjectId: 'treasury',
        population: 'requests',
        unit: 'USD',
        period: 'July',
        denominator: 10,
        source: s.span(text),
      },
    });
    return {
      service: s.identity('hub', 'Hub', hub),
      payer: s.identity('treasury', 'Treasury', treasury),
      units: [s.identity('north', 'North', north), s.identity('south', 'South', south)],
      total: quantity(10_001, totalCost),
      allocations: [
        { ...quantity(3_000, northCost), unitId: 'north', components: 3 },
        { ...quantity(5_000, southCost), unitId: 'south', components: 5 },
      ],
      remainder: { ...quantity(2_001, remainderCost), components: 2 },
    };
  },
);
const bay = 'Bay is a local unit of Harbor.';
const slate = 'Slate is a tool at Harbor.';
const pen = 'Pen is a tool at Harbor.';
const unapproved = 'Harbor declares Slate unapproved for Bay.';
const allowed = 'Harbor declares Pen allowed for Bay.';
const mira = 'Mira is a worker in Bay at Harbor.';
const informalUse = 'Harbor observed informal use of Slate by Mira in Bay.';
const configuredUse = 'Harbor configured declared use of Pen by Bay.';
const tools = makeOrganizationSourceFixture(
  'OP-31',
  'Harbor',
  [
    `Harbor is an organization. ${bay} ${slate} ${pen} ${mira}`,
    unapproved,
    allowed,
    `${informalUse} ${configuredUse}`,
    'Tool boundaries stay separately stated.',
  ],
  (s) => ({
    units: [s.identity('bay', 'Bay', bay)],
    workers: [{ identity: s.identity('mira', 'Mira', mira), unitId: 'bay' }],
    uses: [
      {
        toolId: 'slate',
        unitId: 'bay',
        workerId: 'mira',
        context: 'informal',
        state: 'observed',
        source: s.span(informalUse),
      },
      {
        toolId: 'pen',
        unitId: 'bay',
        workerId: null,
        context: 'declared',
        state: 'configured',
        source: s.span(configuredUse),
      },
    ],
    tools: [
      {
        identity: s.identity('slate', 'Slate', slate),
        unitId: 'bay',
        state: 'unapproved',
        source: s.span(unapproved),
      },
      {
        identity: s.identity('pen', 'Pen', pen),
        unitId: 'bay',
        state: 'allowed',
        source: s.span(allowed),
      },
    ],
  }),
);

/** ONE primary raw fixture per recipe. Coordinator expands the frozen catalog modes. */
export const ORGANIZATION_SOURCE_FIXTURES: readonly OrganizationSourceFixture[] = [
  federated,
  rights,
  rollout,
  legacy,
  reconciliation,
  chargeback,
  tools,
];
export interface OrganizationResourceFixture {
  name: string;
  fixture: OrganizationSourceFixture;
  entities: number;
  relationships: number;
  holds: number;
}
/** Source-built coexisting maxima, not forged layout probes or native-render evidence.
 * The global 8/12/4 ceilings coexist with narrower per-preset list limits.
 * These extra cases do not replace the seven primary planner examples.
 */
function organizationResourceFixtures(): OrganizationResourceFixture[] {
  const names = ['A', 'B', 'C', 'D', 'E', 'F'];
  const member = (name: string, org: string) => `${name} is a local unit of ${org}.`;
  const id = (name: string) => name.toLowerCase();
  const federatedOrg = 'Maxgrove';
  const responsibilities = names
    .slice(0, 5)
    .map((name, index) =>
      index < 4
        ? `Whether ${name} has local responsibility for Job within ${federatedOrg} is unknown.`
        : `${name} has shared responsibility for Job with F within ${federatedOrg}.`,
    );
  const maxFederated = makeOrganizationSourceFixture(
    'OP-25',
    federatedOrg,
    [
      `${federatedOrg} is an organization. ${names.map((name) => member(name, federatedOrg)).join(' ')} Job is a task at ${federatedOrg}.`,
      responsibilities.slice(0, 2).join(' '),
      responsibilities.slice(2, 4).join(' '),
      responsibilities[4],
      'Responsibilities stay separately stated.',
    ],
    (s) => ({
      units: names.map((name) => s.identity(id(name), name, member(name, federatedOrg))),
      tasks: [s.identity('job', 'Job', `Job is a task at ${federatedOrg}.`)],
      responsibilities: responsibilities.map((text, index) => ({
        unitId: id(names[index]),
        taskId: 'job',
        scope: index < 4 ? 'local' : 'shared',
        sharedWithId: index < 4 ? null : 'f',
        state: index < 4 ? 'unknown' : 'declared',
        source: s.span(text),
      })),
    }),
  );
  function maxRights(unitCount: number, rightCount: number): OrganizationSourceFixture {
    const org = 'Maxcrest',
      units = names.slice(0, unitCount);
    const decisions = ['Aa', 'Ab', 'Ac', 'Ad'].slice(0, rightCount);
    const shared = unitCount === 5;
    const states = shared ? ['pending', 'unknown'] : ['pending', 'unknown', 'denied', 'permitted'];
    const actors = shared ? ['A', 'D'] : ['A', 'B', 'C', 'A'];
    const peers = shared ? ['B', 'E'] : [];
    const targets = decisions.map(
      (decision, index) =>
        `decide ${decision} ${shared ? `jointly with ${peers[index]}` : 'locally'} within ${org}`,
    );
    const clauses = decisions.map((_, index) =>
      states[index] === 'pending'
        ? `${actors[index]} has permission to ${targets[index]} pending.`
        : states[index] === 'unknown'
          ? `Whether ${actors[index]} is permitted to ${targets[index]} is unknown.`
          : `${actors[index]} is ${states[index] === 'denied' ? 'not ' : ''}permitted to ${targets[index]}.`,
    );
    const routes = shared
      ? [
          `Whether A has an escalation route for Aa to C within ${org} is unknown.`,
          `Whether D has an escalation route for Ab to B within ${org} is unknown.`,
        ]
      : [`Whether A has an escalation route for Aa to B within ${org} is unknown.`];
    return makeOrganizationSourceFixture(
      'OP-26',
      org,
      [
        `${org} is an organization. ${units.map((name) => member(name, org)).join(' ')} ${decisions.map((name) => `${name} is a decision at ${org}.`).join(' ')}`,
        clauses.slice(0, 2).join(' '),
        clauses.slice(2).join(' ') || 'Rights are checked separately.',
        routes.join(' '),
        'Rights remain separately stated.',
      ],
      (s) => ({
        units: units.map((name) => ({
          identity: s.identity(id(name), name, member(name, org)),
          role: 'local',
        })),
        rights: decisions.map((decision, index) => ({
          decision: s.identity(id(decision), decision, `${decision} is a decision at ${org}.`),
          unitId: id(actors[index]),
          scope: shared ? 'shared' : 'local',
          sharedWithId: shared ? id(peers[index]) : null,
          permission: states[index],
          source: s.span(clauses[index]),
          escalation:
            index < routes.length
              ? {
                  toUnitId: shared ? ['c', 'b'][index] : 'b',
                  state: 'unknown',
                  source: s.span(routes[index]),
                }
              : null,
        })),
      }),
    );
  }
  const ringOrg = 'Maxquarry',
    dates = ['July', 'August', 'September', 'October'];
  const ringClauses = [
    `Whether ${ringOrg} configured rollout of Pilot version r1 for A on July is unknown.`,
    `${ringOrg} has rollout of Pilot version r1 for B on August pending.`,
    `${ringOrg} paused rollout of Pilot version r1 for C on September.`,
    `${ringOrg} rolled back rollout of Pilot version r1 for D on October.`,
  ];
  const maxRollout = makeOrganizationSourceFixture(
    'OP-27',
    ringOrg,
    [
      `${ringOrg} is an organization. Pilot is a rollout at ${ringOrg}. Pilot has version r1 at ${ringOrg}. ${names
        .slice(0, 4)
        .map((name) => member(name, ringOrg))
        .join(' ')}`,
      ringClauses[0],
      ringClauses[1],
      ringClauses.slice(2).join(' '),
      'Rollout states remain separate.',
    ],
    (s) => ({
      rollout: {
        identity: s.identity('pilot', 'Pilot', `Pilot is a rollout at ${ringOrg}.`),
        version: 'r1',
        source: s.span(`Pilot has version r1 at ${ringOrg}.`),
      },
      rings: names.slice(0, 4).map((name, index) => ({
        unit: s.identity(id(name), name, member(name, ringOrg)),
        state: ['unknown', 'pending', 'paused', 'rolled-back'][index],
        date: dates[index],
        source: s.span(ringClauses[index]),
      })),
    }),
  );
  const mergeOrg = 'Maxunion',
    systems = ['East', 'West'],
    records = ['Aa', 'Ab', 'Ac', 'Ad'];
  const recordClause = (index: number) =>
    `${mergeOrg} records ${records[index]} with source ID R${index} in ${systems[index % 2]} version v1.`;
  const recordPhrase = (index: number) =>
    `${records[index]} source ID R${index} in ${systems[index % 2]} version v1`;
  const pairs = [
    [0, 1],
    [0, 3],
    [2, 1],
  ] as const;
  const conflicts = pairs.map(
    ([left, right]) =>
      `${mergeOrg} states ${recordPhrase(left)} has an unresolved identity conflict with ${recordPhrase(right)}.`,
  );
  const maxMerge = makeOrganizationSourceFixture(
    'OP-29',
    mergeOrg,
    [
      `${mergeOrg} is an organization. Mara is responsible for reconciliation at ${mergeOrg}. ${systems.map((name) => `${name} is a source system at ${mergeOrg}. ${name} has version v1 at ${mergeOrg}.`).join(' ')}`,
      records
        .slice(0, 2)
        .map((_, index) => recordClause(index))
        .join(' '),
      records
        .slice(2)
        .map((_, index) => recordClause(index + 2))
        .join(' '),
      conflicts.join(' '),
      'Source identities remain distinct.',
    ],
    (s) => ({
      owner: s.identity('mara', 'Mara', `Mara is responsible for reconciliation at ${mergeOrg}.`),
      systems: systems.map((name) => ({
        identity: s.identity(id(name), name, `${name} is a source system at ${mergeOrg}.`),
        version: 'v1',
        source: s.span(`${name} has version v1 at ${mergeOrg}.`),
      })),
      records: records.map((name, index) => ({
        identity: s.identity(id(name), name, recordClause(index)),
        sourceSystemId: id(systems[index % 2]),
        sourceId: `R${index}`,
        source: s.span(recordClause(index)),
      })),
      collisions: pairs.map(([left, right], index) => ({
        leftRecordId: id(records[left]),
        rightRecordId: id(records[right]),
        state: 'unresolved',
        source: s.span(conflicts[index]),
      })),
    }),
  );
  const costOrg = 'Maxsol',
    costUnits = names.slice(0, 4);
  const total = `${costOrg} states Treasury's chargeback total for Hub is 50 USD during July per 5 requests.`;
  const costs = costUnits.map(
    (name) =>
      `${costOrg} allocates 10 USD of Treasury's chargeback for Hub to ${name} for 1 of 5 requests during July.`,
  );
  const remainder = `${costOrg} states Treasury's chargeback remainder for Hub is unknown during July per 5 requests.`;
  const maxCost = makeOrganizationSourceFixture(
    'OP-30',
    costOrg,
    [
      `${costOrg} is an organization. Hub is a shared service at ${costOrg}. Treasury is the payer for Hub at ${costOrg}. ${costUnits.map((name) => member(name, costOrg)).join(' ')}`,
      total,
      costs.join(' '),
      remainder,
      'Chargeback remains separately stated.',
    ],
    (s) => {
      const quantity = (minorUnits: number, text: string) => ({
        state: 'source-stated',
        amount: { minorUnits, currency: 'USD' },
        source: s.span(text),
        basis: {
          subjectId: 'treasury',
          population: 'requests',
          unit: 'USD',
          period: 'July',
          denominator: 5,
          source: s.span(text),
        },
      });
      return {
        service: s.identity('hub', 'Hub', `Hub is a shared service at ${costOrg}.`),
        payer: s.identity('treasury', 'Treasury', `Treasury is the payer for Hub at ${costOrg}.`),
        units: costUnits.map((name) => s.identity(id(name), name, member(name, costOrg))),
        total: quantity(5000, total),
        allocations: costs.map((text, index) => ({
          ...quantity(1000, text),
          unitId: id(costUnits[index]),
          components: 1,
        })),
        remainder: { state: 'unknown', amount: null, components: null, source: s.span(remainder) },
      };
    },
  );
  const toolOrg = 'Maxharbor',
    workers = ['Mira', 'Nora', 'Ora'];
  const workerUnits = ['A', 'A', 'B'],
    toolNames = ['Slate', 'Pen'];
  const workerClauses = workers.map(
    (name, index) => `${name} is a worker in ${workerUnits[index]} at ${toolOrg}.`,
  );
  const declarations = [
    `${toolOrg} declares Slate unapproved for A.`,
    `${toolOrg} declares Pen status unknown for B.`,
  ];
  const uses = workers.map((name, index) =>
    index === 2
      ? `${toolOrg} configured declared use of Pen by ${name} in B.`
      : `Whether ${toolOrg} observed informal use of Slate by ${name} in A is unknown.`,
  );
  const maxTools = makeOrganizationSourceFixture(
    'OP-31',
    toolOrg,
    [
      `${toolOrg} is an organization. ${['A', 'B'].map((name) => member(name, toolOrg)).join(' ')} ${toolNames.map((name) => `${name} is a tool at ${toolOrg}.`).join(' ')} ${workerClauses.join(' ')}`,
      declarations[0],
      declarations[1],
      uses.join(' '),
      'Tool boundaries stay separately stated.',
    ],
    (s) => ({
      units: ['A', 'B'].map((name) => s.identity(id(name), name, member(name, toolOrg))),
      workers: workers.map((name, index) => ({
        identity: s.identity(id(name), name, workerClauses[index]),
        unitId: id(workerUnits[index]),
      })),
      tools: toolNames.map((name, index) => ({
        identity: s.identity(id(name), name, `${name} is a tool at ${toolOrg}.`),
        unitId: index === 0 ? 'a' : 'b',
        state: index === 0 ? 'unapproved' : 'unknown',
        source: s.span(declarations[index]),
      })),
      uses: workers.map((name, index) => ({
        toolId: index === 2 ? 'pen' : 'slate',
        unitId: id(workerUnits[index]),
        workerId: id(name),
        context: index === 2 ? 'declared' : 'informal',
        state: index === 2 ? 'configured' : 'unknown',
        source: s.span(uses[index]),
      })),
    }),
  );
  return [
    {
      name: 'six-unit 8/12/4 boundary',
      fixture: maxFederated,
      entities: 8,
      relationships: 12,
      holds: 4,
    },
    {
      name: 'five-unit rights maximum',
      fixture: maxRights(5, 2),
      entities: 8,
      relationships: 11,
      holds: 4,
    },
    {
      name: 'four-right 8/12/4 boundary',
      fixture: maxRights(3, 4),
      entities: 8,
      relationships: 12,
      holds: 4,
    },
    {
      name: 'four-ring/hold maximum',
      fixture: maxRollout,
      entities: 6,
      relationships: 10,
      holds: 4,
    },
    {
      name: 'fixed legacy carriers',
      fixture: structuredClone(legacy),
      entities: 4,
      relationships: 4,
      holds: 1,
    },
    {
      name: 'four-record/conflict maximum',
      fixture: maxMerge,
      entities: 8,
      relationships: 12,
      holds: 3,
    },
    { name: 'four-allocation maximum', fixture: maxCost, entities: 7, relationships: 12, holds: 1 },
    { name: 'tool 8/12/4 boundary', fixture: maxTools, entities: 8, relationships: 12, holds: 4 },
  ];
}
export const ORGANIZATION_RESOURCE_FIXTURES: readonly OrganizationResourceFixture[] =
  organizationResourceFixtures();

export function organizationFixture(id: OrganizationRecipeId): OrganizationSourceFixture {
  const fixture = ORGANIZATION_SOURCE_FIXTURES.find((entry) => entry.id === id);
  if (!fixture) throw new Error(`Missing organization fixture ${id}`);
  return structuredClone(fixture);
}
export function organizationRawAt(raw: Rec, ...path: readonly (string | number)[]): Rec {
  let value: unknown = raw;
  for (const key of path) {
    if (typeof key === 'number' && Array.isArray(value)) value = value[key];
    else if (typeof key === 'string' && isRec(value)) value = value[key];
    else throw new Error('Missing authored organization fixture path');
  }
  if (!isRec(value)) throw new Error('Expected authored organization object');
  return value;
}
export function organizationSource(
  raw: Rec,
  ...path: readonly (string | number)[]
): BusinessWordSpan {
  const source = organizationRawAt(raw, ...path, 'source');
  if (typeof source.fromWord !== 'number' || typeof source.toWord !== 'number')
    throw new Error('Missing authored organization source');
  return { fromWord: source.fromWord, toWord: source.toWord };
}
/** Rewrite actual local speech, preserving timings and rebasing EVERY affected raw word index. */
export function rewriteOrganizationSource(
  fixture: OrganizationSourceFixture,
  source: BusinessWordSpan,
  replacement: string,
): void {
  const start = fixture.words[source.fromWord].start,
    end = fixture.words[source.toWord].end;
  const tokens = replacement.split(/\s+/u),
    delta = tokens.length - (source.toWord - source.fromWord + 1);
  const step = (end - start) / tokens.length;
  fixture.words.splice(
    source.fromWord,
    source.toWord - source.fromWord + 1,
    ...tokens.map((text, index) => ({
      text,
      start: start + index * step,
      end: start + (index + 0.8) * step,
    })),
  );
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRec(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (
        typeof child === 'number' &&
        (key.endsWith('Word') || key === 'fromWord' || key === 'toWord')
      ) {
        if (child > source.toWord || (key === 'toWord' && child === source.toWord))
          value[key] = child + delta;
      } else visit(child);
    }
  };
  visit(fixture.raw);
  fixture.window = organizationFixtureWindow(fixture.words);
  fixture.raw.endWord = fixture.window.endWord;
}
export function parseOrganizationFixture(
  fixture: Pick<OrganizationSourceFixture, 'raw' | 'words'>,
): { scene: OrganizationScene | null; issues: string[] } {
  const ctx = makeParseContext(fixture.words, organizationFixtureWindow(fixture.words));
  const scene =
    fixture.raw.kind === 'system-reconciliation'
      ? parseSystemReconciliationScene(fixture.raw, ctx)
      : parseOrganizationMapScene(fixture.raw, ctx);
  return { scene, issues: ctx.issues };
}
export interface OrganizationSourceNegative {
  recipeId: BusinessRecipeId;
  name: string;
  fixture: OrganizationSourceFixture;
}
function negative(
  id: OrganizationRecipeId,
  name: string,
  path: readonly (string | number)[],
  replacement: string,
): OrganizationSourceNegative {
  const fixture = organizationFixture(id);
  rewriteOrganizationSource(fixture, organizationSource(fixture.raw, ...path), replacement);
  return { recipeId: id, name, fixture };
}
/** Add an independent source assertion without moving the original fact's local span. */
export function appendOrganizationClause(fixture: OrganizationSourceFixture, text: string): void {
  const start = fixture.words[fixture.words.length - 1].end + 0.04;
  text.split(/\s+/u).forEach((token, index) => {
    const at = start + index * 0.02;
    fixture.words.push({ text: token, start: at, end: at + 0.016 });
  });
  fixture.window = organizationFixtureWindow(fixture.words);
  fixture.raw.endWord = fixture.window.endWord;
}
function conflictingCost(): OrganizationSourceNegative {
  const fixture = organizationFixture('OP-30');
  appendOrganizationClause(fixture, totalCost.replace('100.01', '200.02'));
  return {
    recipeId: 'OP-30',
    name: 'same subject and period cannot silently select one of two totals',
    fixture,
  };
}
/** Source-specific false claims, not just unsupported-field/key mutations. */
export const ORGANIZATION_SOURCE_NEGATIVES: readonly OrganizationSourceNegative[] = [
  negative(
    'OP-25',
    'negated responsibility cannot become declared',
    ['responsibilities', 0],
    'Birch does not have local responsibility for Dispatch within Grove.',
  ),
  negative(
    'OP-25',
    'shared relationship cannot borrow local scope',
    ['responsibilities', 1],
    'Pine has local responsibility for Audit with Birch within Grove.',
  ),
  negative(
    'OP-26',
    'observed decision does not grant permission',
    ['rights', 0],
    'Brook decided Fee locally within Crest.',
  ),
  negative(
    'OP-26',
    'escalation recipient belongs to its own clause',
    ['rights', 0, 'escalation'],
    'Board has an escalation route for Fee to Brook within Crest.',
  ),
  negative(
    'OP-27',
    'worker use is not pending or configured rollout',
    ['rings', 1],
    'Quarry observed worker use of Pilot version r1 for Oak on August.',
  ),
  negative(
    'OP-27',
    'configured unit cannot borrow another snapshot',
    ['rings', 0],
    'Quarry configured rollout of Pilot version r1 for Oak on July.',
  ),
  negative(
    'OP-28',
    'monitoring does not establish declared boundary state',
    ['boundary'],
    'Delta monitored Bridge between Ledger and Next.',
  ),
  negative(
    'OP-29',
    'completed merge cannot erase unresolved collision',
    ['collisions', 0],
    'Union states Amber source ID A17 in East version v1 merged with Bronze source ID B91 in West version v2.',
  ),
  negative(
    'OP-29',
    'matching evidence retains literal source identifiers',
    ['collisions', 0],
    conflict.replace('A17', 'A18'),
  ),
  negative(
    'OP-30',
    'allocation period must be local and comparable',
    ['allocations', 1],
    southCost.replace('July', 'August'),
  ),
  negative(
    'OP-30',
    'payment cannot be inferred from a chargeback',
    ['allocations', 0],
    northCost.replace('allocates', 'paid'),
  ),
  negative(
    'OP-31',
    'monitoring is not an unapproved-tool declaration',
    ['tools', 0],
    'Harbor monitors Slate use for Bay.',
  ),
  negative(
    'OP-27',
    'pause is not nonconfiguration',
    ['rings', 2],
    'Quarry did not configure rollout of Pilot version r1 for Ash on September.',
  ),
  negative(
    'OP-27',
    'rollback is not pause',
    ['rings', 3],
    'Quarry paused rollout of Pilot version r1 for Yew on October.',
  ),
  negative(
    'OP-31',
    'approval declaration cannot establish worker use',
    ['uses', 0],
    'Harbor declares Slate allowed for Bay.',
  ),
  negative(
    'OP-31',
    'configured use is not observed use',
    ['uses', 0],
    'Harbor configured informal use of Slate by Mira in Bay.',
  ),
  negative(
    'OP-31',
    'worker use cannot borrow another tool',
    ['uses', 0],
    informalUse.replace('Slate', 'Pen'),
  ),
  conflictingCost(),
];
