import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { DistributionDiagram } from './distribution-Diagram';
import { DISTRIBUTION_CAMERA, distributionModelPlacement } from './distribution-models';
import { distributionHistogram, distributionPose, distributionTable } from './distribution-poses';
import { distributionCases, zeroBinScene } from './distribution-poses.test';

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

describe('distribution shipped Inter bounds and uniform camera meet', () => {
  it('renders parser-accepted known zero bins as baseline circles, never positive bars or unknown markers', () => {
    for (const all of [false, true]) {
      const scene = zeroBinScene(all);
      if (scene.storyId !== '17') throw new Error('Expected histogram');
      const plots = distributionHistogram(scene);
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        const markup = renderToStaticMarkup(
          createElement(
            DiagramSurface,
            null,
            createElement(DistributionDiagram, {
              scene: { ...scene, visualMode },
              pose: distributionPose(scene, scene.resolveAt),
            }),
          ),
        );
        const groups = [...markup.matchAll(/<g\b([^>]*data-record-id[^>]*)>(.*?)<\/g>/g)];
        expect(groups).toHaveLength(scene.records.length);
        groups.forEach((group, i) => {
          expect(attrs(group[1])['data-state']).toBe('known');
          const plot = plots[i],
            baseline = 280 - plot.baseline * 160,
            y = 280 - plot.positions[0] * 160;
          expect(Number.isFinite(plot.positions[0])).toBe(true);
          expect(Number.isFinite(baseline)).toBe(true);
          const circles = [...group[2].matchAll(/<circle\b([^>]*)>/g)];
          const bars = [...group[2].matchAll(/<rect\b([^>]*)>/g)]
            .map((m) => attrs(m[1]))
            .filter((a) => a.fill !== 'none');
          expect(circles.length + bars.length).toBe(1);
          expect(group[2]).not.toMatch(/<path\b/);
          if (all || i === 0) {
            expect(plot.positions[0]).toBe(plot.baseline);
            expect(bars).toHaveLength(0);
            expect(circles).toHaveLength(1);
            const marker = attrs(circles[0][1]);
            expect(marker['data-zero']).toBe('true');
            expect(Number(marker.cy)).toBe(baseline);
          } else {
            expect(circles).toHaveLength(0);
            expect(Number(bars[0].height)).toBe(Math.abs(y - baseline));
          }
        });
      }
    }
    const unknown = distributionCases().find(
      (s) =>
        s.storyId === '17' && s.records[0].role === 'bin' && s.records[0].count.state === 'unknown',
    );
    if (!unknown) throw new Error('Missing accepted unknown-bin case');
    const markup = renderToStaticMarkup(
      createElement(
        DiagramSurface,
        null,
        createElement(DistributionDiagram, {
          scene: unknown,
          pose: distributionPose(unknown, 0),
        }),
      ),
    );
    const first = [...markup.matchAll(/<g\b([^>]*data-record-id[^>]*)>(.*?)<\/g>/g)][0];
    expect(attrs(first[1])['data-state']).toBe('unknown');
    expect(first[2]).toMatch(/<path\b/);
    expect(first[2]).not.toMatch(/<circle\b|data-zero/);
    expect(distributionHistogram(unknown)[0].positions).toEqual([]);
  });
  it('bounds all actual controller pages in both modes and portrait/wide with no overlap', () => {
    for (const scene of distributionCases())
      for (const visualMode of ['diagram', 'hybrid'] as const)
        for (const aspect of ['9:16', '16:9'] as const) {
          const visited = new Set<number>();
          for (let frame = 0; frame <= 420; frame++) {
            const pose = distributionPose(scene, frame / 30);
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
                  createElement(DistributionDiagram, {
                    scene: { ...scene, visualMode },
                    pose,
                  }),
                ),
              ),
            );
            expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
            expect(svg).not.toMatch(/NaN|Infinity|textLength|lengthAdjust|ellipsis|<canvas/);
            const boxes: number[][] = [],
              lines: string[] = [];
            for (const m of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
              const a = attrs(m[1]),
                text = decode(m[2]),
                x = Number(a.x),
                y = Number(a.y);
              expect(a['font-family']).toBe(UI_FONT);
              expect(Number(a['font-size'])).toBeGreaterThanOrEqual(22);
              const b = extent(text, Number(a['font-size']));
              const box = [x + b[0], y + b[1], x + b[2], y + b[3]];
              expect(box[0], text).toBeGreaterThanOrEqual(x >= 492 ? 484 : 8);
              expect(box[2], text).toBeLessThanOrEqual(x >= 492 ? 944 : 474);
              expect(box[1], text).toBeGreaterThanOrEqual(8);
              expect(box[3], text).toBeLessThanOrEqual(470);
              for (const other of boxes)
                expect(
                  box[2] <= other[0] ||
                    other[2] <= box[0] ||
                    box[3] <= other[1] ||
                    other[3] <= box[1],
                  text,
                ).toBe(true);
              boxes.push(box);
              if (x === 492 && y < 440) lines.push(text);
            }
            expect(lines).toEqual(pose.pages[pose.page].lines);
            for (const m of svg.matchAll(/<rect\b([^>]*)>/g)) {
              const a = attrs(m[1]);
              expect(Number(a.x)).toBeGreaterThanOrEqual(8);
              expect(Number(a.x) + Number(a.width)).toBeLessThanOrEqual(474);
              expect(Number(a.y)).toBeGreaterThanOrEqual(8);
              expect(Number(a.y) + Number(a.height)).toBeLessThanOrEqual(470);
            }
            for (const m of svg.matchAll(/<circle\b([^>]*)>/g)) {
              const a = attrs(m[1]),
                r = Number(a.r);
              expect(Number(a.cx) - r).toBeGreaterThanOrEqual(8);
              expect(Number(a.cx) + r).toBeLessThanOrEqual(474);
              expect(Number(a.cy) - r).toBeGreaterThanOrEqual(8);
              expect(Number(a.cy) + r).toBeLessThanOrEqual(470);
            }
            for (const m of svg.matchAll(/<path\b([^>]*)>/g)) {
              const d = attrs(m[1]).d;
              let x = 0,
                y = 0;
              for (const command of d.matchAll(/([MmHhVv])([^MmHhVv]*)/g)) {
                const numbers = [...command[2].matchAll(/-?\d+(?:\.\d+)?/g)].map((n) =>
                  Number(n[0]),
                );
                const c = command[1];
                if (c === 'M') [x, y] = numbers;
                else if (c === 'm') {
                  x += numbers[0];
                  y += numbers[1];
                } else if (c === 'H') x = numbers[0];
                else if (c === 'h') x += numbers[0];
                else if (c === 'V') y = numbers[0];
                else if (c === 'v') y += numbers[0];
                expect(x).toBeGreaterThanOrEqual(8);
                expect(x).toBeLessThanOrEqual(480);
                expect(y).toBeGreaterThanOrEqual(8);
                expect(y).toBeLessThanOrEqual(470);
              }
            }
            const rows = [...svg.matchAll(/<g\b([^>]*data-scope-id[^>]*)>(.*?)<\/g>/g)];
            const expectedRows = distributionTable(scene);
            expect(rows).toHaveLength(expectedRows.length);
            rows.forEach((row, i) => {
              const a = attrs(row[1]),
                expected = expectedRows[i];
              expect(a['data-scope-id']).toBe(expected.scopeId);
              expect(a['data-actor-ids']).toBe(expected.actorIds.join(' '));
              expect(a['data-relation']).toBe(expected.relation);
              const cells = ['', ''];
              for (const m of row[2].matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
                const a = attrs(m[1]),
                  x = Number(a.x),
                  y = Number(a.y),
                  value = decode(m[2]),
                  b = extent(value, 22);
                expect(y + b[1]).toBeGreaterThanOrEqual(86 + i * 76);
                expect(y + b[3]).toBeLessThanOrEqual(157 + i * 76);
                if (x === 120 || x === 300) {
                  expect(x + b[0]).toBeGreaterThanOrEqual(x - 1);
                  expect(x + b[2]).toBeLessThanOrEqual(x + 166);
                  cells[x === 120 ? 0 : 1] += value;
                }
              }
              expect(cells).toEqual(expected.values);
            });
          }
          expect(visited.size).toBe(distributionPose(scene, 100).pages.length);
        }
  }, 60000);
  it('projects the complete tray envelopes with a static camera and uniform meet', () => {
    for (const wide of [undefined, { width: 1600, height: 720 }, { width: 900, height: 600 }]) {
      const w = wide?.width ?? 1080,
        h = wide?.height ?? 960,
        meet = wide ? Math.min(w / 952, h / 478) : 1;
      const camera = new PerspectiveCamera(DISTRIBUTION_CAMERA.fov, w / h, 0.1, 100);
      camera.position.set(...DISTRIBUTION_CAMERA.position);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      for (let i = 0; i < 3; i++) {
        const p = distributionModelPlacement(i, wide),
          v = new Vector3(...p.position).project(camera);
        expect(((v.x + 1) * w) / 2).toBeCloseTo(
          wide ? (w - 952 * meet) / 2 + (70 + i * 150) * meet : 134 + i * 150,
          8,
        );
        expect(((1 - v.y) * h) / 2).toBeCloseTo(wide ? (h - 478 * meet) / 2 + 464 * meet : 726, 8);
        for (const dx of [-2.56, 2.56])
          for (const dy of [-0.66, 0.66]) {
            const corner = new Vector3(
              p.position[0] + dx * p.scale,
              p.position[1] + dy * p.scale,
              0.125 * p.scale,
            ).project(camera);
            expect(Math.abs(corner.x)).toBeLessThan(1);
            expect(Math.abs(corner.y)).toBeLessThan(1);
          }
      }
    }
  });
});
