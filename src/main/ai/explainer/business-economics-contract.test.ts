import { describe, expect, it } from 'vitest';
import {
  cloneEconomicsFixture,
  type EconomicsSourceFixture,
  economicsFixtureContext,
  replaceEconomicsWords,
} from '../../remotion/compositions/explainer/business/economics/fixtures';
import {
  economicsDecompositions,
  sampleEconomics,
} from '../../remotion/compositions/explainer/business/economics/poses';
import { economicsReadingCards } from '../../remotion/compositions/explainer/business/economics/readability';
import type { BusinessWordSpan } from '../../remotion/compositions/explainer/business/types';
import {
  parseOperatingCostScene,
  parseScaleEconomicsScene,
  parseValueCaptureScene,
} from './business-economics-contract';
import { isRec, type Rec } from './kind-spec';

function record(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Expected authored record');
  return value;
}
function at(raw: Rec, ...path: (string | number)[]): Rec {
  let value: unknown = raw;
  for (const key of path)
    value = typeof key === 'number' && Array.isArray(value) ? value[key] : record(value)[key];
  return record(value);
}
function source(raw: Rec): BusinessWordSpan {
  return {
    fromWord: Number(record(raw.source).fromWord),
    toWord: Number(record(raw.source).toWord),
  };
}
function parse(f: EconomicsSourceFixture) {
  const ctx = economicsFixtureContext(f);
  const scene =
    f.raw.kind === 'operating-cost'
      ? parseOperatingCostScene(f.raw, ctx)
      : f.raw.kind === 'scale-economics'
        ? parseScaleEconomicsScene(f.raw, ctx)
        : parseValueCaptureScene(f.raw, ctx);
  return { scene, ctx };
}
/** Rewrite an entire actual source sentence; update all planner/source indices, not timestamps or context padding. */
function rewrite(f: EconomicsSourceFixture, fact: Rec, sentence: string): void {
  const old = source(fact),
    tokens = sentence.split(/\s+/u),
    start = f.words[old.fromWord].start,
    end = f.words[old.toWord].end;
  const delta = tokens.length - (old.toWord - old.fromWord + 1);
  f.words.splice(
    old.fromWord,
    old.toWord - old.fromWord + 1,
    ...tokens.map((text, index) => ({
      text,
      start: start + (index * (end - start)) / tokens.length,
      end: start + ((index + 1) * (end - start)) / tokens.length,
    })),
  );
  function adjust(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) adjust(item);
      return;
    }
    if (!isRec(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (
        typeof child === 'number' &&
        (key === 'fromWord' || key === 'toWord' || key.endsWith('Word'))
      ) {
        if (child > old.toWord) value[key] = child + delta;
        else if (key === 'toWord' && child === old.toWord) value[key] = child + delta;
      } else adjust(child);
    }
  }
  adjust(f.raw);
}
function unknownPer(f: EconomicsSourceFixture) {
  const per = at(f.raw, 'perOutcome');
  per.state = 'unknown';
  per.money = null;
  rewrite(
    f,
    per,
    'Nori records per resolved task cost unknown USD for Repair during July per 4 clients.',
  );
}
function reject(f: EconomicsSourceFixture) {
  const result = parse(f);
  expect(result.scene).toBeNull();
  expect(result.ctx.issues.length).toBeGreaterThan(0);
}

