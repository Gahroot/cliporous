import { describe, expect, it } from 'vitest';
import {
  informationBody,
  informationContext,
  informationFixtures,
  informationWords,
  refreshInformationFixture,
} from '../../remotion/compositions/explainer/concepts/information/test-fixtures';
import {
  INFORMATION_LAYOUTS,
  INFORMATION_PRESETS,
} from '../../remotion/compositions/explainer/concepts/information/types';
import { parsePlanWithDiagnostics } from '../explainer-scenes';
import { informationEvidence, informationText } from './concept-information-contract';
import { isRec, type Rec } from './kind-spec';
import { CONCEPT_INFORMATION_SPECS } from './kinds-concept-information';

function records(value: unknown): Rec[] {
  if (!Array.isArray(value) || !value.every(isRec)) throw new Error('Expected raw actor records');
  return value;
}

function parse(raw: Rec, fixture = informationFixtures[0], source = fixture.sourceText) {
  const ctx = informationContext(fixture, source);
  const spec = CONCEPT_INFORMATION_SPECS.find((entry) => entry.kind === raw.kind);
  if (!spec) throw new Error('Missing spec');
  return { body: spec.parse(raw, ctx), issues: ctx.issues };
}

function fixture(preset: string) {
  const value = informationFixtures.find((entry) => entry.plannerInput.preset === preset);
  if (!value) throw new Error(`Missing ${preset}`);
  return value;
}

