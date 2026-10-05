import { readFileSync } from 'node:fs';
import { type BufferGeometry, CylinderGeometry, TorusGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionDiffusionFilter,
  parseExpansionSharedResource,
} from '../../../../../ai/explainer/expansion-physical-resource-diffusion-contract';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionQuantity } from '../value-types';
import type { ExpansionResourceDiffusionScene } from './resource-diffusion-types';

export function maximumResourceDiffusionFixture(
  id: '75' | '76',
  state: ExpansionQuantity['state'],
  decisionState:
    | 'unknown'
    | 'missing'
    | 'disputed'
    | 'granted'
    | 'denied'
    | 'conditional'
    | 'illustrative'
    | 'simulated' = 'unknown',
  extreme: 'high' | 'small' | 'zero' = 'high',
  chromeMax = false,
): ExpansionSourceFixture {
  const actors = [
      'W'.repeat(28),
      'M'.repeat(chromeMax && id === '75' ? 25 : 28),
      'N'.repeat(chromeMax ? 25 : 28),
    ],
    period = 'W'.repeat(chromeMax ? 18 : 32),
    population = 'M'.repeat(chromeMax ? 23 : 40);
  const teaching =
    state === 'simulated' ||
    state === 'illustrative' ||
    decisionState === 'simulated' ||
    decisionState === 'illustrative';
  const model = teaching ? 'illustrative' : 'supplied';
  const qualification =
    model === 'supplied' ? 'supplied material relation' : 'qualitative illustrative model';
  const condition = id === '75' ? `if ${'W'.repeat(41)}` : 'M'.repeat(39);
  const qCondition = `if ${'MW'.repeat(46)}M`;
  const fractions =
    extreme === 'zero'
      ? [
          { numerator: 0, denominator: 1 },
          { numerator: 1, denominator: 1000000000 },
        ]
      : extreme === 'small'
        ? [
            { numerator: 1, denominator: 1000000000 },
            { numerator: 999999999, denominator: 1000000000 },
          ]
        : [
            { numerator: 1000000000, denominator: 999999999 },
            { numerator: 999999999, denominator: 1000000000 },
          ];
  const lexemes = fractions.map((a) => `${a.numerator}/${a.denominator}`);
  const value =
    state === 'unknown' || state === 'missing'
      ? state
      : state === 'disputed'
        ? `disputed between ${lexemes[0]} and ${lexemes[1]}`
        : lexemes[0];
  const roles = id === '75' ? ['limit', 'request'] : ['inventory'];
  const claims = id === '75' ? ['limit', `${actors[0]} request`] : ['inventory'];
  const clauses = [
    id === '75'
      ? `${actors[0]} is shared with ${actors[1]} during ${period} among ${population}.`
      : `In this ${qualification}, ${actors[0]} is in ${actors[1]} with ${actors[2]} during ${period} among ${population}.`,
  ];
  for (const [i, claim] of claims.entries())
    clauses.push(
      `${state === 'simulated' || state === 'illustrative' ? `In this ${state}, ` : ''}${actors[i]} ${claim} is ${value} ${id === '75' ? 'count' : 'gram'} during ${period} among ${population} with denominator 1000000000/999999999${state === 'conditional' ? ` ${qCondition}` : ''}.`,
    );
  if (id === '76')
    clauses.push(
      `${actors[0]} spreads toward ${actors[2]} from ${actors[1]} in this ${qualification}.`,
    );
  const unresolved = ['unknown', 'missing', 'disputed'].includes(decisionState),
    result = unresolved ? 'unresolved' : decisionState === 'denied' ? 'denied' : 'granted';
  const decisionTeaching = decisionState === 'simulated' || decisionState === 'illustrative';
  const status = unresolved
    ? `${decisionState} and unresolved`
    : decisionState === 'conditional'
      ? `conditional ${result}`
      : decisionTeaching
        ? result
        : decisionState;
  clauses.push(
    id === '75'
      ? `${actors[1]} has access to ${actors[0]} only ${condition} during ${period} among ${population}.`
      : `${actors[2]} retains ${actors[0]} under ${condition} in this ${qualification}.`,
  );
  clauses.push(
    id === '75'
      ? `${decisionTeaching ? `In this ${decisionState}, ` : ''}${actors[1]} ${actors[0]} decision is ${status} under ${condition} during ${period} among ${population}.`
      : `${actors[0]} ${actors[2]} result is unresolved under ${condition} in this ${qualification}.`,
  );
  const speech = expansionFixtureSpeech(clauses),
    starts = [0.25, 2, 4, 6, 8];
  for (const [i, span] of speech.spans.entries()) {
    const step = 1.3 / (span.toWord - span.fromWord + 1);
    for (let w = span.fromWord; w <= span.toWord; w++)
      speech.words[w] = {
        ...speech.words[w],
        start: starts[i] + (w - span.fromWord) * step,
        end: starts[i] + (w - span.fromWord + 0.8) * step,
      };
  }
  const amounts = fractions.map((value) => ({ kind: 'rational', value }));
  return {
    id,
    ...speech,
    negatives: [],
    proposal: {
      kind: id === '75' ? 'resource-allocation' : 'material-process',
      preset: id === '75' ? 'shared-resource' : 'diffusion-filter',
      visualMode: 'diagram',
      label: chromeMax ? `${period} among ${population}` : population,
      subject: actors[0],
      outcome: chromeMax
        ? id === '75'
          ? `${actors[1]} ${actors[0]}`
          : `${actors[0]} ${actors[2]}`
        : id === '75'
          ? result
          : 'unresolved',
      evidence: teaching ? 'illustrative' : 'source-stated',
      period,
      population,
      template: id === '75' ? 'single-request' : 'qualitative-filter',
      entities: actors
        .slice(0, id === '75' ? 2 : 3)
        .map((label) => ({ label, evidence: speech.spans[0] })),
      records: roles.map((role, i) => ({
        actor: actors[i],
        role,
        quantity: {
          actor: actors[i],
          claim: claims[i],
          state,
          evidence: speech.spans[i + 1],
          basis: {
            unit: id === '75' ? 'count' : 'gram',
            period,
            population,
            denominator: { numerator: 1000000000, denominator: 999999999 },
          },
          ...(state === 'unknown' || state === 'missing'
            ? { qualifier: state }
            : state === 'disputed'
              ? { qualifier: state, alternatives: amounts }
              : {
                  amount: amounts[0],
                  ...(state === 'conditional'
                    ? { condition: qCondition }
                    : state === 'simulated' || state === 'illustrative'
                      ? { qualifier: state }
                      : {}),
                }),
        },
      })),
      ...(id === '75'
        ? {
            resource: actors[0],
            requester: actors[1],
            access: { condition, evidence: speech.spans[3] },
            decision: { state: decisionState, result, condition, evidence: speech.spans[4] },
          }
        : {
            material: actors[0],
            reservoir: actors[1],
            filter: actors[2],
            model,
            movement: 'spreads toward',
            filterRule: { relation: 'retains', condition, evidence: speech.spans[3] },
            result: { state: 'unresolved', relation: 'unresolved', evidence: speech.spans[4] },
          }),
      ...Object.fromEntries(
        ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'].map((key, i) => [
          key,
          speech.spans[i].fromWord,
        ]),
      ),
    },
  };
}

