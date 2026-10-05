import type { BusinessModelRail } from './business-panel-state';

/** Authored geometry only. Source choices cannot set dimensions or placement.
 * Hybrid panels retain the complete 1240px text rail alongside native models.
 * The wider panel still obeys the existing aggregate world and readability budgets.
 */
export const BUSINESS_HYBRID_LAYOUT = Object.freeze({
  width: 2080,
  height: 1060,
  textWidth: 1240,
  modelWidth: 640,
  inset: 80,
  gap: 40,
  contentTop: 330,
  minimumFont: 36,
  focusZoom: 1760 / 2080,
});

export function businessModelRail(x: number, y: number): BusinessModelRail {
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new Error('Nonfinite business panel origin');
  const layout = BUSINESS_HYBRID_LAYOUT;
  return {
    x: x + layout.inset + layout.textWidth + layout.gap,
    y: y + layout.contentTop,
    width: layout.modelWidth,
    height: layout.height - layout.contentTop - layout.inset,
  };
}
