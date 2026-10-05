import { createElement, Fragment, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseMarketDependencyScene,
  parseProcurementCommitmentScene,
} from '../../../../../ai/explainer/business-markets-contract';
import type { Rec } from '../../../../../ai/explainer/kind-spec';
import { DiagramChrome } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { diagramPose } from '../../diagrams/motion';
import { Stage3D } from '../../Stage3D';
import {
  MARKETS_ADDITIONAL_SOURCE_FIXTURES,
  MARKETS_SOURCE_FIXTURES,
  type MarketsSourceFixture,
  marketsSourceContext,
  marketsSourceWindow,
} from './fixtures';
import { marketsAssets, marketsKey, marketsRecipeId, sampleMarkets } from './poses';
import {
  MARKETS_RAIL,
  marketsDetailWindows,
  marketsIdentities,
  marketsLines,
  marketsPages,
  marketsRows,
  marketsTextWidth,
} from './presentation';
import { MarketsDiagramParts, MarketsModelParts, MarketsSceneView } from './Scene';
import type { MarketsScene } from './types';

const hooks = vi.hoisted(() => ({ cleanups: [] as (() => void)[], time: 0 }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (setup: () => (() => void) | undefined) => {
    const cleanup = setup();
    if (cleanup) hooks.cleanups.push(cleanup);
  },
}));
vi.mock('../../stage', () => ({
  useStage: () => ({
    text: '#23100c',
    card: '#f6ecd9',
    cardRaised: '#fff',
    cardBorder: '#777',
    accent: '#9f75ff',
    muted: '#888',
    positive: '#396',
    negative: '#933',
    clay: ['#999', '#777', '#555', '#888', '#666'],
    font: 'Inter',
  }),
  useSceneTime: () => ({ t: hooks.time }),
  useWideStage: () => null,
  shade: (color: string) => color,
}));
vi.mock('../../hero-kit', () => ({ Clay: () => null }));
vi.mock('../../explanation-kit', () => ({
  // Conservatively bound the actual authored rounded block by its box, retaining transforms.
  ClayBlock: ({ size, position, rotation }: Record<string, unknown>) =>
    createElement('mesh', { position, rotation }, createElement('boxGeometry', { args: size })),
}));
const temporary = new Set<BufferGeometry>();
afterEach(() => {
  for (const cleanup of hooks.cleanups.splice(0)) cleanup();
  for (const geometry of temporary) geometry.dispose();
  temporary.clear();
});
function parsed(fixture: MarketsSourceFixture, mode: 'diagram' | 'hybrid'): MarketsScene {
  const ctx = marketsSourceContext(fixture);
  const raw: Rec = { ...fixture.raw, visualMode: mode };
  const scene =
    raw.kind === 'procurement-commitment'
      ? parseProcurementCommitmentScene(raw, ctx)
      : parseMarketDependencyScene(raw, ctx);
  if (!scene) throw new Error(`${fixture.fixtureId}: ${ctx.issues.join('; ')}`);
  expect(ctx.issues).toEqual([]);
  return scene;
}
interface Node {
  type: string;
  props: Record<string, unknown>;
  visible: boolean;
}
function expanded(node: ReactNode, result: Node[] = [], visible = true): Node[] {
  if (Array.isArray(node)) {
    for (const child of node) expanded(child, result, visible);
    return result;
  }
  if (!isValidElement<Record<string, unknown>>(node)) return result;
  visible = visible && node.props.visible !== false;
  if (typeof node.type === 'function') {
    result.push({ type: node.type.name, props: node.props, visible });
    expanded(Reflect.apply(node.type, undefined, [node.props]) as ReactNode, result, visible);
  } else {
    if (typeof node.type === 'string') result.push({ type: node.type, props: node.props, visible });
    expanded(node.props.children as ReactNode, result, visible);
  }
  return result;
}
function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  return isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : '';
}
function stages(node: ReactNode): number {
  if (Array.isArray(node)) return node.reduce<number>((sum, child) => sum + stages(child), 0);
  if (!isValidElement<{ children?: ReactNode }>(node)) return 0;
  return (node.type === Stage3D ? 1 : 0) + stages(node.props.children);
}
function svg(scene: MarketsScene, seconds: number): string {
  return renderToStaticMarkup(
    createElement('svg', null, createElement(MarketsDiagramParts, { scene, seconds })),
  );
}
const constructors: Record<string, new (...args: never[]) => BufferGeometry> = {
  boxGeometry: BoxGeometry,
  cylinderGeometry: CylinderGeometry,
  coneGeometry: ConeGeometry,
  sphereGeometry: SphereGeometry,
  capsuleGeometry: CapsuleGeometry,
  planeGeometry: PlaneGeometry,
  torusGeometry: TorusGeometry,
};
/** Real intrinsic/batched geometry, full hierarchy and all mounted/invisible descendants. */
function hierarchy(node: ReactNode, root = new Group()): Group {
  if (Array.isArray(node)) {
    for (const child of node) hierarchy(child, root);
    return root;
  }
  if (!isValidElement<Record<string, unknown>>(node)) return root;
  const { type, props } = node;
  if (type === Fragment) return hierarchy(props.children as ReactNode, root);
  if (typeof type === 'function')
    return hierarchy(Reflect.apply(type, undefined, [props]) as ReactNode, root);
  if (type === 'primitive' || type === 'instancedMesh' || type === 'skinnedMesh')
    throw new Error(`Unaccounted markets primitive ${type}`);
  if (type === 'mesh' || type === 'group') {
    let object: Mesh | Group;
    if (type === 'mesh') {
      const geometry =
        props.geometry instanceof BufferGeometry ? props.geometry : new BufferGeometry();
      if (!(props.geometry instanceof BufferGeometry)) temporary.add(geometry);
      object = new Mesh(geometry);
    } else object = new Group();
    if (Array.isArray(props.position)) object.position.fromArray(props.position);
    if (Array.isArray(props.rotation))
      object.rotation.set(props.rotation[0], props.rotation[1], props.rotation[2]);
    if (typeof props.scale === 'number') object.scale.setScalar(props.scale);
    else if (Array.isArray(props.scale)) object.scale.fromArray(props.scale);
    root.add(object);
    // Expand geometry against its owning mesh, not a sibling placeholder.
    for (const child of Array.isArray(props.children) ? props.children : [props.children]) {
      if (
        isValidElement<Record<string, unknown>>(child) &&
        typeof child.type === 'string' &&
        child.type.endsWith('Geometry')
      ) {
        const Constructor = constructors[child.type];
        if (!Constructor || !(object instanceof Mesh))
          throw new Error(`Unaccounted markets geometry ${child.type}`);
        const geometry = new Constructor(
          ...((Array.isArray(child.props.args) ? child.props.args : []) as never[]),
        );
        temporary.add(geometry);
        object.geometry = geometry;
      } else {
        const childRoot = hierarchy(child);
        object.add(childRoot);
      }
    }
  } else if (typeof type === 'string' && !type.endsWith('Material'))
    throw new Error(`Unaccounted markets element ${type}`);
  return root;
}
const all = [...MARKETS_SOURCE_FIXTURES, ...MARKETS_ADDITIONAL_SOURCE_FIXTURES];
const cases = all.flatMap((fixture) =>
  (fixture.id === 'OP-44' ? (['diagram'] as const) : (['diagram', 'hybrid'] as const)).map(
    (mode) => ({ fixture, mode, name: `${fixture.fixtureId}:${mode}` }),
  ),
);

