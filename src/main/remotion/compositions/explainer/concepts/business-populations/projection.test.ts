import { describe, expect, it } from 'vitest';
import {
  EXPLANATION_CAMERA,
  EXPLANATION_EVIDENCE_TOP,
  EXPLANATION_LABEL_TOP,
  EXPLANATION_OUTCOME_TOP,
} from '../../explanation-layout';
import { projectToStage } from '../../three-helpers';
import {
  cohortPose,
  distributionPose,
  inventoryPose,
  POPULATION_ENVELOPE,
  type PopulationPoint,
} from './poses';
import { populationFixtures } from './test-fixtures';
import type { BusinessPopulationsScene } from './types';

function visible(point: PopulationPoint) {
  const projected = projectToStage(EXPLANATION_CAMERA, point);
  expect(projected.x).toBeGreaterThan(70);
  expect(projected.x).toBeLessThan(1010);
  expect(projected.y).toBeGreaterThan(270);
  expect(projected.y).toBeLessThan(EXPLANATION_EVIDENCE_TOP - 20);
}
function actorBounds(point: PopulationPoint) {
  for (const x of [-0.3, 0.3])
    for (const y of [0, 1.02])
      for (const z of [-0.24, 0.27]) visible([point[0] + x, point[1] + y, point[2] + z]);
}
function check(scene: BusinessPopulationsScene) {
  for (let f = 0; f <= 360; f += 5) {
    const t = f / 30;
    if (scene.kind === 'population-distribution') {
      const pose = distributionPose(scene, t);
      for (const member of pose.members) actorBounds(member.position);
      for (const carrier of pose.carriers) visible(carrier.position);
    } else if (scene.kind === 'customer-cohort') {
      const pose = cohortPose(scene, t);
      for (const member of [...pose.members, ...pose.arrivals]) actorBounds(member.position);
    } else {
      const pose = inventoryPose(scene, t);
      for (const person of pose.people) actorBounds(person.position);
      for (const product of pose.products) {
        visible([product.position[0], product.position[1] + 0.27, product.position[2]]);
      }
    }
  }
}

describe('Pack D shared-camera/text reservations', () => {
  it('keeps the complete authored model envelope between header and editorial rails', () => {
    for (const x of POPULATION_ENVELOPE.x)
      for (const y of POPULATION_ENVELOPE.y)
        for (const z of POPULATION_ENVELOPE.z) visible([x, y, z]);
    expect(EXPLANATION_LABEL_TOP + 2 * 30 * 1.15 + 12).toBeLessThan(EXPLANATION_OUTCOME_TOP);
    expect(EXPLANATION_OUTCOME_TOP + 2 * 36 * 1.1).toBeLessThan(960);
  });
  it.each(
    populationFixtures,
  )('$name reserves the title, condition, evidence, label and outcome rails across its motion', ({
    scene,
  }) => check(scene));
  it('fits maximum population, cohort and shelf/request boundaries, not just the small fixtures', () => {
    for (const { scene } of populationFixtures) {
      if (scene.kind === 'population-distribution')
        check({
          ...scene,
          members: [6, 4, 2, 0].map((amount, i) => ({
            id: `member-${i}`,
            label: `Member ${i}`,
            level: 'middle',
            amount,
          })),
        });
      else if (scene.kind === 'customer-cohort') {
        for (const status of ['retained', 'departed'] as const)
          check({
            ...scene,
            members: Array.from({ length: 6 }, (_, i) => ({
              id: `original-${i}`,
              label: `Original ${i}`,
              status,
            })),
            arrivals: [
              { id: 'arrival-0', label: 'New one' },
              { id: 'arrival-1', label: 'New two' },
            ],
          });
      } else
        check({
          ...scene,
          stock: Array.from({ length: 6 }, (_, i) => ({ id: `stock-${i}` })),
          demand: Array.from({ length: 6 }, (_, i) => ({ id: `demand-${i}` })),
        });
    }
  });
});
