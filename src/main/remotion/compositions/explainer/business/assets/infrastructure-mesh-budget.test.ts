import { createElement, Fragment, isValidElement, type ReactElement } from 'react';
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  Object3D,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CoolingLoop,
  DataCenterRack,
  PowerReadinessSubstation,
  ProviderConnectorPanel,
} from './infrastructure';
import { INFRASTRUCTURE_ASSET_BOUNDS, INFRASTRUCTURE_ASSET_BUDGETS } from './infrastructure-poses';

// Hook-compatible CPU JSX expansion, not a React/WebGL renderer. Capture authored
// effects so their owned BufferGeometry disposal can be asserted explicitly.
const effects = vi.hoisted(() => ({ cleanups: [] as (() => void)[] }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (setup: () => (() => void) | undefined) => {
    const cleanup = setup();
    if (cleanup) effects.cleanups.push(cleanup);
  },
}));
vi.mock('../../stage', async (original) => {
  const actual = await original<typeof import('../../stage')>();
  return { ...actual, useStage: () => actual.STAGE };
});
vi.mock('../../hero-kit', () => ({
  Clay: (props: Record<string, unknown>) => createElement('meshPhysicalMaterial', props),
}));
vi.mock('../../explanation-kit', () => ({
  // One actual JSX mesh per ClayBlock. Box geometry is a conservative bounds proxy
  // for the rounded solid; position/rotation are preserved, including the open blade.
  ClayBlock: ({ size, position, rotation }: Record<string, unknown>) =>
    createElement('mesh', { position, rotation }, createElement('boxGeometry', { args: size })),
}));

type Props = Record<string, unknown>;
type Element = ReactElement<Props>;
const cpuGeometry = new Set<BufferGeometry>();
afterEach(() => {
  for (const cleanup of effects.cleanups.splice(0)) cleanup();
  for (const geometry of cpuGeometry) geometry.dispose();
  cpuGeometry.clear();
});

function visit(node: unknown, callback: (element: Element) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) visit(child, callback);
    return;
  }
  if (!isValidElement<Props>(node)) return;
  if (node.type === Fragment) {
    visit(node.props.children, callback);
    return;
  }
  if (typeof node.type === 'function') {
    visit(Reflect.apply(node.type, undefined, [node.props]), callback);
    return;
  }
  if (typeof node.type !== 'string') throw new Error('Unsupported JSX component');
  callback(node);
  visit(node.props.children, callback);
}

function elements(node: unknown): Element[] {
  const result: Element[] = [];
  visit(node, (element) => result.push(element));
  return result;
}

/** Count mounted pieces irrespective of opacity, scale or visibility. */
function meshCount(node: unknown): number {
  let count = 0;
  visit(node, ({ type, props }) => {
    if (type === 'mesh' || type === 'instancedMesh' || type === 'skinnedMesh') count++;
    if (type === 'primitive') {
      if (!(props.object instanceof Object3D)) throw new Error('Unaccounted primitive');
      props.object.traverse((object) => {
        if (object instanceof Mesh) count++;
      });
    }
  });
  return count;
}

const constructors: Record<string, new (...args: never[]) => BufferGeometry> = {
  boxGeometry: BoxGeometry,
  cylinderGeometry: CylinderGeometry,
  sphereGeometry: SphereGeometry,
  torusGeometry: TorusGeometry,
};

