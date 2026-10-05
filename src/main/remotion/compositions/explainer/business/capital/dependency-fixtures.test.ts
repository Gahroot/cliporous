import { describe, expect, it } from 'vitest';
import {
  boundedBusinessInput,
  businessEvidenceText,
} from '../../../../../ai/explainer/business-contract';
import { isRec, type Rec } from '../../../../../ai/explainer/kind-spec';
import { parsePortfolioExposure } from '../../../../../ai/explainer/kinds-finance';
import type { BusinessWordSpan } from '../types';
import {
  SHARED_DEPENDENCY_SOURCE_FIXTURES,
  type SharedDependencySourceFixture,
  sharedDependencyFixture,
  sharedDependencyFixtureContext,
} from './dependency-fixtures';

function rec(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Expected authored fixture record');
  return value;
}
function firms(fixture: SharedDependencySourceFixture): Rec[] {
  const values = rec(fixture.raw.dependencyLens).firms;
  if (!Array.isArray(values)) throw new Error('Expected two authored firms');
  return values.map(rec);
}
function span(value: unknown): BusinessWordSpan {
  const source = rec(value);
  if (typeof source.fromWord !== 'number' || typeof source.toWord !== 'number')
    throw new Error('Expected word-indexed source');
  return { fromWord: source.fromWord, toWord: source.toWord };
}
function rejected(fixture: SharedDependencySourceFixture): void {
  const ctx = sharedDependencyFixtureContext(fixture);
  let result: ReturnType<typeof parsePortfolioExposure> = null;
  expect(() => {
    result = parsePortfolioExposure(fixture.raw, ctx);
  }).not.toThrow();
  expect(result).toBeNull();
}
function accepted(
  fixture: SharedDependencySourceFixture,
): NonNullable<ReturnType<typeof parsePortfolioExposure>> {
  const ctx = sharedDependencyFixtureContext(fixture);
  const result = parsePortfolioExposure(fixture.raw, ctx);
  expect(result, ctx.issues.join('; ')).not.toBeNull();
  if (!result) throw new Error(ctx.issues.join('; '));
  return result;
}
function freeze(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  Object.values(value).forEach(freeze);
  Object.freeze(value);
}

