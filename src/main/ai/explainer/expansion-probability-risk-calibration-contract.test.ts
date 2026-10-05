import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import { isDerivationAllowed } from '../../remotion/compositions/explainer/expansion/value-logic';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionCalibration,
  parseExpansionRiskMatrix,
} from './expansion-probability-risk-calibration-contract';
import { isRec, makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/expansion/probability/risk-calibration.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  version: number;
  pack: string;
  stories: ExpansionSourceFixture[];
};
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
function fixture(id: '15' | '16'): ExpansionSourceFixture {
  const found = packet.stories.find((story) => story.id === id);
  if (!found) throw new Error(`Missing persisted fixture ${id}`);
  return found;
}
function rec(raw: unknown): Rec {
  if (!isRec(raw)) throw new Error('Expected authored record');
  return raw;
}
function record(proposal: Rec): Rec {
  if (!Array.isArray(proposal.records)) throw new Error('Expected records');
  return rec(proposal.records[0]);
}
function clauses(story: ExpansionSourceFixture): string[] {
  return BEATS.map((field, index) =>
    story.words
      .slice(
        Number(story.proposal[field]),
        index === 4 ? story.words.length : Number(story.proposal[BEATS[index + 1]]),
      )
      .map((word) => word.text)
      .join(' '),
  );
}
function rewritten(id: '15' | '16', text: string[]): ExpansionSourceFixture {
  const original = fixture(id);
  const speech = expansionFixtureSpeech(text, 10);
  const prior = BEATS.map((field, index) => ({
    fromWord: Number(original.proposal[field]),
    toWord: index === 4 ? original.window.endWord : Number(original.proposal[BEATS[index + 1]]) - 1,
  }));
  function rebase(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(rebase);
    if (!isRec(value)) return value;
    if (Object.keys(value).length === 2 && 'fromWord' in value && 'toWord' in value) {
      const index = prior.findIndex(
        (span) => span.fromWord === value.fromWord && span.toWord === value.toWord,
      );
      if (index < 0) throw new Error('Evidence must retain its complete local clause');
      return { ...speech.spans[index] };
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rebase(entry)]));
  }
  const proposal = rec(rebase(original.proposal));
  proposal.startWord = 0;
  proposal.endWord = speech.window.endWord;
  BEATS.forEach((field, index) => {
    proposal[field] = speech.spans[index].fromWord;
  });
  return {
    id,
    sourceText: speech.sourceText,
    words: speech.words,
    window: speech.window,
    proposal,
    negatives: [],
  };
}
function parse(story: ExpansionSourceFixture, proposal = story.proposal) {
  const ctx = makeParseContext(story.words, story.window);
  return {
    ctx,
    scene:
      story.id === '15'
        ? parseExpansionRiskMatrix(proposal, ctx)
        : parseExpansionCalibration(proposal, ctx),
  };
}
function positive15(story: ExpansionSourceFixture) {
  const ctx = makeParseContext(story.words, story.window);
  const scene = parseExpansionRiskMatrix(story.proposal, ctx);
  expect(ctx.issues).toEqual([]);
  if (!scene) throw new Error('Expected a real risk matrix parse');
  return scene;
}
function positive16(story: ExpansionSourceFixture) {
  const ctx = makeParseContext(story.words, story.window);
  const scene = parseExpansionCalibration(story.proposal, ctx);
  expect(ctx.issues).toEqual([]);
  if (!scene) throw new Error('Expected a real calibration parse');
  return scene;
}
function probabilityQuantity(
  claim: string,
  amount: number,
  evidence: unknown,
  unit = 'percent',
): Rec {
  return {
    actor: 'Clinic',
    claim,
    basis: { unit, period: 'July', population: 'clinic visits' },
    state: 'known',
    amount: { kind: 'rational', value: { numerator: amount, denominator: 1 } },
    evidence,
  };
}
function assertModes(story: ExpansionSourceFixture): void {
  const diagram = parse(story, { ...story.proposal, visualMode: 'diagram' });
  const hybrid = parse(story, { ...story.proposal, visualMode: 'hybrid' });
  expect(diagram.ctx.issues).toEqual([]);
  expect(hybrid.ctx.issues).toEqual([]);
  expect(diagram.scene).not.toBeNull();
  expect(hybrid.scene).toEqual({ ...diagram.scene, visualMode: 'hybrid' });
}

