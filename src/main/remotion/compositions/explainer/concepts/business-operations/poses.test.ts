import { describe, expect, it } from 'vitest';
import { businessFixtures } from './fixtures.test-support';
import {
  marketExchangeLabels,
  marketExchangePose,
  marketExchangeStatus,
  resourceAllocationPose,
  unitEconomicsPose,
} from './poses';

function finite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finite);
  if (value && typeof value === 'object') return Object.values(value).every(finite);
  return true;
}

const allocations = businessFixtures.flatMap((fx) =>
  fx.scene.kind === 'resource-allocation' ? [fx.scene] : [],
);
const economics = businessFixtures.flatMap((fx) =>
  fx.scene.kind === 'unit-economics' ? [fx.scene] : [],
);

describe.each(allocations)('$kind/$preset conserved frame-seekable tickets', (scene) => {
  it('retains every finite carrier and never mints capacity, including nonsequential seeks', () => {
    const snapshots = Array.from({ length: 390 }, (_, frame) =>
      resourceAllocationPose(scene, frame / 30),
    );
    for (let frame = 389; frame >= 0; frame--) {
      const pose = resourceAllocationPose(scene, frame / 30);
      expect(pose).toEqual(snapshots[frame]);
      expect(finite(pose)).toBe(true);
      expect(pose.tickets).toHaveLength(scene.total);
      expect(new Set(pose.tickets.map((ticket) => ticket.id)).size).toBe(scene.total);
      expect(
        pose.projects.reduce((sum, project) => sum + project.assigned, 0) +
          pose.tickets.filter((ticket) => ticket.owner === 'reserve').length,
      ).toBe(scene.total);
      expect(pose.tickets.map((ticket) => ticket.id)).toEqual(
        snapshots[0]?.tickets.map((ticket) => ticket.id),
      );
    }
  });
  it('shows the correct donor loss or unmet demand and holds the full ending', () => {
    const start = resourceAllocationPose(scene, scene.setupAt);
    const end = resourceAllocationPose(scene, scene.resolveAt);
    expect(start.projects.map((project) => project.assigned)).toEqual(
      scene.projects.map((project) => project.before),
    );
    expect(end.projects.map((project) => project.assigned)).toEqual(
      scene.projects.map((project) => project.after),
    );
    expect(end).toEqual(resourceAllocationPose(scene, scene.resolveAt + 20));
    if (scene.preset === 'reallocate') {
      const changed = end.tickets.filter((ticket) => ticket.from !== ticket.to);
      expect(changed.length).toBe(Math.abs(scene.projects[0].after - scene.projects[0].before));
      expect(end.projects.every((project) => project.unmet === 0)).toBe(true);
    } else {
      expect(end.showUnmet).toBe(true);
      expect(end.projects.reduce((sum, project) => sum + project.unmet, 0)).toBe(
        scene.projects.reduce((sum, project) => sum + project.requested, 0) - scene.total,
      );
    }
  });
});

describe.each(economics)('$kind/$preset stated-cost arithmetic', (scene) => {
  it('seeks deterministically and never funds costs beyond the source revenue', () => {
    const snapshots = Array.from({ length: 390 }, (_, frame) =>
      unitEconomicsPose(scene, frame / 30),
    );
    for (let frame = 389; frame >= 0; frame--) {
      const pose = unitEconomicsPose(scene, frame / 30);
      expect(pose).toEqual(snapshots[frame]);
      expect(finite(pose)).toBe(true);
      expect(pose.fundedCost + pose.retained).toBeCloseTo(scene.revenue, 8);
      expect(pose.fundedCost + pose.shortfall).toBeCloseTo(pose.totalCost, 8);
      expect(pose.remainder).toBeCloseTo(scene.revenue - pose.totalCost, 8);
      expect(pose.revenueWidth).toBeLessThanOrEqual(4.4);
      expect(pose.costWidth).toBeLessThanOrEqual(4.4);
      expect(pose.remainderWidth).toBeLessThanOrEqual(4.4);
      // No arbitrary priority among creditors is inferred from array order.
      for (const cost of pose.costs) expect(cost).not.toHaveProperty('unpaid');
    }
  });
  it('distinguishes a remainder, empty break-even and aggregate shortfall in a static final hold', () => {
    const end = unitEconomicsPose(scene, scene.resolveAt);
    expect(end).toEqual(unitEconomicsPose(scene, scene.resolveAt + 20));
    expect(end.showComparison).toBe(true);
    expect(end.status).toBe(
      scene.preset === 'positive-margin'
        ? 'remainder'
        : scene.preset === 'break-even'
          ? 'break-even'
          : 'shortfall',
    );
    if (scene.preset === 'negative-margin') expect(end.retained).toBe(0);
    if (scene.preset === 'break-even') expect(end.remainderWidth).toBe(0);
  });
});

const markets = businessFixtures.flatMap((fx) =>
  fx.scene.kind === 'market-exchange' ? [fx.scene] : [],
);

describe.each(markets)('$kind/$preset pure poses', (scene) => {
  it('conserves the complete payment at every frame including backward seeks', () => {
    const poses = Array.from({ length: 390 }, (_, frame) => marketExchangePose(scene, frame / 30));
    for (let frame = 389; frame >= 0; frame--) {
      const pose = marketExchangePose(scene, frame / 30);
      expect(pose).toEqual(poses[frame]);
      expect(
        pose.buyerBalance + pose.inTransit + pose.sellerBalance + pose.platformBalance,
      ).toBeCloseTo(scene.payment?.amount ?? 0, 8);
      expect([...pose.product, ...pose.payment].every(Number.isFinite)).toBe(true);
    }
  });
  it('labels only this payment and the physical handoff, never a whole wallet balance', () => {
    for (let frame = 0; frame < 390; frame++) {
      const t = frame / 30;
      const pose = marketExchangePose(scene, t);
      const labels = marketExchangeLabels(scene, t);
      const status = marketExchangeStatus(scene, t);
      expect(labels.join(' ')).not.toMatch(/0 dollars|balance|wallet|net worth/);
      if (pose.exchange > 0 && pose.exchange < 1) {
        expect(status).toContain('in transit');
        expect(status).not.toMatch(/Seller holds|Buyer holds|received/);
        if (!scene.platform)
          expect(labels).toEqual([
            `${scene.seller.label} · payment in transit`,
            `${scene.buyer.label} · sending payment`,
          ]);
      }
      if (pose.settlement === 1 && !pose.unmatched) {
        expect(status).toContain('received');
        if (!scene.platform) expect(labels[0]).toContain(`received ${scene.payment?.amount}`);
      }
    }
  });
  it('holds ownership and final geometry after resolution', () => {
    expect(marketExchangePose(scene, scene.resolveAt)).toEqual(
      marketExchangePose(scene, scene.resolveAt + 10),
    );
    const start = marketExchangePose(scene, scene.setupAt);
    const end = marketExchangePose(scene, scene.resolveAt);
    expect(start.owner).toBe('seller');
    expect(end.owner).toBe(scene.preset === 'unmatched-market' ? 'seller' : 'buyer');
    if (scene.preset !== 'unmatched-market') {
      expect(end.product[0]).toBeGreaterThan(start.product[0]);
      expect(end.sellerPayment[0]).toBeLessThan(start.payment[0]);
    } else {
      expect(start).toEqual(end);
    }
  });
});
