import { describe, expect, it } from 'vitest';
import {
  businessFixtures,
  fixtureContext,
} from '../../remotion/compositions/explainer/concepts/business-operations/fixtures.test-support';
import { BUSINESS_OPERATIONS_PRESETS } from '../../remotion/compositions/explainer/concepts/business-operations/types';
import type { Rec } from './kind-spec';
import {
  CONCEPT_BUSINESS_OPERATIONS_SPECS,
  parseMarketExchange,
  parseResourceAllocation,
  parseUnitEconomics,
} from './kinds-concept-business-operations';

function fixture(preset: string) {
  const found = businessFixtures.find((fx) => fx.scene.preset === preset);
  if (!found) throw new Error(`Missing fixture ${preset}`);
  return found;
}

function parse(fx: (typeof businessFixtures)[number], raw: Rec = fx.plannerInput) {
  const ctx = fixtureContext(fx);
  const result =
    fx.scene.kind === 'market-exchange'
      ? parseMarketExchange(raw, ctx)
      : fx.scene.kind === 'resource-allocation'
        ? parseResourceAllocation(raw, ctx)
        : parseUnitEconomics(raw, ctx);
  return { result, issues: ctx.issues };
}

/** Keep all evidence boundaries valid after adversarial edits, so grammar itself is tested. */
function amend(preset: string, from: string, to: string) {
  const fx = fixture(preset);
  let index = 0;
  const plannerInput = { ...fx.plannerInput };
  const sourceBeats = fx.sourceBeats.map((beat, i) => {
    plannerInput[`${['setup', 'action', 'response', 'check', 'resolve'][i]}Word`] = index;
    const text = beat.text.replace(from, to);
    index += text.split(/\s+/).length;
    return { ...beat, text };
  });
  plannerInput.endWord = index - 1;
  return {
    ...fx,
    plannerInput,
    sourceBeats,
    sourceText: sourceBeats.map((beat) => beat.text).join(' '),
  };
}

describe('all eight authored business fixtures', () => {
  it('covers the frozen 3-kind/8-preset contract with five source storyboards and samples each', () => {
    expect(businessFixtures).toHaveLength(8);
    expect(businessFixtures.map((fx) => `${fx.scene.kind}/${fx.scene.preset}`).sort()).toEqual(
      Object.entries(BUSINESS_OPERATIONS_PRESETS)
        .flatMap(([kind, presets]) => presets.map((preset) => `${kind}/${preset}`))
        .sort(),
    );
    for (const fx of businessFixtures) {
      expect(fx.sourceBeats).toHaveLength(5);
      expect(fx.samples).toHaveLength(5);
      expect(fx.sourceBeats.every((beat) => beat.storyboard.length > 20)).toBe(true);
      expect(fx.plannerInput.startWord).toBe(0);
      expect(fx.plannerInput.endWord).toBe(fx.sourceText.split(/\s+/).length - 1);
      expect(fx.plannerInput.layout).toBe('stack');
      expect(fx.cases.some((entry) => entry.layout === 'over' && entry.aspect === '16:9')).toBe(
        true,
      );
    }
  });
  it.each(businessFixtures)('$name raw payload equals the complete uniformly timed scene', (fx) => {
    const { result, issues } = parse(fx);
    expect(result, issues.join('; ')).toEqual(fx.scene);
  });
  it.each(
    businessFixtures,
  )('$name rejects invented labels, presets and collapsed/out-of-window beats', (fx) => {
    for (const patch of [
      { label: 'Fabricated business claim' },
      { preset: 'random' },
      { actionWord: fx.plannerInput.setupWord },
      { resolveWord: 9999 },
      { checkWord: -1 },
      { responseWord: 1.5 },
    ]) {
      const parsed = parse(fx, { ...fx.plannerInput, ...patch });
      expect(parsed.result).toBeNull();
      expect(parsed.issues.length).toBeGreaterThan(0);
    }
  });
  it('preserves a complete source condition and rejects omitted/truncated conditions', () => {
    const fx = {
      ...amend('direct-sale', 'Direct sale.', 'Direct sale. If the buyer accepts,'),
      durationSec: 10,
    };
    expect(parse(fx).result).toBeNull();
    expect(parse(fx, { ...fx.plannerInput, condition: 'If the buyer' }).result).toBeNull();
    const parsed = parse(fx, { ...fx.plannerInput, condition: 'If the buyer accepts' });
    expect(parsed.result, parsed.issues.join('; ')).toMatchObject({
      condition: 'If the buyer accepts',
      kind: 'market-exchange',
    });
  });
  it('supplies families, source triggers, avoidance, cues and the real long-form over layout', () => {
    for (const spec of CONCEPT_BUSINESS_OPERATIONS_SPECS) {
      expect(spec.layouts).toContain('over');
      expect(spec.avoid.length).toBeGreaterThan(30);
      expect(spec.triggers.length).toBeGreaterThan(0);
      expect(spec.family).toBeTruthy();
    }
  });
});

