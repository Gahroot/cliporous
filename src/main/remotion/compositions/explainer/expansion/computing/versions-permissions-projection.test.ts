import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { getLongformLayout } from '../../../../../../shared/longform-layout';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { DIAGRAM_REGIONS, labelLines } from '../../diagrams/layout';
import { diagramPose } from '../../diagrams/motion';
import { fitEditorialText, longformTextRegions } from '../../longform-stage-layout';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { VersionsPermissionsDiagram } from './versions-permissions-Diagram';
import {
  VERSIONS_PERMISSIONS_CAMERA,
  versionsPermissionsModelPlacement,
} from './versions-permissions-models';
import { versionsPermissionsPose } from './versions-permissions-poses';
import { versionsPermissionsCases } from './versions-permissions-test-fixtures';

// Shipped Inter cmap/advance/glyf bounding boxes; bounded CPU cache, not native shaping/pixels.
const font = readFileSync('resources/fonts/Inter.ttf');
const tables = new Map<string, number>();
for (let i = 0; i < font.readUInt16BE(4); i++) {
  const p = 12 + i * 16;
  tables.set(font.toString('ascii', p, p + 4), font.readUInt32BE(p + 8));
}
function table(name: string): number {
  const p = tables.get(name);
  if (p === undefined) throw new Error(`Missing ${name}`);
  return p;
}
const units = font.readUInt16BE(table('head') + 18),
  metrics = font.readUInt16BE(table('hhea') + 34),
  longLoca = font.readInt16BE(table('head') + 50) === 1,
  cmap = table('cmap');
let mapping = 0;
for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
  const p = cmap + font.readUInt32BE(cmap + 8 + i * 8);
  if (font.readUInt16BE(p) === 12) mapping = p;
}
const cache = new Map<string, readonly number[]>();
function extent(text: string, size: number): readonly number[] {
  const key = `${size}:${text}`,
    cached = cache.get(key);
  if (cached) return cached;
  let pen = 0,
    left = 0,
    right = 0,
    top = 0,
    bottom = 0;
  for (const character of text) {
    let glyph = 0;
    const code = character.codePointAt(0) ?? 0;
    for (let i = 0; i < font.readUInt32BE(mapping + 12); i++) {
      const p = mapping + 16 + i * 12;
      if (code >= font.readUInt32BE(p) && code <= font.readUInt32BE(p + 4)) {
        glyph = font.readUInt32BE(p + 8) + code - font.readUInt32BE(p);
        break;
      }
    }
    expect(glyph, character).toBeGreaterThan(0);
    const offset = (id: number) =>
      longLoca
        ? font.readUInt32BE(table('loca') + id * 4)
        : font.readUInt16BE(table('loca') + id * 2) * 2;
    if (offset(glyph + 1) > offset(glyph)) {
      const p = table('glyf') + offset(glyph);
      left = Math.min(left, pen + font.readInt16BE(p + 2));
      right = Math.max(right, pen + font.readInt16BE(p + 6));
      top = Math.min(top, -font.readInt16BE(p + 8));
      bottom = Math.max(bottom, -font.readInt16BE(p + 4));
    }
    pen += font.readUInt16BE(table('hmtx') + Math.min(glyph, metrics - 1) * 4);
  }
  const box = [left, top, right, bottom, pen].map((v) => (v * size) / units);
  if (cache.size === 512) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, box);
  return box;
}
function decode(s: string): string {
  return s.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, key: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[key] ?? key,
  );
}
function attrs(s: string): Record<string, string> {
  return Object.fromEntries(
    [...s.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]),
  );
}
function bounded(
  box: readonly number[],
  region: { x: number; y: number; width: number; height: number },
  text: string,
) {
  expect(box[0], text).toBeGreaterThanOrEqual(region.x);
  expect(box[1], text).toBeGreaterThanOrEqual(region.y);
  expect(box[2], text).toBeLessThanOrEqual(region.x + region.width);
  expect(box[3], text).toBeLessThanOrEqual(region.y + region.height);
}

