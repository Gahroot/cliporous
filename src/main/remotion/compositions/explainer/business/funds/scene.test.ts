import { createElement, Fragment, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Box3,
  BoxGeometry,
  type BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DiagramChrome } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { diagramPose } from '../../diagrams/motion';
import { EXPLANATION_CAMERA } from '../../explanation-layout';
import { Stage3D } from '../../Stage3D';
import { BUSINESS_RECIPES } from '../catalog';
import { businessTextWidth } from '../text-width';
import {
  FUNDS_ACCEPTED_VARIANTS,
  FUNDS_RESOURCE_FIXTURES,
  FUNDS_SOURCE_FIXTURES,
  parseFundsFixture,
} from './fixtures';
import { FundsDiagramParts, FundsModelParts } from './parts';
import { sampleFundsScene } from './poses';
import {
  fundsPageDuration,
  fundsPages,
  fundsReadingStart,
  fundsResourceCounts,
  fundsRowLines,
  fundsSemanticIds,
  FUNDS_TABLE as T,
} from './presentation';
import { FundsSceneView } from './Scene';

const harness = vi.hoisted(() => ({
  time: 0,
  cleanup: [] as (() => void)[],
  geometries: new Map<string, import('three').BufferGeometry>(),
}));
// The real rounded constructor is cached, not replaced by simplified boxes or asset stubs.
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
    useMemo: (factory: () => unknown) => factory(),
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
  if (!args.every((value) => value === undefined || Number.isFinite(value)))
    throw new Error('Non-finite real geometry arguments');
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
  throw new Error(`Unknown/opaque geometry ${type}`);
}
function inspector() {
  const owned = new Set<BufferGeometry>(),
    corners = new Map<BufferGeometry, Vector3[]>();
  const camera = new PerspectiveCamera(EXPLANATION_CAMERA.fov, 1080 / 960, 0.1, 100);
  camera.position.set(...EXPLANATION_CAMERA.position);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  function local(geometry: BufferGeometry): Vector3[] {
    const previous = corners.get(geometry);
    if (previous) return previous;
    owned.add(geometry);
    const position = geometry.getAttribute('position');
    if (!position || position.itemSize !== 3 || position.count === 0)
      throw new Error('Opaque geometry without real position buffer');
    expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
    const index = geometry.getIndex();
    if (index)
      expect(
        Array.from(index.array).every(
          (value) => Number.isInteger(value) && value >= 0 && value < position.count,
        ),
      ).toBe(true);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds || bounds.isEmpty()) throw new Error('Missing conservative actual geometry bounds');
    expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)).toBe(true);
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
      turn = new Matrix4().makeRotationY(turnAngle),
      facts: unknown[] = [],
      types: string[] = [],
      names: string[] = [];
    const assetMeshes = new Map<string, number>();
    let meshes = 0,
      materials = 0,
      instances = 0,
      projectedX = 0,
      projectedY = 0;
    function include(geometry: BufferGeometry, matrix: Matrix4) {
      instances++;
      for (const corner of local(geometry)) {
        // All eight corners under the actual complete frame/group + shared handoff matrices.
        const world = corner.clone().applyMatrix4(matrix).applyMatrix4(turn);
        if (!world.toArray().every(Number.isFinite))
          throw new Error('Non-finite transformed geometry');
        box.expandByPoint(world);
        const projected = world.project(camera);
        if (!projected.toArray().every(Number.isFinite)) throw new Error('Non-finite projection');
        projectedX = Math.max(projectedX, Math.abs(projected.x));
        projectedY = Math.max(projectedY, Math.abs(projected.y));
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
      // Fragment BEFORE function inspection: React/Remotion's types must not erase children.
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
      if (type === 'group' || type === 'mesh') {
        const position = props.position ?? [0, 0, 0],
          rotation = props.rotation ?? [0, 0, 0],
          scale =
            typeof props.scale === 'number'
              ? [props.scale, props.scale, props.scale]
              : (props.scale ?? [1, 1, 1]);
        if (![...position, ...rotation, ...scale].every(Number.isFinite))
          throw new Error('Non-finite frame transform');
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
        if (props.geometry) include(props.geometry, world);
        walk(props.children, world);
        if (type === 'mesh' && instances - before !== 1)
          throw new Error('Every authored mesh must have exactly one accounted real geometry');
        if (props.name?.startsWith('funds:A-')) assetMeshes.set(props.name, meshes - beforeMeshes);
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
        const material = new MeshPhysicalMaterial({
          color: props.color,
          opacity: props.opacity,
          roughness: props.roughness,
          metalness: props.metalness,
          clearcoat: props.clearcoat,
          clearcoatRoughness: props.clearcoatRoughness,
        });
        try {
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
        } finally {
          material.dispose();
        }
        materials++;
        return;
      }
      throw new Error(`Unaccounted authored model node ${type}`);
    }
    walk(root, new Matrix4());
    expect(projectedX).toBeLessThanOrEqual(1);
    expect(projectedY).toBeLessThanOrEqual(1);
    return { box, meshes, materials, facts, types, names, assetMeshes };
  }
  function dispose() {
    try {
      harness.cleanup.splice(0).forEach((cleanup) => {
        cleanup();
      });
    } finally {
      for (const geometry of new Set([...owned, ...harness.geometries.values()]))
        geometry.dispose();
      owned.clear();
      corners.clear();
      harness.geometries.clear();
    }
  }
  return { inspect, dispose };
}
function boundaries(node: ReactNode): number {
  if (Array.isArray(node)) return node.reduce((sum, child) => sum + boundaries(child), 0);
  if (!isValidElement<{ children?: ReactNode }>(node)) return 0;
  return (node.type === Stage3D ? 1 : 0) + boundaries(node.props.children);
}
const fixtures = [...FUNDS_SOURCE_FIXTURES, ...FUNDS_ACCEPTED_VARIANTS, ...FUNDS_RESOURCE_FIXTURES];
const modes = fixtures.flatMap((fixture) =>
  (fixture.id === 'OP-52' ? ['diagram'] : ['diagram', 'hybrid']).map((mode) => ({ fixture, mode })),
);
describe('funds actual CPU geometry + source page proof (not native GPU/font raster)', () => {
  it.each(
    modes,
  )('$fixture.id $fixture.name $mode displays complete settled pages, source IDs and original final outcome on zero/one stage', ({
    fixture,
    mode,
  }) => {
    const copy = structuredClone(fixture);
    copy.raw.visualMode = mode;
    const { scene, issues } = parseFundsFixture(copy);
    if (!scene) throw new Error(issues.join('; '));
    const pages = fundsPages(scene),
      duration = fundsPageDuration(scene),
      catalog = BUSINESS_RECIPES.find((recipe) => recipe.id === fixture.id);
    expect(duration).toBeGreaterThanOrEqual(1.5);
    pages.forEach((page, index) => {
      const at = fundsReadingStart(scene) + index * duration;
      for (const t of [at + 0.00001, at + 1.5 - 0.00001]) {
        const pose = sampleFundsScene(scene, t);
        const svg = renderToStaticMarkup(
          createElement('svg', null, createElement(FundsDiagramParts, { scene, pose })),
        );
        expect(pose.opacity).toBe(1);
        if (mode === 'hybrid') expect(diagramPose(t, scene).diagramOpacity).toBe(1);
        expect(svg).toContain('font-size="24"');
        expect(svg).not.toMatch(/<canvas|<image|foreignObject|ellipsis|…/u);
        expect(svg).toContain(scene.fund.label);
        expect(svg).toContain(scene.operator.label);
        for (const id of fundsSemanticIds(scene)) expect(svg).toContain(id);
        for (const motion of catalog?.treatments ?? [])
          expect(svg).toContain(`data-treatment="${motion}"`);
        for (const [rowIndex, row] of page.rows.entries()) {
          const baseline =
            T.rowTop +
            page.heights.slice(0, rowIndex).reduce((sum, height) => sum + height, 0) +
            24;
          expect(svg).toContain(`data-fact-id="${row.id}"`);
          expect(svg).toContain(`data-state="${row.state}"`);
          fundsRowLines(row).forEach((lines, column) => {
            for (const [lineSlot, line] of lines.entries()) {
              const encoded = line
                .replace(/&/gu, '&amp;')
                .replace(/</gu, '&lt;')
                .replace(/>/gu, '&gt;')
                .replace(/"/gu, '&quot;')
                .replace(/'/gu, '&#x27;');
              expect(svg).toContain(encoded);
              expect(svg).toContain(
                `<tspan x="${T.x[column]}" y="${baseline + lineSlot * T.lineHeight}">${encoded}</tspan>`,
              );
              expect(businessTextWidth(line, 24)).toBeLessThanOrEqual(T.railWidths[column]);
            }
          });
        }
        if (scene.preset === 'stated-priority-tiers' && scene.tiers.length < 4)
          expect(svg).toContain('unused (not source priorities)');
      }
    });
    harness.time = scene.resolveAt;
    const view = FundsSceneView({ scene });
    if (!isValidElement<Parameters<typeof HybridStage>[0]>(view))
      throw new Error('Missing existing stage view');
    expect(view.type).toBe(HybridStage);
    expect(view.props.scene).toBe(scene);
    expect(view.props.settledOutcome).toBe(true);
    expect(boundaries(HybridStage(view.props))).toBe(mode === 'hybrid' ? 1 : 0);
    const chrome = renderToStaticMarkup(
      createElement(DiagramChrome, { scene, settledOutcome: true }),
    );
    expect(chrome).not.toContain('opacity:0');
    expect(chrome.replace(/<[^>]+>/gu, '').replace(/\s/gu, '')).toContain(
      scene.outcome.replace(/\s/gu, ''),
    );
    harness.time = copy.window.endTime;
    expect(
      renderToStaticMarkup(createElement(DiagramChrome, { scene, settledOutcome: true })),
    ).toBe(chrome);
    const finalSvg = renderToStaticMarkup(
      createElement(
        'svg',
        null,
        createElement(FundsDiagramParts, { scene, pose: sampleFundsScene(scene, scene.resolveAt) }),
      ),
    );
    expect(
      renderToStaticMarkup(
        createElement(
          'svg',
          null,
          createElement(FundsDiagramParts, {
            scene,
            pose: sampleFundsScene(scene, copy.window.endTime),
          }),
        ),
      ),
    ).toBe(finalSvg);
    expect(
      boundaries(
        createElement(FundsModelParts, { scene, pose: sampleFundsScene(scene, scene.resolveAt) }),
      ),
    ).toBe(0);
  });
  it.each(
    modes,
  )('$fixture.id $fixture.name $mode has real finite source-gated assets at ALL 30fps/critical/backward frames, <=180 meshes and locked studio bounds', ({
    fixture,
    mode,
  }) => {
    const copy = structuredClone(fixture);
    copy.raw.visualMode = mode;
    const { scene, issues } = parseFundsFixture(copy);
    if (!scene) throw new Error(issues.join('; '));
    const counts = fundsResourceCounts(scene);
    expect(counts.entities).toBeLessThanOrEqual(8);
    expect(counts.relationships).toBeLessThanOrEqual(12);
    expect(counts.holds).toBeLessThanOrEqual(4);
    const first = Math.ceil(copy.window.startTime * 30),
      frames = Array.from(
        { length: Math.floor(copy.window.endTime * 30) - first + 1 },
        (_, index) => (first + index) / 30,
      );
    const critical = [
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
      copy.window.endTime,
    ];
    const geometry = inspector();
    let initial: unknown[] | undefined;
    try {
      for (const seconds of [...critical, ...frames, ...critical.slice().reverse(), ...critical]) {
        const pose = sampleFundsScene(scene, seconds),
          result = geometry.inspect(
            createElement(FundsModelParts, { scene, pose }),
            diagramPose(pose.time, scene).modelTurn,
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
        for (const asset of BUSINESS_RECIPES.find((recipe) => recipe.id === fixture.id)?.assets ??
          []) {
          expect(result.names).toContain(`funds:${asset}`);
          expect(result.assetMeshes.get(`funds:${asset}`) ?? 0).toBeGreaterThan(0);
        }
        expect(result.types).not.toContain('Stage3D');
        expect(result.types).not.toContain('Canvas');
        initial ??= result.facts;
        expect(result.facts).toEqual(initial);
      }
    } finally {
      geometry.dispose();
    }
    expect(harness.geometries.size).toBe(0);
    expect(harness.cleanup).toHaveLength(0);
  });
});
