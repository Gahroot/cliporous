import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { getLongformLayout } from '../../../../../../shared/longform-layout';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { DelayPhaseDiagram } from './delay-phase-Diagram';
import {
  DELAY_PHASE_AXIS,
  delayPhaseExtent,
  delayPhasePages,
  delayPhasePose,
} from './delay-phase-poses';
import {
  delayPhaseCases,
  delayPhaseNumericSeed,
  delayPhasePacket,
  parseDelayPhase,
} from './delay-phase-test-fixtures';

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
const glyphCache = new Map<number, number>();
function bounds(text: string, size: number) {
  let pen = 0,
    left = 0,
    right = 0,
    top = 0,
    bottom = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    let glyph = glyphCache.get(code) ?? 0;
    for (let i = 0; glyph === 0 && i < font.readUInt32BE(mapping + 12); i++) {
      const p = mapping + 16 + i * 12;
      if (code >= font.readUInt32BE(p) && code <= font.readUInt32BE(p + 4)) {
        glyph = font.readUInt32BE(p + 8) + code - font.readUInt32BE(p);
        break;
      }
    }
    expect(glyph, character).toBeGreaterThan(0);
    if (glyphCache.size < 256) glyphCache.set(code, glyph);
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
  return [left, top, right, bottom, pen].map((v) => (v * size) / units);
}
const decode = (s: string) =>
  s.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, k: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[k] ?? k,
  );
const attrs = (s: string) =>
  Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]));
