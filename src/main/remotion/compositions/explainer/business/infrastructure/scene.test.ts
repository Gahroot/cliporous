import { createElement, Fragment, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
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
import { getLongformLayout } from '../../../../../../shared/longform-layout';
import {
  parseCapacityMapScene,
  parseOperatingLineageScene,
} from '../../../../../ai/explainer/business-infrastructure-contract';
import type { Rec } from '../../../../../ai/explainer/kind-spec';
import { DiagramChrome } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { diagramPose } from '../../diagrams/motion';
import { EXPLANATION_CAMERA } from '../../explanation-layout';
import { Stage3D } from '../../Stage3D';
import { businessRecipe } from '../catalog';
import { businessTextWidth } from '../text-width';
import {
  INFRASTRUCTURE_ADDITIONAL_SOURCE_FIXTURES,
  INFRASTRUCTURE_NO_NATIVE_SOURCE_FIXTURES,
  INFRASTRUCTURE_SOURCE_FIXTURES,
  type InfrastructureSourceFixture,
  infrastructureSourceContext,
  infrastructureSourceWindow,
} from './fixtures';
import { InfrastructureDiagramParts, InfrastructureModelParts } from './parts';
import { infrastructureAssets, infrastructureKey, sampleInfrastructure } from './poses';
import {
  infrastructureDetailWindows,
  infrastructureIdentities,
  infrastructureLines,
  infrastructureRows,
  INFRASTRUCTURE_RAIL as T,
} from './presentation';
import { InfrastructureSceneView } from './Scene';
import type { InfrastructureScene } from './types';

const harness = vi.hoisted(() => ({
  time: 0,
  cleanup: [] as (() => void)[],
  geometries: new Map<string, import('three').BufferGeometry>(),
}));
// Real rounded solids, cached only within a single fixture. No simplified asset/box stubs.
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
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => (() => void) | undefined) => {
    const cleanup = effect();
    if (cleanup) harness.cleanup.push(cleanup);
  },
}));
vi.mock('../../stage', async (original) => {
  const actual = await original<typeof import('../../stage')>();
  return {
    ...actual,
    useStage: () => actual.STAGE,
    useSceneTime: () => ({ t: harness.time }),
    useWideStage: () => undefined,
  };
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
    throw new Error('Non-finite actual geometry arguments');
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
  if (type === 'coneGeometry') return new ConeGeometry(...args);
  if (type === 'sphereGeometry') return new SphereGeometry(...args);
  if (type === 'capsuleGeometry') return new CapsuleGeometry(...args);
  if (type === 'torusGeometry') return new TorusGeometry(...args);
  throw new Error(`Unknown/opaque geometry ${type}`);
}
function inspector() {
  const owned = new Set<BufferGeometry>(),
    corners = new Map<BufferGeometry, Vector3[]>();
  const aspects = [
    1080 / 960,
    ...(['speaker-side', 'speaker-pip', 'full-frame'] as const).map((presentation) => {
      const { model } = getLongformLayout(presentation);
      return model.width / model.height;
    }),
  ];
  const cameras = aspects.map((aspect) => {
    const camera = new PerspectiveCamera(EXPLANATION_CAMERA.fov, aspect, 0.1, 100);
    camera.position.set(...EXPLANATION_CAMERA.position);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    return camera;
  });
  function local(geometry: BufferGeometry): Vector3[] {
    const prior = corners.get(geometry);
    if (prior) return prior;
    owned.add(geometry);
    const position = geometry.getAttribute('position');
    if (!position || position.itemSize !== 3 || !position.count)
      throw new Error('Opaque geometry without explicit real position buffer');
    expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
    const index = geometry.getIndex();
    if (index)
      expect(
        Array.from(index.array).every((v) => Number.isInteger(v) && v >= 0 && v < position.count),
      ).toBe(true);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds || bounds.isEmpty()) throw new Error('Missing real geometry bounds');
    expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)).toBe(true);
    const result = [bounds.min.x, bounds.max.x].flatMap((x) =>
      [bounds.min.y, bounds.max.y].flatMap((y) =>
        [bounds.min.z, bounds.max.z].map((z) => new Vector3(x, y, z)),
      ),
    );
    corners.set(geometry, result);
    return result;
  }
  function inspect(root: ReactNode, angle: number) {
    const box = new Box3(),
      turn = new Matrix4().makeRotationY(angle),
      facts: unknown[] = [],
      names: string[] = [],
      types: string[] = [],
      calls: { type: string; props: Props }[] = [];
    let meshes = 0,
      materials = 0,
      instances = 0,
      batches = 0,
      rounded = 0;
    const projected = cameras.map(() => ({ x: 0, y: 0 }));
    function include(geometry: BufferGeometry, matrix: Matrix4) {
      if (!(geometry instanceof BufferGeometry)) throw new Error('Opaque non-buffer geometry');
      instances++;
      if (
        [...harness.geometries.entries()].some(
          ([key, value]) => key.startsWith('RoundedBoxGeometry:') && value === geometry,
        )
      )
        rounded++;
      for (const corner of local(geometry)) {
        const world = corner.clone().applyMatrix4(matrix).applyMatrix4(turn);
        if (!world.toArray().every(Number.isFinite)) throw new Error('Non-finite frame geometry');
        box.expandByPoint(world);
        cameras.forEach((camera, index) => {
          const p = world.clone().project(camera);
          if (!p.toArray().every(Number.isFinite)) throw new Error('Non-finite projected geometry');
          projected[index].x = Math.max(projected[index].x, Math.abs(p.x));
          projected[index].y = Math.max(projected[index].y, Math.abs(p.y));
        });
      }
    }
    function walk(node: ReactNode, parent: Matrix4) {
      if (Array.isArray(node)) {
        for (const child of node) walk(child, parent);
        return;
      }
      if (!isValidElement<Props>(node)) return;
      if (node.type === Fragment) {
        walk(node.props.children, parent);
        return;
      }
      if (typeof node.type === 'function') {
        types.push(node.type.name);
        calls.push({ type: node.type.name, props: node.props });
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
        const before = instances;
        if (type === 'mesh') meshes++;
        if (props.geometry) {
          if (type !== 'mesh') throw new Error('Unowned batch geometry');
          if (
            props.name &&
            [
              'server-trays',
              'rack-vents-and-handles',
              'rack-emphasis',
              'provider-sockets',
              'provider-plug-bodies',
              'provider-cable-sleeves',
              'heat-exchanger-fins',
              'fixed-fan-blades',
              'transformer-radiator',
            ].includes(props.name)
          )
            batches++;
          include(props.geometry, world);
        }
        walk(props.children, world);
        if (type === 'mesh' && instances - before !== 1)
          throw new Error('Every mesh must have exactly one accounted real geometry');
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
    for (const p of projected) {
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeLessThanOrEqual(1);
    }
    return { box, meshes, materials, batches, rounded, facts, names, types, calls };
  }
  function dispose() {
    try {
      for (const cleanup of harness.cleanup.splice(0)) cleanup();
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
function parsed(
  fixture: InfrastructureSourceFixture,
  mode: 'diagram' | 'hybrid',
): InfrastructureScene {
  const raw: Rec = { ...fixture.raw, visualMode: mode },
    ctx = infrastructureSourceContext(fixture);
  const scene =
    raw.kind === 'capacity-map'
      ? parseCapacityMapScene(raw, ctx)
      : parseOperatingLineageScene(raw, ctx);
  if (!scene) throw new Error(`${fixture.fixtureId}: ${ctx.issues.join('; ')}`);
  expect(ctx.issues).toEqual([]);
  return scene;
}
function boundaries(node: ReactNode): number {
  if (Array.isArray(node)) return node.reduce<number>((sum, child) => sum + boundaries(child), 0);
  if (!isValidElement<{ children?: ReactNode }>(node)) return 0;
  return (node.type === Stage3D ? 1 : 0) + boundaries(node.props.children);
}
function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  return isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : '';
}
function native(node: ReactNode, result: { type: string; props: Record<string, unknown> }[] = []) {
  if (Array.isArray(node)) {
    for (const child of node) native(child, result);
    return result;
  }
  if (!isValidElement<Record<string, unknown>>(node)) return result;
  if (node.type === Fragment) {
    native(node.props.children as ReactNode, result);
    return result;
  }
  if (typeof node.type === 'function') {
    native(Reflect.apply(node.type, undefined, [node.props]) as ReactNode, result);
    return result;
  }
  result.push({ type: String(node.type), props: node.props });
  native(node.props.children as ReactNode, result);
  return result;
}
function svg(scene: InfrastructureScene, seconds: number) {
  return renderToStaticMarkup(
    createElement('svg', null, createElement(InfrastructureDiagramParts, { scene, seconds })),
  );
}
const fixtures = [...INFRASTRUCTURE_SOURCE_FIXTURES, ...INFRASTRUCTURE_ADDITIONAL_SOURCE_FIXTURES];
const modes = fixtures.flatMap((fixture) =>
  (fixture.id === 'OP-71' ? (['diagram'] as const) : (['diagram', 'hybrid'] as const)).map(
    (mode) => ({ fixture, mode, name: `${fixture.fixtureId}:${mode}` }),
  ),
);

describe('infrastructure actual factual JSX + CPU geometry (not native GPU/resource proof)', () => {
  it.each(
    modes,
  )('$name renders every full fixed-font page for >=1.5s after actual handoff and settles source outcome/facts', ({
    fixture,
    mode,
  }) => {
    const scene = parsed(fixture, mode),
      before = structuredClone(scene),
      windows = infrastructureDetailWindows(scene);
    const seen: string[] = [];
    for (const window of windows) {
      expect(window.end - window.start).toBeGreaterThanOrEqual(1.5);
      for (const seconds of [window.start, (window.start + window.end) / 2, window.end - 1e-8]) {
        const pose = diagramPose(seconds, scene),
          root = InfrastructureDiagramParts({ scene, seconds }),
          nodes = native(root),
          markup = svg(scene, seconds);
        if (!isValidElement<Record<string, unknown>>(root))
          throw new Error('Missing factual SVG root');
        expect(pose.setup).toBe(1);
        if (mode === 'hybrid') expect(pose.diagramOpacity).toBe(1);
        expect(root.props.opacity).toBe(1);
        expect(root.props['data-page']).toBe(window.index);
        expect(markup).toContain('font-size="24"');
        expect(markup).not.toMatch(/<canvas|<image|<foreignObject|ellipsis|…|https?:|<script/iu);
        const factNodes = nodes.filter((node) => node.props['data-fact-id']);
        expect(factNodes).toHaveLength(window.page.rows.length);
        window.page.rows.forEach((row, index) => {
          expect(factNodes[index].props['data-fact-id']).toBe(
            infrastructureKey(scene, 'fact', row.id),
          );
          expect(factNodes[index].props['data-state']).toBe(row.state);
          expect(
            text(factNodes[index].props.children as ReactNode)
              .replace(/\s+/gu, ' ')
              .trim(),
          ).toBe(`${row.label} · ${row.state} ${row.text}`.trim().replace(/\s+/gu, ' '));
          for (const line of [
            ...infrastructureLines(`${row.label} · ${row.state}`),
            ...infrastructureLines(row.text),
          ])
            expect(businessTextWidth(line, 24)).toBeLessThanOrEqual(T.width - 2 * T.padding);
        });
        for (const node of nodes.filter(
          (node) => node.type === 'text' && typeof node.props.y === 'number' && node.props.y >= 140,
        )) {
          expect(Number(node.props.y)).toBeLessThanOrEqual(T.height - T.padding);
          expect(node.props.fontSize).toBeUndefined();
        }
        expect(
          nodes.filter((node) => node.props.fontSize).every((node) => node.props.fontSize === 24),
        ).toBe(true);
        expect(nodes.some((node) => node.props['data-resolve-state'])).toBe(false);
      }
      seen.push(...window.page.rows.map((row) => row.id));
    }
    expect(seen).toEqual(infrastructureRows(scene).map((row) => row.id));
    const end = infrastructureSourceWindow(fixture).endTime;
    expect(end - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
    for (let seconds = scene.resolveAt; seconds <= end; seconds += 1 / 30)
      expect(svg(scene, seconds)).toBe(svg(scene, scene.resolveAt));
    expect(svg(scene, end)).toBe(svg(scene, scene.resolveAt));
    harness.time = scene.resolveAt;
    const view = InfrastructureSceneView({ scene });
    if (!isValidElement<Parameters<typeof HybridStage>[0]>(view))
      throw new Error('Missing shared wrapper');
    expect(view.type).toBe(HybridStage);
    expect(view.props.scene).toBe(scene);
    expect(view.props.settledOutcome).toBe(true);
    expect(boundaries(HybridStage(view.props))).toBe(mode === 'hybrid' ? 1 : 0);
    if (mode === 'diagram') {
      expect(view.props.model).toBeNull();
      expect(InfrastructureModelParts({ scene, seconds: scene.resolveAt })).toBeNull();
    }
    const chrome = renderToStaticMarkup(
      createElement(DiagramChrome, { scene, settledOutcome: true }),
    );
    expect(chrome.replace(/<[^>]+>/gu, '').replace(/\s/gu, '')).toContain(
      scene.outcome.replace(/\s/gu, ''),
    );
    expect(chrome).not.toContain('opacity:0');
    harness.time = end;
    expect(
      renderToStaticMarkup(createElement(DiagramChrome, { scene, settledOutcome: true })),
    ).toBe(chrome);
    expect(scene).toEqual(before);
  });
  it.each(
    modes,
  )('$name has exact catalog/source carriers, independent gates, all 30fps/critical/backward/handoff geometry <=180 and locked bounds', ({
    fixture,
    mode,
  }) => {
    const scene = parsed(fixture, mode),
      before = structuredClone(scene),
      win = infrastructureSourceWindow(fixture),
      geometry = inspector();
    const first = Math.ceil(win.startTime * 30),
      frames = Array.from(
        { length: Math.floor(win.endTime * 30) - first + 1 },
        (_, i) => (first + i) / 30,
      );
    const critical = [
      win.startTime,
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.responseAt + 0.35,
      scene.responseAt + 0.7,
      scene.checkAt,
      scene.resolveAt,
      win.endTime,
    ];
    const snapshots = new Map<number, { bounds: number[]; names: string[]; facts: unknown[] }>();
    try {
      for (const seconds of [...critical, ...frames, ...critical.slice().reverse(), ...critical]) {
        const result = geometry.inspect(
          createElement(InfrastructureModelParts, { scene, seconds }),
          diagramPose(seconds, scene).modelTurn,
        );
        expect(result.types).not.toContain('Stage3D');
        expect(result.types).not.toContain('Canvas');
        if (mode === 'diagram') {
          expect(result.meshes).toBe(0);
          continue;
        }
        expect(result.meshes).toBeGreaterThan(0);
        expect(result.meshes).toBeLessThanOrEqual(180);
        expect(result.materials).toBe(result.meshes);
        expect(result.rounded).toBeGreaterThan(0);
        expect(result.box.min.x).toBeGreaterThanOrEqual(-3.4);
        expect(result.box.max.x).toBeLessThanOrEqual(3.4);
        expect(result.box.min.y).toBeGreaterThanOrEqual(-1.4);
        expect(result.box.max.y).toBeLessThanOrEqual(2.7);
        expect(result.box.min.z).toBeGreaterThanOrEqual(-2.6);
        expect(result.box.max.z).toBeLessThanOrEqual(1.8);
        const carriers = result.facts.filter(
          (fact): fact is Record<string, unknown> =>
            typeof fact === 'object' && fact !== null && 'sourceIdentityId' in fact,
        );
        expect(carriers.map((carrier) => carrier.sourceIdentityId)).toEqual(
          infrastructureIdentities(scene).map((identity) => identity.id),
        );
        const assets = carriers.flatMap((carrier) => (carrier.asset ? [carrier.asset] : [])).sort();
        expect(assets).toEqual(
          infrastructureAssets(scene)
            .map((asset) => asset.asset)
            .sort(),
        );
        expect(assets).toEqual(
          [...(businessRecipe(scene.kind, scene.preset)?.assets ?? [])].sort(),
        );
        if (assets.some((asset) => ['A-13', 'A-14', 'A-15', 'A-16'].includes(String(asset))))
          expect(result.batches).toBeGreaterThan(0);
        for (const identity of infrastructureIdentities(scene))
          expect(result.names).toContain(infrastructureKey(scene, 'identity', identity.id));
        for (const call of result.calls) {
          const props = call.props as unknown as Record<string, unknown>;
          if (call.type === 'DataCenterRack') expect(props.activity).toBe(0);
          if (call.type === 'PowerReadinessSubstation')
            expect(props.ready).toBe(
              scene.preset === 'physical-readiness' && scene.powerReady.state === 'source-stated',
            );
          if (call.type === 'CoolingLoop')
            expect(props.active).toBe(
              (scene.preset === 'physical-readiness' &&
                scene.coolingReady.state === 'source-stated') ||
                (scene.preset === 'resource-states' &&
                  scene.coolingReady.state === 'source-stated'),
            );
          if (call.type === 'ProviderConnectorPanel') {
            expect(props.connected).toBe(
              scene.preset === 'provider-transition' && scene.transition.state === 'completed',
            );
            if (props.connected !== true) expect(props.progress).toBe(0);
          }
          if (call.type === 'Occupant')
            throw new Error('Infrastructure cannot fabricate a human operator');
        }
        if (scene.preset === 'versioned-provenance')
          expect(result.calls.filter((call) => call.type === 'ProvenanceLink')).toHaveLength(
            scene.edges.filter((edge) => edge.state === 'source-stated').length,
          );
        const snapshot = {
          bounds: [...result.box.min.toArray(), ...result.box.max.toArray()],
          names: result.names,
          facts: result.facts,
        };
        if (snapshots.has(seconds)) expect(snapshot).toEqual(snapshots.get(seconds));
        else snapshots.set(seconds, snapshot);
      }
    } finally {
      geometry.dispose();
    }
    expect(harness.geometries.size).toBe(0);
    expect(harness.cleanup).toHaveLength(0);
    expect(scene).toEqual(before);
  });
  it('fails closed on unknown/opaque/no/duplicate/nonfinite geometry, never counts an unaccounted mesh as zero', () => {
    const geometry = inspector(),
      empty = new BufferGeometry();
    try {
      for (const type of ['primitive', 'instancedMesh', 'futureGeometry'])
        expect(() => geometry.inspect(createElement(type), 0)).toThrow();
      expect(() => geometry.inspect(createElement('mesh'), 0)).toThrow();
      expect(() => geometry.inspect(createElement('mesh', { geometry: empty }), 0)).toThrow();
      expect(() =>
        geometry.inspect(
          createElement(
            'mesh',
            null,
            createElement('boxGeometry', { args: [1, 1, 1] }),
            createElement('boxGeometry', { args: [1, 1, 1] }),
          ),
          0,
        ),
      ).toThrow();
      expect(() =>
        geometry.inspect(
          createElement('mesh', null, createElement('boxGeometry', { args: [NaN, 1, 1] })),
          0,
        ),
      ).toThrow();
    } finally {
      geometry.dispose();
      empty.dispose();
    }
  });
  it('known conditional capacity keeps full amount/unit/period/population/denominator/condition without observed fill or operation', () => {
    const fixture = fixtures.find((f) => f.fixtureId === 'OP-35:conditional');
    if (!fixture) throw new Error('Missing source-built conditional amount');
    const scene = parsed(fixture, 'hybrid');
    if (scene.preset !== 'installed-used-reserved') throw new Error('Missing capacity');
    const nodes = native(InfrastructureDiagramParts({ scene, seconds: scene.resolveAt }));
    expect(nodes.find((node) => node.props['data-allocation'] === 'used')?.props).toMatchObject({
      'data-state': 'conditional',
      'data-source-value': 4,
      width: 0,
    });
    expect(scene.used.basis?.population).toBe('jobs');
    expect(scene.used.basis?.denominator).toBe(10);
    expect(scene.used.basis?.period).toBe('June');
    expect(infrastructureRows(scene).find((row) => row.id === 'used')?.text).toBe(scene.used.text);
    expect(scene.used.text).toContain(
      'If power arrives, Rack may report used capacity of 4 jobs during June per 10 jobs',
    );
    expect(sampleInfrastructure(scene, scene.resolveAt).clamp.gate).toBe(0);
  });
});

describe('native source boundary null rendering', () => {
  it.each(
    INFRASTRUCTURE_NO_NATIVE_SOURCE_FIXTURES,
  )('$id accepted actual diagram/null has no model meshes, fallback assets or nested stage', (fixture) => {
    const scene = parsed(fixture, 'diagram'),
      before = structuredClone(scene),
      geometry = inspector();
    expect(scene.modelSource).toBeNull();
    expect(infrastructureAssets(scene)).toEqual([]);
    try {
      const win = infrastructureSourceWindow(fixture);
      const times = [
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
        win.endTime,
        ...Array.from({ length: Math.ceil((win.endTime - win.startTime) * 30) + 1 }, (_, i) =>
          Math.min(win.endTime, win.startTime + i / 30),
        ),
      ];
      for (const seconds of [...times, ...times.slice().reverse()]) {
        const root = InfrastructureModelParts({ scene, seconds });
        expect(root).toBeNull();
        const result = geometry.inspect(
          createElement(InfrastructureModelParts, { scene, seconds }),
          0,
        );
        expect(result.meshes).toBe(0);
        expect(result.materials).toBe(0);
        expect(result.names).toEqual([]);
        expect(result.types).not.toContain('Canvas');
        expect(result.types).not.toContain('Stage3D');
        expect(result.types).not.toContain('FoldedDocument');
        harness.time = seconds;
        const view = InfrastructureSceneView({ scene });
        if (!isValidElement<Parameters<typeof HybridStage>[0]>(view))
          throw new Error('Missing shared wrapper');
        expect(view.props.model).toBeNull();
        expect(boundaries(HybridStage(view.props))).toBe(0);
      }
    } finally {
      geometry.dispose();
    }
    expect(harness.geometries.size).toBe(0);
    expect(harness.cleanup).toHaveLength(0);
    expect(scene).toEqual(before);
  });
});
