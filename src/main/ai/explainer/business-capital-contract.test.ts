import { describe, expect, it } from 'vitest';
import {
  CAPITAL_SOURCE_FIXTURES,
  type CapitalSourceFixture,
  capitalClaimAssetFixture,
  capitalDebtFixture,
  capitalFixtureContext,
  capitalOutcomeFixture,
  capitalRightsFixture,
  capitalRoundsFixture,
} from '../../remotion/compositions/explainer/business/capital/fixtures';
import {
  capitalCards,
  capitalPages,
} from '../../remotion/compositions/explainer/business/capital/presentation';
import {
  type CapitalScene,
  capitalIdentities,
} from '../../remotion/compositions/explainer/business/capital/types';
import {
  parseCapitalStructureScene,
  parseEconomicRightsScene,
  parseInvestmentOutcomesScene,
} from './business-capital-contract';
import { MAX_MINOR_UNITS } from './finance-contract';
import { isRec, makeParseContext, type ParseContext, type Rec } from './kind-spec';

function rec(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Expected fixture record');
  return value;
}
function rows(value: unknown): Rec[] {
  if (!Array.isArray(value)) throw new Error('Expected fixture array');
  return value.map(rec);
}
function sourceText(f: CapitalSourceFixture, value: Rec): string {
  const span = rec(value.source);
  if (typeof span.fromWord !== 'number' || typeof span.toWord !== 'number')
    throw new Error('Expected source indices');
  return f.words
    .slice(span.fromWord, span.toWord + 1)
    .map((w) => w.text)
    .join(' ');
}
/** Replace an actual local source clause as well as raw data; keep all indexed beats intact. */
function sourceReplace(
  f: CapitalSourceFixture,
  value: Rec,
  before: string,
  after: string,
  label = false,
) {
  const span = rec(value.source);
  if (typeof span.fromWord !== 'number') throw new Error('Expected source index');
  const text = sourceText(f, value);
  if (!text.includes(before)) throw new Error(`Missing source text: ${before}`);
  const replacement = text.replace(before, after).split(/\s+/u);
  if (replacement.length !== text.split(/\s+/u).length)
    throw new Error('Source replacement must preserve word indices');
  replacement.forEach((word, position) => {
    f.words[Number(span.fromWord) + position].text = word;
  });
  if (label) value.label = replacement.join(' ').replace(/[.]$/u, '');
}
function parse(f: CapitalSourceFixture, ctx = capitalFixtureContext(f)): CapitalScene | null {
  if (f.id === 'OP-57' || f.id === 'OP-64') return parseEconomicRightsScene(f.raw, ctx);
  if (f.id === 'OP-59') return parseInvestmentOutcomesScene(f.raw, ctx);
  return parseCapitalStructureScene(f.raw, ctx);
}
function accepted(f: CapitalSourceFixture): CapitalScene {
  const ctx = capitalFixtureContext(f),
    result = parse(f, ctx);
  expect(result, ctx.issues.join('; ')).not.toBeNull();
  if (!result) throw new Error(ctx.issues.join('; '));
  return result;
}
function rejected(f: CapitalSourceFixture, ctx = capitalFixtureContext(f)): void {
  let result: CapitalScene | null = null;
  expect(() => {
    result = parse(f, ctx);
  }).not.toThrow();
  expect(result).toBeNull();
}
function freeze(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
}
const positiveOutcomes = () =>
  capitalOutcomeFixture({
    outcomes: [
      { label: 'Gain', measure: 'proceeds', minor: 10501 },
      { label: 'Loss', measure: 'loss', minor: 2501 },
    ],
  });
const distribution = () =>
  capitalOutcomeFixture({
    mode: 'distribution',
    outcomes: [
      { label: 'Gain', measure: 'return', minor: 5000, numerator: 1 },
      { label: 'Loss', measure: 'loss', minor: 2000, numerator: 3 },
    ],
  });

