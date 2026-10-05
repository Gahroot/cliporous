import { readFileSync } from 'node:fs';
import type { BufferGeometry } from 'three';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionDirectionalField,
  parseExpansionEnergyBudget,
} from '../../../../../ai/explainer/expansion-physical-energy-field-contract';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionQuantity } from '../value-types';
import { energyFieldSolidGeometry, energyFieldSolids } from './energy-field-models';
import type { EnergyFieldPose } from './energy-field-poses';
import type { ExpansionEnergyFieldScene } from './energy-field-types';

const packet = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../../../scripts/explainer-stills/fixtures/expansion/physical/energy-field.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
export const energyFieldFixtures = temporalSourceFixtures(packet.stories as TemporalFixtureSeed[]);
export const ENERGY_FIELD_STATES = [
  'known',
  'unknown',
  'missing',
  'disputed',
  'conditional',
  'simulated',
  'illustrative',
] as const;
/** Parser-accepted caps: energy 8 actors/12 records/16 transfers; uniform 8/12/2,
 * radial 8/8/1 (only the tracked actor can own a field relation). No relaxed contracts. */
export function maximumEnergyFieldFixture(
  id: '79' | '80',
  state: ExpansionQuantity['state'],
  radial = false,
  positive = false,
): ExpansionSourceFixture {
  if (id === '80' && state === 'known') throw new Error('Measured field parameters are forbidden');
  const actors = Array.from(
    { length: 8 },
    (_, i) => `${'W'.repeat(27)}${String.fromCharCode(65 + i)}`,
  );
  const scope = `${'W'.repeat(39)}M`,
    period = 'M'.repeat(32),
    label = 'W'.repeat(48);
  const condition = `if ${'MW'.repeat(46)}M`;
  const qualifier =
    state === 'simulated' ? `simulated ${'W'.repeat(86)}` : `illustrative ${'W'.repeat(83)}`;
  const teaching = state === 'simulated' || state === 'illustrative';
  const qualification = 'illustrative teaching model';
  const template = id === '79' ? 'energy-carriers' : radial ? 'radial-field' : 'uniform-field';
  const unit = id === '79' ? (positive ? 'kilojoule' : 'joule') : 'ratio';
  const count = id === '79' ? 11 : radial ? 8 : 12;
  const clauses: string[] = [
    `${label} tracks ${actors[0]}${id === '80' ? ` as an ${qualification}` : ''} for ${scope} during ${period}.`,
  ];
  const specs = Array.from({ length: count }, (_, i) => ({
    actor: actors[i % 8],
    claim:
      id === '79' ? (i < 8 ? 'input energy' : 'output energy') : i < 8 ? 'strength' : 'direction',
    unit: id === '79' ? unit : i < 8 ? 'ratio' : 'degree',
  }));
  if (id === '79') specs.push({ actor: actors[0], claim: 'loss', unit });
  const amount = (claim: string) => ({
    kind: 'rational' as const,
    value:
      id === '79'
        ? {
            numerator: positive ? 999999999 : -1000000000,
            denominator: positive ? 1000000000 : 999999999,
          }
        : {
            numerator:
              claim === 'direction' ? (positive ? 360 : -360) : positive ? 1000 : 999999999,
            denominator: claim === 'direction' || positive ? 1 : 1000000,
          },
  });
  const recordClause = (spec: (typeof specs)[number]) => {
    const a = amount(spec.claim),
      lexeme = `${a.value.numerator}/${a.value.denominator}`;
    const value =
      state === 'unknown' || state === 'missing'
        ? state
        : state === 'disputed'
          ? `disputed between ${lexeme} and 0/1`
          : lexeme;
    return `${teaching ? `In this ${qualifier}, ` : ''}${spec.actor} ${spec.claim} is ${value} ${spec.unit}${id === '79' ? 's' : ''} during ${period} for ${scope}${id === '79' ? ' with denominator 1000000000/999999999' : ''}${state === 'conditional' ? ` ${condition}` : ''}.`;
  };
  const recordIndices = specs.map((spec, i) => {
    if (id === '79' && i === specs.length - 1) return -1;
    clauses.push(recordClause(spec));
    return clauses.length - 1;
  });
  const relationSpecs = Array.from({ length: id === '79' ? 16 : radial ? 1 : 2 }, (_, i) => {
    const index = id === '79' ? i % 8 : i * 8;
    const spec = specs[index],
      destination = id === '79' ? actors[(index + 1 + Math.floor(i / 8)) % 8] : actors[0];
    clauses.push(
      `${teaching ? `In this ${qualifier}, ` : ''}${spec.actor} ${id === '79' ? `transfers ${spec.claim} to ${destination}` : `illustrates ${template} on teaching-plane`} for ${scope} during ${period}${state === 'conditional' ? ` ${condition}` : ''}.`,
    );
    return { index, destination, clause: clauses.length - 1 };
  });
  const resolveIndex = clauses.length;
  clauses.push(
    id === '79'
      ? recordClause(specs[specs.length - 1])
      : `${label} remains an ${qualification} for ${scope} during ${period}.`,
  );
  if (id === '79') recordIndices[specs.length - 1] = resolveIndex;
  const speech = expansionFixtureSpeech(clauses);
  const responseIndex = 1 + Math.floor(count / 2),
    checkIndex = 1 + count;
  const groups = [0, 1, responseIndex, checkIndex, resolveIndex, clauses.length];
  const starts = [0.25, 2, 4, 6, 10],
    ends = [1.5, 3.5, 5.5, 9.5, 11.65];
  for (let g = 0; g < 5; g++) {
    const first = speech.spans[groups[g]].fromWord,
      last = speech.spans[groups[g + 1] - 1].toWord;
    const step = (ends[g] - starts[g]) / (last - first + 1);
    for (let w = first; w <= last; w++)
      speech.words[w] = {
        ...speech.words[w],
        start: starts[g] + (w - first) * step,
        end: starts[g] + (w - first + 1) * step,
      };
  }
  return {
    ...speech,
    id,
    window: { ...speech.window, endTime: 12 },
    negatives: [],
    proposal: {
      kind: id === '79' ? 'conservation-flow' : 'field-map',
      preset: id === '79' ? 'energy-budget' : 'directional-field',
      template,
      visualMode: 'diagram',
      evidence: id === '80' || teaching ? 'illustrative' : 'source-stated',
      label,
      subject: actors[0],
      actor: actors[0],
      scope,
      period,
      outcome: id === '79' ? 'loss' : qualification,
      ...(id === '80' ? { domain: 'teaching-plane', qualification } : {}),
      entities: actors.map((label, i) => ({
        label,
        evidence: speech.spans[i === 0 ? 0 : recordIndices[i]],
      })),
      records: specs.map((spec, i) => ({
        quantity: {
          actor: spec.actor,
          claim: spec.claim,
          basis: {
            unit: spec.unit,
            population: scope,
            period,
            ...(id === '79'
              ? { denominator: { numerator: 1000000000, denominator: 999999999 } }
              : {}),
          },
          evidence: speech.spans[recordIndices[i]],
          state,
          ...(state === 'unknown' || state === 'missing'
            ? { qualifier: state }
            : state === 'disputed'
              ? {
                  qualifier: state,
                  alternatives: [
                    amount(spec.claim),
                    { kind: 'rational', value: { numerator: 0, denominator: 1 } },
                  ],
                }
              : {
                  amount: amount(spec.claim),
                  ...(state === 'conditional' ? { condition } : teaching ? { qualifier } : {}),
                }),
        },
      })),
      relations: relationSpecs.map((r) => ({
        from: specs[r.index].actor,
        to: r.destination,
        claim: specs[r.index].claim,
        evidence: speech.spans[r.clause],
      })),
      ...Object.fromEntries(
        ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'].map((key, i) => [
          key,
          speech.spans[groups[i]].fromWord,
        ]),
      ),
    },
  };
}
export function energyFieldGeometry(
  scene: ExpansionEnergyFieldScene,
  pose: EnergyFieldPose,
): { geometry: BufferGeometry; solid: ReturnType<typeof energyFieldSolids>[number] }[] {
  return energyFieldSolids(scene, pose).map((solid) => ({
    solid,
    geometry: energyFieldSolidGeometry(solid),
  }));
}
export function energyFieldFixtureScenes(): ExpansionEnergyFieldScene[] {
  return [
    ...energyFieldFixtures,
    ...ENERGY_FIELD_STATES.flatMap((state) => [
      maximumEnergyFieldFixture('79', state),
      ...(state === 'known' ? [] : [maximumEnergyFieldFixture('80', state)]),
    ]),
    maximumEnergyFieldFixture('80', 'simulated', true),
    maximumEnergyFieldFixture('80', 'illustrative', false, true),
  ].map((f) => {
    const ctx = makeParseContext(f.words, f.window);
    const scene =
      f.id === '79'
        ? parseExpansionEnergyBudget(f.proposal, ctx)
        : parseExpansionDirectionalField(f.proposal, ctx);
    if (!scene || ctx.issues.length)
      throw new Error(`Invalid source fixture ${f.id}: ${ctx.issues.join('; ')}`);
    return scene;
  });
}
