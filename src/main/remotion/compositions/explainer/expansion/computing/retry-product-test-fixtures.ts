import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { type Box3, Euler, Matrix4, Quaternion, TorusGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { vi } from 'vitest';
import {
  parseExpansionIdempotentRetry,
  parseExpansionProductWalkthrough,
} from '../../../../../ai/explainer/expansion-computing-retry-product-contract';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { ExplainerProvider } from '../../stage';
import { RetryProductModels } from './retry-product-models';
import type { RetryProductPose } from './retry-product-poses';
import type { ExpansionRetryProductScene, RetryProductState } from './retry-product-types';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/computing/retry-product.source.json',
    'utf8',
  ),
) as { stories: TemporalFixtureSeed[] };
export const retryProductSources = temporalSourceFixtures(packet.stories);
export function retryProductAccepted(f: ExpansionSourceFixture): ExpansionRetryProductScene {
  const ctx = makeParseContext(f.words, f.window);
  const scene = (f.id === '67' ? parseExpansionIdempotentRetry : parseExpansionProductWalkthrough)(
    f.proposal,
    ctx,
  );
  if (!scene || ctx.issues.length) throw new Error(JSON.stringify(ctx.issues));
  return scene;
}
/** Re-index complete independent clauses, preserving five >=1s gaps and final hold. */
function rebuild(
  f: ExpansionSourceFixture,
  proposal: Rec,
  clauses: string[],
): ExpansionSourceFixture {
  const speech = expansionFixtureSpeech(clauses, 12);
  const records = proposal.records as Rec[];
  const phaseIndices = [0, 1, 2, 3, clauses.length - 1];
  const starts = [0.25, 2.25, 4.25, 6.25, 10.25];
  // Extra facts fit in the independent check-to-resolve interval; never share beat evidence.
  for (const [i, span] of speech.spans.entries()) {
    const phase = phaseIndices.indexOf(i);
    const start = phase >= 0 ? starts[phase] : 7.3 + (i - 4) * 0.38;
    const end = start + (phase >= 0 ? 0.9 : 0.36);
    const count = span.toWord - span.fromWord + 1;
    for (let j = 0; j < count; j++) {
      speech.words[span.fromWord + j].start = start + ((end - start) * j) / count;
      speech.words[span.fromWord + j].end = start + ((end - start) * (j + 1)) / count;
    }
  }
  for (const [i, phase] of ['setup', 'action', 'response', 'check', 'resolve'].entries()) {
    const span = speech.spans[phaseIndices[i]];
    proposal[`${phase}Word`] = span.fromWord;
    records[i].evidence = span;
  }
  for (const entity of proposal.entities as Rec[]) entity.evidence = speech.spans[0];
  for (const [i, relation] of (proposal.relations as Rec[]).entries())
    relation.evidence = speech.spans[phaseIndices[i]];
  for (const [i, q] of (proposal.quantities as Rec[]).entries()) q.evidence = speech.spans[4 + i];
  return { ...f, ...speech, proposal };
}
export function retryProductStateSource(
  f: ExpansionSourceFixture,
  state: RetryProductState,
): ExpansionSourceFixture {
  const proposal = structuredClone(f.proposal),
    records = proposal.records as Rec[];
  const clauses = f.sourceText.split(/(?<=[.;])\s+/);
  records[2].state = state;
  clauses[2] = clauses[2].replace('with stated state', `with ${state} state`);
  if (state === 'conditional') {
    records[2].condition = 'if reviewed';
    clauses[2] = clauses[2].replace(/\.$/, ' if reviewed.');
  }
  if (state === 'simulated' || state === 'illustrative') {
    records[2].qualifier = 'this example';
    clauses[2] = `In this example, ${clauses[2]}`;
  }
  return rebuild(f, proposal, clauses);
}
export function retryProductMaximum(f: ExpansionSourceFixture): ExpansionSourceFixture {
  const proposal = structuredClone(f.proposal),
    clauses = f.sourceText.split(/(?<=[.;])\s+/);
  const records = proposal.records as Rec[];
  const replacements = new Map<string, string>([
    [String(proposal.actor), 'W'.repeat(28)],
    [String(proposal.identity), 'I'.repeat(28)],
    [String(proposal.scope), 'S'.repeat(40)],
    [String(proposal.period), 'P'.repeat(32)],
  ]);
  for (const [a, b] of replacements) {
    for (let i = 0; i < clauses.length; i++) clauses[i] = clauses[i].split(a).join(b);
    for (const r of records)
      for (const key of ['actor', 'identity', 'scope', 'period']) if (r[key] === a) r[key] = b;
    for (const e of proposal.entities as Rec[]) if (e.label === a) e.label = b;
    for (const key of ['actor', 'identity', 'subject', 'scope', 'period'])
      if (proposal[key] === a) proposal[key] = b;
  }
  for (const [i, r] of records.entries()) {
    const claim = 'C'.repeat(48),
      value = 'V'.repeat(i === 4 ? 54 : 64);
    clauses[i] = clauses[i]
      .replace(String(r.claim), claim)
      .replace(`as ${String(r.value)} with`, `as ${value} with`);
    r.claim = claim;
    r.value = value;
  }
  proposal.label = records[0].claim;
  proposal.outcome = records[4].value;
  proposal.relations = Array.from({ length: 5 }, () => ({
    from: proposal.actor,
    to: proposal.identity,
    role: 'provenance',
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
  const quantities = values.map(([notation, numerator, denominator], i) => {
    const claim = `measure${i}`;
    clauses.splice(
      4 + i,
      0,
      `${String(proposal.actor)} ${claim} is ${notation} ratio during ${String(proposal.period)} among ${String(proposal.scope)} with denominator 1000000000.`,
    );
    return {
      actor: proposal.actor,
      claim,
      state: 'known',
      basis: {
        unit: 'ratio',
        period: proposal.period,
        population: proposal.scope,
        denominator: { numerator: 1000000000, denominator: 1 },
      },
      amount: { kind: 'rational', value: { numerator, denominator } },
    };
  });
  proposal.quantities = quantities;
  return rebuild(f, proposal, clauses);
}
export function retryProductCases(): ExpansionRetryProductScene[] {
  return [
    ...retryProductSources,
    ...retryProductSources.flatMap((f) =>
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
      ).map((s) => retryProductStateSource(f, s)),
    ),
    ...[retryProductSources[0], retryProductSources[2]].map(retryProductMaximum),
  ].map(retryProductAccepted);
}

/** Instrument only serialization of real, composed RoundedBoxGeometry instances.
 * React runs every hook under the real provider; no fake Three/Remotion context.
 * Actual host transforms and torus arguments are recovered from emitted SSR markup.
 */
export function retryProductModelEvidence(
  scene: ExpansionRetryProductScene,
  pose: RetryProductPose,
  presentation?: 'speaker-side' | 'speaker-pip' | 'full-frame',
): { markup: string; corners: Vector3[]; roundedResources: number; torusResources: number } {
  const geometry: RoundedBoxGeometry[] = [];
  const serialization = vi
    .spyOn(RoundedBoxGeometry.prototype as RoundedBoxGeometry & { toString(): string }, 'toString')
    .mockImplementation(function (this: RoundedBoxGeometry) {
      const existing = geometry.indexOf(this);
      if (existing >= 0) return `geometry-${existing}`;
      const id = geometry.length;
      geometry.push(this);
      return `geometry-${id}`;
    });
  let markup: string;
  try {
    markup = renderToStaticMarkup(
      createElement(
        ExplainerProvider,
        {
          value: { aspect: presentation ? '16:9' : '9:16', presentation, nativeStage: true },
        },
        createElement(RetryProductModels, {
          scene,
          pose,
          colors: { surface: '#ffffff', text: '#000000', accent: '#555555', muted: '#888888' },
        }),
      ),
    );
  } finally {
    serialization.mockRestore();
  }
  let torusResources = 0;
  const stack: Matrix4[] = [new Matrix4()],
    meshes: Matrix4[] = [],
    corners: Vector3[] = [];
  const add = (box: Box3, matrix: Matrix4) => {
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z])
          corners.push(new Vector3(x, y, z).applyMatrix4(matrix));
  };
  try {
    for (const m of markup.matchAll(
      /<(group|mesh)\b([^>]*)>|<torusGeometry\b([^>]*)>|<\/(group|mesh)>/g,
    )) {
      if (m[4]) {
        stack.pop();
        if (m[4] === 'mesh') meshes.pop();
        continue;
      }
      const a = Object.fromEntries(
        [...String(m[2] ?? m[3]).matchAll(/([\w-]+)="([^"]*)"/g)].map((v) => [v[1], v[2]]),
      );
      const tuple = (v: string | undefined, fallback: number[]): number[] =>
        v === undefined ? fallback : v.split(',').map(Number);
      if (m[3] !== undefined) {
        const args = tuple(a.args, []);
        const torus = new TorusGeometry(args[0], args[1], args[2], args[3]);
        torusResources++;
        torus.computeBoundingBox();
        if (!torus.boundingBox || !meshes.length) throw new Error('Missing actual torus envelope');
        add(torus.boundingBox, meshes[meshes.length - 1]);
        torus.dispose();
        continue;
      }
      const p = tuple(a.position, [0, 0, 0]),
        r = tuple(a.rotation, [0, 0, 0]);
      const s =
        a.scale === undefined
          ? [1, 1, 1]
          : a.scale.includes(',')
            ? tuple(a.scale, [])
            : Array(3).fill(Number(a.scale));
      const local = new Matrix4().compose(
        new Vector3(p[0], p[1], p[2]),
        new Quaternion().setFromEuler(new Euler(r[0], r[1], r[2])),
        new Vector3(s[0], s[1], s[2]),
      );
      const world = stack[stack.length - 1].clone().multiply(local);
      stack.push(world);
      if (m[1] === 'mesh') {
        meshes.push(world);
        if (a.geometry) {
          const id = /^geometry-(\d+)$/.exec(a.geometry);
          if (!id) throw new Error('Unrecognized actual composed geometry');
          const g = geometry[Number(id[1])];
          g.computeBoundingBox();
          if (!g.boundingBox) throw new Error('Missing actual rounded envelope');
          add(g.boundingBox, world);
        }
      }
    }
    if (!corners.length || stack.length !== 1)
      throw new Error('Incomplete actual host geometry traversal');
    return { markup, corners, roundedResources: geometry.length, torusResources };
  } finally {
    for (const g of geometry) g.dispose();
  }
}
