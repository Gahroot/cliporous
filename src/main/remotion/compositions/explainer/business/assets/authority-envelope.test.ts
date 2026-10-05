import { createElement, Fragment, isValidElement } from 'react';
import {
  Box3,
  BoxGeometry,
  type BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalRail, ExceptionTrolley, PermissionCard, PlaybookBinder } from './authority';
import { AUTHORITY_ASSET_BOUNDS } from './authority-poses';

vi.mock('../../stage', async (original) => {
  const actual = await original<typeof import('../../stage')>();
  return { ...actual, useStage: () => actual.STAGE };
});
vi.mock('../../hero-kit', () => ({ Clay: () => null }));
vi.mock('../../explanation-kit', () => ({
  ClayBlock: ({
    size,
    position,
    rotation,
  }: Parameters<typeof import('../../explanation-kit').ClayBlock>[0]) =>
    createElement('mesh', { position, rotation }, createElement('boxGeometry', { args: size })),
}));

interface Props {
  children?: unknown;
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: number | readonly [number, number, number];
  quaternion?: Quaternion;
  args?: readonly number[];
  geometry?: unknown;
}
function primitive(type: string, args: readonly number[]): BufferGeometry {
  if (!args.every(Number.isFinite)) throw new Error('Nonfinite geometry');
  if (type === 'boxGeometry' && args.length === 3)
    return new BoxGeometry(args[0], args[1], args[2]);
  if (type === 'cylinderGeometry' && args.length === 4)
    return new CylinderGeometry(args[0], args[1], args[2], args[3]);
  if (type === 'torusGeometry' && args.length === 4)
    return new TorusGeometry(args[0], args[1], args[2], args[3]);
  if (type === 'sphereGeometry' && args.length === 3)
    return new SphereGeometry(args[0], args[1], args[2]);
  if (type === 'capsuleGeometry' && args.length === 4)
    return new CapsuleGeometry(args[0], args[1], args[2], args[3]);
  throw new Error(`Unaccounted geometry: ${type}`);
}
function envelope(node: unknown): Box3 {
  const box = new Box3();
  function walk(child: unknown, parent: Matrix4, meshParent: boolean): void {
    if (Array.isArray(child)) {
      for (const item of child) walk(item, parent, meshParent);
      return;
    }
    if (child === null || child === undefined || typeof child === 'boolean') return;
    if (!isValidElement<Props>(child)) throw new Error('Unaccounted model part');
    if (child.type === Fragment) {
      walk(child.props.children, parent, meshParent);
      return;
    }
    if (typeof child.type === 'function') {
      walk(Reflect.apply(child.type, undefined, [child.props]), parent, meshParent);
      return;
    }
    if (child.type === 'mesh' || child.type === 'group') {
      if (child.props.geometry !== undefined) throw new Error('Unaccounted prebuilt geometry');
      const p = child.props.position ?? [0, 0, 0];
      const r = child.props.rotation ?? [0, 0, 0];
      const q = child.props.quaternion ?? new Quaternion().setFromEuler(new Euler(...r));
      const scale =
        typeof child.props.scale === 'number'
          ? [child.props.scale, child.props.scale, child.props.scale]
          : (child.props.scale ?? [1, 1, 1]);
      const world = parent
        .clone()
        .multiply(new Matrix4().compose(new Vector3(...p), q, new Vector3(...scale)));
      walk(child.props.children, world, child.type === 'mesh');
      return;
    }
    if (!meshParent) throw new Error('Unaccounted non-mesh primitive');
    const geometry = primitive(String(child.type), child.props.args ?? []);
    try {
      geometry.computeBoundingBox();
      if (!geometry.boundingBox) throw new Error('Missing geometry bounds');
      box.union(geometry.boundingBox.clone().applyMatrix4(parent));
    } finally {
      geometry.dispose();
    }
  }
  walk(node, new Matrix4(), false);
  return box;
}
function inside(id: keyof typeof AUTHORITY_ASSET_BOUNDS, node: unknown): void {
  const box = envelope(node);
  expect(box.isEmpty()).toBe(false);
  const declared = AUTHORITY_ASSET_BOUNDS[id];
  for (const [index, axis] of ['x', 'y', 'z'].entries()) {
    const actualMin = axis === 'x' ? box.min.x : axis === 'y' ? box.min.y : box.min.z;
    const actualMax = axis === 'x' ? box.max.x : axis === 'y' ? box.max.y : box.max.z;
    expect(actualMin).toBeGreaterThanOrEqual(declared.min[index] - 0.000001);
    expect(actualMax).toBeLessThanOrEqual(declared.max[index] + 0.000001);
  }
}

describe('authority aggregate envelope review, CPU geometry not native layout proof', () => {
  it('contains intermediate focus/gates/hinges, both revisions and pending/cleared states', () => {
    for (let step = 0; step <= 32; step++) {
      const progress = step / 32;
      for (const state of ['allowed', 'denied', 'unknown'] as const)
        inside('A-05', createElement(PermissionCard, { state, focus: progress }));
      inside('A-06', createElement(ApprovalRail, { accepted: progress }));
      for (const revision of [0, 1] as const)
        inside('A-07', createElement(PlaybookBinder, { open: progress, revision }));
    }
    for (const pending of [false, true])
      inside('A-08', createElement(ExceptionTrolley, { pending }));
  });
});
