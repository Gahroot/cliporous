import { describe, expect, it } from 'vitest';
import {
  fixtureContext,
  parsePopulationFixture,
  populationFixtures,
} from '../../remotion/compositions/explainer/concepts/business-populations/test-fixtures';
import { BUSINESS_POPULATIONS_PRESETS } from '../../remotion/compositions/explainer/concepts/business-populations/types';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import { parseExplainerPlan, toSceneRelative } from '../explainer-scenes';
import { isRec, type Rec } from './kind-spec';
import { getKindSpec } from './kinds';
import { CONCEPT_BUSINESS_POPULATIONS_SPECS } from './kinds-concept-business-populations';
import { buildShortlist } from './shortlist';

function fixture(preset: string) {
  const found = populationFixtures.find((f) => f.scene.preset === preset);
  if (!found) throw new Error(`missing ${preset}`);
  return found;
}
function entries(raw: Rec, field: string): Rec[] {
  const value = raw[field];
  if (!Array.isArray(value) || !value.every(isRec)) throw new Error('fixture entries');
  return value;
}
function rejected(preset: string, change: (raw: Rec) => void, replace?: [string, string]) {
  const fx = fixture(preset);
  const raw = structuredClone(fx.plannerInput);
  change(raw);
  const result = parsePopulationFixture(
    fx,
    raw,
    replace ? fx.sourceText.replace(...replace) : fx.sourceText,
  );
  expect(result.scene).toBeNull();
  expect(result.ctx.issues.length).toBeGreaterThan(0);
  expect(result.ctx.issues.length).toBeLessThanOrEqual(4);
}

/** Preserve every beat/evidence index when adversarial clauses gain or lose words. */
function changedSource(preset: string, from: string, to: string, patch: Rec = {}) {
  const fx = fixture(preset);
  const offset = fx.sourceText.indexOf(from);
  if (offset < 0) throw new Error('missing source clause');
  const at = fx.sourceText.slice(0, offset).trim().split(/\s+/).filter(Boolean).length;
  const length = from.split(/\s+/).length;
  const delta = to.split(/\s+/).length - length;
  const raw = structuredClone(fx.plannerInput);
  function reindex(record: Rec, wordMap = false): void {
    for (const [key, value] of Object.entries(record)) {
      if ((wordMap || key.endsWith('Word')) && typeof value === 'number') {
        record[key] = value >= at + length ? value + delta : value >= at ? at : value;
      } else if (isRec(value)) reindex(value, key === 'countWords');
      else if (Array.isArray(value)) {
        for (const entry of value) if (isRec(entry)) reindex(entry);
      }
    }
  }
  reindex(raw);
  return parsePopulationFixture(fx, { ...raw, ...patch }, fx.sourceText.replace(from, to));
}

