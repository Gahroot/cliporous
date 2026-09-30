import { describe, expect, it } from 'vitest';
import type { SynchronizationScene } from './composed-types';
import {
  SYNC_BELT_SCALE,
  SYNC_GATE_LIFT_SECONDS,
  SYNC_MAIL_START,
  sampleSynchronizationPose,
} from './synchronization-poses';

const scene: SynchronizationScene = {
  kind: 'synchronization',
  label: 'Shared rhythm',
  disagreeAt: 0.3,
  rhythmAt: 1,
  alignAt: 2.4,
  transferAt: 4,
};
describe('synchronization contact and phase invariants', () => {
  it('corrects forward, shares phase before releasing one persistent envelope', () => {
    let previous = sampleSynchronizationPose(scene, 0);
    for (let frame = 1; frame <= 180; frame++) {
      const t = frame / 30;
      const pose = sampleSynchronizationPose(scene, t);
      expect(pose.leftDistance).toBeGreaterThanOrEqual(previous.leftDistance);
      expect(pose.rightDistance).toBeGreaterThanOrEqual(previous.rightDistance);
      expect(pose.phaseError).toBeLessThanOrEqual(previous.phaseError);
      expect(pose.carrier.id).toBe('mail-0');
      expect(pose.carrier.position[1] - 0.025).toBeCloseTo(-0.475, 12);
      if (t <= scene.alignAt + SYNC_GATE_LIFT_SECONDS)
        expect(pose.carrier.position).toEqual(SYNC_MAIL_START);
      if (pose.carrier.position[0] > SYNC_MAIL_START[0]) {
        expect(pose.phaseError).toBe(0);
        expect(pose.gateLift).toBe(0.45);
      }
      if (t >= scene.alignAt) expect(pose.leftDistance).toBe(pose.rightDistance);
      previous = pose;
    }
  });
  it('uses the belt displacement for mail displacement, then holds exactly still', () => {
    const start = sampleSynchronizationPose(scene, scene.alignAt);
    for (const t of [2.8, 3.2, 3.6, 4]) {
      const pose = sampleSynchronizationPose(scene, t);
      expect(pose.carrier.position[0] - start.carrier.position[0]).toBeCloseTo(
        (pose.leftDistance - start.leftDistance) * SYNC_BELT_SCALE,
        12,
      );
      expect(sampleSynchronizationPose(scene, t)).toEqual(pose);
    }
    const settled = sampleSynchronizationPose(scene, scene.transferAt);
    expect(settled.received).toBe(true);
    expect(settled.metronomeAngle).toBeCloseTo(0, 15);
    expect(sampleSynchronizationPose(scene, 100)).toEqual(settled);
  });
});