describe('OP-58 authored source: additive dependency lens, existing portfolio parser', () => {
  it('exports conventional and actual maximum-28-character labels in a bounded 12-second five-phase source tree', () => {
    expect(SHARED_DEPENDENCY_SOURCE_FIXTURES).toHaveLength(2);
    for (const fixture of SHARED_DEPENDENCY_SOURCE_FIXTURES) {
      const ctx = sharedDependencyFixtureContext(fixture);
      expect(fixture.id).toBe('OP-58');
      expect(fixture.raw.kind).toBe('portfolio-exposure');
      expect(fixture.raw.preset).toBe('shared-driver');
      expect(fixture.raw.holdings).toEqual([]);
      expect(boundedBusinessInput(fixture.raw, ctx)).toBe(true);
      expect(ctx.win.endTime - ctx.win.startTime).toBeCloseTo(12, 8);
      const beats = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'].map(
        (key) => Number(fixture.raw[key]),
      );
      expect(beats.every((word, slot) => slot === 0 || word > beats[slot - 1])).toBe(true);
      const fundList = fixture.raw.funds;
      if (!Array.isArray(fundList)) throw new Error('Expected fund list');
      const maximum = fixture === SHARED_DEPENDENCY_SOURCE_FIXTURES[1];
      for (const actor of [
        ...fundList.map(rec),
        ...firms(fixture).map((firm) => rec(firm.identity)),
        rec(fixture.raw.exposure),
      ]) {
        expect(String(actor.label).length).toBeLessThanOrEqual(28);
        if (maximum) expect(String(actor.label)).toHaveLength(28);
      }
      for (const firm of firms(fixture)) {
        const fund = fundList.map(rec).find((f) => f.id === firm.fundId);
        if (!fund) throw new Error('Missing source fund');
        const identity = rec(firm.identity),
          setup = span(identity.source),
          holding = span(firm.holdingSource),
          driver = span(firm.driverSource);
        expect(businessEvidenceText(setup, ctx)).toBe(`${identity.label} is a company.`);
        expect(businessEvidenceText(holding, ctx)).toBe(`${fund.label} holds ${identity.label}.`);
        expect(businessEvidenceText(driver, ctx)).toBe(
          `${identity.label} depends on ${rec(fixture.raw.exposure).label}.`,
        );
        expect(setup.toWord).toBeLessThan(beats[1]);
        expect(holding.fromWord).toBeGreaterThanOrEqual(beats[1]);
        expect(holding.toWord).toBeLessThan(beats[2]);
        expect(driver.fromWord).toBeGreaterThanOrEqual(beats[2]);
        expect(driver.toWord).toBeLessThan(beats[3]);
      }
      expect(businessEvidenceText(span(rec(fixture.raw.dependencyLens).modelSource), ctx)).toBe(
        `${rec(fundList[0]).label} and ${rec(fundList[1]).label} maintain asset ownership and economic claim records.`,
      );
      expect(rec(fixture.raw.dependencyLens)).not.toHaveProperty('finalHoldSeconds');
    }
  });
  for (const [probe, fixture] of SHARED_DEPENDENCY_SOURCE_FIXTURES.entries()) {
    for (const mode of ['diagram', 'hybrid'])
      it(`source probe ${probe} ${mode}: actual optional parser preserves both local paths, full names, native evidence and derived final hold`, () => {
        const copy = structuredClone(fixture);
        copy.raw.visualMode = mode;
        const before = structuredClone(copy);
        freeze(copy.raw);
        freeze(copy.words);
        const scene = accepted(copy),
          ctx = sharedDependencyFixtureContext(copy),
          lens = rec(rec(scene).dependencyLens);
        expect(scene.preset).toBe('shared-driver');
        expect(scene.holdings).toEqual([]);
        expect(scene.visualMode).toBe(mode);
        expect(lens.version).toBe(1);
        expect(lens.firms).toEqual(
          [...firms(copy)].sort((a, b) => String(a.fundId).localeCompare(String(b.fundId))),
        );
        expect(lens.modelSource).toEqual(rec(copy.raw.dependencyLens).modelSource);
        expect(lens.finalHoldSeconds).toBeCloseTo(ctx.win.endTime - scene.resolveAt, 8);
        expect(Number(lens.finalHoldSeconds)).toBeGreaterThanOrEqual(0.8);
        expect(copy).toEqual(before);
      });
  }
  for (const mode of ['diagram', 'hybrid'])
    it(`absence remains the original ${mode} shared-driver contract, without synthesized firms or native records`, () => {
      const f = sharedDependencyFixture({ includeLens: false });
      f.raw.visualMode = mode;
      const result = accepted(f);
      expect(rec(result).dependencyLens).toBeUndefined();
      expect(result.holdings).toEqual([]);
      expect(result.funds.map((fund) => fund.id)).toEqual(['cedar', 'birch']);
      expect(result.exposure).toEqual({ id: 'demand', label: 'Demand' });
    });
  it('array order never substitutes for the source-supported fundId binding', () => {
    const fixture = sharedDependencyFixture();
    rec(fixture.raw.dependencyLens).firms = [...firms(fixture)].reverse();
    const lens = rec(rec(accepted(fixture)).dependencyLens);
    const result = lens.firms;
    if (!Array.isArray(result)) throw new Error('Missing validated firms');
    expect(
      result
        .map(rec)
        .map((firm) => [firm.fundId, rec(firm.identity).id])
        .sort(),
    ).toEqual([
      ['birch', 'rowan'],
      ['cedar', 'acorn'],
    ]);
  });
});