export interface ResourceDiffusionSolid {
  column: number;
  geometry: BufferGeometry;
  position: [number, number, number];
  rotation: [number, number, number];
}
/** CPU inventory of the actual reused kit solids, including invisible/zero-opacity meshes.
 * Source guards and SSR host equality catch kit drift. Caller disposes all geometries. */
export function resourceDiffusionGeometry(story: '75' | '76'): ResourceDiffusionSolid[] {
  const infrastructure = readFileSync(
    'src/main/remotion/compositions/explainer/expansion/kits/infrastructure.tsx',
    'utf8',
  )
    .split('export function InfrastructureStageClay')[1]
    .split('export function InfrastructureCarrierSvg')[0]
    .replace(/\s/g, '');
  const relationships = readFileSync(
    'src/main/remotion/compositions/explainer/expansion/kits/relationships.tsx',
    'utf8',
  )
    .split('export function RelationshipEntityClay')[1]
    .split('function validateContainer')[0]
    .replace(/\s/g, '');
  const solids: ResourceDiffusionSolid[] = [];
  const block = (
    column: number,
    size: [number, number, number],
    position: [number, number, number] = [0, 0, 0],
  ): void => {
    if (!(infrastructure + relationships).includes(`size={[${size.join(',')}]}`))
      throw new Error('Actual kit block dimensions changed');
    solids.push({
      column,
      geometry: new RoundedBoxGeometry(...size, 3, Math.min(0.07, ...size.map((n) => n / 2))),
      position,
      rotation: [0, 0, 0],
    });
  };
  const cylinder = (
    column: number,
    args: [number, number, number, number],
    position: [number, number, number],
    rotation: [number, number, number],
  ): void => {
    if (!infrastructure.includes(`cylinderGeometryargs={[${args.join(',')}]}`))
      throw new Error('Actual kit cylinder changed');
    solids.push({ column, geometry: new CylinderGeometry(...args), position, rotation });
  };
  if (story === '75') {
    block(0, [1.3, 0.95, 0.65]);
    for (const y of [-0.2, 0.2]) block(0, [1.05, 0.05, 0.04], [0, y, 0.35]);
    cylinder(0, [0.085, 0.085, 0.06, 12], [0.38, -0.3, 0.36], [Math.PI / 2, 0, 0]);
    block(1, [1.2, 0.48, 0.12]);
    block(1, [0.06, 0.36, 0.03], [-0.45, 0, 0.08]);
    block(1, [0.74, 0.05, 0.03], [0.02, -0.12, 0.08]);
  } else {
    cylinder(0, [0.55, 0.55, 1.1, 24], [0, 0, 0], [0, 0, 0]);
    if (!infrastructure.includes('torusGeometryargs={[0.55,0.025,8,24]}'))
      throw new Error('Actual reservoir rings changed');
    for (const y of [-0.5, 0.5])
      solids.push({
        column: 0,
        geometry: new TorusGeometry(0.55, 0.025, 8, 24),
        position: [0, y, 0],
        rotation: [Math.PI / 2, 0, 0],
      });
    for (const y of [-0.25, 0, 0.25]) block(0, [0.13, 0.025, 0.03], [-0.15, y, 0.55]);
    cylinder(0, [0.07, 0.07, 0.28, 12], [0.56, -0.4, 0], [0, 0, Math.PI / 2]);
    for (const x of [-0.6, 0.6]) block(1, [0.1, 1.1, 0.12], [x, 0, 0]);
    for (const y of [-0.5, 0.5]) block(1, [1.3, 0.1, 0.12], [0, y, 0]);
    for (const x of [-0.4, -0.2, 0, 0.2, 0.4]) block(1, [0.025, 0.9, 0.025], [x, 0, 0]);
    for (const y of [-0.3, 0, 0.3]) block(1, [1.1, 0.025, 0.025], [0, y, 0.02]);
  }
  return solids;
}

