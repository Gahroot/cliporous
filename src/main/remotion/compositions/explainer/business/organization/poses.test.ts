import { describe, expect, it } from 'vitest';
import { sampleHandshake, sampleScaleLens, sampleSnapshots } from '../motion';
import {
  ORGANIZATION_RESOURCE_FIXTURES,
  ORGANIZATION_SOURCE_FIXTURES,
  parseOrganizationFixture,
} from './fixtures';
import { sampleOrganizationScene } from './poses';

function finite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finite);
  return value === null || typeof value !== 'object' || Object.values(value).every(finite);
}
describe('seekable organization treatments', () => {
  it.each([
    ...ORGANIZATION_SOURCE_FIXTURES,
    ...ORGANIZATION_RESOURCE_FIXTURES.map(({ fixture }) => fixture),
  ])('$id preserves all source facts through bounded unordered seeks and resolve hold', (fixture) => {
    const { scene, issues } = parseOrganizationFixture(fixture);
    if (!scene) throw new Error(issues.join('; '));
    const before = structuredClone(scene);
    const final = sampleOrganizationScene(scene, scene.resolveAt);
    const expected =
      fixture.id === 'OP-25'
        ? 'M-07'
        : fixture.id === 'OP-26'
          ? 'M-09'
          : fixture.id === 'OP-27'
            ? 'M-06'
            : fixture.id === 'OP-29'
              ? 'M-11'
              : fixture.id === 'OP-30'
                ? 'M-02'
                : 'M-03';
    expect(final.motionId).toBe(expected);
    for (const time of [
      scene.checkAt,
      0,
      scene.resolveAt + 8,
      -20,
      scene.responseAt,
      NaN,
      Infinity,
      1e100,
      scene.actionAt,
      scene.setupAt,
    ]) {
      const pose = sampleOrganizationScene(scene, time);
      expect(pose).toEqual(sampleOrganizationScene(scene, time));
      expect(finite(pose)).toBe(true);
      expect(pose.time).toBeGreaterThanOrEqual(0);
      expect(pose.time).toBeLessThanOrEqual(scene.resolveAt);
      expect(pose.presentation).toEqual(final.presentation);
      expect(pose.opacity).toBeGreaterThanOrEqual(0);
      expect(pose.opacity).toBeLessThanOrEqual(1);
      if (Number.isFinite(time) && time >= scene.resolveAt) expect(pose).toEqual(final);
      if (pose.preset === 'decision-rights')
        for (const right of pose.rights) {
          if (right.permission !== 'permitted') expect(right.handshake.accepted).toBe(0);
        }
      if (pose.preset === 'legacy-boundaries') expect(pose.connected).toBe(false);
      if (pose.preset === 'merge-identities') {
        expect(pose.pending).toBe(true);
        expect(pose.ownerId).toBe('mara');
      }
      if (pose.preset === 'rollout-rings' && scene.preset === 'rollout-rings')
        expect(
          pose.snapshots.map((snapshot) => [snapshot.id, snapshot.date, snapshot.state]),
        ).toEqual(scene.rings.map((ring) => [ring.unit.id, ring.date, ring.state]));
      if (pose.preset === 'stated-chargeback' && scene.preset === 'stated-chargeback') {
        expect(pose.conserved.total).toBe(scene.total.amount.minorUnits);
        expect(pose.conserved.parts.map((part) => part.amount)).toEqual([
          ...scene.allocations.map((allocation) => allocation.amount.minorUnits),
          ...(scene.remainder.amount ? [scene.remainder.amount.minorUnits] : []),
        ]);
        expect(pose.remainderAmount).toBe(scene.remainder.amount?.minorUnits ?? null);
      }
    }
    expect(scene).toEqual(before);
  });
  it('uses the authored M07, M09 and M06 functions rather than substituting a generic reveal', () => {
    for (const fixture of ORGANIZATION_SOURCE_FIXTURES) {
      const { scene } = parseOrganizationFixture(fixture);
      if (!scene) throw new Error('Expected fixture');
      const pose = sampleOrganizationScene(scene, scene.checkAt);
      const clock = { frame: scene.checkAt * 30, fps: 30, beats: scene };
      if (scene.preset === 'federated-units' && pose.preset === scene.preset)
        expect(pose.lens).toEqual(
          sampleScaleLens(
            clock,
            scene.units.map((unit) => unit.id),
          ),
        );
      if (scene.preset === 'rollout-rings' && pose.preset === scene.preset)
        expect(pose.snapshots.map(({ state: _, ...snapshot }) => snapshot)).toEqual(
          sampleSnapshots(
            clock,
            scene.rings.map((ring) => ({ id: ring.unit.id, date: ring.date })),
          ),
        );
      if (pose.preset === 'decision-rights')
        expect(pose.rights[0].handshake).toEqual(sampleHandshake(clock, 'approved'));
    }
  });
});
