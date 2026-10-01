import { describe, expect, it } from 'vitest';
import { stageSafeBox } from '../types';
import { DIAGRAM_REGIONS, labelLines, projectedDiagramRegion, tokenPoint } from './layout';
import { DIAGRAM_LAYOUTS, DIAGRAM_LIMITS } from './types';

describe('bounded diagram layout', () => {
  for (const aspect of ['9:16', '16:9'] as const)
    for (const layout of DIAGRAM_LAYOUTS) {
      it(`${aspect}/${layout} preserves every reserved region in the real safe box`, () => {
        const safe = stageSafeBox(layout, aspect);
        const regions = Object.values(DIAGRAM_REGIONS);
        for (const region of regions) {
          const projected = projectedDiagramRegion(region, layout, aspect);
          expect(projected.x).toBeGreaterThanOrEqual(safe.x);
          expect(projected.y).toBeGreaterThanOrEqual(safe.y);
          expect(projected.x + projected.width).toBeLessThanOrEqual(safe.x + safe.width);
          expect(projected.y + projected.height).toBeLessThanOrEqual(safe.y + safe.height);
        }
        for (let i = 1; i < regions.length; i++) {
          expect(regions[i].y).toBeGreaterThanOrEqual(regions[i - 1].y + regions[i - 1].height);
        }
      });
    }
  it('keeps long names, negative signs, currency and conditions without ellipsis', () => {
    for (const text of [
      'Michigan Central Station',
      '-100.25 USD per task',
      'W'.repeat(DIAGRAM_LIMITS.actor),
    ]) {
      const lines = labelLines(text, 16);
      expect(lines.join('').replaceAll(' ', '')).toBe(text.replaceAll(' ', ''));
      expect(lines.every((line) => line.length <= 16)).toBe(true);
    }
    expect(labelLines('W'.repeat(DIAGRAM_LIMITS.label), 24)).toHaveLength(2);
    expect(labelLines('W'.repeat(DIAGRAM_LIMITS.condition), 48)).toHaveLength(2);
    expect(labelLines('W'.repeat(DIAGRAM_LIMITS.outcome), 27)).toHaveLength(2);
  });
  it('bounds all twelve token positions', () => {
    for (let i = 0; i < DIAGRAM_LIMITS.tokens; i++) {
      const p = tokenPoint(i);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(952);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(478);
    }
  });
});
