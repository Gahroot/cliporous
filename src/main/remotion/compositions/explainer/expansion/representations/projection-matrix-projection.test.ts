import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { getLongformLayout } from '../../../../../../shared/longform-layout';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { DIAGRAM_REGIONS, projectedDiagramRegion } from '../../diagrams/layout';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { stageSafeBox } from '../../types';
import { ProjectionMatrixDiagram } from './projection-matrix-Diagram';
import { projectionMatrixPages, projectionMatrixPose } from './projection-matrix-poses';
import { cases, interBounds } from './projection-matrix-test-fixtures';

const placements = [
  { aspect: '9:16', layout: 'stack' },
  { aspect: '9:16', layout: 'stack-flipped' },
  { aspect: '16:9', layout: 'takeover', presentation: 'full-frame' },
  { aspect: '16:9', layout: 'takeover', presentation: 'speaker-side' },
  { aspect: '16:9', layout: 'takeover', presentation: 'speaker-pip' },
] as const;
function decode(s: string): string {
  return s.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, k: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[k] ?? k,
  );
}
const separated = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;

it('authored full/speaker-side/pip and vertical envelopes retain source, caption and speaker reservations (not compact/native certification)', () => {
  for (const placement of placements) {
    if ('presentation' in placement) {
      const wide = getLongformLayout(placement.presentation);
      expect(wide.model.x).toBeGreaterThanOrEqual(wide.explanation.x);
      expect(wide.model.y).toBeGreaterThanOrEqual(wide.explanation.y);
      expect(wide.model.x + wide.model.width).toBeLessThanOrEqual(
        wide.explanation.x + wide.explanation.width,
      );
      expect(wide.model.y + wide.model.height).toBeLessThanOrEqual(
        wide.explanation.y + wide.explanation.height,
      );
      expect(separated(wide.model, wide.text)).toBe(true);
      expect(separated(wide.model, wide.caption)).toBe(true);
      if (wide.speaker) expect(separated(wide.model, wide.speaker)).toBe(true);
    } else {
      const body = projectedDiagramRegion(DIAGRAM_REGIONS.body, placement.layout, placement.aspect);
      const safe = stageSafeBox(placement.layout, placement.aspect);
      expect(body.x).toBeGreaterThanOrEqual(safe.x);
      expect(body.y).toBeGreaterThanOrEqual(safe.y);
      expect(body.x + body.width).toBeLessThanOrEqual(safe.x + safe.width);
      expect(body.y + body.height).toBeLessThanOrEqual(safe.y + safe.height);
      for (const rail of [
        DIAGRAM_REGIONS.title,
        DIAGRAM_REGIONS.condition,
        DIAGRAM_REGIONS.evidence,
        DIAGRAM_REGIONS.outcome,
      ])
        expect(
          separated(body, projectedDiagramRegion(rail, placement.layout, placement.aspect)),
        ).toBe(true);
    }
  }
});
for (const [caseIndex, scene] of cases().entries())
  it(`actual shipped Inter/current-page nonoverlap, accepted source ${caseIndex}`, () => {
    const pages = projectionMatrixPages(scene);
    const pose = projectionMatrixPose(scene, scene.resolveAt, pages);
    for (const [page, facts] of pages.entries()) {
      const diagram = createElement(ProjectionMatrixDiagram, { scene, pose: { ...pose, page } });
      const markup = renderToStaticMarkup(createElement('svg', null, diagram));
      expect(markup).not.toMatch(/textLength|lengthAdjust|clipPath|ellipsis|<canvas|NaN|Infinity/);
      const boxes: number[][] = [];
      const sourceLines: string[] = [];
      for (const match of markup.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
        const attrs = Object.fromEntries(
          [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]),
        );
        const value = decode(match[2]),
          x = Number(attrs.x),
          y = Number(attrs.y),
          ink = interBounds(value);
        expect(attrs['font-family']).toBe(UI_FONT);
        expect(Number(attrs['font-size'])).toBe(22);
        const box = [x + ink[0], y + ink[1], x + ink[2], y + ink[3]];
        expect(box[0], value).toBeGreaterThanOrEqual(8);
        expect(box[2], value).toBeLessThanOrEqual(x >= 492 ? 944 : 474);
        expect(box[1], value).toBeGreaterThanOrEqual(8);
        expect(box[3], value).toBeLessThanOrEqual(478);
        expect(
          boxes.every(
            (other) =>
              box[0] >= other[2] || box[2] <= other[0] || box[1] >= other[3] || box[3] <= other[1],
          ),
          `${value}: overlap`,
        ).toBe(true);
        boxes.push(box);
        if (x === 492) sourceLines.push(value);
      }
      expect(sourceLines).toEqual(facts.lines);
      // Check the same actual ink against every real composed body placement; no fake provider.
      for (const placement of placements) {
        const region =
          'presentation' in placement
            ? getLongformLayout(placement.presentation).model
            : DIAGRAM_REGIONS.body;
        const scale = Math.min(region.width / 952, region.height / 478);
        const ox = region.x + (region.width - 952 * scale) / 2,
          oy = region.y + (region.height - 478 * scale) / 2;
        expect(
          boxes.every(
            (b) =>
              ox + b[0] * scale >= region.x &&
              ox + b[2] * scale <= region.x + region.width &&
              oy + b[1] * scale >= region.y &&
              oy + b[3] * scale <= region.y + region.height,
          ),
        ).toBe(true);
        // Geometry is page-only: body composition needs one actual sample per envelope/case,
        // not thousands of identical provider/SVG shell traversals.
        if (page === 0) {
          const svg = renderToStaticMarkup(
            createElement(
              ExplainerProvider,
              {
                value: { ...placement, nativeStage: true },
              },
              createElement(DiagramSurface, null, diagram),
            ),
          );
          expect(svg).toContain(
            `left:${region.x}px;top:${region.y}px;width:${region.width}px;height:${region.height}px`,
          );
          expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
          expect(svg).toContain(markup.slice(5, -6));
        }
      }
    }
  });