describe('expansion probability risk and calibration source contracts', () => {
  it('reads exactly stories 15–16 with concrete production-padded words, five complete beats and explicit negatives', () => {
    expect(packet.version).toBe(1);
    expect(packet.pack).toBe('probability');
    expect(packet.stories.map((story) => story.id)).toEqual(['15', '16']);
    for (const story of packet.stories) {
      expect(story.words.map((word) => word.text).join(' ')).toBe(story.sourceText);
      expect(story.words).toEqual(conceptFixtureWords(story.sourceText, 10));
      expect(expansionFixtureSpeech(clauses(story), 10).words).toEqual(story.words);
      expect(story.window).toEqual({
        startWord: 0,
        endWord: story.words.length - 1,
        startTime: 0,
        endTime: 10,
      });
      expect(story.words[0].start).toBe(0.25);
      expect(story.words.at(-1)?.end).toBe(9.65);
      expect(new Set(story.negatives.map((negative) => negative.name)).size).toBe(
        story.negatives.length,
      );
      expect(story.negatives.length).toBeGreaterThanOrEqual(50);
    }
  });
  for (const story of packet.stories) {
    describe(`story ${story.id}`, () => {
      it('keeps facts, IDs, qualification and exact source times identical in both modes and portrait layouts, without mutation', () => {
        const before = structuredClone(story);
        assertModes(story);
        const result = parse(story);
        if (!result.scene) throw new Error('Expected grounded scene');
        const scene = result.scene;
        expect(scene.entities.map((item) => item.id)).toEqual(
          scene.entities.map((_, index) => expansionEntityId(story.id, index)),
        );
        expect(scene.records.map((item) => item.id)).toEqual(
          scene.records.map((_, index) => expansionEntityId(story.id, index + 8)),
        );
        expect(parse(story).scene).toEqual(scene);
        expect(parse(story).scene).toEqual(scene);
        expect(parse(story, { ...story.proposal, layout: 'stack-flipped' }).scene).toEqual(scene);
        TIMES.forEach((field, index) => {
          expect(scene[field]).toBe(
            index === 0 ? 0.3 : story.words[Number(story.proposal[BEATS[index]])].start,
          );
        });
        expect(scene.resolveAt).toBeLessThanOrEqual(9.2);
        expect(story).toEqual(before);
        expect(scene).not.toHaveProperty('winner');
        expect(scene).not.toHaveProperty('cameraCoords');
      });
      it.each(story.negatives)('rejects $name with actual parser diagnostics', (negative) => {
        const variant = {
          ...story,
          words: negative.words ?? story.words,
          window: negative.window ?? story.window,
          sourceText: negative.sourceText ?? story.sourceText,
        };
        expect(variant.words.map((word) => word.text).join(' ')).toBe(variant.sourceText);
        for (const visualMode of ['diagram', 'hybrid']) {
          const proposal = structuredClone(negative.proposal);
          if (proposal.visualMode === 'diagram' || proposal.visualMode === 'hybrid')
            proposal.visualMode = visualMode;
          const result = parse(variant, proposal);
          expect(result.scene, `${negative.name}/${visualMode}`).toBeNull();
          expect(result.ctx.issues.length, `${negative.name}/${visualMode}`).toBeGreaterThan(0);
        }
      });
    });
  }

  it('15 retains qualitative likelihood and impact separately, without inventing coordinates, scores or rates', () => {
    const story = fixture('15');
    const scene = positive15(story);
    expect(scene.records[0]).toEqual({
      id: expansionEntityId('15', 8),
      actorId: scene.entities[0].id,
      eventId: scene.entities[1].id,
      likelihood: {
        state: 'qualitative',
        label: 'unlikely',
        basis: { period: 'July', population: 'clinic visits' },
        condition: 'If backup power is available',
        evidence: rec(record(story.proposal).likelihood).evidence,
      },
      impact: {
        state: 'qualitative',
        label: 'severe',
        basis: { period: 'July', population: 'clinic visits' },
        evidence: rec(record(story.proposal).impact).evidence,
      },
    });
    expect(isDerivationAllowed('15', 'ratio')).toBe(false);
    for (const axis of [scene.records[0].likelihood, scene.records[0].impact]) {
      expect(axis).not.toHaveProperty('score');
      expect(axis).not.toHaveProperty('amount');
      expect(axis).not.toHaveProperty('x');
      expect(axis).not.toHaveProperty('rate');
    }
  });

  it('15 accepts independent realistic wording and retains the locally stated condition', () => {
    const story = rewritten('15', [
      'Clinic risk assessment keeps the named outage event separate from any invented probability rate or observed ranking.',
      'If backup power is available, during July, Clinic reports outage likelihood as unlikely among clinic visits.',
      'Among clinic visits during July, Clinic outage has severe impact.',
      'For Clinic outage, likelihood and impact remain separate dimensions.',
      'Clinic outage remains scoped to the stated period and population.',
    ]);
    story.proposal.outcome = 'remains scoped';
    assertModes(story);
    const baseline = positive15(fixture('15')),
      alternative = positive15(story);
    expect(
      alternative.records.map((item) => ({
        ...item,
        likelihood: { ...item.likelihood, evidence: undefined },
        impact: { ...item.impact, evidence: undefined },
      })),
    ).toEqual(
      baseline.records.map((item) => ({
        ...item,
        likelihood: { ...item.likelihood, evidence: undefined },
        impact: { ...item.impact, evidence: undefined },
      })),
    );
  });

  it('15 preserves explicit numeric likelihood and impact in their different source units and precision', () => {
    const text = clauses(fixture('15'));
    text[1] = 'Clinic outage likelihood is 25.00 percent during July among clinic visits.';
    text[2] = 'Clinic outage impact is 2.50 USD during July among clinic visits.';
    const story = rewritten('15', text);
    delete story.proposal.condition;
    const item = record(story.proposal);
    item.likelihood = {
      state: 'quantity',
      quantity: probabilityQuantity('outage likelihood', 25, rec(item.likelihood).evidence),
    };
    item.impact = {
      state: 'quantity',
      quantity: {
        actor: 'Clinic',
        claim: 'outage impact',
        basis: { unit: 'USD', period: 'July', population: 'clinic visits' },
        state: 'known',
        amount: { kind: 'money', value: { currency: 'USD', minorUnits: 250 } },
        evidence: rec(item.impact).evidence,
      },
    };
    assertModes(story);
    const risk = positive15(story).records[0];
    expect(risk.likelihood).toMatchObject({
      state: 'quantity',
      quantity: {
        state: 'known',
        basis: { unit: 'percent' },
        amount: { kind: 'rational', value: { numerator: 25, denominator: 1 } },
      },
    });
    expect(risk.impact).toMatchObject({
      state: 'quantity',
      quantity: {
        state: 'known',
        basis: { unit: 'USD' },
        amount: { kind: 'money', value: { currency: 'USD', minorUnits: 250 } },
      },
    });
    if (risk.likelihood.state !== 'quantity' || risk.impact.state !== 'quantity')
      throw new Error('Expected preserved quantities');
    expect(risk.likelihood.quantity).toHaveProperty('amount.notation', '25.00');
    expect(risk.impact.quantity).toHaveProperty('amount.notation', '2.50');
  });

  it('15 keeps an unknown impact unknown rather than plotting an invented zero score', () => {
    const text = clauses(fixture('15'));
    text[2] = 'Clinic outage impact is unknown during July among clinic visits.';
    const story = rewritten('15', text);
    const dim = rec(record(story.proposal).impact);
    dim.state = 'unknown';
    delete dim.label;
    dim.qualifier = 'unknown';
    assertModes(story);
    expect(positive15(story).records[0].impact).toEqual({
      state: 'unknown',
      qualifier: 'unknown',
      basis: { period: 'July', population: 'clinic visits' },
      evidence: dim.evidence,
    });
  });

  it('16 derives only exact catalog-authorized ratios with original operands, basis and evidence', () => {
    const story = fixture('16');
    const scene = positive16(story),
      paired = scene.records[0];
    expect(isDerivationAllowed('16', 'ratio')).toBe(true);
    expect(isDerivationAllowed('16', 'difference')).toBe(false);
    expect(paired.predictionRatio).toEqual({
      state: 'derived',
      operation: 'ratio',
      operands: [
        { numerator: 80, denominator: 1 },
        { numerator: 100, denominator: 1 },
      ],
      result: { numerator: 4, denominator: 5 },
      basis: { ...paired.prediction.basis, unit: 'ratio' },
      evidence: [paired.prediction.evidence],
    });
    expect(paired.observationRatio).toEqual({
      state: 'derived',
      operation: 'ratio',
      operands: [
        { numerator: 75, denominator: 1 },
        { numerator: 100, denominator: 1 },
      ],
      result: { numerator: 3, denominator: 4 },
      basis: { ...paired.observation.basis, unit: 'ratio' },
      evidence: [paired.observation.evidence],
    });
    expect(paired.prediction).toHaveProperty('amount.notation', '80.00');
    expect(paired.observation).toHaveProperty('amount.notation', '75.00');
    expect(paired.comparison).toMatchObject({ state: 'compared', relation: 'above' });
    expect(paired).not.toHaveProperty('accuracy');
    expect(paired).not.toHaveProperty('regression');
    expect(paired).not.toHaveProperty('errorRate');
  });

  it('16 accepts a separately worded matched comparison without altering underlying facts', () => {
    const story = rewritten('16', [
      'Clinic calibration comparison retains Trial as a named record pairing its forecast with the corresponding supplied observation.',
      'During July, Clinic reported Trial prediction at 80.00 count among patient visits with denominator 100.',
      'In July, Clinic recorded Trial observation of 75.00 count for patient visits with denominator 100.',
      'For Trial, Clinic prediction is above its observation with the same period, population and denominator.',
      'Clinic Trial comparisons stay limited to the supplied records.',
    ]);
    story.proposal.outcome = 'stay limited';
    assertModes(story);
    const baseline = positive16(fixture('16')).records[0],
      alternative = positive16(story).records[0];
    expect({ ...alternative.prediction, evidence: undefined }).toEqual({
      ...baseline.prediction,
      evidence: undefined,
    });
    expect({ ...alternative.observation, evidence: undefined }).toEqual({
      ...baseline.observation,
      evidence: undefined,
    });
    expect(alternative.id).toBe(baseline.id);
    expect(alternative.predictionRatio?.result).toEqual(baseline.predictionRatio?.result);
    expect(alternative.observationRatio?.result).toEqual(baseline.observationRatio?.result);
  });

  it.each([
    'above',
    'below',
    'equal',
  ] as const)('16 validates exact %s ordering instead of trusting a proposed conclusion', (relation) => {
    const text = clauses(fixture('16'));
    const observed = relation === 'above' ? 75 : relation === 'below' ? 85 : 80;
    text[2] = text[2].replace('75.00', `${observed}.00`);
    text[3] = text[3].replace('above', relation === 'equal' ? 'equal to' : relation);
    const story = rewritten('16', text),
      paired = record(story.proposal);
    rec(rec(paired.observation).amount).value = { numerator: observed, denominator: 1 };
    rec(paired.comparison).relation = relation;
    assertModes(story);
    expect(positive16(story).records[0].comparison).toMatchObject({ state: 'compared', relation });
  });

  it.each([
    'unknown',
    'missing',
    'disputed',
  ] as const)('16 preserves %s observations as uncompared, with no observed ratio or incorrect-zero judgment', (state) => {
    const text = clauses(fixture('16'));
    text[2] = `Clinic Trial observation is ${state === 'disputed' ? 'disputed between 70.00 and 75.00' : state} count during July among patient visits with denominator 100.`;
    text[3] = `Clinic Trial observation remains ${state} and its prediction is not compared.`;
    const story = rewritten('16', text),
      paired = record(story.proposal),
      observation = rec(paired.observation);
    observation.state = state;
    observation.qualifier = state;
    delete observation.amount;
    if (state === 'disputed')
      observation.alternatives = [70, 75].map((numerator) => ({
        kind: 'rational',
        value: { numerator, denominator: 1 },
      }));
    rec(paired.comparison).state = 'uncompared';
    delete rec(paired.comparison).relation;
    assertModes(story);
    const result = positive16(story).records[0];
    expect(result.observation.state).toBe(state);
    expect(result.observation).not.toHaveProperty('amount');
    expect(result.observationRatio).toBeUndefined();
    expect(result.predictionRatio?.result).toEqual({ numerator: 4, denominator: 5 });
    expect(result.comparison.state).toBe('uncompared');
    expect(result.comparison).not.toHaveProperty('relation');
    expect(result).not.toHaveProperty('incorrect');
    if (result.observation.state === 'disputed')
      expect(
        result.observation.alternatives.map((amount) =>
          amount.kind === 'rational' ? amount.value.numerator : null,
        ),
      ).toEqual([70, 75]);
  });

  it.each([
    'conditional',
    'simulated',
    'illustrative',
  ] as const)('16 retains a %s prediction without measured comparison, fitting or invented derived ratios', (state) => {
    const text = clauses(fixture('16'));
    text[1] =
      state === 'conditional'
        ? `If audit approval is granted, ${text[1]}`
        : `In this ${state === 'simulated' ? 'simulation' : 'teaching example'}, ${text[1]}`;
    text[3] = `Clinic Trial prediction remains ${state} and its observation is not compared.`;
    const story = rewritten('16', text),
      paired = record(story.proposal),
      prediction = rec(paired.prediction);
    prediction.state = state;
    paired.deriveRatios = false;
    if (state === 'conditional') {
      prediction.condition = 'If audit approval is granted';
      story.proposal.condition = prediction.condition;
    } else {
      prediction.qualifier = state === 'simulated' ? 'simulation' : 'teaching example';
      story.proposal.evidence = 'illustrative';
    }
    rec(paired.comparison).state = 'uncompared';
    delete rec(paired.comparison).relation;
    assertModes(story);
    const result = positive16(story).records[0];
    expect(result.prediction.state).toBe(state);
    expect(result.comparison.state).toBe('uncompared');
    expect(result.predictionRatio).toBeUndefined();
    expect(result.observationRatio).toBeUndefined();
    expect(result.prediction).toHaveProperty(
      state === 'conditional' ? 'condition' : 'qualifier',
      state === 'conditional'
        ? 'If audit approval is granted'
        : state === 'simulated'
          ? 'simulation'
          : 'teaching example',
    );
  });

  it('16 does not manufacture ratios when the authored derivation flag is absent', () => {
    const story = { ...fixture('16'), proposal: structuredClone(fixture('16').proposal) };
    delete record(story.proposal).deriveRatios;
    const paired = positive16(story).records[0];
    expect(paired.predictionRatio).toBeUndefined();
    expect(paired.observationRatio).toBeUndefined();
    expect(paired.comparison).toMatchObject({ state: 'compared', relation: 'above' });
  });
});
