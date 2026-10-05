import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { getLongformLayout } from '../../../../../../shared/longform-layout';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { DIAGRAM_REGIONS } from '../../diagrams/layout';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { DeviationMultiplesDiagram } from './deviation-multiples-Diagram';
import { DEVIATION_MULTIPLES_CAMERA, deviationModelPlacement } from './deviation-multiples-models';
import {
  DEVIATION_DETAIL,
  deviationMultiplesPose,
  deviationPages,
  deviationPositions,
  deviationRecords,
  deviationWrap,
} from './deviation-multiples-poses';
import { deviationMultiplesCases } from './deviation-multiples-poses.test';

// Shipped Inter's real cmap, advances and glyph boxes. CPU bounds, not native shaping or GPU proof.
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
const units = font.readUInt16BE(table('head') + 18);
const metrics = font.readUInt16BE(table('hhea') + 34);
const longLoca = font.readInt16BE(table('head') + 50) === 1;
const cmap = table('cmap');
let mapping = 0;
for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
  const p = cmap + font.readUInt32BE(cmap + 8 + i * 8);
  if (font.readUInt16BE(p) === 12) mapping = p;
}
const glyphExtents = new Map<string, number[]>();
function extent(text: string, size: number) {
  const key = `${size}:${text}`,
    cached = glyphExtents.get(key);
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
  const box = [left, top, right, bottom].map((v) => (v * size) / units);
  glyphExtents.set(key, box);
  return box;
}
const decode = (s: string) =>
  s.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, key: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[key] ?? key,
  );
const attrs = (s: string) =>
  Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]));