export function resourceDiffusionCases(): ExpansionResourceDiffusionScene[] {
  const packet = JSON.parse(
    readFileSync(
      'scripts/explainer-stills/fixtures/expansion/physical/resource-diffusion.source.json',
      'utf8',
    ),
  ) as { stories: TemporalFixtureSeed[] };
  const raw = temporalSourceFixtures(packet.stories);
  for (const seed of packet.stories)
    for (const state of [
      'known',
      'unknown',
      'missing',
      'disputed',
      'conditional',
      'simulated',
      'illustrative',
    ] as const) {
      const edits: { path: (string | number)[]; value?: unknown; remove?: boolean }[] = [];
      const clauses: Record<string, string> = {};
      const entries =
        seed.id === '75'
          ? ([
              ['Pool', 'limit', 1],
              ['Ada', 'Pool request', 2],
            ] as const)
          : ([['Dye', 'inventory', 1]] as const);
      for (const [i, [actor, claim, clause]] of entries.entries()) {
        const root = ['records', i, 'quantity'];
        for (const field of ['amount', 'alternatives', 'qualifier', 'condition'])
          edits.push({ path: [...root, field], remove: true });
        edits.push({ path: [...root, 'state'], value: state });
        let value = '3';
        if (state === 'unknown' || state === 'missing') {
          value = state;
          edits.push({ path: [...root, 'qualifier'], value: state });
        } else if (state === 'disputed') {
          value = 'disputed between 3 and 4';
          edits.push(
            { path: [...root, 'qualifier'], value: state },
            {
              path: [...root, 'alternatives'],
              value: [3, 4].map((numerator) => ({
                kind: 'rational',
                value: { numerator, denominator: 1 },
              })),
            },
          );
        } else
          edits.push({
            path: [...root, 'amount'],
            value: { kind: 'rational', value: { numerator: 3, denominator: 1 } },
          });
        const teaching = state === 'simulated' || state === 'illustrative';
        if (teaching) edits.push({ path: [...root, 'qualifier'], value: state });
        if (state === 'conditional')
          edits.push({ path: [...root, 'condition'], value: 'if audited' });
        clauses[String(clause)] =
          `${teaching ? `In this ${state}, ` : ''}${actor} ${claim} is ${value} ${seed.id === '75' ? 'count' : 'gram'} during June among batch with denominator 10${state === 'conditional' ? ' if audited' : ''}.`;
      }
      if (state === 'simulated' || state === 'illustrative')
        edits.push({ path: ['evidence'], value: 'illustrative' });
      const f = temporalSourceFixtures([
          { ...seed, paraphrases: [], negatives: [{ name: state, clauses, edits }] },
        ])[0],
        n = f.negatives[0];
      raw.push({
        ...f,
        words: n.words ?? f.words,
        window: n.window ?? f.window,
        proposal: n.proposal,
      });
    }
  for (const id of ['75', '76'] as const)
    for (const state of [
      'known',
      'unknown',
      'missing',
      'disputed',
      'conditional',
      'simulated',
      'illustrative',
    ] as const)
      raw.push(
        maximumResourceDiffusionFixture(id, state),
        maximumResourceDiffusionFixture(id, state, 'unknown', 'high', true),
      );
  for (const decision of [
    'missing',
    'disputed',
    'granted',
    'denied',
    'conditional',
    'illustrative',
    'simulated',
  ] as const)
    raw.push(maximumResourceDiffusionFixture('75', 'known', decision));
  for (const id of ['75', '76'] as const)
    for (const extreme of ['zero', 'small'] as const)
      raw.push(maximumResourceDiffusionFixture(id, 'known', 'unknown', extreme));
  return raw.flatMap((f) =>
    (['diagram', 'hybrid'] as const).map((visualMode) => {
      const ctx = makeParseContext(f.words, f.window);
      const scene = (f.id === '75' ? parseExpansionSharedResource : parseExpansionDiffusionFilter)(
        { ...f.proposal, visualMode },
        ctx,
      );
      if (!scene || ctx.issues.length)
        throw new Error(`${f.id} ${f.proposal.label}: ${JSON.stringify(ctx.issues)}`);
      return scene;
    }),
  );
}