describe('CAPITAL accepted financial variants and source invariants', () => {
  for (const fixture of CAPITAL_SOURCE_FIXTURES) {
    it(`${fixture.id}: accepts every declared mode, never changes immutable source facts`, () => {
      const snapshot = structuredClone(fixture);
      const diagram = structuredClone(fixture);
      freeze(diagram.raw);
      freeze(diagram.words);
      const d = accepted(diagram);
      if (fixture.id === 'OP-59') {
        const hybrid = structuredClone(fixture);
        hybrid.raw.visualMode = 'hybrid';
        rejected(hybrid);
      } else {
        const hybrid = structuredClone(fixture);
        hybrid.raw.visualMode = 'hybrid';
        freeze(hybrid.raw);
        freeze(hybrid.words);
        const h = accepted(hybrid);
        const { visualMode: dMode, ...dFacts } = d,
          { visualMode: hMode, ...hFacts } = h;
        expect([dMode, hMode]).toEqual(['diagram', 'hybrid']);
        expect(hFacts).toEqual(dFacts);
        expect(capitalIdentities(h)).toEqual(capitalIdentities(d));
      }
      expect(fixture).toEqual(snapshot);
      expect(diagram).toEqual(snapshot);
    });
  }
  for (const options of [
    { payout: 10501, control: 'source-stated', priority: 'source-stated' },
    { payout: 0, control: 'unknown', priority: 'unknown' },
    { payout: null, payoutState: 'negative', control: 'negative', priority: 'unknown' },
  ] as const)
    it(`rights preserve independent ${options.control} control / ${options.priority} priority / ${options.payout} payout`, () => {
      const scene = accepted(capitalRightsFixture(options));
      if (scene.kind !== 'economic-rights' || scene.preset !== 'ownership-versus-claims')
        throw new Error('Wrong scene');
      expect(scene.ownership).toMatchObject({ shares: 40, total: 100, percent: 40 });
      expect(scene.control.state).toBe(options.control);
      expect(scene.priority.state).toBe(options.priority);
      expect(scene.payout.money?.minorUnits ?? null).toBe(options.payout);
      expect(scene.payout.state).toBe(options.payout === null ? 'negative' : 'source-stated');
    });
  for (const transfer of ['source-stated', 'unknown', 'negative', 'conditional'] as const)
    it(`claim ${transfer} transfer preserves separately unknown underlying liquidity`, () => {
      const scene = accepted(capitalClaimAssetFixture({ transfer }));
      if (scene.kind !== 'economic-rights' || scene.preset !== 'claim-asset-distinction')
        throw new Error('Wrong scene');
      expect(scene.transfer.state).toBe(transfer);
      expect(scene.liquidity.state).toBe('unknown');
      expect(Boolean(scene.condition)).toBe(transfer === 'conditional');
      expect(scene.transfer.label).toContain('Pref');
      expect(scene.liquidity.label).toContain('Atlas');
    });
  it('liquid and illiquid underlying assets each require their own explicit source, independent of claim transfer', () => {
    for (const liquidity of ['source-stated', 'negative'] as const) {
      const scene = accepted(capitalClaimAssetFixture({ transfer: 'negative', liquidity }));
      if (scene.kind !== 'economic-rights' || scene.preset !== 'claim-asset-distinction')
        throw new Error('Wrong scene');
      expect(scene.transfer.state).toBe('negative');
      expect(scene.liquidity.state).toBe(liquidity);
    }
  });
  for (const mode of ['alternatives', 'samples'] as const)
    it(`financial ${mode}: source proceeds and explicit loss magnitude keep exact cents and equal complete geometry`, () => {
      const fixture = positiveOutcomes();
      fixture.raw.setMode = mode;
      if (mode === 'samples') {
        const e = rec(fixture.raw.setEvidence);
        sourceReplace(fixture, e, 'alternatives', 'samples');
        e.label = 'financial samples';
      }
      const scene = accepted(fixture);
      if (scene.kind !== 'investment-outcomes') throw new Error('Wrong scene');
      expect(
        scene.outcomes.map((o) => [o.measure, o.amount.money?.minorUnits, o.probability]),
      ).toEqual([
        ['proceeds', 10501, null],
        ['loss', 2501, null],
      ]);
      const pages = capitalPages(scene);
      expect(pages).toHaveLength(1);
      expect(pages[0].cards[0].width).toBe(pages[0].cards[1].width);
      expect(pages[0].cards[0].height).toBe(pages[0].cards[1].height);
      expect(capitalCards(scene)[1].lines.some((l) => l.text.includes('loss direction'))).toBe(
        true,
      );
    });
  it('bounded supplied discrete probabilities bind outcome/cohort/period and sum exactly to the common denominator', () => {
    const scene = accepted(distribution());
    if (scene.kind !== 'investment-outcomes') throw new Error('Wrong scene');
    expect(
      scene.outcomes.map(
        (o) => o.probability && [o.probability.numerator, o.probability.denominator],
      ),
    ).toEqual([
      [1, 4],
      [3, 4],
    ]);
    expect(scene.outcomes.map((o) => o.amount.money?.minorUnits)).toEqual([5000, 2000]);
    expect(
      scene.outcomes.every(
        (o) => o.amount.basis.population === 'investments' && o.amount.basis.period === 'July',
      ),
    ).toBe(true);
  });
  it('zero source probability is not omitted, smoothed or converted into a winner', () => {
    const scene = accepted(
      capitalOutcomeFixture({
        mode: 'distribution',
        outcomes: [
          { label: 'Flat', measure: 'proceeds', minor: 0, numerator: 0 },
          { label: 'Loss', measure: 'loss', minor: 100, numerator: 4 },
        ],
      }),
    );
    if (scene.kind !== 'investment-outcomes') throw new Error('Wrong scene');
    expect(scene.outcomes[0].amount.money?.minorUnits).toBe(0);
    expect(scene.outcomes[0].probability?.numerator).toBe(0);
    expect(capitalPages(scene)[0].cards[0].width).toBe(capitalPages(scene)[0].cards[1].width);
  });
  for (const statuses of [
    ['issued', 'issued'],
    ['issued', 'conditional'],
    ['pending', 'pending'],
    ['conditional'],
  ] as const)
    it(`round source arithmetic: ${statuses.join(' / ')} preserves current versus contingent denominators`, () => {
      const scene = accepted(capitalRoundsFixture({ statuses: [...statuses] }));
      if (scene.kind !== 'capital-structure' || scene.preset !== 'conditional-rounds')
        throw new Error('Wrong scene');
      expect(scene.ownership.total).toBe(100);
      expect(scene.rounds[0]).toMatchObject({
        beforeTotal: 100,
        afterTotal: 120,
        beforePercent: 40,
        afterPercent: 33.33,
      });
      if (scene.rounds.length === 2)
        expect(scene.rounds[1].beforeTotal).toBe(statuses[0] === 'issued' ? 120 : 100);
      for (const round of scene.rounds) {
        expect(round.commitment.state).toBe(
          round.status === 'issued' ? 'source-stated' : round.status,
        );
        expect(round.commitment.money).toEqual({ currency: 'USD', minorUnits: 10000 });
        expect(round.shareBasis.denominator).toBe(round.beforeTotal);
      }
    });
  for (const options of [
    { principal: null, commissioned: null },
    { installed: null, commissioned: null },
    { installed: 8, commissioned: 8 },
  ] as const)
    it(`source debt/capacity variant ${JSON.stringify(options)}`, () => {
      const scene = accepted(capitalDebtFixture(true, options));
      if (scene.kind !== 'capital-structure' || scene.preset !== 'financing-versus-capacity')
        throw new Error('Wrong scene');
      expect(scene.installed.basis.unit).toBe('racks');
      expect(scene.obligations[0].principal.basis.unit).toBe('USD');
      expect(scene.commissioned.count).toBe(options.commissioned);
      if ('principal' in options) expect(scene.obligations[0].principal.money).toBeNull();
      if ('installed' in options) expect(scene.installed.count).toBe(options.installed);
    });
  it('unknown debt amounts, unknown asset duration and explicit asset liquidity remain independent of supplied maturity dates', () => {
    const scene = accepted(
      capitalDebtFixture(false, { principal: null, durationUnknown: true, liquid: true }),
    );
    if (scene.kind !== 'capital-structure' || scene.preset !== 'obligations-and-maturity')
      throw new Error('Wrong scene');
    expect(scene.obligations.map((o) => [o.principal.money, o.maturity])).toEqual([
      [null, '2030-06-30'],
      [null, '2031-06-30'],
    ]);
    expect(scene.duration.state).toBe('unknown');
    expect(scene.liquidity.state).toBe('source-stated');
  });
});

