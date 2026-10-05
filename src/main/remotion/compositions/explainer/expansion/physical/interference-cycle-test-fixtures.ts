import { readFileSync } from 'node:fs';
import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ExpansionSourceFixture } from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionInterference,
  parseExpansionMaterialStateCycle,
} from '../../../../../ai/explainer/expansion-physical-interference-cycle-contract';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { interferenceCycleEligibility, interferenceCyclePose } from './interference-cycle-poses';
import type {
  ExpansionInterferenceCycleScene,
  InterferenceCycleState,
} from './interference-cycle-types';

export function interferenceCyclePacket(): { stories: TemporalFixtureSeed[] } {
  return JSON.parse(
    readFileSync(
      'scripts/explainer-stills/fixtures/expansion/physical/interference-cycle.source.json',
      'utf8',
    ),
  );
}
export function parseInterferenceCycle(
  f: ExpansionSourceFixture,
  visualMode: 'diagram' | 'hybrid' = 'diagram',
): ExpansionInterferenceCycleScene {
  const ctx = makeParseContext(f.words, f.window);
  const scene = (f.id === '77' ? parseExpansionInterference : parseExpansionMaterialStateCycle)(
    { ...f.proposal, visualMode },
    ctx,
  );
  if (!scene || ctx.issues.length) throw new Error(`${f.id}: ${JSON.stringify(ctx.issues)}`);
  return scene;
}
export const interferenceCycleStates: readonly InterferenceCycleState[] = [
  'known',
  'unknown',
  'missing',
  'disputed',
  'conditional',
  'simulated',
  'illustrative',
];
export const interferenceCycleCondition = `if ${'W'.repeat(93)}`;
/** Author source first, then use the real parser. No post-parse fabricated facts. */
export function interferenceCycleStress(
  id: '77' | '78',
  state: InterferenceCycleState,
): ExpansionSourceFixture {
  const seed = interferenceCyclePacket().stories.find((s) => s.id === id);
  if (!seed) throw new Error('Missing authored seed');
  const raw = seed.proposal;
  const clauses = seed.sourceText.split(/(?<=[.!?])\s+/);
  const rows = [...(raw.records as Rec[]), ...(raw.relations as Rec[])];
  if (state === 'conditional') raw.condition = interferenceCycleCondition;
  if (state === 'illustrative' || state === 'simulated') raw.evidence = 'illustrative';
  for (const row of rows) {
    if (state === 'conditional' && row !== rows[0]) continue;
    row.state = state;
    const old = String(row.value);
    const index = clauses.findIndex((c) => c.includes(`${row.role} as ${old}`));
    if (index < 0) throw new Error('Missing complete source clause');
    if (['unknown', 'missing', 'disputed'].includes(state)) {
      delete row.value;
      row.qualifier = state;
      clauses[index] = clauses[index].replace(`as ${old}`, `as ${state}`);
    }
    if (state === 'conditional') {
      row.condition = interferenceCycleCondition;
      clauses[index] = `${interferenceCycleCondition}, ${clauses[index]}`;
    }
    if (state === 'illustrative' || state === 'simulated') {
      row.qualifier = state === 'simulated' ? 'simulation' : 'teaching example';
      clauses[index] = `In this ${row.qualifier}, ${clauses[index]}`;
    }
  }
  raw.outcome = rows.at(-1)?.value ?? state;
  const replacements: [string, string][] = [
    ['bench', `${'W'.repeat(39)}X`],
    ['trial', 'P'.repeat(32)],
    ['Board', `B${'W'.repeat(27)}`],
    ['Wax', `D${'W'.repeat(27)}`],
    ...(id === '77'
      ? ([
          ['Wave A', `A${'W'.repeat(27)}`],
          ['Wave B', `C${'W'.repeat(27)}`],
        ] as [string, string][])
      : []),
  ];
  const replace = (text: string) =>
    replacements.reduce((s, [from, to]) => s.split(from).join(to), text);
  const map = (value: unknown): unknown =>
    typeof value === 'string'
      ? replace(value)
      : Array.isArray(value)
        ? value.map(map)
        : value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, map(v)]))
          : value;
  const proposal = map(raw) as Rec;
  const fixtures = temporalSourceFixtures([
    {
      ...seed,
      proposal,
      negatives: [],
      examples: [],
      paraphrases: [
        {
          name: `maximum ${state}`,
          clauses: clauses.map(replace),
          outcome: String(proposal.outcome),
        },
      ],
    },
  ]);
  return fixtures[1];
}
function rewritten(
  seed: TemporalFixtureSeed,
  clauses: readonly string[],
  name: string,
): ExpansionSourceFixture {
  return temporalSourceFixtures([
    {
      ...seed,
      negatives: [],
      examples: [],
      paraphrases: [{ name, clauses, outcome: String(seed.proposal.outcome) }],
    },
  ])[1];
}
function maximumSource(f: ExpansionSourceFixture): ExpansionSourceFixture {
  const replacements = [
    ['bench', `${'W'.repeat(39)}X`],
    ['trial', 'P'.repeat(32)],
    ['Board', `B${'W'.repeat(27)}`],
    ['Wax', `D${'W'.repeat(27)}`],
    ['Wave A', `A${'W'.repeat(27)}`],
    ['Wave B', `C${'W'.repeat(27)}`],
  ];
  const replace = (s: string): string =>
    replacements.reduce((text, [from, to]) => text.split(from).join(to), s);
  const map = (v: unknown): unknown =>
    typeof v === 'string'
      ? replace(v)
      : Array.isArray(v)
        ? v.map(map)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, value]) => [k, map(value)]))
          : v;
  const seed: TemporalFixtureSeed = { ...f, negatives: [], proposal: map(f.proposal) as Rec };
  return rewritten(
    seed,
    f.sourceText.split(/(?<=[.!?])\s+/).map(replace),
    'maximum source-bound slots',
  );
}
export const interferenceCycleParameterNames = [
  'amplitude',
  'frequency',
  'phaseData',
  'domainDuration',
] as const;
export function interferenceCycleParameterFixture(
  waveIndex: number,
  parameter: (typeof interferenceCycleParameterNames)[number],
  state: InterferenceCycleState,
): ExpansionSourceFixture {
  const seed = interferenceCyclePacket().stories[0];
  const q = (seed.proposal.waves as Rec[])[waveIndex][parameter] as Rec;
  const clauses = seed.sourceText.split(/(?<=[.!?])\s+/);
  const index = 1 + waveIndex * 4 + interferenceCycleParameterNames.indexOf(parameter);
  q.state = state;
  if (state === 'unknown' || state === 'missing' || state === 'disputed') {
    delete q.amount;
    q.qualifier = state;
    const value = state === 'disputed' ? 'disputed between 1/3 and 2/3' : state;
    if (state === 'disputed')
      q.alternatives = [1, 2].map((numerator) => ({
        kind: 'rational',
        value: { numerator, denominator: 3 },
      }));
    clauses[index] = clauses[index].replace(/is [\d.]+ /, `is ${value} `);
  }
  if (state === 'conditional') {
    q.condition = interferenceCycleCondition;
    seed.proposal.condition = interferenceCycleCondition;
    clauses[index] = `${interferenceCycleCondition}, ${clauses[index]}`;
  }
  if (state === 'illustrative' || state === 'simulated') {
    q.qualifier = state === 'illustrative' ? 'teaching example' : 'simulation';
    seed.proposal.evidence = 'illustrative';
    clauses[index] = `In this ${q.qualifier}, ${clauses[index]}`;
  }
  return maximumSource(rewritten(seed, clauses, `parameter ${waveIndex}/${parameter}/${state}`));
}
export function interferenceCycleNumericFixture(
  kind: 'rational' | 'near-bound' | 'zero' | 'unequal-domain',
): ExpansionSourceFixture {
  const seed = interferenceCyclePacket().stories[0];
  const clauses = seed.sourceText.split(/(?<=[.!?])\s+/);
  const values =
    kind === 'near-bound'
      ? [
          [999999999, 1000],
          [1000000, 1000],
          [6283185, 1000000],
          [10000000, 1000],
        ]
      : kind === 'zero'
        ? [
            [0, 1],
            [0, 1],
            [0, 1],
            [1, 1000000000],
          ]
        : [
            [1, 3],
            [2, 3],
            [3, 4],
            [4, 3],
          ];
  for (const [wi, wave] of (seed.proposal.waves as Rec[]).entries())
    for (const [pi, name] of interferenceCycleParameterNames.entries()) {
      const q = wave[name] as Rec;
      const [numerator, denominator] =
        kind === 'unequal-domain' && wi === 1 && pi === 3 ? [2, 1] : values[pi];
      q.amount = { kind: 'rational', value: { numerator, denominator } };
      const notation =
        kind === 'near-bound'
          ? (numerator / denominator).toFixed(pi === 2 ? 6 : 3)
          : `${numerator}/${denominator}`;
      const index = 1 + wi * 4 + pi;
      clauses[index] = clauses[index]
        .replace(/is [\d.]+ /, `is ${notation} `)
        .replace(/\.$/, ' with denominator 1/3.');
      (q.basis as Rec).denominator = { numerator: 1, denominator: 3 };
    }
  return maximumSource(rewritten(seed, clauses, kind));
}
export function interferenceCycleFactFixture(
  id: '77' | '78',
  factIndex: number,
  state: InterferenceCycleState,
): ExpansionSourceFixture {
  const seed = interferenceCyclePacket().stories.find((s) => s.id === id);
  if (!seed) throw new Error('Missing source');
  const rows = [...(seed.proposal.records as Rec[]), ...(seed.proposal.relations as Rec[])];
  const row = rows[factIndex];
  const clauses = seed.sourceText.split(/(?<=[.!?])\s+/);
  const index = clauses.findIndex((c) => c.includes(`${row.role} as ${row.value}`));
  if (index < 0) throw new Error('Missing fact source');
  row.state = state;
  if (state === 'unknown' || state === 'missing' || state === 'disputed') {
    clauses[index] = clauses[index].replace(`as ${row.value}`, `as ${state}`);
    delete row.value;
    row.qualifier = state;
  }
  if (state === 'conditional') {
    seed.proposal.condition = interferenceCycleCondition;
    row.condition = interferenceCycleCondition;
    clauses[index] = `${interferenceCycleCondition}, ${clauses[index]}`;
  }
  if (state === 'simulated' || state === 'illustrative') {
    seed.proposal.evidence = 'illustrative';
    row.qualifier = state === 'simulated' ? 'simulation' : 'teaching example';
    clauses[index] = `In this ${row.qualifier}, ${clauses[index]}`;
  }
  if (row === rows.at(-1)) seed.proposal.outcome = row.value ?? state;
  return maximumSource(rewritten(seed, clauses, `fact ${factIndex}/${state}`));
}
export function interferenceCycleSources(): ExpansionSourceFixture[] {
  const fixtures = temporalSourceFixtures(interferenceCyclePacket().stories);
  for (const id of ['77', '78'] as const) {
    for (const state of interferenceCycleStates) fixtures.push(interferenceCycleStress(id, state));
    for (let fact = 0; fact < (id === '77' ? 2 : 4); fact++)
      for (const state of interferenceCycleStates)
        fixtures.push(interferenceCycleFactFixture(id, fact, state));
  }
  for (let wave = 0; wave < 2; wave++)
    for (const name of interferenceCycleParameterNames)
      for (const state of interferenceCycleStates)
        fixtures.push(interferenceCycleParameterFixture(wave, name, state));
  for (const kind of ['rational', 'near-bound', 'zero', 'unequal-domain'] as const)
    fixtures.push(interferenceCycleNumericFixture(kind));
  return fixtures;
}
export function interferenceCycleCases(): ExpansionInterferenceCycleScene[] {
  return interferenceCycleSources().flatMap((f) => [
    parseInterferenceCycle(f, 'diagram'),
    parseInterferenceCycle(f, 'hybrid'),
  ]);
}

