import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  type Box3,
  CapsuleGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionIncentiveExternality,
  parseExpansionSupplyChain,
} from '../../../../../ai/explainer/expansion-physical-supply-incentives-contract';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { ExplainerProvider } from '../../stage';
import { SupplyIncentivesModels } from './supply-incentives-models';
import type { SupplyIncentivesPose } from './supply-incentives-poses';
import type {
  ExpansionSupplyIncentivesScene,
  SupplyIncentivesState,
} from './supply-incentives-types';

export function supplyIncentivesSources(): ExpansionSourceFixture[] {
  const packet = JSON.parse(
    readFileSync(
      'scripts/explainer-stills/fixtures/expansion/physical/supply-incentives.source.json',
      'utf8',
    ),
  ) as { stories: TemporalFixtureSeed[] };
  return temporalSourceFixtures(packet.stories);
}
export function supplyIncentivesAccepted(
  f: ExpansionSourceFixture,
): ExpansionSupplyIncentivesScene {
  const ctx = makeParseContext(f.words, f.window);
  const scene = (f.id === '73' ? parseExpansionSupplyChain : parseExpansionIncentiveExternality)(
    f.proposal,
    ctx,
  );
  if (!scene || ctx.issues.length) throw new Error(`${f.id}: ${JSON.stringify(ctx.issues)}`);
  for (const visualMode of ['diagram', 'hybrid'] as const) {
    const modeCtx = makeParseContext(f.words, f.window);
    const modeScene = (
      f.id === '73' ? parseExpansionSupplyChain : parseExpansionIncentiveExternality
    )({ ...f.proposal, visualMode }, modeCtx);
    if (
      !modeScene ||
      modeCtx.issues.length ||
      JSON.stringify(modeScene) !== JSON.stringify({ ...scene, visualMode })
    )
      throw new Error(`Mode parity failed for ${f.id}: ${JSON.stringify(modeCtx.issues)}`);
  }
  return scene;
}
const phases = ['setup', 'action', 'response', 'check', 'resolve'];
function rebuild(
  f: ExpansionSourceFixture,
  proposal: Rec,
  clauses: string[],
): ExpansionSourceFixture {
  const speech = expansionFixtureSpeech(clauses, 12),
    records = proposal.records as Rec[];
  const indices = [0, 1, 2, 3, clauses.length - 1],
    starts = [0.25, 2.25, 4.25, 6.25, 10.25];
  for (const [i, span] of speech.spans.entries()) {
    const phase = indices.indexOf(i),
      start = phase >= 0 ? starts[phase] : 7.3 + (i - 4) * 0.38,
      end = start + (phase >= 0 ? 0.9 : 0.36),
      count = span.toWord - span.fromWord + 1;
    for (let j = 0; j < count; j++) {
      speech.words[span.fromWord + j].start = start + ((end - start) * j) / count;
      speech.words[span.fromWord + j].end = start + ((end - start) * (j + 1)) / count;
    }
  }
  phases.forEach((phase, i) => {
    proposal[`${phase}Word`] = speech.spans[indices[i]].fromWord;
    records[i].evidence = speech.spans[indices[i]];
  });
  for (const e of proposal.entities as Rec[]) {
    const i = records.findIndex((r) => r.actor === e.label || r.target === e.label);
    e.evidence = speech.spans[indices[i]];
  }
  for (const relation of proposal.relations as Rec[]) {
    const i = records.findIndex(
      (r) => r.actor === relation.from && r.target === relation.to && r.role === relation.role,
    );
    relation.evidence = speech.spans[indices[i]];
  }
  for (const [i, q] of (proposal.quantities as Rec[]).entries()) q.evidence = speech.spans[4 + i];
  return { ...f, ...speech, proposal };
}
const ordinary: Record<string, string> = {
  stage: 'identifies',
  inventory: 'holds',
  transfer: 'transfers',
  replacement: 'replaces',
  exchange: 'identifies exchange',
  payment: 'pays',
  benefit: 'receives',
  'external-effect': 'reports external effect',
  result: 'reports',
};
const paraphrase: Record<string, string> = {
  stage: 'names',
  inventory: 'retains',
  transfer: 'sends',
  replacement: 'restocks',
  exchange: 'names exchange',
  payment: 'provides',
  benefit: 'obtains',
  'external-effect': 'describes external effect',
  result: 'describes',
};
function assertion(r: Rec, alternate = false): string {
  return `${r.qualifier ? `In ${String(r.qualifier)}, ` : ''}${String(r.actor)} ${(alternate ? paraphrase : ordinary)[String(r.role)]} ${String(r.claim)} toward ${String(r.target)} at stage ${String(r.stage)} as ${String(r.value)} with ${String(r.state)} state for ${String(r.scope)} during ${String(r.period)}${r.condition ? ` ${String(r.condition)}` : ''}.`;
}
export function supplyIncentivesStateSource(
  f: ExpansionSourceFixture,
  state: SupplyIncentivesState,
): ExpansionSourceFixture {
  const proposal = structuredClone(f.proposal),
    records = proposal.records as Rec[];
  for (const r of records) {
    r.state = state;
    delete r.condition;
    delete r.qualifier;
    if (state === 'conditional') r.condition = `if ${'C'.repeat(61)}`;
    if (state === 'simulated' || state === 'illustrative')
      r.qualifier = `${state} ${'Q'.repeat(state === 'simulated' ? 38 : 35)}`;
  }
  return rebuild(
    f,
    proposal,
    records.map((r) => assertion(r)),
  );
}
export function supplyIncentivesParaphrase(f: ExpansionSourceFixture): ExpansionSourceFixture {
  const p = structuredClone(f.proposal),
    records = p.records as Rec[];
  for (const [i, r] of records.entries()) {
    r.claim = [
      'route details',
      'stored material',
      'delivery request',
      'replacement request',
      'reported status',
    ][i];
    r.value = [
      'scheduled locally',
      'availability reported',
      'dispatch recorded',
      'request recorded',
      'awaiting review',
    ][i];
    r.stage = [
      'production desk',
      'storage room',
      'delivery lane',
      'replacement desk',
      'review desk',
    ][i];
  }
  p.label = records[0].claim;
  p.subject = records[0].stage;
  p.outcome = records[4].value;
  return rebuild(
    f,
    p,
    records.map((r) => assertion(r, true)),
  );
}
export function supplyIncentivesMaximum(
  f: ExpansionSourceFixture,
  quantityStates = false,
): ExpansionSourceFixture {
  const p = structuredClone(f.proposal),
    records = p.records as Rec[],
    names = ['W', 'M', 'N', 'O'].map((c) => c.repeat(28));
  p.entities = names.map((label) => ({ label, evidence: { fromWord: 0, toWord: 0 } }));
  p.scope = 'S'.repeat(40);
  p.period = 'P'.repeat(32);
  const endpoints = [
    [0, 1],
    [1, 2],
    [0, 3],
    [2, 1],
    [3, 2],
  ];
  for (const [i, r] of records.entries()) {
    r.actor = names[endpoints[i][0]];
    r.target = names[endpoints[i][1]];
    r.claim = 'C'.repeat(48);
    r.value = 'V'.repeat(i === 4 ? 54 : 64);
    r.stage = 'T'.repeat(32);
    r.scope = p.scope;
    r.period = p.period;
    r.state = 'conditional';
    r.condition = `if ${'H'.repeat(61)}`;
  }
  p.label = records[0].claim;
  p.subject = records[0].stage;
  p.outcome = records[4].value;
  p.relations = records.map((r) => ({
    from: r.actor,
    to: r.target,
    role: r.role,
    evidence: { fromWord: 0, toWord: 0 },
  }));
  const values = [
    ['1000000000', 1000000000, 1],
    ['-1000000000', -1000000000, 1],
    ['1/1000000000', 1, 1000000000],
    ['-1/1000000000', -1, 1000000000],
    ['0.000001', 1, 1000000],
    ['0', 0, 1],
    ['999999999/1000000000', 999999999, 1000000000],
  ] as const;
  const states = [
    'known',
    'conditional',
    'simulated',
    'illustrative',
    'unknown',
    'missing',
    'disputed',
  ];
  const extra: string[] = [];
  p.quantities = values.map(([notation, numerator, denominator], i) => {
    const claim = String.fromCharCode(65 + i).repeat(96),
      state = quantityStates ? states[i] : 'known';
    const basis = {
      unit: 'ratio',
      period: p.period,
      population: p.scope,
      denominator: { numerator: 1000000000, denominator: 1 },
    };
    const q: Rec = { actor: names[i % 4], claim, state, basis };
    let value: string = notation,
      prefix = '',
      suffix = '';
    if (state === 'unknown' || state === 'missing') {
      q.qualifier = state;
      value = state;
    } else if (state === 'disputed') {
      q.qualifier = 'disputed';
      q.alternatives = [
        { kind: 'rational', value: { numerator: 1000000000, denominator: 1 } },
        { kind: 'rational', value: { numerator: -1000000000, denominator: 1 } },
      ];
      value = 'disputed between 1000000000 and -1000000000';
    } else {
      q.amount = { kind: 'rational', value: { numerator, denominator } };
      if (state === 'conditional') {
        q.condition = `if ${'J'.repeat(93)}`;
        suffix = ` ${String(q.condition)}`;
      }
      if (state === 'simulated' || state === 'illustrative') {
        q.qualifier = `${state} ${'K'.repeat(state === 'simulated' ? 86 : 83)}`;
        prefix = `In this ${String(q.qualifier)}, `;
      }
    }
    extra.push(
      `${prefix}${String(q.actor)} ${claim} is ${value} ratio during ${String(p.period)} among ${String(p.scope)} with denominator 1000000000${suffix}.`,
    );
    return q;
  });
  return rebuild(f, p, [
    ...records.slice(0, 4).map((r) => assertion(r)),
    ...extra,
    assertion(records[4]),
  ]);
}
export function supplyIncentivesCases(): ExpansionSupplyIncentivesScene[] {
  const sources = supplyIncentivesSources();
  return [
    ...sources,
    ...sources.map(supplyIncentivesParaphrase),
    ...sources.flatMap((f) =>
      (
        [
          'stated',
          'unknown',
          'missing',
          'disputed',
          'conditional',
          'simulated',
          'illustrative',
        ] as const
      ).map((state) => supplyIncentivesStateSource(f, state)),
    ),
    ...sources.flatMap((f) => [supplyIncentivesMaximum(f), supplyIncentivesMaximum(f, true)]),
  ].map(supplyIncentivesAccepted);
}
export function supplyIncentivesFixtures(): ExpansionSupplyIncentivesScene[] {
  return supplyIncentivesCases();
}