type Mutation = (f: CapitalSourceFixture) => void;
const commonNegatives: [string, Mutation][] = [
  [
    'unknown root field / arbitrary geometry',
    (f) => {
      f.raw.geometry = { type: 'mesh', radius: 10 };
    },
  ],
  [
    'non-string layout is rejected without coercion',
    (f) => {
      f.raw.layout = { toString: null };
    },
  ],
  [
    'repeated reference is not a JSON tree',
    (f) => {
      f.raw.alias = f.raw.company;
    },
  ],
  [
    'overlong local source span',
    (f) => {
      rec(f.raw.company).source = { fromWord: 0, toWord: 64 };
    },
  ],
  [
    'executable rendering code',
    (f) => {
      f.raw.code = 'new Canvas()';
    },
  ],
  [
    'invented telemetry',
    (f) => {
      f.raw.telemetry = 1;
    },
  ],
  [
    'wrong kind substitution',
    (f) => {
      f.raw.kind = 'operating-cost';
    },
  ],
  [
    'foreign preset relabeling',
    (f) => {
      f.raw.preset = 'shared-driver';
    },
  ],
  [
    'actor label swap',
    (f) => {
      rec(f.raw.company).label = 'Ada';
    },
  ],
  [
    'actor source swap',
    (f) => {
      rec(f.raw.company).source = { fromWord: f.raw.actionWord, toWord: f.raw.responseWord };
    },
  ],
  [
    'unbound period',
    (f) => {
      f.raw.period = 'August';
    },
  ],
  [
    'cropped full window',
    (f) => {
      f.raw.endWord = Number(f.raw.endWord) - 1;
    },
  ],
  [
    'native model without source gate',
    (f) => {
      f.raw.modelSource = { fromWord: f.raw.checkWord, toWord: f.raw.resolveWord };
    },
  ],
  [
    'beat outside source window',
    (f) => {
      f.raw.responseWord = -1;
    },
  ],
  [
    'missing indexed beat',
    (f) => {
      delete f.raw.checkWord;
    },
  ],
  [
    'insufficient ordered beat gaps',
    (f) => {
      f.raw.actionWord = f.raw.setupWord;
    },
  ],
  [
    'nonfinite numeric input',
    (f) => {
      f.raw.setupWord = Number.NaN;
    },
  ],
  [
    'accessor before parser property reads',
    (f) => {
      Object.defineProperty(f.raw, 'kind', {
        enumerable: true,
        get() {
          throw new Error('Accessor invoked');
        },
      });
    },
  ],
  [
    'prototype object',
    (f) => {
      Object.setPrototypeOf(f.raw, { forged: true });
    },
  ],
  [
    'symbol property',
    (f) => {
      Object.defineProperty(f.raw, Symbol('unsupported'), { value: true });
    },
  ],
  [
    'cyclic input',
    (f) => {
      f.raw.cycle = f.raw;
    },
  ],
  [
    'unsupported nested key',
    (f) => {
      rec(f.raw.company).operator = 'phantom';
    },
  ],
  [
    'overlong string',
    (f) => {
      f.raw.label = 'x'.repeat(513);
    },
  ],
  [
    'overdeep input',
    (f) => {
      f.raw.deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    },
  ],
  [
    'oversized array',
    (f) => {
      f.raw.array = Array.from({ length: 13 }, () => 1);
    },
  ],
  [
    'sparse array',
    (f) => {
      f.raw.array = Array(2);
    },
  ],
];
describe('all six CAPITAL routes reject unsafe or unbound payloads before dispatch/property reads', () => {
  for (const original of CAPITAL_SOURCE_FIXTURES)
    for (const [name, mutate] of commonNegatives)
      it(`${original.id}: ${name}`, () => {
        const fixture = structuredClone(original);
        mutate(fixture);
        rejected(fixture);
      });
  for (const original of CAPITAL_SOURCE_FIXTURES)
    it(`${original.id}: bounded first enforces UTF-8 byte and node budgets (not just an unknown-key fallback)`, () => {
      const bytes = structuredClone(original);
      bytes.raw.big = Array.from({ length: 12 }, () => '界'.repeat(512));
      const ctx = capitalFixtureContext(bytes);
      rejected(bytes, ctx);
      expect(ctx.issues.join(' ')).toContain('serialized byte budget');
      const nodes = structuredClone(original);
      nodes.raw.big = Array.from({ length: 12 }, () =>
        Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => 0)),
      );
      const nodeCtx = capitalFixtureContext(nodes);
      rejected(nodes, nodeCtx);
      expect(nodeCtx.issues.join(' ')).toContain('node/depth budget');
    });
});