type Mutation = [string, (fixture: SharedDependencySourceFixture) => void];
const negatives: Mutation[] = [
  [
    'null optional lens is not absence',
    (f) => {
      f.raw.dependencyLens = null;
    },
  ],
  [
    'empty incomplete lens',
    (f) => {
      f.raw.dependencyLens = {};
    },
  ],
  [
    'missing version',
    (f) => {
      delete rec(f.raw.dependencyLens).version;
    },
  ],
  [
    'unsupported version',
    (f) => {
      rec(f.raw.dependencyLens).version = 2;
    },
  ],
  [
    'fractional version',
    (f) => {
      rec(f.raw.dependencyLens).version = 1.5;
    },
  ],
  [
    'nonfinite version',
    (f) => {
      rec(f.raw.dependencyLens).version = Number.NaN;
    },
  ],
  [
    'raw final hold must not override the source beat',
    (f) => {
      rec(f.raw.dependencyLens).finalHoldSeconds = 9;
    },
  ],
  [
    'missing firms',
    (f) => {
      delete rec(f.raw.dependencyLens).firms;
    },
  ],
  [
    'only one firm',
    (f) => {
      rec(f.raw.dependencyLens).firms = [firms(f)[0]];
    },
  ],
  [
    'third firm beyond frozen cap',
    (f) => {
      rec(f.raw.dependencyLens).firms = [...firms(f), structuredClone(firms(f)[0])];
    },
  ],
  [
    'duplicate firm identity',
    (f) => {
      firms(f)[1].identity = structuredClone(firms(f)[0].identity);
    },
  ],
  [
    'both firms incorrectly belong to the same fund',
    (f) => {
      firms(f)[1].fundId = 'cedar';
    },
  ],
  [
    'missing fund actor',
    (f) => {
      delete firms(f)[0].fundId;
    },
  ],
  [
    'unknown fund actor',
    (f) => {
      firms(f)[0].fundId = 'phantom';
    },
  ],
  [
    'fund actor swapped with other fund',
    (f) => {
      firms(f)[0].fundId = 'birch';
      firms(f)[1].fundId = 'cedar';
    },
  ],
  [
    'firm aliases an existing fund',
    (f) => {
      rec(firms(f)[0].identity).id = 'cedar';
    },
  ],
  [
    'firm aliases the driver',
    (f) => {
      rec(firms(f)[0].identity).id = 'demand';
    },
  ],
  [
    'firm source label swapped',
    (f) => {
      rec(firms(f)[0].identity).label = 'Rowan';
    },
  ],
  [
    'missing explicit firm introduction',
    (f) => {
      delete rec(firms(f)[0].identity).source;
    },
  ],
  [
    'wrong firm introduction source',
    (f) => {
      rec(firms(f)[0].identity).source = structuredClone(rec(firms(f)[1].identity).source);
    },
  ],
  [
    'cropped company qualifier',
    (f) => {
      const s = rec(rec(firms(f)[0].identity).source);
      s.toWord = Number(s.toWord) - 2;
    },
  ],
  [
    'holding evidence omitted',
    (f) => {
      delete firms(f)[0].holdingSource;
    },
  ],
  [
    'holding actor evidence swapped',
    (f) => {
      firms(f)[0].holdingSource = structuredClone(firms(f)[1].holdingSource);
    },
  ],
  [
    'cropped holding actor',
    (f) => {
      const s = rec(firms(f)[0].holdingSource);
      s.fromWord = Number(s.fromWord) + 1;
    },
  ],
  [
    'holding source moved to driver phase',
    (f) => {
      firms(f)[0].holdingSource = structuredClone(firms(f)[0].driverSource);
    },
  ],
  [
    'driver evidence omitted',
    (f) => {
      delete firms(f)[0].driverSource;
    },
  ],
  [
    'driver actor evidence swapped',
    (f) => {
      firms(f)[0].driverSource = structuredClone(firms(f)[1].driverSource);
    },
  ],
  [
    'cropped driver name',
    (f) => {
      const s = rec(firms(f)[0].driverSource);
      s.toWord = Number(s.toWord) - 1;
    },
  ],
  [
    'wrong driver actor',
    (f) => {
      rec(f.raw.exposure).label = 'Other';
    },
  ],
  [
    'missing native meaning',
    (f) => {
      delete rec(f.raw.dependencyLens).modelSource;
    },
  ],
  [
    'native meaning replaced by a holding sentence',
    (f) => {
      rec(f.raw.dependencyLens).modelSource = structuredClone(firms(f)[0].holdingSource);
    },
  ],
  [
    'cropped native meaning',
    (f) => {
      const s = rec(rec(f.raw.dependencyLens).modelSource);
      s.toWord = Number(s.toWord) - 3;
    },
  ],
  [
    'invented weights',
    (f) => {
      firms(f)[0].weight = 0.4;
    },
  ],
  [
    'invented correlation',
    (f) => {
      rec(f.raw.dependencyLens).correlation = 0.9;
    },
  ],
  [
    'invented probability',
    (f) => {
      rec(f.raw.dependencyLens).probability = 0.5;
    },
  ],
  [
    'invented money',
    (f) => {
      firms(f)[0].money = { currency: 'USD', minorUnits: 100 };
    },
  ],
  [
    'arbitrary model geometry',
    (f) => {
      rec(f.raw.dependencyLens).geometry = { radius: 10 };
    },
  ],
  [
    'executable lens payload',
    (f) => {
      rec(f.raw.dependencyLens).code = 'simulate()';
    },
  ],
  [
    'unsupported financial percent field',
    (f) => {
      firms(f)[0].returnPercent = 20;
    },
  ],
  [
    'span outside source window',
    (f) => {
      firms(f)[0].driverSource = { fromWord: 0, toWord: f.words.length };
    },
  ],
  [
    'oversized span',
    (f) => {
      firms(f)[0].driverSource = { fromWord: 0, toWord: 64 };
    },
  ],
  [
    'nonempty legacy holdings is not this optional shared-driver route',
    (f) => {
      f.raw.holdings = [{ fundId: 'cedar', holding: { id: 'acorn', label: 'Acorn' } }];
    },
  ],
  [
    'dependency lens on the wrong existing preset',
    (f) => {
      f.raw.preset = 'shared-holdings';
    },
  ],
  [
    'duplicate source graph reference',
    (f) => {
      firms(f)[1].driverSource = firms(f)[0].driverSource;
    },
  ],
  [
    'symbol-bearing identity',
    (f) => {
      Object.defineProperty(rec(firms(f)[0].identity), Symbol('hidden'), { value: 1 });
    },
  ],
  [
    'custom-prototype identity',
    (f) => {
      Object.setPrototypeOf(rec(firms(f)[0].identity), { fake: true });
    },
  ],
  [
    'oversized string',
    (f) => {
      rec(firms(f)[0].identity).label = 'x'.repeat(513);
    },
  ],
  [
    'oversized array',
    (f) => {
      rec(f.raw.dependencyLens).firms = Array.from({ length: 13 }, () =>
        structuredClone(firms(f)[0]),
      );
    },
  ],
  [
    'deep untrusted geometry',
    (f) => {
      rec(f.raw.dependencyLens).geometry = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    },
  ],
];
describe('OP-58 dependency lens rejects incomplete, swapped, cropped and unsupported source facts', () => {
  it.each(negatives)('%s', (_, mutate) => {
    const fixture = sharedDependencyFixture();
    mutate(fixture);
    rejected(fixture);
  });
  it('accessor fields are rejected without executing them', () => {
    const fixture = sharedDependencyFixture();
    let executed = false;
    Object.defineProperty(rec(fixture.raw.dependencyLens), 'version', {
      enumerable: true,
      get: () => {
        executed = true;
        throw new Error('Untrusted accessor');
      },
    });
    rejected(fixture);
    expect(executed).toBe(false);
  });
  const authoredNegatives: [string, Parameters<typeof sharedDependencyFixture>[0]][] = [
    [
      'conditional holding is not observed ownership',
      { holdingClauses: ['If board approves, Cedar Fund holds Acorn.', 'Birch Fund holds Rowan.'] },
    ],
    [
      'negative holding',
      { holdingClauses: ['Cedar Fund does not hold Acorn.', 'Birch Fund holds Rowan.'] },
    ],
    [
      'missing holding firm',
      { holdingClauses: ['Cedar Fund holds another company.', 'Birch Fund holds Rowan.'] },
    ],
    [
      'wrong holding actor',
      { holdingClauses: ['Birch Fund holds Acorn.', 'Birch Fund holds Rowan.'] },
    ],
    [
      'conditional firm dependency',
      { driverClauses: ['If demand rises, Acorn depends on Demand.', 'Rowan depends on Demand.'] },
    ],
    [
      'negative firm dependency',
      { driverClauses: ['Acorn does not depend on Demand.', 'Rowan depends on Demand.'] },
    ],
    ['wrong driver', { driverClauses: ['Acorn depends on Other.', 'Rowan depends on Demand.'] }],
    [
      'numeric correlation is not a qualitative dependency',
      {
        driverClauses: [
          'Acorn has 90 percent correlation with Demand.',
          'Rowan depends on Demand.',
        ],
      },
    ],
    [
      'forecast return is not a dependency',
      {
        driverClauses: [
          'Acorn expects a 20 percent return from Demand.',
          'Rowan depends on Demand.',
        ],
      },
    ],
    [
      'native record qualifier is conditional',
      {
        modelClause:
          'If requested, Cedar Fund and Birch Fund maintain asset ownership and economic claim records.',
      },
    ],
    [
      'one native fund actor is missing',
      { modelClause: 'Cedar Fund maintains asset ownership and economic claim records.' },
    ],
    [
      'native meaning changed to a paid or liquid claim',
      { modelClause: 'Cedar Fund and Birch Fund maintain liquid paid economic claim records.' },
    ],
    [
      'explicit shared statement missing',
      { sharedClause: 'These exposures are separately named.' },
    ],
  ];
  it.each(
    authoredNegatives,
  )('%s (actual authored source, not just altered raw data)', (_, options) => {
    rejected(sharedDependencyFixture(options));
  });
  it('cropping the actual conditional qualifier cannot turn a holding into an asserted local source clause', () => {
    const fixture = sharedDependencyFixture({
      holdingClauses: ['If board approves, Cedar Fund holds Acorn.', 'Birch Fund holds Rowan.'],
    });
    const source = rec(firms(fixture)[0].holdingSource);
    source.fromWord = Number(source.fromWord) + 3;
    rejected(fixture);
  });
});
