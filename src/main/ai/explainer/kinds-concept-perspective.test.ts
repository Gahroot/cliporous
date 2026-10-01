import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import {
  PERSPECTIVE_FIXTURES,
  type PerspectiveFixture,
} from '../../remotion/compositions/explainer/concepts/perspective/fixture-data';
import {
  CHIP_RAW,
  CHIP_SCENE,
  CHIP_SOURCE,
  FIXTURE_DURATION,
  sourceFixture,
} from '../../remotion/compositions/explainer/concepts/perspective/fixtures';
import { PERSPECTIVE_PRESETS } from '../../remotion/compositions/explainer/concepts/perspective/types';
import { parsePlanWithDiagnostics } from '../explainer-scenes';
import { isRec, makeParseContext, type Rec } from './kind-spec';
import { CONCEPT_PERSPECTIVE_SPECS, parseScaleHierarchy } from './kinds-concept-perspective';

function context(sentences = CHIP_SOURCE) {
  const source = sourceFixture(sentences);
  return makeParseContext(source.words, {
    startWord: 0,
    endWord: source.words.length - 1,
    startTime: 0,
    endTime: FIXTURE_DURATION,
  });
}

function parse(raw: Rec, sentences: string[]) {
  const spec = CONCEPT_PERSPECTIVE_SPECS.find((s) => s.kind === raw.kind);
  if (!spec) throw new Error('missing owned spec');
  const ctx = context(sentences);
  return { scene: spec.parse(raw, ctx), issues: ctx.issues };
}

/** Reindex all source spans after editing a complete sentence; do not test stale indices. */
function revised(fixture: PerspectiveFixture, changes: Record<number, string>) {
  const sentences = fixture.sentences.map((s, i) => changes[i] ?? s);
  const old = sourceFixture(fixture.sentences);
  const source = sourceFixture(sentences);
  const raw = structuredClone(fixture.raw);
  function reindex(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(reindex);
      return;
    }
    if (!isRec(value)) return;
    if ('evidenceStartWord' in value) {
      const index = old.ranges.findIndex((r) => r.evidenceStartWord === value.evidenceStartWord);
      Object.assign(value, source.ranges[index]);
    }
    Object.values(value).forEach(reindex);
  }
  reindex(raw);
  Object.assign(raw, source.beats, { endWord: source.words.length - 1 });
  return { raw, sentences };
}

function fixture(preset: string): PerspectiveFixture {
  const found = PERSPECTIVE_FIXTURES.find((f) => f.scene.preset === preset);
  if (!found) throw new Error(`missing ${preset}`);
  return found;
}

function entry(raw: Rec, field: string, index?: number): Rec {
  const value =
    index === undefined ? raw[field] : Array.isArray(raw[field]) ? raw[field][index] : undefined;
  if (!isRec(value)) throw new Error(`missing ${field}`);
  return value;
}

const fixturePath = 'scripts/explainer-stills/fixtures/concept-perspective.json';
const json: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));
if (!Array.isArray(json)) throw new Error('expected fixture array');

// Explicit artifact-authoring mode; normal verification never rewrites fixtures.
// UPDATE_PERSPECTIVE_FIXTURES=1 npx vitest run --config vitest.config.main.ts src/main/ai/explainer/kinds-concept-perspective.test.ts
if (process.env.UPDATE_PERSPECTIVE_FIXTURES === '1') {
  for (const stored of json) {
    if (
      !isRec(stored) ||
      !isRec(stored.plannerInput) ||
      typeof stored.sourceText !== 'string' ||
      typeof stored.durationSec !== 'number'
    )
      throw new Error('invalid fixture metadata');
    const plannerInput = stored.plannerInput;
    const words = conceptFixtureWords(stored.sourceText, stored.durationSec);
    const parsed = parsePlanWithDiagnostics({ scenes: [plannerInput] }, words, {
      minStart: 0,
      maxEnd: 60,
    });
    const planned = parsed.accepted[0];
    if (!planned || parsed.accepted.length !== 1 || parsed.rejected.length || parsed.omitted.length)
      throw new Error(`Cannot author fixture: ${JSON.stringify(parsed)}`);
    const scene = planned.scene;
    if (
      scene.kind !== 'scale-hierarchy' &&
      scene.kind !== 'possible-futures' &&
      scene.kind !== 'digital-twin'
    )
      throw new Error('unexpected fixture kind');
    stored.scene = scene;
    stored.sourceBeats = [
      'setupWord',
      'actionWord',
      'responseWord',
      'checkWord',
      'resolveWord',
    ].map((field) => {
      const word = plannerInput[field];
      if (typeof word !== 'number' || !Number.isInteger(word) || !words[word])
        throw new Error('invalid source beat index');
      return { field, word, at: words[word].start };
    });
    stored.samples = [
      { name: 'setup', frame: Math.round(((scene.setupAt + scene.actionAt) / 2) * 30) },
      { name: 'first-change', frame: Math.round(((scene.actionAt + scene.responseAt) / 2) * 30) },
      { name: 'relationship', frame: Math.round(((scene.responseAt + scene.checkAt) / 2) * 30) },
      { name: 'comparison', frame: Math.round(((scene.checkAt + scene.resolveAt) / 2) * 30) },
      { name: 'final-hold', frame: Math.round(((scene.resolveAt + stored.durationSec) / 2) * 30) },
    ];
  }
  writeFileSync(fixturePath, `${JSON.stringify(json, null, 2)}\n`);
}