describe('information parsers and real fixture parity', () => {
  it('covers exactly three kinds, seven presets and five samples each', () => {
    expect(CONCEPT_INFORMATION_SPECS).toHaveLength(3);
    expect(informationFixtures).toHaveLength(7);
    expect(new Set(informationFixtures.map((fx) => fx.plannerInput.preset))).toEqual(
      new Set(Object.values(INFORMATION_PRESETS).flat()),
    );
    for (const fx of informationFixtures) {
      expect(fx.samples).toHaveLength(5);
      expect(fx.storyboard.map((step) => step.beat)).toEqual([
        'setup',
        'action',
        'response',
        'check',
        'resolve',
      ]);
      expect(new Set(fx.storyboard.map((step) => step.description)).size).toBe(5);
      for (const step of fx.storyboard) {
        expect(step.word).toBe(fx.plannerInput[`${step.beat}Word`]);
        expect(step.at).toBe(fx.scene[`${step.beat}At`]);
        expect(step.description.length).toBeGreaterThan(70);
      }
      expect(
        fx.samples.every(
          (sample) =>
            Number.isInteger(sample.frame) &&
            sample.frame >= 0 &&
            sample.frame < fx.durationSec * 30,
        ),
      ).toBe(true);
    }
  });

  it.each(informationFixtures)('$name is exactly the accepted padded-word source body', (fx) => {
    const result = parsePlanWithDiagnostics({ scenes: [fx.plannerInput] }, informationWords(fx), {
      minStart: 0,
      maxEnd: 60,
    });
    expect(result.rejected).toEqual([]);
    expect(result.omitted).toEqual([]);
    expect(result.accepted).toHaveLength(1);
    const scene = result.accepted[0].scene;
    if (
      scene.kind !== 'system-layers' &&
      scene.kind !== 'semantic-sort' &&
      scene.kind !== 'information-transform'
    )
      throw new Error('Expected information kind');
    if (process.env.UPDATE_INFORMATION_FIXTURES === '1') {
      const authored = fx.storyboard.map((step) => step.description);
      refreshInformationFixture(fx, scene);
      expect(fx.storyboard.map((step) => step.description)).toEqual(authored);
    }
    expect(scene).toEqual(fx.scene);
    expect(informationBody(fx)).toEqual(fx.scene);
    expect(result.accepted[0].startTime).toBe(0);
    expect(result.accepted[0].endTime).toBeCloseTo(fx.durationSec, 8);
  });

  it.each(informationFixtures)('$name supports over and all owned declared layouts', (fx) => {
    for (const layout of INFORMATION_LAYOUTS) {
      const result = parsePlanWithDiagnostics(
        { scenes: [{ ...fx.plannerInput, layout }] },
        informationWords(fx),
        { minStart: 0, maxEnd: 60 },
      );
      expect(result.rejected).toEqual([]);
      expect(result.accepted).toHaveLength(1);
    }
  });

  it.each(
    informationFixtures,
  )('$name rejects invalid presets and compressed/non-finite beats', (fx) => {
    expect(parse({ ...fx.plannerInput, preset: 'arbitrary' }, fx).body).toBeNull();
    for (const value of [NaN, Infinity, -1, 0, 1.5, 10000]) {
      expect(parse({ ...fx.plannerInput, responseWord: value }, fx).body).toBeNull();
    }
  });

  it.each(
    informationFixtures,
  )('$name retains complete local relationship evidence and diagnoses malformed spans', (fx) => {
    const raw = structuredClone(fx.plannerInput);
    const list = records(raw.layers ?? raw.items ?? raw.inputs);
    const entry = list[0];
    if (!isRec(entry.evidence)) throw new Error('Missing evidence');
    entry.evidence.toWord = -1;
    const result = parse(raw, fx);
    expect(result.body).toBeNull();
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('does not infer sorting from unrelated nouns or a different target', () => {
    const fx = fixture('topic-clusters');
    const raw = structuredClone(fx.plannerInput);
    records(raw.items)[0].target = 1;
    expect(parse(raw, fx).body).toBeNull();
    records(raw.items)[0].target = 0;
    records(raw.items)[0].label = 'Travel letter';
    expect(parse(raw, fx).body).toBeNull();
  });

  it.each([
    'never belongs',
    'might belong',
    'does not belong',
    'will belong',
  ])('rejects %s rather than depicting an achieved grouping', (verb) => {
    const fx = fixture('topic-clusters');
    expect(parse(fx.plannerInput, fx, fx.sourceText.replace('belongs', verb)).body).toBeNull();
  });

  it('rejects a cropped negation and a cross-sentence evidence span', () => {
    const fx = fixture('topic-clusters');
    const ctx = informationContext(fx);
    expect(informationEvidence({ fromWord: 9, toWord: 12 }, ctx)).toBeNull();
    expect(informationEvidence({ fromWord: 8, toWord: 17 }, ctx)).toBeNull();
    expect(informationEvidence({ fromWord: 8, toWord: 12 }, ctx)?.phrase).toBe(
      'Orchard memo belongs to Fruit.',
    );
  });

  it('preserves explicit unmatched actors and rejects fabricated pairing, duplicate actors and excess items', () => {
    const fx = fixture('topic-clusters');
    const body = informationBody(fx);
    if (body.kind !== 'semantic-sort') throw new Error('Wrong fixture kind');
    expect(body.items[2].targetId).toBeNull();
    const raw = structuredClone(fx.plannerInput);
    records(raw.items)[2].target = 0;
    expect(parse(raw, fx).body).toBeNull();
    raw.items = Array.from({ length: 7 }, () => records(fx.plannerInput.items)[0]);
    expect(parse(raw, fx).body).toBeNull();
    raw.items = [records(fx.plannerInput.items)[0], records(fx.plannerInput.items)[0]];
    expect(parse(raw, fx).body).toBeNull();
  });

  it('never treats a closest candidate as truth or skill pairing as completed work', () => {
    for (const preset of ['closest-match', 'skill-match']) {
      const fx = fixture(preset);
      const raw = {
        ...fx.plannerInput,
        outcome: preset === 'closest-match' ? 'Query is true.' : 'Tasks are completed.',
      };
      const source = fx.sourceText.replace(String(fx.plannerInput.outcome), raw.outcome);
      expect(parse(raw, fx, source).body).toBeNull();
    }
  });

  it('binds functional roles and every adjacent connection to the same system', () => {
    const fx = fixture('business-stack');
    const raw = structuredClone(fx.plannerInput);
    records(raw.layers)[0].role = 'people';
    expect(parse(raw, fx).body).toBeNull();
    raw.layers = [...records(fx.plannerInput.layers)].reverse();
    expect(parse(raw, fx).body).toBeNull();
    expect(
      parse(fx.plannerInput, fx, fx.sourceText.replace('layer of Studio', 'layer of Device')).body,
    ).toBeNull();
  });

  it('preserves detail/field provenance and rejects medium dressing, swapped inputs and invented details', () => {
    const fx = fixture('multimodal-fusion');
    for (const patch of [
      { medium: 'text' },
      { detail: 'guaranteed profit' },
      { field: 'Words' },
      { label: 'Transcript' },
    ]) {
      const raw = structuredClone(fx.plannerInput);
      Object.assign(records(raw.inputs)[1], patch);
      expect(parse(raw, fx).body).toBeNull();
    }
    const raw = structuredClone(fx.plannerInput);
    raw.inputs = records(raw.inputs).slice(0, 2);
    expect(parse(raw, fx).body).toBeNull();
  });

  it('preserves numeric signs, decimal precision and units in local evidence', () => {
    expect(informationText('−5%')).toBe('-5%');
    expect(informationText('-5%')).not.toBe(informationText('5%'));
    expect(informationText('1.5')).not.toBe(informationText('15'));
    expect(informationText('$ 50')).not.toBe(informationText('50'));
  });
});
