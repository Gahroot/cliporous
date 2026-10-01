import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  collectSceneTimes,
  type ExplainerSceneBody,
  LEAK_SEAL_SECONDS,
  mapSceneTimes,
} from '../../remotion/compositions/explainer/types';
import { parseExplainerPlan } from '../explainer-scenes';
import { makeParseContext, type PlannerWord, type Rec } from './kind-spec';
import { getKindSpec } from './kinds';
import { buildShortlist, SHORTLIST_LIMITS } from './shortlist';

interface BusinessFixture {
  name: string;
  exampleMaterial: boolean;
  sourceText: string;
  timed: { startSec: number; stepSec: number; wordDurationSec: number; sceneStartSec: number };
  raw: Rec & { kind: string; startWord: number; endWord: number };
  durationSec: number;
  scene: ExplainerSceneBody;
  contact: { event: string; atSec: number };
  samples: { name: string; frame: number }[];
  cases: { name: string; aspect: string; layout: string }[];
  covers?: { category: string; id: string }[];
}

// Authored examples, not customer evidence. One source/raw/timing record drives
// both the real parser tests and the render fixtures; no duplicated scene builder.
const fixtures: BusinessFixture[] = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/business-scenarios.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const bounds = { minStart: 0, maxEnd: 60 };
const rounded = (value: number) => Number(value.toFixed(6));

function wordsFor(fixture: BusinessFixture): PlannerWord[] {
  const { startSec, stepSec, wordDurationSec } = fixture.timed;
  return fixture.sourceText.split(/\s+/).map((text, i) => ({
    text,
    start: rounded(startSec + i * stepSec),
    end: rounded(startSec + i * stepSec + wordDurationSec),
  }));
}

function parse(fixture: BusinessFixture, patch: Rec = {}) {
  const spec = getKindSpec(fixture.raw.kind);
  if (!spec) throw new Error(`Missing kind ${fixture.raw.kind}`);
  const ctx = makeParseContext(wordsFor(fixture), {
    startWord: fixture.raw.startWord,
    endWord: fixture.raw.endWord,
    startTime: fixture.timed.sceneStartSec,
    endTime: rounded(fixture.timed.sceneStartSec + fixture.durationSec),
  });
  return { scene: spec.parse({ ...fixture.raw, ...patch }, ctx), issues: ctx.issues };
}

function businessFixture(name: string): BusinessFixture {
  const fixture = fixtures.find((entry) => entry.name === name);
  if (!fixture) throw new Error(`Missing fixture ${name}`);
  return fixture;
}

// Recipe evidence only: this does NOT add source validation to legacy parsers.
function expectSourceLabels(source: string, labels: string[]) {
  const normalize = (text: string) => text.toLowerCase().replace(/[.,:;!?]/g, '');
  for (const label of labels) {
    expect(` ${normalize(source)} `).toContain(` ${normalize(label)} `);
  }
}

it('keeps exactly six example recipes and only manifest-recognized kind coverage', () => {
  expect(fixtures.map((fixture) => fixture.name)).toEqual([
    'business-sales-approval',
    'business-support-backlog',
    'business-recurring-resource-loss',
    'business-demand-capacity',
    'business-content-reinvestment',
    'business-revenue-margin',
  ]);
  for (const fixture of fixtures) {
    expect(fixture.exampleMaterial).toBe(true);
    expect(fixture.raw.kind).toBe(fixture.scene.kind);
    expect(fixture.covers ?? []).toEqual(
      ['bottleneck', 'resource-leak', 'feedback-control'].includes(fixture.scene.kind)
        ? [{ category: 'kind', id: fixture.scene.kind }]
        : [],
    );
    expect(fixture.sourceText).not.toMatch(
      /\b(gate|tank|reservoir|leak|sensor|valve|gauge|flywheel)\b/i,
    );
  }
});

