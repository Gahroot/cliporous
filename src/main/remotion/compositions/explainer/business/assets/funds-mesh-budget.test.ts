import { createElement, Fragment, isValidElement } from 'react';
import {
  Box3,
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  TorusGeometry,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  CommitmentFolio,
  DistributionTierTrays,
  EconomicRightsLayers,
  MaturityLadder,
} from './funds';
import {
  FUNDS_ASSET_BOUNDS,
  FUNDS_ASSET_BUDGETS,
  FUNDS_ASSET_IDS,
  type FundsAssetId,
} from './funds-poses';

vi.mock('../../stage', async (original) => {
  const actual = await original<typeof import('../../stage')>();
  return { ...actual, useStage: () => actual.STAGE };
});
vi.mock('../../hero-kit', () => ({ Clay: () => null }));
vi.mock('../../explanation-kit', () => ({
  // The real rounded ClayBlock is one mesh inside these nominal box dimensions.
  ClayBlock: ({
    size,
    position,
    rotation,
  }: Parameters<typeof import('../../explanation-kit').ClayBlock>[0]) =>
    createElement('mesh', { position, rotation }, createElement('boxGeometry', { args: size })),
}));

type Point = readonly [number, number, number];
interface NodeProps {
  children?: unknown;
  name?: string;
  position?: Point;
  rotation?: Point;
  quaternion?: Quaternion;
  scale?: number | Point;
  visible?: boolean;
  args?: readonly number[];
  geometry?: unknown;
}
interface Measurement {
  meshes: number;
  bounds: Box3;
  groups: Map<string, NodeProps>;
}

function transform(props: NodeProps): Matrix4 {
  const position = props.position ?? [0, 0, 0];
  const rotation = props.rotation ?? [0, 0, 0];
  const scale =
    typeof props.scale === 'number'
      ? [props.scale, props.scale, props.scale]
      : (props.scale ?? [1, 1, 1]);
  const orientation = props.quaternion ?? new Quaternion().setFromEuler(new Euler(...rotation));
  return new Matrix4().compose(new Vector3(...position), orientation, new Vector3(...scale));
}

function geometry(type: string, args: readonly number[]): BufferGeometry {
  const lengths: Record<string, number> = { boxGeometry: 3, cylinderGeometry: 4, torusGeometry: 4 };
  if (args.length !== lengths[type] || !args.every(Number.isFinite)) {
    throw new Error(`Unaccounted geometry: ${type}`);
  }
  switch (type) {
    case 'boxGeometry':
      return new BoxGeometry(args[0], args[1], args[2]);
    case 'cylinderGeometry':
      return new CylinderGeometry(args[0], args[1], args[2], args[3]);
    case 'torusGeometry':
      return new TorusGeometry(args[0], args[1], args[2], args[3]);
    default:
      throw new Error(`Unaccounted geometry: ${type}`);
  }
}

/** Expands the actual JSX tree on CPU. Hidden/zero-scale meshes still count as mounted. */
function measure(node: unknown): Measurement {
  const result: Measurement = { meshes: 0, bounds: new Box3(), groups: new Map() };
  function walk(child: unknown, parent: Matrix4, meshParent = false): void {
    if (Array.isArray(child)) {
      for (const item of child) walk(item, parent, meshParent);
      return;
    }
    if (child === null || child === undefined || typeof child === 'boolean') return;
    if (!isValidElement<NodeProps>(child)) throw new Error('Unaccounted non-element model part');
    if (child.type === Fragment) {
      walk(child.props.children, parent, meshParent);
      return;
    }
    if (typeof child.type === 'function') {
      walk(Reflect.apply(child.type, undefined, [child.props]), parent, meshParent);
      return;
    }
    if (child.type === 'mesh' || child.type === 'group') {
      if (child.props.geometry !== undefined) throw new Error('Unaccounted supplied geometry');
      if (child.type === 'mesh') result.meshes++;
      if (child.type === 'group' && child.props.name)
        result.groups.set(child.props.name, child.props);
      const world = parent.clone().multiply(transform(child.props));
      walk(child.props.children, world, child.type === 'mesh');
      return;
    }
    if (['boxGeometry', 'cylinderGeometry', 'torusGeometry'].includes(String(child.type))) {
      if (!meshParent) throw new Error('Geometry without a mesh');
      const shape = geometry(String(child.type), child.props.args ?? []);
      try {
        shape.computeBoundingBox();
        if (!shape.boundingBox) throw new Error('Missing authored bounds');
        result.bounds.union(shape.boundingBox.clone().applyMatrix4(parent));
      } finally {
        shape.dispose();
      }
      return;
    }
    throw new Error(`Unaccounted mesh or geometry type: ${String(child.type)}`);
  }
  walk(node, new Matrix4());
  return result;
}

