import { describe, expect, it } from 'vitest';
import { ownershipFixture } from '../../../../ai/explainer/hybrid-test-fixtures';
import { ownershipChangeSpec } from '../../../../ai/explainer/kinds-finance';
import { conservedFlowState, fundFlowPose, ownershipPose } from './poses';

const beats = { setupAt: 0.3, actionAt: 2, responseAt: 4, checkAt: 6, resolveAt: 8 };
describe('conserved fund flow poses', () => {
  it('retains share identity/count through denominator expansion', () => {
    const f = ownershipFixture();
    const scene = ownershipChangeSpec.parse(f.raw, f.ctx);
    if (!scene) throw new Error(f.ctx.issues.join('; '));
    for (const t of [9, 0, 3, 5, 7]) {
      expect(ownershipPose(t, scene).shares).toBe(40);
      expect(ownershipPose(t, scene).total).toBe(t < scene.responseAt ? 100 : 200);
    }
  });
  it('money is conserved before, during and after each movement', () => {
    for (let frame = 0; frame <= 300; frame++) {
      const p = fundFlowPose(frame / 30, beats);
      const state = conservedFlowState(10001, 9000, p);
      expect(state.sourceMinor + state.accountMinor + state.targetMinor).toBe(10001);
      expect(
        Math.min(state.sourceMinor, state.accountMinor, state.targetMinor),
      ).toBeGreaterThanOrEqual(0);
      if (frame / 30 < beats.responseAt) expect(state.targetMinor).toBe(0);
    }
    expect(conservedFlowState(10001, 9000, fundFlowPose(9, beats)).accountMinor).toBe(1001);
  });
});
