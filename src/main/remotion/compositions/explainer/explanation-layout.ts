import type { CameraSpec } from './three-helpers';

/** Fits the largest authored ground plane above the editorial rails. */
export const EXPLANATION_CAMERA: CameraSpec = {
  position: [5.2, 4.4, 9.4],
  fov: 48,
};

export const EXPLANATION_LABEL_TOP = 788;
export const EXPLANATION_LABEL_SIZE = 30;
export const EXPLANATION_LABEL_LINE_HEIGHT = 1.15;
export const EXPLANATION_EVIDENCE_TOP = 754;
export const EXPLANATION_OUTCOME_TOP = 874;

/** Extra authored label rows grow upward, never into the fixed final takeaway. */
export function explanationLabelTop(rows: 2 | 3 | 4): number {
  return (
    EXPLANATION_LABEL_TOP - (rows - 2) * EXPLANATION_LABEL_SIZE * EXPLANATION_LABEL_LINE_HEIGHT
  );
}
