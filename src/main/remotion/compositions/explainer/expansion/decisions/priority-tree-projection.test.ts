import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { DIAGRAM_REGIONS, projectedDiagramRegion } from '../../diagrams/layout';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { PriorityTreeDiagram, PriorityTreeFacts } from './priority-tree-Diagram';
import {
  PRIORITY_TREE_VIEWPORT,
  priorityTreeAnchors,
  priorityTreeCamera,
  priorityTreeModelPlacement,
  priorityTreePages,
  priorityTreePose,
} from './priority-tree-poses';
import { parsePriorityTree, priorityTreeFixtures } from './priority-tree-test-fixtures';

// Real shipped default Inter cmap, advances and glyf ink boxes. CPU bounds, not browser shaping.
const font = readFileSync('resources/fonts/Inter.ttf');
const tables = new Map<string, number>();
for (let i = 0; i < font.readUInt16BE(4); i++) {
  const p = 12 + i * 16;
  tables.set(font.toString('ascii', p, p + 4), font.readUInt32BE(p + 8));
}
function table(name: string): number {
  const p = tables.get(name);
  if (p === undefined) throw new Error(`Missing Inter table ${name}`);
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
function extent(text: string, size: number): number[] {
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
    if (!glyph) throw new Error(`Missing shipped Inter glyph ${character}`);
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
  Object.fromEntries([...s.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]));

describe('priority/tree actual current-page planar glyphs and camera placement (CPU)', () => {
  for (const [index, fixture] of priorityTreeFixtures().entries()) {
    it(`${fixture.id}/${index}: every accepted page, both modes and offered layouts; no shrinking/cropping/overlap`, () => {
      const base = parsePriorityTree(fixture);
      const pages = priorityTreePages(base);
      const times = pages.map((_, i) =>
        i === pages.length - 1
          ? base.resolveAt + 0.25
          : base.actionAt + ((i + 0.5) / (pages.length - 1)) * (base.resolveAt - base.actionAt),
      );
      for (const visualMode of ['diagram', 'hybrid'] as const)
        for (const layout of ['stack', 'stack-flipped'] as const)
          for (const aspect of ['9:16', '16:9'] as const) {
            const scene = { ...base, visualMode, layout };
            for (const [pageIndex, t] of times.entries()) {
              expect(priorityTreePose(scene, t).page).toBe(pageIndex);
              const svg = renderToStaticMarkup(
                createElement(
                  ExplainerProvider,
                  {
                    value: { aspect, layout, nativeStage: true },
                  },
                  createElement(DiagramSurface, null, [
                    createElement(PriorityTreeDiagram, { key: 'diagram', scene, t }),
                    createElement(PriorityTreeFacts, { key: 'facts', scene, t }),
                  ]),
                ),
              );
              expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
              expect(svg).not.toMatch(
                /NaN|Infinity|textLength|lengthAdjust|ellipsis|…|<canvas|<mesh/,
              );
              expect([...svg.matchAll(/data-page-id=/g)]).toHaveLength(1);
              expect(svg).toContain(`data-page-id="${pages[pageIndex].id}"`);
              const boxes: number[][] = [],
                facts: string[] = [];
              for (const m of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
                const a = attrs(m[1]);
                expect(a['font-family']).toBe(UI_FONT);
                expect(Number(a['font-size'])).toBeGreaterThanOrEqual(22);
                expect(a['xml:space']).toBe('preserve');
                let y = Number(a.y),
                  complete = '';
                for (const span of m[2].matchAll(/<tspan\b([^>]*)>([^<]*)<\/tspan>/g)) {
                  const s = attrs(span[1]),
                    text = decode(span[2]);
                  complete += text;
                  y += Number(s.dy);
                  const x = Number(s.x),
                    ink = extent(text, Number(a['font-size']));
                  const box = [x + ink[0], y + ink[1], x + ink[2], y + ink[3]];
                  const reservation = Number(a.y) >= 290 ? [28, 270, 924, 466] : [0, 0, 952, 258];
                  expect(box[0], text).toBeGreaterThanOrEqual(reservation[0]);
                  expect(box[1], text).toBeGreaterThanOrEqual(reservation[1]);
                  expect(box[2], text).toBeLessThanOrEqual(reservation[2]);
                  expect(box[3], text).toBeLessThanOrEqual(reservation[3]);
                  if (text.trim()) boxes.push(box);
                  if (scene.storyId === '27' && Number(a.y) >= 60 && Number(a.y) < 264) {
                    const railX = x < 492 ? 16 : 492;
                    expect(box[0]).toBeGreaterThanOrEqual(railX + 48);
                    expect(box[2]).toBeLessThanOrEqual(railX + 440);
                  }
                }
                if (Number(a.y) >= 290) facts.push(complete);
              }
              expect(facts).toEqual([
                pages[pageIndex].title,
                pages[pageIndex].context,
                pages[pageIndex].text,
              ]);
              for (let i = 0; i < boxes.length; i++)
                for (let j = i + 1; j < boxes.length; j++) {
                  const a = boxes[i],
                    b = boxes[j];
                  expect(
                    a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1],
                    JSON.stringify([a, b]),
                  ).toBe(true);
                }
              for (const m of svg.matchAll(/<rect\b([^>]*)>/g)) {
                const a = attrs(m[1]);
                expect(Number(a.x)).toBeGreaterThanOrEqual(0);
                expect(Number(a.y)).toBeGreaterThanOrEqual(0);
                expect(Number(a.x) + Number(a.width)).toBeLessThanOrEqual(952);
                expect(Number(a.y) + Number(a.height)).toBeLessThanOrEqual(478);
              }
              if (scene.storyId === '28') {
                for (const edge of scene.branches) {
                  expect(svg).toContain(`data-from-id="${edge.fromId}"`);
                  expect(svg).toContain(`data-to-id="${edge.toId}"`);
                  expect(svg).toContain(
                    `data-test="${edge.test.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`,
                  );
                }
                expect([...svg.matchAll(/data-source-chosen="true"/g)]).toHaveLength(
                  scene.resolution.state === 'source-chosen' && t > scene.resolveAt ? 1 : 0,
                );
              }
            }
            const rect = projectedDiagramRegion(DIAGRAM_REGIONS.body, layout, aspect);
            expect(rect.x).toBeGreaterThanOrEqual(0);
            expect(rect.y).toBeGreaterThanOrEqual(0);
            expect(rect.x + rect.width).toBeLessThanOrEqual(aspect === '9:16' ? 1080 : 1920);
            expect(rect.y + rect.height).toBeLessThanOrEqual(aspect === '9:16' ? 1920 : 1080);
          }
    }, 30000);
  }
  it('independently forward-projects authored anchors and scale in portrait and non-square wide model surfaces', () => {
    for (const fixture of priorityTreeFixtures()) {
      const scene = parsePriorityTree(fixture);
      for (const viewport of [
        PRIORITY_TREE_VIEWPORT,
        { width: 1376, height: 774, surface: { x: 0, y: 0, width: 1376, height: 774 } },
        { width: 900, height: 600, surface: { x: 0, y: 0, width: 900, height: 600 } },
      ]) {
        const camera = priorityTreeCamera(viewport),
          b = viewport.surface;
        const unit = Math.min(b.width / 952, b.height / 478);
        for (const anchor of priorityTreeAnchors(scene)) {
          const placement = priorityTreeModelPlacement(anchor.x, anchor.y, viewport);
          const projected = new Vector3(...placement.position).project(camera);
          expect(((projected.x + 1) * viewport.width) / 2).toBeCloseTo(
            b.x + (b.width - 952 * unit) / 2 + anchor.x * unit,
            8,
          );
          expect(((1 - projected.y) * viewport.height) / 2).toBeCloseTo(
            b.y + (b.height - 478 * unit) / 2 + anchor.y * unit,
            8,
          );
          const right = new Vector3(1, 0, 0)
            .applyQuaternion(camera.quaternion)
            .multiplyScalar(placement.scale)
            .add(new Vector3(...placement.position))
            .project(camera);
          expect(((right.x - projected.x) * viewport.width) / 2).toBeCloseTo(30 * unit, 8);
        }
      }
    }
  });
});
