import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { RiskCalibrationDiagram } from './risk-calibration-Diagram';
import { RISK_CALIBRATION_CAMERA, riskCalibrationModelPlacement } from './risk-calibration-models';
import {
  riskCalibrationPages,
  riskCalibrationPose,
  riskQuantityDomain,
  riskQuantityPositions,
} from './risk-calibration-poses';
import { acceptedCalibrationStates, riskCalibrationCases } from './risk-calibration-poses.test';

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

describe('risk/calibration actual planar glyphs and static camera projection', () => {
  it('bounds every emitted source page and shape in both modes, including long accepted labels and absent/disputed states', () => {
    // Font bytes and size are fixed: measure each repeated label once, while still
    // checking every rendered node and every authored frame below.
    const extents = new Map<string, number[]>();
    const measure = (text: string, size: number): number[] => {
      const key = JSON.stringify([text, size]);
      const cached = extents.get(key);
      if (cached) return cached;
      const measured = extent(text, size);
      if (extents.size < 512) extents.set(key, measured);
      return measured;
    };
    for (const scene of riskCalibrationCases())
      for (const visualMode of ['diagram', 'hybrid'] as const)
        for (const aspect of ['9:16', '16:9'] as const) {
          const pages = riskCalibrationPages(scene);
          const visited = new Set<number>();
          for (let frame = 0; frame <= 360; frame++) {
            const pose = riskCalibrationPose(scene, frame / 30);
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
                  createElement(RiskCalibrationDiagram, {
                    scene: { ...scene, visualMode },
                    pose,
                  }),
                ),
              ),
            );
            expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
            expect(svg).not.toMatch(/NaN|Infinity|textLength|lengthAdjust|ellipsis|<canvas/);
            const emitted: string[] = [];
            const upperLabels = new Map<number, string>();
            for (const m of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
              const a = attrs(m[1]),
                text = decode(m[2]);
              expect(a['font-family']).toBe(UI_FONT);
              expect(Number(a['font-size']), text).toBeGreaterThanOrEqual(22);
              const x = Number(a.x),
                y = Number(a.y),
                box = measure(text, Number(a['font-size']));
              const region =
                x >= 484
                  ? [484, 8, 944, 470]
                  : x === 99
                    ? [99, 8, 280, 470]
                    : x === 309
                      ? [309, 8, 480, 470]
                      : [0, 8, 480, 470];
              expect(x + box[0], text).toBeGreaterThanOrEqual(region[0]);
              expect(y + box[1], text).toBeGreaterThanOrEqual(region[1]);
              expect(x + box[2], text).toBeLessThanOrEqual(region[2]);
              expect(y + box[3], text).toBeLessThanOrEqual(region[3]);
              if (x === 492 && y < 440) emitted.push(text);
              if ((x === 99 || x === 309) && (y === 86 || y === 114))
                upperLabels.set(x, (upperLabels.get(x) ?? '') + text);
            }
            expect(emitted).toEqual(pages[pose.page].lines);
            if (scene.storyId === '16') {
              const record = scene.records[pose.record];
              for (const [x, quantity] of [
                [99, record.prediction],
                [309, record.observation],
              ] as const) {
                const upper = upperLabels.get(x);
                const domain = riskQuantityDomain(quantity)[1];
                expect(upper).toBe(`${domain.numerator}/${domain.denominator}`);
              }
            }
            for (const m of svg.matchAll(/<circle\b([^>]*)>/g)) {
              const a = attrs(m[1]);
              expect(Number(a.cx) - Number(a.r)).toBeGreaterThanOrEqual(0);
              expect(Number(a.cx) + Number(a.r)).toBeLessThanOrEqual(480);
              expect(Number(a.cy) - Number(a.r)).toBeGreaterThanOrEqual(8);
              expect(Number(a.cy) + Number(a.r)).toBeLessThanOrEqual(470);
            }
            for (const m of svg.matchAll(/<rect\b([^>]*)>/g)) {
              const a = attrs(m[1]);
              expect(Number(a.x) + Number(a.width)).toBeLessThanOrEqual(952);
              expect(Number(a.y) + Number(a.height)).toBeLessThanOrEqual(478);
            }
          }
          expect(visited.size).toBe(pages.length);
        }
  }, 60000);
  it('matches portrait and non-square wide xMidYMid meet without camera drift or independent axis stretching', () => {
    for (const wide of [undefined, { width: 1600, height: 720 }, { width: 900, height: 600 }]) {
      const width = wide?.width ?? 1080,
        height = wide?.height ?? 960;
      const meet = wide ? Math.min(width / 952, height / 478) : 1;
      const camera = new PerspectiveCamera(RISK_CALIBRATION_CAMERA.fov, width / height, 0.1, 100);
      camera.position.set(...RISK_CALIBRATION_CAMERA.position);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      for (let index = 0; index < 2; index++) {
        const p = riskCalibrationModelPlacement(index, wide);
        const v = new Vector3(...p.position).project(camera);
        expect(((v.x + 1) * width) / 2).toBeCloseTo(
          wide ? (width - 952 * meet) / 2 + (140 + index * 240) * meet : 204 + index * 240,
          8,
        );
        expect(((1 - v.y) * height) / 2).toBeCloseTo(
          wide ? (height - 478 * meet) / 2 + 424 * meet : 686,
          8,
        );
        // Actual authored plot device's 2.75 x 1.8 envelope, including its base.
        for (const dx of [-1.375, 1.375])
          for (const dy of [-0.9, 0.8]) {
            const corner = new Vector3(
              p.position[0] + dx * p.scale,
              p.position[1] + dy * p.scale,
              0,
            ).project(camera);
            expect(Math.abs(corner.x)).toBeLessThan(1);
            expect(Math.abs(corner.y)).toBeLessThan(1);
          }
      }
    }
  });
  it('keeps missing/unknown observations unplotted and exact disputed alternatives distinct', () => {
    for (const scene of acceptedCalibrationStates()) {
      if (scene.storyId !== '16') throw new Error('Wrong route');
      const r = scene.records[0];
      const positions = riskQuantityPositions(r.observation);
      if (r.observation.state === 'unknown' || r.observation.state === 'missing')
        expect(positions).toEqual([]);
      if (r.observation.state === 'disputed') {
        expect(positions[0]).toBeCloseTo(0.7);
        expect(positions[1]).toBeCloseTo(0.75);
      }
      expect(r.comparison.state).toBe('uncompared');
    }
  });
});