describe('versions and permissions actual Inter CPU projection (not native pixels)', () => {
  for (const [index, scene] of versionsPermissionsCases().entries()) {
    it(`source case ${index}: bounds actual authored SVG text with nonoverlap at reachable maxima and all authored envelopes, identical both modes`, () => {
      for (const presentation of [
        undefined,
        'speaker-side',
        'speaker-pip',
        'full-frame',
      ] as const) {
        const region = presentation ? getLongformLayout(presentation).model : DIAGRAM_REGIONS.body;
        const meet = Math.min(region.width / 952, region.height / 478),
          base = versionsPermissionsPose(scene, scene.setupAt);
        expect(22 * meet).toBeGreaterThanOrEqual(22);
        for (let page = 0; page < base.pages.length; page++) {
          const pose = { ...base, page };
          const render = (visualMode: 'diagram' | 'hybrid') =>
            renderToStaticMarkup(
              createElement(
                ExplainerProvider,
                {
                  value: {
                    aspect: presentation ? '16:9' : '9:16',
                    presentation,
                    nativeStage: true,
                  },
                },
                createElement(
                  DiagramSurface,
                  null,
                  createElement(VersionsPermissionsDiagram, {
                    scene: { ...scene, visualMode },
                    pose,
                  }),
                ),
              ),
            );
          const markup = render('diagram');
          expect(render('hybrid')).toBe(markup);
          expect(markup).not.toMatch(/NaN|Infinity|ellipsis|textLength|lengthAdjust|<canvas/);
          const boxes: number[][] = [],
            emitted: string[] = [];
          for (const m of markup.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
            const a = attrs(m[1]),
              text = decode(m[2]),
              x = Number(a.x),
              y = Number(a.y),
              size = Number(a['font-size']);
            expect(a['font-family']).toBe(UI_FONT);
            expect(size).toBe(22);
            const g = extent(text, size),
              box = [x + g[0], y + g[1], x + g[2], y + g[3]];
            bounded(
              box,
              x >= 484
                ? { x: 484, y: 8, width: 460, height: 462 }
                : { x: 0, y: 8, width: 484, height: 462 },
              text,
            );
            if ((x === 36 || x === 272) && y >= 98 && y <= 248) {
              bounded(box, { x: x - 12, y: 66, width: 180, height: 210 }, text);
            }
            for (const other of boxes)
              expect(
                box[2] <= other[0] ||
                  box[0] >= other[2] ||
                  box[3] <= other[1] ||
                  box[1] >= other[3],
                text,
              ).toBe(true);
            boxes.push(box);
            bounded(
              [
                region.x + (region.width - 952 * meet) / 2 + box[0] * meet,
                region.y + (region.height - 478 * meet) / 2 + box[1] * meet,
                region.x + (region.width - 952 * meet) / 2 + box[2] * meet,
                region.y + (region.height - 478 * meet) / 2 + box[3] * meet,
              ],
              region,
              text,
            );
            if (x === 500 && y >= 66 && y < 440) emitted.push(text);
          }
          expect(emitted).toEqual(pose.pages[page].lines);
        }
      }
      expect(cache.size).toBeLessThanOrEqual(512);
    });
  }
  it('checks exact shared Chrome wrapping and actual reserved slots geometrically, including wide fitter', () => {
    // DiagramChrome calls these exact labelLines/fitEditorialText functions and uses these slots.
    for (const scene of versionsPermissionsCases())
      for (const presentation of [
        undefined,
        'speaker-side',
        'speaker-pip',
        'full-frame',
      ] as const) {
        const texts = {
          title: scene.label,
          condition: scene.condition ?? '',
          evidence: scene.evidence === 'illustrative' ? 'Illustrative example' : 'Source-stated',
          outcome: scene.outcome,
        };
        const sizes = {
          title: presentation ? 48 : 38,
          condition: presentation ? 28 : 24,
          evidence: 28,
          outcome: presentation ? 36 : 34,
        };
        const regions = presentation
          ? longformTextRegions(getLongformLayout(presentation))
          : DIAGRAM_REGIONS;
        for (const slot of ['title', 'condition', 'evidence', 'outcome'] as const) {
          const text = texts[slot];
          if (!text) continue;
          const region = regions[slot],
            fit = presentation
              ? fitEditorialText(text, region, sizes[slot])
              : {
                  fontSize: sizes[slot],
                  lines: labelLines(
                    text,
                    slot === 'title'
                      ? 24
                      : slot === 'condition'
                        ? 38
                        : slot === 'evidence'
                          ? 32
                          : 27,
                  ),
                };
          expect(fit.fontSize).toBeGreaterThanOrEqual(22);
          expect(fit.lines.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
          const leading = presentation
            ? 1.16
            : slot === 'condition' && fit.lines.length > 2
              ? 1.1
              : 1.15;
          const ascent = font.readInt16BE(table('hhea') + 4) / units,
            descent = font.readInt16BE(table('hhea') + 6) / units;
          fit.lines.forEach((line, row) => {
            const g = extent(line, fit.fontSize),
              baseline =
                region.y +
                ((leading - ascent + descent) * fit.fontSize) / 2 +
                ascent * fit.fontSize +
                row * fit.fontSize * leading,
              x = presentation ? region.x : region.x + (region.width - g[4]) / 2;
            bounded(
              [x + g[0], baseline + g[1], x + g[2], baseline + g[3]],
              region,
              `${slot}: ${line}`,
            );
          });
        }
      }
  });
  it('projects the real box model corners into the authored reserved footer with the fixed camera', () => {
    for (const wide of [
      undefined,
      ...(['speaker-side', 'speaker-pip', 'full-frame'] as const).map(
        (p) => getLongformLayout(p).model,
      ),
    ]) {
      const width = wide?.width ?? 1080,
        height = wide?.height ?? 960,
        meet = wide ? Math.min(width / 952, height / 478) : 1;
      const camera = new PerspectiveCamera(
        VERSIONS_PERMISSIONS_CAMERA.fov,
        width / height,
        0.1,
        100,
      );
      camera.position.set(...VERSIONS_PERMISSIONS_CAMERA.position);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      for (const column of [0, 1]) {
        const p = versionsPermissionsModelPlacement(column, wide);
        // Include the enclosing HybridStage rotation even after opacity reaches zero.
        const scene = versionsPermissionsCases()[0];
        for (let frame = 0; frame <= Math.ceil((scene.resolveAt + 0.8) * 30); frame++) {
          const turn = diagramPose(frame / 30, scene).modelTurn;
          for (const dx of [-70, 70])
            for (const dy of [-4, 4])
              for (const dz of [-4, 4]) {
                const v = new Vector3(
                    p.position[0] + dx * p.scale,
                    p.position[1] + dy * p.scale,
                    dz * p.scale,
                  )
                    .applyAxisAngle(new Vector3(0, 1, 0), turn)
                    .project(camera),
                  x = ((v.x + 1) * width) / 2,
                  y = ((1 - v.y) * height) / 2;
                const originX = wide ? (width - 952 * meet) / 2 : 64,
                  originY = wide ? (height - 478 * meet) / 2 : 262;
                bounded(
                  [x, y, x, y],
                  { x: originX, y: originY + 430 * meet, width: 484 * meet, height: 40 * meet },
                  'replica/access endpoint prop under actual stage rotation',
                );
              }
        }
      }
    }
  });
});
