import { createElement, Fragment, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { parsePortfolioExposure } from '../../../../../ai/explainer/kinds-finance';
import { DiagramChrome, DiagramStage } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { diagramPose } from '../../diagrams/motion';
import { EXPLANATION_CAMERA } from '../../explanation-layout';
import { PortfolioExposureScene } from '../../finance/PortfolioExposureScene';
import { Stage3D } from '../../Stage3D';
import { businessTextWidth } from '../text-width';
import {
  CapitalDependencyDiagramParts,
  CapitalDependencyModelParts,
  CapitalDependencyView,
} from './DependencyLensParts';
import {
  type SharedDependencySourceFixture,
  sharedDependencyFixture,
  sharedDependencyFixtureContext,
} from './dependency-fixtures';
import { sampleCapitalDependency } from './dependency-poses';
import {
  capitalDependencyFacts,
  capitalDependencyPages,
  capitalDependencySemanticIds,
  CAPITAL_DEPENDENCY_READING as DR,
} from './dependency-presentation';
import { CAPITAL_SOURCE_FIXTURES, capitalFixtureContext } from './fixtures';
import { CapitalDiagramParts, CapitalModelParts, capitalVisibleLayouts } from './parts';
import { capitalAssembly, sampleCapital } from './poses';
import { capitalActivePage, capitalPages, CAPITAL_READING as R } from './presentation';
import {
  CAPITAL_LABEL_FIXTURES,
  CAPITAL_RENDER_VARIANTS,
  parsedCapital,
} from './render-test-fixtures';
import { CapitalSceneView } from './Scene';
import { capitalHoldCount, capitalIdentities, capitalRelationCount } from './types';

// Same actual-buffer harness as funds/scene.test.ts: real rounded solids and allocated rack batches.
const harness = vi.hoisted(() => ({
  time: 0,
  cleanup: [] as (() => void)[],
  geometries: new Map<string, import('three').BufferGeometry>(),
  memo: new WeakMap<object, unknown>(),
}));
vi.mock('three/examples/jsm/geometries/RoundedBoxGeometry.js', async (original) => {
  const actual =
    await original<typeof import('three/examples/jsm/geometries/RoundedBoxGeometry.js')>();
  return {
    ...actual,
    RoundedBoxGeometry: function RoundedBoxGeometry(
      ...args: ConstructorParameters<typeof actual.RoundedBoxGeometry>
    ) {
      return cached('RoundedBoxGeometry', args, () => new actual.RoundedBoxGeometry(...args));
    },
  };
});
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useMemo: (factory: () => unknown, deps: readonly unknown[]) => {
      // Reuse the authored constant batch dependency, not opaque geometry or a substitute box.
      const key =
        deps.length === 1 && deps[0] !== null && typeof deps[0] === 'object' ? deps[0] : null;
      if (!key) return factory();
      if (!harness.memo.has(key)) harness.memo.set(key, factory());
      return harness.memo.get(key);
    },
    useEffect: (effect: () => (() => void) | undefined) => {
      const cleanup = effect();
      if (cleanup) harness.cleanup.push(cleanup);
    },
  };
});
vi.mock('../../stage', async (original) => {
  const actual = await original<typeof import('../../stage')>();
  return { ...actual, useStage: () => actual.STAGE, useSceneTime: () => ({ t: harness.time }) };
});
interface Props {
  children?: ReactNode;
  args?: number[];
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  geometry?: BufferGeometry;
  userData?: unknown;
  name?: string;
  color?: string;
  opacity?: number;
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
}
function cached(
  type: string,
  args: readonly (number | undefined)[],
  factory: () => BufferGeometry,
): BufferGeometry {
  if (!args.every((v) => v === undefined || Number.isFinite(v)))
    throw new Error('Non-finite geometry arguments');
  const key = `${type}:${JSON.stringify(args)}`;
  let geometry = harness.geometries.get(key);
  if (!geometry) {
    geometry = factory();
    harness.geometries.set(key, geometry);
  }
  return geometry;
}
function intrinsic(type: string, args: number[]): BufferGeometry {
  if (type === 'boxGeometry') return new BoxGeometry(...args);
  if (type === 'cylinderGeometry') return new CylinderGeometry(...args);
  if (type === 'sphereGeometry') return new SphereGeometry(...args);
  if (type === 'capsuleGeometry') return new CapsuleGeometry(...args);
  if (type === 'torusGeometry') return new TorusGeometry(...args);
  if (type === 'planeGeometry') return new PlaneGeometry(...args);
  throw new Error(`Unknown/opaque geometry ${type}`);
}
function inspector() {
  const owned = new Set<BufferGeometry>(),
    corners = new Map<BufferGeometry, Vector3[]>();
  const materials = new Map<string, MeshPhysicalMaterial>();
  const cameras = [1080 / 960, 952 / 478].map((aspect) => {
    const camera = new PerspectiveCamera(EXPLANATION_CAMERA.fov, aspect, 0.1, 100);
    camera.position.set(...EXPLANATION_CAMERA.position);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    return camera;
  });
  function local(geometry: BufferGeometry): Vector3[] {
    if (!(geometry instanceof BufferGeometry))
      throw new Error('Opaque geometry is not an authored position buffer');
    owned.add(geometry);
    const previous = corners.get(geometry);
    if (previous) return previous;
    const position = geometry.getAttribute('position');
    if (!position || position.itemSize !== 3 || position.count === 0)
      throw new Error('Opaque geometry without position buffer');
    if (!Array.from(position.array).every(Number.isFinite))
      throw new Error('Non-finite actual position buffer');
    const index = geometry.getIndex();
    if (
      index &&
      !Array.from(index.array).every((v) => Number.isInteger(v) && v >= 0 && v < position.count)
    )
      throw new Error('Invalid geometry index');
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (
      !bounds ||
      bounds.isEmpty() ||
      ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)
    )
      throw new Error('Missing finite actual geometry bounds');
    const result = [bounds.min.x, bounds.max.x].flatMap((x) =>
      [bounds.min.y, bounds.max.y].flatMap((y) =>
        [bounds.min.z, bounds.max.z].map((z) => new Vector3(x, y, z)),
      ),
    );
    corners.set(geometry, result);
    return result;
  }
  function inspect(root: ReactNode, turnAngle: number) {
    const box = new Box3(),
      turn = new Matrix4().makeRotationY(turnAngle);
    const facts: unknown[] = [],
      names: string[] = [],
      types: string[] = [],
      assetMeshes = new Map<string, number>();
    let meshes = 0,
      materialCount = 0,
      instances = 0,
      projectedX = 0,
      projectedY = 0,
      allocated = 0;
    function include(geometry: BufferGeometry, matrix: Matrix4) {
      instances++;
      for (const corner of local(geometry)) {
        const world = corner.clone().applyMatrix4(matrix).applyMatrix4(turn);
        if (!world.toArray().every(Number.isFinite)) throw new Error('Non-finite world geometry');
        box.expandByPoint(world);
        for (const camera of cameras) {
          const p = world.clone().project(camera);
          if (!p.toArray().every(Number.isFinite)) throw new Error('Non-finite projection');
          projectedX = Math.max(projectedX, Math.abs(p.x));
          projectedY = Math.max(projectedY, Math.abs(p.y));
        }
      }
    }
    function walk(node: ReactNode, parent: Matrix4) {
      if (Array.isArray(node)) {
        node.forEach((child) => {
          walk(child, parent);
        });
        return;
      }
      if (!isValidElement<Props>(node)) return;
      if (node.type === Fragment) {
        walk(node.props.children, parent);
        return;
      }
      if (typeof node.type === 'function') {
        types.push(node.type.name);
        walk(Reflect.apply(node.type, undefined, [node.props]) as ReactNode, parent);
        return;
      }
      const type = String(node.type),
        props = node.props;
      types.push(type);
      if (props.name) names.push(props.name);
      if (props.userData) facts.push(props.userData);
      if (type === 'mesh' || type === 'group') {
        const position = props.position ?? [0, 0, 0],
          rotation = props.rotation ?? [0, 0, 0];
        const scale =
          typeof props.scale === 'number'
            ? [props.scale, props.scale, props.scale]
            : (props.scale ?? [1, 1, 1]);
        if (![...position, ...rotation, ...scale].every(Number.isFinite))
          throw new Error('Non-finite transform');
        const world = parent
          .clone()
          .multiply(
            new Matrix4().compose(
              new Vector3(...position),
              new Quaternion().setFromEuler(new Euler(...rotation)),
              new Vector3(...scale),
            ),
          );
        const before = instances,
          beforeMeshes = meshes;
        if (type === 'mesh') meshes++;
        if (props.geometry) {
          allocated++;
          include(props.geometry, world);
        }
        walk(props.children, world);
        if (type === 'mesh' && instances - before !== 1)
          throw new Error('Each mesh needs exactly one accounted real geometry');
        if (props.name?.startsWith('asset:') || props.name?.startsWith('capital-dependency:A-12:'))
          assetMeshes.set(props.name, meshes - beforeMeshes);
        return;
      }
      if (type.endsWith('Geometry')) {
        const args = props.args ?? [];
        include(
          cached(type, args, () => intrinsic(type, args)),
          parent,
        );
        return;
      }
      if (type === 'meshPhysicalMaterial') {
        const key = JSON.stringify(props);
        let material = materials.get(key);
        if (!material) {
          material = new MeshPhysicalMaterial({
            color: props.color,
            opacity: props.opacity,
            roughness: props.roughness,
            metalness: props.metalness,
            clearcoat: props.clearcoat,
            clearcoatRoughness: props.clearcoatRoughness,
          });
          materials.set(key, material);
          if (
            ![
              material.opacity,
              material.roughness,
              material.metalness,
              material.clearcoat,
              material.clearcoatRoughness,
              material.color.r,
              material.color.g,
              material.color.b,
            ].every(Number.isFinite)
          )
            throw new Error('Non-finite actual material');
        }
        materialCount++;
        return;
      }
      throw new Error(`Unaccounted authored node ${type}`);
    }
    walk(root, new Matrix4());
    expect(projectedX).toBeLessThanOrEqual(1);
    expect(projectedY).toBeLessThanOrEqual(1);
    return { box, meshes, materials: materialCount, facts, names, types, assetMeshes, allocated };
  }
  function dispose() {
    try {
      harness.cleanup.splice(0).forEach((cleanup) => {
        cleanup();
      });
    } finally {
      new Set([...owned, ...harness.geometries.values()]).forEach((g) => {
        g.dispose();
      });
      materials.forEach((m) => {
        m.dispose();
      });
      owned.clear();
      corners.clear();
      materials.clear();
      harness.geometries.clear();
      harness.memo = new WeakMap();
    }
  }
  return { inspect, dispose };
}
function boundaries(node: ReactNode): number {
  if (Array.isArray(node)) return node.reduce((sum, child) => sum + boundaries(child), 0);
  if (!isValidElement<{ children?: ReactNode }>(node)) return 0;
  return (node.type === Stage3D ? 1 : 0) + boundaries(node.props.children);
}
const fixtures = [
  ...CAPITAL_SOURCE_FIXTURES,
  ...CAPITAL_RENDER_VARIANTS,
  ...CAPITAL_LABEL_FIXTURES,
];
const modes = fixtures.flatMap((fixture, probe) =>
  (fixture.id === 'OP-59' ? ['diagram'] : ['diagram', 'hybrid']).map((mode) => ({
    fixture,
    mode,
    probe,
  })),
);
describe('CAPITAL actual source JSX/pages and authored CPU resource proof, not native/GPU raster', () => {
  it.each(
    CAPITAL_SOURCE_FIXTURES.filter((fixture) => ['OP-61', 'OP-62'].includes(fixture.id)),
  )('$id includes the physical-slot disclaimer in source-gated layout, not a renderer-only add-on', (fixture) => {
    const scene = parsedCapital(fixture);
    for (const page of capitalPages(scene)) {
      const t = (page.start + page.end) / 2;
      expect(capitalVisibleLayouts(scene, t)).toEqual(capitalActivePage(scene, t).cards);
    }
    const lines = capitalPages(scene).flatMap((page) =>
      page.cards.flatMap((layout) => layout.card.lines.map((line) => line.text)),
    );
    expect(lines.some((text) => text.startsWith('Calendar: 3 reading slots;'))).toBe(true);
  });
  it.each(
    modes,
  )('$fixture.id source probe $probe $mode has complete fixed-font held pages and original settled chrome, no nested stage', ({
    fixture,
    mode,
  }) => {
    const copy = structuredClone(fixture);
    copy.raw.visualMode = mode;
    const scene = parsedCapital(copy),
      before = structuredClone(scene),
      pages = capitalPages(scene),
      seen = new Set<string>();
    for (const page of pages) {
      expect(page.end - page.start).toBeGreaterThanOrEqual(1.5);
      for (const t of [page.start + 0.00001, page.start + 1.5 - 0.00001]) {
        expect(diagramPose(t, scene).diagramOpacity).toBe(1);
        const svg = renderToStaticMarkup(
          createElement('svg', null, createElement(CapitalDiagramParts, { scene, seconds: t })),
        );
        expect(svg).toContain('font-family="Inter"');
        expect(svg).toContain('font-size="24"');
        expect(svg).toContain('font-size="22"');
        expect(svg).not.toMatch(/<canvas|<image|foreignObject|ellipsis|…/u);
        expect(svg).toContain(`data-treatment="${sampleCapital(scene, t).treatment}"`);
        expect(svg).toContain(
          `data-semantic-ids="${capitalIdentities(scene)
            .map((a) => a.id)
            .join(' ')}"`,
        );
        const text = svg.replace(/<[^>]+>/gu, '').replace(/\s/gu, '');
        for (const layout of capitalVisibleLayouts(scene, t)) {
          seen.add(layout.card.id);
          expect(svg).toContain(`data-fact-id="${layout.card.id}"`);
          expect(text).toContain(layout.card.title.replace(/\s/gu, ''));
          for (const line of layout.card.lines)
            expect(text).toContain(line.text.replace(/\s/gu, ''));
          expect(layout.x).toBeGreaterThanOrEqual(0);
          expect(layout.x + layout.width).toBeLessThanOrEqual(952);
          expect(layout.y + layout.height).toBeLessThanOrEqual(478);
          expect(new Set(layout.bodyLines.map((l) => l.id)).size).toBe(layout.bodyLines.length);
          for (const line of layout.bodyLines) {
            expect(businessTextWidth(line.text, R.bodySize)).toBeLessThanOrEqual(
              layout.width - 2 * R.padding,
            );
            expect(line.y).toBeLessThanOrEqual(layout.y + layout.height - R.padding);
          }
        }
        if (
          (scene.preset === 'financing-versus-capacity' ||
            scene.preset === 'obligations-and-maturity') &&
          page.cards.some((c) => c.card.id === scene.asset.id)
        )
          expect(svg).toContain('unassigned, not maturities or events');
        if (scene.kind === 'investment-outcomes') {
          expect(pages).toHaveLength(1);
          expect(new Set(page.cards.map((c) => `${c.width}:${c.height}`)).size).toBe(1);
        }
      }
    }
    expect(seen).toEqual(new Set(pages.flatMap((p) => p.cards.map((c) => c.card.id))));
    harness.time = scene.resolveAt;
    const view = CapitalSceneView({ scene });
    if (mode === 'diagram') {
      expect(view.type).toBe(DiagramStage);
      if (!isValidElement<Parameters<typeof DiagramStage>[0]>(view))
        throw new Error('Missing diagram wrapper');
      expect(view.props.scene).toBe(scene);
      expect(view.props.settledOutcome).toBe(true);
      expect(boundaries(DiagramStage(view.props))).toBe(0);
    } else {
      expect(view.type).toBe(HybridStage);
      if (!isValidElement<Parameters<typeof HybridStage>[0]>(view))
        throw new Error('Missing hybrid wrapper');
      expect(view.props.scene).toBe(scene);
      expect(view.props.settledOutcome).toBe(true);
      expect(boundaries(HybridStage(view.props))).toBe(1);
    }
    expect(boundaries(createElement(CapitalModelParts, { scene, seconds: scene.resolveAt }))).toBe(
      0,
    );
    const chrome = renderToStaticMarkup(
      createElement(DiagramChrome, { scene, settledOutcome: true }),
    );
    expect(chrome).not.toContain('opacity:0');
    expect(chrome.replace(/<[^>]+>/gu, '').replace(/\s/gu, '')).toContain(
      scene.outcome.replace(/\s/gu, ''),
    );
    const end = capitalFixtureContext(copy).win.endTime;
    harness.time = end;
    expect(
      renderToStaticMarkup(createElement(DiagramChrome, { scene, settledOutcome: true })),
    ).toBe(chrome);
    const finalSvg = renderToStaticMarkup(
      createElement(
        'svg',
        null,
        createElement(CapitalDiagramParts, { scene, seconds: scene.resolveAt }),
      ),
    );
    expect(
      renderToStaticMarkup(
        createElement('svg', null, createElement(CapitalDiagramParts, { scene, seconds: end })),
      ),
    ).toBe(finalSvg);
    expect(scene).toEqual(before);
  });
  it.each(
    fixtures.map((fixture, probe) => ({ fixture, probe })),
  )('$fixture.id resource probe $probe inspects ALL 30fps + critical + reverse frames and handoff rotation, actual buffers, <=180 meshes, locked XYZ', ({
    fixture,
  }) => {
    const copy = structuredClone(fixture);
    copy.raw.visualMode = fixture.id === 'OP-59' ? 'diagram' : 'hybrid';
    const scene = parsedCapital(copy),
      before = structuredClone(scene),
      ctx = capitalFixtureContext(copy);
    expect(capitalIdentities(scene).length).toBeLessThanOrEqual(8);
    expect(capitalRelationCount(scene)).toBeLessThanOrEqual(12);
    expect(capitalHoldCount(scene)).toBeLessThanOrEqual(4);
    const first = Math.ceil(ctx.win.startTime * 30);
    const frames = Array.from(
      { length: Math.floor(ctx.win.endTime * 30) - first + 1 },
      (_, i) => (first + i) / 30,
    );
    const critical = [
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.responseAt + 0.35,
      scene.responseAt + 0.7,
      scene.checkAt,
      scene.resolveAt,
      ctx.win.endTime,
      ...capitalPages(scene).map((p) => p.start),
    ];
    const geometry = inspector();
    let facts: unknown[] | undefined;
    try {
      for (const t of [
        ...critical,
        ...frames,
        ...[...frames].reverse(),
        ...[...critical].reverse(),
      ]) {
        const result = geometry.inspect(
          createElement(CapitalModelParts, { scene, seconds: t }),
          diagramPose(t, scene).modelTurn,
        );
        if (scene.visualMode === 'diagram') {
          expect(result.meshes).toBe(0);
          continue;
        }
        expect(result.meshes).toBeGreaterThan(0);
        expect(result.meshes).toBeLessThanOrEqual(180);
        expect(result.materials).toBe(result.meshes);
        expect(result.box.min.x).toBeGreaterThanOrEqual(-3.4);
        expect(result.box.max.x).toBeLessThanOrEqual(3.4);
        expect(result.box.min.y).toBeGreaterThanOrEqual(-1.4);
        expect(result.box.max.y).toBeLessThanOrEqual(2.7);
        expect(result.box.min.z).toBeGreaterThanOrEqual(-2.6);
        expect(result.box.max.z).toBeLessThanOrEqual(1.8);
        for (const asset of capitalAssembly(scene))
          expect(result.assetMeshes.get(`asset:${asset.id}`)).toBeGreaterThan(0);
        for (const entity of capitalIdentities(scene))
          expect(result.names).toContain(`entity:${entity.id}`);
        expect(result.names).not.toContain('contributed-cash');
        expect(result.types).not.toContain('Stage3D');
        expect(result.types).not.toContain('Canvas');
        if (scene.preset === 'financing-versus-capacity') {
          expect(result.names).toContain('server-trays');
          expect(result.names).toContain('rack-vents-and-handles');
          expect(result.names).toContain('rack-emphasis');
          expect(result.allocated).toBeGreaterThanOrEqual(3);
        }
        facts ??= result.facts;
        expect(result.facts).toEqual(facts);
      }
    } finally {
      geometry.dispose();
    }
    expect(harness.geometries.size).toBe(0);
    expect(harness.cleanup).toHaveLength(0);
    expect(scene).toEqual(before);
  });
  it('actual CapsuleGeometry uses radius and length, not segment-count-as-Z; unknown and opaque geometry fail closed', () => {
    const geometry = inspector(),
      opaque = new BufferGeometry();
    let disposed = false;
    opaque.addEventListener('dispose', () => {
      disposed = true;
    });
    try {
      const capsule = geometry.inspect(
        createElement('mesh', null, createElement('capsuleGeometry', { args: [0.2, 2, 8, 16] })),
        0,
      );
      expect(capsule.box.max.x - capsule.box.min.x).toBeCloseTo(0.4, 5);
      expect(capsule.box.max.y - capsule.box.min.y).toBeCloseTo(2.4, 5);
      expect(capsule.box.max.z - capsule.box.min.z).toBeCloseTo(0.4, 5);
      expect(() =>
        geometry.inspect(createElement('mesh', null, createElement('unknownGeometry')), 0),
      ).toThrow(/Unknown\/opaque/u);
      expect(() => geometry.inspect(createElement('mesh', { geometry: opaque }), 0)).toThrow(
        /Opaque geometry/u,
      );
      expect(() => geometry.inspect(createElement('primitive', { object: {} }), 0)).toThrow(
        /Unaccounted/u,
      );
    } finally {
      geometry.dispose();
    }
    expect(disposed).toBe(true);
    expect(harness.geometries.size).toBe(0);
  });
});