function expectAsset(node: unknown, id: FundsAssetId, expected: number): Measurement {
  const actual = measure(node);
  expect(actual.meshes).toBe(expected);
  expect(actual.meshes).toBeLessThanOrEqual(FUNDS_ASSET_BUDGETS[id]);
  expect(FUNDS_ASSET_BUDGETS[id]).toBeLessThanOrEqual(24);
  expect(actual.bounds.isEmpty()).toBe(false);
  const declared = FUNDS_ASSET_BOUNDS[id];
  actual.bounds.min.toArray().forEach((value, axis) => {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(declared.min[axis] - 0.000001);
  });
  actual.bounds.max.toArray().forEach((value, axis) => {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeLessThanOrEqual(declared.max[axis] + 0.000001);
  });
  return actual;
}

describe('fund asset authored mesh accounting and conservative extents (not GPU measurements)', () => {
  it('declares exactly the approved four asset IDs', () => {
    expect(FUNDS_ASSET_IDS).toEqual(['A-09', 'A-10', 'A-11', 'A-12']);
    expect(Object.keys(FUNDS_ASSET_BUDGETS)).toEqual([...FUNDS_ASSET_IDS]);
    expect(Object.keys(FUNDS_ASSET_BOUNDS)).toEqual([...FUNDS_ASSET_IDS]);
  });

  for (const open of [0, 0.5, 1]) {
    for (const contributed of [false, true]) {
      it(`counts A-09 at open=${open}, contributed=${contributed}`, () => {
        const actual = expectAsset(
          createElement(CommitmentFolio, { open, contributed }),
          'A-09',
          contributed ? 21 : 17,
        );
        expect(actual.groups.has('commitment-record')).toBe(true);
        expect(actual.groups.has('contributed-cash')).toBe(contributed);
      });
    }
  }

  const fills = [
    { label: 'empty', values: [0, 0, 0, 0] },
    { label: 'half-filled', values: [0.5, 0.5, 0.5, 0.5] },
    { label: 'all four full', values: [1, 1, 1, 1] },
    { label: 'independent source ratios', values: [0, 0.3125, 1, 0.625] },
  ] as const;
  for (const fixture of fills) {
    it(`counts A-10 with ${fixture.label}, including hidden fill pieces`, () => {
      const ratios = Object.freeze(fixture.values);
      const actual = expectAsset(
        createElement(DistributionTierTrays, { fills: ratios }),
        'A-10',
        24,
      );
      ratios.forEach((ratio, index) => {
        const fill = actual.groups.get(`tier-fill-${index}`);
        expect(fill?.scale).toEqual([ratio, 1, 1]);
        expect(fill?.visible).toBe(ratio > 0);
      });
      // Later exact ratios are not gated or rounded because an earlier tier is empty/partial.
      expect(ratios).toEqual(fixture.values);
    });
  }

  for (const focus of [0, 1, 2] as const) {
    it(`counts A-11 with source-chosen focus=${focus}`, () => {
      expectAsset(createElement(MaturityLadder, { focus }), 'A-11', 21);
    });
  }

  for (const separation of [0, 0.5, 1]) {
    it(`counts A-12 at separation=${separation}, retaining distinct records`, () => {
      const actual = expectAsset(createElement(EconomicRightsLayers, { separation }), 'A-12', 23);
      expect(actual.groups.has('asset-folio')).toBe(true);
      expect(actual.groups.has('ownership-record')).toBe(true);
      expect(actual.groups.has('economic-claim-record')).toBe(true);
      expect(actual.groups.has('contributed-cash')).toBe(false);
    });
  }

  it('bounds intermediate hinges and layer spreads, not only endpoint poses', () => {
    for (let step = 0; step <= 32; step++) {
      const progress = step / 32;
      expectAsset(
        createElement(CommitmentFolio, { open: progress, contributed: true }),
        'A-09',
        21,
      );
      expectAsset(createElement(EconomicRightsLayers, { separation: progress }), 'A-12', 23);
    }
  });

  it('keeps defensive non-finite/out-of-range poses inside the declared envelopes', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -2, 3]) {
      expectAsset(createElement(CommitmentFolio, { open: value, contributed: false }), 'A-09', 17);
      expectAsset(createElement(EconomicRightsLayers, { separation: value }), 'A-12', 23);
      expectAsset(
        createElement(DistributionTierTrays, { fills: [value, value, value, value] }),
        'A-10',
        24,
      );
    }
  });

  it('counts mounted geometry even when its ancestor is hidden and zero-scale', () => {
    const hidden = createElement(
      'group',
      { visible: false, scale: 0 },
      createElement('mesh', null, createElement('boxGeometry', { args: [1, 1, 1] })),
    );
    expect(measure(hidden).meshes).toBe(1);
  });

  it('fails closed on unaccounted mesh, line, point and supplied geometry types', () => {
    for (const type of [
      'primitive',
      'instancedMesh',
      'skinnedMesh',
      'line',
      'lineSegments',
      'points',
    ]) {
      expect(() => measure(createElement(type))).toThrow(/Unaccounted/);
    }
    expect(() => measure(createElement('mesh', { geometry: {} }))).toThrow(/Unaccounted/);
    expect(() => measure({ geometry: 'opaque' })).toThrow(/Unaccounted/);
    expect(() => measure(createElement('mesh', null, createElement('sphereGeometry')))).toThrow(
      /Unaccounted/,
    );
  });
});