describe('Pack D real parsers and fixture parity', () => {
  it('has exactly eight presets, five source-derived samples and a real registered spec per fixture', () => {
    expect(Object.values(BUSINESS_POPULATIONS_PRESETS).flat()).toHaveLength(8);
    expect(populationFixtures).toHaveLength(8);
    expect(CONCEPT_BUSINESS_POPULATIONS_SPECS).toHaveLength(3);
    for (const fx of populationFixtures) {
      expect(fx.samples).toHaveLength(5);
      expect(fx.storyboard).toHaveLength(5);
      expect(fx.plannerInput.startWord).toBe(0);
      expect(fx.plannerInput.endWord).toBe(fx.sourceText.split(/\s+/).length - 1);
      expect(fx.plannerInput.layout).toBe('stack');
      expect(getKindSpec(fx.scene.kind)?.layouts).toContain('over');
    }
  });
  it.each(
    populationFixtures,
  )('$name parses exactly to its render scene through local and global specs', (fx) => {
    const result = parsePopulationFixture(fx);
    expect(result.ctx.issues).toEqual([]);
    expect(result.scene).toEqual(fx.scene);
    expect(getKindSpec(fx.scene.kind)?.parse(fx.plannerInput, fixtureContext(fx))).toEqual(
      fx.scene,
    );
    for (const beat of fx.storyboard) {
      expect(result.scene).toHaveProperty(`${beat.beat}At`, beat.at);
    }
  });
  it.each(
    populationFixtures,
  )('$name survives the full planner with exact padded fixture parity', (fx) => {
    const words = conceptFixtureWords(fx.sourceText, fx.durationSec);
    expect(words[0]?.start).toBe(0.25);
    expect(words.at(-1)?.end).toBe(fx.durationSec - 0.35);
    for (const layout of ['stack', 'over']) {
      const plans = parseExplainerPlan({ scenes: [{ ...fx.plannerInput, layout }] }, words, {
        minStart: 0,
        maxEnd: 60,
      });
      expect(plans).toHaveLength(1);
      const plan = plans[0];
      if (!plan) throw new Error(`Full planner rejected ${fx.name}`);
      expect(plan.startTime).toBe(0);
      expect(plan.endTime).toBe(fx.durationSec);
      expect(plan.layout).toBe(layout);
      expect(plan.scene).toEqual(fx.scene);
      // The real renderer conversion rounds beats to milliseconds, unlike source timestamps.
      expect(toSceneRelative(plan.scene, plan.startTime)).toEqual(toSceneRelative(fx.scene, 0));
    }
    const phases = [
      fx.scene.setupAt,
      fx.scene.actionAt,
      fx.scene.responseAt,
      fx.scene.checkAt,
      fx.scene.resolveAt,
    ];
    expect(fx.sourceBeats.map((beat) => beat.at)).toEqual(phases);
    expect(fx.storyboard.map((beat) => beat.at)).toEqual(phases);
    expect(fx.sourceBeats.map((beat) => beat.text).join(' ')).toBe(fx.sourceText);
    for (const [index, sample] of fx.samples.entries()) {
      expect(sample.frame / 30).toBeGreaterThanOrEqual(phases[index] ?? 0);
      expect(sample.frame / 30).toBeLessThan(phases[index + 1] ?? fx.durationSec);
    }
    // Keep the production duration guard: the former unpadded full-span words must fail.
    const unpadded = words.map((word, index) => ({
      text: word.text,
      start: (index * fx.durationSec) / words.length,
      end: ((index + 1) * fx.durationSec) / words.length,
    }));
    expect(
      parseExplainerPlan({ scenes: [fx.plannerInput] }, unpadded, { minStart: 0, maxEnd: 60 }),
    ).toEqual([]);
  });
  it.each(populationFixtures)('$name rejects malformed beats, labels, presets and rates', (fx) => {
    for (const patch of [
      { preset: 'invented' },
      { setupWord: NaN },
      { responseWord: -1 },
      { checkWord: fx.plannerInput.actionWord },
      { label: 'x'.repeat(80) },
      { retentionRate: 0.8 },
      { mode: 'automatic' },
    ]) {
      expect(parsePopulationFixture(fx, { ...fx.plannerInput, ...patch }).scene).toBeNull();
    }
  });
  it.each([NaN, Infinity, -1, 1.5, 7])('rejects out-of-range distribution amount %s', (amount) => {
    rejected('customer-concentration', (raw) => {
      const m = entries(raw, 'members')[0];
      if (m) m.amount = amount;
    });
  });
  it('requires the complete denominator, exact members and correct units', () => {
    rejected('customer-concentration', (r) => {
      delete r.populationSize;
    });
    rejected('customer-concentration', (r) => {
      r.populationSize = 4;
    });
    rejected('customer-concentration', (r) => {
      r.unit = 'tasks';
    });
    rejected('average-hides-tail', (r) => {
      r.average = 2;
    });
    rejected('average-hides-tail', (r) => {
      delete r.average;
    });
    rejected('customer-concentration', () => {}, ['all 3 members', 'all 4 members']);
    rejected('customer-concentration', () => {}, ['Ada, Ben and Cy', 'Ada, Ben and Jo']);
  });
  it('rejects swapped amount evidence, negation, missing units and signed substitutions', () => {
    rejected('customer-concentration', (r) => {
      const m = entries(r, 'members');
      if (m[0] && m[1]) m[0].evidenceWord = m[1].evidenceWord;
    });
    rejected('customer-concentration', () => {}, [
      'Ada receives 6 orders.',
      'Ada denies 6 orders.',
    ]);
    rejected('customer-concentration', () => {}, [
      'Ada receives 6 orders.',
      'Ada receives -6 orders.',
    ]);
    rejected('customer-concentration', () => {}, [
      'Ada receives 6 orders.',
      'Ada receives 6 items.',
    ]);
    rejected('customer-concentration', () => {}, [
      'Ada receives 6 orders.',
      'Ada never receives orders.',
    ]);
  });
  it.each(populationFixtures)('$name reaches its own kind in the full-registry shortlist', (fx) => {
    const shortlist = buildShortlist(fixtureContext(fx).words);
    expect(shortlist.scores[fx.scene.kind]).toBeGreaterThan(0);
    expect(shortlist.kinds.map((spec) => spec.kind)).toContain(fx.scene.kind);
  });
  it.each([
    ['surplus', 'Stock holds 4 products of Mugs.'],
    ['retention', 'Cohort retains 1 customers in Autumn.'],
  ])('%s preserves full count conditions and rejects omitted or weakened conditions', (preset, clause) => {
    const condition = 'If demand stays steady';
    const conditional = `${condition}, ${clause}`;
    const accepted = changedSource(preset, clause, conditional, { condition });
    expect(accepted.ctx.issues).toEqual([]);
    expect(accepted.scene?.condition).toBe(condition);
    expect(changedSource(preset, clause, conditional).scene).toBeNull();
    expect(
      changedSource(preset, clause, conditional, { condition: 'If demand stays' }).scene,
    ).toBeNull();
    expect(changedSource(preset, clause, conditional, { condition: 'If demand' }).scene).toBeNull();
    for (const qualifier of ['at least', 'at most', 'approximately']) {
      const qualified = clause.replace(/\b[14]\b/, (number) => `${qualifier} ${number}`);
      expect(changedSource(preset, clause, qualified).scene).toBeNull();
    }
  });
  it('rejects contradictory source-backed stock counts and original-cohort denominators', () => {
    expect(
      changedSource(
        'surplus',
        'Stock holds 4 products of Mugs.',
        'Stock holds 2 products of Mugs.',
        { stockCount: 2 },
      ).scene,
    ).toBeNull();
    const counts = fixture('retention').plannerInput.counts;
    if (!isRec(counts)) throw new Error('missing cohort counts');
    expect(
      changedSource(
        'retention',
        'Cohort starts with 2 customers in Spring.',
        'Cohort starts with 3 customers in Spring.',
        { counts: { ...counts, starting: 3 } },
      ).scene,
    ).toBeNull();
    expect(
      changedSource(
        'retention',
        'Cohort retains 1 customers in Autumn.',
        'Cohort retains 2 customers in Autumn.',
        { counts: { ...counts, retained: 2 } },
      ).scene,
    ).toBeNull();
  });
  it.each([
    ['surplus', 'Stock holds 4 products of Mugs.', 'Stock never holds 4 products of Mugs.'],
    ['surplus', 'Demand requests 3 products of Mugs.', 'Demand might request 3 products of Mugs.'],
    [
      'retention',
      'Cohort retains 1 customers in Autumn.',
      'Cohort never retains 1 customers in Autumn.',
    ],
    [
      'retention',
      'Cohort retains 1 customers in Autumn.',
      'Cohort plans to retain 1 customers in Autumn.',
    ],
    ['retention', 'Ada remains in Autumn in Cohort.', 'Ada never remains in Autumn in Cohort.'],
    ['retention', 'Cohort retains 1 customers in Autumn.', 'Cohort retains 1 products in Autumn.'],
    ['retention', 'Cohort retains 1 customers in Autumn.', 'Cohort retains 1 customers in Spring.'],
    ['retention', 'Ada remains in Autumn in Cohort.', 'Ada remains in Autumn in Othergroup.'],
  ])('%s rejects negated, speculative, wrong-unit or misbound evidence: %s', (preset, clause, replacement) => {
    const result = changedSource(preset, clause, replacement);
    expect(result.scene).toBeNull();
    expect(result.ctx.issues.length).toBeGreaterThan(0);
  });
  it('conserves cohort membership and excludes newcomers from retained counts', () => {
    rejected('retention', (r) => {
      if (isRec(r.counts)) r.counts.retained = 2;
    });
    rejected('retention', (r) => {
      const arrival = entries(r, 'arrivals')[0];
      if (arrival) arrival.status = 'retained';
    });
    rejected('retention', (r) => {
      const arrival = entries(r, 'arrivals')[0];
      if (arrival) arrival.label = 'Ada';
    });
    rejected('retention', (r) => {
      const m = entries(r, 'members');
      if (m[0] && m[1]) m[0].evidenceWord = m[1].evidenceWord;
    });
    rejected('retention', (r) => {
      r.startPeriod = 'Winter';
    });
    rejected('retention', (r) => {
      r.endPeriod = r.startPeriod;
    });
    rejected('retention', (r) => {
      delete r.countWords;
    });
    rejected('churn', (r) => {
      r.members = Array(7).fill(entries(r, 'members')[0]);
    });
  });
  it('preserves source month names, rather than treating May as a speculative modal', () => {
    const fx = fixture('retention');
    const raw = { ...fx.plannerInput, startPeriod: 'May' };
    expect(
      parsePopulationFixture(fx, raw, fx.sourceText.replaceAll('Spring', 'May')).scene?.kind,
    ).toBe('customer-cohort');
  });
  it.each([NaN, Infinity, -1, 1.5, 7])('rejects inventory quantity %s', (stockCount) => {
    rejected('surplus', (r) => {
      r.stockCount = stockCount;
    });
  });
  it('keeps stock and demand distinct and quantities consistent with the claimed result', () => {
    rejected('surplus', (r) => {
      r.stockWord = r.demandWord;
    });
    rejected('shortage', (r) => {
      r.demandWord = r.stockWord;
    });
    rejected('surplus', (r) => {
      r.demandLabel = r.stockLabel;
    });
    rejected('surplus', (r) => {
      r.stockCount = 2;
    });
    rejected('surplus', (r) => {
      delete r.unit;
    });
    rejected('surplus', () => {}, ['4 products of Mugs', '4 products of Cups']);
    rejected('balanced', (r) => {
      r.stockCount = 3;
    });
  });
  it('rejects malformed actors and quantitative data smuggled into qualitative scenes', () => {
    for (const members of [null, [], [null], 'Ada'])
      rejected('workload-spread', (r) => {
        r.members = members;
      });
    rejected('workload-spread', (r) => {
      const m = entries(r, 'members')[0];
      if (m) m.amount = 10;
    });
    rejected('workload-spread', (r) => {
      r.populationSize = 3;
    });
    rejected('churn', (r) => {
      r.counts = { starting: 2 };
    });
  });
});
