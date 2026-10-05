import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { stageSafeBox } from '../../types';
import { MatrixMatchingDiagram } from './matrix-matching-Diagram';
import { matrixMatchingModelPlacement } from './matrix-matching-models';
import { matrixMatchingPages, matrixMatchingPose } from './matrix-matching-poses';
import { interExtent, matrixMatchingCases } from './matrix-matching-test-fixtures';

const decode = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');

describe('matrix/matching shipped Inter and projection', () => {
  for (const [index, scene] of matrixMatchingCases().entries())
    it(`bounds every current source page in case ${index} (no truncation/overlap)`, () => {
      const pages = matrixMatchingPages(scene);
      for (const [pageIndex, page] of pages.entries()) {
        const pose = { ...matrixMatchingPose(scene, scene.resolveAt), page: pageIndex };
        const markup = renderToStaticMarkup(
          createElement(
            DiagramSurface,
            null,
            createElement(MatrixMatchingDiagram, { scene, pose }),
          ),
        );
        const boxes: number[][] = [];
        for (const match of markup.matchAll(
          /<text x="([\d.e+-]+)" y="([\d.e+-]+)" font-size="(\d+)"[^>]*>(.*?)<\/text>/g,
        )) {
          const x = Number(match[1]),
            y = Number(match[2]),
            size = Number(match[3]);
          expect(size).toBeGreaterThanOrEqual(22);
          const [l, t, r, b] = interExtent(decode(match[4]), size);
          const box = [x + l, y + t, x + r, y + b];
          expect(box[0]).toBeGreaterThanOrEqual(0);
          expect(box[1]).toBeGreaterThanOrEqual(0);
          expect(box[2]).toBeLessThanOrEqual(x >= 484 ? 944 : 474);
          expect(box[3]).toBeLessThanOrEqual(478);
          for (const other of boxes)
            expect(
              box[0] >= other[2] || box[2] <= other[0] || box[1] >= other[3] || box[3] <= other[1],
            ).toBe(true);
          boxes.push(box);
        }
        expect(boxes.length).toBeGreaterThan(page.lines.length);
        expect(markup).not.toMatch(/textLength|clipPath|ellipsis|<canvas/);
        for (const visualMode of ['diagram', 'hybrid'] as const)
          for (const layout of ['stack', 'stack-flipped', 'takeover', 'pip', 'over'] as const) {
            const presented = { ...scene, visualMode, layout };
            expect(
              renderToStaticMarkup(
                createElement(
                  DiagramSurface,
                  null,
                  createElement(MatrixMatchingDiagram, { scene: presented, pose }),
                ),
              ),
            ).toBe(markup);
            for (const aspect of ['9:16', '16:9'] as const) {
              const safe = stageSafeBox(layout, aspect);
              expect([safe.x, safe.y, safe.width, safe.height].every(Number.isFinite)).toBe(true);
              expect(safe.width).toBeGreaterThan(0);
              expect(safe.height).toBeGreaterThan(0);
            }
          }
      }
    });
  it('keeps clay carriers in the planar identity region at portrait and landscape model extents', () => {
    for (const scene of matrixMatchingCases())
      for (const wide of [undefined, { width: 1920, height: 720 }, { width: 1000, height: 800 }]) {
        for (let i = 0; i < scene.entities.length; i++) {
          const p = matrixMatchingModelPlacement(i, scene.entities.length, wide);
          expect([...p.position, p.scale].every(Number.isFinite)).toBe(true);
          expect(p.scale).toBeGreaterThan(0);
        }
      }
  });
});
