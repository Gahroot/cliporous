import { sampleRailPoint } from '../hero-props/transport-poses';
import type { CameraSpec } from '../three-helpers';
import { type AnchorTransform, placeLabel, projectAnchor, transformAnchor } from './anchors';

export const SWITCHYARD_LABEL_SIZE = { width: 320, height: 120 } as const;

/** Conservative two-line width bound (one em per UTF-16 code unit); never spring text size. */
export function switchyardLabelFontSize(label: string, compact: boolean): number {
  return Math.min(
    compact ? 44 : 40,
    (2 * (SWITCHYARD_LABEL_SIZE.width - 24)) / Math.max(1, label.length),
  );
}

export function switchyardTransform(compact: boolean): AnchorTransform {
  // Leave room below the y=150 text-safe edge for two lines plus the full cart/stop silhouette.
  // Translate the whole rig together: rail, wheel and buffer contacts are unchanged.
  return { position: [0, -0.8, 0], rotation: [0, -0.08, 0], scale: compact ? 1.82 : 1.65 };
}

/** Keep room for two lines without hiding the receiving stops or the arriving token. */
export function switchyardLabel(
  camera: CameraSpec,
  branch: 'left' | 'right',
  compact: boolean,
): { x: number; y: number } | null {
  const endpoint = projectAnchor(
    camera,
    transformAnchor(sampleRailPoint(1, branch), switchyardTransform(compact)),
  );
  if (!endpoint) return null;
  return placeLabel(
    { x: endpoint.x, y: endpoint.y - 160 },
    SWITCHYARD_LABEL_SIZE.width,
    SWITCHYARD_LABEL_SIZE.height,
    { x: 72, y: 150, width: 936, height: 300 },
  );
}
