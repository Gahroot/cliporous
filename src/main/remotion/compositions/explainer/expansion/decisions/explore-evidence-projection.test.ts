import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  exploreEvidencePages,
  exploreEvidencePageTimes,
  exploreEvidencePose,
  exploreEvidenceRecords,
} from './explore-evidence-poses';
import { exploreEvidenceMarkup, exploreEvidenceTestScenes } from './explore-evidence-test-fixtures';

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
if (!mapping) throw new Error('Missing shipped Inter format-12 cmap');
const groups = Object.freeze(
  Array.from({ length: font.readUInt32BE(mapping + 12) }, (_, i) => {
    const p = mapping + 16 + i * 12;
    return Object.freeze({
      first: font.readUInt32BE(p),
      last: font.readUInt32BE(p + 4),
      glyph: font.readUInt32BE(p + 8),
    });
  }),
);
const loca = table('loca'),
  glyf = table('glyf'),
  hmtx = table('hmtx');
const offset = (id: number) =>
  longLoca ? font.readUInt32BE(loca + id * 4) : font.readUInt16BE(loca + id * 2) * 2;
// Finite immutable table: one entry per glyph actually shipped in Inter, built once.
const glyphMetrics = Object.freeze(
  Array.from({ length: font.readUInt16BE(table('maxp') + 4) }, (_, id) => {
    const start = offset(id),
      hasInk = offset(id + 1) > start,
      p = glyf + start;
    return Object.freeze({
      hasInk,
      left: hasInk ? font.readInt16BE(p + 2) : 0,
      right: hasInk ? font.readInt16BE(p + 6) : 0,
      top: hasInk ? -font.readInt16BE(p + 8) : 0,
      bottom: hasInk ? -font.readInt16BE(p + 4) : 0,
      advance: font.readUInt16BE(hmtx + Math.min(id, metrics - 1) * 4),
    });
  }),
);
function createExtent() {
  // Test-local, bounded caches; unsupported glyphs are asserted and never cached as valid.
  const characters = new Map<string, (typeof glyphMetrics)[number]>();
  const texts = new Map<string, ReadonlyMap<number, readonly number[]>>();
  let cachedExtents = 0;
  return (text: string, size: number): readonly number[] => {
    const cached = texts.get(text)?.get(size);
    if (cached) return cached;
    let pen = 0,
      left = 0,
      right = 0,
      top = 0,
      bottom = 0;
    for (const character of text) {
      let metric = characters.get(character);
      if (!metric) {
        const code = character.codePointAt(0) ?? 0;
        let low = 0,
          high = groups.length - 1,
          glyph = 0;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2),
            group = groups[middle];
          if (code < group.first) high = middle - 1;
          else if (code > group.last) low = middle + 1;
          else {
            glyph = group.glyph + code - group.first;
            break;
          }
        }
        expect(glyph, character).toBeGreaterThan(0);
        metric = glyphMetrics[glyph];
        expect(metric, character).toBeDefined();
        if (characters.size < 1024) characters.set(character, metric);
      }
      if (metric.hasInk) {
        left = Math.min(left, pen + metric.left);
        right = Math.max(right, pen + metric.right);
        top = Math.min(top, metric.top);
        bottom = Math.max(bottom, metric.bottom);
      }
      pen += metric.advance;
    }
    const result = Object.freeze([left, top, right, bottom, pen].map((v) => (v * size) / units));
    if (cachedExtents < 4096) {
      texts.set(text, new Map([...(texts.get(text) ?? []), [size, result]]));
      cachedExtents++;
    }
    return result;
  };
}
const decode = (s: string) =>
  s.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, key: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[key] ?? key,
  );
const attrs = (s: string) =>
  Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]));
