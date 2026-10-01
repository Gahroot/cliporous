import { createElement, isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  AmbassadorBridge,
  bridgeCableHeight,
  EasternMarket,
  GuardianBuilding,
  PenobscotBuilding,
} from './ClassicLandmarks';
import { getDetroitLandmark } from './catalog';
import { FoxTheatre } from './FoxTheatre';
import { MICHIGAN_CENTRAL_MASSING, MichiganCentral } from './MichiganCentral';
import { RenaissanceCenter } from './RenaissanceCenter';
import type { DetroitLandmarkId } from './types';

vi.mock('../stage', async (original) => {
  const actual = await original<typeof import('../stage')>();
  return { ...actual, useStage: () => actual.STAGE };
});
vi.mock('../explanation-kit', () => ({ ClayBlock: () => createElement('mesh') }));
vi.mock('../hero-kit', () => ({ Clay: () => null }));

function meshes(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((n, child) => n + meshes(child), 0);
  if (!isValidElement<{ children?: unknown }>(node)) return 0;
  if (typeof node.type === 'function')
    return meshes(Reflect.apply(node.type, undefined, [node.props]));
  if (['primitive', 'instancedMesh', 'skinnedMesh'].includes(String(node.type)))
    throw new Error('Unaccounted geometry');
  return Number(node.type === 'mesh') + meshes(node.props.children);
}
describe('authored landmark mesh ceilings (not GPU measurements)', () => {
  const classics = [
    ['guardian-building', GuardianBuilding, 14],
    ['penobscot-building', PenobscotBuilding, 13],
    ['ambassador-bridge', AmbassadorBridge, 52],
    ['eastern-market', EasternMarket, 20],
  ] as const;
  for (const [id, component, expected] of classics)
    it(`bounds ${id}`, () => {
      const count = meshes(createElement(component));
      expect(count).toBe(expected);
      expect(count).toBeLessThanOrEqual(
        getDetroitLandmark(id satisfies DetroitLandmarkId)?.meshCeiling ?? 0,
      );
    });
  it('suspends a curved main cable above the deck rather than radial stays', () => {
    expect(bridgeCableHeight(0)).toBeLessThan(bridgeCableHeight(2));
    expect(bridgeCableHeight(0)).toBeGreaterThan(0.7);
    expect(bridgeCableHeight(-1)).toBe(bridgeCableHeight(1));
  });
  it('bounds the Fox exterior and independent block lettering', () => {
    const count = meshes(createElement(FoxTheatre));
    expect(count).toBe(27);
    expect(count).toBeLessThanOrEqual(getDetroitLandmark('fox-theatre')?.meshCeiling ?? 0);
  });
  it('keeps the station base wider and lower than its office block', () => {
    const m = MICHIGAN_CENTRAL_MASSING;
    expect(m.baseWidth).toBeGreaterThan(m.towerWidth * 1.5);
    expect(m.baseHeight).toBeLessThan(m.towerHeight / 2);
    const count = meshes(createElement(MichiganCentral));
    expect(count).toBe(28);
    expect(count).toBeLessThanOrEqual(getDetroitLandmark('michigan-central')?.meshCeiling ?? 0);
  });
  it('counts the actual RenCen assembly', () => {
    const count = meshes(createElement(RenaissanceCenter));
    expect(count).toBe(51);
    expect(count).toBeLessThanOrEqual(getDetroitLandmark('renaissance-center')?.meshCeiling ?? 0);
  });
});
