import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { RankingCalendarDiagram } from './ranking-calendar-Diagram';
import { RANKING_CALENDAR_CAMERA, rankingCalendarModelPlacement } from './ranking-calendar-models';
import {
  rankingCalendarPages,
  rankingCalendarPose,
  rankingRankTracks,
} from './ranking-calendar-poses';
import { rankingCalendarCases } from './ranking-calendar-test-fixtures';

// Shipped Inter cmap, advances and actual glyph ink boxes: CPU bounds, not native shaping.
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

function projectionCases() {
  const accepted = rankingCalendarCases();
  const rank = accepted.find((s) => s.storyId === '21' && s.entities.length === 6);
  if (!rank || rank.storyId !== '21') throw new Error('Missing accepted maximum');
  let defensive = structuredClone(rank);
  // Renderer-only eight-identity regression. The actual parser caps two-state ranking at
  // SIX identities (12 total records); this is intentionally not claimed as parser acceptance.
  for (let i = 6; i < 8; i++) {
    const entity = { ...rank.entities[0], id: `defensive-option-${i}`, label: `Option${i + 1}` };
    const extend = (index: number) => ({
      ...defensive.states[index],
      records: [
        ...defensive.states[index].records,
        {
          ...rank.states[index].records[0],
          id: `defensive-record-${index}-${i}`,
          actorId: entity.id,
          quantity: { ...rank.states[index].records[0].quantity, actor: entity.label },
        },
      ],
    });
    defensive = {
      ...defensive,
      entities: [...defensive.entities, entity],
      states: [extend(0), extend(1)],
    };
  }
  return [...accepted, defensive];
}

describe('ranking/calendar actual planar glyphs and uniform static projection', () => {
  it('bounds all pages, full source glyphs and retained context, with no overlaps or font squeezing in either mode/aspect', () => {
    for (const scene of projectionCases()) {
      const pages = rankingCalendarPages(scene);
      for (let index = 0; index < pages.length; index++) {
        const pose = rankingCalendarPose(
          scene,
          scene.setupAt + ((index + 0.5) / pages.length) * (scene.resolveAt - scene.setupAt),
        );
        expect(pose.page).toBe(index);
        for (const aspect of ['9:16', '16:9'] as const) {
          const render = (visualMode: 'diagram' | 'hybrid') =>
            renderToStaticMarkup(
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
                  createElement(RankingCalendarDiagram, {
                    scene: { ...scene, visualMode },
                    pose,
                  }),
                ),
              ),
            );
          const svg = render('diagram');
          expect(render('hybrid')).toBe(svg);
          expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
          expect(svg).not.toMatch(/NaN|Infinity|textLength|lengthAdjust|ellipsis|…|<canvas/);
          const boxes: number[][] = [];
          const emitted: string[] = [];
          for (const m of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
            const a = attrs(m[1]);
            const value = decode(m[2]);
            const x = Number(a.x),
              y = Number(a.y),
              size = Number(a['font-size']);
            expect(a['font-family']).toBe(UI_FONT);
            expect(size).toBeGreaterThanOrEqual(22);
            const ink = extent(value, size);
            const box = [x + ink[0], y + ink[1], x + ink[2], y + ink[3]];
            const region = x >= 484 ? [484, 8, 944, 470] : [0, 8, 480, 398];
            expect(box[0], value).toBeGreaterThanOrEqual(region[0]);
            expect(box[1], value).toBeGreaterThanOrEqual(region[1]);
            expect(box[2], value).toBeLessThanOrEqual(region[2]);
            expect(box[3], value).toBeLessThanOrEqual(region[3]);
            for (const previous of boxes)
              expect(
                box[2] <= previous[0] ||
                  box[0] >= previous[2] ||
                  box[3] <= previous[1] ||
                  box[1] >= previous[3],
                value,
              ).toBe(true);
            boxes.push(box);
            if (x === 500 && y < 440) emitted.push(value);
          }
          expect(emitted).toEqual(pages[index].lines);
          if (scene.storyId === '21') {
            const points = rankingRankTracks(scene).flatMap((track) => track.points);
            const circles = [...svg.matchAll(/<g\b([^>]*)><circle\b([^>]*)/g)];
            expect(circles.length).toBe(points.length);
            for (const circle of circles) {
              const g = attrs(circle[1]),
                a = attrs(circle[2]);
              const point = points.find((p) => p.record.id === g['data-source-record']);
              if (!point) throw new Error('Unknown rank marker');
              expect(Number(a.cx)).toBe(point.x);
              expect(Number(a.cy)).toBe(point.y);
              expect(g['data-tied']).toBe(String(point.tied));
              expect(g['data-unranked']).toBe(String(Boolean(point.record.unrankedEvidence)));
              const box = [point.x - 5, point.y - 5, point.x + 5, point.y + 5];
              expect(box[0]).toBeGreaterThan(0);
              expect(box[2]).toBeLessThan(480);
              expect(box[1]).toBeGreaterThan(8);
              expect(box[3]).toBeLessThan(370);
              for (const ink of boxes)
                expect(
                  box[2] <= ink[0] || box[0] >= ink[2] || box[3] <= ink[1] || box[1] >= ink[3],
                ).toBe(true);
            }
          }
          for (const m of svg.matchAll(/<rect\b([^>]*)>/g)) {
            const a = attrs(m[1]);
            expect(Number(a.x)).toBeGreaterThanOrEqual(0);
            expect(Number(a.y)).toBeGreaterThanOrEqual(8);
            expect(Number(a.x) + Number(a.width)).toBeLessThanOrEqual(952);
            expect(Number(a.y) + Number(a.height)).toBeLessThanOrEqual(478);
          }
        }
      }
    }
  }, 60000);
  it('projects the static models wholly into the reserved bottom rail with uniform meet, portrait and wide', () => {
    for (const wide of [undefined, { width: 1600, height: 720 }, { width: 900, height: 600 }]) {
      const width = wide?.width ?? 1080,
        height = wide?.height ?? 960;
      const meet = wide ? Math.min(width / 952, height / 478) : 1;
      const ox = wide ? (width - 952 * meet) / 2 : 64;
      const oy = wide ? (height - 478 * meet) / 2 : 262;
      const camera = new PerspectiveCamera(RANKING_CALENDAR_CAMERA.fov, width / height, 0.1, 100);
      camera.position.set(...RANKING_CALENDAR_CAMERA.position);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      for (let index = 0; index < 2; index++) {
        const p = rankingCalendarModelPlacement(index, wide);
        const center = new Vector3(...p.position).project(camera);
        expect(((center.x + 1) * width) / 2).toBeCloseTo(ox + (140 + index * 240) * meet, 8);
        expect(((1 - center.y) * height) / 2).toBeCloseTo(oy + 424 * meet, 8);
        // Conservative full source-sheet and temporal carrier envelope, including depth and rotation.
        for (const dx of [-1.2, 1.2])
          for (const dy of [-0.85, 0.8])
            for (const dz of [-0.25, 0.25]) {
              const v = new Vector3(
                p.position[0] + dx * p.scale,
                p.position[1] + dy * p.scale,
                dz * p.scale,
              ).project(camera);
              const x = (((v.x + 1) * width) / 2 - ox) / meet;
              const y = (((1 - v.y) * height) / 2 - oy) / meet;
              expect(x).toBeGreaterThan(80);
              expect(x).toBeLessThan(440);
              expect(y).toBeGreaterThan(398);
              expect(y).toBeLessThan(470);
            }
      }
    }
  });
});
