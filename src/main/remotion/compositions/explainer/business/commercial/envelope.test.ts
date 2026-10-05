import { createElement, isValidElement, type ReactNode } from 'react';
import {
  Box3,
  BoxGeometry,
  type BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  parseBusinessBlueprint,
  parseBusinessReplication,
} from '../../../../../ai/explainer/business-commercial-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { ClayBlock } from '../../explanation-kit';
import { deriveExplainerPalette } from '../../palette';
import { COMMERCIAL_RAW_FIXTURES } from './fixtures';
import { CommercialModelParts } from './Scene';

vi.mock('../../stage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../stage')>()),
  useStage: () => ({ ...deriveExplainerPalette(), font: 'Inter' }),
}));

function triple(value: unknown): [number, number, number] {
  if (!Array.isArray(value)) return [0, 0, 0];
  return [
    typeof value[0] === 'number' ? value[0] : 0,
    typeof value[1] === 'number' ? value[1] : 0,
    typeof value[2] === 'number' ? value[2] : 0,
  ];
}
function primitive(type: string, args: unknown[]): BufferGeometry {
  switch (type) {
    case 'boxGeometry':
      return Reflect.construct(BoxGeometry, args);
    case 'planeGeometry':
      return Reflect.construct(PlaneGeometry, args);
    case 'cylinderGeometry':
      return Reflect.construct(CylinderGeometry, args);
    case 'coneGeometry':
      return Reflect.construct(ConeGeometry, args);
    case 'sphereGeometry':
      return Reflect.construct(SphereGeometry, args);
    case 'capsuleGeometry':
      return Reflect.construct(CapsuleGeometry, args);
    case 'torusGeometry':
      return Reflect.construct(TorusGeometry, args);
    default:
      throw new Error(`Unaccounted commercial geometry ${type}`);
  }
}
function transform(object: Group | Mesh, props: Record<string, unknown>): void {
  object.position.set(...triple(props.position));
  object.rotation.set(...triple(props.rotation));
  if (typeof props.scale === 'number') object.scale.setScalar(props.scale);
  else if (Array.isArray(props.scale)) object.scale.set(...triple(props.scale));
}

/** Real authored hierarchy; ClayBlock's rounded mesh is bounded by its authored box. */
function hierarchy(node: ReactNode, geometries: BufferGeometry[]): Group {
  const root = new Group();
  if (Array.isArray(node)) {
    for (const child of node) root.add(hierarchy(child, geometries));
    return root;
  }
  if (!isValidElement<Record<string, unknown>>(node)) return root;
  if (typeof node.type === 'function') {
    if (node.type === ClayBlock) {
      const geometry = new BoxGeometry(...triple(node.props.size));
      geometries.push(geometry);
      const mesh = new Mesh(geometry);
      transform(mesh, node.props);
      root.add(mesh);
      return root;
    }
    return hierarchy(Reflect.apply(node.type, null, [node.props]) as ReactNode, geometries);
  }
  if (node.type === 'primitive') throw new Error('Unaccounted primitive in commercial envelope');
  if (node.type === 'mesh') {
    const children = Array.isArray(node.props.children)
      ? node.props.children
      : [node.props.children];
    const geometryNode = children.find(
      (child) =>
        isValidElement<Record<string, unknown>>(child) &&
        typeof child.type === 'string' &&
        child.type.endsWith('Geometry'),
    );
    if (
      !isValidElement<Record<string, unknown>>(geometryNode) ||
      typeof geometryNode.type !== 'string'
    )
      throw new Error('Commercial mesh lacks accounted geometry');
    const geometry = primitive(
      geometryNode.type,
      Array.isArray(geometryNode.props.args) ? geometryNode.props.args : [],
    );
    geometries.push(geometry);
    const mesh = new Mesh(geometry);
    transform(mesh, node.props);
    root.add(mesh);
    return root;
  }
  transform(root, node.props);
  // Deliberately include invisible mounted descendants, including the unoccupied client.
  if (node.props.children !== undefined)
    root.add(hierarchy(node.props.children as ReactNode, geometries));
  return root;
}

const EPSILON = 1e-6; // Existing Float32 geometry tolerance, not expanded studio/source limits.

describe('commercial aggregate authored studio volume (CPU, not native projection)', () => {
  it.each(
    COMMERCIAL_RAW_FIXTURES,
  )('$id accounts for mounted geometry across boundaries, intermediate and backward seeks', (fixture) => {
    const ctx = makeParseContext(fixture.words, fixture.window);
    const scene =
      fixture.raw.kind === 'business-replication'
        ? parseBusinessReplication(fixture.raw, ctx)
        : parseBusinessBlueprint(fixture.raw, ctx);
    expect(ctx.issues).toEqual([]);
    expect(scene).not.toBeNull();
    if (!scene) throw new Error(`${fixture.id}: rejected RAW fixture`);
    const beats = [scene.setupAt, scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt];
    const times = [
      0,
      fixture.window.startTime - 1 / 30,
      fixture.window.startTime,
      ...beats.flatMap((at) => [at - 1 / 30, at, at + 1 / 30]),
      fixture.window.endTime - 1 / 30,
      fixture.window.endTime,
      fixture.window.endTime + 1 / 30,
      20,
    ];
    for (let index = 0; index < 20; index++)
      times.push(scene.setupAt + ((scene.resolveAt - scene.setupAt) * index) / 19);
    const before = structuredClone(scene);
    const expected = new Map<number, { bounds: number[]; meshes: number }>();
    for (const seconds of [...times, ...[...times].reverse()]) {
      const geometries: BufferGeometry[] = [];
      try {
        const world = hierarchy(
          createElement(CommercialModelParts, { scene, seconds }),
          geometries,
        );
        expect(geometries.length).toBeGreaterThan(0);
        expect(geometries.length).toBeLessThanOrEqual(180);
        world.updateMatrixWorld(true);
        const box = new Box3().setFromObject(world);
        expect(box.isEmpty()).toBe(false);
        const bounds = [...box.min.toArray(), ...box.max.toArray()];
        expect(bounds.every(Number.isFinite)).toBe(true);
        expect(box.min.x, `${fixture.id} at ${seconds}: min x`).toBeGreaterThanOrEqual(
          -3.4 - EPSILON,
        );
        expect(box.max.x, `${fixture.id} at ${seconds}: max x`).toBeLessThanOrEqual(3.4 + EPSILON);
        expect(box.min.y, `${fixture.id} at ${seconds}: min y`).toBeGreaterThanOrEqual(
          -1.4 - EPSILON,
        );
        expect(box.max.y, `${fixture.id} at ${seconds}: max y`).toBeLessThanOrEqual(2.7 + EPSILON);
        expect(box.min.z, `${fixture.id} at ${seconds}: min z`).toBeGreaterThanOrEqual(
          -2.6 - EPSILON,
        );
        expect(box.max.z, `${fixture.id} at ${seconds}: max z`).toBeLessThanOrEqual(1.8 + EPSILON);
        const result = { bounds, meshes: geometries.length };
        if (expected.has(seconds)) expect(result).toEqual(expected.get(seconds));
        else expected.set(seconds, result);
      } finally {
        for (const geometry of geometries) geometry.dispose();
      }
    }
    expect(expected.get(fixture.window.endTime)).toEqual(expected.get(scene.resolveAt));
    expect(scene).toEqual(before);
  });
});