/** CPU instrumentation of actual composed geometry serialization; no GL or fake provider.
 * Includes visible=false resources; each proof owns and disposes its local geometries.
 */
export function supplyIncentivesModelEvidence(
  scene: ExpansionSupplyIncentivesScene,
  pose: SupplyIncentivesPose,
  presentation?: 'speaker-side' | 'speaker-pip' | 'full-frame',
): { markup: string; corners: Vector3[]; roundedResources: number; primitiveResources: number } {
  const geometries: RoundedBoxGeometry[] = [];
  const original = Object.getOwnPropertyDescriptor(RoundedBoxGeometry.prototype, 'toString');
  Object.defineProperty(RoundedBoxGeometry.prototype, 'toString', {
    configurable: true,
    value: function (this: RoundedBoxGeometry): string {
      let id = geometries.indexOf(this);
      if (id < 0) {
        id = geometries.length;
        geometries.push(this);
      }
      return `geometry-${id}`;
    },
  });
  let markup: string;
  try {
    markup = renderToStaticMarkup(
      createElement(
        ExplainerProvider,
        {
          value: { aspect: presentation ? '16:9' : '9:16', presentation, nativeStage: true },
        },
        createElement(SupplyIncentivesModels, {
          scene,
          pose,
          colors: { surface: '#fff', text: '#000', accent: '#555', muted: '#888' },
        }),
      ),
    );
  } finally {
    if (original) Object.defineProperty(RoundedBoxGeometry.prototype, 'toString', original);
    else Reflect.deleteProperty(RoundedBoxGeometry.prototype, 'toString');
  }
  const stack = [new Matrix4()],
    meshes: Matrix4[] = [],
    corners: Vector3[] = [];
  let primitiveResources = 0;
  const add = (box: Box3, matrix: Matrix4) => {
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z])
          corners.push(new Vector3(x, y, z).applyMatrix4(matrix));
  };
  try {
    for (const m of markup.matchAll(
      /<(group|mesh)\b([^>]*)>|<(cylinder|sphere|capsule|torus)Geometry\b([^>]*)>|<\/(group|mesh)>/g,
    )) {
      if (m[5]) {
        stack.pop();
        if (m[5] === 'mesh') meshes.pop();
        continue;
      }
      const a = Object.fromEntries(
        [...String(m[2] ?? m[4]).matchAll(/([\w-]+)="([^"]*)"/g)].map((v) => [v[1], v[2]]),
      );
      const tuple = (s: string | undefined, def: number[]) =>
        s === undefined ? def : s.split(',').map(Number);
      if (m[3]) {
        const args = tuple(a.args, []);
        const g =
          m[3] === 'cylinder'
            ? new CylinderGeometry(args[0], args[1], args[2], args[3])
            : m[3] === 'sphere'
              ? new SphereGeometry(args[0], args[1], args[2])
              : m[3] === 'capsule'
                ? new CapsuleGeometry(args[0], args[1], args[2], args[3])
                : new TorusGeometry(args[0], args[1], args[2], args[3], args[4]);
        primitiveResources++;
        g.computeBoundingBox();
        if (!g.boundingBox || !meshes.length) throw new Error('Missing primitive envelope');
        add(g.boundingBox, meshes[meshes.length - 1]);
        g.dispose();
        continue;
      }
      const p = tuple(a.position, [0, 0, 0]),
        r = tuple(a.rotation, [0, 0, 0]),
        s =
          a.scale === undefined
            ? [1, 1, 1]
            : a.scale.includes(',')
              ? tuple(a.scale, [])
              : [Number(a.scale), Number(a.scale), Number(a.scale)];
      const local = new Matrix4().compose(
        new Vector3(...p),
        new Quaternion().setFromEuler(new Euler(...r)),
        new Vector3(...s),
      );
      const world = stack[stack.length - 1].clone().multiply(local);
      stack.push(world);
      if (m[1] === 'mesh') {
        meshes.push(world);
        if (a.geometry) {
          const id = Number(a.geometry.replace('geometry-', ''));
          const g = geometries[id];
          if (!g) throw new Error('Missing rounded geometry');
          g.computeBoundingBox();
          if (!g.boundingBox) throw new Error('Missing rounded envelope');
          add(g.boundingBox, world);
        }
      }
    }
    return { markup, corners, roundedResources: geometries.length, primitiveResources };
  } finally {
    for (const g of geometries) g.dispose();
  }
}