function parsedDependency(fixture: SharedDependencySourceFixture) {
  const ctx = sharedDependencyFixtureContext(fixture);
  const scene = parsePortfolioExposure(fixture.raw, ctx);
  if (!scene) throw new Error(`Rejected source dependency fixture: ${ctx.issues.join('; ')}`);
  return scene;
}

describe('OP-58 production dependency lens: complete pages, separate records and shared stage', () => {
  const lensCases = [
    { name: 'primary', fixture: sharedDependencyFixture() },
    { name: 'maximum labels', fixture: sharedDependencyFixture({ maxLabels: true }) },
  ].flatMap((probe) => (['diagram', 'hybrid'] as const).map((mode) => ({ ...probe, mode })));
  it.each(
    lensCases,
  )('$name:$mode routes the opt-in scene through the actual finance component with held full source facts', ({
    fixture,
    mode,
  }) => {
    const input = structuredClone(fixture);
    input.raw.visualMode = mode;
    const scene = parsedDependency(input);
    if (!scene?.dependencyLens) throw new Error('Missing parsed dependency lens');
    const lens = scene.dependencyLens,
      before = structuredClone(scene);
    const pages = capitalDependencyPages(scene, scene.funds, scene.exposure, lens);
    const facts = capitalDependencyFacts(scene.funds, scene.exposure, lens);
    const expectedIds = capitalDependencySemanticIds(scene.funds, scene.exposure, lens);
    expect(expectedIds).toHaveLength(5);
    expect(new Set(expectedIds).size).toBe(5);
    expect(facts.filter((fact) => fact.fromId && fact.toId)).toHaveLength(4);
    expect(pages.length).toBeLessThanOrEqual(4);
    const seen = new Set<string>();
    for (const page of pages) {
      expect(page.end - page.start).toBeGreaterThanOrEqual(1.5);
      for (const seconds of [page.start + 0.00001, page.start + 1.5 - 0.00001]) {
        const pose = sampleCapitalDependency(scene, lens, seconds);
        const svg = renderToStaticMarkup(
          createElement(
            'svg',
            null,
            createElement(CapitalDependencyDiagramParts, { scene, lens, pose }),
          ),
        );
        expect(diagramPose(seconds, scene).diagramOpacity).toBe(1);
        expect(pose.opacity).toBe(1);
        expect(svg).toContain('data-business-recipe="OP-58"');
        expect(svg).toContain('data-treatment="M-03"');
        expect(svg).toContain(`data-semantic-ids="${expectedIds.join(' ')}"`);
        expect(svg).toContain('font-size="24"');
        expect(svg).toContain('font-size="22"');
        expect(svg).not.toMatch(/<canvas|foreignObject|<image|ellipsis|…/u);
        const text = svg.replace(/<[^>]+>/gu, '').replace(/\s/gu, '');
        for (const layout of pose.page.facts) {
          seen.add(layout.fact.id);
          expect(svg).toContain(`data-fact-id="${layout.fact.id}"`);
          expect(text).toContain(layout.fact.text.replace(/\s/gu, ''));
          expect(layout.top + layout.height).toBeLessThanOrEqual(DR.height - DR.x);
          for (const line of layout.lines)
            expect(businessTextWidth(line, DR.bodyFont)).toBeLessThanOrEqual(DR.rail);
        }
      }
    }
    expect(seen).toEqual(new Set(facts.map((fact) => fact.id)));
    harness.time = scene.resolveAt;
    const routed = PortfolioExposureScene({ scene });
    expect(routed.type).toBe(CapitalDependencyView);
    const view = CapitalDependencyView({ scene, lens });
    expect(view.type).toBe(HybridStage);
    if (!isValidElement<Parameters<typeof HybridStage>[0]>(view))
      throw new Error('Missing dependency hybrid wrapper');
    expect(view.props.scene).toBe(scene);
    expect(view.props.settledOutcome).toBe(true);
    expect(boundaries(HybridStage(view.props))).toBe(mode === 'hybrid' ? 1 : 0);
    expect(
      boundaries(
        createElement(CapitalDependencyModelParts, {
          scene,
          lens,
          pose: sampleCapitalDependency(scene, lens, scene.resolveAt),
        }),
      ),
    ).toBe(0);
    const finalSvg = renderToStaticMarkup(
      createElement(
        'svg',
        null,
        createElement(CapitalDependencyDiagramParts, {
          scene,
          lens,
          pose: sampleCapitalDependency(scene, lens, scene.resolveAt),
        }),
      ),
    );
    const end = sharedDependencyFixtureContext(input).win.endTime;
    expect(
      renderToStaticMarkup(
        createElement(
          'svg',
          null,
          createElement(CapitalDependencyDiagramParts, {
            scene,
            lens,
            pose: sampleCapitalDependency(scene, lens, end),
          }),
        ),
      ),
    ).toBe(finalSvg);
    const chrome = renderToStaticMarkup(
      createElement(DiagramChrome, { scene, settledOutcome: true }),
    );
    expect(chrome.replace(/<[^>]+>/gu, '').replace(/\s/gu, '')).toContain(
      scene.outcome.replace(/\s/gu, ''),
    );
    harness.time = end;
    expect(
      renderToStaticMarkup(createElement(DiagramChrome, { scene, settledOutcome: true })),
    ).toBe(chrome);
    expect(scene).toEqual(before);
  });
  it.each(
    lensCases,
  )('$name:$mode inspects real record layers at ALL 30fps, critical/reverse and shared handoff frames', ({
    fixture,
    mode,
  }) => {
    const input = structuredClone(fixture);
    input.raw.visualMode = mode;
    const scene = parsedDependency(input);
    if (!scene?.dependencyLens) throw new Error('Missing parsed dependency lens');
    const lens = scene.dependencyLens,
      before = structuredClone(scene),
      ctx = sharedDependencyFixtureContext(input);
    const first = Math.ceil(ctx.win.startTime * 30);
    const frames = Array.from(
      { length: Math.floor(ctx.win.endTime * 30) - first + 1 },
      (_, i) => (first + i) / 30,
    );
    const critical = [
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.responseAt + 0.35,
      scene.responseAt + 0.7,
      scene.checkAt,
      scene.resolveAt,
      ctx.win.endTime,
      ...capitalDependencyPages(scene, scene.funds, scene.exposure, lens).map((page) => page.start),
    ];
    const geometry = inspector();
    let sourceFacts: unknown[] | undefined;
    try {
      for (const seconds of [
        ...critical,
        ...frames,
        ...[...frames].reverse(),
        ...[...critical].reverse(),
      ]) {
        const pose = sampleCapitalDependency(scene, lens, seconds);
        const result = geometry.inspect(
          createElement(CapitalDependencyModelParts, { scene, lens, pose }),
          pose.modelTurn,
        );
        if (mode === 'diagram') {
          expect(result.meshes).toBe(0);
          continue;
        }
        expect(result.meshes).toBeGreaterThan(0);
        expect(result.meshes).toBeLessThanOrEqual(180);
        expect(result.materials).toBe(result.meshes);
        expect(result.box.min.x).toBeGreaterThanOrEqual(-3.4);
        expect(result.box.max.x).toBeLessThanOrEqual(3.4);
        expect(result.box.min.y).toBeGreaterThanOrEqual(-1.4);
        expect(result.box.max.y).toBeLessThanOrEqual(2.7);
        expect(result.box.min.z).toBeGreaterThanOrEqual(-2.6);
        expect(result.box.max.z).toBeLessThanOrEqual(1.8);
        for (const fund of scene.funds) {
          const name = `capital-dependency:A-12:${fund.id}`;
          expect(result.names).toContain(name);
          expect(result.assetMeshes.get(name)).toBeGreaterThan(0);
        }
        expect(result.types).not.toContain('Stage3D');
        expect(result.types).not.toContain('Canvas');
        sourceFacts ??= result.facts;
        expect(result.facts).toEqual(sourceFacts);
      }
    } finally {
      geometry.dispose();
    }
    expect(harness.geometries.size).toBe(0);
    expect(harness.cleanup).toHaveLength(0);
    expect(scene).toEqual(before);
  });
});
