import { expect, it } from 'vitest';
import { compare } from '../value-logic';
import {
  approvalDependencyPages,
  approvalDependencyPose,
  approvalDependencyQuantity,
} from './approval-dependency-poses';
import {
  approvalDependencyCases,
  approvalDependencyPacket,
  approvalDependencyStates,
  approvalDependencyStressSeed,
  parseApprovalDependency,
} from './approval-dependency-test-fixtures';

it('real source parser accepts both stories/modes, maximal actors/links/records and all seven quantity states', () => {
  for (const seed of approvalDependencyPacket.stories) {
    const diagram = parseApprovalDependency(seed),
      hybrid = parseApprovalDependency(seed, 'hybrid');
    expect({ ...hybrid, visualMode: 'diagram' }).toEqual(diagram);
  }
  for (const id of ['35', '36'] as const)
    for (const state of approvalDependencyStates) {
      const scene = parseApprovalDependency(approvalDependencyStressSeed(id, state));
      expect(scene.entities).toHaveLength(id === '35' ? 3 : 8);
      expect(scene.values).toHaveLength(id === '35' ? 8 : 11);
      for (const v of scene.values) {
        expect(v.quantity.state).toBe(state);
        const text = approvalDependencyQuantity(v.quantity);
        expect(text).toContain('hour');
        expect(text).toContain('denominator 1000000000');
        if ('amount' in v.quantity && v.quantity.amount.kind === 'rational') {
          expect(compare(v.quantity.amount.value, { numerator: 0, denominator: 1 })).toEqual({
            ok: true,
            value: 0,
          });
          expect(text).toContain('; 0;');
        }
        if (state === 'unknown' || state === 'missing') expect('amount' in v.quantity).toBe(false);
      }
    }
  for (const state of [
    'allowed',
    'denied',
    'pending',
    'unknown',
    'missing',
    'disputed',
    'conditional',
  ]) {
    const scene = parseApprovalDependency(approvalDependencyStressSeed('35', 'known', true, state));
    if (scene.storyId !== '35') throw new Error('Story');
    expect(scene.records).toHaveLength(11);
    expect(scene.records[1].state).toBe(state);
    expect(scene.result.state).toBe('conditional');
  }
  for (const state of ['known', 'unknown', 'missing', 'disputed', 'conditional']) {
    const scene = parseApprovalDependency(approvalDependencyStressSeed('36', 'known', true, state));
    if (scene.storyId !== '36') throw new Error('Story');
    expect(scene.relations).toHaveLength(16);
    expect(new Set(scene.relations.map((r) => r.type))).toEqual(
      new Set(['dependency', 'transfer', 'order', 'flow']),
    );
    expect(scene.relations[0].state).toBe(state);
  }
});
for (const [index, scene] of approvalDependencyCases().entries())
  it(`finite seekable five beats, parser IDs, exact pages and final holds: source case ${index}`, () => {
    const pages = approvalDependencyPages(scene),
      visited = new Set<number>();
    const expected = Array.from({ length: 361 }, (_, f) => approvalDependencyPose(scene, f / 30));
    for (let f = 0; f <= 360; f++) {
      const pose = expected[f];
      visited.add(pose.page);
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
      expect(approvalDependencyPose(scene, f / 30)).toEqual(pose);
      expect(approvalDependencyPose(scene, ((f * 137) % 361) / 30)).toEqual(
        expected[(f * 137) % 361],
      );
    }
    expect(visited.size).toBe(pages.length);
    for (const time of [NaN, Infinity, -Infinity])
      expect(approvalDependencyPose(scene, time)).toEqual(
        approvalDependencyPose(scene, scene.setupAt - 1),
      );
    expect(approvalDependencyPose(scene, 20)).toEqual(approvalDependencyPose(scene, 100));
    for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
      const at = key === 'reveal' ? scene.setupAt : scene[`${key}At`];
      expect(approvalDependencyPose(scene, at)[key]).toBe(0);
      expect(approvalDependencyPose(scene, at + 0.31)[key]).toBe(1);
    }
    for (const factId of new Set(pages.map((p) => p.factId))) {
      const parts = pages.filter((p) => p.factId === factId);
      expect(parts.flatMap((p) => p.lines).join('')).toBe(parts[0].text);
    }
    for (const v of scene.values) expect(pages.some((p) => p.factId === v.id)).toBe(true);
    expect(pages.at(-1)?.factId).toBe(scene.result.id);
  });
