import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, Fragment, isValidElement } from 'react';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { BranchPod, CommercialStorefront, OperatingDesk, ServiceStation } from './retail';
import { RETAIL_ASSET_BOUNDS, RETAIL_ASSET_BUDGETS, RETAIL_ASSET_IDS } from './retail-poses';

// CPU-only recursive JSX accounting: no React renderer, WebGL or geometry allocation.
// ClayBlock's exact outer box preserves transforms; hidden/zero-opacity meshes still count.
vi.mock('../../stage', async (original) => {
  const actual = await original<typeof import('../../stage')>();
  return { ...actual, useStage: () => actual.STAGE };
});
vi.mock('../../hero-kit', () => ({ Clay: () => null }));
vi.mock('../../explanation-kit', () => ({
  ClayBlock: (props: {
    size: number[];
    position?: number[];
    rotation?: number[];
    opacity?: number;
  }) =>
    createElement(
      'mesh',
      { position: props.position, rotation: props.rotation, opacity: props.opacity },
      createElement('boxGeometry', { args: props.size }),
    ),
}));

type Point = [number, number, number];
type Props = Record<string, unknown>;
interface MeshPart {
  kind: string;
  args: number[];
  matrix: number[];
  hidden: boolean;
}
interface MeshSample {
  meshes: number;
  hiddenMeshes: number;
  min: Point;
  max: Point;
  parts: MeshPart[];
}

function tuple(value: unknown, fallback: Point): Point {
  if (value === undefined) return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return [value, value, value];
  if (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite))
    return [value[0], value[1], value[2]];
  throw new Error('Nonfinite or unsupported mesh transform');
}

function transform(props: Props): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...tuple(props.position, [0, 0, 0])),
    new Quaternion().setFromEuler(new Euler(...tuple(props.rotation, [0, 0, 0]))),
    new Vector3(...tuple(props.scale, [1, 1, 1])),
  );
}

/** Full primitive boxes conservatively cover even the triangular folded-document cylinder. */
function halfExtents(kind: string, args: number[]): Point {
  if (kind === 'boxGeometry' && args.length >= 3 && args.slice(0, 3).every((n) => n > 0))
    return [args[0] / 2, args[1] / 2, args[2] / 2];
  if (kind === 'sphereGeometry' && args[0] > 0) return [args[0], args[0], args[0]];
  if (kind === 'capsuleGeometry' && args[0] > 0 && args[1] >= 0)
    return [args[0], args[0] + args[1] / 2, args[0]];
  if (kind === 'cylinderGeometry' && args[0] >= 0 && args[1] >= 0 && args[2] > 0) {
    const radius = Math.max(args[0], args[1]);
    return [radius, args[2] / 2, radius];
  }
  throw new Error(`Unaccounted geometry: ${kind}`);
}

function account(node: unknown): MeshSample {
  const sample: MeshSample = {
    meshes: 0,
    hiddenMeshes: 0,
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
    parts: [],
  };
  function walk(child: unknown, parent = new Matrix4(), hidden = false, inMesh = false): void {
    if (Array.isArray(child)) {
      child.forEach((item) => {
        walk(item, parent, hidden, inMesh);
      });
      return;
    }
    if (child === null || child === undefined || typeof child === 'boolean') return;
    if (!isValidElement<Props>(child)) throw new Error('Unaccounted JSX node');
    if (child.type === Fragment) {
      walk(child.props.children, parent, hidden, inMesh);
      return;
    }
    if (typeof child.type === 'function') {
      walk(Reflect.apply(child.type, undefined, [child.props]), parent, hidden, inMesh);
      return;
    }
    if (typeof child.type !== 'string') throw new Error('Unsupported component in mesh accounting');
    const kind = child.type;
    if (kind === 'group' || kind === 'mesh') {
      if (inMesh) throw new Error('Unaccounted nested mesh/group');
      if (child.props.geometry !== undefined) throw new Error('Unaccounted prebuilt geometry');
      const matrix = parent.clone().multiply(transform(child.props));
      const invisible = hidden || child.props.visible === false;
      const before = sample.parts.length;
      if (kind === 'mesh') {
        sample.meshes++;
        sample.hiddenMeshes += Number(invisible);
      }
      walk(child.props.children, matrix, invisible, kind === 'mesh');
      if (kind === 'mesh' && sample.parts.length !== before + 1)
        throw new Error('Unaccounted mesh: expected exactly one geometry');
      return;
    }
    if (!inMesh) throw new Error(`Unaccounted JSX primitive: ${kind}`);
    const args = child.props.args;
    if (!Array.isArray(args) || !args.every(Number.isFinite))
      throw new Error(`Unaccounted geometry arguments: ${kind}`);
    const half = halfExtents(kind, args);
    sample.parts.push({ kind, args: [...args], matrix: [...parent.elements], hidden });
    for (const x of [-half[0], half[0]])
      for (const y of [-half[1], half[1]])
        for (const z of [-half[2], half[2]]) {
          const point = new Vector3(x, y, z).applyMatrix4(parent).toArray();
          if (!point.every(Number.isFinite)) throw new Error('Nonfinite mesh extent');
          for (let axis = 0; axis < 3; axis++) {
            sample.min[axis] = Math.min(sample.min[axis], point[axis]);
            sample.max[axis] = Math.max(sample.max[axis], point[axis]);
          }
        }
  }
  walk(node);
  return sample;
}

