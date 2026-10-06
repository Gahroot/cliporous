/** Shared fixtures for the variation-range-poses tests and their projection/mesh-budget siblings. */
import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionQualifiedInterval,
  parseExpansionRepeatedSamples,
} from '../../../../../ai/explainer/expansion-probability-variation-range-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionProbabilityVariationRangeScene } from './variation-range-types';

export const fixtures = (
  JSON.parse(
    readFileSync(
      'scripts/explainer-stills/fixtures/expansion/probability/variation-range.source.json',
      'utf8',
    ),
  ) as { stories: ExpansionSourceFixture[] }
).stories;
export function variationRangeAccepted(
  fixture: ExpansionSourceFixture,
): ExpansionProbabilityVariationRangeScene {
  const ctx = makeParseContext(fixture.words, fixture.window);
  const scene =
    fixture.id === '13'
      ? parseExpansionRepeatedSamples(fixture.proposal, ctx)
      : parseExpansionQualifiedInterval(fixture.proposal, ctx);
  expect(ctx.issues, JSON.stringify(fixture.proposal)).toEqual([]);
  if (!scene) throw new Error('Real parser rejected positive fixture');
  return scene;
}
export function variationRangeSourceScenes() {
  return fixtures.map(variationRangeAccepted);
}
/** Nine clauses for seven samples: beat indices are NOT assumed to be clause indices. */
export function variationRangeMaximum(
  state: 'known' | 'simulated' | 'illustrative' = 'known',
  offset = 1,
  wideFacts = false,
) {
  const population = 'P'.repeat(28),
    period = 'M'.repeat(32),
    labels = Array.from({ length: 7 }, (_, i) => `${'S'.repeat(27)}${String.fromCharCode(65 + i)}`);
  const names = `${labels.slice(0, -1).join(', ')}, and ${labels[6]}`;
  const qualification = state === 'known' ? 'supplied samples' : 'teaching samples';
  const claim = `response count${wideFacts ? ` ${'C'.repeat(81)}` : ''}`;
  const teaching = state === 'simulated' ? 'simulation ' : 'teaching example ';
  const qualifier = teaching + 'Q'.repeat(96 - teaching.length),
    prefix = state === 'known' ? '' : `In this ${qualifier}, `;
  const clauses = [
    `${prefix}Sample review compares ${names} from ${population} during ${period}.`,
    ...labels.map(
      (label, i) =>
        `${prefix}${label} ${claim} is ${i + offset} count during ${period} among ${population} with denominator 14.`,
    ),
    `${names} are ${qualification} from ${population} during ${period}.`,
    `For ${population} during ${period}, sample counts vary across the ${qualification}.`,
  ];
  const speech = expansionFixtureSpeech(clauses, 12),
    proposal = structuredClone(fixtures[0].proposal);
  const phases = [0, 1, 2, 8, 9, 10],
    times = [0.25, 1.8, 3.4, 7.5, 9.4, 11.65];
  for (let phase = 0; phase < 5; phase++) {
    const first = speech.spans[phases[phase]].fromWord,
      last = speech.spans[phases[phase + 1] - 1].toWord;
    for (let i = first; i <= last; i++) {
      speech.words[i].start =
        times[phase] +
        ((times[phase + 1] - times[phase] - 0.05) * (i - first)) / (last - first + 1);
      speech.words[i].end =
        times[phase] +
        ((times[phase + 1] - times[phase] - 0.05) * (i - first + 1)) / (last - first + 1);
    }
  }
  Object.assign(proposal, {
    subject: population,
    outcome: `sample counts vary`,
    evidence: state === 'known' ? 'source-stated' : 'illustrative',
    startWord: 0,
    endWord: speech.window.endWord,
    setupWord: speech.spans[0].fromWord,
    actionWord: speech.spans[1].fromWord,
    responseWord: speech.spans[2].fromWord,
    checkWord: speech.spans[8].fromWord,
    resolveWord: speech.spans[9].fromWord,
    entities: [
      { label: population, evidence: speech.spans[0] },
      ...labels.map((label, i) => ({ label, evidence: speech.spans[i + 1] })),
    ],
    population: { entity: population, period, evidence: speech.spans[0] },
    samples: labels.map((label, i) => ({
      entity: label,
      quantity: {
        state,
        ...(state === 'known' ? {} : { qualifier }),
        actor: label,
        claim,
        amount: { kind: 'rational', value: { numerator: i + offset, denominator: 1 } },
        basis: {
          unit: 'count',
          period,
          population,
          denominator: { numerator: 14, denominator: 1 },
        },
        evidence: speech.spans[i + 1],
      },
    })),
    meaning: { qualification, evidence: speech.spans[8] },
    resolutionEvidence: speech.spans[9],
  });
  return variationRangeAccepted({ ...fixtures[0], ...speech, proposal });
}
export function variationRangeInterval(
  options: {
    state?: 'known' | 'illustrative' | 'simulated' | 'conditional';
    lower?: string;
    upper?: string;
    kind?: 'range' | 'bounds' | 'estimate' | 'uncertain';
    long?: boolean;
    unit?: 'count' | 'percent';
  } = {},
) {
  const unit = options.unit ?? 'count';
  const state = options.state ?? 'known',
    population = options.long ? 'P'.repeat(28) : 'district homes',
    actor = options.long ? 'A'.repeat(28) : 'Project A',
    period = options.long ? 'M'.repeat(32) : 'March';
  const kind = options.kind ?? (state === 'conditional' ? 'uncertain' : 'estimate'),
    qualification = {
      range: 'range of possible values',
      bounds: 'stated bounds',
      estimate: 'an estimated range',
      uncertain: 'an uncertain range',
    }[kind];
  const lower = options.lower ?? '2.500',
    upper = options.upper ?? '7.500',
    teaching = state === 'simulated' ? 'simulation ' : 'teaching example ',
    qualifier = options.long ? teaching + 'Q'.repeat(96 - teaching.length) : teaching.trim();
  const prefix = state === 'illustrative' || state === 'simulated' ? `In this ${qualifier}, ` : '';
  const condition = state === 'conditional' ? 'if funding is approved' : undefined;
  const finalQualification = condition ? 'conditional' : prefix ? state : qualification;
  const clauses = [
    `${prefix}Interval review reviews ${actor} interval from ${population} during ${period}.`,
    `${prefix}${actor} lower bound is ${lower} ${unit} during ${period} among ${population} with denominator 10${condition ? ` ${condition}` : ''}.`,
    `${prefix}${actor} upper bound is ${upper} ${unit} during ${period} among ${population} with denominator 10.`,
    `${actor} interval is ${qualification} during ${period} among ${population}.`,
    `${actor} interval remains ${finalQualification} during ${period} among ${population}.`,
  ];
  const speech = expansionFixtureSpeech(clauses, 12),
    proposal = structuredClone(fixtures[1].proposal);
  Object.assign(proposal, {
    actor,
    subject: actor,
    outcome: `interval remains ${finalQualification}`,
    evidence: prefix ? 'illustrative' : 'source-stated',
    ...(condition ? { condition } : {}),
    startWord: 0,
    endWord: speech.window.endWord,
  });
  ['setup', 'action', 'response', 'check', 'resolve'].forEach((beat, i) => {
    proposal[`${beat}Word`] = speech.spans[i].fromWord;
  });
  proposal.entities = [
    { label: population, evidence: speech.spans[0] },
    { label: actor, evidence: speech.spans[0] },
  ];
  proposal.population = { entity: population, period, evidence: speech.spans[0] };
  for (const [i, endpoint] of ['lower', 'upper'].entries()) {
    const notation = i ? upper : lower;
    const numerator = Math.round(Number(notation) * 1000);
    proposal[endpoint] = {
      actor,
      claim: `${endpoint} bound`,
      state: condition && i === 1 ? 'known' : state,
      ...(prefix ? { qualifier } : {}),
      ...(condition && i === 0 ? { condition } : {}),
      amount: { kind: 'rational', value: { numerator, denominator: 1000 } },
      basis: { unit, population, period, denominator: { numerator: 10, denominator: 1 } },
      evidence: speech.spans[i + 1],
    };
  }
  proposal.meaning = { kind, qualification, evidence: speech.spans[3] };
  proposal.resolutionEvidence = speech.spans[4];
  return variationRangeAccepted({ ...fixtures[1], ...speech, proposal });
}
export function variationRangeTestScenes() {
  return [
    ...variationRangeSourceScenes(),
    ...(['known', 'illustrative', 'simulated'] as const).map((state) =>
      variationRangeMaximum(state),
    ),
    ...(['range', 'bounds', 'estimate', 'uncertain'] as const).map((kind) =>
      variationRangeInterval({ kind, long: true }),
    ),
    ...(['illustrative', 'simulated', 'conditional'] as const).map((state) =>
      variationRangeInterval({ state, long: true }),
    ),
    variationRangeInterval({ lower: '4.000', upper: '4.000' }),
    variationRangeInterval({ lower: '0.000', upper: '0.000' }),
    variationRangeMaximum('known', 0),
    variationRangeInterval({ unit: 'percent', long: true, lower: '-2.500', upper: '7.500' }),
    variationRangeMaximum('illustrative', 1, true),
  ];
}
export function variationRangeTimes(scene: ExpansionProbabilityVariationRangeScene) {
  return [
    0,
    scene.setupAt,
    scene.actionAt,
    scene.responseAt,
    scene.checkAt,
    scene.resolveAt,
    scene.resolveAt + 0.2,
    scene.resolveAt + 100,
    ...Array.from({ length: Math.ceil((scene.resolveAt + 1) * 30) }, (_, i) => i / 30),
  ];
}
