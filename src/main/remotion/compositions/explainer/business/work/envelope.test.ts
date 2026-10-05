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
import { parseWorkFixture, WORK_SOURCE_FIXTURES } from './fixtures';
import { sampleWorkScene } from './poses';
import { WorkModelParts } from './Scene';

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
function geometry(type: string, args: readonly number[]): BufferGeometry {
  if (!args.every(Number.isFinite)) throw new Error('Nonfinite geometry');
  if (type === 'boxGeometry' && args.length === 3)
    return new BoxGeometry(args[0], args[1], args[2]);
  if (type === 'cylinderGeometry' && args.length === 4)
    return new CylinderGeometry(args[0], args[1], args[2], args[3]);
  if (type === 'sphereGeometry' && args.length === 3)
    return new SphereGeometry(args[0], args[1], args[2]);
  if (type === 'capsuleGeometry' && args.length === 4)
    return new CapsuleGeometry(args[0], args[1], args[2], args[3]);
  if (type === 'torusGeometry' && args.length === 4)
    return new TorusGeometry(args[0], args[1], args[2], args[3]);
  throw new Error(`Unaccounted geometry ${type}`);
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
      if (child.props.geometry !== undefined) throw new Error('Opaque geometry');
      const p = child.props.position ?? [0, 0, 0];
      const r = child.props.rotation ?? [0, 0, 0];
      const q = child.props.quaternion ?? new Quaternion().setFromEuler(new Euler(...r));
      const s =
        typeof child.props.scale === 'number'
          ? [child.props.scale, child.props.scale, child.props.scale]
          : (child.props.scale ?? [1, 1, 1]);
      if (![...p, ...r, ...s].every(Number.isFinite)) throw new Error('Nonfinite transform');
      const world = parent
        .clone()
        .multiply(new Matrix4().compose(new Vector3(...p), q, new Vector3(...s)));
      walk(child.props.children, world, child.type === 'mesh');
      return;
    }
    if (!meshParent) throw new Error('Non-mesh primitive');
    const shape = geometry(String(child.type), child.props.args ?? []);
    try {
      shape.computeBoundingBox();
      if (!shape.boundingBox) throw new Error('Missing bounds');
      box.union(shape.boundingBox.clone().applyMatrix4(parent));
    } finally {
      shape.dispose();
    }
  }
  walk(node, new Matrix4(), false);
  return box;
}

describe('work aggregate authored envelope, not native projection/GPU evidence', () => {
  it.each(
    WORK_SOURCE_FIXTURES,
  )('$id keeps all mounted geometry inside a bounded studio volume', (fixture) => {
    const { scene, issues } = parseWorkFixture(fixture);
    if (!scene) throw new Error(issues.join('; '));
    const times = [scene.setupAt, scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt];
    for (let index = 0; index <= 12; index++)
      times.push(scene.setupAt + ((scene.resolveAt - scene.setupAt) * index) / 12);
    for (const time of times) {
      const box = envelope(WorkModelParts({ scene, pose: sampleWorkScene(scene, time) }));
      expect(box.isEmpty()).toBe(false);
      expect(
        [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite),
      ).toBe(true);
      // Same 1e-6 Float32 geometry tolerance as the existing authored asset envelopes.
      const epsilon = 0.000001;
      expect(box.min.x).toBeGreaterThanOrEqual(-3.4 - epsilon);
      expect(box.max.x).toBeLessThanOrEqual(3.4 + epsilon);
      expect(box.min.y).toBeGreaterThanOrEqual(-1.4 - epsilon);
      expect(box.max.y).toBeLessThanOrEqual(2.7 + epsilon);
      expect(box.min.z).toBeGreaterThanOrEqual(-2.6 - epsilon);
      expect(box.max.z).toBeLessThanOrEqual(1.8 + epsilon);
    }
  });
});