const cases = [
  {
    id: 'A-01',
    expected: 24,
    variants: [0, 0.5, 1].map((open) => createElement(CommercialStorefront, { open })),
  },
  {
    id: 'A-02',
    expected: 21,
    variants: [false, true].map((occupied) => createElement(ServiceStation, { occupied })),
  },
  {
    id: 'A-03',
    expected: 21,
    variants: [0, 0.5, 1].map((open) => createElement(BranchPod, { open })),
  },
  {
    id: 'A-04',
    expected: 24,
    variants: [false, true].map((pending) => createElement(OperatingDesk, { pending })),
  },
] as const;

function source(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function tags(node: ts.Node, file: ts.SourceFile): string[] {
  const result: string[] = [];
  function visit(child: ts.Node): void {
    if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child))
      result.push(child.tagName.getText(file));
    ts.forEachChild(child, visit);
  }
  visit(node);
  return result;
}

describe('retail authored mesh ceilings and extents (CPU only, not GPU/RSS)', () => {
  it('ties the ClayBlock accounting mock to its actual single-mesh definition', () => {
    const file = source(resolve('src/main/remotion/compositions/explainer/explanation-kit.tsx'));
    const block = file.statements.find(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'ClayBlock',
    );
    if (!block) throw new Error('Missing ClayBlock');
    expect(tags(block, file)).toEqual(['mesh', 'Clay']);
  });

  it('keeps all four assets as explicitly typed model parts without a private stage', () => {
    const file = source(
      resolve('src/main/remotion/compositions/explainer/business/assets/retail.tsx'),
    );
    const names = ['CommercialStorefront', 'ServiceStation', 'BranchPod', 'OperatingDesk'];
    for (const name of names) {
      const model = file.statements.find(
        (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
      );
      if (!model || !ts.isFunctionDeclaration(model)) throw new Error(`Missing ${name}`);
      expect(model.type?.getText(file)).toBe('React.ReactElement');
    }
    expect(
      tags(file, file).filter((tag) => /Canvas|Stage3D|ExplanationStage|HybridStage/.test(tag)),
    ).toEqual([]);
  });

  it('pins exact A-01..04 budgets and never enlarges an authored ceiling beyond 24', () => {
    expect(cases.map(({ id }) => id)).toEqual(RETAIL_ASSET_IDS);
    expect(Object.keys(RETAIL_ASSET_BUDGETS)).toEqual(RETAIL_ASSET_IDS);
    expect(Object.keys(RETAIL_ASSET_BOUNDS)).toEqual(RETAIL_ASSET_IDS);
    expect(RETAIL_ASSET_BUDGETS).toEqual({ 'A-01': 24, 'A-02': 21, 'A-03': 21, 'A-04': 24 });
    for (const ceiling of Object.values(RETAIL_ASSET_BUDGETS))
      expect(ceiling).toBeLessThanOrEqual(24);
  });

  for (const { id, expected, variants } of cases) {
    it(`${id}: counts actual mounted pieces across every requested prop variant`, () => {
      for (const variant of variants) {
        const actual = account(variant);
        expect(actual.meshes).toBe(expected);
        expect(actual.parts).toHaveLength(actual.meshes);
        expect(actual.meshes).toBeLessThanOrEqual(RETAIL_ASSET_BUDGETS[id]);
      }
    });

    it(`${id}: declared finite extents conservatively cover actual transformed primitive boxes`, () => {
      const declared = RETAIL_ASSET_BOUNDS[id];
      const samples = variants.map(account);
      for (let axis = 0; axis < 3; axis++) {
        expect(Number.isFinite(declared.min[axis])).toBe(true);
        expect(Number.isFinite(declared.max[axis])).toBe(true);
        expect(declared.max[axis] - declared.min[axis]).toBeGreaterThan(0);
        expect(declared.max[axis] - declared.min[axis]).toBeLessThanOrEqual(4);
        for (const actual of samples) {
          expect(actual.min[axis]).toBeGreaterThanOrEqual(declared.min[axis] - 1e-10);
          expect(actual.max[axis]).toBeLessThanOrEqual(declared.max[axis] + 1e-10);
        }
        // Reject arbitrarily huge envelopes: <=0.25 model units beyond the union on either side.
        const min = Math.min(...samples.map((actual) => actual.min[axis]));
        const max = Math.max(...samples.map((actual) => actual.max[axis]));
        expect(min - declared.min[axis]).toBeLessThanOrEqual(0.25);
        expect(declared.max[axis] - max).toBeLessThanOrEqual(0.25);
      }
    });
  }

  it('counts zero-scale, zero-opacity and hidden meshes instead of treating them as free', () => {
    const sample = account(
      createElement(
        'group',
        { visible: false },
        createElement(
          'mesh',
          { scale: 0, opacity: 0 },
          createElement('boxGeometry', { args: [1, 1, 1] }),
        ),
      ),
    );
    expect(sample.meshes).toBe(1);
    expect(sample.hiddenMeshes).toBe(1);
    expect(sample.min).toEqual([0, 0, 0]);
    expect(sample.max).toEqual([0, 0, 0]);
  });

  it('retains storefront identity while moving only the roof and right cutaway wall', () => {
    const closed = account(createElement(CommercialStorefront, { open: 0 }));
    for (const open of [0.5, 1]) {
      const inspected = account(createElement(CommercialStorefront, { open }));
      expect(
        inspected.parts.filter((part, index) =>
          part.matrix.some((value, axis) => value !== closed.parts[index].matrix[axis]),
        ),
      ).toHaveLength(2);
    }
  });

  it('retains branch identity while lifting only its inspection roof', () => {
    const closed = account(createElement(BranchPod, { open: 0 }));
    for (const open of [0.5, 1]) {
      const inspected = account(createElement(BranchPod, { open }));
      expect(
        inspected.parts.filter((part, index) =>
          part.matrix.some((value, axis) => value !== closed.parts[index].matrix[axis]),
        ),
      ).toHaveLength(1);
    }
  });

  it('preserves empty occupancy and pending paperwork without deleting mounted semantic parts', () => {
    const empty = account(createElement(ServiceStation, { occupied: false }));
    const occupied = account(createElement(ServiceStation, { occupied: true }));
    expect(empty.hiddenMeshes).toBe(8);
    expect(occupied.hiddenMeshes).toBe(0);
    expect(empty.parts.map(({ hidden: _hidden, ...part }) => part)).toEqual(
      occupied.parts.map(({ hidden: _hidden, ...part }) => part),
    );
    const pending = account(createElement(OperatingDesk, { pending: true }));
    const filed = account(createElement(OperatingDesk, { pending: false }));
    expect(pending.hiddenMeshes).toBe(0);
    expect(filed.hiddenMeshes).toBe(0);
    expect(pending.parts.map(({ kind, args }) => ({ kind, args }))).toEqual(
      filed.parts.map(({ kind, args }) => ({ kind, args })),
    );
    expect(
      pending.parts.filter((part, index) =>
        part.matrix.some((value, axis) => value !== filed.parts[index].matrix[axis]),
      ),
    ).toHaveLength(7);
  });

  it('bounds numeric pose props and fails nonfinite inspection inputs closed', () => {
    for (const model of [CommercialStorefront, BranchPod]) {
      const closed = account(createElement(model, { open: 0 }));
      const opened = account(createElement(model, { open: 1 }));
      for (const open of [-100, NaN, Infinity, -Infinity])
        expect(account(createElement(model, { open }))).toEqual(closed);
      for (const open of [2, 100]) expect(account(createElement(model, { open }))).toEqual(opened);
    }
  });

  it('fails on unaccounted mesh primitives, geometry and stage/HTML intrinsics', () => {
    for (const tag of [
      'primitive',
      'instancedMesh',
      'skinnedMesh',
      'batchedMesh',
      'points',
      'canvas',
      'div',
    ])
      expect(() => account(createElement(tag))).toThrow(/Unaccounted/);
    expect(() => account(createElement('mesh'))).toThrow(/Unaccounted mesh/);
    expect(() => account(createElement('mesh', { geometry: {} }))).toThrow(/Unaccounted/);
    expect(() =>
      account(createElement('mesh', null, createElement('torusGeometry', { args: [1, 0.1] }))),
    ).toThrow(/Unaccounted geometry/);
    expect(() =>
      account(createElement('mesh', null, createElement('boxGeometry', { args: [NaN, 1, 1] }))),
    ).toThrow(/Unaccounted/);
  });
});
