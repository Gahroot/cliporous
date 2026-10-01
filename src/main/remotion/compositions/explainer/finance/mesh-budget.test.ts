import { createElement, isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  fundFixture,
  ownershipFixture,
  portfolioFixture,
} from '../../../../ai/explainer/hybrid-test-fixtures';
import {
  fundFlowSpec,
  ownershipChangeSpec,
  portfolioExposureSpec,
} from '../../../../ai/explainer/kinds-finance';
import { FundFlowScene } from './FundFlowScene';
import { OwnershipChangeScene } from './OwnershipChangeScene';
import { PortfolioExposureScene } from './PortfolioExposureScene';

const clock = vi.hoisted(() => ({ t: 0 }));
vi.mock('../stage', async (original) => {
  const actual = await original<typeof import('../stage')>();
  return {
    ...actual,
    useStage: () => actual.STAGE,
    useSceneTime: () => ({ t: clock.t, frame: clock.t * 30, fps: 30 }),
  };
});
vi.mock('../explanation-kit', () => ({ ClayBlock: () => createElement('mesh') }));
vi.mock('../hero-kit', () => ({ Clay: () => null }));
vi.mock('../diagrams/HybridStage', () => ({
  HybridStage: ({ model }: { model: unknown }) => model,
}));
function meshes(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((n, child) => n + meshes(child), 0);
  if (!isValidElement<{ children?: unknown }>(node)) return 0;
  if (typeof node.type === 'function')
    return meshes(Reflect.apply(node.type, undefined, [node.props]));
  if (['primitive', 'instancedMesh', 'skinnedMesh'].includes(String(node.type)))
    throw new Error('Unaccounted geometry');
  return Number(node.type === 'mesh') + meshes(node.props.children);
}
describe('finance authored mesh ceilings, excluding shared studio', () => {
  for (const t of [0, 2.5, 4.5, 8.5])
    it(`bounds actual renderer trees at ${t}s`, () => {
      clock.t = t;
      const f = fundFixture(),
        o = ownershipFixture(),
        p = portfolioFixture();
      const fund = fundFlowSpec.parse(f.raw, f.ctx),
        owner = ownershipChangeSpec.parse(o.raw, o.ctx),
        portfolio = portfolioExposureSpec.parse(p.raw, p.ctx);
      if (!fund || !owner || !portfolio) throw new Error('Fixture rejected');
      expect(meshes(createElement(FundFlowScene, { scene: fund }))).toBeLessThanOrEqual(55);
      expect(meshes(createElement(OwnershipChangeScene, { scene: owner }))).toBeLessThanOrEqual(24);
      expect(
        meshes(createElement(PortfolioExposureScene, { scene: portfolio })),
      ).toBeLessThanOrEqual(18);
    });
});
