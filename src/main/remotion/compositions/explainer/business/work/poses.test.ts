import { describe, expect, it } from 'vitest';
import { parseWorkFixture, WORK_SOURCE_FIXTURES } from './fixtures';
import { workIdentities } from './identities';
import { sampleWorkScene } from './poses';
import type { BusinessWorkScene } from './types';

function scene(id: string): BusinessWorkScene {
  const fixture = WORK_SOURCE_FIXTURES.find((entry) => entry.id === id);
  if (!fixture) throw new Error(`Missing ${id}`);
  const result = parseWorkFixture(fixture);
  if (!result.scene) throw new Error(`${id}: ${result.issues.join('; ')}`);
  return result.scene;
}
function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbers);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}

describe('work poses from accepted raw source', () => {
  it.each(
    WORK_SOURCE_FIXTURES,
  )('$id is finite, bounded, repeatable and backward seekable', (fixture) => {
    const value = scene(fixture.id);
    const before = structuredClone(value);
    const times = [
      0,
      value.setupAt,
      value.actionAt,
      value.responseAt,
      value.checkAt,
      value.resolveAt,
      fixture.window.endTime,
    ];
    const expected = times.map((t) => sampleWorkScene(value, t));
    times.forEach((t, index) => {
      const pose = expected[index];
      expect(numbers(pose).every(Number.isFinite)).toBe(true);
      for (const transfer of pose.transfers) {
        expect(transfer.accepted).toBeGreaterThanOrEqual(0);
        expect(transfer.accepted).toBeLessThanOrEqual(1);
        if (transfer.state !== 'approved') expect(transfer.accepted).toBe(0);
      }
      expect(pose.tasks.length).toBeLessThanOrEqual(8);
      expect(new Set(pose.tasks.map((task) => task.id)).size).toBe(pose.tasks.length);
      expect(pose.focus.map((entry) => entry.id)).toEqual(
        workIdentities(value).map((entry) => entry.id),
      );
      expect(sampleWorkScene(value, t)).toEqual(pose);
    });
    for (let index = times.length - 1; index >= 0; index--)
      expect(sampleWorkScene(value, times[index])).toEqual(expected[index]);
    expect(sampleWorkScene(value, fixture.window.endTime)).toEqual(
      sampleWorkScene(value, value.resolveAt),
    );
    expect(value).toEqual(before);
    for (const t of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_VALUE,
    ]) {
      expect(numbers(sampleWorkScene(value, t)).every(Number.isFinite)).toBe(true);
    }
  });
  it('conditional handoffs and pending approvals never cross acceptance', () => {
    for (const id of ['OP-03', 'OP-32']) {
      const value = scene(id);
      expect(
        sampleWorkScene(value, value.resolveAt + 2).transfers.every(
          (transfer) => transfer.accepted === 0,
        ),
      ).toBe(true);
    }
  });
  it('capture, approval and later use remain distinct evidence transitions', () => {
    const value = scene('OP-05');
    if (value.kind !== 'work-redesign' || value.preset !== 'expertise-transfer')
      throw new Error('Wrong fixture');
    const pose = sampleWorkScene(value, value.resolveAt);
    expect(pose.provenance.map((entry) => entry.id)).toEqual([
      value.record.id,
      value.playbook.identity.id,
      value.task.id,
    ]);
    expect(pose.transfers.map((entry) => entry.id)).toEqual([
      value.record.id,
      value.playbook.identity.id,
      value.task.id,
    ]);
    expect(value.playbook.version).toBe('v1');
  });
  it('a later constrained actor changes focus without clearing the earlier constraint', () => {
    const value = scene('OP-80');
    if (value.kind !== 'coordination-map' || value.preset !== 'bottleneck-shift')
      throw new Error('Wrong fixture');
    expect(
      sampleWorkScene(value, value.resolveAt).focus.find(
        (entry) => entry.id === value.after.actorId,
      )?.focus,
    ).toBe(1);
    expect(value.before.state).toBe('constrained');
    expect(value.after.state).toBe('constrained');
  });
});
