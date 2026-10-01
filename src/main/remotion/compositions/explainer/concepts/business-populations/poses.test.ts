import { describe, expect, it } from 'vitest';
import { businessPopulationsPose, cohortPose, distributionPose, inventoryPose } from './poses';
import { populationFixtures } from './test-fixtures';

function finite(value: unknown): void {
  if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  else if (Array.isArray(value)) value.forEach(finite);
  else if (value && typeof value === 'object') Object.values(value).forEach(finite);
}

describe('Pack D seekable semantic poses', () => {
  it.each(populationFixtures)('$name seeks identically, stays finite, and holds the final state', ({
    scene,
  }) => {
    const times = [
      -10,
      0,
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
      100,
    ];
    const first = times.map((t) => businessPopulationsPose(scene, t));
    for (const index of [7, 3, 0, 5, 2, 6, 1, 4]) {
      const pose = businessPopulationsPose(scene, times[index] ?? 0);
      expect(pose).toEqual(first[index]);
      finite(pose);
    }
    expect(businessPopulationsPose(scene, scene.resolveAt)).toEqual(
      businessPopulationsPose(scene, 100),
    );
  });
  it('conserves every order/task and owner through every sampled frame, including zero-member workloads', () => {
    for (const { scene } of populationFixtures) {
      if (scene.kind !== 'population-distribution') continue;
      const baseline = distributionPose(scene, 0);
      const ids = baseline.carriers.map((c) => [c.id, c.ownerId]);
      expect(new Set(baseline.carriers.map((c) => c.id)).size).toBe(baseline.carriers.length);
      for (let frame = 0; frame <= 360; frame += 3) {
        const pose = distributionPose(scene, frame / 30);
        expect(pose.carriers.map((c) => [c.id, c.ownerId])).toEqual(ids);
        expect(pose.members.map((m) => m.id)).toEqual(scene.members.map((m) => m.id));
      }
      if (scene.mode === 'quantitative') {
        for (const m of scene.members)
          expect(baseline.carriers.filter((c) => c.ownerId === m.id)).toHaveLength(m.amount ?? 0);
      }
      expect(distributionPose(scene, scene.checkAt).carriers.every((c) => c.delivered)).toBe(true);
      if (scene.preset === 'average-hides-tail') {
        expect(distributionPose(scene, scene.checkAt - 0.001).average.visible).toBe(false);
        expect(distributionPose(scene, scene.checkAt).average.visible).toBe(true);
        expect(distributionPose(scene, 100).members).toEqual(baseline.members);
      }
    }
  });
  it('new arrivals never enter retained identities or the original denominator; departures never vanish', () => {
    for (const { scene } of populationFixtures) {
      if (scene.kind !== 'customer-cohort') continue;
      for (let frame = 0; frame <= 360; frame += 3) {
        const pose = cohortPose(scene, frame / 30);
        expect(pose.members).toHaveLength(scene.members.length);
        expect(pose.arrivals).toHaveLength(scene.arrivals.length);
        expect(pose.retainedIds.length + pose.departedIds.length).toBe(scene.members.length);
        for (const arrival of pose.arrivals) {
          expect(arrival.lane).toBe('arrival');
          expect(pose.retainedIds).not.toContain(arrival.id);
          expect(pose.members.map((m) => m.id)).not.toContain(arrival.id);
        }
      }
      expect(cohortPose(scene, 100).members.every((m) => m.lane === m.status)).toBe(true);
    }
  });
  it('matches supply to separate requests bijectively without copying products or hiding unmet demand', () => {
    for (const { scene } of populationFixtures) {
      if (scene.kind !== 'inventory-demand') continue;
      for (let frame = 0; frame <= 360; frame += 3) {
        const pose = inventoryPose(scene, frame / 30);
        expect(pose.products.map((p) => p.id)).toEqual(scene.stock.map((p) => p.id));
        expect(pose.people.map((p) => p.id)).toEqual(scene.demand.map((p) => p.id));
        const matched = pose.products.filter((p) => p.demandId !== undefined);
        expect(new Set(matched.map((p) => p.demandId)).size).toBe(pose.matches);
        expect(pose.matches + pose.leftover).toBe(scene.stock.length);
        expect(pose.matches + pose.unmet).toBe(scene.demand.length);
      }
      const final = inventoryPose(scene, 100);
      expect(final.products.filter((p) => p.location === 'shelf')).toHaveLength(final.leftover);
      expect(final.people.filter((p) => !p.fulfilled)).toHaveLength(final.unmet);
      expect(final.products.filter((p) => p.location === 'customer')).toHaveLength(final.matches);
    }
  });
  it('moves actual persistent actors and does not reduce to a static reveal', () => {
    for (const { scene } of populationFixtures) {
      expect(businessPopulationsPose(scene, scene.setupAt)).not.toEqual(
        businessPopulationsPose(scene, scene.checkAt),
      );
    }
  });
});
