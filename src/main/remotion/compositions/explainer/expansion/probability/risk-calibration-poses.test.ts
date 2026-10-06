import { describe, expect, it } from 'vitest';
import {
  riskCalibrationFields,
  riskCalibrationPages,
  riskCalibrationPose,
  riskQuantityPositions,
} from './risk-calibration-poses';
import {
  largeCountCalibration,
  maximumRiskCalibration,
  riskCalibrationCases,
} from './risk-calibration-poses.fixtures';

describe('risk/calibration pure source lenses', () => {
  it('accepts canonical and maximum records with long periods through actual contracts', () => {
    expect(maximumRiskCalibration('15').records).toHaveLength(12);
    expect(maximumRiskCalibration('16').records).toHaveLength(12);
    expect(largeCountCalibration()).toHaveProperty('records.0.prediction.basis.denominator', {
      numerator: 1000000000,
      denominator: 999999999,
    });
  });
  it('retains every source character across bounded pages without altering claims', () => {
    for (const scene of riskCalibrationCases()) {
      const pages = riskCalibrationPages(scene);
      for (let record = 0; record < scene.records.length; record++)
        expect(
          pages
            .filter((p) => p.record === record)
            .flatMap((p) => p.lines)
            .join(''),
        ).toBe(riskCalibrationFields(scene, record).join(''));
      expect(
        pages.every(
          (p) => p.lines.length <= 13 && p.lines.every((l) => Array.from(l).length <= 20),
        ),
      ).toBe(true);
    }
  });
  it('is finite, bounded and equal across every repeated/shuffled frame, with five beats and final hold', () => {
    for (const scene of riskCalibrationCases()) {
      const before = JSON.stringify(scene);
      const frames = Array.from({ length: 361 }, (_, i) => i / 30);
      const expected = frames.map((t) => riskCalibrationPose(scene, t));
      for (let i = 360; i >= 0; i--) {
        const pose = riskCalibrationPose(scene, frames[i]);
        expect(pose).toEqual(expected[i]);
        for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
          expect(pose[key]).toBeGreaterThanOrEqual(0);
          expect(pose[key]).toBeLessThanOrEqual(1);
        }
      }
      for (const i of frames.map((_, i) => (i * 37) % 361))
        expect(riskCalibrationPose(scene, frames[i])).toEqual(expected[i]);
      for (const t of [NaN, Infinity, -Infinity])
        expect(riskCalibrationPose(scene, t).page).toBe(0);
      expect(riskCalibrationPose(scene, scene.resolveAt + 0.8).resolve).toBe(1);
      expect(riskCalibrationPose(scene, scene.resolveAt + 0.8).page).toBe(expected.at(-1)?.page);
      expect(JSON.stringify(scene)).toBe(before);
    }
  });
  it('projects exact independent numeric axes and never substitutes zero for missing data', () => {
    const scene = maximumRiskCalibration('15', true);
    if (scene.storyId !== '15') throw new Error('Wrong route');
    const r = scene.records[0];
    if (r.likelihood.state !== 'quantity' || r.impact.state !== 'quantity')
      throw new Error('Numeric risk required');
    expect(riskQuantityPositions(r.likelihood.quantity)).toEqual([0.25]);
    expect(riskQuantityPositions(r.impact.quantity)).toEqual([1]);
    expect(r.likelihood.quantity).toHaveProperty('amount.notation', '25.00');
    expect(r.impact.quantity).toHaveProperty('amount.notation', '10000000.00');
    expect(
      riskQuantityPositions({ ...r.likelihood.quantity, state: 'unknown', qualifier: 'unknown' }),
    ).toEqual([]);
  });
});