// CPU JSX/SVG and conservative authored 3D volumes, not GPU/native/projected-pixel proof.
describe('markets factual JSX, reading pages and shared canvas boundary', () => {
  it.each(
    cases,
  )('$name renders every COMPLETE page naturally for >=1.5s at actual diagramPose visibility', ({
    fixture,
    mode,
  }) => {
    const scene = parsed(fixture, mode);
    const before = structuredClone(scene);
    const windows = marketsDetailWindows(scene);
    const pages = marketsPages(scene);
    const seen: string[] = [];
    windows.forEach((window, index) => {
      expect(window.end - window.start).toBeGreaterThanOrEqual(1.5);
      for (const seconds of [
        window.start + 1e-8,
        (window.start + window.end) / 2,
        window.end - 1e-8,
      ]) {
        const external = diagramPose(seconds, scene);
        expect(external.setup).toBe(1);
        if (mode === 'hybrid') expect(external.diagramOpacity).toBe(1);
        const nodes = expanded(MarketsDiagramParts({ scene, seconds }));
        expect(nodes[0].props.opacity).toBe(1);
        expect(nodes[0].props['data-page']).toBe(index);
        const rows = nodes.filter((n) => n.props['data-fact-id']);
        expect(rows.map((n) => n.props['data-fact-id'])).toEqual(
          pages[index].rows.map((r) => marketsKey(scene, 'fact', r.id)),
        );
        pages[index].rows.forEach((row, r) => {
          expect(
            text(rows[r].props.children as ReactNode)
              .replace(/\s+/gu, ' ')
              .trim(),
          ).toBe(`${row.label} · ${row.state} ${row.text}`);
          expect(rows[r].props['data-state']).toBe(row.state);
        });
        const fonts = nodes.filter((n) => n.props.fontSize !== undefined);
        expect(fonts.map((n) => n.props.fontSize)).toEqual([24]);
        for (const n of nodes.filter((n) => n.type === 'text')) {
          const y = Number(n.props.y);
          expect(y).toBeGreaterThanOrEqual(108);
          expect(y).toBeLessThanOrEqual(462);
          expect(marketsTextWidth(text(n.props.children as ReactNode))).toBeLessThanOrEqual(
            MARKETS_RAIL.width - 48,
          );
        }
        const markup = svg(scene, seconds);
        expect(markup).not.toMatch(
          /ellipsis|foreignObject|<canvas|<image|<iframe|<script|https?:/u,
        );
        expect(markup).toContain(`data-business-recipe="${marketsRecipeId(scene)}"`);
      }
      seen.push(...pages[index].rows.map((r) => r.id));
    });
    expect(seen).toEqual(marketsRows(scene).map((r) => r.id));
    expect(marketsSourceWindow(fixture).endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
    // Original source outcome, exactly once in the actual shared chrome (no SVG duplicate).
    for (const seconds of [
      scene.resolveAt - 1e-8,
      scene.resolveAt,
      marketsSourceWindow(fixture).endTime,
    ]) {
      hooks.time = seconds;
      const outcomes = expanded(DiagramChrome({ scene, settledOutcome: true })).filter(
        (n) =>
          n.type === 'div' &&
          n.props.style &&
          typeof n.props.style === 'object' &&
          'opacity' in n.props.style &&
          text(n.props.children as ReactNode)
            .replace(/\s+/gu, ' ')
            .trim() === scene.outcome,
      );
      expect(outcomes).toHaveLength(1);
      expect((outcomes[0].props.style as { opacity: number }).opacity).toBe(
        seconds >= scene.resolveAt ? 1 : 0,
      );
      expect(
        expanded(MarketsDiagramParts({ scene, seconds })).some(
          (n) => n.props['data-resolve-state'],
        ),
      ).toBe(false);
    }
    expect(svg(scene, scene.resolveAt)).toBe(svg(scene, marketsSourceWindow(fixture).endTime));
    expect(scene).toEqual(before);
  });
  it.each(
    cases,
  )('$name uses zero/one REAL shared Stage3D boundary and never invokes OP-44 models', ({
    fixture,
    mode,
  }) => {
    const scene = parsed(fixture, mode);
    hooks.time = scene.resolveAt;
    const view = MarketsSceneView({ scene });
    expect(view.type).toBe(HybridStage);
    if (!isValidElement<Parameters<typeof HybridStage>[0]>(view))
      throw new Error('Missing shared wrapper');
    expect(view.props.scene).toBe(scene);
    expect(view.props.settledOutcome).toBe(true);
    expect(view.props.scene.resolveAt).toBe(scene.resolveAt);
    const diagram = view.props.diagram;
    expect(isValidElement<{ scene: MarketsScene }>(diagram) && diagram.props.scene).toBe(scene);
    expect(stages(HybridStage(view.props))).toBe(mode === 'hybrid' ? 1 : 0);
    if (mode === 'diagram') expect(view.props.model).toBeNull();
    else
      expect(
        isValidElement<{ scene: MarketsScene }>(view.props.model) && view.props.model.props.scene,
      ).toBe(scene);
    if (fixture.id === 'OP-44')
      expect(MarketsModelParts({ scene, seconds: hooks.time })).toBeNull();
  });
  it.each(
    all.filter((f) => f.id === 'OP-47'),
  )('$fixtureId retains exact monetary source clauses/bases/qualifications and gates only actual paid cash', (fixture) => {
    const scene = parsed(fixture, 'hybrid');
    if (scene.kind !== 'procurement-commitment') throw new Error('Missing procurement');
    const rowMap = new Map(marketsRows(scene).map((r) => [r.id, r]));
    for (const [id, fact] of [
      ['quote', scene.quote],
      ['payment', scene.payment],
    ] as const) {
      expect(rowMap.get(id)?.text).toBe(fact.text);
      expect(rowMap.get(id)?.state).toBe(fact.state);
      const complete = fixture.words
        .slice(fact.source.fromWord, fact.source.toWord + 1)
        .map((w) => w.text)
        .join(' ');
      expect(fact.text).toBe(complete);
      if (fact.basis)
        for (const value of [
          fact.basis.unit,
          fact.basis.population,
          fact.basis.period,
          String(fact.basis.denominator),
        ])
          expect(fact.text.toLowerCase()).toContain(value.toLowerCase());
      if (fact.state === 'conditional') {
        expect(fact.amount).not.toBeNull();
        expect(fact.text).toContain(scene.condition);
        expect(fact.text).toMatch(/\bmay\b/u);
      }
    }
    const nodes = expanded(MarketsModelParts({ scene, seconds: scene.resolveAt }));
    const paid = nodes.find(
      (n) => n.props.name === marketsKey(scene, 'settlement', scene.payment.identity.id),
    );
    if (scene.payment.state === 'paid')
      expect(paid?.props.userData).toMatchObject({
        sourceState: 'paid',
        amount: scene.payment.amount,
        basis: scene.payment.basis,
      });
    else expect(paid).toBeUndefined();
    const rails = nodes.filter((n) => n.type === 'ApprovalRail');
    expect(rails.length).toBe(scene.roles.approver.actorId === null ? 0 : 1);
    for (const rail of rails)
      expect(rail.props.accepted).toBe(scene.authority.state === 'granted' ? 1 : 0);
  });
});

describe('markets literal assets, supported semantic IDs and real authored geometry envelopes', () => {
  it.each(
    all.filter((f) => f.id !== 'OP-44'),
  )('$fixtureId retains all source identities without invented operators/approvers, aggregate <=180, and existing studio bounds', (fixture) => {
    const scene = parsed(fixture, 'hybrid');
    const times = [
      0,
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
      marketsSourceWindow(fixture).endTime,
    ];
    // Every production 30fps frame in the full source window, plus exact indexed beats.
    const window = marketsSourceWindow(fixture);
    times.push(
      ...Array.from({ length: Math.ceil((window.endTime - window.startTime) * 30) + 1 }, (_, i) =>
        Math.min(window.endTime, window.startTime + i / 30),
      ),
    );
    const snapshots = new Map<number, unknown>();
    for (const seconds of [...times, ...[...times].reverse()]) {
      const tree = MarketsModelParts({ scene, seconds });
      const nodes = expanded(tree);
      const carriers = nodes.filter(
        (n) =>
          n.props.userData &&
          typeof n.props.userData === 'object' &&
          'sourceIdentityId' in n.props.userData,
      );
      expect(carriers.map((n) => n.props.name)).toEqual(
        marketsIdentities(scene).map((i) => marketsKey(scene, 'identity', i.id)),
      );
      expect(carriers.map((n) => n.props.userData)).toEqual(
        marketsIdentities(scene).map((identity) => {
          const asset = marketsAssets(scene).find((a) => a.id === identity.id);
          const alternative = sampleMarkets(scene, seconds).alternatives.find(
            (a) => a.id === identity.id,
          );
          return {
            sourceIdentityId: identity.id,
            label: identity.label,
            source: identity.source,
            asset: asset?.asset ?? null,
            illustrativeArchitecture: asset !== undefined,
            baseline: alternative?.baseline ?? null,
            area: alternative?.area ?? null,
          };
        }),
      );
      expect(nodes.filter((n) => n.type === 'Occupant' && n.visible).length).toBe(
        scene.kind === 'procurement-commitment' && scene.roles.approver.actorId !== null ? 1 : 0,
      );
      expect(
        nodes.some((n) => ['Stage3D', 'Canvas', 'primitive', 'instancedMesh'].includes(n.type)),
      ).toBe(false);
      const authored = carriers
        .map((n) => (n.props.userData as { asset: string | null }).asset)
        .filter((a) => a !== null);
      // Catalog order is not painter order. Exact multiset retains every duplicate/count.
      expect([...authored].sort()).toEqual(
        marketsAssets(scene)
          .map((a) => a.asset)
          .sort(),
      );
      const world = hierarchy(tree);
      world.updateMatrixWorld(true);
      let meshes = 0;
      world.traverse((object) => {
        if (object instanceof Mesh) {
          meshes++;
          expect(object.geometry.getAttribute('position')?.count).toBeGreaterThan(0);
        }
      });
      expect(meshes).toBeGreaterThan(0);
      expect(meshes).toBeLessThanOrEqual(180);
      const box = new Box3().setFromObject(world, true);
      expect(box.isEmpty()).toBe(false);
      const values = [...box.min.toArray(), ...box.max.toArray()];
      expect(values.every(Number.isFinite)).toBe(true);
      const epsilon = 1e-6;
      expect(box.min.x).toBeGreaterThanOrEqual(-3.4 - epsilon);
      expect(box.max.x).toBeLessThanOrEqual(3.4 + epsilon);
      expect(box.min.y).toBeGreaterThanOrEqual(-1.4 - epsilon);
      expect(box.max.y).toBeLessThanOrEqual(2.7 + epsilon);
      expect(box.min.z).toBeGreaterThanOrEqual(-2.6 - epsilon);
      expect(box.max.z).toBeLessThanOrEqual(1.8 + epsilon);
      const snapshot = { values, meshes, facts: carriers.map((n) => n.props.userData) };
      if (snapshots.has(seconds)) expect(snapshot).toEqual(snapshots.get(seconds));
      else snapshots.set(seconds, snapshot);
      for (const cleanup of hooks.cleanups.splice(0)) cleanup();
      for (const geometry of temporary) geometry.dispose();
      temporary.clear();
      world.traverse((object) => {
        if (object instanceof Mesh) {
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            material.dispose();
        }
      });
      world.clear();
    }
    expect(snapshots.get(scene.resolveAt)).toEqual(
      snapshots.get(marketsSourceWindow(fixture).endTime),
    );
  });
  it('fails closed on unaccounted geometry/primitives and disposes constructed bounds', () => {
    expect(() => hierarchy(createElement('primitive', { object: new Group() }))).toThrow(
      'Unaccounted',
    );
    expect(() => hierarchy(createElement('mesh', null, createElement('futureGeometry')))).toThrow(
      'Unaccounted',
    );
    hierarchy(createElement('mesh', null, createElement('boxGeometry', { args: [1, 1, 1] })));
    const dispose = [...temporary].map((geometry) => vi.spyOn(geometry, 'dispose'));
    for (const geometry of temporary) geometry.dispose();
    for (const spy of dispose) expect(spy).toHaveBeenCalledOnce();
    temporary.clear();
  });
  it('equal-baseline alternatives are equal SVG areas/positions, never winners', () => {
    const fixture = MARKETS_SOURCE_FIXTURES.find((f) => f.id === 'OP-45');
    if (!fixture) throw new Error('Missing alternatives');
    const scene = parsed(fixture, 'hybrid');
    const nodes = expanded(MarketsDiagramParts({ scene, seconds: scene.resolveAt }));
    const baselines = nodes.filter((n) => n.props['data-baseline'] !== undefined);
    expect(baselines.length).toBe(2);
    expect(baselines.map((n) => n.props.d)).toEqual(['M-28 38H28', 'M-28 38H28']);
    expect(
      nodes
        .filter((n) => n.type === 'rect')
        .every((n) => n.props.width === 40 && n.props.height === 28),
    ).toBe(true);
    expect(svg(scene, scene.resolveAt)).not.toMatch(/data-winner|data-profit|data-sale/u);
  });
});

/** Whole source tokens are renamed, including raw labels and real words; indices/windows stay real. */
function longLabelFixture(
  fixture: MarketsSourceFixture,
  from: string,
  to: string,
): MarketsSourceFixture {
  const token = new RegExp(`\\b${from}\\b`, 'gu');
  function replace(value: unknown): unknown {
    if (typeof value === 'string') return value.replace(token, to);
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)]));
    return value;
  }
  return {
    ...fixture,
    fixtureId: `${fixture.fixtureId}:long-label`,
    raw: replace(fixture.raw) as Rec,
    words: fixture.words.map((w) => ({ ...w, text: w.text.replace(token, to) })),
  };
}
describe('source-bound maximum-label pressure without shrinking or synthetic timing', () => {
  it.each([
    'OP-41',
    'OP-45',
  ])('%s keeps a long supported offering fully readable in both declared modes', (id) => {
    const fixture = MARKETS_SOURCE_FIXTURES.find((f) => f.id === id);
    if (!fixture) throw new Error('Missing stress fixture');
    const stress = longLabelFixture(fixture, 'Repair', 'MaintenanceServiceWorkshop');
    for (const mode of ['diagram', 'hybrid'] as const) {
      const scene = parsed(stress, mode);
      expect(marketsIdentities(scene).some((i) => i.label === 'MaintenanceServiceWorkshop')).toBe(
        true,
      );
      for (const window of marketsDetailWindows(scene)) {
        expect(window.end - window.start).toBeGreaterThanOrEqual(1.5);
        const markup = svg(scene, window.start + 1e-8);
        expect(markup).toContain('font-size="24"');
        const nodes = expanded(MarketsDiagramParts({ scene, seconds: window.start + 1e-8 }));
        for (const row of nodes.filter((n) => n.props['data-fact-id'])) {
          const texts = expanded(row.props.children as ReactNode)
            .filter((n) => n.type === 'text')
            .map((n) => text(n.props.children as ReactNode));
          expect(texts.every((line) => marketsTextWidth(line) <= MARKETS_RAIL.width - 48)).toBe(
            true,
          );
        }
      }
      expect(marketsPages(scene).flatMap((p) => p.rows)).toEqual(marketsRows(scene));
      for (const row of marketsRows(scene)) expect(marketsLines(row.text).join(' ')).toBe(row.text);
    }
  });
});
