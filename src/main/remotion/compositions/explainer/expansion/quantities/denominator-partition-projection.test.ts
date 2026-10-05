import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { DenominatorPartitionDiagram } from './denominator-partition-Diagram';
import {
  DENOMINATOR_PARTITION_CAMERA,
  denominatorPartitionModelPlacement,
} from './denominator-partition-models';
import {
  denominatorPartitionPages,
  denominatorPartitionPose,
  denominatorPartitionSegments,
  denominatorPositions,
  denominatorRelative,
} from './denominator-partition-poses';
import { denominatorPartitionCases } from './denominator-partition-test-fixtures';

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
const decode = (s: string) =>
  s.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, key: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[key] ?? key,
  );
const attrs = (s: string) =>
  Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]));

describe('denominator/partition shipped Inter glyphs and actual reserved regions (CPU)', () => {
  it('checks every real-controller source page in portrait/wide and both modes; exact strings, no overlapping glyph boxes', () => {
    const cached = new Map<string, number[]>();
    for (const scene of denominatorPartitionCases())
      for (const visualMode of ['diagram', 'hybrid'] as const)
        for (const aspect of ['9:16', '16:9'] as const) {
          const pages = denominatorPartitionPages(scene),
            visited = new Set<number>();
          for (let frame = 0; frame <= 300; frame++) {
            const pose = denominatorPartitionPose(scene, frame / 30);
            // Geometry and text are static within a page; opacity does not unmount hidden nodes.
            if (visited.has(pose.page)) continue;
            visited.add(pose.page);
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
                  createElement(DenominatorPartitionDiagram, {
                    scene: { ...scene, visualMode },
                    pose,
                  }),
                ),
              ),
            );
            expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
            expect(svg).not.toMatch(
              /NaN|Infinity|textLength|lengthAdjust|ellipsis|clipPath|<canvas/,
            );
            const emitted: string[] = [],
              boxes: { label: string; x0: number; y0: number; x1: number; y1: number }[] = [];
            for (const m of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
              const a = attrs(m[1]),
                label = decode(m[2]),
                size = Number(a['font-size']);
              expect(a['font-family']).toBe(UI_FONT);
              expect(size).toBeGreaterThanOrEqual(22);
              const key = `${size}:${label}`;
              let box = cached.get(key);
              if (!box) {
                box = extent(label, size);
                cached.set(key, box);
              }
              const x = Number(a.x),
                y = Number(a.y),
                region = x >= 492 ? [484, 8, 944, 470] : [0, 8, 480, 470];
              const b = { label, x0: x + box[0], y0: y + box[1], x1: x + box[2], y1: y + box[3] };
              expect(b.x0, label).toBeGreaterThanOrEqual(region[0]);
              expect(b.y0, label).toBeGreaterThanOrEqual(region[1]);
              expect(b.x1, label).toBeLessThanOrEqual(region[2]);
              expect(b.y1, label).toBeLessThanOrEqual(region[3]);
              for (const previous of boxes)
                expect(
                  b.x0 >= previous.x1 ||
                    b.x1 <= previous.x0 ||
                    b.y0 >= previous.y1 ||
                    b.y1 <= previous.y0,
                  `${label}/${previous.label}`,
                ).toBe(true);
              boxes.push(b);
              if (x === 492 && y < 440) emitted.push(label);
            }
            expect(emitted).toEqual(pages[pose.page].lines);
            for (const m of svg.matchAll(/<circle\b([^>]*)>/g)) {
              const a = attrs(m[1]),
                x = Number(a.cx),
                y = Number(a.cy),
                r = Number(a.r);
              expect(x - r).toBeGreaterThanOrEqual(0);
              expect(x + r).toBeLessThanOrEqual(480);
              expect(y - r).toBeGreaterThanOrEqual(130);
              expect(y + r).toBeLessThanOrEqual(400);
              for (const b of boxes)
                expect(
                  x + r <= b.x0 || x - r >= b.x1 || y + r <= b.y0 || y - r >= b.y1,
                  b.label,
                ).toBe(true);
            }
            for (const m of svg.matchAll(/<rect\b([^>]*)>/g)) {
              const a = attrs(m[1]),
                x = Number(a.x),
                y = Number(a.y),
                w = Number(a.width),
                h = Number(a.height);
              expect(x).toBeGreaterThanOrEqual(82);
              expect(x + w).toBeLessThanOrEqual(446);
              expect(y).toBe(370);
              expect(y + h).toBe(386);
              for (const b of boxes)
                expect(x + w <= b.x0 || x >= b.x1 || y + h <= b.y0 || y >= b.y1, b.label).toBe(
                  true,
                );
            }
            // Instruments' authored projected envelope is disjoint from every source glyph and part strip.
            for (let i = 0; i < 2; i++) {
              const x = 140 + i * 240,
                y = 397;
              for (const b of boxes)
                expect(
                  x + 16.5 <= b.x0 || x - 16.5 >= b.x1 || y + 10.8 <= b.y0 || y - 9.6 >= b.y1,
                  `model/${b.label}`,
                ).toBe(true);
            }
          }
          expect(visited.size).toBe(pages.length);
          // Actual frozen parser accepts exactly two comparison rows, and <=6 unique parts with owner/whole.
          expect(
            scene.storyId === '19' ? scene.comparisons.length : scene.parts.length,
          ).toBeLessThanOrEqual(scene.storyId === '19' ? 2 : 6);
        }
  }, 60000);
  it('projects the real static camera and instrument corners into portrait and non-square wide meet regions', () => {
    for (const wide of [undefined, { width: 1600, height: 720 }, { width: 900, height: 600 }]) {
      const width = wide?.width ?? 1080,
        height = wide?.height ?? 960,
        meet = wide ? Math.min(width / 952, height / 478) : 1;
      const camera = new PerspectiveCamera(
        DENOMINATOR_PARTITION_CAMERA.fov,
        width / height,
        0.1,
        100,
      );
      camera.position.set(...DENOMINATOR_PARTITION_CAMERA.position);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      for (let i = 0; i < 2; i++) {
        const p = denominatorPartitionModelPlacement(i, wide),
          projected = new Vector3(...p.position).project(camera);
        const originX = wide ? (width - 952 * meet) / 2 : 64,
          originY = wide ? (height - 478 * meet) / 2 : 262;
        expect(((projected.x + 1) * width) / 2).toBeCloseTo(originX + (140 + i * 240) * meet, 8);
        expect(((1 - projected.y) * height) / 2).toBeCloseTo(originY + 397 * meet, 8);
        for (const dx of [-1.375, 1.375])
          for (const dy of [-0.9, 0.8]) {
            const corner = new Vector3(
              p.position[0] + dx * p.scale,
              p.position[1] + dy * p.scale,
              0,
            ).project(camera);
            const localX = (((corner.x + 1) * width) / 2 - originX) / meet,
              localY = (((1 - corner.y) * height) / 2 - originY) / meet;
            expect(localX).toBeGreaterThanOrEqual(120);
            expect(localX).toBeLessThanOrEqual(400);
            expect(localY).toBeGreaterThanOrEqual(387);
            expect(localY).toBeLessThanOrEqual(408);
          }
        // Source detail reservation maps through the same isotropic meet, not stretched axes.
        for (const x of [484, 944])
          for (const y of [8, 470]) {
            expect(originX + x * meet).toBeGreaterThanOrEqual(0);
            expect(originX + x * meet).toBeLessThanOrEqual(width);
            expect(originY + y * meet).toBeGreaterThanOrEqual(0);
            expect(originY + y * meet).toBeLessThanOrEqual(height);
          }
      }
    }
  });
  it('shows authored absolute/relative reversal while retaining unknown totals/remainders, not zero or full-total fill', () => {
    const cases = denominatorPartitionCases(),
      comparison = cases.find((s) => s.storyId === '19');
    if (!comparison || comparison.storyId !== '19') throw new Error('Missing comparison');
    expect(denominatorPositions(comparison, comparison.comparisons[0].amount)[0]).toBeLessThan(
      denominatorPositions(comparison, comparison.comparisons[1].amount)[0],
    );
    const relative = denominatorRelative(comparison);
    expect(relative).toHaveLength(2);
    expect(relative[0].position).toBeGreaterThan(relative[1].position);
    for (const scene of cases)
      if (scene.storyId === '20') {
        const segments = denominatorPartitionSegments(scene);
        if (scene.total.state === 'unknown') expect(segments).toEqual([]);
        if (scene.total.state === 'known' && scene.total.amount.kind === 'rational') {
          const total = scene.total.amount.value;
          if (total.numerator === 0) expect(segments).toEqual([]);
          if (total.numerator === 1 && total.denominator === 2) {
            expect(segments.map((s) => [s.start, s.end])).toEqual([
              [0, 0.5],
              [0.5, 1],
              [1, 1],
            ]);
          }
        }
        for (const part of scene.parts)
          if (
            part.quantity.state === 'unknown' ||
            part.quantity.state === 'missing' ||
            part.quantity.state === 'disputed'
          ) {
            expect(segments.some((s) => s.id === part.entityId)).toBe(false);
            if (part.quantity.state !== 'disputed')
              expect(denominatorPositions(scene, part.quantity)).toEqual([]);
          }
        if (scene.parts.some((p) => p.quantity.state === 'unknown') && segments.length)
          expect(segments.at(-1)?.end).toBeLessThan(1);
      }
  });
});
