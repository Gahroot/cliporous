import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { SearchLandscapeDiagram } from './search-landscape-Diagram';
import { searchPages, searchPose } from './search-landscape-poses';
import { searchCases } from './search-landscape-test-fixtures';

// Real shipped Inter cmap/advance/glyf bounds; CPU bounds, not native shaping.
const font = readFileSync('resources/fonts/Inter.ttf');
const tables = new Map<string, number>();
for (let i = 0; i < font.readUInt16BE(4); i++) {
  const p = 12 + i * 16;
  tables.set(font.toString('ascii', p, p + 4), font.readUInt32BE(p + 8));
}
const table = (name: string) => {
  const p = tables.get(name);
  if (p === undefined) throw new Error(name);
  return p;
};
const units = font.readUInt16BE(table('head') + 18),
  metrics = font.readUInt16BE(table('hhea') + 34),
  longLoca = font.readInt16BE(table('head') + 50) === 1;
const cmap = table('cmap');
let mapping = 0;
for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
  const p = cmap + font.readUInt32BE(cmap + 8 + i * 8);
  if (font.readUInt16BE(p) === 12) mapping = p;
}
function bounds(text: string, size: number) {
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
  return [left, top, right, bottom].map((v) => (v * size) / units);
}
const decode = (s: string) =>
  s.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, k: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[k] ?? k,
  );
const attrs = (s: string) =>
  Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]));
it('actual Inter glyphs at actual placements: every accepted max page, both modes/aspects, no clipping or overlap', () => {
  for (const scene of searchCases())
    for (const visualMode of ['diagram', 'hybrid'] as const)
      for (const aspect of ['9:16', '16:9'] as const) {
        const pages = searchPages(scene),
          seen = new Set<number>();
        for (let frame = 0; frame <= 360; frame++) {
          const t = frame / 30,
            pose = searchPose(scene, t);
          if (seen.has(pose.page) || pose.reveal < 1) continue;
          seen.add(pose.page);
          const svg = renderToStaticMarkup(
            createElement(
              ExplainerProvider,
              {
                value: {
                  aspect,
                  layout: aspect === '16:9' ? 'takeover' : 'stack',
                  nativeStage: true,
                },
              },
              createElement(
                DiagramSurface,
                null,
                createElement(SearchLandscapeDiagram, {
                  scene: { ...scene, visualMode },
                  t,
                }),
              ),
            ),
          );
          expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
          expect(svg).not.toMatch(/NaN|Infinity|textLength|lengthAdjust|ellipsis|<canvas/);
          const active = [
            ...svg.matchAll(
              /<g\b[^>]*data-page-id="[^"]*"[^>]*data-active="true"[^>]*>([\s\S]*?)<\/g>/g,
            ),
          ][0]?.[1];
          expect(active).toBeDefined();
          const visible = svg.replace(
            /<g\b[^>]*data-page-id="[^"]*"[^>]*data-active="false"[^>]*>[\s\S]*?<\/g>/g,
            '',
          );
          const boxes: number[][] = [];
          for (const m of visible.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
            const a = attrs(m[1]),
              text = decode(m[2]);
            if (!text) continue;
            expect(a['font-family']).toBe(UI_FONT);
            expect(Number(a['font-size'])).toBeGreaterThanOrEqual(22);
            const x = Number(a.x),
              y = Number(a.y),
              b = bounds(text, Number(a['font-size'])),
              box = [x + b[0], y + b[1], x + b[2], y + b[3]];
            expect(box[0], text).toBeGreaterThanOrEqual(x >= 500 ? 488 : 0);
            expect(box[2], text).toBeLessThanOrEqual(x >= 500 ? 944 : 484);
            expect(box[1], text).toBeGreaterThanOrEqual(8);
            expect(box[3], text).toBeLessThanOrEqual(470);
            for (const other of boxes)
              expect(
                box[0] >= other[2] ||
                  box[2] <= other[0] ||
                  box[1] >= other[3] ||
                  box[3] <= other[1],
                `${text}: glyph overlap`,
              ).toBe(true);
            boxes.push(box);
          }
          const emitted = [...(active ?? '').matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) =>
            decode(m[1]),
          );
          expect(emitted.slice(0, -1)).toEqual(pages[pose.page].lines);
          for (const entity of scene.entities)
            expect(svg).toContain(`data-entity-id="${entity.id}"`);
        }
        expect(seen.size).toBe(pages.length);
      }
}, 30000);