describe.each(fixtures)('$name: ordinary-business example', (fixture) => {
  it('offers the intended kind through the real ordinary-language shortlist', () => {
    // Keep genuine selection regressions visible. Do not add mechanical nouns
    // to these sources or bypass the shortlist with a fixture-specific spec list.
    const shortlist = buildShortlist(wordsFor(fixture));
    expect(shortlist.kinds.length).toBeLessThanOrEqual(SHORTLIST_LIMITS.maxKinds);
    expect(shortlist.heroProps.length).toBeLessThanOrEqual(SHORTLIST_LIMITS.maxProps);
    expect(shortlist.scores[fixture.raw.kind] ?? 0, fixture.sourceText).toBeGreaterThan(0);
    expect(shortlist.kinds.map((spec) => spec.kind)).toContain(fixture.raw.kind);
  });

  it('parses source-indexed beats at nonzero absolute times into the exact fixture body', () => {
    const words = wordsFor(fixture);
    expect(fixture.raw.startWord).toBe(0);
    expect(fixture.raw.endWord).toBe(words.length - 1);
    expect(words[0].start).toBeGreaterThan(0);
    const { scene, issues } = parse(fixture);
    expect(issues).toEqual([]);
    expect(scene).not.toBeNull();
    if (!scene) throw new Error('Expected a parsed business example');
    const local = mapSceneTimes(scene, (at) => rounded(at - fixture.timed.sceneStartSec));
    expect(local).toEqual(fixture.scene);
    for (const at of collectSceneTimes(local)) {
      expect(Number.isFinite(at)).toBe(true);
      expect(at).toBeGreaterThanOrEqual(0.3);
      expect(at).toBeLessThan(fixture.durationSec);
    }
    if ('label' in scene) expectSourceLabels(fixture.sourceText, [scene.label]);
  });

  it('also survives the production plan parser with the same window, body and contact cue', () => {
    const plan = parseExplainerPlan({ scenes: [fixture.raw] }, wordsFor(fixture), bounds);
    expect(plan).toHaveLength(1);
    const parsed = plan[0];
    expect(parsed.startTime).toBe(fixture.timed.sceneStartSec);
    expect(parsed.endTime - parsed.startTime).toBeCloseTo(fixture.durationSec);
    expect(parsed.layout).toBe('stack');
    expect(mapSceneTimes(parsed.scene, (at) => rounded(at - parsed.startTime))).toEqual(
      fixture.scene,
    );
    expect(
      parsed.cues.some((cue) => Math.abs(cue.at - parsed.startTime - fixture.contact.atSec) < 1e-6),
    ).toBe(true);
    for (const cue of parsed.cues) {
      expect(Number.isFinite(cue.at)).toBe(true);
      expect(cue.at).toBeGreaterThanOrEqual(parsed.startTime);
      expect(cue.at).toBeLessThan(parsed.endTime);
    }
  });

  it('records the actual dispatcher layout boundary rather than claiming loop accepts over', () => {
    const plan = parseExplainerPlan(
      { scenes: [{ ...fixture.raw, layout: 'over' }] },
      wordsFor(fixture),
      bounds,
    );
    expect(plan).toHaveLength(1);
    // The longform renderer maps stack to over; the legacy loop spec itself does not.
    expect(plan[0].layout).toBe(fixture.scene.kind === 'loop' ? 'stack' : 'over');
  });

  it('provides native stack/landscape cases and bounded setup, contact and final samples', () => {
    expect(fixture.cases).toEqual([
      { name: 'vertical-stack', aspect: '9:16', layout: 'stack' },
      { name: 'landscape-over', aspect: '16:9', layout: 'over' },
    ]);
    const frame = (name: string) => {
      const sample = fixture.samples.find((entry) => entry.name === name);
      if (!sample) throw new Error(`Missing ${name} sample`);
      return sample.frame;
    };
    for (const sample of fixture.samples) {
      expect(Number.isInteger(sample.frame)).toBe(true);
      expect(sample.frame).toBeGreaterThanOrEqual(0);
      expect(sample.frame).toBeLessThan(Math.round(fixture.durationSec * 30));
    }
    const beats = collectSceneTimes(fixture.scene);
    expect(frame('setup') / 30).toBeLessThan(Math.min(...beats));
    expect(frame('contact')).toBe(Math.ceil(fixture.contact.atSec * 30));
    expect(frame('before-contact')).toBe(frame('contact') - 1);
    expect(frame('after-contact')).toBe(frame('contact') + 1);
    expect(frame('hold') / 30 - Math.max(...beats)).toBeGreaterThanOrEqual(0.5);
    if (fixture.scene.kind === 'resource-leak') {
      expect(fixture.contact.atSec).toBeCloseTo(fixture.scene.sealAt + LEAK_SEAL_SECONDS);
    }
  });
});