function cases(
  title: string,
  factory: () => CapitalSourceFixture,
  mutations: [string, Mutation][],
) {
  describe(title, () => {
    for (const [name, mutate] of mutations)
      it(name, () => {
        const f = factory();
        mutate(f);
        rejected(f);
      });
  });
}
cases(
  'OP-57 shares, control, claims, priority and payout are separately bound',
  () => capitalRightsFixture({ payout: 10001 }),
  [
    [
      'claim source swap',
      (f) => {
        rec(f.raw.claimEvidence).source = structuredClone(rec(f.raw.control).source);
      },
    ],
    [
      'claim holder swap in actual source',
      (f) => {
        sourceReplace(f, rec(f.raw.claimEvidence), 'Ada', 'Lumen');
      },
    ],
    [
      'claim target swap in actual source',
      (f) => {
        sourceReplace(f, rec(f.raw.claimEvidence), 'Pref', 'Other');
      },
    ],
    [
      'truncated claim label',
      (f) => {
        rec(f.raw.claimEvidence).label = 'Ada';
      },
    ],
    [
      'loss of separately sourced control',
      (f) => {
        delete f.raw.control;
      },
    ],
    [
      'negative control relabeled as actual',
      (f) => {
        rec(f.raw.control).state = 'source-stated';
      },
    ],
    [
      'unknown priority relabeled as legal judgment',
      (f) => {
        rec(f.raw.priority).state = 'source-stated';
      },
    ],
    [
      'amount cents swap',
      (f) => {
        rec(rec(f.raw.payout).money).minorUnits = 10000;
      },
    ],
    [
      'negative shared Money is never allowed',
      (f) => {
        rec(rec(f.raw.payout).money).minorUnits = -10001;
      },
    ],
    [
      'currency swap',
      (f) => {
        rec(rec(f.raw.payout).money).currency = 'EUR';
      },
    ],
    [
      'unit swap',
      (f) => {
        rec(rec(f.raw.payout).basis).unit = 'shares';
      },
    ],
    [
      'population swap',
      (f) => {
        rec(rec(f.raw.payout).basis).population = 'investments';
      },
    ],
    [
      'period swap',
      (f) => {
        rec(rec(f.raw.payout).basis).period = 'August';
      },
    ],
    [
      'denominator swap',
      (f) => {
        rec(rec(f.raw.payout).basis).denominator = 5;
      },
    ],
    [
      'ownership share denominator swap',
      (f) => {
        rec(rec(f.raw.ownership).basis).denominator = 120;
      },
    ],
    [
      'ownership percent not exact rounded share arithmetic',
      (f) => {
        rec(f.raw.ownership).percent = 39.99;
      },
    ],
    [
      'money exceeds existing cap',
      (f) => {
        rec(rec(f.raw.payout).money).minorUnits = MAX_MINOR_UNITS + 1;
      },
    ],
    [
      'cropped payout actor clause',
      (f) => {
        rec(rec(f.raw.payout).source).fromWord = Number(rec(rec(f.raw.payout).source).fromWord) + 1;
      },
    ],
  ],
);
cases(
  'OP-64 transferable claim does not establish liquid underlying asset',
  capitalClaimAssetFixture,
  [
    [
      'omitted full source condition',
      (f) => {
        delete f.raw.condition;
      },
    ],
    [
      'cropped source condition',
      (f) => {
        f.raw.condition = 'If Atlas';
      },
    ],
    [
      'foreign actor condition',
      (f) => {
        f.raw.condition = 'If Ada consents';
      },
    ],
    [
      'conditional transfer relabeled as observed',
      (f) => {
        rec(f.raw.transfer).state = 'source-stated';
      },
    ],
    [
      'transfer evidence substituted for liquidity',
      (f) => {
        rec(f.raw.liquidity).source = structuredClone(rec(f.raw.transfer).source);
      },
    ],
    [
      'unknown liquidity relabeled liquid',
      (f) => {
        rec(f.raw.liquidity).state = 'source-stated';
      },
    ],
    [
      'conditional clause stripped from source span',
      (f) => {
        const transfer = rec(f.raw.transfer);
        const span = rec(transfer.source);
        span.fromWord = Number(span.fromWord) + 3;
        transfer.label = sourceText(f, transfer).replace(/[.]$/u, '');
      },
    ],
    [
      'conditional transfer operator changed in actual source',
      (f) => {
        sourceReplace(f, rec(f.raw.transfer), 'Ada may', 'Atlas may', true);
      },
    ],
    [
      'partial transfer display label',
      (f) => {
        rec(f.raw.transfer).label = 'Ada may transfer Pref';
      },
    ],
  ],
);
cases(
  'OP-59 financial outcomes are not unsigned cash bars, tasks, forecasts or invented probabilities',
  positiveOutcomes,
  [
    [
      'hybrid forbidden',
      (f) => {
        f.raw.visualMode = 'hybrid';
      },
    ],
    [
      'loss direction relabeled proceeds',
      (f) => {
        rows(f.raw.outcomes)[1].measure = 'proceeds';
      },
    ],
    [
      'gain relabeled loss',
      (f) => {
        rows(f.raw.outcomes)[0].measure = 'loss';
      },
    ],
    [
      'loss source evidence swapped with gain',
      (f) => {
        rec(rows(f.raw.outcomes)[1].amount).source = structuredClone(
          rec(rows(f.raw.outcomes)[0].amount).source,
        );
      },
    ],
    [
      'unknown invented from numeric amount',
      (f) => {
        const q = rec(rows(f.raw.outcomes)[0].amount);
        q.money = null;
        q.state = 'unknown';
      },
    ],
    [
      'partial set label conceals financial set role',
      (f) => {
        rec(f.raw.setEvidence).label = 'Atlas';
      },
    ],
    [
      'negative Money return cannot imply direction',
      (f) => {
        rec(rec(rows(f.raw.outcomes)[0].amount).money).minorUnits = -10501;
      },
    ],
    [
      'orders/tasks population substitution',
      (f) => {
        rec(rec(rows(f.raw.outcomes)[0].amount).basis).population = 'tasks';
      },
    ],
    [
      'identity duplicate',
      (f) => {
        rec(rows(f.raw.outcomes)[1].identity).id = 'gain';
      },
    ],
    [
      'unsupported percent return',
      (f) => {
        rows(f.raw.outcomes)[0].percentReturn = 50;
      },
    ],
    [
      'same currency does not permit denominator conversion',
      (f) => {
        const q = rec(rows(f.raw.outcomes)[1].amount);
        rec(q.basis).denominator = 5;
        sourceReplace(f, q, 'per 4 investments', 'per 5 investments');
      },
    ],
    [
      'same period does not permit FX conversion',
      (f) => {
        const q = rec(rows(f.raw.outcomes)[1].amount);
        rec(q.basis).unit = 'EUR';
        rec(q.money).currency = 'EUR';
        sourceReplace(f, q, 'USD', 'EUR');
      },
    ],
    [
      'same denominator does not permit cohort conversion',
      (f) => {
        const q = rec(rows(f.raw.outcomes)[1].amount);
        rec(q.basis).population = 'funds';
        sourceReplace(f, q, 'investments', 'funds');
      },
    ],
    [
      'unbounded fourth outcome',
      (f) => {
        const outcomes = rows(f.raw.outcomes);
        f.raw.outcomes = [...outcomes, structuredClone(outcomes[0]), structuredClone(outcomes[1])];
      },
    ],
  ],
);
cases(
  'OP-59 supplied probabilities require exact source binding and sum, not approximate calibration',
  distribution,
  [
    [
      'negative probability numerator',
      (f) => {
        rec(rows(f.raw.outcomes)[0].probability).numerator = -1;
      },
    ],
    [
      'probability above denominator',
      (f) => {
        rec(rows(f.raw.outcomes)[0].probability).numerator = 5;
      },
    ],
    [
      'fractional probability count',
      (f) => {
        rec(rows(f.raw.outcomes)[0].probability).numerator = 1.5;
      },
    ],
    [
      'unsafe integer numerator',
      (f) => {
        rec(rows(f.raw.outcomes)[0].probability).numerator = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'nonfinite numerator',
      (f) => {
        rec(rows(f.raw.outcomes)[0].probability).numerator = Number.POSITIVE_INFINITY;
      },
    ],
    [
      'different probability denominator',
      (f) => {
        rec(rows(f.raw.outcomes)[0].probability).denominator = 5;
      },
    ],
    [
      'missing probability for distribution',
      (f) => {
        rows(f.raw.outcomes)[0].probability = null;
      },
    ],
    [
      'swapped outcome probability evidence',
      (f) => {
        rec(rows(f.raw.outcomes)[0].probability).source = structuredClone(
          rec(rows(f.raw.outcomes)[1].probability).source,
        );
      },
    ],
    [
      'wrong probability actor in actual source',
      (f) => {
        sourceReplace(f, rec(rows(f.raw.outcomes)[0].probability), 'Atlas', 'Ada');
      },
    ],
    [
      'wrong probability cohort in actual source',
      (f) => {
        sourceReplace(f, rec(rows(f.raw.outcomes)[0].probability), 'investments', 'funds');
      },
    ],
    [
      'wrong probability period in actual source',
      (f) => {
        sourceReplace(f, rec(rows(f.raw.outcomes)[0].probability), 'July', 'August');
      },
    ],
    [
      'probabilities supplied for qualitative alternatives',
      (f) => {
        f.raw.setMode = 'alternatives';
      },
    ],
  ],
);
it('OP-59 rejects actually supplied probabilities whose exact source counts do not sum (no rounding fix)', () => {
  rejected(
    capitalOutcomeFixture({
      mode: 'distribution',
      outcomes: [
        { label: 'Gain', measure: 'return', minor: 100, numerator: 1 },
        { label: 'Loss', measure: 'loss', minor: 100, numerator: 2 },
      ],
    }),
  );
});
it('OP-59 unknown outcomes cannot be duplicated or assigned probabilities to complete a distribution', () => {
  rejected(
    capitalOutcomeFixture({
      mode: 'distribution',
      outcomes: [
        { label: 'Unknown', measure: 'return', minor: null, numerator: 1 },
        { label: 'Loss', measure: 'loss', minor: 100, numerator: 3 },
      ],
    }),
  );
});
it('OP-59 qualitative unknown and zero remain distinct; neither accepts an invented numeric fill', () => {
  const f = capitalOutcomeFixture();
  const outcomes = rows(f.raw.outcomes);
  const q = rec(outcomes[2].amount);
  q.state = 'source-stated';
  q.money = { currency: 'USD', minorUnits: 0 };
  rejected(f);
});
cases(
  'OP-60 conditional/pending round records preserve complete qualified bodies and exact source share arithmetic',
  capitalRoundsFixture,
  [
    [
      'pending proposal relabeled observed issuance',
      (f) => {
        const r = rows(f.raw.rounds)[0];
        r.status = 'issued';
        rec(r.commitment).state = 'source-stated';
      },
    ],
    [
      'conditional proposal relabeled observed issuance',
      (f) => {
        const r = rows(f.raw.rounds)[1];
        r.status = 'issued';
        rec(r.commitment).state = 'source-stated';
      },
    ],
    [
      'omitted complete condition',
      (f) => {
        delete f.raw.condition;
      },
    ],
    [
      'cropped qualifier',
      (f) => {
        f.raw.condition = 'If board';
      },
    ],
    [
      'cropped source qualifier but retained body',
      (f) => {
        const r = rows(f.raw.rounds)[1],
          body = structuredClone(rec(rec(r.commitment).basis).source);
        r.source = structuredClone(body);
        rec(r.commitment).source = structuredClone(body);
      },
    ],
    [
      'conditional basis uses full qualifier instead of verified modal body',
      (f) => {
        const r = rows(f.raw.rounds)[1];
        rec(rec(r.commitment).basis).source = structuredClone(r.source);
        r.shareBasis = structuredClone(rec(rows(f.raw.rounds)[0].shareBasis));
      },
    ],
    [
      'body actor swap',
      (f) => {
        sourceReplace(f, rows(f.raw.rounds)[1], 'Atlas may', 'Ada may');
      },
    ],
    [
      'different modal body',
      (f) => {
        sourceReplace(f, rows(f.raw.rounds)[1], 'may record', 'will record');
      },
    ],
    [
      'round source version mismatch',
      (f) => {
        rec(rows(f.raw.rounds)[0].identity).version = 'v2';
      },
    ],
    [
      'staged share denominator swap',
      (f) => {
        rec(rows(f.raw.rounds)[1].shareBasis).denominator = 120;
      },
    ],
    [
      'round money denominator swap',
      (f) => {
        rec(rec(rows(f.raw.rounds)[1].commitment).basis).denominator = 2;
      },
    ],
    [
      'round currency swap',
      (f) => {
        rec(rec(rows(f.raw.rounds)[1].commitment).money).currency = 'EUR';
      },
    ],
    [
      'wrong retained holder in source',
      (f) => {
        sourceReplace(f, rows(f.raw.rounds)[1], 'Ada retaining', 'Atlas retaining');
      },
    ],
    [
      'invented post-round total',
      (f) => {
        rows(f.raw.rounds)[1].afterTotal = 121;
      },
    ],
    [
      'incorrect percent rounding',
      (f) => {
        rows(f.raw.rounds)[1].afterPercent = 33.34;
      },
    ],
    [
      'noninteger issuance',
      (f) => {
        rows(f.raw.rounds)[1].issued = 20.5;
      },
    ],
    [
      'unsafe integer issuance',
      (f) => {
        rows(f.raw.rounds)[1].issued = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'duplicate round semantic ID',
      (f) => {
        rec(rec(rows(f.raw.rounds)[1].identity).identity).id = 'seed';
      },
    ],
    [
      'unbounded third round',
      (f) => {
        f.raw.rounds = [...rows(f.raw.rounds), structuredClone(rows(f.raw.rounds)[0])];
      },
    ],
  ],
);
it('OP-60 rejects source-authored share totals beyond existing cap without raising Money/share helper bounds', () => {
  rejected(capitalRoundsFixture({ statuses: ['issued'], total: 1_000_000_000, issuance: 20 }));
});
it('OP-60 a pending first round cannot form an observed denominator for a later conditional round, even with internally correct source arithmetic', () => {
  const f = capitalRoundsFixture(),
    r = rows(f.raw.rounds)[1];
  r.beforeTotal = 120;
  r.afterTotal = 140;
  r.beforePercent = 33.33;
  r.afterPercent = 28.57;
  rec(r.shareBasis).denominator = 120;
  sourceReplace(f, r, 'from 100 to 120 total shares', 'from 120 to 140 total shares');
  sourceReplace(f, r, 'from 40 to 33.33 percent', 'from 33.33 to 28.57 percent');
  sourceReplace(f, r, 'over 100 shares', 'over 120 shares');
  rejected(f);
});
cases(
  'OP-61 debt is independent of physical installed/commissioned capacity',
  () => capitalDebtFixture(),
  [
    [
      'lender swap in maturity source',
      (f) => {
        sourceReplace(f, rows(f.raw.obligations)[0], 'Lumen', 'Ada');
      },
    ],
    [
      'asset identity source substituted for lender',
      (f) => {
        rec(f.raw.lender).source = structuredClone(rec(f.raw.asset).source);
      },
    ],
    [
      'principal source swapped into installed physical count',
      (f) => {
        rec(f.raw.installed).source = structuredClone(
          rec(rows(f.raw.obligations)[0].principal).source,
        );
      },
    ],
    [
      'money unit used for physical capacity',
      (f) => {
        rec(rec(f.raw.installed).basis).unit = 'USD';
      },
    ],
    [
      'money-derived commissioned count',
      (f) => {
        rec(f.raw.commissioned).count = 100;
      },
    ],
    [
      'installed and commissioned evidence swapped',
      (f) => {
        const source = structuredClone(rec(f.raw.installed).source);
        rec(f.raw.installed).source = structuredClone(rec(f.raw.commissioned).source);
        rec(f.raw.commissioned).source = source;
      },
    ],
    [
      'physical basis denominator mismatch',
      (f) => {
        rec(rec(f.raw.commissioned).basis).denominator = 9;
      },
    ],
    [
      'unknown physical state relabeled filled',
      (f) => {
        rec(f.raw.installed).state = 'unknown';
      },
    ],
    [
      'unsupported asset operator label',
      (f) => {
        rec(f.raw.assetEvidence).label = 'Atlas';
      },
    ],
    [
      'duplicate lender/asset ID',
      (f) => {
        rec(f.raw.asset).id = 'lumen';
      },
    ],
    [
      'maturity invented from a beat timestamp',
      (f) => {
        rows(f.raw.obligations)[0].maturity = f.raw.checkWord;
      },
    ],
  ],
);
it('OP-61 an actually stated count of commissioned racks cannot exceed installed racks', () => {
  rejected(capitalDebtFixture(true, { installed: 2, commissioned: 3 }));
});
cases(
  'OP-62 maturities, asset duration and liquidity remain separately sourced text',
  () => capitalDebtFixture(false),
  [
    [
      'maturity source swapped between loans',
      (f) => {
        rows(f.raw.obligations)[0].source = structuredClone(rows(f.raw.obligations)[1].source);
      },
    ],
    [
      'maturity date swapped between loans',
      (f) => {
        rows(f.raw.obligations)[0].maturity = '2031-06-30';
      },
    ],
    [
      'maturity converted to beat field',
      (f) => {
        rows(f.raw.obligations)[0].maturityAt = 3;
      },
    ],
    [
      'amount source swapped with maturity',
      (f) => {
        rec(rows(f.raw.obligations)[0].principal).source = structuredClone(
          rows(f.raw.obligations)[0].source,
        );
      },
    ],
    [
      'duration inferred from debt maturity',
      (f) => {
        rec(f.raw.duration).source = structuredClone(rows(f.raw.obligations)[0].source);
      },
    ],
    [
      'unknown liquidity relabeled liquid',
      (f) => {
        rec(f.raw.liquidity).state = 'source-stated';
      },
    ],
    [
      'liquidity claim targets lender not asset',
      (f) => {
        sourceReplace(f, rec(f.raw.liquidity), 'Warehouse', 'Lumen', true);
      },
    ],
    [
      'unsupported invented refinancing',
      (f) => {
        f.raw.refinancing = true;
      },
    ],
    [
      'principal denominator swap',
      (f) => {
        rec(rec(rows(f.raw.obligations)[0].principal).basis).denominator = 3;
      },
    ],
    [
      'principal reporting-period swap',
      (f) => {
        rec(rec(rows(f.raw.obligations)[0].principal).basis).period = 'August';
      },
    ],
    [
      'principal unit swap',
      (f) => {
        rec(rec(rows(f.raw.obligations)[0].principal).basis).unit = 'racks';
      },
    ],
    [
      'principal exact-cent amount swap',
      (f) => {
        rec(rec(rows(f.raw.obligations)[0].principal).money).minorUnits = 10001;
      },
    ],
    [
      'duplicate obligation ID',
      (f) => {
        rec(rows(f.raw.obligations)[1].identity).id = 'loan';
      },
    ],
    [
      'third obligation exceeds authored cap',
      (f) => {
        f.raw.obligations = [
          ...rows(f.raw.obligations),
          structuredClone(rows(f.raw.obligations)[0]),
        ];
      },
    ],
  ],
);

describe('complete source window and real readable-page holds', () => {
  for (const field of ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord']) {
    it(`rejects nonfinite actual source time at ${field}, not merely nonfinite raw beat indices`, () => {
      const f = capitalRightsFixture();
      f.words[Number(f.raw[field])].start = Number.NaN;
      rejected(f);
    });
  }
  for (const [name, change] of [
    [
      'short duration',
      (ctx: ParseContext) => {
        ctx.win.endTime = ctx.win.startTime + 4.9;
      },
    ],
    [
      'long duration',
      (ctx: ParseContext) => {
        ctx.win.endTime = ctx.win.startTime + 12.1;
      },
    ],
    [
      'insufficient final hold',
      (ctx: ParseContext) => {
        ctx.win.endTime = ctx.at(Number(CAPITAL_SOURCE_FIXTURES[0].raw.resolveWord)) + 0.79;
      },
    ],
  ] as const)
    it(name, () => {
      const f = capitalRightsFixture();
      const ctx = capitalFixtureContext(f);
      change(ctx);
      rejected(f, ctx);
    });
  it('three complete round pages cannot be squeezed into an otherwise valid five-beat window', () => {
    const f = capitalRoundsFixture();
    const starts = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'].map(
      (key) => Number(f.raw[key]),
    );
    const times = [0.3, 1.2, 2.4, 3.5, 4.7],
      ends = [1.1, 2.3, 3.4, 4.6, 5.2];
    starts.forEach((start, phase) => {
      const end = starts[phase + 1] ?? f.words.length;
      for (let index = start; index < end; index++) {
        const step = (ends[phase] - times[phase]) / (end - start);
        f.words[index].start = times[phase] + (index - start) * step;
        f.words[index].end = times[phase] + (index - start + 1) * step;
      }
    });
    const ctx = makeParseContext(f.words, {
      startWord: 0,
      endWord: f.words.length - 1,
      startTime: 0.05,
      endTime: 5.55,
    });
    rejected(f, ctx);
    expect(ctx.issues.join(' ')).toContain('complete fixed-font page budget after handoff');
  });
});
