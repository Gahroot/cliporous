import {
  parseBusinessBlueprint,
  parseBusinessReplication,
} from '../../../../../ai/explainer/business-commercial-contract';
import {
  makeParseContext,
  type PlannerWord,
  type Rec,
  type SceneWindow,
} from '../../../../../ai/explainer/kind-spec';
import { BUSINESS_RECIPES } from '../catalog';
import type { BusinessIdentity, BusinessWordSpan } from '../types';
import type { CommercialRecipeId } from './presentation';
import type { CommercialScene } from './types';

export interface CommercialSourceFixture {
  id: CommercialRecipeId;
  fixtureId: string;
  raw: Rec;
  words: PlannerWord[];
  window: SceneWindow;
}
export interface CommercialFixtureSource {
  span: (text: string) => BusinessWordSpan;
  identity: (id: string, label: string, text: string) => BusinessIdentity;
}
const PRESETS = {
  'OP-17': 'back-office',
  'OP-19': 'service-slots',
  'OP-20': 'service-lifecycle',
  'OP-21': 'owner-dependency',
  'OP-22': 'service-modules',
  'OP-23': 'shared-standard-local-context',
} as const;

/** Authored RAW clauses on five timed speech blocks, not typed-scene or rebased-beat fixtures. */
export function makeCommercialSourceFixture(
  id: CommercialRecipeId,
  paragraphs: readonly [string, string, string, string, string],
  build: (source: CommercialFixtureSource) => Rec,
  condition?: string,
): CommercialSourceFixture {
  const starts = [0.5, 2.3, 4.5, 6.7, 8.9];
  const words: PlannerWord[] = [];
  const beats: number[] = [];
  paragraphs.forEach((paragraph, phase) => {
    beats.push(words.length);
    const tokens = paragraph.split(/\s+/u);
    const step = 1.2 / tokens.length;
    tokens.forEach((text, index) => {
      const start = starts[phase] + index * step;
      words.push({ text, start, end: start + step * 0.8 });
    });
  });
  function span(text: string): BusinessWordSpan {
    const tokens = text.split(/\s+/u);
    const fromWord = words.findIndex((_, from) =>
      tokens.every((token, offset) => words[from + offset]?.text === token),
    );
    if (fromWord < 0) throw new Error(`${id}: missing authored source clause: ${text}`);
    return { fromWord, toWord: fromWord + tokens.length - 1 };
  }
  const source: CommercialFixtureSource = {
    span,
    identity: (identityId, label, text) => ({ id: identityId, label, source: span(text) }),
  };
  const outcome = paragraphs[4].replace(/\.$/u, '');
  const window = { startWord: 0, endWord: words.length - 1, startTime: 0.25, endTime: 10.5 };
  return {
    id,
    fixtureId: `${id}:diagram`,
    words,
    window,
    raw: {
      kind: id === 'OP-23' ? 'business-replication' : 'business-blueprint',
      preset: PRESETS[id],
      visualMode: 'diagram',
      label: 'Atlas',
      subject: 'Atlas',
      outcome,
      evidence: 'source-stated',
      ...(condition ? { condition } : {}),
      startWord: window.startWord,
      endWord: window.endWord,
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
const offer = 'Atlas offers Repair.';
function service(s: CommercialFixtureSource): Rec {
  return {
    business: s.identity('atlas', 'Atlas', offer),
    service: s.identity('repair', 'Repair', offer),
  };
}
const payroll = 'Atlas handles Payroll for Repair.';
const docket = 'Whether Atlas handles Docket for Repair is unknown.';
const backOffice = makeCommercialSourceFixture(
  'OP-17',
  [
    `Atlas has a back office. ${offer}`,
    payroll,
    docket,
    'Support is checked separately.',
    'Support stays separately stated.',
  ],
  (s) => ({
    ...service(s),
    tasks: [
      {
        task: s.identity('payroll', 'Payroll', payroll),
        state: 'source-stated',
        source: s.span(payroll),
      },
      { task: s.identity('docket', 'Docket', docket), state: 'unknown', source: s.span(docket) },
    ],
  }),
);
const reserve = 'Atlas reserves 2 slots for Repair during July per 10 clients.';
const use = 'Atlas uses 1 slots for Repair during July per 10 clients.';
const availability = "Atlas's available slots for Repair are unknown.";
const slots = makeCommercialSourceFixture(
  'OP-19',
  [offer, reserve, use, availability, 'Measurements remain separate.'],
  (s) => {
    const quantity = (count: number, text: string): Rec => ({
      state: 'source-stated',
      count,
      source: s.span(text),
      basis: {
        subjectId: 'atlas',
        unit: 'slots',
        population: 'clients',
        period: 'July',
        denominator: 10,
        source: s.span(text),
      },
    });
    return {
      ...service(s),
      reserved: quantity(2, reserve),
      used: quantity(1, use),
      available: { state: 'unknown', count: null, basis: null, source: s.span(availability) },
    };
  },
);
const lead = 'Atlas received Inquiry as a lead for Repair.';
const booking = 'Atlas booked Reservation for Repair.';
const delivery = 'Atlas has Package pending as a delivery for Repair.';
const lifecycle = makeCommercialSourceFixture(
  'OP-20',
  [offer, lead, booking, delivery, 'Stages remain separate.'],
  (s) => ({
    ...service(s),
    lead: {
      identity: s.identity('inquiry', 'Inquiry', lead),
      state: 'observed',
      source: s.span(lead),
    },
    booking: {
      identity: s.identity('reservation', 'Reservation', booking),
      state: 'observed',
      source: s.span(booking),
    },
    delivery: {
      identity: s.identity('package', 'Package', delivery),
      state: 'pending',
      source: s.span(delivery),
    },
  }),
);
const ownerSetup = 'Atlas is a business. Ada is the founder. Payroll is a task.';
const dependency = "Atlas's Payroll depends on Ada.";
const owner = makeCommercialSourceFixture(
  'OP-21',
  [
    ownerSetup,
    dependency,
    'Payroll records stay separate.',
    'The dependency is checked.',
    'Dependency remains stated.',
  ],
  (s) => ({
    business: s.identity('atlas', 'Atlas', 'Atlas is a business.'),
    founder: s.identity('ada', 'Ada', 'Ada is the founder.'),
    task: s.identity('payroll', 'Payroll', 'Payroll is a task.'),
    dependency: { state: 'dependent', source: s.span(dependency) },
  }),
);
const intake = 'Atlas includes Intake in Repair.';
const support = 'Atlas includes Support in Repair.';
const agreement = 'If approved, Intake will be compatible with Support.';
const modules = makeCommercialSourceFixture(
  'OP-22',
  [
    offer,
    `${intake} ${support}`,
    agreement,
    'Module records stay separate.',
    'Modules remain separate.',
  ],
  (s) => ({
    ...service(s),
    modules: [s.identity('intake', 'Intake', intake), s.identity('support', 'Support', support)],
    compatibility: [
      {
        leftModuleId: 'intake',
        rightModuleId: 'support',
        state: 'conditional',
        source: s.span(agreement),
      },
    ],
    repeatedOffering: null,
  }),
  'If approved',
);
const standard = 'Atlas uses Guide as its shared standard.';
const north = 'Atlas includes North as a local unit.';
const south = 'Atlas includes South as a local unit.';
const northUse = 'North uses Guide at Atlas.';
const southUse = "South's use of Guide at Atlas is pending.";
const northContext = 'North has Early hours as its local context at Atlas.';
const southContext = "South's local context Late hours at Atlas is unknown.";
const replication = makeCommercialSourceFixture(
  'OP-23',
  [
    `${standard} ${north} ${south}`,
    northUse,
    southUse,
    `${northContext} ${southContext}`,
    'Local contexts remain distinct.',
  ],
  (s) => ({
    business: s.identity('atlas', 'Atlas', standard),
    standard: s.identity('guide', 'Guide', standard),
    units: [
      {
        identity: s.identity('north', 'North', north),
        standardUse: { state: 'observed', source: s.span(northUse) },
        localDifference: {
          label: 'Early hours',
          state: 'source-stated',
          source: s.span(northContext),
        },
      },
      {
        identity: s.identity('south', 'South', south),
        standardUse: { state: 'pending', source: s.span(southUse) },
        localDifference: { label: 'Late hours', state: 'unknown', source: s.span(southContext) },
      },
    ],
  }),
);

export const COMMERCIAL_RAW_FIXTURES: readonly CommercialSourceFixture[] = [
  backOffice,
  slots,
  lifecycle,
  owner,
  modules,
  replication,
];
/** Every declared mode uses the exact same RAW facts, word indices and full window. */
export const COMMERCIAL_SOURCE_FIXTURES: readonly CommercialSourceFixture[] =
  COMMERCIAL_RAW_FIXTURES.flatMap((fixture) => {
    const recipe = BUSINESS_RECIPES.find((entry) => entry.id === fixture.id);
    if (!recipe || recipe.owner !== 'commercial' || recipe.preset !== fixture.raw.preset)
      throw new Error(`Missing commercial catalog recipe ${fixture.id}`);
    return recipe.modes.map((visualMode) => ({
      ...fixture,
      fixtureId: `${fixture.id}:${visualMode}`,
      raw: { ...fixture.raw, visualMode },
    }));
  });

export function parseCommercialFixture(fixture: CommercialSourceFixture): {
  scene: CommercialScene | null;
  issues: string[];
} {
  const ctx = makeParseContext(fixture.words, fixture.window);
  const scene =
    fixture.raw.kind === 'business-replication'
      ? parseBusinessReplication(fixture.raw, ctx)
      : parseBusinessBlueprint(fixture.raw, ctx);
  return { scene, issues: ctx.issues };
}