export interface InterferenceCycleGeometry {
  readonly geometry: BufferGeometry;
  readonly matrix: Matrix4;
  readonly tag: string;
  readonly args: readonly number[];
}
/** Constructor inventory matched to composed JSX in mesh-budget proofs, including hidden hosts. */
export function interferenceCycleCarrierGeometry(
  scene: ExpansionInterferenceCycleScene,
  t: number,
): InterferenceCycleGeometry[] {
  const result: InterferenceCycleGeometry[] = [];
  const add = (
    geometry: BufferGeometry,
    tag: string,
    args: readonly number[],
    position: [number, number, number] = [0, 0, 0],
    rotation: [number, number, number] = [0, 0, 0],
  ): void => {
    result.push({
      geometry,
      tag,
      args,
      matrix: new Matrix4().compose(
        new Vector3(...position),
        new Quaternion().setFromEuler(new Euler(...rotation)),
        new Vector3(1, 1, 1),
      ),
    });
  };
  const block = (
    size: [number, number, number],
    position: [number, number, number] = [0, 0, 0],
  ): void =>
    add(
      new RoundedBoxGeometry(...size, 3, Math.min(0.07, ...size.map((v) => v / 2))),
      'attachedRoundedBox',
      size,
      position,
    );
  const cylinder = (
    args: [number, number, number, number],
    position: [number, number, number] = [0, 0, 0],
    rotation: [number, number, number] = [0, 0, 0],
  ): void => add(new CylinderGeometry(...args), 'cylinderGeometry', args, position, rotation);
  if (scene.storyId === '78') {
    cylinder([0.5, 0.5, 0.08, 24]);
    add(
      new TorusGeometry(0.45, 0.04, 8, 24),
      'torusGeometry',
      [0.45, 0.04, 8, 24],
      [0, 0.1, 0],
      [Math.PI / 2, 0, 0],
    );
    add(new BoxGeometry(0.38, 0.38, 0.38), 'boxGeometry', [0.38, 0.38, 0.38], [0, 0.3, 0]);
    cylinder([0.37, 0.37, 0.08, 24], [0, 0.14, 0]);
    for (const [j, x] of [-0.2, 0, 0.2].entries())
      add(
        new SphereGeometry(0.07, 12, 8),
        'sphereGeometry',
        [0.07, 12, 8],
        [x, 0.28 + j * 0.12, 0],
      );
  } else if (interferenceCycleEligibility(scene) === 'supported') {
    block([1.8, 0.08, 0.38]);
    cylinder([0.035, 0.035, 1.32, 12], [0, 0.12, 0], [0, 0, Math.PI / 2]);
    for (const x of [-0.72, 0.72]) {
      block([0.18, 0.16, 0.2], [x, 0.12, 0]);
      cylinder([0.045, 0.045, 0.24, 12], [x, 0.12, 0], [0, 0, Math.PI / 2]);
    }
  } else {
    block([1.35, 0.9, 0.5]);
    block([0.98, 0.36, 0.04], [0, 0.17, 0.27]);
    cylinder(
      [0.09, 0.09, 0.07, 16],
      [-0.4, -0.25, 0.28],
      [Math.PI / 2, 0, (interferenceCyclePose(scene, t).check * Math.PI) / 3],
    );
    block([0.24, 0.05, 0.05], [0.32, -0.25, 0.28]);
    for (const x of [-0.45, 0.45]) block([0.12, 0.08, 0.35], [x, -0.49, 0]);
  }
  return result;
}
