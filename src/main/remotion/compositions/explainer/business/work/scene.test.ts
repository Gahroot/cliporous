import { createElement, Fragment, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HybridStage } from '../../diagrams/HybridStage';
import { parseWorkFixture, WORK_SOURCE_FIXTURES } from './fixtures';
import { sampleWorkScene } from './poses';
import { workTable } from './presentation';
import { BusinessWorkSceneView, WorkDiagramParts, WorkModelParts } from './Scene';

// Authored JSX/DOM accounting only. No GPU/canvas lifecycle or native media claim.
vi.mock('../../stage', async (original) => {
  const actual = await original<typeof import('../../stage')>();
  return {
    ...actual,
    useStage: () => actual.STAGE,
    useSceneTime: () => ({ t: 9, frame: 270, fps: 30 }),
  };
});
vi.mock('../../hero-kit', () => ({ Clay: () => null }));
vi.mock('../../explanation-kit', () => ({ ClayBlock: () => createElement('mesh') }));

type Props = Record<string, unknown>;
const geometry = new Set([
  'boxGeometry',
  'cylinderGeometry',
  'sphereGeometry',
  'capsuleGeometry',
  'torusGeometry',
  'coneGeometry',
]);
function meshes(node: unknown): number {
  if (Array.isArray(node)) return node.reduce<number>((sum, entry) => sum + meshes(entry), 0);
  if (node === null || node === undefined || typeof node === 'boolean') return 0;
  if (!isValidElement<Props>(node)) throw new Error('Opaque model output');
  if (node.type === Fragment) return meshes(node.props.children);
  if (typeof node.type === 'function')
    return meshes(Reflect.apply(node.type, undefined, [node.props]));
  if (node.type === 'mesh') {
    if (node.props.geometry !== undefined) throw new Error('Opaque geometry');
    return 1 + meshes(node.props.children);
  }
  if (node.type === 'group' || (typeof node.type === 'string' && geometry.has(node.type)))
    return meshes(node.props.children);
  throw new Error(`Unaccounted model part ${String(node.type)}`);
}
function taskIds(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(taskIds);
  if (!isValidElement<Props>(node)) return [];
  const id =
    typeof node.props.name === 'string' && node.props.name.startsWith('task:')
      ? node.props.name.slice(5)
      : null;
  return [...(id ? [id] : []), ...taskIds(node.props.children)];
}

describe('work authored rendering parts', () => {
  it.each(
    WORK_SOURCE_FIXTURES,
  )('$id keeps source relationships and states in real SVG parts', (fixture) => {
    const { scene, issues } = parseWorkFixture(fixture);
    if (!scene) throw new Error(issues.join('; '));
    const pose = sampleWorkScene(scene, scene.resolveAt);
    const markup = renderToStaticMarkup(
      createElement('svg', null, createElement(WorkDiagramParts, { scene, pose })),
    );
    expect(markup).toContain(`data-business-recipe="${fixture.id}"`);
    expect(markup).not.toContain('<canvas');
    expect(markup).not.toContain('undefined');
    for (const row of workTable(scene).rows)
      expect(markup).toContain(`data-relationship-id="${row.id}"`);
    const wrapper = BusinessWorkSceneView({ scene });
    expect(wrapper.type).toBe(HybridStage);
  });
  it.each(
    WORK_SOURCE_FIXTURES,
  )('$id has bounded mounted meshes and conserved document identity', (fixture) => {
    const { scene, issues } = parseWorkFixture(fixture);
    if (!scene) throw new Error(issues.join('; '));
    const ids = sampleWorkScene(scene, scene.resolveAt).tasks.map((task) => task.id);
    for (const seconds of [
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
    ]) {
      const model = WorkModelParts({ scene, pose: sampleWorkScene(scene, seconds) });
      const count = meshes(model);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(180);
      expect(taskIds(model).sort()).toEqual([...ids].sort());
      expect(new Set(taskIds(model)).size).toBe(ids.length);
    }
  });
  it('cannot silently ignore an opaque primitive, nested canvas or instancing', () => {
    for (const type of ['primitive', 'Canvas', 'instancedMesh', 'skinnedMesh'])
      expect(() => meshes(createElement(type))).toThrow();
  });
});
