/**
 * Face rows for explainer `over` windows, via the face-detection sidecar.
 * Kept separate from `over-placement.ts` so the placement maths stays pure.
 */

import { detectFaceCrops, type FaceCropResult } from '../face-detection';
import { log } from '../logger';
import type { FaceMeasurement } from './over-placement';

/** Map one detector result to a measurement. Pure. */
export function toFaceMeasurement(result: FaceCropResult | undefined): FaceMeasurement {
  if (!result) return undefined;
  // Only the accurate detector's answers can place a card; the Haar fallback
  // reports shirt patterns and hands as faces.
  if (!result.facesReliable) return undefined;
  if (result.faceBand) return result.faceBand;
  return result.crop.faceDetected ? undefined : null;
}

function describe(m: FaceMeasurement): string {
  if (m === undefined) return 'unknown';
  if (m === null) return 'no face';
  return `face rows ${Math.round(m.top)}–${Math.round(m.bottom)}`;
}

/** One sidecar run for all windows; results align with `windows`. */
export async function measureFaceBands(
  videoPath: string,
  windows: readonly { start: number; end: number }[],
): Promise<FaceMeasurement[]> {
  const started = Date.now();
  const results = await detectFaceCrops(videoPath, [...windows], () => undefined);
  const measured = windows.map((_, i) => toFaceMeasurement(results[i]));
  const reliable = results.every((r) => r?.facesReliable === true);
  log(
    reliable ? 'info' : 'warn',
    'explainer',
    `measured faces for ${windows.length} floating card window(s) in ${Date.now() - started}ms: ${measured.map(describe).join(', ')}${
      reliable ? '' : ' (accurate face detector unavailable — floating cards use split screen)'
    }`,
  );
  return measured;
}