describe('selection negatives, not semantic-parser guarantees', () => {
  it.each([
    {
      text: 'Our agenda mentions sales, approvals, support, subscriptions, demand, capacity, content, leads, revenue, and reinvestment.',
      absent: ['bottleneck', 'resource-leak', 'feedback-control', 'loop', 'momentum'],
    },
    {
      text: 'Sales handoff requests arrive, but approval is only a topic on the agenda.',
      absent: ['bottleneck'],
    },
    {
      text: 'Revenue arrives each month. The report lists subscriptions and costs, without saying what was cancelled or retained.',
      absent: ['resource-leak'],
    },
    {
      text: 'Demand exceeds available capacity. We measure workload, but no staffing adjustment or return to target is reported.',
      absent: ['feedback-control'],
    },
    {
      text: 'The team calls content, leads, revenue, and reinvestment a flywheel, but describes no repeated pushes or driven output.',
      absent: ['momentum'],
    },
  ])('does not infer a causal mechanism from "$text"', ({ text, absent }) => {
    const words = text
      .split(/\s+/)
      .map((word, i) => ({ text: word, start: i * 0.3, end: i * 0.3 + 0.2 }));
    const shortlist = buildShortlist(words);
    for (const kind of absent) {
      expect(shortlist.scores[kind] ?? 0, kind).toBe(0);
      expect(shortlist.kinds.map((spec) => spec.kind)).not.toContain(kind);
    }
  });

  it('keeps the actual content feedback recipe a loop, not mechanical momentum', () => {
    const fixture = businessFixture('business-content-reinvestment');
    const shortlist = buildShortlist(wordsFor(fixture));
    expect(shortlist.kinds.map((spec) => spec.kind)).toContain('loop');
    expect(shortlist.kinds.map((spec) => spec.kind)).not.toContain('momentum');
    const { scene } = parse(fixture);
    if (scene?.kind !== 'loop') throw new Error('Expected a loop');
    expectSourceLabels(fixture.sourceText, [
      ...scene.stages.map((stage) => stage.label),
      scene.center ?? '',
    ]);
    expect(scene.stages.map((stage) => stage.label)).toEqual([
      'Content',
      'Leads',
      'Revenue',
      'Reinvestment',
    ]);
  });
});

const mechanisms = fixtures.filter((fixture) =>
  ['bottleneck', 'resource-leak', 'feedback-control'].includes(fixture.raw.kind),
);

describe.each(mechanisms)('$name: supported mechanism-parser rejections', (fixture) => {
  it.each([
    'Revenue doubles',
    'Savings $99,999',
    'Margin 50%',
    'Zero costs',
  ])('rejects unsupported display copy or values: %s', (label) => {
    const result = parse(fixture, { label });
    expect(result.scene).toBeNull();
    expect(result.issues.join(' ')).toContain('label must quote a phrase');
  });

  it('does not synthesize missing or unordered correction/release beats', () => {
    const fields =
      fixture.raw.kind === 'bottleneck'
        ? ['queueWord', 'openWord']
        : fixture.raw.kind === 'resource-leak'
          ? ['leakWord', 'sealWord']
          : ['senseWord', 'correctWord'];
    const [previous, correction] = fields;
    expect(parse(fixture, { [correction]: undefined }).scene).toBeNull();
    const reversed = parse(fixture, { [correction]: fixture.raw[previous] });
    expect(reversed.scene).toBeNull();
    expect(reversed.issues.join(' ')).toContain('source index order');
  });
});

describe('receipt recipe evidence (not legacy parser arithmetic validation)', () => {
  const fixture = businessFixture('business-revenue-margin');

  it('uses only explicitly supplied amounts, including the margin, with source-supported subtraction', () => {
    const { scene } = parse(fixture);
    if (scene?.kind !== 'receipt') throw new Error('Expected a receipt');
    const supplied = fixture.sourceText.match(/\$\d[\d,]*\d/g);
    const amounts = [...scene.lines.map((line) => line.amount), scene.total.amount];
    expect(supplied).toEqual(['$12,000', '$7,500', '$4,500']);
    expect(amounts).toEqual(supplied);
    expectSourceLabels(fixture.sourceText, [
      scene.title,
      ...scene.lines.map((line) => line.label),
      scene.total.label,
    ]);
    expect(scene.lines[1].label).toBe('Minus costs');
    const [revenue, costs, statedMargin] = amounts.map((amount) =>
      Number(amount.replace(/[$,]/g, '')),
    );
    expect(revenue - costs).toBe(statedMargin); // Check the supplied result; never generate it.
    const words = wordsFor(fixture);
    for (const [index, amount] of [
      [4, '$12,000'],
      [8, '$7,500'],
      [14, '$4,500'],
    ] as const) {
      expect(words[index].text.replace(/[,.;]$/, '')).toBe(amount);
    }
  });

  it.each([
    undefined,
    null,
    '',
    4500,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '$123456789',
  ])('rejects a missing, non-string or overlong total amount: %s', (amount) => {
    // Receipt validates bounded strings, NOT the truth of arbitrary short strings.
    expect(parse(fixture, { total: { label: 'Margin', amount } }).scene).toBeNull();
  });
});
