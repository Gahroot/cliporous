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
import { HybridStage } from '../../diagrams/HybridStage';
import { diagramPose } from '../../diagrams/motion';
import { EXPLANATION_CAMERA } from '../../explanation-layout';
import { Stage3D } from '../../Stage3D';
import {
  ORGANIZATION_RESOURCE_FIXTURES,
  ORGANIZATION_SOURCE_FIXTURES,
  parseOrganizationFixture,
} from './fixtures';
import { OrganizationDiagramParts, OrganizationModelParts, organizationSemanticIds } from './parts';
import { sampleOrganizationScene } from './poses';
import {
  ORGANIZATION_TABLE,
  organizationPageDuration,
  organizationReadingStart,
  organizationRowLines,
} from './presentation';
import { OrganizationSceneView } from './Scene';

const harness = vi.hoisted(() => ({
  time: 0,
  cleanup: [] as (() => void)[],
  geometries: new Map<string, import('three').BufferGeometry>(),
}));
// Reviewed ClayBlock: useMemo constructs a real RoundedBoxGeometry on each CPU walk.
// Cache its actual constructor by type + all args; never replace authored solids with boxes.
// Previously every vertex incurred three assertions per mesh/frame, including duplicates.
vi.mock('three/examples/jsm/geometries/RoundedBoxGeometry.js', async (original) => {
  const actual =
    await original<typeof import('three/examples/jsm/geometries/RoundedBoxGeometry.js')>();
  return {
    ...actual,
    RoundedBoxGeometry: function RoundedBoxGeometry(
      ...args: ConstructorParameters<typeof actual.RoundedBoxGeometry>
    ) {
      return cachedGeometry(
        'RoundedBoxGeometry',
        args,
        () => new actual.RoundedBoxGeometry(...args),
      );
    },
  };
});
// Execute the real geometry/cleanup factories; no ClayBlock, asset, material or stage stub.
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
interface NodeProps {
  children?: ReactNode;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  args?: number[];
  geometry?: BufferGeometry;
  userData?: unknown;
  color?: string;
  opacity?: number;
  roughness?: number;
  metalness?: number;
}
function intrinsic(type: string, args: number[]): BufferGeometry {
  expect(args.every(Number.isFinite)).toBe(true);
  if (type === 'boxGeometry') return new BoxGeometry(...args);
  if (type === 'cylinderGeometry') return new CylinderGeometry(...args);
  if (type === 'sphereGeometry') return new SphereGeometry(...args);
  if (type === 'capsuleGeometry') return new CapsuleGeometry(...args);
  if (type === 'torusGeometry') return new TorusGeometry(...args);
  throw new Error(`Unaccounted geometry ${type}`);
}
function cachedGeometry(
  type: string,
  args: readonly (number | undefined)[],
  make: () => BufferGeometry,
): BufferGeometry {
  if (!args.every((value) => value === undefined || Number.isFinite(value)))
    throw new Error(`Non-finite ${type} args`);
  const key = `${type}:${JSON.stringify(args)}`;
  let geometry = harness.geometries.get(key);
  if (!geometry) {
    geometry = make();
    harness.geometries.set(key, geometry);
  }
  return geometry;
}
/** One cache per test, including unordered seeks. Validate actual buffers only once. */
function geometryInspector() {
  const owned = new Set<BufferGeometry>();
  const corners = new Map<BufferGeometry, Vector3[]>();
  const camera = new PerspectiveCamera(EXPLANATION_CAMERA.fov, 1080 / 960, 0.1, 100);
  camera.position.set(...EXPLANATION_CAMERA.position);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  function localCorners(geometry: BufferGeometry): Vector3[] {
    const prior = corners.get(geometry);
    if (prior) return prior;
    owned.add(geometry);
    const position = geometry.getAttribute('position');
    if (!position || position.itemSize !== 3 || position.count === 0)
      throw new Error('Opaque/empty geometry has no real positions');
    expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
    const index = geometry.getIndex();
    if (index)
      expect(
        Array.from(index.array).every(
          (value) =>
            Number.isFinite(value) &&
            Number.isInteger(value) &&
            value >= 0 &&
            value < position.count,
        ),
      ).toBe(true);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds || bounds.isEmpty()) throw new Error('Missing actual geometry bounds');
    expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)).toBe(true);
    const points = [bounds.min.x, bounds.max.x].flatMap((x) =>
      [bounds.min.y, bounds.max.y].flatMap((y) =>
        [bounds.min.z, bounds.max.z].map((z) => new Vector3(x, y, z)),
      ),
    );
    corners.set(geometry, points);
    return points;
  }
  function inspect(root: ReactNode, turnAngle: number) {
    let meshes = 0,
      materials = 0,
      instances = 0,
      projectedX = 0,
      projectedY = 0;
    const box = new Box3();
    const facts: unknown[] = [],
      types: string[] = [];
    const turn = new Matrix4().makeRotationY(turnAngle);
    function include(geometry: BufferGeometry, matrix: Matrix4) {
      instances++;
      // All eight conservative corners under EVERY actual parent/frame matrix.
      for (const corner of localCorners(geometry)) {
        const world = corner.clone().applyMatrix4(matrix);
        if (!world.toArray().every(Number.isFinite))
          throw new Error('Non-finite transformed geometry');
        box.expandByPoint(world);
        const projected = world.applyMatrix4(turn).project(camera);
        if (!projected.toArray().every(Number.isFinite))
          throw new Error('Non-finite camera projection');
        projectedX = Math.max(projectedX, Math.abs(projected.x));
        projectedY = Math.max(projectedY, Math.abs(projected.y));
      }
    }
    function walk(child: ReactNode, parent: Matrix4) {
      if (Array.isArray(child)) {
        child.forEach((item) => {
          walk(item, parent);
        });
        return;
      }
      if (!isValidElement<NodeProps>(child)) return;
      if (child.type === Fragment) {
        walk(child.props.children, parent);
        return;
      }
      if (typeof child.type === 'function') {
        types.push(child.type.name);
        walk(Reflect.apply(child.type, undefined, [child.props]) as ReactNode, parent);
        return;
      }
      const type = String(child.type),
        props = child.props;
      types.push(type);
      if (props.userData) facts.push(props.userData);
      if (type === 'group' || type === 'mesh') {
        const position = props.position ?? [0, 0, 0],
          rotation = props.rotation ?? [0, 0, 0];
        const scale =
          typeof props.scale === 'number'
            ? [props.scale, props.scale, props.scale]
            : (props.scale ?? [1, 1, 1]);
        if (![...position, ...rotation, ...scale].every(Number.isFinite))
          throw new Error('Non-finite model transform');
        const world = parent
          .clone()
          .multiply(
            new Matrix4().compose(
              new Vector3(...position),
              new Quaternion().setFromEuler(new Euler(...rotation)),
              new Vector3(...scale),
            ),
          );
        const before = instances;
        if (type === 'mesh') meshes++;
        if (props.geometry) include(props.geometry, world);
        walk(props.children, world);
        if (type === 'mesh' && instances - before !== 1)
          throw new Error('Mesh must have exactly one accounted geometry');
        return;
      }
      if (type.endsWith('Geometry')) {
        const args = props.args ?? [];
        include(
          cachedGeometry(type, args, () => intrinsic(type, args)),
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
        });
        try {
          if (
            ![
              material.opacity,
              material.roughness,
              material.metalness,
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
      throw new Error(`Unaccounted model node ${type}`);
    }
    walk(root, new Matrix4());
    expect(projectedX).toBeLessThanOrEqual(1);
    expect(projectedY).toBeLessThanOrEqual(1);
    return { meshes, materials, box, facts, types };
  }
  function dispose() {
    try {
      harness.cleanup.splice(0).forEach((cleanup) => {
        cleanup();
      });
    } finally {
      for (const geometry of new Set([...owned, ...harness.geometries.values()]))
        geometry.dispose();
      harness.geometries.clear();
      corners.clear();
      owned.clear();
    }
  }
  return { inspect, dispose };
}
function boundaries(node: ReactNode): number {
  if (Array.isArray(node)) return node.reduce((count, child) => count + boundaries(child), 0);
  if (!isValidElement<{ children?: ReactNode }>(node)) return 0;
  return (node.type === Stage3D ? 1 : 0) + boundaries(node.props.children);
}
const cases = [
  ...ORGANIZATION_SOURCE_FIXTURES.map((fixture) => ({ fixture, name: 'primary' })),
  ...ORGANIZATION_RESOURCE_FIXTURES.map(({ fixture, name }) => ({ fixture, name })),
];
const modes = cases.flatMap(({ fixture, name }) =>
  (fixture.id === 'OP-31' ? ['diagram'] : ['diagram', 'hybrid']).map((mode) => ({
    fixture,
    name,
    mode,
  })),
);

describe('organization actual authored CPU scene proof (not GPU/native font raster)', () => {
  it.each(
    modes,
  )('$fixture.id $name $mode has complete fixed-font SVG pages, stable facts and zero/one existing stage', ({
    fixture,
    mode,
  }) => {
    const copy = structuredClone(fixture);
    copy.raw.visualMode = mode;
    const { scene, issues } = parseOrganizationFixture(copy);
    if (!scene) throw new Error(issues.join('; '));
    const pose = sampleOrganizationScene(scene, scene.resolveAt);
    const duration = organizationPageDuration(scene, pose.presentation.pages.length);
    expect(duration).toBeGreaterThanOrEqual(1.5);
    const seen: string[] = [];
    pose.presentation.pages.forEach((page, index) => {
      const at = organizationReadingStart(scene) + index * duration;
      for (const seconds of [at + 0.00001, at + 1.5 - 0.00001]) {
        const sampled = sampleOrganizationScene(scene, seconds);
        const svg = renderToStaticMarkup(
          createElement(
            'svg',
            null,
            createElement(OrganizationDiagramParts, { scene, pose: sampled }),
          ),
        );
        expect(sampled.opacity).toBe(1);
        if (mode === 'hybrid') expect(diagramPose(seconds, scene).diagramOpacity).toBe(1);
        expect(svg).toContain('font-size="24"');
        expect(svg).not.toMatch(/<canvas|<image|foreignObject|ellipsis|…/u);
        for (const id of organizationSemanticIds(scene)) expect(svg).toContain(id);
        for (const row of page.rows) {
          expect(svg).toContain(`data-fact-id="${row.id}"`);
          expect(svg).toContain(`data-state="${row.state}"`);
          for (const lines of organizationRowLines(row))
            for (const line of lines)
              expect(svg).toContain(
                renderToStaticMarkup(createElement('tspan', null, line)).slice(7, -8),
              );
          if (scene.preset === 'merge-identities')
            for (const record of scene.records.filter(
              (record) => row.id === `record:${record.identity.id}`,
            ))
              expect(svg).toContain(`data-source-id="${record.sourceId}"`);
        }
        expect(page.height).toBeLessThanOrEqual(
          ORGANIZATION_TABLE.rowBottom - ORGANIZATION_TABLE.rowTop,
        );
      }
      seen.push(...page.rows.map((row) => row.id));
    });
    expect(seen).toEqual(pose.presentation.rows.map((row) => row.id));
    const final = renderToStaticMarkup(createElement(OrganizationDiagramParts, { scene, pose }));
    expect(
      renderToStaticMarkup(
        createElement(OrganizationDiagramParts, {
          scene,
          pose: sampleOrganizationScene(scene, copy.window.endTime),
        }),
      ),
    ).toBe(final);
    expect(copy.window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
    harness.time = scene.resolveAt;
    const view = OrganizationSceneView({ scene });
    expect(view.type).toBe(HybridStage);
    if (!isValidElement<Parameters<typeof HybridStage>[0]>(view))
      throw new Error('Missing wrapper');
    expect(view.props.scene).toBe(scene);
    expect(view.props.settledOutcome).toBe(true);
    expect(boundaries(HybridStage(view.props))).toBe(mode === 'hybrid' ? 1 : 0);
    if (mode === 'diagram') {
      expect(view.props.model).toBeNull();
      expect(OrganizationModelParts({ scene, pose })).toBeNull();
    }
  });

  it.each(
    modes,
  )('$fixture.id $name $mode actual rounded/batched carriers stay finite, <=180 meshes and in the studio envelope', ({
    fixture,
    mode,
  }) => {
    const copy = structuredClone(fixture);
    copy.raw.visualMode = mode;
    const { scene, issues } = parseOrganizationFixture(copy);
    if (!scene) throw new Error(issues.join('; '));
    const critical = [
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
      copy.window.endTime,
    ];
    const firstFrame = Math.ceil(copy.window.startTime * 30);
    const frames = Array.from(
      { length: Math.floor(copy.window.endTime * 30) - firstFrame + 1 },
      (_, index) => (firstFrame + index) / 30,
    );
    const times = [...critical, ...frames, ...[...critical].reverse()];
    let initial: unknown[] | undefined;
    const geometry = geometryInspector();
    try {
      for (const seconds of times) {
        const pose = sampleOrganizationScene(scene, seconds);
        const tree = OrganizationModelParts({ scene, pose });
        const result = geometry.inspect(tree, diagramPose(pose.time, scene).modelTurn);
        expect(result.types.some((type) => /Canvas|Stage3D|HybridStage|Occupant/u.test(type))).toBe(
          false,
        );
        expect(result.meshes).toBeLessThanOrEqual(180);
        if (mode === 'diagram') {
          expect(result.meshes).toBe(0);
          continue;
        }
        expect(result.meshes).toBeGreaterThan(0);
        expect(result.materials).toBe(result.meshes);
        const epsilon = 0.000001;
        expect(result.box.min.x).toBeGreaterThanOrEqual(-3.4 - epsilon);
        expect(result.box.max.x).toBeLessThanOrEqual(3.4 + epsilon);
        expect(result.box.min.y).toBeGreaterThanOrEqual(-1.4 - epsilon);
        expect(result.box.max.y).toBeLessThanOrEqual(2.7 + epsilon);
        expect(result.box.min.z).toBeGreaterThanOrEqual(-2.6 - epsilon);
        expect(result.box.max.z).toBeLessThanOrEqual(1.8 + epsilon);
        if (!initial) initial = result.facts;
        expect(result.facts).toEqual(initial);
        expect(result.facts[0]).toMatchObject({
          semanticIds: organizationSemanticIds(scene),
          sourceFacts: pose.presentation.rows,
        });
        if (scene.preset === 'legacy-boundaries')
          expect(result.types).toContain('ProviderConnectorPanel');
        if (scene.preset === 'merge-identities') {
          expect(result.types).toContain('OperatingDesk');
          expect(result.facts).toContainEqual(
            expect.objectContaining({
              responsibleOwnerId: scene.owner.id,
              sourceIds: scene.records.map((record) => record.sourceId),
            }),
          );
        }
        if (scene.preset === 'decision-rights') expect(result.types).toContain('PermissionCard');
      }
    } finally {
      geometry.dispose();
    }
    expect(harness.cleanup).toHaveLength(0);
    expect(harness.geometries.size).toBe(0);
  });
});
