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
import { ClayBlock } from '../../explanation-kit';
import { deriveExplainerPalette } from '../../palette';
import { AUTHORITY_RAW_FIXTURES, parseAuthorityFixture } from './fixtures';
import { sampleBusinessAuthority } from './poses';
import { AuthorityModelParts } from './Scene';

vi.mock('../../stage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../stage')>()),
  useStage: () => ({ ...deriveExplainerPalette(), font: 'Inter' }),
}));
const triple = (value: unknown): [number, number, number] =>
  Array.isArray(value)
    ? [
        typeof value[0] === 'number' ? value[0] : 0,
        typeof value[1] === 'number' ? value[1] : 0,
        typeof value[2] === 'number' ? value[2] : 0,
      ]
    : [0, 0, 0];
function primitive(type: string, args: unknown[]): BufferGeometry {
  if (type === 'boxGeometry') return Reflect.construct(BoxGeometry, args);
  if (type === 'planeGeometry') return Reflect.construct(PlaneGeometry, args);
  if (type === 'cylinderGeometry') return Reflect.construct(CylinderGeometry, args);
  if (type === 'coneGeometry') return Reflect.construct(ConeGeometry, args);
  if (type === 'sphereGeometry') return Reflect.construct(SphereGeometry, args);
  if (type === 'capsuleGeometry') return Reflect.construct(CapsuleGeometry, args);
  if (type === 'torusGeometry') return Reflect.construct(TorusGeometry, args);
  throw new Error(`Unaccounted authority geometry ${type}`);
}
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
      mesh.position.set(...triple(node.props.position));
      mesh.rotation.set(...triple(node.props.rotation));
      root.add(mesh);
      return root;
    }
    return hierarchy(Reflect.apply(node.type, null, [node.props]), geometries);
  }
  if (node.type === 'primitive') throw new Error('Unaccounted primitive in authority envelope');
  const args = Array.isArray(node.props.args) ? node.props.args : [];
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
    ) {
      throw new Error('Authority mesh lacks accounted geometry');
    }
    const geometry = primitive(
      geometryNode.type,
      Array.isArray(geometryNode.props.args) ? geometryNode.props.args : args,
    );
    geometries.push(geometry);
    const mesh = new Mesh(geometry);
    mesh.position.set(...triple(node.props.position));
    mesh.rotation.set(...triple(node.props.rotation));
    if (typeof node.props.scale === 'number') mesh.scale.setScalar(node.props.scale);
    else if (Array.isArray(node.props.scale)) mesh.scale.set(...triple(node.props.scale));
    root.add(mesh);
    return root;
  }
  root.position.set(...triple(node.props.position));
  root.rotation.set(...triple(node.props.rotation));
  if (typeof node.props.scale === 'number') root.scale.setScalar(node.props.scale);
  else if (Array.isArray(node.props.scale)) root.scale.set(...triple(node.props.scale));
  if (node.props.children !== undefined)
    root.add(hierarchy(node.props.children as ReactNode, geometries));
  return root;
}

describe('authority aggregate authored studio volume (CPU, not native projection)', () => {
  it.each(
    AUTHORITY_RAW_FIXTURES,
  )('$recipeId accounts for every mesh and intermediate transform', (fixture) => {
    const result = parseAuthorityFixture(fixture);
    expect(result.issues).toEqual([]);
    const scene = result.scene;
    if (!scene) throw new Error(`${fixture.recipeId}: missing source scene`);
    if (scene.preset === 'conflicting-limits') {
      const pose = sampleBusinessAuthority(scene, { frame: 300, fps: 30, beats: scene });
      expect(AuthorityModelParts({ scene, pose })).toBeNull();
      return;
    }
    const seconds = [
      0,
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
      20,
    ];
    for (let index = 0; index < 20; index++)
      seconds.push(scene.setupAt + ((scene.resolveAt - scene.setupAt) * index) / 19);
    for (const time of seconds) {
      const geometries: BufferGeometry[] = [];
      try {
        const pose = sampleBusinessAuthority(scene, { frame: time * 30, fps: 30, beats: scene });
        const world = hierarchy(createElement(AuthorityModelParts, { scene, pose }), geometries);
        expect(geometries.length).toBeGreaterThan(0);
        expect(geometries.length).toBeLessThanOrEqual(180);
        world.updateMatrixWorld(true);
        const box = new Box3().setFromObject(world);
        expect(box.isEmpty()).toBe(false);
        expect([...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)).toBe(true);
        const epsilon = 1e-6; // Existing Float32 geometry tolerance; not wider source/layout limits.
        expect(box.min.x).toBeGreaterThanOrEqual(-3.4 - epsilon);
        expect(box.max.x).toBeLessThanOrEqual(3.4 + epsilon);
        expect(box.min.y).toBeGreaterThanOrEqual(-1.4 - epsilon);
        expect(box.max.y).toBeLessThanOrEqual(2.7 + epsilon);
        expect(box.min.z).toBeGreaterThanOrEqual(-2.6 - epsilon);
        expect(box.max.z).toBeLessThanOrEqual(1.8 + epsilon);
      } finally {
        for (const geometry of geometries) geometry.dispose();
      }
    }
  });
});
