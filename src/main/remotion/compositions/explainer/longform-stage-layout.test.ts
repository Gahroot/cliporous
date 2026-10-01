import { describe, expect, it } from 'vitest';
import { getLongformLayout, type LongformRect } from '../../../../shared/longform-layout';
import { DIAGRAM_LIMITS } from './diagrams/types';
import { EXPLANATION_CAMERA } from './explanation-layout';
import {
  centeredLongformBox,
  fitEditorialText,
  LONGFORM_STAGE_OWNERS,
  longformClipPath,
  longformStaging,
  longformTextRegions,
  modelSpaceTransform,
} from './longform-stage-layout';
import { MECHANISM_CAMERA } from './mechanisms/anchors';
import { cameraRig, projectToStage } from './three-helpers';
import { EXPLAINER_SCENE_KINDS } from './types';

const presentations = ['speaker-side', 'speaker-pip', 'full-frame'] as const;
function inside(a: LongformRect, b: LongformRect): void {
  expect(a.x).toBeGreaterThanOrEqual(b.x);
  expect(a.y).toBeGreaterThanOrEqual(b.y);
  expect(a.x + a.width).toBeLessThanOrEqual(b.x + b.width);
  expect(a.y + a.height).toBeLessThanOrEqual(b.y + b.height);
}
function overlaps(a: LongformRect, b: LongformRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

for (const presentation of presentations)
  describe(presentation, () => {
    const layout = getLongformLayout(presentation);
    it('reserves model, text, speaker and captions without overlap', () => {
      const regions = longformTextRegions(layout);
      for (const region of Object.values(regions)) {
        inside(region, layout.text);
        expect(overlaps(region, layout.model)).toBe(false);
        expect(overlaps(region, layout.caption)).toBe(false);
        if (layout.speaker) expect(overlaps(region, layout.speaker)).toBe(false);
      }
      // Status and evidence are alternative content in the same reservation.
      const slots = [regions.title, regions.condition, regions.status, regions.outcome];
      for (let i = 0; i < slots.length; i++)
        for (let j = i + 1; j < slots.length; j++) {
          expect(overlaps(slots[i], slots[j])).toBe(false);
        }
      inside(centeredLongformBox(presentation), layout.explanation);
      if (layout.speaker)
        expect(overlaps(centeredLongformBox(presentation), layout.speaker)).toBe(false);
    });

    it('matches native rectangular WebGL projection to authored HTML anchors at every sampled beat', () => {
      const transform = modelSpaceTransform(layout.model);
      expect(layout.model.width / layout.model.height).not.toBe(1080 / 960);
      for (const base of [EXPLANATION_CAMERA, MECHANISM_CAMERA])
        for (const t of [0, 0.5, 2, 5, 8]) {
          const camera = cameraRig(base, t, { focusAt: 2 });
          for (const x of [-3.2, 0, 3.2])
            for (const y of [-1.4, 0, 1.5])
              for (const z of [-1.8, 0, 1.8]) {
                const canonical = projectToStage(camera, [x, y, z]);
                const native = projectToStage(
                  camera,
                  [x, y, z],
                  layout.model.width,
                  layout.model.height,
                );
                expect(transform.x + canonical.x * transform.scale).toBeCloseTo(
                  layout.model.x + native.x,
                  8,
                );
                expect(transform.y + canonical.y * transform.scale).toBeCloseTo(
                  layout.model.y + native.y,
                  8,
                );
              }
        }
    });

    it('preserves maximum source labels, conditions, signs and currency at readable rail sizes', () => {
      const regions = longformTextRegions(layout);
      for (const [slot, text, preferred] of [
        ['title', 'W'.repeat(DIAGRAM_LIMITS.label), 48],
        ['condition', 'W'.repeat(DIAGRAM_LIMITS.condition), 28],
        ['outcome', `Possible: ${'W'.repeat(DIAGRAM_LIMITS.outcome)}`, 36],
        ['evidence', '-100.25 USD per task · not a measured outcome', 28],
      ] as const) {
        const region = {
          ...regions[slot],
          width: regions[slot].width - (slot === 'outcome' ? 56 : 0),
        };
        const fit = fitEditorialText(text, region, preferred);
        expect(fit.fontSize).toBeGreaterThanOrEqual(20);
        expect(fit.lines.join('').replaceAll(' ', '')).toBe(text.replaceAll(' ', ''));
        expect(fit.lines.length * fit.fontSize * 1.16).toBeLessThanOrEqual(region.height);
        expect(
          Math.max(...fit.lines.map((line) => line.length)) * fit.fontSize,
        ).toBeLessThanOrEqual(region.width);
      }
    });

    it('keeps the alpha reservation in an outer, even-odd pixel mask', () => {
      const path = longformClipPath(presentation);
      expect(path).toContain('path(evenodd,');
      expect(path.match(/M /g)).toHaveLength(presentation === 'speaker-pip' ? 2 : 1);
      if (presentation === 'speaker-pip') expect(path).toContain('M 64 704 H 656 V 1038 H 64 Z');
      if (presentation === 'speaker-side') expect(path).toContain('M 720 0 H 1920 V 1080 H 720 Z');
    });
  });

it('opts in only audited shared owners and contains all legacy or future kinds', () => {
  for (const kind of Object.keys(LONGFORM_STAGE_OWNERS)) {
    expect(EXPLAINER_SCENE_KINDS).toContain(kind);
    expect(longformStaging(kind)).toBe('native');
  }
  for (const kind of [
    'hero',
    'number',
    'statement',
    'chart',
    'iceberg',
    'future-kind',
    'toString',
  ]) {
    expect(longformStaging(kind)).toBe('centered');
  }
});
