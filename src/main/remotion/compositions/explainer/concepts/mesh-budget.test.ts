import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type ComponentType, createElement, Fragment, isValidElement, type ReactNode } from 'react';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { FoldedDocument, PaperTray } from '../cognition/models';
import type { TechnologyStory } from '../technology/types';
import { ADAPTIVE_MESH_BUDGETS } from './adaptive/poses';
import { AdaptiveSceneView } from './adaptive/Scene';
import { ADAPTIVE_PRESETS } from './adaptive/types';
import * as operations from './business-operations/models';
import { BusinessOperationsSceneView } from './business-operations/Scene';
import {
  BUSINESS_OPERATIONS_PRESETS,
  BUSINESS_OPERATIONS_LIMITS as O,
} from './business-operations/types';
import * as population from './business-populations/models';
import { BusinessPopulationsSceneView } from './business-populations/Scene';
import {
  BUSINESS_POPULATIONS_PRESETS,
  BUSINESS_POPULATIONS_LIMITS as P,
} from './business-populations/types';
import { INFERENCE_BUDGETS } from './inference/poses';
import { InferenceSceneView } from './inference/Scene';
import { INFERENCE_PRESETS } from './inference/types';
import * as information from './information/models';
import { InformationSceneView } from './information/Scene';
import {
  INFORMATION_LIMITS as I,
  INFORMATION_PRESETS,
  type InformationMedium,
  type LayerRole,
} from './information/types';
import * as assemblies from './perspective/assemblies';
import * as perspective from './perspective/models';
import { PerspectiveSceneView } from './perspective/Scene';
import { PERSPECTIVE_LIMITS as E, PERSPECTIVE_PRESETS } from './perspective/types';

// CPU-only JSX accounting, following inference/projection.test.ts. No React renderer,
// WebGL, geometry allocation, lighting, shadow passes or resource/timing measurements.
// Count mounted meshes even when scale/opacity is zero; omit shared stage and HTML.
const clock = vi.hoisted(() => ({ t: 0 }));
vi.mock('../stage', async (original) => {
  const actual = await original<typeof import('../stage')>();
  return {
    ...actual,
    useStage: () => actual.STAGE,
    useSceneTime: () => ({ t: clock.t, frame: clock.t * 30, fps: 30 }),
  };
});
vi.mock('../hero-kit', () => ({ Clay: () => null }));
vi.mock('../technology/primitives', async (original) => ({
  ...(await original<typeof import('../technology/primitives')>()),
  TechText: () => null,
}));
vi.mock('../explanation-kit', () => ({
  ClayBlock: () => createElement('mesh'),
  ExplanationStage: ({ children }: { children: ReactNode }) => children,
}));

type Props = Record<string, unknown>;
function meshes(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((sum, child) => sum + meshes(child), 0);
  if (!isValidElement<Props>(node)) return 0;
  if (node.type === Fragment) return meshes(node.props.children);
  if (typeof node.type === 'function')
    return meshes(Reflect.apply(node.type, undefined, [node.props]));
  if (typeof node.type !== 'string') throw new Error('Unsupported component in mesh accounting');
  // Never silently count a future instanced mesh or pre-built Object3D as zero.
  if (['primitive', 'instancedMesh', 'skinnedMesh'].includes(String(node.type)))
    throw new Error(`Unaccounted mesh type: ${String(node.type)}`);
  return Number(node.type === 'mesh') + meshes(node.props.children);
}
function count<T extends object>(model: ComponentType<T>, props: T): number {
  return meshes(createElement(model, props));
}
function sum(n: number, cost: (index: number) => number): number {
  return Array.from({ length: n }, (_, index) => cost(index)).reduce((a, b) => a + b, 0);
}

