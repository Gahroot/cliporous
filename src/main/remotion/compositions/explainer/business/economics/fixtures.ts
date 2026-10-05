import {
  makeParseContext,
  type PlannerWord,
  type Rec,
} from '../../../../../ai/explainer/kind-spec';
import type { BusinessRecipeId, BusinessWordSpan } from '../types';
import type { EconomicsRecipeId, EconomicsState } from './types';

export interface EconomicsSourceFixture {
  id: BusinessRecipeId;
  raw: Rec;
  words: PlannerWord[];
}
export interface EconomicsSourceNegative {
  recipeId: BusinessRecipeId;
  name: string;
  fixture: { raw: Rec; words: PlannerWord[] };
}
interface BasisInput {
  unit: string;
  period: string;
  population?: string;
  denominator?: number | null;
}
/** Invented speech, not an evaluation of a real business. Every sentence has its own span. */
class Speech {
  private phases: string[][] = [[], [], [], [], []];
  private spans: { phase: number; source: BusinessWordSpan }[] = [];
  constructor(
    readonly business: string,
    readonly activity: string,
  ) {}
  say(phase: number, sentence: string): BusinessWordSpan {
    const tokens = sentence.split(/\s+/u);
    const source = {
      fromWord: this.phases[phase].length,
      toWord: this.phases[phase].length + tokens.length - 1,
    };
    this.phases[phase].push(...tokens);
    this.spans.push({ phase, source });
    return source;
  }
  identity(label: string, role: string) {
    return { id: label.toLowerCase(), label, source: this.say(0, `${label} is ${role}.`) };
  }
  quantity(
    metric: string,
    value: number | null,
    b: BasisInput,
    options: {
      money?: boolean;
      state?: EconomicsState;
      verb?: string;
      condition?: string;
    } = {},
  ) {
    const state = options.state ?? (value === null ? 'unknown' : 'source-stated');
    const verb = options.verb ?? 'records';
    const population = b.population ?? 'clients',
      denominator = b.denominator === undefined ? 4 : b.denominator;
    const amount =
      value === null ? `unknown ${b.unit}` : `${options.money ? value / 100 : value} ${b.unit}`;
    const ending =
      denominator === null
        ? `with unknown ${population} denominator`
        : `per ${denominator} ${population}`;
    const body = `${this.business} ${state === 'negative' ? `does not ${verb === 'quotes' ? 'quote' : 'record'}` : verb} ${metric} ${amount} for ${this.activity} during ${b.period} ${ending}.`;
    const prefix = options.condition ? `${options.condition}, ` : '';
    const source = this.say(2, `${prefix}${body}`);
    const basisSource = options.condition
      ? { fromWord: source.fromWord + prefix.trim().split(/\s+/u).length, toWord: source.toWord }
      : source;
    if (options.condition) this.spans.push({ phase: 2, source: basisSource });
    return {
      state,
      ...(options.money
        ? { money: value === null ? null : { minorUnits: value, currency: b.unit } }
        : { count: value }),
      basis: {
        subjectId: this.business.toLowerCase(),
        population,
        unit: b.unit,
        period: b.period,
        denominator,
        source: basisSource,
      },
      source,
    };
  }
  money(
    metric: string,
    minor: number | null,
    period = 'July',
    extra: Partial<BasisInput> = {},
    options: Parameters<Speech['quantity']>[3] = {},
  ) {
    return this.quantity(
      metric,
      minor,
      { unit: 'USD', period, ...extra },
      { ...options, money: true },
    );
  }
  count(
    metric: string,
    count: number | null,
    unit = 'tasks',
    period = 'July',
    extra: Partial<BasisInput> = {},
    options: Parameters<Speech['quantity']>[3] = {},
  ) {
    return this.quantity(metric, count, { unit, period, ...extra }, options);
  }
  finish(
    id: EconomicsRecipeId,
    kind: string,
    preset: string,
    details: Rec,
    asset: string | null,
    carrierSentence?: string,
  ): EconomicsSourceFixture {
    const carrier = asset
      ? {
          asset,
          source: this.say(
            1,
            carrierSentence ?? `${this.business} uses ${this.activity} as an operating record.`,
          ),
        }
      : null;
    this.say(1, `${this.business} opens the records.`);
    this.say(3, `${this.business} checks the bases.`);
    const outcome = `${this.business} keeps records distinct`;
    const resolve = this.say(4, `${outcome}.`);
    // Real spoken tail, not extra ParseContext padding. Resolve remains visible
    // while the final sentence is spoken through 11.3 seconds.
    this.say(4, `${this.business} retains the stated labels.`);
    const offsets: number[] = [];
    let offset = 0;
    for (const phase of this.phases) {
      offsets.push(offset);
      offset += phase.length;
    }
    for (const entry of this.spans) {
      entry.source.fromWord += offsets[entry.phase];
      entry.source.toWord += offsets[entry.phase];
    }
    const ranges = [
      [0.3, 0.85],
      [1.05, 1.85],
      [2.1, 5.5],
      [6.0, 8.0],
      [9.7, 11.3],
    ];
    const words: PlannerWord[] = this.phases.flatMap((tokens, phase) =>
      tokens.map((text, index) => {
        const [start, end] = ranges[phase],
          step = (end - start) / tokens.length;
        return { text, start: start + index * step, end: start + (index + 1) * step };
      }),
    );
    const raw: Rec = {
      kind,
      preset,
      visualMode: 'diagram',
      evidence: 'source-stated',
      label: 'records distinct',
      subject: this.business,
      outcome,
      startWord: 0,
      endWord: words.length - 1,
      layout: 'stack',
      setupWord: offsets[0],
      actionWord: offsets[1],
      responseWord: offsets[2],
      checkWord: offsets[3],
      resolveWord: offsets[4],
      factEvidence: { state: 'source-stated', label: outcome, source: resolve },
      carrier,
      ...details,
    };
    // JSON payloads are trees, not object-identity graphs with shared source objects.
    return { id, words, raw: JSON.parse(JSON.stringify(raw)) };
  }
}
function perOutcome(): EconomicsSourceFixture {
  const s = new Speech('Nori', 'Repair');
  const business = s.identity('Nori', 'a business'),
    activity = s.identity('Repair', 'a task');
  const compute = s.identity('Compute', 'a cost component'),
    review = s.identity('Review', 'a cost component'),
    retry = s.identity('Retry', 'a cost component');
  return s.finish(
    'OP-33',
    'operating-cost',
    'per-outcome',
    {
      business,
      activity,
      components: [
        { identity: compute, cost: s.money('Compute cost', 6000) },
        { identity: review, cost: s.money('Review cost', 3000) },
        { identity: retry, cost: s.money('Retry cost', 1000) },
      ],
      total: s.money('total cost', 10000),
      resolved: s.count('resolved output', 4),
      perOutcome: s.money('per resolved task cost', 2500),
    },
    'A-04',
  );
}
function fixedVariable(): EconomicsSourceFixture {
  const s = new Speech('Tavi', 'Wash');
  const business = s.identity('Tavi', 'a business'),
    activity = s.identity('Wash', 'a service');
  const fixed = s.identity('Base', 'a fixed component'),
    variable = s.identity('Supply', 'a variable component');
  const small = s.identity('Small', 'a source sample'),
    large = s.identity('Large', 'a source sample');
  const samples = [
    {
      identity: small,
      output: s.count('Small output', 4, 'jobs'),
      fixedCost: s.money('Small Base fixed cost', 2000),
      variableCost: s.money('Small Supply variable cost', 3000),
      total: s.money('Small total cost', 5000),
    },
    {
      identity: large,
      output: s.count('Large output', 8, 'jobs'),
      fixedCost: s.money('Large Base fixed cost', 2000),
      variableCost: s.money('Large Supply variable cost', 4500),
      total: s.money('Large total cost', 6500),
    },
  ];
  return s.finish(
    'OP-34',
    'scale-economics',
    'fixed-variable',
    { business, activity, fixed, variable, samples },
    'A-02',
    'Tavi uses Wash as a service station.',
  );
}
function outputStaffing(): EconomicsSourceFixture {
  const s = new Speech('Miro', 'Sorting');
  const business = s.identity('Miro', 'a business'),
    activity = s.identity('Sorting', 'a task');
  const amber = s.identity('Amber', 'a source sample'),
    slate = s.identity('Slate', 'a source sample');
  const alternativesSource = s.say(1, 'Miro lists Amber versus Slate as alternatives for Sorting.');
  return s.finish(
    'OP-36',
    'scale-economics',
    'output-staffing',
    {
      business,
      activity,
      alternativesSource,
      samples: [
        {
          identity: amber,
          output: s.count('Amber output', 12, 'jobs'),
          staffing: s.count('Amber staffing', 3, 'workers'),
        },
        {
          identity: slate,
          output: s.count('Slate output', 16, 'jobs'),
          staffing: s.count('Slate staffing', 4, 'workers'),
        },
      ],
    },
    'A-02',
    'Miro uses Sorting as an explicit service-station illustration.',
  );
}
function implementation(): EconomicsSourceFixture {
  const s = new Speech('Vela', 'Guide');
  const business = s.identity('Vela', 'a business'),
    activity = s.identity('Guide', 'a playbook');
  const setup = s.identity('Setup', 'a recorded period'),
    run = s.identity('Run', 'a recorded period');
  const periods = [
    {
      identity: setup,
      version: 'V1',
      date: 'July-2026',
      source: s.say(1, 'Vela records Guide version V1 for Setup period July dated July-2026.'),
      cost: s.money('Setup implementation cost', 12000),
      output: s.count('Setup observed output', 2),
    },
    {
      identity: run,
      version: 'V2',
      date: '2026-08',
      source: s.say(1, 'Vela records Guide version V2 for Run period August dated 2026-08.'),
      cost: s.money('Run implementation cost', 8000, 'August'),
      output: s.count('Run observed output', 4, 'tasks', 'August'),
    },
  ];
  return s.finish(
    'OP-37',
    'operating-cost',
    'implementation-periods',
    { business, activity, periods },
    'A-07',
    'Vela uses Guide as an implementation playbook.',
  );
}
function pricing(): EconomicsSourceFixture {
  const s = new Speech('Luma', 'Suite');
  const business = s.identity('Luma', 'a business'),
    activity = s.identity('Suite', 'a service');
  const seat = s.identity('Seatplan', 'a quoted offer'),
    token = s.identity('Tokenplan', 'a quoted offer');
  const alternativesSource = s.say(
    1,
    'Luma lists Seatplan versus Tokenplan as alternatives for Suite.',
  );
  return s.finish(
    'OP-38',
    'operating-cost',
    'comparable-pricing-bases',
    {
      business,
      activity,
      alternativesSource,
      offers: [
        {
          identity: seat,
          price: s.money(
            'Seatplan price',
            2000,
            'July',
            { population: 'seats', denominator: 1 },
            { verb: 'quotes' },
          ),
        },
        {
          identity: token,
          price: s.money(
            'Tokenplan price',
            1500,
            'July',
            { population: 'tokens', denominator: 1000 },
            { verb: 'quotes' },
          ),
        },
      ],
    },
    null,
  );
}
function allocation(): EconomicsSourceFixture {
  const s = new Speech('Sora', 'Pool');
  const business = s.identity('Sora', 'a business'),
    activity = s.identity('Pool', 'an allocation record');
  const atlas = s.identity('Atlas', 'an allocation recipient'),
    birch = s.identity('Birch', 'an allocation recipient'),
    cedar = s.identity('Cedar', 'an allocation recipient'),
    retained = s.identity('Retained', 'a remainder component');
  const orderSource = s.say(
    1,
    'Sora lists Atlas followed by Birch followed by Cedar followed by Retained as ordered allocations for Pool.',
  );
  return s.finish(
    'OP-39',
    'value-capture',
    'source-stated-allocation',
    {
      business,
      activity,
      orderSource,
      total: s.money('allocation total', 10000),
      allocations: [
        {
          identity: atlas,
          amount: s.money('Atlas allocation', 4000, 'July', {}, { verb: 'allocates' }),
        },
        {
          identity: birch,
          amount: s.money('Birch allocation', 2500, 'July', {}, { verb: 'allocates' }),
        },
        {
          identity: cedar,
          amount: s.money('Cedar allocation', 1500, 'July', {}, { verb: 'allocates' }),
        },
      ],
      remainder: { identity: retained, amount: s.money('Retained retained remainder', 2000) },
    },
    'A-10',
    'Sora records Pool allocations in four trays.',
  );
}
function accounting(): EconomicsSourceFixture {
  const s = new Speech('Kiri', 'Ledger');
  const business = s.identity('Kiri', 'a business'),
    activity = s.identity('Ledger', 'an operating record');
  const service = s.identity('Service', 'a stated cost component');
  return s.finish(
    'OP-40',
    'operating-cost',
    'accounting-bases',
    {
      business,
      activity,
      revenue: { accounting: 'accrual', fact: s.money('accrual revenue', 10000) },
      costs: [{ identity: service, cost: s.money('accrual Service stated cost', 3000) }],
      statedCostRemainder: s.money('accrual stated-cost remainder', 7000),
      profit: { accounting: 'net', fact: s.money('net profit', 1000) },
      cash: { accounting: 'received', fact: s.money('received cash', 2000) },
      receivable: s.money('receivable', 8000),
    },
    'A-04',
  );
}
export const ECONOMICS_SOURCE_FIXTURES: readonly EconomicsSourceFixture[] = [
  perOutcome(),
  fixedVariable(),
  outputStaffing(),
  implementation(),
  pricing(),
  allocation(),
  accounting(),
];
export function economicsFixtureContext(fixture: Pick<EconomicsSourceFixture, 'raw' | 'words'>) {
  const startWord = Number(fixture.raw.startWord),
    endWord = Number(fixture.raw.endWord);
  return makeParseContext(fixture.words, {
    startWord,
    endWord,
    startTime: Math.max(0, fixture.words[startWord].start - 0.25),
    endTime: fixture.words[endWord].end + 0.35,
  });
}
export function cloneEconomicsFixture(id: BusinessRecipeId): EconomicsSourceFixture {
  const found = ECONOMICS_SOURCE_FIXTURES.find((fixture) => fixture.id === id);
  if (!found) throw new Error(`Missing authored economics fixture ${id}`);
  return structuredClone(found);
}
/** Mutate actual speech without changing indices or source time, for precise source swaps. */
export function replaceEconomicsWords(
  fixture: { words: PlannerWord[] },
  source: BusinessWordSpan,
  from: string,
  to: string,
): void {
  for (let index = source.fromWord; index <= source.toWord; index++)
    fixture.words[index].text = fixture.words[index].text.replace(from, to);
}
function negative(
  id: EconomicsRecipeId,
  name: string,
  mutate: (fixture: EconomicsSourceFixture) => void,
): EconomicsSourceNegative {
  const fixture = cloneEconomicsFixture(id);
  mutate(fixture);
  return { recipeId: id, name, fixture: { raw: fixture.raw, words: fixture.words } };
}
// Dedicated source defects, not merely arbitrary malformed input or renamed labels.
export const ECONOMICS_SOURCE_NEGATIVES: readonly EconomicsSourceNegative[] = [
  negative('OP-33', 'review actor swapped despite all labels existing', (f) => {
    const entry = (f.raw.components as { cost: { source: BusinessWordSpan } }[])[1];
    replaceEconomicsWords(f, entry.cost.source, 'Nori', 'Retry');
  }),
  negative('OP-34', 'variable cost attributed to fixed component', (f) => {
    const sample = (f.raw.samples as { variableCost: { source: BusinessWordSpan } }[])[0];
    replaceEconomicsWords(f, sample.variableCost.source, 'Supply', 'Base');
  }),
  negative('OP-36', 'source staffing unit promoted to output jobs', (f) => {
    const sample = (f.raw.samples as { staffing: { source: BusinessWordSpan } }[])[0];
    replaceEconomicsWords(f, sample.staffing.source, 'workers', 'jobs');
  }),
  negative('OP-37', 'revision source belongs to another playbook', (f) => {
    const period = (f.raw.periods as { source: BusinessWordSpan }[])[1];
    replaceEconomicsWords(f, period.source, 'Guide', 'Setup');
  }),
  negative('OP-38', 'one offer uses the other offer source price clause', (f) => {
    const offers = f.raw.offers as { price: unknown }[];
    offers[1].price = structuredClone(offers[0].price);
  }),
  negative('OP-39', 'ordered slots reorder actual allocation identities', (f) => {
    replaceEconomicsWords(f, f.raw.orderSource as BusinessWordSpan, 'Atlas', 'Birch');
  }),
  negative('OP-40', 'receivable promoted to actually received cash', (f) => {
    const cash = f.raw.cash as { fact: unknown };
    cash.fact = structuredClone(f.raw.receivable);
  }),
];