describe('bounded scalar and relationship validation', () => {
  it.each([
    'platform-fee',
    'direct-sale',
  ])('%s rejects coercions, infinities and fractional cents', (preset) => {
    const fx = fixture(preset);
    for (const amount of ['12', NaN, Infinity, -12, 0, 12.001, 1000001])
      expect(parse(fx, { ...fx.plannerInput, amount }).result).toBeNull();
  });
  it.each([
    ['platform-fee', 'Market keeps 2 dollars as fee', 'Maker keeps 2 dollars as fee'],
    ['platform-fee', 'Market pays 10 dollars', 'Market pays 12 dollars'],
    ['platform-fee', 'Buyer pays 12 dollars', 'Buyer pays 12 euros'],
    ['platform-fee', 'Market keeps 2 dollars as fee', 'Market might keep 2 dollars as fee'],
    ['unmatched-market', 'Buyer finds no match', 'Buyer finds a match'],
    ['unmatched-market', 'Buyer makes no payment', 'Buyer makes a payment'],
    ['reallocate', 'Design receives 2 hours from Testing', 'Testing receives 2 hours from Design'],
    ['reallocate', 'Testing gives up 2 hours', 'Design gives up 2 hours'],
    ['reallocate', 'Capacity has 8 hours', 'Capacity has 80 hours'],
    ['reallocate', 'Design requests 6 hours', 'Design requests -6 hours'],
    [
      'constrained-projects',
      'Project implementation lacks 2 hours',
      'Project implementation lacks 1 hours',
    ],
    ['positive-margin', 'Materials costs 5 dollars', 'Materials costs -5 dollars'],
    [
      'positive-margin',
      'Delivery costs 3 dollars per one parcel',
      'Delivery costs 3 dollars per two parcels',
    ],
    ['positive-margin', 'Stated costs total 8 dollars', 'Stated costs total 9 dollars'],
    ['positive-margin', 'Stated-cost remainder is 4 dollars', 'Net profit is 4 dollars'],
    ['negative-margin', 'leaves -2 dollars', 'leaves 2 dollars'],
    ['break-even', 'leaves 0 dollars', 'leaves 1 dollars'],
  ])('%s rejects mismatched local claim %s', (preset, from, to) => {
    const fx = amend(preset, from, to);
    expect(fx.sourceText).not.toBe(fixture(preset).sourceText);
    const parsed = parse(fx);
    expect(parsed.result, parsed.issues.join('; ')).toBeNull();
  });
  it.each([
    'reallocate',
    'constrained-projects',
  ])('%s rejects invented/non-conserved/unbounded allocations', (preset) => {
    const fx = fixture(preset);
    if (fx.scene.kind !== 'resource-allocation') throw new Error('Wrong fixture');
    const projects = fx.scene.projects.map(({ label, before, after, requested }) => ({
      label,
      before,
      after,
      requested,
    }));
    for (const total of [0, 9, 13, -8, 8.1, Infinity, '8'])
      expect(parse(fx, { ...fx.plannerInput, total }).result).toBeNull();
    for (const field of ['before', 'after', 'requested'])
      expect(
        parse(fx, {
          ...fx.plannerInput,
          projects: projects.map((p, i) => (i === 0 ? { ...p, [field]: 13 } : p)),
        }).result,
      ).toBeNull();
    expect(
      parse(fx, { ...fx.plannerInput, projects: [projects[0], projects[0]] }).result,
    ).toBeNull();
  });
  it.each([
    'positive-margin',
    'break-even',
    'negative-margin',
  ])('%s rejects invented denominator, omitted costs and wrong sign', (preset) => {
    const fx = fixture(preset);
    if (fx.scene.kind !== 'unit-economics') throw new Error('Wrong fixture');
    for (const patch of [
      { saleUnit: undefined },
      { saleUnit: 'one hour' },
      { unit: 'euros' },
      { remainder: fx.scene.remainder + 1 },
      { remainder: '0' },
      { costs: [] },
      { costs: [fx.scene.costs[0]] },
      { revenue: Infinity },
    ])
      expect(parse(fx, { ...fx.plannerInput, ...patch }).result).toBeNull();
  });
  it('does not synthesize a payment for unmatched participants', () => {
    const fx = fixture('unmatched-market');
    for (const patch of [{ amount: 12 }, { unit: 'dollars' }, { fee: 2 }, { platform: 'Maker' }])
      expect(parse(fx, { ...fx.plannerInput, ...patch }).result).toBeNull();
  });
});

const pilot = businessFixtures.find((fx) => fx.name === 'market-exchange-direct-sale');
if (!pilot) throw new Error('Missing direct-sale fixture');

describe('source-bound two-sided direct sale', () => {
  it('parses the actual uniformly timed fixture including exact beat times', () => {
    const ctx = fixtureContext(pilot);
    expect(parseMarketExchange(pilot.plannerInput, ctx), ctx.issues.join('; ')).toEqual(
      pilot.scene,
    );
  });
  it.each([
    ['reversed payer', 'Buyer pays', 'Maker pays'],
    ['wrong owner', 'Maker owns', 'Buyer owns'],
    ['wrong recipient', 'to Buyer.', 'to Maker.'],
    ['negated payment', 'Buyer pays', "Buyer doesn't pay"],
    ['proposed payment', 'Buyer pays', 'Buyer might pay'],
    ['signed amount', '12 dollars', '-12 dollars'],
    ['wrong received amount', 'receives 12', 'receives 14'],
  ])('rejects %s', (_name, from, to) => {
    expect(
      parseMarketExchange(
        pilot.plannerInput,
        fixtureContext(pilot, pilot.sourceText.replace(from, to)),
      ),
    ).toBeNull();
  });
  it('does not invent a fee for direct sale', () => {
    expect(
      parseMarketExchange({ ...pilot.plannerInput, fee: 2 }, fixtureContext(pilot)),
    ).toBeNull();
  });
});