describe('ordered decisions planar placement and shipped Inter bounds (CPU/SSR)', () => {
  it('keeps complete pages, stable IDs and nonoverlapping actual glyph boxes in both modes/layout aspects', () => {
    const extent = createExtent();
    expect(() => extent(String.fromCodePoint(0x10ffff), 22)).toThrow();
    for (const original of exploreEvidenceTestScenes())
      for (const aspect of ['9:16', '16:9'] as const) {
        for (const t of exploreEvidencePageTimes(original)) {
          const diagram = exploreEvidenceMarkup({ ...original, visualMode: 'diagram' }, t, aspect);
          expect(exploreEvidenceMarkup({ ...original, visualMode: 'hybrid' }, t, aspect)).toBe(
            diagram,
          );
          expect(diagram).not.toMatch(/<canvas|NaN|Infinity|…|textLength|lengthAdjust/);
          expect(diagram).toContain('preserveAspectRatio="xMidYMid meet"');
          const boxes: number[][] = [];
          for (const match of diagram.matchAll(/<text([^>]*)>([\s\S]*?)<\/text>/g)) {
            const a = attrs(match[1]);
            if (!a['data-source-text']) {
              const [left, top, right, bottom, advance] = extent(
                decode(match[2]),
                Number(a['font-size']),
              );
              expect(a['text-anchor']).toBe('middle');
              const x = Number(a.x) - advance / 2,
                y = Number(a.y);
              const box = [x + left, y + top, x + right, y + bottom];
              for (const previous of boxes)
                expect(
                  box[2] <= previous[0] ||
                    box[0] >= previous[2] ||
                    box[3] <= previous[1] ||
                    box[1] >= previous[3],
                ).toBe(true);
              boxes.push(box);
              continue;
            }
            const size = Number(a['font-size']),
              x = Number(a['data-x']),
              y = Number(a['data-y']);
            expect(size).toBeGreaterThanOrEqual(22);
            const lines = [...match[2].matchAll(/<tspan[^>]*>([\s\S]*?)<\/tspan>/g)].map((m) =>
              decode(m[1]),
            );
            expect(lines.join('')).toBe(a['data-source-text']);
            lines.forEach((line, i) => {
              const [left, top, right, bottom] = extent(line, size),
                baseline = y + size + i * 24;
              expect(right).toBeLessThanOrEqual(Number(a['data-width']));
              const box = [x + left, baseline + top, x + right, baseline + bottom];
              expect(box[0]).toBeGreaterThanOrEqual(0);
              expect(box[2]).toBeLessThanOrEqual(952);
              expect(box[1]).toBeGreaterThanOrEqual(0);
              expect(box[3]).toBeLessThanOrEqual(478);
              for (const previous of boxes)
                expect(
                  box[2] <= previous[0] ||
                    box[0] >= previous[2] ||
                    box[3] <= previous[1] ||
                    box[1] >= previous[3],
                ).toBe(true);
              boxes.push(box);
            });
          }
          for (const entity of original.entities)
            expect(diagram).toContain(`data-option-id="${entity.id}"`);
        }
      }
  });
  it('preserves the actual current page, source order and option references for every frame and held end', () => {
    const escapeAttribute = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    for (const original of exploreEvidenceTestScenes()) {
      const pages = exploreEvidencePages(original),
        seen = new Set<number>();
      for (let frame = 0; frame <= 360; frame++) {
        const t = frame / 30,
          index = exploreEvidencePose(original, t).pageIndex;
        seen.add(index);
        const svg = exploreEvidenceMarkup(original, t);
        expect(svg).toContain(`data-page-id="${pages[index].id}"`);
        expect(svg).toContain(`data-source-text="${escapeAttribute(pages[index].text)}"`);
        for (const entity of original.entities)
          expect(svg).toContain(`data-option-id="${entity.id}"`);
        for (const record of exploreEvidenceRecords(original))
          expect(svg).toContain(
            `data-record-id="${record.id}" data-option-ref="${record.optionId}" data-state="${record.state}"`,
          );
      }
      expect(seen.size).toBe(pages.length);
      expect(exploreEvidenceMarkup(original, 100)).toBe(exploreEvidenceMarkup(original, 12));
    }
  }, 30000);
});