/** Source-derived conservative sums, NOT measured GPU/RSS or draw-call budgets.
 * Use the parser's bounded cardinalities, actual model JSX (including nested models),
 * and explicit scene-owned meshes. Deliberately overcount mutually exclusive pieces:
 * all semantic-sort pads, all request rings, both economics payment states, and all
 * inventory unfilled markers. These envelopes assume validated scenes, not arbitrary JSON.
 */
function authoredCeilings() {
  const color = '#999999';
  const roles = {
    people: true,
    workflow: true,
    records: true,
    interface: true,
    compute: true,
    power: true,
  } satisfies Record<LayerRole, true>;
  const media = { text: true, image: true, audio: true } satisfies Record<InformationMedium, true>;
  const link = count(information.ProvenanceLink, {
    from: [0, 0, 0],
    to: [1, 1, 1],
    color,
    reveal: 1,
  });
  const documents = sum(I.items, (index) => count(information.SourceDocument, { index, color }));
  const sort = (preset: 'topic-clusters' | 'closest-match' | 'skill-match') =>
    documents +
    I.items +
    sum(I.targets, (index) =>
      Math.max(
        ...[0, 1].map((reveal) =>
          preset === 'topic-clusters'
            ? count(information.TopicCradle, { index, color, reveal })
            : preset === 'closest-match'
              ? count(information.CandidateStand, { index, color, selected: reveal })
              : count(information.SkillStation, { index, color, paired: reveal }),
        ),
      ),
    );
  // Scene.tsx: one plinth, up to four functional layers, n-1 provenance links.
  const layers = (device: boolean) =>
    1 +
    (I.layers - 1) * link +
    sum(I.layers, (index) =>
      Math.max(
        ...(Object.keys(roles) as LayerRole[]).map((role) =>
          count(information.FunctionalLayer, { role, device, color, index }),
        ),
      ),
    );
  const transform = (fusion: boolean) =>
    Math.max(
      ...[0, 0.5, 1].map((binding) => count(information.ResultBinder, { fusion, binding })),
    ) +
    sum(
      I.inputs,
      (index) =>
        link +
        Math.max(
          ...(Object.keys(media) as InformationMedium[]).map(
            (medium) =>
              count(information.MediaSource, { medium, color, index }) +
              count(information.DetailFragment, { medium, color, index }),
          ),
        ),
    );

  const note = count(operations.Banknote, {});
  const parcel = count(operations.SaleParcel, {});
  // MarketView: floor, seller/buyer, ownership trays and a single persistent parcel.
  const market =
    1 +
    count(operations.MarketParticipant, { buyer: false }) +
    count(operations.MarketParticipant, { buyer: true }) +
    2 * count(operations.OwnershipTray, { x: 0 }) +
    parcel;
  const lanes =
    count(operations.ExchangeLane, {}) + count(operations.ExchangeLane, { payment: true });
  // AllocationView: floor, both benches, bounded tickets and <=12 requests per project.
  const allocation =
    1 +
    count(operations.ProjectWorkbench, { second: false }) +
    count(operations.ProjectWorkbench, { second: true }) +
    O.resources *
      Math.max(
        count(operations.CapacityTicket, {}),
        count(operations.CapacityTicket, { slot: true }),
      ) +
    O.projects * O.resources;
  const document = count(FoldedDocument, { color });
  // EconomicsView: floor + baseline + revenue rail + cost rail, source invoices,
  // original banknote; nonzero remainder adds a rail and either a note or shortfall mark.
  const economics = (sign: -1 | 0 | 1) =>
    4 +
    parcel +
    O.costs * document +
    note +
    count(operations.RemainderEnvelope, { shortfall: sign < 0 }) +
    (sign === 0 ? 0 : 1 + (sign > 0 ? note : 1));

  const person = Math.max(
    ...Array.from({ length: P.originalCustomers + P.newCustomers }, (_, identity) =>
      count(population.PopulationPerson, { identity }),
    ),
  );
  const request = Math.max(
    ...Array.from({ length: P.inventoryActors }, (_, identity) =>
      count(population.PopulationPerson, { identity, request: true }),
    ),
  );
  const product = Math.max(
    ...Array.from({ length: P.inventoryActors }, (_, identity) =>
      Math.max(
        ...[false, true].map((mug) => count(population.PopulationProduct, { identity, mug })),
      ),
    ),
  );
  const distribution =
    P.distributionMembers * (person + count(PaperTray, { width: 1.12, depth: 0.85 })) +
    P.carriers * document;
  // CohortView: two lanes, arrivals pad and two fixed period-gate pieces.
  const cohort =
    (P.originalCustomers + P.newCustomers) * person +
    count(population.CohortLane, { x: 0, width: 2 }) +
    count(population.CohortLane, { x: 0, width: 2, outline: true }) +
    3;
  const inventory =
    count(population.ProductShelf, {}) + 1 + P.inventoryActors * (request + product + 1);

  const conveyor = count(assemblies.Conveyor, { gate: 0 });
  const modelConveyor = count(assemblies.Conveyor, { gate: 1, model: true });
  const route = count(assemblies.Correspondence, { from: [0, 0, 0], to: [1, 0, 0] });
  // FuturesView: present base; each alternative has base, two corner marks and route.
  const futures = (alternatives: number) =>
    1 + conveyor + alternatives * (modelConveyor + 3 + route);
  // TwinView: two bases, four model corners, correspondence and two physical marks.
  const twin = conveyor + modelConveyor + 8 + route;
  return {
    'business-stack': layers(false),
    'device-stack': layers(true),
    'topic-clusters': sort('topic-clusters'),
    'closest-match': sort('closest-match'),
    'skill-match': sort('skill-match'),
    'structured-report': transform(false),
    'multimodal-fusion': transform(true),
    'direct-sale': market + lanes + note,
    'platform-fee':
      market + lanes + 3 + Math.max(note, note + count(operations.Banknote, { fee: true })),
    'unmatched-market': market + 2,
    reallocate: allocation,
    'constrained-projects': allocation + 1,
    'positive-margin': economics(1),
    'break-even': economics(0),
    'negative-margin': economics(-1),
    'customer-concentration': distribution,
    'workload-spread': distribution,
    'average-hides-tail': distribution + 3,
    retention: cohort,
    churn: cohort,
    surplus: inventory,
    shortage: inventory,
    balanced: inventory,
    'chip-to-center':
      count(perspective.TrackedChip, {}) +
      count(perspective.ServerTray, {}) +
      count(perspective.Rack, { openBay: true }) +
      count(perspective.DataCenter, {}),
    'customer-to-market':
      count(assemblies.Customer, { tracked: true }) +
      count(assemblies.CustomerSegment, {}) +
      count(assemblies.CustomerMarket, {}),
    'branching-scenarios': futures(E.alternatives),
    'forecast-range': futures(2) + 3 * route,
    'mirror-state': twin,
    'simulated-change': twin,
  };
}

