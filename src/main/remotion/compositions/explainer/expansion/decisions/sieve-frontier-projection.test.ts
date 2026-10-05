import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { SieveFrontierDiagram } from './sieve-frontier-Diagram';
import { SIEVE_FRONTIER_CAMERA, sieveFrontierModelPlacement } from './sieve-frontier-models';
import { sieveFrontierPages, sieveFrontierPose } from './sieve-frontier-poses';
import {
  acceptedSieveFrontier,
  interExtent,
  maximumSieveFrontier,
  sieveFrontierCases,
} from './sieve-frontier-test-fixtures';

const decode = (s: string) =>
  s.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, k: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[k] ?? k,
  );
const attrs = (s: string) =>
  Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]));
describe('sieve/frontier actual shipped Inter pages and physical placement (CPU only)', () => {
  it('bounds every composed text glyph on every accepted maximum page in both modes', () => {
    for (const scene of sieveFrontierCases()) {
      const pages = sieveFrontierPages(scene);
      for (let i = 0; i < pages.length; i++) {
        const pose = sieveFrontierPose(
          scene,
          scene.setupAt + ((i + 0.5) / pages.length) * (scene.resolveAt - scene.setupAt),
        );
        expect(pose.page).toBe(i);
        for (const visualMode of ['diagram', 'hybrid'] as const) {
          const svg = renderToStaticMarkup(
            createElement(
              DiagramSurface,
              null,
              createElement(SieveFrontierDiagram, {
                scene: { ...scene, visualMode },
                pose,
              }),
            ),
          );
          const boxes = [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map((m) => {
            const a = attrs(m[1]),
              size = Number(a['font-size']);
            expect(size).toBeGreaterThanOrEqual(22);
            const [l, t, r, b] = interExtent(decode(m[2]), size);
            const x = Number(a.x),
              y = Number(a.y);
            const box = [x + l, y + t, x + r, y + b];
            expect(box[0]).toBeGreaterThanOrEqual(0);
            expect(box[1]).toBeGreaterThanOrEqual(0);
            expect(box[2]).toBeLessThanOrEqual(x >= 500 ? 940 : 478);
            expect(box[3]).toBeLessThanOrEqual(478);
            return box;
          });
          for (let a = 0; a < boxes.length; a++)
            for (let b = a + 1; b < boxes.length; b++) {
              const A = boxes[a],
                B = boxes[b];
              expect(A[2] <= B[0] || B[2] <= A[0] || A[3] <= B[1] || B[3] <= A[1]).toBe(true);
            }
          expect(svg).not.toMatch(/textLength|lengthAdjust|clipPath|ellipsis/);
        }
      }
    }
  }, 30000);
  it('changes actual operand positions with parsed source values, preserving option IDs', () => {
    const scenes = [false, true].map((reverse) =>
      acceptedSieveFrontier(maximumSieveFrontier('26', 'W', false, false, false, false, reverse)),
    );
    const svgs = scenes.map((scene) =>
      renderToStaticMarkup(
        createElement(
          DiagramSurface,
          null,
          createElement(SieveFrontierDiagram, {
            scene,
            pose: sieveFrontierPose(scene, scene.setupAt),
          }),
        ),
      ),
    );
    const positions = svgs.map((svg) =>
      [...svg.matchAll(/data-position="([^"]*)"/g)].map((m) => Number(m[1])),
    );
    expect(positions[0]).not.toEqual(positions[1]);
    expect(scenes[0].entities.map((e) => e.id)).toEqual(scenes[1].entities.map((e) => e.id));
    for (const p of positions.flat()) expect(Number.isFinite(p)).toBe(true);
  });
  it('projects conservative full carrier boxes inside the left region without overlap in tall/wide stages', () => {
    for (const wide of [undefined, { width: 1920, height: 1080 }, { width: 1080, height: 960 }]) {
      const width = wide?.width ?? 1080,
        height = wide?.height ?? 960;
      const camera = new PerspectiveCamera(SIEVE_FRONTIER_CAMERA.fov, width / height, 0.1, 100);
      camera.position.set(...SIEVE_FRONTIER_CAMERA.position);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const meet = wide ? Math.min(width / 952, height / 478) : 1;
      const originX = wide ? (width - 952 * meet) / 2 : 64;
      const originY = wide ? (height - 478 * meet) / 2 : 262;
      for (let i = 0; i < 4; i++) {
        const p = sieveFrontierModelPlacement(i, wide);
        const points = [-1.4, 1.4].flatMap((x) =>
          [-0.92, 0.84].flatMap((y) =>
            [-0.3, 0.3].map((z) => {
              const v = new Vector3(
                p.position[0] + x * p.scale,
                p.position[1] + y * p.scale,
                z * p.scale,
              ).project(camera);
              return [((v.x + 1) * width) / 2, ((1 - v.y) * height) / 2];
            }),
          ),
        );
        for (const [x, y] of points) {
          expect(x).toBeGreaterThan(originX);
          expect(x).toBeLessThan(originX + 478 * meet);
          expect(y).toBeGreaterThan(originY + 342 * meet);
          expect(y).toBeLessThan(originY + 408 * meet);
        }
      }
    }
  });
});