it('real parser SVG endpoints share the labelled 100..800 exact rational domain; fraction, zero, subpixel positive and near-limit positive', () => {
  const original = delayPhasePacket.stories.find((s) => s.id === '45');
  if (!original) throw new Error('Missing real source story');
  const seeds = [
    original,
    delayPhaseNumericSeed({ numerator: 1, denominator: 4 }, { numerator: 1, denominator: 1 }),
    delayPhaseNumericSeed({ numerator: 0, denominator: 1 }, { numerator: 86400, denominator: 1 }),
    delayPhaseNumericSeed(
      { numerator: 1, denominator: 1000000000 },
      { numerator: 86400, denominator: 1 },
    ),
    delayPhaseNumericSeed(
      { numerator: 863999999, denominator: 10000 },
      { numerator: 86400, denominator: 1 },
    ),
  ];
  for (const seed of seeds)
    for (const mode of ['diagram', 'hybrid'] as const) {
      const scene = parseDelayPhase(seed, mode);
      if (scene.storyId !== '45') throw new Error('Expected delay story');
      const records = scene.records.filter((r) => r.dimension === 'latency');
      for (const r of records) {
        const q = r.quantity;
        if (!('amount' in q) || q.amount.kind !== 'rational')
          throw new Error('Expected source numeric latency');
        const pages = delayPhasePages(scene),
          page = pages.findIndex((p) => p.recordId === r.id);
        const t =
          scene.setupAt + ((page + 0.5) * (scene.resolveAt - scene.setupAt)) / (pages.length - 1);
        const svg = renderToStaticMarkup(
          createElement('svg', null, createElement(DelayPhaseDiagram, { scene, t })),
        );
        const extent = delayPhaseExtent(scene, r.id);
        if (!extent) throw new Error('Missing represented numeric extent');
        const expected =
          ((q.amount.value.numerator * extent.upper.denominator) /
            (q.amount.value.denominator * extent.upper.numerator)) *
          700;
        expect(extent.width).toBeCloseTo(expected, 10);
        expect(svg).toContain('data-axis-start="100" data-axis-end="800"');
        const bar = svg.match(/<rect\b([^>]*data-quantity-bar="true"[^>]*)>/);
        if (q.amount.value.numerator === 0) {
          expect(bar).toBeNull();
          expect(svg).toContain('data-zero-marker="true"');
          expect(svg).not.toContain('data-positive-subpixel');
        } else {
          expect(bar).not.toBeNull();
          const a = attrs(bar?.[1] ?? '');
          expect(Number(a.x)).toBe(DELAY_PHASE_AXIS.start);
          expect(Number(a.width)).toBeCloseTo(expected, 10);
          expect(Number(a.width)).toBeGreaterThan(0);
          expect(svg).not.toContain('data-zero-marker');
          if (r === records[1]) expect(Number(a.x) + Number(a.width)).toBe(800);
          if (expected < 1) {
            expect(svg).toContain('data-positive-subpixel="true"');
            expect(svg).toContain('positive below 1px');
          }
        }
      }
    }
});
it('shipped Inter glyph placements: all parser-accepted maximum pages, both modes, authored landscape envelopes', () => {
  let count = 0;
  for (const scene of delayPhaseCases()) {
    const pages = delayPhasePages(scene);
    for (let page = 0; page < pages.length; page++) {
      const t =
        page === pages.length - 1
          ? scene.resolveAt + 1
          : scene.setupAt + ((page + 0.5) * (scene.resolveAt - scene.setupAt)) / (pages.length - 1);
      expect(delayPhasePose(scene, t).page).toBe(page);
      const svg = renderToStaticMarkup(
        createElement('svg', null, createElement(DelayPhaseDiagram, { scene, t })),
      );
      expect(svg).not.toMatch(/NaN|Infinity|textLength|lengthAdjust|ellipsis|<canvas/);
      const boxes: number[][] = [];
      for (const m of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
        const a = attrs(m[1]),
          text = decode(m[2]);
        if (!text) continue;
        expect(a['font-family']).toBe(UI_FONT);
        expect(Number(a['font-size'])).toBeGreaterThanOrEqual(22);
        const b = bounds(text, Number(a['font-size'])),
          x = Number(a.x) - (a['text-anchor'] === 'end' ? b[4] : 0),
          y = Number(a.y);
        const box = [x + b[0], y + b[1], x + b[2], y + b[3]];
        expect(box[0], text).toBeGreaterThanOrEqual(8);
        expect(box[2], text).toBeLessThanOrEqual(944);
        expect(box[1], text).toBeGreaterThanOrEqual(8);
        expect(box[3], text).toBeLessThanOrEqual(470);
        for (const other of boxes)
          expect(
            box[0] >= other[2] || box[2] <= other[0] || box[1] >= other[3] || box[3] <= other[1],
            `${text}: glyph overlap`,
          ).toBe(true);
        boxes.push(box);
      }
      const source = svg.match(/<g\b[^>]*data-source-page="current"[^>]*>([\s\S]*?)<\/g>/)?.[1];
      expect(source).toBeDefined();
      expect(
        [...(source ?? '').matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => decode(m[1])),
      ).toEqual(pages[page].lines);
      count++;
    }
    for (const presentation of ['full-frame', 'speaker-side', 'speaker-pip'] as const) {
      const svg = renderToStaticMarkup(
        createElement(
          ExplainerProvider,
          {
            value: { aspect: '16:9', layout: 'takeover', nativeStage: true, presentation },
          },
          createElement(
            DiagramSurface,
            null,
            createElement(DelayPhaseDiagram, { scene, t: scene.resolveAt + 1 }),
          ),
        ),
      );
      const region = getLongformLayout(presentation).model;
      const scale = Math.min(region.width / 952, region.height / 478);
      expect(22 * scale).toBeGreaterThanOrEqual(22);
      expect(svg).toContain(`width:${region.width}px`);
      expect(svg).toContain(`height:${region.height}px`);
      expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
      expect(svg).not.toMatch(/<canvas|textLength|lengthAdjust|ellipsis/);
      const offsetX = region.x + (region.width - 952 * scale) / 2,
        offsetY = region.y + (region.height - 478 * scale) / 2;
      for (const m of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
        const a = attrs(m[1]),
          b = bounds(decode(m[2]), Number(a['font-size'])),
          x = Number(a.x) - (a['text-anchor'] === 'end' ? b[4] : 0);
        expect(offsetX + (x + b[0]) * scale).toBeGreaterThanOrEqual(region.x);
        expect(offsetX + (x + b[2]) * scale).toBeLessThanOrEqual(region.x + region.width);
        expect(offsetY + (Number(a.y) + b[1]) * scale).toBeGreaterThanOrEqual(region.y);
        expect(offsetY + (Number(a.y) + b[3]) * scale).toBeLessThanOrEqual(
          region.y + region.height,
        );
      }
    }
  }
  expect(glyphCache.size).toBeLessThanOrEqual(256);
  console.info(
    `delay-phase Inter CPU glyph proof: ${count} source pages; 22px authored minimum; landscape full-frame/speaker-side/speaker-pip; compact scaled layouts not certified`,
  );
});