describe('economics source and arithmetic boundaries', () => {
  it('money uses its currency unit and output/staffing retain unlike count units', () => {
    const f = cloneEconomicsFixture('OP-34'),
      result = parse(f);
    expect(result.scene, result.ctx.issues.join('; ')).not.toBeNull();
    if (result.scene?.preset === 'fixed-variable') {
      expect(result.scene.samples[0].output.basis.unit).toBe('jobs');
      expect(result.scene.samples[0].total.basis.unit).toBe('USD');
    }
    at(f.raw, 'samples', 0, 'total', 'basis').unit = 'workers';
    reject(f);
  });
  it('unknown resolved tasks and per-task amount stay null, not zero or a paid outcome', () => {
    const f = cloneEconomicsFixture('OP-33');
    unknownPer(f);
    const resolved = at(f.raw, 'resolved');
    resolved.state = 'unknown';
    resolved.count = null;
    rewrite(
      f,
      resolved,
      'Nori records resolved output unknown tasks for Repair during July per 4 clients.',
    );
    const result = parse(f);
    expect(result.scene, result.ctx.issues.join('; ')).not.toBeNull();
    if (result.scene?.preset === 'per-outcome') {
      expect(result.scene.resolved.count).toBeNull();
      expect(result.scene.perOutcome.money).toBeNull();
    }
  });
  it('observed per-outcome cost never divides zero tasks', () => {
    const f = cloneEconomicsFixture('OP-33'),
      resolved = at(f.raw, 'resolved');
    resolved.count = 0;
    rewrite(
      f,
      resolved,
      'Nori records resolved output 0 tasks for Repair during July per 4 clients.',
    );
    reject(f);
  });
  it('explicit contingent money stays numeric but never drives observed decomposition/quotient', () => {
    const f = cloneEconomicsFixture('OP-33'),
      review = at(f.raw, 'components', 1, 'cost');
    f.raw.condition = 'If approved';
    review.state = 'conditional';
    rewrite(
      f,
      review,
      'If approved, Nori records Review cost 30 USD for Repair during July per 4 clients.',
    );
    reject(f);
    unknownPer(f);
    const result = parse(f);
    expect(result.scene, result.ctx.issues.join('; ')).not.toBeNull();
    if (result.scene?.preset === 'per-outcome') {
      expect(result.scene.components[1].cost.state).toBe('conditional');
      expect(result.scene.components[1].cost.money?.minorUnits).toBe(3000);
    }
    review.state = 'source-stated';
    reject(f);
  });
  it('negative cost is qualitative, never zero', () => {
    const f = cloneEconomicsFixture('OP-33');
    unknownPer(f);
    const review = at(f.raw, 'components', 1, 'cost');
    review.state = 'negative';
    review.money = null;
    at(review, 'basis').denominator = null;
    rewrite(
      f,
      review,
      'Nori does not record Review cost unknown USD for Repair during July with unknown clients denominator.',
    );
    const result = parse(f);
    expect(result.scene, result.ctx.issues.join('; ')).not.toBeNull();
    if (result.scene?.preset === 'per-outcome')
      expect(result.scene.components[1].cost.money).toBeNull();
    review.state = 'source-stated';
    review.money = { minorUnits: 0, currency: 'USD' };
    reject(f);
  });
  it('unknown component does not become an inferred balancing residual', () => {
    const f = cloneEconomicsFixture('OP-33');
    unknownPer(f);
    const review = at(f.raw, 'components', 1, 'cost');
    review.state = 'unknown';
    review.money = null;
    rewrite(
      f,
      review,
      'Nori records Review cost unknown USD for Repair during July per 4 clients.',
    );
    const result = parse(f);
    expect(result.scene, result.ctx.issues.join('; ')).not.toBeNull();
    if (result.scene?.preset === 'per-outcome')
      expect(result.scene.components[1].cost.money).toBeNull();
  });
  it('unknown allocation remainder is preserved only with explicit nonnumeric A-10 representation', () => {
    const f = cloneEconomicsFixture('OP-39'),
      remainder = at(f.raw, 'remainder', 'amount');
    remainder.state = 'unknown';
    remainder.money = null;
    rewrite(
      f,
      remainder,
      'Sora records Retained retained remainder unknown USD for Pool during July per 4 clients.',
    );
    reject(f);
    const carrier = at(f.raw, 'carrier');
    rewrite(f, carrier, 'Sora uses Pool as a nonnumeric four-tray illustration.');
    const result = parse(f);
    expect(result.scene, result.ctx.issues.join('; ')).not.toBeNull();
    if (result.scene?.preset === 'source-stated-allocation') {
      expect(result.scene.remainder.amount.money).toBeNull();
      expect(result.scene.carrier?.representation).toBe('nonnumeric');
    }
  });
  it('incompatible pricing workload models remain separate with no winner', () => {
    const result = parse(cloneEconomicsFixture('OP-38'));
    expect(result.scene, result.ctx.issues.join('; ')).not.toBeNull();
    if (result.scene?.preset === 'comparable-pricing-bases')
      expect(result.scene.comparison).toBe('separate');
  });
  it('stated-cost remainder, source-stated profit, receivable and received cash remain different', () => {
    const f = cloneEconomicsFixture('OP-40'),
      result = parse(f);
    expect(result.scene, result.ctx.issues.join('; ')).not.toBeNull();
    if (result.scene?.preset === 'accounting-bases') {
      expect(result.scene.statedCostRemainder.money?.minorUnits).toBe(7000);
      expect(result.scene.profit?.fact.money?.minorUnits).toBe(1000);
      expect(result.scene.receivable?.money?.minorUnits).toBe(8000);
      expect(result.scene.cash?.fact.money?.minorUnits).toBe(2000);
    }
    at(f.raw, 'profit').fact = structuredClone(f.raw.statedCostRemainder);
    reject(f);
  });
  for (const [name, mutate] of [
    [
      'currency',
      (f: EconomicsSourceFixture) => {
        at(f.raw, 'components', 1, 'cost', 'money').currency = 'EUR';
      },
    ],
    [
      'period',
      (f: EconomicsSourceFixture) => {
        const review = at(f.raw, 'components', 1, 'cost');
        at(review, 'basis').period = 'June';
        replaceEconomicsWords(f, source(review), 'July', 'June');
      },
    ],
    [
      'denominator',
      (f: EconomicsSourceFixture) => {
        const review = at(f.raw, 'components', 1, 'cost');
        at(review, 'basis').denominator = 8;
        replaceEconomicsWords(f, source(review), '4', '8');
      },
    ],
    [
      'money as count',
      (f: EconomicsSourceFixture) => {
        at(f.raw, 'resolved', 'basis').unit = 'USD';
      },
    ],
    [
      'duplicate review/retry identity',
      (f: EconomicsSourceFixture) => {
        at(f.raw, 'components', 2).identity = structuredClone(
          at(f.raw, 'components', 1, 'identity'),
        );
      },
    ],
    [
      'unsafe money overflow',
      (f: EconomicsSourceFixture) => {
        at(f.raw, 'total', 'money').minorUnits = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'minor-unit cap',
      (f: EconomicsSourceFixture) => {
        at(f.raw, 'total', 'money').minorUnits = 100_000_000_001;
      },
    ],
    [
      'fractional minor units',
      (f: EconomicsSourceFixture) => {
        at(f.raw, 'total', 'money').minorUnits = 1.5;
      },
    ],
    [
      'malformed identity',
      (f: EconomicsSourceFixture) => {
        at(f.raw, 'business').id = 'NOT AN ID';
      },
    ],
    [
      'unexpected asset selection',
      (f: EconomicsSourceFixture) => {
        at(f.raw, 'carrier').asset = 'A-02';
      },
    ],
    [
      'raw renderer key',
      (f: EconomicsSourceFixture) => {
        f.raw.camera = { position: [1, 2, 3] };
      },
    ],
    [
      'too many components',
      (f: EconomicsSourceFixture) => {
        f.raw.components = Array(13).fill(null);
      },
    ],
    [
      'nonfinite number',
      (f: EconomicsSourceFixture) => {
        at(f.raw, 'total', 'money').minorUnits = Number.NaN;
      },
    ],
    [
      'oversized string',
      (f: EconomicsSourceFixture) => {
        f.raw.label = 'W'.repeat(513);
      },
    ],
    [
      'excessive depth',
      (f: EconomicsSourceFixture) => {
        f.raw.extra = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
      },
    ],
  ] as const)
    it(`rejects ${name} diagnostically`, () => {
      const f = cloneEconomicsFixture('OP-33');
      mutate(f);
      reject(f);
    });
  it('crop cannot promote a condition or strip a trailing qualifier', () => {
    const f = cloneEconomicsFixture('OP-33'),
      review = at(f.raw, 'components', 1, 'cost');
    f.raw.condition = 'If approved';
    rewrite(
      f,
      review,
      'If approved, Nori records Review cost 30 USD for Repair during July per 4 clients.',
    );
    at(review, 'source').fromWord = Number(at(review, 'source').fromWord) + 2;
    at(review, 'basis', 'source').fromWord = Number(at(review, 'basis', 'source').fromWord) + 2;
    reject(f);
  });
  it('rejects insufficient actual hybrid-visible page holds and excessive fixed-font density without throwing', () => {
    const f = cloneEconomicsFixture('OP-34');
    f.raw.visualMode = 'hybrid';
    const response = Number(f.raw.responseWord),
      check = Number(f.raw.checkWord);
    f.words[response].start = 5.9;
    f.words[check].start = 7.0;
    expect(() => reject(f)).not.toThrow();
    const dense = cloneEconomicsFixture('OP-37');
    const period = at(dense.raw, 'periods', 0);
    period.date = 'WWWWWWWWWWWWWWWWWWWWWWWW';
    const oldSource = source(period);
    replaceEconomicsWords(dense, oldSource, 'July-2026', String(period.date));
    const result = parse(dense);
    expect(result.scene).toBeNull();
    expect(result.ctx.issues.join(' ')).toMatch(/density|fixed-font/);
  });
  it('accepts the exact monetary cap with conserved components, never unsafe sum/rounded quotient', () => {
    const f = cloneEconomicsFixture('OP-33');
    const amounts = [70_000_000_000, 20_000_000_000, 10_000_000_000];
    for (const [index, label] of ['Compute', 'Review', 'Retry'].entries()) {
      const fact = at(f.raw, 'components', index, 'cost');
      at(fact, 'money').minorUnits = amounts[index];
      rewrite(
        f,
        fact,
        `Nori records ${label} cost ${amounts[index] / 100} USD for Repair during July per 4 clients.`,
      );
    }
    at(f.raw, 'total', 'money').minorUnits = 100_000_000_000;
    rewrite(
      f,
      at(f.raw, 'total'),
      'Nori records total cost 1000000000 USD for Repair during July per 4 clients.',
    );
    at(f.raw, 'perOutcome', 'money').minorUnits = 25_000_000_000;
    rewrite(
      f,
      at(f.raw, 'perOutcome'),
      'Nori records per resolved task cost 250000000 USD for Repair during July per 4 clients.',
    );
    const result = parse(f);
    expect(result.scene, result.ctx.issues.join('; ')).not.toBeNull();
    if (!result.scene) return;
    expect(economicsDecompositions(result.scene)[0].total).toBe(100_000_000_000);
    expect(
      sampleEconomics(result.scene, result.scene.resolveAt).decompositions[0].parts.reduce(
        (n, p) => n + p.amount,
        0,
      ),
    ).toBe(100_000_000_000);
  });
  it('modal contingent allocation retains its number and condition but has no observed fills at any seek', () => {
    const f = cloneEconomicsFixture('OP-39'),
      atlas = at(f.raw, 'allocations', 0, 'amount');
    atlas.state = 'conditional';
    f.raw.condition = 'If approved';
    rewrite(
      f,
      atlas,
      'If approved, Sora would allocate Atlas allocation 40 USD for Pool during July per 4 clients.',
    );
    at(atlas, 'basis', 'source').fromWord = Number(at(atlas, 'source').fromWord) + 2;
    reject(f);
    rewrite(f, at(f.raw, 'carrier'), 'Sora uses Pool as a nonnumeric four-tray illustration.');
    const result = parse(f);
    expect(result.scene, result.ctx.issues.join('; ')).not.toBeNull();
    if (result.scene?.preset !== 'source-stated-allocation') return;
    expect(result.scene.allocations[0].amount.money?.minorUnits).toBe(4000);
    expect(result.scene.allocations[0].amount.state).toBe('conditional');
    for (const t of [
      result.scene.setupAt,
      result.scene.resolveAt,
      result.scene.actionAt,
      result.scene.resolveAt + result.scene.finalHoldSeconds,
    ]) {
      expect(sampleEconomics(result.scene, t).fills).toEqual([0, 0, 0, 0]);
      expect(sampleEconomics(result.scene, t).decompositions).toEqual([]);
    }
    atlas.state = 'source-stated';
    reject(f);
  });
  it('absent profit/cash stay absent; M02 includes only revenue-compatible costs and stated remainder', () => {
    const f = cloneEconomicsFixture('OP-40');
    f.raw.profit = null;
    f.raw.cash = null;
    const result = parse(f);
    expect(result.scene, result.ctx.issues.join('; ')).not.toBeNull();
    if (result.scene?.preset !== 'accounting-bases') return;
    expect(result.scene.profit).toBeNull();
    expect(result.scene.cash).toBeNull();
    expect(economicsDecompositions(result.scene)[0].parts.map((p) => p.id)).toEqual([
      'service',
      'stated-cost-remainder',
    ]);
    at(f.raw, 'revenue').accounting = 'net';
    reject(f);
  });
  it('among-job cohort remains a literal basis, not a universal per-job price formatter', () => {
    const f = cloneEconomicsFixture('OP-33');
    const facts = [
      at(f.raw, 'total'),
      at(f.raw, 'perOutcome'),
      at(f.raw, 'resolved'),
      ...[0, 1, 2].map((i) => at(f.raw, 'components', i, 'cost')),
    ];
    for (const fact of facts) {
      at(fact, 'basis').population = 'jobs';
      const s = source(fact),
        text = f.words
          .slice(s.fromWord, s.toWord + 1)
          .map((w) => w.text)
          .join(' ');
      rewrite(f, fact, text.replace('per 4 clients', 'among 4 jobs'));
    }
    const result = parse(f);
    expect(result.scene, result.ctx.issues.join('; ')).not.toBeNull();
    if (!result.scene) return;
    const cards = economicsReadingCards(result.scene);
    expect(
      cards.every(
        (c) => c.lines.includes('Population: jobs') && c.lines.includes('Denominator: 4'),
      ),
    ).toBe(true);
    expect(cards.flatMap((c) => c.lines).some((l) => /per 4 jobs/.test(l))).toBe(false);
  });
  it('finite maximum output count stays jobs, not USD, and unlike axes do not compare across periods', () => {
    const f = cloneEconomicsFixture('OP-34'),
      output = at(f.raw, 'samples', 0, 'output');
    output.count = 1_000_000_000;
    rewrite(
      f,
      output,
      'Tavi records Small output 1000000000 jobs for Wash during July per 4 clients.',
    );
    const result = parse(f);
    expect(result.scene, result.ctx.issues.join('; ')).not.toBeNull();
    at(output, 'basis').period = 'June';
    rewrite(
      f,
      output,
      'Tavi records Small output 1000000000 jobs for Wash during June per 4 clients.',
    );
    reject(f);
  });
  it('source monetary amount cannot disguise itself as count units even when the unit is present locally', () => {
    const f = cloneEconomicsFixture('OP-33'),
      review = at(f.raw, 'components', 1, 'cost');
    at(review, 'basis').unit = 'workers';
    rewrite(
      f,
      review,
      'Nori records Review cost 30 USD for Repair workers during July per 4 clients.',
    );
    reject(f);
  });
});