describe('deviation/multiples shipped Inter glyph projection (CPU, not native shaping)', () => {
  it('bounds actual emitted glyphs with pairwise nonoverlap and retains every full source string across all pages, modes and stage aspects', () => {
    for (const scene of deviationMultiplesCases())
      for (const presentation of [
        undefined,
        'speaker-side',
        'speaker-pip',
        'full-frame',
      ] as const) {
        const aspect = presentation ? '16:9' : '9:16';
        const native = presentation ? getLongformLayout(presentation).model : DIAGRAM_REGIONS.body;
        const meet = Math.min(native.width / 952, native.height / 478);
        const origin = [
          native.x + (native.width - 952 * meet) / 2,
          native.y + (native.height - 478 * meet) / 2,
        ];
        const pages = deviationPages(scene),
          visited = new Set<number>();
        for (let frame = 0; frame <= 360; frame++) {
          const pose = deviationMultiplesPose(scene, frame / 30);
          visited.add(pose.page);
          const markups = (['diagram', 'hybrid'] as const).map((visualMode) =>
            renderToStaticMarkup(
              createElement(
                ExplainerProvider,
                {
                  value: {
                    aspect,
                    presentation,
                    layout: aspect === '16:9' ? 'takeover' : 'stack',
                    nativeStage: true,
                  },
                },
                createElement(
                  DiagramSurface,
                  null,
                  createElement(DeviationMultiplesDiagram, {
                    scene: { ...scene, visualMode },
                    pose,
                  }),
                ),
              ),
            ),
          );
          expect(markups[0]).toBe(markups[1]);
          const svg = markups[0];
          expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
          const surfaceStyle = attrs(svg.match(/<svg\b([^>]*)>/)?.[1] ?? '').style;
          for (const token of [
            `left:${native.x}px`,
            `top:${native.y}px`,
            `width:${native.width}px`,
            `height:${native.height}px`,
          ])
            expect(surfaceStyle).toContain(token);
          expect(svg).not.toMatch(/NaN|Infinity|textLength|lengthAdjust|ellipsis|<canvas/);
          const emitted: string[] = [],
            boxes: number[][] = [],
            identities: string[] = [];
          for (const m of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
            const a = attrs(m[1]),
              text = decode(m[2]),
              x = Number(a.x),
              y = Number(a.y),
              size = Number(a['font-size']);
            expect(a['font-family']).toBe(UI_FONT);
            expect(size).toBe(DEVIATION_DETAIL.font);
            expect(size * meet).toBeGreaterThanOrEqual(22);
            const glyph = extent(text, size),
              box = [x + glyph[0], y + glyph[1], x + glyph[2], y + glyph[3]];
            const region = x >= 484 ? [484, 8, 944, 470] : [0, 8, 484, 470];
            expect(box[0], text).toBeGreaterThanOrEqual(region[0]);
            expect(box[1], text).toBeGreaterThanOrEqual(region[1]);
            expect(box[2], text).toBeLessThanOrEqual(region[2]);
            expect(box[3], text).toBeLessThanOrEqual(region[3]);
            for (const other of boxes)
              expect(
                box[2] <= other[0] ||
                  box[0] >= other[2] ||
                  box[3] <= other[1] ||
                  box[1] >= other[3],
                text,
              ).toBe(true);
            boxes.push(box);
            const actual = [
              origin[0] + box[0] * meet,
              origin[1] + box[1] * meet,
              origin[0] + box[2] * meet,
              origin[1] + box[3] * meet,
            ];
            expect(actual[0]).toBeGreaterThanOrEqual(native.x);
            expect(actual[1]).toBeGreaterThanOrEqual(native.y);
            expect(actual[2]).toBeLessThanOrEqual(native.x + native.width);
            expect(actual[3]).toBeLessThanOrEqual(native.y + native.height);
            if (x === 500 && y >= DEVIATION_DETAIL.y && y < 440) emitted.push(text);
            if (x === 500 && y < DEVIATION_DETAIL.y) identities.push(text);
          }
          expect(emitted).toEqual(pages[pose.page].lines);
          const focused = deviationRecords(scene)[pages[pose.page].record].quantity;
          if (!('actor' in focused)) throw new Error('Expected source quantity');
          expect(identities).toEqual(deviationWrap(focused.actor));
          const positions = deviationPositions(scene);
          const circles = [...svg.matchAll(/<circle\b([^>]*)>/g)].map((m) => attrs(m[1]));
          expect(circles).toHaveLength(positions.flat().length);
          const expected = positions.flatMap((values, i) =>
            values.map((v) => [40 + 400 * v, 94 + i * 64]),
          );
          circles.forEach((a, i) => {
            expect(Number(a.cx)).toBe(expected[i][0]);
            expect(Number(a.cy)).toBe(expected[i][1]);
          });
          for (const m of svg.matchAll(/<rect\b([^>]*)>/g)) {
            const a = attrs(m[1]);
            expect(Number(a.x) + Number(a.width)).toBeLessThanOrEqual(952);
            expect(Number(a.y) + Number(a.height)).toBeLessThanOrEqual(478);
          }
        }
        expect(visited.size).toBe(pages.length);
      }
  }, 90000);
  it('projects real portrait/wide device envelopes into their reserved footer via uniform meet and a fixed camera', () => {
    for (const wide of [
      undefined,
      ...(['speaker-side', 'speaker-pip', 'full-frame'] as const).map(
        (p) => getLongformLayout(p).model,
      ),
    ]) {
      const width = wide?.width ?? 1080,
        height = wide?.height ?? 960;
      const meet = wide ? Math.min(width / 952, height / 478) : 1;
      const camera = new PerspectiveCamera(
        DEVIATION_MULTIPLES_CAMERA.fov,
        width / height,
        0.1,
        100,
      );
      camera.position.set(...DEVIATION_MULTIPLES_CAMERA.position);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      for (let index = 0; index < 4; index++) {
        const p = deviationModelPlacement(index, wide),
          v = new Vector3(...p.position).project(camera);
        expect(((v.x + 1) * width) / 2).toBeCloseTo(
          wide ? (width - 952 * meet) / 2 + (110 + index * 110) * meet : 174 + index * 110,
          8,
        );
        expect(((1 - v.y) * height) / 2).toBeCloseTo(
          wide ? (height - 478 * meet) / 2 + 440 * meet : 702,
          8,
        );
        for (const dx of [-1.375, 1.375])
          for (const dy of [-0.9, 0.8]) {
            const corner = new Vector3(
              p.position[0] + dx * p.scale,
              p.position[1] + dy * p.scale,
              0,
            ).project(camera);
            const x = ((corner.x + 1) * width) / 2,
              y = ((1 - corner.y) * height) / 2;
            const left = wide ? (width - 952 * meet) / 2 : 64;
            const top = wide ? (height - 478 * meet) / 2 : 262;
            expect(x).toBeGreaterThan(left);
            expect(x).toBeLessThan(left + 484 * meet);
            expect(y).toBeGreaterThan(top + 420 * meet);
            expect(y).toBeLessThan(top + 470 * meet);
          }
      }
    }
  });
});