describe('Pack E all-six planner and renderer payload contracts', () => {
  it('exports precisely three specs, six unique presets and long-form over support', () => {
    expect(CONCEPT_PERSPECTIVE_SPECS.map((s) => s.kind)).toEqual(Object.keys(PERSPECTIVE_PRESETS));
    expect(PERSPECTIVE_FIXTURES).toHaveLength(6);
    expect(json).toHaveLength(6);
    for (const spec of CONCEPT_PERSPECTIVE_SPECS) expect(spec.layouts).toContain('over');
    expect(new Set(PERSPECTIVE_FIXTURES.map((f) => f.scene.preset)).size).toBe(6);
  });

  it.each(PERSPECTIVE_FIXTURES)('$scene.preset has exact raw→parser→JSON scene parity', (fx) => {
    const stored: unknown = json.find(
      (value: unknown) =>
        isRec(value) && isRec(value.scene) && value.scene.preset === fx.scene.preset,
    );
    if (!isRec(stored) || !isRec(stored.plannerInput))
      throw new Error('missing actual plannerInput');
    expect(stored.sourceText).toBe(fx.sentences.join(' '));
    expect(stored.plannerInput).toEqual(fx.raw);
    const local = parse(stored.plannerInput, fx.sentences);
    expect(local.issues).toEqual([]);
    expect(local.scene).toEqual(fx.scene);
    expect(local.scene).toEqual(stored.scene);
    const source = sourceFixture(fx.sentences);
    // A real plan has talking-head time too: a full-window standalone fixture must
    // not accidentally exceed the 55% coverage budget of the global planner.
    const planned = parsePlanWithDiagnostics({ scenes: [stored.plannerInput] }, source.words, {
      minStart: 0,
      maxEnd: 60,
    });
    expect(planned.rejected).toEqual([]);
    expect(planned.omitted).toEqual([]);
    expect(planned.accepted).toHaveLength(1);
    expect(planned.accepted[0]?.scene).toEqual(stored.scene);
    expect(planned.accepted[0]?.startTime).toBe(0);
    // Padded speech plus production lead-in/tail exactly recovers the fixture window.
    expect(planned.accepted[0]?.endTime).toBeCloseTo(FIXTURE_DURATION, 8);
    expect(source.words[0]?.start).toBe(0.25);
    expect(source.words.at(-1)?.end).toBeCloseTo(FIXTURE_DURATION - 0.35, 8);
    expect(stored.sourceBeats).toEqual(
      ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'].map((field) => {
        const word = fx.raw[field];
        if (typeof word !== 'number' || !source.words[word])
          throw new Error('invalid fixture source index');
        return { field, word, at: source.words[word].start };
      }),
    );
    expect(stored.storyboard).toHaveLength(5);
    expect(stored.samples).toHaveLength(5);
    for (const layout of ['stack-flipped', 'over']) {
      const variant = parsePlanWithDiagnostics(
        { scenes: [{ ...stored.plannerInput, layout, continues: true, transition: 'fade' }] },
        source.words,
        { minStart: 0, maxEnd: 60 },
      );
      expect(variant.rejected).toEqual([]);
      expect(variant.accepted[0]?.layout).toBe(layout);
      expect(variant.accepted[0]?.scene).toEqual(stored.scene);
    }
  });

  it.each(
    PERSPECTIVE_FIXTURES,
  )('$scene.preset rejects malformed beats, fields, invented outcomes and compressed time', (fx) => {
    for (const patch of [
      { preset: 'magic' },
      { actionWord: 0 },
      { responseWord: Number.NaN },
      { checkWord: 0.5 },
      { resolveWord: 9999 },
      { probability: 0.9 },
      { winner: 'invented' },
      { outcome: 'fabricated profit' },
      { condition: 'if made up' },
    ]) {
      const result = parse({ ...fx.raw, ...patch }, fx.sentences);
      expect(result.scene, JSON.stringify(patch)).toBeNull();
      expect(result.issues.length).toBeGreaterThan(0);
    }
    const ctx = context(fx.sentences);
    ctx.words.forEach((w) => {
      w.start *= 0.1;
      w.end *= 0.1;
    });
    const spec = CONCEPT_PERSPECTIVE_SPECS.find((s) => s.kind === fx.scene.kind);
    expect(spec?.parse(fx.raw, ctx)).toBeNull();
  });

  it.each(
    PERSPECTIVE_FIXTURES,
  )('$scene.preset accepts the 12-second boundary without padding overflow', (fx) => {
    const words = conceptFixtureWords(fx.sentences.join(' '), 12);
    const result = parsePlanWithDiagnostics({ scenes: [fx.raw] }, words, {
      minStart: 0,
      maxEnd: 60,
    });
    expect(result.rejected).toEqual([]);
    expect(result.omitted).toEqual([]);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.startTime).toBe(0);
    expect(result.accepted[0]?.endTime).toBe(12);
  });

  it('retains the approved chip parser payload', () => {
    expect(parseScaleHierarchy(CHIP_RAW, context())).toEqual(CHIP_SCENE);
  });

  it.each([
    ['chip-to-center', 1, 'The Atlas chip is not inside the server.'],
    ['chip-to-center', 1, 'The server sits inside the Atlas chip.'],
    ['chip-to-center', 1, 'The Atlas chip could sit inside the server.'],
    ['chip-to-center', 1, 'The unrelated chip sits inside the server.'],
    ['customer-to-market', 1, 'The local segment belongs to the original customer.'],
    ['customer-to-market', 2, 'The local segment is not within the wider market.'],
    ['customer-to-market', 4, 'The original customer leaves the wider market.'],
  ] as const)('rejects false hierarchy: %s %s', (preset, index, sentence) => {
    const changed = revised(fixture(preset), { [index]: sentence });
    expect(parse(changed.raw, changed.sentences).scene).toBeNull();
  });

  it.each([
    ['branching-scenarios', 1, 'The packing line could not have lower capacity.'],
    ['branching-scenarios', 1, 'The other line could have lower capacity.'],
    ['branching-scenarios', 1, 'The packing line will have lower capacity.'],
    ['branching-scenarios', 1, 'The packing line could have lower capacity with 80% probability.'],
    [
      'branching-scenarios',
      4,
      'For the packing line, no outcome is certain but higher capacity will win.',
    ],
    ['forecast-range', 3, 'The range does not span lower capacity to higher capacity.'],
    [
      'forecast-range',
      4,
      'For the packing line, no single forecast is certain but higher capacity is selected.',
    ],
  ] as const)('rejects false futures: %s %s', (preset, index, sentence) => {
    const changed = revised(fixture(preset), { [index]: sentence });
    expect(parse(changed.raw, changed.sentences).scene).toBeNull();
  });

  it('preserves local conditions instead of turning conditional capacity into fact', () => {
    const changed = revised(fixture('branching-scenarios'), {
      1: 'The packing line could have lower capacity if demand falls.',
    });
    expect(parse(changed.raw, changed.sentences).scene).toBeNull();
    const kept = parse({ ...changed.raw, condition: 'if demand falls' }, changed.sentences);
    expect(kept.scene, kept.issues.join('; ')).toMatchObject({ condition: 'if demand falls' });
  });

  it.each([
    'branching-scenarios',
    'forecast-range',
  ])('rejects duplicate/inverted/unsupported alternatives: %s', (preset) => {
    const fx = fixture(preset);
    for (const patch of [
      { change: 'winning' },
      { change: 'expanded' },
      { label: 'invented capacity' },
      { qualifier: 'guaranteed capacity' },
      { weight: 0.9 },
      { evidenceStartWord: -1 },
      { evidenceEndWord: 999 },
    ]) {
      const raw = structuredClone(fx.raw);
      Object.assign(entry(raw, 'alternatives', 0), patch);
      expect(parse(raw, fx.sentences).scene, JSON.stringify(patch)).toBeNull();
    }
    expect(parse({ ...fx.raw, alternatives: [] }, fx.sentences).scene).toBeNull();
    expect(parse({ ...fx.raw, uncertainty: 'certain' }, fx.sentences).scene).toBeNull();
  });

  it.each([
    ['mirror-state', 1, 'The actual conveyor might have a closed safety gate.'],
    ['mirror-state', 2, "The digital model does not mirror the actual conveyor's safety gate."],
    ['mirror-state', 2, "The actual conveyor mirrors the digital model's safety gate."],
    ['mirror-state', 4, 'The actual conveyor and digital model remain open.'],
    [
      'simulated-change',
      3,
      'The actual conveyor simulates opening the safety gate, simulation only.',
    ],
    [
      'simulated-change',
      3,
      'The digital model never simulates opening the safety gate, simulation only.',
    ],
    [
      'simulated-change',
      4,
      'The actual conveyor remains open and the digital model remains simulated.',
    ],
  ] as const)('rejects conflated twin state: %s %s', (preset, index, sentence) => {
    const changed = revised(fixture(preset), { [index]: sentence });
    expect(parse(changed.raw, changed.sentences).scene).toBeNull();
  });

  it.each([
    'The digital model simulates closing the safety gate beside an open panel, simulation only.',
    'The digital model simulates opening the safety gate and the digital model simulates closing the safety gate, simulation only.',
  ])('binds the simulated direction to the named gate action: %s', (sentence) => {
    const changed = revised(fixture('simulated-change'), { 3: sentence });
    expect(parse(changed.raw, changed.sentences).scene).toBeNull();
  });

  it('does not confuse a separate closed panel with the simulated opening action', () => {
    const changed = revised(fixture('simulated-change'), {
      3: 'The digital model simulates opening the safety gate beside a closed panel, simulation only.',
    });
    expect(parse(changed.raw, changed.sentences).scene).toMatchObject({ simulatedState: 'open' });
  });

  it.each([
    'mirror-state',
    'simulated-change',
  ])('rejects malformed/unbound twin state: %s', (preset) => {
    const fx = fixture(preset);
    for (const patch of [
      { state: 'open' },
      { state: 'winning' },
      { label: 'digital model' },
      { evidenceStartWord: 999 },
      { geometry: 'hologram' },
    ]) {
      const raw = structuredClone(fx.raw);
      Object.assign(entry(raw, 'physical'), patch);
      expect(parse(raw, fx.sentences).scene).toBeNull();
    }
    expect(parse({ ...fx.raw, qualifier: 'live telemetry' }, fx.sentences).scene).toBeNull();
    expect(parse({ ...fx.raw, partLabel: 'rocket' }, fx.sentences).scene).toBeNull();
  });

  it('rejects cropped evidence, source-window borrowing and invented model intervention', () => {
    const raw = structuredClone(CHIP_RAW);
    raw.levels[0] = { label: 'server', evidenceStartWord: 10, evidenceEndWord: 14 };
    expect(parseScaleHierarchy(raw, context())).toBeNull();
    const ctx = context();
    ctx.win.startWord = 8;
    expect(parseScaleHierarchy(CHIP_RAW, ctx)).toBeNull();
    const mirror = fixture('mirror-state');
    expect(
      parse({ ...mirror.raw, intervention: { state: 'open' } }, mirror.sentences).scene,
    ).toBeNull();
    const simulation = fixture('simulated-change');
    const payload = structuredClone(simulation.raw);
    entry(payload, 'intervention').state = 'closed';
    expect(parse(payload, simulation.sentences).scene).toBeNull();
  });
});
