import { describe, expect, it } from 'vitest';
import { EXPLANATION_CAMERA, EXPLANATION_LABEL_TOP } from '../../explanation-layout';
import { projectToStage } from '../../three-helpers';
import { businessFixtures } from './fixtures.test-support';
import {
  allocationSlot,
  marketExchangePose,
  resourceAllocationPose,
  unitEconomicsPose,
} from './poses';

function visible(point: [number, number, number]) {
  const projected = projectToStage(EXPLANATION_CAMERA, point);
  expect(projected.x).toBeGreaterThan(50);
  expect(projected.x).toBeLessThan(1030);
  expect(projected.y).toBeGreaterThan(200);
  expect(projected.y).toBeLessThan(EXPLANATION_LABEL_TOP - 24);
}

describe('business models reserve all editorial rails on the smallest stage', () => {
  it('contains the complete shop base and both participant silhouettes', () => {
    for (const x of [-3.55, 3.55])
      for (const y of [-0.855, -0.705]) for (const z of [-1.5, 1.7]) visible([x, y, z]);
    for (const x of [-2.7, -1.7, 1.7, 2.7])
      for (const y of [-0.65, 1.02]) for (const z of [-1.12, -0.55]) visible([x, y, z]);
  });
  it.each(
    businessFixtures,
  )('$name contains every animated carrier and authored model inside the model region', (fixture) => {
    const scene = fixture.scene;
    for (let frame = 0; frame <= Math.ceil(fixture.durationSec * 30); frame++) {
      let points: [number, number, number][];
      let radius = 0.45;
      if (scene.kind === 'market-exchange') {
        const pose = marketExchangePose(scene, frame / 30);
        points = [pose.product, pose.payment, pose.sellerPayment, pose.platformFee];
      } else if (scene.kind === 'resource-allocation') {
        points = resourceAllocationPose(scene, frame / 30).tickets.map((ticket) => ticket.position);
        radius = 0.22;
      } else {
        points = unitEconomicsPose(scene, frame / 30).costs.map((cost) => cost.position);
        radius = 0.5;
      }
      for (const p of points)
        for (const dx of [-radius, radius])
          for (const dy of [-radius, radius])
            for (const dz of [-0.22, 0.22]) visible([p[0] + dx, p[1] + dy, p[2] + dz]);
    }
    if (scene.kind === 'resource-allocation') {
      for (const x of [-3.5, 3.5]) for (const z of [-1.5, 1.5]) visible([x, -1.425, z]);
      for (const x of [-2.925, -1.075, 1.075, 2.925])
        for (const z of [-0.95, 0.95]) visible([x, -1.42, z]);
      for (const project of scene.projects)
        for (let i = 0; i < 12; i++) visible(allocationSlot(project.id, i));
    }
    if (scene.kind === 'unit-economics') {
      for (const x of [-3.5, 3.5]) for (const z of [-1.45, 1.65]) visible([x, -0.83, z]);
      for (const x of [1.85, 3.05])
        for (const y of [-0.3, 0.45]) for (const z of [-0.95, -0.55]) visible([x, y, z]);
    }
  });
});
