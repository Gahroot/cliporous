import { describe, expect, it } from 'vitest';
import {
  EXPLANATION_CAMERA,
  EXPLANATION_EVIDENCE_TOP,
  EXPLANATION_LABEL_LINE_HEIGHT,
  EXPLANATION_LABEL_SIZE,
  EXPLANATION_LABEL_TOP,
  EXPLANATION_OUTCOME_TOP,
  explanationLabelTop,
} from './explanation-layout';
import { projectToStage } from './three-helpers';
import { EXPLAINER_STAGE_HEIGHT } from './types';

function corners(xs: number[], y: number, zs: number[]): [number, number, number][] {
  return xs.flatMap((x) => zs.map((z): [number, number, number] => [x, y, z]));
}

describe('authored explanation framing', () => {
  it('keeps the full neighborhood road and room foundation above the shared label rail', () => {
    const envelope = [
      ...corners([-3.2, 3.2], -1.3675, [1.155, 1.905]),
      ...corners([-2.58, 2.58], -1.4, [-1.8, 1.8]),
      ...corners([-2.6, 2.6], -1.4, [-1.2, 1.7]),
    ];
    for (const point of envelope) {
      const projected = projectToStage(EXPLANATION_CAMERA, point);
      expect(projected.y).toBeLessThan(EXPLANATION_LABEL_TOP - 8);
      expect(projected.x).toBeGreaterThan(60);
      expect(projected.x).toBeLessThan(1020);
    }
  });

  it('keeps the conflict desk supports above both source/claim labels', () => {
    for (const point of corners([-2.825, 2.825], -1.4, [-1.55, 1.55])) {
      expect(projectToStage(EXPLANATION_CAMERA, point).y).toBeLessThan(
        EXPLANATION_EVIDENCE_TOP - 8,
      );
    }
  });

  it.each([
    2, 3, 4,
  ] as const)('reserves %i label rows without changing the takeaway rail', (rows) => {
    expect(
      explanationLabelTop(rows) +
        rows * EXPLANATION_LABEL_SIZE * EXPLANATION_LABEL_LINE_HEIGHT +
        12,
    ).toBeLessThan(EXPLANATION_OUTCOME_TOP);
    expect(explanationLabelTop(2)).toBe(EXPLANATION_LABEL_TOP);
  });

  it('leaves space for wrapped labels, source claims and the final takeaway without cropping', () => {
    expect(EXPLANATION_LABEL_TOP + 2 * 30 * 1.15 + 12).toBeLessThan(EXPLANATION_OUTCOME_TOP);
    expect(EXPLANATION_EVIDENCE_TOP + 4 + 8 + 26 * 1.1 + 8 + 2 * 24 * 1.1 + 12).toBeLessThan(
      EXPLANATION_OUTCOME_TOP,
    );
    expect(EXPLANATION_OUTCOME_TOP + 2 * 36 * 1.1).toBeLessThan(EXPLAINER_STAGE_HEIGHT);
  });
});