/** CPU extents of actual batches/intrinsics plus conservative ClayBlock box proxies. */
function hierarchy(element: unknown): Group {
  const root = new Group();
  const expand = (node: unknown, parent: Object3D): void => {
    if (Array.isArray(node)) {
      for (const child of node) expand(child, parent);
      return;
    }
    if (!isValidElement<Props>(node)) return;
    const { type, props } = node;
    if (type === Fragment) {
      expand(props.children, parent);
      return;
    }
    if (typeof type === 'function') {
      expand(Reflect.apply(type, undefined, [props]), parent);
      return;
    }
    if (type === 'mesh' || type === 'group') {
      const geometry = props.geometry instanceof BufferGeometry ? props.geometry : undefined;
      const object = type === 'mesh' ? new Mesh(geometry) : new Group();
      if (object instanceof Mesh && !geometry) cpuGeometry.add(object.geometry);
      object.name = typeof props.name === 'string' ? props.name : '';
      if (Array.isArray(props.position)) object.position.fromArray(props.position);
      if (Array.isArray(props.rotation))
        object.rotation.set(props.rotation[0], props.rotation[1], props.rotation[2]);
      if (Array.isArray(props.scale)) object.scale.fromArray(props.scale);
      else if (typeof props.scale === 'number') object.scale.setScalar(props.scale);
      if (typeof props.visible === 'boolean') object.visible = props.visible;
      parent.add(object);
      expand(props.children, object);
      return;
    }
    // Counts explicitly support these types; bounds must fail rather than silently
    // omitting a future instance matrix or prebuilt hierarchy not handled here.
    if (type === 'primitive' || type === 'instancedMesh' || type === 'skinnedMesh') {
      throw new Error(`Unsupported bounds type: ${String(type)}`);
    }
    const Constructor = typeof type === 'string' ? constructors[type] : undefined;
    if (Constructor) {
      if (!(parent instanceof Mesh)) throw new Error('Geometry without a mesh');
      const geometry = new Constructor(...(props.args as never[]));
      cpuGeometry.add(geometry);
      parent.geometry = geometry;
    } else if (typeof type === 'string' && type.endsWith('Geometry')) {
      throw new Error(`Unaccounted geometry: ${type}`);
    }
    expand(props.children, parent);
  };
  expand(element, root);
  root.updateMatrixWorld(true);
  return root;
}

function withinEnvelope(id: keyof typeof INFRASTRUCTURE_ASSET_BOUNDS, element: unknown): void {
  const actual = new Box3().setFromObject(hierarchy(element), true);
  const envelope = INFRASTRUCTURE_ASSET_BOUNDS[id];
  expect(actual.isEmpty()).toBe(false);
  for (const axis of ['x', 'y', 'z'] as const) {
    const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    expect(Number.isFinite(actual.min[axis])).toBe(true);
    expect(Number.isFinite(actual.max[axis])).toBe(true);
    expect(actual.min[axis]).toBeGreaterThanOrEqual(envelope.min[index]);
    expect(actual.max[axis]).toBeLessThanOrEqual(envelope.max[index]);
  }
}

function named(list: Element[], name: string): Element {
  const result = list.find((element) => element.props.name === name);
  if (!result) throw new Error(`Missing authored piece: ${name}`);
  return result;
}

