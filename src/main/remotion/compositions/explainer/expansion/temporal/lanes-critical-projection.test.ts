import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { getLongformLayout } from '../../../../../../shared/longform-layout';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { DIAGRAM_REGIONS, projectedDiagramRegion } from '../../diagrams/layout';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { stageSafeBox } from '../../types';
import { LanesCriticalDiagram } from './lanes-critical-Diagram';
import { lanesCriticalPages, lanesCriticalPose } from './lanes-critical-poses';
import { lanesCriticalCases } from './lanes-critical-test-fixtures';

// Actual shipped Inter cmap, hmtx and glyf bounds. Cache glyphs, not unbounded text strings.
const font = readFileSync('resources/fonts/Inter.ttf'),
  tables = new Map<string, number>();
for (let i = 0; i < font.readUInt16BE(4); i++) {
  const p = 12 + i * 16;
  tables.set(font.toString('ascii', p, p + 4), font.readUInt32BE(p + 8));
}
function table(name: string): number {
  const p = tables.get(name);
  if (p === undefined) throw new Error(name);
  return p;
}
const units = font.readUInt16BE(table('head') + 18),
  metrics = font.readUInt16BE(table('hhea') + 34),
  longLoca = font.readInt16BE(table('head') + 50) === 1;
const cmap = table('cmap');
let mapping = 0;
for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
  const p = cmap + font.readUInt32BE(cmap + 8 + i * 8);
  if (font.readUInt16BE(p) === 12) mapping = p;
}
const ranges = Array.from({ length: font.readUInt32BE(mapping + 12) }, (_, i) => {
  const p = mapping + 16 + i * 12;
  return [font.readUInt32BE(p), font.readUInt32BE(p + 4), font.readUInt32BE(p + 8)];
});
const cache = new Map<string, readonly number[]>();
function glyph(character: string): readonly number[] {
  const cached = cache.get(character);
  if (cached) return cached;
  const code = character.codePointAt(0) ?? 0,
    range = ranges.find((r) => code >= r[0] && code <= r[1]);
  if (!range) throw new Error(`Missing Inter glyph ${character}`);
  const id = range[2] + code - range[0];
  if (!id) throw new Error('Missing glyph');
  const offset = (g: number): number =>
    longLoca
      ? font.readUInt32BE(table('loca') + g * 4)
      : font.readUInt16BE(table('loca') + g * 2) * 2;
  const p = table('glyf') + offset(id),
    ink = offset(id + 1) > offset(id);
  const result = [
    ink ? font.readInt16BE(p + 2) : 0,
    ink ? -font.readInt16BE(p + 8) : 0,
    ink ? font.readInt16BE(p + 6) : 0,
    ink ? -font.readInt16BE(p + 4) : 0,
    font.readUInt16BE(table('hmtx') + Math.min(id, metrics - 1) * 4),
  ];
  cache.set(character, result);
  return result;
}
function bounds(text: string): number[] {
  let pen = 0,
    left = 0,
    top = 0,
    right = 0,
    bottom = 0;
  for (const c of text) {
    const g = glyph(c);
    left = Math.min(left, pen + g[0]);
    top = Math.min(top, g[1]);
    right = Math.max(right, pen + g[2]);
    bottom = Math.max(bottom, g[3]);
    pen += g[4];
  }
  return [left, top, right, bottom].map((v) => (v * 22) / units);
}
function decode(s: string): string {
  return s.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, k: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[k] ?? k,
  );
}
const placements = [
  { aspect: '9:16', layout: 'stack' },
  { aspect: '9:16', layout: 'stack-flipped' },
  { aspect: '16:9', layout: 'takeover', presentation: 'full-frame' },
  { aspect: '16:9', layout: 'takeover', presentation: 'speaker-side' },
  { aspect: '16:9', layout: 'takeover', presentation: 'speaker-pip' },
] as const;
/** Authored geometry/SSR only: compositor/native rendering is a separate proof. */
it('supported stack and explicit longform presentation envelopes respect source/text/caption reservations', () => {
  const separated = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ): boolean =>
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
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
for (const [index, scene] of lanesCriticalCases().entries())
  it(`Inter glyph bounds, authored planar reservations and exact text: source case ${index}`, () => {
    const pages = lanesCriticalPages(scene),
      samples = new Map<number, number>();
    for (let frame = 0; frame <= 360; frame++) {
      const t = frame / 30;
      samples.set(lanesCriticalPose(scene, t).page, t);
    }
    expect(samples.size).toBe(pages.length);
    for (const [page, t] of samples)
      for (const placement of placements) {
        let prior = '';
        for (const visualMode of ['diagram', 'hybrid'] as const) {
          const svg = renderToStaticMarkup(
            createElement(
              ExplainerProvider,
              {
                value: { ...placement, nativeStage: true },
              },
              createElement(
                DiagramSurface,
                null,
                createElement(LanesCriticalDiagram, {
                  scene: { ...scene, visualMode },
                  t,
                }),
              ),
            ),
          );
          if (prior) expect(svg).toBe(prior);
          prior = svg;
          expect(svg).not.toMatch(/NaN|Infinity|textLength|lengthAdjust|ellipsis|<canvas/);
          expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
          const region =
            'presentation' in placement
              ? getLongformLayout(placement.presentation).model
              : DIAGRAM_REGIONS.body;
          expect(svg).toContain(
            `left:${region.x}px;top:${region.y}px;width:${region.width}px;height:${region.height}px`,
          );
          const scale = Math.min(region.width / 952, region.height / 478);
          const offsetX = region.x + (region.width - 952 * scale) / 2;
          const offsetY = region.y + (region.height - 478 * scale) / 2;
          const boxes: number[][] = [];
          for (const match of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
            const a = Object.fromEntries(
                [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]),
              ),
              text = decode(match[2]);
            expect(a['font-family']).toBe(UI_FONT);
            expect(Number(a['font-size'])).toBe(22);
            const x = Number(a.x),
              y = Number(a.y),
              b = bounds(text),
              box = [x + b[0], y + b[1], x + b[2], y + b[3]];
            expect(box[0], text).toBeGreaterThanOrEqual(x >= 500 ? 488 : 8);
            expect(box[2], text).toBeLessThanOrEqual(x >= 500 ? 944 : 464);
            expect(box[1], text).toBeGreaterThanOrEqual(8);
            expect(box[3], text).toBeLessThanOrEqual(470);
            expect(offsetX + box[0] * scale).toBeGreaterThanOrEqual(region.x);
            expect(offsetX + box[2] * scale).toBeLessThanOrEqual(region.x + region.width);
            expect(offsetY + box[1] * scale).toBeGreaterThanOrEqual(region.y);
            expect(offsetY + box[3] * scale).toBeLessThanOrEqual(region.y + region.height);
            for (const o of boxes)
              expect(
                box[0] >= o[2] || box[2] <= o[0] || box[1] >= o[3] || box[3] <= o[1],
                `${text}: overlap`,
              ).toBe(true);
            boxes.push(box);
          }
          const active = svg.match(
            /<g[^>]*data-page-id="[^"]*"[^>]*data-active="true">([\s\S]*?)<\/g>/,
          )?.[1];
          expect(active).toBeDefined();
          expect(
            [...(active ?? '').matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)]
              .map((m) => decode(m[1]))
              .slice(0, -1),
          ).toEqual(pages[page].lines);
          expect([...svg.matchAll(/data-page-id=/g)]).toHaveLength(1);
        }
      }
  });
