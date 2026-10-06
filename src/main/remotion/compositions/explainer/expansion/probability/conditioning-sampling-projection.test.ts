import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Vector3 } from 'three';
import { expect, it } from 'vitest';
import { DIAGRAM_REGIONS, projectedDiagramRegion } from '../../diagrams/layout';
import { UI_FONT } from '../../stage';
import {
  ConditioningSamplingDiagram,
  ConditioningSamplingFacts,
} from './conditioning-sampling-Diagram';
import {
  CONDITIONING_SAMPLING_VIEWPORT,
  conditioningSamplingCamera,
  conditioningSamplingFields,
  conditioningSamplingModelPlacement,
  conditioningSamplingPage,
  conditioningSamplingPages,
  conditioningSamplingPlacement,
  conditioningSamplingPose,
  conditioningSamplingView,
} from './conditioning-sampling-poses';
import { conditioningSamplingScenes } from './conditioning-sampling-poses.fixtures';

const colors = { surface: '#f6ecd9', text: '#23100c', accent: '#9f75ff', muted: '#81706a' };
const decode = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
// Shipped Inter cmap, advance widths and glyf boxes: CPU font bounds, not native shaping.
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
function extent(text: string, size: number) {
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
for (const [index, scene] of conditioningSamplingScenes.entries()) {
  it(`${index}: emitted essential facts >=22, every real detail page, full source strings; CPU bounds only`, () => {
    const pages = conditioningSamplingPages(scene);
    const rows = conditioningSamplingView(scene);
    const times = pages.map((_, page) =>
      page === pages.length - 1
        ? scene.resolveAt
        : scene.setupAt + ((page + 0.5) / (pages.length - 1)) * (scene.resolveAt - scene.setupAt),
    );
    for (const [pageIndex, t] of times.entries()) {
      expect(conditioningSamplingPage(t, scene)).toBe(pageIndex);
      const props = { scene, t, colors, pose: conditioningSamplingPose(t, scene) };
      const svg = renderToStaticMarkup(
        createElement(
          'svg',
          null,
          createElement(ConditioningSamplingDiagram, props),
          createElement(ConditioningSamplingFacts, props),
        ),
      );
      const other = renderToStaticMarkup(
        createElement(
          'svg',
          null,
          createElement(ConditioningSamplingDiagram, {
            ...props,
            scene: { ...scene, visualMode: scene.visualMode === 'diagram' ? 'hybrid' : 'diagram' },
          }),
          createElement(ConditioningSamplingFacts, {
            ...props,
            scene: { ...scene, visualMode: scene.visualMode === 'diagram' ? 'hybrid' : 'diagram' },
          }),
        ),
      );
      expect(other).toBe(svg);
      expect(svg).not.toMatch(
        /NaN|Infinity|<canvas|<mesh|clipPath|textLength|<text[^>]*transform=/,
      );
      expect([...svg.matchAll(/data-active-page="true"/g)]).toHaveLength(1);
      expect(svg).toContain(`data-page-id="${pages[pageIndex].id}"`);
      for (const row of rows) {
        expect(svg).toContain(`data-source-identity="${row.groupId}"`);
        expect(decode(svg.replace(/<[^>]*>/g, ''))).toContain(row.label);
        expect(svg).toContain(`data-measurement-state="${row.quantity?.state ?? 'not supplied'}"`);
      }
      const emitted = new Map<string, string>();
      for (const text of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
        const size = Number(text[1].match(/font-size="([^"]*)"/)?.[1]);
        expect(size).toBeGreaterThanOrEqual(22); // RED against prior 3–16px actual facts, not a nominal constant.
        expect(decode(text[1].match(/font-family="([^"]*)"/)?.[1] ?? '')).toBe(UI_FONT);
        const field = text[1].match(/data-essential-field="([^"]*)"/)?.[1];
        if (!field) throw new Error('Essential text missing source identity');
        const lines = [...text[2].matchAll(/<tspan\b([^>]*)>([^<]*)<\/tspan>/g)];
        const content = lines.map((line) => decode(line[2])).join('');
        emitted.set(field, (emitted.get(field) ?? '') + content);
        for (const line of lines) {
          const x = Number(line[1].match(/\bx="([^"]*)"/)?.[1]);
          const y = Number(line[1].match(/\by="([^"]*)"/)?.[1]);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(y - size).toBeGreaterThanOrEqual(0);
          const box = extent(decode(line[2]), size);
          expect(x + box[0]).toBeGreaterThanOrEqual(0);
          expect(y + box[1]).toBeGreaterThanOrEqual(0);
          expect(x + box[2], decode(line[2])).toBeLessThanOrEqual(952);
          expect(y + box[3]).toBeLessThanOrEqual(478);
          expect(y + size * 0.25).toBeLessThanOrEqual(478);
        }
      }
      // Test separate page groups: hidden pages occupy the same slots intentionally.
      for (const page of svg.matchAll(/<g[^>]*data-page-id="[^"]*"[^>]*>([\s\S]*?)<\/g>/g)) {
        const boxes: number[][] = [];
        for (const line of page[1].matchAll(/<tspan\b([^>]*)>([^<]*)<\/tspan>/g)) {
          const x = Number(line[1].match(/\bx="([^"]*)"/)?.[1]),
            y = Number(line[1].match(/\by="([^"]*)"/)?.[1]);
          const [left, top, right, bottom] = extent(decode(line[2]), 22);
          const box = [x + left, y + top, x + right, y + bottom];
          for (const otherBox of boxes)
            expect(
              box[2] <= otherBox[0] ||
                otherBox[2] <= box[0] ||
                box[3] <= otherBox[1] ||
                otherBox[3] <= box[1],
              decode(line[2]),
            ).toBe(true);
          boxes.push(box);
        }
      }
      for (const row of rows)
        for (const field of conditioningSamplingFields(row))
          expect(emitted.get(field.sourceId)).toBe(field.text);
      expect(emitted.get('resolution')).toBe(scene.resolutionText);
      if (scene.storyId === '11') {
        expect(decode(svg.replace(/<[^>]*>/g, ''))).toContain(
          'Original population (not denominator)',
        );
        if (scene.counts.subset.quantity.state === 'known')
          expect(emitted.get(`${scene.eventId}-reference-denominator`)).toBe(
            `Reference denominator: ${scene.counts.subset.quantity.amount.kind === 'rational' ? scene.counts.subset.quantity.amount.value.numerator : ''}`,
          );
      } else expect(svg).not.toMatch(/representative sample|absent members/);
    }
    for (const viewport of [
      CONDITIONING_SAMPLING_VIEWPORT,
      { width: 1376, height: 774, surface: { x: 0, y: 0, width: 1376, height: 774 } },
    ]) {
      const camera = conditioningSamplingCamera(viewport);
      const b = viewport.surface;
      const unit = Math.min(b.width / 952, b.height / 478);
      rows.forEach((row, i) => {
        const p = conditioningSamplingPlacement(i, rows.length);
        expect(p.y + p.height).toBeLessThanOrEqual(422);
        expect(p.trayY - 254 * p.trayScale).toBeGreaterThanOrEqual(p.y);
        expect(p.trayY + 254 * p.trayScale).toBeLessThanOrEqual(p.y + p.height);
        const anchor = conditioningSamplingModelPlacement(i, rows.length, viewport);
        const projected = new Vector3(...anchor.position).project(camera);
        expect(((projected.x + 1) * viewport.width) / 2).toBeCloseTo(
          b.x + (b.width - 952 * unit) / 2 + p.trayX * unit,
          8,
        );
        expect(((1 - projected.y) * viewport.height) / 2).toBeCloseTo(
          b.y + (b.height - 478 * unit) / 2 + p.trayY * unit,
          8,
        );
        const edge = new Vector3(2.54, 0, 0)
          .applyQuaternion(camera.quaternion)
          .multiplyScalar(anchor.scale)
          .add(new Vector3(...anchor.position))
          .project(camera);
        expect(((edge.x - projected.x) * viewport.width) / 2).toBeCloseTo(
          254 * p.trayScale * unit,
          8,
        );
        expect(anchor.quaternion).toEqual(camera.quaternion.toArray());
        if (row.population) expect(row.population.marks.length).toBeLessThanOrEqual(100);
      });
    }
    for (const aspect of ['9:16', '16:9'] as const)
      for (const layout of ['stack', 'stack-flipped', 'pip', 'over'] as const) {
        const rect = projectedDiagramRegion(DIAGRAM_REGIONS.body, layout, aspect);
        expect(rect.y + rect.height).toBeLessThanOrEqual(aspect === '9:16' ? 1920 : 1080);
        expect(rect.width).toBeGreaterThan(0);
      }
  });
}