describe('infrastructure actual JSX mesh ceilings (CPU only)', () => {
  it('A-13 counts all eight meshes even when the illustrative markers are hidden', () => {
    for (const activity of [0, 0.5, 1, -1, 2, NaN, Infinity, -Infinity]) {
      const element = createElement(DataCenterRack, { activity });
      expect(meshCount(element)).toBe(8);
      expect(meshCount(element)).toBeLessThanOrEqual(INFRASTRUCTURE_ASSET_BUDGETS['A-13']);
      withinEnvelope('A-13', element);
    }
    const list = elements(createElement(DataCenterRack, { activity: 0 }));
    const marker = named(list, 'rack-emphasis');
    expect(elements(marker.props.children)[0]?.props.opacity).toBe(0);
    const trays = named(list, 'server-trays').props.geometry;
    expect(trays).toBeInstanceOf(BufferGeometry);
    expect((trays as BufferGeometry).getAttribute('position').count).toBe(6 * 36);
  });

  it('A-14 counts nineteen meshes in both source-stated readiness states, including the open blade', () => {
    for (const ready of [false, true]) {
      const element = createElement(PowerReadinessSubstation, { ready });
      expect(meshCount(element)).toBe(19);
      expect(meshCount(element)).toBeLessThanOrEqual(INFRASTRUCTURE_ASSET_BUDGETS['A-14']);
      withinEnvelope('A-14', element);
      const list = elements(element);
      expect(named(list, 'readiness-disconnect').props.rotation).toEqual([
        0,
        0,
        ready ? 0 : -Math.PI / 4,
      ]);
      expect(list.filter((piece) => piece.props.name === 'transformer-bushing')).toHaveLength(2);
    }
  });

  it('A-15 counts nineteen meshes in both declared states without moving the fan or pipes', () => {
    for (const active of [false, true]) {
      const element = createElement(CoolingLoop, { active });
      expect(meshCount(element)).toBe(19);
      expect(meshCount(element)).toBeLessThanOrEqual(INFRASTRUCTURE_ASSET_BUDGETS['A-15']);
      withinEnvelope('A-15', element);
      const list = elements(element);
      expect(named(list, 'fixed-fan-face').props.rotation).toEqual([Math.PI / 2, 0, 0]);
      expect(list.filter((piece) => piece.props.name === 'pipe-coupling')).toHaveLength(4);
      expect(list.filter((piece) => piece.props.name === 'loop-vertical-pipe')).toHaveLength(2);
      expect(list.filter((piece) => piece.props.name === 'loop-horizontal-pipe')).toHaveLength(2);
    }
  });

  it('A-16 counts thirteen meshes at both states and progress 0/.5/1; false never seats the plugs', () => {
    for (const connected of [false, true]) {
      for (const progress of [0, 0.5, 1, -1, 2, NaN, Infinity, -Infinity]) {
        const element = createElement(ProviderConnectorPanel, { connected, progress });
        expect(meshCount(element)).toBe(13);
        expect(meshCount(element)).toBeLessThanOrEqual(INFRASTRUCTURE_ASSET_BUDGETS['A-16']);
        withinEnvelope('A-16', element);
        const list = elements(element);
        const bounded = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
        expect(named(list, 'provider-plugs').props.position).toEqual([
          0,
          0,
          connected ? 0.65 * (1 - bounded) : 0.65,
        ]);
        const plugs = named(list, 'provider-plug-bodies').props.geometry;
        expect((plugs as BufferGeometry).getAttribute('position').count).toBe(4 * 36);
      }
    }
  });

  it('explicitly counts hidden, instanced, skinned and prebuilt meshes rather than treating them as zero', () => {
    const geometry = new BoxGeometry();
    cpuGeometry.add(geometry);
    const prebuilt = new Group();
    const hidden = new Mesh(geometry);
    hidden.visible = false;
    prebuilt.add(hidden, new Mesh(geometry));
    expect(meshCount(createElement('primitive', { object: prebuilt }))).toBe(2);
    expect(meshCount(createElement('instancedMesh', { args: [undefined, undefined, 20] }))).toBe(1);
    expect(meshCount(createElement('skinnedMesh'))).toBe(1);
    expect(meshCount(createElement('mesh', { visible: false, scale: 0 }))).toBe(1);
    expect(() => meshCount(createElement('primitive', { object: {} }))).toThrow(
      'Unaccounted primitive',
    );
  });

  it('builds finite real batch buffers and invokes each owner cleanup exactly once', () => {
    const list = elements([
      createElement(DataCenterRack, { activity: 0 }),
      createElement(PowerReadinessSubstation, { ready: false }),
      createElement(CoolingLoop, { active: false }),
      createElement(ProviderConnectorPanel, { connected: false, progress: 0 }),
    ]);
    const geometries = list
      .filter(
        (element) => element.type === 'mesh' && element.props.geometry instanceof BufferGeometry,
      )
      .map((element) => element.props.geometry as BufferGeometry);
    // Rack 3 + substation 1 + cooling 2 + panel 7, each one authored mesh.
    expect(geometries).toHaveLength(13);
    expect(new Set(geometries).size).toBe(13);
    expect(effects.cleanups).toHaveLength(13);
    for (const geometry of geometries) {
      const positions = geometry.getAttribute('position');
      const normals = geometry.getAttribute('normal');
      expect(positions.count).toBeGreaterThan(0);
      expect(positions.count % 36).toBe(0);
      expect(normals.count).toBe(positions.count);
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      expect(Array.from(normals.array).every(Number.isFinite)).toBe(true);
    }
    const disposal = geometries.map((geometry) => vi.spyOn(geometry, 'dispose'));
    for (const cleanup of effects.cleanups.splice(0)) cleanup();
    for (const spy of disposal) expect(spy).toHaveBeenCalledTimes(1);
  });
});
