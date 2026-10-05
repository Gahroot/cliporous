import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { UnitsEquivalenceDiagram } from './units-equivalence-Diagram';
import {
  UNITS_EQUIVALENCE_CAMERA,
  unitsEquivalenceModelPlacement,
} from './units-equivalence-models';
import { unitsEquivalencePages, unitsEquivalencePose } from './units-equivalence-poses';
import {
  unitsEquivalenceCases,
  unitsEquivalenceGlyphExtent,
} from './units-equivalence-test-fixtures';

const decode = (s: string): string =>
  s.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, key: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[key] ?? key,
  );
describe('shipped Inter exact-value/copy ink and authored projection envelopes', () => {
  it('measures every actual current-page glyph at accepted maximum actors, marks, fractions and 96-character conditions', () => {
    for (const scene of unitsEquivalenceCases()) {
      const pages = unitsEquivalencePages(scene);
      for (let i = 0; i < pages.length; i++) {
        const t = scene.setupAt + ((i + 0.5) / pages.length) * (scene.resolveAt - scene.setupAt);
        const pose = unitsEquivalencePose(scene, t);
        const markup = renderToStaticMarkup(
          createElement(
            DiagramSurface,
            null,
            createElement(UnitsEquivalenceDiagram, { scene, pose }),
          ),
        );
        const boxes: number[][] = [];
        for (const m of markup.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
          const a = Object.fromEntries(
            [...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((v) => [v[1], v[2]]),
          );
          expect(a['font-family']).toContain('Inter');
          const size = Number(a['font-size']);
          expect(size).toBeGreaterThanOrEqual(22);
          const x = Number(a.x),
            y = Number(a.y);
          const [left, top, right, bottom] = unitsEquivalenceGlyphExtent(decode(m[2]), size);
          const box = [x + left, y + top, x + right, y + bottom];
          expect(box[0]).toBeGreaterThanOrEqual(0);
          expect(box[2]).toBeLessThanOrEqual(952);
          expect(box[1]).toBeGreaterThanOrEqual(0);
          expect(box[3]).toBeLessThanOrEqual(478);
          if (x >= 500) expect(box[2]).toBeLessThanOrEqual(940);
          if (scene.storyId === '49' && y >= 100 && y <= 408 && x < 484)
            expect(box[2]).toBeLessThanOrEqual(x < 240 ? 220 : 448);
          for (const b of boxes)
            expect(box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]).toBe(false);
          boxes.push(box);
        }
        expect(markup).not.toMatch(/ellipsis|clipPath|textLength|foreignObject/);
      }
    }
  });
  it('keeps retained-sheet authored corners in supported stack/takeover/landscape envelopes, not compact layouts', () => {
    // Evidence sheet mesh envelope includes state bars: x +/-1.5, y +/-1.7, z +/-0.2.
    for (const wide of [undefined, { width: 1920, height: 720 }, { width: 1920, height: 1080 }]) {
      const width = wide?.width ?? 1080,
        height = wide?.height ?? 960;
      const camera = new PerspectiveCamera(UNITS_EQUIVALENCE_CAMERA.fov, width / height, 0.1, 100);
      camera.position.set(...UNITS_EQUIVALENCE_CAMERA.position);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      for (let i = 0; i < 3; i++) {
        const p = unitsEquivalenceModelPlacement(i, wide);
        for (const turn of [-0.09, 0, 0.09])
          for (const x of [-1.5, 1.5])
            for (const y of [-1.7, 1.7])
              for (const z of [-0.2, 0.2]) {
                const point = new Vector3(x * p.scale, y * p.scale, z * p.scale)
                  .add(new Vector3(...p.position))
                  .applyAxisAngle(new Vector3(0, 1, 0), turn)
                  .project(camera);
                const px = ((point.x + 1) * width) / 2,
                  py = ((1 - point.y) * height) / 2;
                expect(px).toBeGreaterThan(0);
                expect(px).toBeLessThan(width);
                expect(py).toBeGreaterThan(0);
                expect(py).toBeLessThan(height);
              }
      }
    }
  });
});
