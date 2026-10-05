import { createElement, Fragment, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HybridStage } from '../../diagrams/HybridStage';
import { ClayBlock } from '../../explanation-kit';
import { deriveExplainerPalette } from '../../palette';
import { Stage3D } from '../../Stage3D';
import { ApprovalRail } from '../assets/authority';
import {
  AUTHORITY_RAW_FIXTURES,
  type AuthorityRawFixture,
  parseAuthorityFixture,
} from './fixtures';
import { AUTHORITY_BODY, sampleBusinessAuthority } from './poses';
import { AuthorityDiagramParts, AuthorityModelParts, BusinessAuthoritySceneView } from './Scene';

vi.mock('../../stage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../stage')>()),
  useStage: () => ({ ...deriveExplainerPalette(), font: 'Inter', duration: 12 }),
  useSceneTime: () => ({ t: 0, f: 0, fps: 30 }),
}));

function count(node: ReactNode): number {
  if (Array.isArray(node)) return node.reduce((sum, child) => sum + count(child), 0);
  if (!isValidElement<Record<string, unknown>>(node)) return 0;
  if (node.type === 'primitive')
    throw new Error('Unaccounted primitive in authored authority parts');
  if (node.type === ClayBlock) return 1;
  if (typeof node.type === 'function') return count(Reflect.apply(node.type, null, [node.props]));
  return (node.type === 'mesh' ? 1 : 0) + count(node.props.children as ReactNode);
}
function includesComponent(node: ReactNode, component: unknown): boolean {
  if (Array.isArray(node)) return node.some((child) => includesComponent(child, component));
  if (!isValidElement<Record<string, unknown>>(node)) return false;
  return node.type === component || includesComponent(node.props.children as ReactNode, component);
}
function boundaries(node: ReactNode): number {
  if (Array.isArray(node)) return node.reduce((total, child) => total + boundaries(child), 0);
  if (!isValidElement<{ children?: ReactNode }>(node)) return 0;
  return (node.type === Stage3D ? 1 : 0) + boundaries(node.props.children);
}
function parsed(fixture: AuthorityRawFixture) {
  const result = parseAuthorityFixture(fixture);
  expect(result.issues).toEqual([]);
  if (!result.scene) throw new Error(`${fixture.recipeId}: missing valid source scene`);
  return result.scene;
}
const escaped = (text: string): string => renderToStaticMarkup(createElement(Fragment, null, text));

describe('authority authored diagram and model parts (CPU only)', () => {
  it.each(
    AUTHORITY_RAW_FIXTURES,
  )('$recipeId renders every held page, persistent state and complete declarations', (fixture) => {
    const scene = parsed(fixture);
    const initial = sampleBusinessAuthority(scene, { frame: 0, fps: 30, beats: scene });
    for (let pageIndex = 0; pageIndex < initial.pages.length; pageIndex++) {
      const pose = { ...initial, pageIndex };
      const html = renderToStaticMarkup(
        createElement('svg', null, createElement(AuthorityDiagramParts, { scene, pose })),
      );
      expect(html).toContain(escaped(pose.status));
      expect(html).toContain(escaped(pose.declaration));
      for (const panel of pose.pages[pageIndex]) {
        for (const line of panel.lines) expect(html).toContain(escaped(line));
      }
      expect(html).toContain(`font-size="${AUTHORITY_BODY.fontSize}"`);
      expect(html).not.toMatch(/<canvas|<iframe|foreignObject|clipPath|<image|https?:|ellipsis/);
      expect(html).toContain(`${pageIndex + 1}/${pose.pages.length}`);
    }
  });
  it.each(
    AUTHORITY_RAW_FIXTURES,
  )('$recipeId dispatches through the existing stage and mounts a bounded authored assembly', (fixture) => {
    const scene = parsed(fixture);
    const wrapper = BusinessAuthoritySceneView({ scene });
    expect(wrapper.type).toBe(HybridStage);
    if (!isValidElement<{ scene: typeof scene }>(wrapper))
      throw new Error('missing authority stage');
    expect(wrapper.props.scene).toBe(scene);
    for (const visualMode of ['diagram', 'hybrid'] as const) {
      if (scene.preset === 'conflicting-limits' && visualMode === 'hybrid') continue;
      const source = parsed({ ...fixture, raw: { ...fixture.raw, visualMode } });
      const view = BusinessAuthoritySceneView({ scene: source });
      if (!isValidElement<Parameters<typeof HybridStage>[0]>(view))
        throw new Error('missing stage props');
      expect(boundaries(HybridStage(view.props))).toBe(visualMode === 'hybrid' ? 1 : 0);
    }
    for (const seconds of [
      0,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
      20,
    ]) {
      const pose = sampleBusinessAuthority(scene, { frame: seconds * 30, fps: 30, beats: scene });
      const meshes = count(createElement(AuthorityModelParts, { scene, pose }));
      if (scene.preset === 'conflicting-limits') expect(meshes).toBe(0);
      else expect(meshes).toBeGreaterThan(0);
      expect(meshes).toBeLessThanOrEqual(180);
      expect(pose.observedExecution).toBe(false);
    }
  });
  it('does not mount an approver-bearing rail for a source transfer with no approver', () => {
    const fixture = AUTHORITY_RAW_FIXTURES.find(
      (entry) => entry.raw.preset === 'accountable-transfer',
    );
    if (!fixture) throw new Error('missing accountable-transfer source fixture');
    const source = parsed(fixture);
    if (source.preset !== 'accountable-transfer') throw new Error('wrong transfer fixture');
    const scene = { ...source, roles: { ...source.roles, approverId: null } };
    const pose = sampleBusinessAuthority(scene, { frame: 360, fps: 30, beats: scene });
    expect(includesComponent(AuthorityModelParts({ scene, pose }), ApprovalRail)).toBe(false);
    expect(includesComponent(AuthorityModelParts({ scene: source, pose }), ApprovalRail)).toBe(
      source.roles.approverId !== null,
    );
  });
});
