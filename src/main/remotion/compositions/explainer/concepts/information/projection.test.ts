import { describe, expect, it } from 'vitest';
import {
  type InformationPoint,
  informationProject,
  informationTransformPose,
  semanticSortLabels,
  semanticSortPose,
  systemLayersPose,
} from './poses';
import { informationBody, informationFixtures } from './test-fixtures';
import type { SemanticSortScene } from './types';

function expectStage(point: InformationPoint, name: string) {
  const p = informationProject(point);
  expect(p.x, `${name} x`).toBeGreaterThanOrEqual(64);
  expect(p.x, `${name} x`).toBeLessThanOrEqual(1016);
  expect(p.y, `${name} y`).toBeGreaterThanOrEqual(220);
  expect(p.y, `${name} y`).toBeLessThanOrEqual(694);
}

function corners(center: InformationPoint, half: InformationPoint): InformationPoint[] {
  return [-1, 1].flatMap((x) =>
    [-1, 1].flatMap((y) =>
      [-1, 1].map(
        (z): InformationPoint => [
          center[0] + x * half[0],
          center[1] + y * half[1],
          center[2] + z * half[2],
        ],
      ),
    ),
  );
}

function labelChecks(scene: SemanticSortScene) {
  const labels = semanticSortLabels(scene);
  const boxes = [...labels.targets, ...labels.items];
  for (const a of boxes) {
    expect(a.x).toBeGreaterThanOrEqual(64);
    expect(a.x + a.width).toBeLessThanOrEqual(1016);
    expect(a.y).toBeGreaterThan(200);
    expect(a.y + a.height).toBeLessThan(828);
    for (const b of boxes) {
      if (a === b) continue;
      const intersects =
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      expect(intersects, `${a.id} vs ${b.id}`).toBe(false);
    }
  }
  expect(labels.targets).toHaveLength(scene.targets.length);
  expect(labels.items).toHaveLength(scene.items.length);
}

describe('information studio projection and reserved label ownership', () => {
  it.each(
    informationFixtures,
  )('$name keeps geometry out of title, footer and source-label reservations at every frame', (fx) => {
    const scene = informationBody(fx);
    for (let frame = 0; frame <= Math.floor(fx.durationSec * 30); frame++) {
      const t = frame / 30;
      let points: InformationPoint[];
      if (scene.kind === 'system-layers') {
        points = systemLayersPose(scene, t).layers.flatMap((layer) =>
          corners([layer.position[0], layer.position[1] + 0.2, layer.position[2]], [1.5, 0.3, 1]),
        );
      } else if (scene.kind === 'semantic-sort') {
        const pose = semanticSortPose(scene, t);
        points = pose.items.flatMap((item) => corners(item.position, [0.4, 0.4, 0.07]));
        points.push(
          ...pose.targets.flatMap((target) =>
            corners([target.position[0], -0.45, target.position[2]], [0.94, 0.72, 1.15]),
          ),
        );
      } else {
        const pose = informationTransformPose(scene, t);
        points = pose.inputs.flatMap((input) => [
          ...corners(input.source, [0.38, 0.38, 0.1]),
          ...corners(input.position, [1.03 * input.detailScale, 0.33, 0.06]),
        ]);
        points.push(...corners([1.7, 0.25, 0], [1.33, 1.59, 0.16]));
      }
      for (const point of points) expectStage(point, `${fx.name}:${frame}`);
    }
  });

  it.each(
    informationFixtures.filter((fx) => fx.plannerInput.kind === 'semantic-sort'),
  )('$name has one fixed category label and one fixed source label per actor, with no collisions', (fx) => {
    const scene = informationBody(fx);
    if (scene.kind !== 'semantic-sort') throw new Error('Expected sorting');
    labelChecks(scene);
    const before = semanticSortLabels(scene);
    semanticSortPose(scene, scene.resolveAt);
    expect(semanticSortLabels(scene)).toEqual(before);
    const final = semanticSortPose(scene, scene.resolveAt);
    for (const item of final.items.filter((actor) => !actor.paired)) {
      const p = informationProject(item.position);
      for (const paired of final.items.filter((actor) => actor.paired)) {
        const q = informationProject(paired.position);
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(95);
      }
    }
  });

  it('reserves disjoint label boxes for the maximum three categories and six source documents', () => {
    const scene = informationBody(informationFixtures[0]);
    if (scene.kind !== 'semantic-sort') throw new Error('Expected pilot');
    const maximal: SemanticSortScene = {
      ...scene,
      targets: Array.from({ length: 3 }, (_, i) => ({
        id: `target-${i}`,
        label: 'A bounded source title',
      })),
      items: Array.from({ length: 6 }, (_, i) => ({
        ...scene.items[0],
        id: `item-${i}`,
        label: 'A bounded source title',
        targetId: i < 4 ? `target-${Math.floor(i / 2)}` : null,
      })),
    };
    labelChecks(maximal);
    for (let frame = 0; frame < 336; frame++) {
      for (const item of semanticSortPose(maximal, frame / 30).items) {
        for (const point of corners(item.position, [0.4, 0.4, 0.07]))
          expectStage(point, `max:${frame}`);
      }
    }
  });
});
