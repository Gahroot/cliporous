import { describe, expect, it } from 'vitest';
import { mapSceneTimes } from '../../types';
import {
  informationPose,
  informationTransformPose,
  semanticSortPose,
  systemLayersPose,
} from './poses';
import { informationBody, informationFixtures } from './test-fixtures';

function finite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finite);
  if (value && typeof value === 'object') return Object.values(value).every(finite);
  return true;
}

describe('information pure seekable poses', () => {
  it.each(
    informationFixtures,
  )('$name is finite, repeatable and independent of seeking history across every frame', (fx) => {
    const scene = informationBody(fx);
    const before = structuredClone(scene);
    const times = Array.from(
      { length: Math.ceil(fx.durationSec * 30) + 1 },
      (_, frame) => frame / 30,
    );
    const forward = times.map((time) => informationPose(scene, time));
    for (const index of times.map((_, i) => i).reverse()) {
      expect(finite(forward[index])).toBe(true);
      expect(informationPose(scene, times[index])).toEqual(forward[index]);
    }
    expect(scene).toEqual(before);
    expect(informationPose(scene, scene.resolveAt)).toEqual(
      informationPose(scene, fx.durationSec + 30),
    );
  });

  it.each(
    informationFixtures,
  )('$name has stable source IDs at setup, action, response, check and resolution', (fx) => {
    const scene = informationBody(fx);
    const snapshots = [
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
    ].map((time) => informationPose(scene, time));
    const ids = snapshots.map((pose) =>
      'layers' in pose
        ? pose.layers.map((item) => item.id)
        : 'targets' in pose
          ? [...pose.targets, ...pose.items].map((item) => item.id)
          : pose.inputs.map((input) => input.id),
    );
    expect(ids.every((list) => JSON.stringify(list) === JSON.stringify(ids[0]))).toBe(true);
  });

  it.each(
    informationFixtures,
  )('$name follows rebased story time without transporting source word indices', (fx) => {
    const scene = informationBody(fx);
    const rebased = mapSceneTimes(scene, (time) => time + 7);
    if (
      rebased.kind !== 'system-layers' &&
      rebased.kind !== 'semantic-sort' &&
      rebased.kind !== 'information-transform'
    )
      throw new Error('Lost information kind');
    expect(informationPose(rebased, scene.responseAt + 7)).toEqual(
      informationPose(scene, scene.responseAt),
    );
    expect(informationPose(rebased, scene.resolveAt + 7)).toEqual(
      informationPose(scene, scene.resolveAt),
    );
  });

  it.each(
    informationFixtures.filter((fx) => fx.plannerInput.kind === 'system-layers'),
  )('$name opens before connecting and exactly reassembles its original parts', (fx) => {
    const scene = informationBody(fx);
    if (scene.kind !== 'system-layers') throw new Error('Expected layers');
    const start = systemLayersPose(scene, scene.setupAt);
    const open = systemLayersPose(scene, scene.responseAt);
    const check = systemLayersPose(scene, scene.checkAt);
    const end = systemLayersPose(scene, scene.resolveAt);
    expect(open.separation).toBe(1);
    expect(open.connections).toBe(0);
    expect(check.connections).toBe(1);
    expect(open.layers.at(-1)?.position[1]).toBeGreaterThan(start.layers.at(-1)?.position[1] ?? 0);
    expect(end.layers).toEqual(start.layers);
  });

  it.each(
    informationFixtures.filter((fx) => fx.plannerInput.kind === 'semantic-sort'),
  )('$name preserves non-selected actors and never moves an unpaired source', (fx) => {
    const scene = informationBody(fx);
    if (scene.kind !== 'semantic-sort') throw new Error('Expected sorting');
    const start = semanticSortPose(scene, scene.setupAt);
    const end = semanticSortPose(scene, scene.resolveAt);
    expect(end.targets).toHaveLength(scene.targets.length);
    scene.items.forEach((item, index) => {
      if (item.targetId === null) {
        expect(end.items[index].position).toEqual(start.items[index].position);
        expect(end.items[index].position[2]).toBeGreaterThan(2);
        expect(end.items[index].progress).toBe(0);
      } else {
        expect(end.items[index].progress).toBe(1);
      }
    });
    for (const target of end.targets)
      expect(target.selected).toBe(scene.items.some((item) => item.targetId === target.id));
  });

  it.each(
    informationFixtures.filter((fx) => fx.plannerInput.kind === 'information-transform'),
  )('$name changes representation without erasing any source or its provenance', (fx) => {
    const scene = informationBody(fx);
    if (scene.kind !== 'information-transform') throw new Error('Expected transformation');
    const start = informationTransformPose(scene, scene.setupAt);
    const end = informationTransformPose(scene, scene.resolveAt);
    end.inputs.forEach((input, index) => {
      expect(input.source).toEqual(start.inputs[index].source);
      expect(input.detailScale).toBe(1);
      expect(input.progress).toBe(1);
      expect(input.position[0]).toBeCloseTo(1.7, 12);
      expect(input.position).not.toEqual(input.source);
    });
    expect(end.binding).toBe(1);
  });
});
