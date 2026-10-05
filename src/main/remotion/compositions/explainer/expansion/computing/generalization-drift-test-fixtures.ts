import { readFileSync } from 'node:fs';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  parseExpansionHeldOutGeneralization,
  parseExpansionPopulationDrift,
} from '../../../../../ai/explainer/expansion-computing-generalization-drift-contract';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionQuantity } from '../value-types';
import type { ExpansionGeneralizationDriftScene } from './generalization-drift-types';

export const generalizationDriftSourceCases = () =>
  temporalSourceFixtures(
    (
      JSON.parse(
        readFileSync(
          'scripts/explainer-stills/fixtures/expansion/computing/generalization-drift.source.json',
          'utf8',
        ),
      ) as { stories: TemporalFixtureSeed[] }
    ).stories,
  );
export function acceptedGeneralizationDrift(
  f: ExpansionSourceFixture,
): ExpansionGeneralizationDriftScene {
  const ctx = makeParseContext(f.words, f.window);
  const scene = (
    f.id === '71' ? parseExpansionHeldOutGeneralization : parseExpansionPopulationDrift
  )(f.proposal, ctx);
  if (!scene || ctx.issues?.length)
    throw new Error(`Rejected ${f.id}: ${JSON.stringify(ctx.issues)}`);
  return scene;
}
export const GENERALIZATION_DRIFT_STATES = [
  'known',
  'unknown',
  'missing',
  'disputed',
  'conditional',
  'simulated',
  'illustrative',
] as const;
/** Real complete clauses at the authored two-record/three-entity caps, wide glyph labels and rational extrema. */
export function maximumGeneralizationDriftFixture(
  id: '71' | '72',
  state: ExpansionQuantity['state'],
): ExpansionSourceFixture {
  const actor = 'W'.repeat(28),
    metric = 'M'.repeat(20),
    scope = 'W'.repeat(40),
    period = 'M'.repeat(32);
  const datasets = [`${'W'.repeat(27)}A`, `${'M'.repeat(27)}B`];
  const populations = [scope, id === '71' ? scope : 'M'.repeat(40)];
  const conditions = ['W'.repeat(40), id === '71' ? 'W'.repeat(40) : 'M'.repeat(40)];
  const samples = [`${'W'.repeat(27)}C`, `${'M'.repeat(27)}D`];
  const roles = id === '71' ? ['training', 'held-out'] : ['baseline', 'changed'];
  const teaching = state === 'simulated' || state === 'illustrative';
  const qualification = state === 'conditional' ? `if ${'MW'.repeat(46)}M` : state;
  const amounts = [
    { kind: 'rational', value: { numerator: -1000000000, denominator: 999999999 } },
    { kind: 'rational', value: { numerator: 999999999, denominator: 1000000000 } },
  ];
  const value =
    state === 'unknown' || state === 'missing'
      ? state
      : state === 'disputed'
        ? 'disputed between -1000000000/999999999 and 999999999/1000000000'
        : '-1000000000/999999999';
  const clauses = [
    `${actor} evaluates ${metric} using ${datasets.join(' and ')} among ${scope} during ${period}.`,
  ];
  for (let i = 0; i < 2; i++) {
    clauses.push(
      `${actor} uses ${datasets[i]} as ${roles[i]} examples with ${samples[i]} under ${conditions[i]} among ${populations[i]} during ${period}.`,
    );
    clauses.push(
      `${teaching ? `In this ${state}, ` : ''}${datasets[i]} ${actor} ${metric} under ${conditions[i]} is ${value} percent during ${period} among ${populations[i]} with denominator 1000000000/999999999${state === 'conditional' ? ` ${qualification}` : ''}.`,
    );
  }
  const speech = expansionFixtureSpeech(clauses);
  const starts = [0.25, 2, 4, 6, 8];
  for (const [i, span] of speech.spans.entries()) {
    const step = 1.3 / (span.toWord - span.fromWord + 1);
    for (let w = span.fromWord; w <= span.toWord; w++)
      speech.words[w] = {
        ...speech.words[w],
        start: starts[i] + (w - span.fromWord) * step,
        end: starts[i] + (w - span.fromWord + 0.8) * step,
      };
  }
  const records = datasets.map((dataset, i) => ({
    dataset,
    sample: samples[i],
    role: roles[i],
    condition: conditions[i],
    population: populations[i],
    evidence: speech.spans[1 + i * 2],
    result: {
      actor: dataset,
      claim: `${actor} ${metric} under ${conditions[i]}`,
      basis: {
        unit: 'percent',
        period,
        population: populations[i],
        denominator: { numerator: 1000000000, denominator: 999999999 },
      },
      evidence: speech.spans[2 + i * 2],
      state,
      ...(state === 'unknown' || state === 'missing'
        ? { qualifier: state }
        : state === 'disputed'
          ? { qualifier: state, alternatives: amounts }
          : {
              amount: amounts[0],
              ...(state === 'conditional'
                ? { condition: qualification }
                : teaching
                  ? { qualifier: state }
                  : {}),
            }),
    },
  }));
  return {
    id,
    ...speech,
    negatives: [],
    proposal: {
      kind: id === '71' ? 'model-training' : 'model-evaluation',
      preset: id === '71' ? 'held-out-generalization' : 'population-drift',
      visualMode: 'diagram',
      label: scope,
      subject: actor,
      outcome: metric,
      evidence: teaching ? 'illustrative' : 'source-stated',
      entities: [actor, ...datasets].map((label) => ({ label, evidence: speech.spans[0] })),
      actor,
      metric,
      scope,
      period,
      template: id === '71' ? 'training-held-out' : 'condition-pair',
      records,
      ...Object.fromEntries(
        ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'].map((key, i) => [
          key,
          speech.spans[i].fromWord,
        ]),
      ),
    },
  };
}
/** Instantiate the actual reused carrier dimensions/offsets read from its shipped implementation.
 * Caller disposes the three local geometries; no persistent geometry/test cache. */
export function generalizationDriftCarrierGeometry() {
  const kit = readFileSync(
    'src/main/remotion/compositions/explainer/expansion/kits/computing.tsx',
    'utf8',
  )
    .split('export function ComputingRecordClay')[1]
    .split('export function ComputingActorSvg')[0];
  return [...kit.matchAll(/<ClayBlock\s+size=\{\[([^\]]+)\]\}([^>]+)\/>/g)].map((match) => {
    const [width, height, depth] = match[1].split(',').map(Number);
    const position = /position=\{\[([^\]]+)\]\}/.exec(match[2])?.[1].split(',').map(Number) ?? [
      0, 0, 0,
    ];
    return {
      geometry: new RoundedBoxGeometry(
        width,
        height,
        depth,
        3,
        Math.min(0.07, width / 2, height / 2, depth / 2),
      ),
      position,
    };
  });
}
export function generalizationDriftCases(): ExpansionGeneralizationDriftScene[] {
  return [
    ...generalizationDriftSourceCases(),
    ...(['71', '72'] as const).flatMap((id) =>
      GENERALIZATION_DRIFT_STATES.map((state) => maximumGeneralizationDriftFixture(id, state)),
    ),
  ].map(acceptedGeneralizationDrift);
}