type Story = TechnologyStory & { kind: string; preset: string };
function fixtures<S extends Story>(
  pack: string,
  view: ComponentType<{ scene: S }>,
  presets: Record<string, readonly string[]>,
) {
  const data = JSON.parse(
    readFileSync(resolve('scripts/explainer-stills/fixtures', `concept-${pack}.json`), 'utf8'),
  ) as { name: string; durationSec: number; scene: S }[];
  return {
    pack,
    presets,
    cases: data.map((fixture) => ({
      ...fixture,
      at: (t: number) => {
        clock.t = t;
        return count(view, { scene: fixture.scene });
      },
    })),
  };
}
const packs = [
  fixtures('information', InformationSceneView, INFORMATION_PRESETS),
  fixtures('inference', InferenceSceneView, INFERENCE_PRESETS),
  fixtures('business-operations', BusinessOperationsSceneView, BUSINESS_OPERATIONS_PRESETS),
  fixtures('business-populations', BusinessPopulationsSceneView, BUSINESS_POPULATIONS_PRESETS),
  fixtures('perspective', PerspectiveSceneView, PERSPECTIVE_PRESETS),
  fixtures('adaptive', AdaptiveSceneView, ADAPTIVE_PRESETS),
];

describe('concept authored mesh ceilings (static accounting, not GPU/RSS)', () => {
  it('keeps the mocked ClayBlock leaf tied to its actual single-mesh definition', () => {
    const path = resolve('src/main/remotion/compositions/explainer/explanation-kit.tsx');
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const block = source.statements.find(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'ClayBlock',
    );
    if (!block) throw new Error('Missing ClayBlock');
    const tags: string[] = [];
    function visit(node: ts.Node): void {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
        tags.push(node.tagName.getText(source));
      ts.forEachChild(node, visit);
    }
    visit(block);
    expect(tags).toEqual(['mesh', 'Clay']);
  });

  it('pins the 29 newly accounted preset ceilings to actual model costs and actor caps', () => {
    expect(authoredCeilings()).toMatchInlineSnapshot(`
      {
        "average-hides-tail": 147,
        "balanced": 150,
        "branching-scenarios": 117,
        "break-even": 36,
        "business-stack": 118,
        "chip-to-center": 98,
        "churn": 89,
        "closest-match": 114,
        "constrained-projects": 100,
        "customer-concentration": 144,
        "customer-to-market": 64,
        "device-stack": 70,
        "direct-sale": 39,
        "forecast-range": 90,
        "mirror-state": 61,
        "multimodal-fusion": 60,
        "negative-margin": 38,
        "platform-fee": 46,
        "positive-margin": 41,
        "reallocate": 99,
        "retention": 89,
        "shortage": 150,
        "simulated-change": 61,
        "skill-match": 99,
        "structured-report": 57,
        "surplus": 150,
        "topic-clusters": 96,
        "unmatched-market": 33,
        "workload-spread": 144,
      }
    `);
  });

  it('covers exactly the existing 18 kinds / 42 fixture presets without duplicates', () => {
    const kinds = packs.flatMap(({ cases }) => cases.map(({ scene }) => scene.kind));
    expect(kinds).toHaveLength(42);
    expect(new Set(kinds).size).toBe(18);
    for (const { presets, cases } of packs) {
      expect(cases.map(({ scene }) => `${scene.kind}/${scene.preset}`).sort()).toEqual(
        Object.entries(presets)
          .flatMap(([kind, names]) => names.map((name) => `${kind}/${name}`))
          .sort(),
      );
    }
  });

  const ceilings: Record<string, number> = {
    ...authoredCeilings(),
    ...Object.fromEntries(
      Object.entries(INFERENCE_BUDGETS).map(([preset, budget]) => [preset, budget.meshes]),
    ),
    ...ADAPTIVE_MESH_BUDGETS,
  };
  for (const { pack, cases } of packs) {
    for (const fixture of cases) {
      it(`${pack}/${fixture.scene.preset}: actual fixture JSX stays below its authored ceiling`, () => {
        const ceiling = ceilings[fixture.scene.preset];
        expect(ceiling).toBeGreaterThan(0);
        // Every output frame, plus exact beats (which need not land on 30fps frames).
        // This exercises pinned fixtures, not every possible planner payload. The
        // separate accounting above covers bounded actor counts and model variants.
        const times = new Set([
          ...Array.from({ length: Math.ceil(fixture.durationSec * 30) }, (_, frame) => frame / 30),
          fixture.scene.setupAt,
          fixture.scene.actionAt,
          fixture.scene.responseAt,
          fixture.scene.checkAt,
          fixture.scene.resolveAt,
        ]);
        let peak = 0;
        for (const t of times) {
          const actual = fixture.at(t);
          expect(actual, `t=${t}`).toBeLessThanOrEqual(ceiling);
          peak = Math.max(peak, actual);
        }
        expect(peak).toBeGreaterThan(0);
      });
    }
  }
});
