import { readFileSync } from 'node:fs';
import { Player } from '@remotion/player';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AnyZodObject } from 'remotion';
import { Euler, PerspectiveCamera, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { getLongformLayout } from '../../../../../../shared/longform-layout';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { DIAGRAM_REGIONS } from '../../diagrams/layout';
import { diagramPose } from '../../diagrams/motion';
import { longformTextRegions } from '../../longform-stage-layout';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { EnergyFieldDiagram } from './energy-field-Diagram';
import {
  ENERGY_FIELD_CAMERA,
  energyFieldModelPlacement,
  energyFieldSolids,
} from './energy-field-models';
import { energyFieldPose } from './energy-field-poses';
import { EnergyFieldView } from './energy-field-Scene';
import { energyFieldFixtureScenes, energyFieldGeometry } from './energy-field-test-fixtures';
import type { ExpansionEnergyFieldScene } from './energy-field-types';

// Shipped Inter cmap/advance/glyf bounding boxes; bounded CPU cache, not native shaping/pixels.
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
const units = font.readUInt16BE(table('head') + 18),
  metrics = font.readUInt16BE(table('hhea') + 34),
  longLoca = font.readInt16BE(table('head') + 50) === 1,
  cmap = table('cmap');
let mapping = 0;
for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
  const p = cmap + font.readUInt32BE(cmap + 8 + i * 8);
  if (font.readUInt16BE(p) === 12) mapping = p;
}
const cache = new Map<string, readonly number[]>();
function extent(text: string, size: number): readonly number[] {
  const key = `${size}:${text}`,
    cached = cache.get(key);
  if (cached) return cached;
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
  const box = [left, top, right, bottom, pen].map((v) => (v * size) / units);
  if (cache.size === 512) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, box);
  return box;
}
function decode(s: string): string {
  return s.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, key: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[key] ?? key,
  );
}
function attrs(s: string): Record<string, string> {
  return Object.fromEntries(
    [...s.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]),
  );
}
function bounded(
  box: readonly number[],
  region: { x: number; y: number; width: number; height: number },
  text: string,
) {
  expect(box[0], text).toBeGreaterThanOrEqual(region.x);
  expect(box[1], text).toBeGreaterThanOrEqual(region.y);
  expect(box[2], text).toBeLessThanOrEqual(region.x + region.width);
  expect(box[3], text).toBeLessThanOrEqual(region.y + region.height);
}

interface HtmlNode {
  style: Record<string, string>;
  text: string;
  children: HtmlNode[];
}
function htmlTree(html: string): HtmlNode {
  const root: HtmlNode = { style: {}, text: '', children: [] },
    stack = [root];
  for (const m of html.matchAll(/<div\b([^>]*)>|<\/div>|([^<]+)|<[^>]*>/g)) {
    if (m[1] !== undefined) {
      const style = decode(/style="([^"]*)"/.exec(m[1])?.[1] ?? '');
      const node: HtmlNode = {
        style: Object.fromEntries(
          style
            .split(';')
            .filter(Boolean)
            .map((v) => {
              const i = v.indexOf(':');
              return [v.slice(0, i), decode(v.slice(i + 1))];
            }),
        ),
        text: '',
        children: [],
      };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else if (m[0] === '</div>') stack.pop();
    else if (m[2]) stack[stack.length - 1].text += decode(m[2]);
  }
  return root;
}

const cases = energyFieldFixtureScenes();
const placements = [
  { aspect: '9:16', layout: 'stack' },
  { aspect: '9:16', layout: 'stack-flipped' },
  { aspect: '16:9', layout: 'takeover', presentation: 'full-frame' },
  { aspect: '16:9', layout: 'takeover', presentation: 'speaker-side' },
  { aspect: '16:9', layout: 'takeover', presentation: 'speaker-pip' },
] as const;
function PlayerProof({
  scene,
  placement,
}: {
  scene: ExpansionEnergyFieldScene;
  placement: (typeof placements)[number];
}): ReactElement {
  return createElement(
    ExplainerProvider,
    {
      value: { ...placement, nativeStage: true },
    },
    createElement(EnergyFieldView, { scene }),
  );
}
for (const [index, scene] of cases.entries())
  for (const placement of placements) {
    const name = `${index}/${'presentation' in placement ? placement.presentation : placement.layout}`;
    it(`actual Player, current pages, shipped Inter and Chrome ${name}`, () => {
      cache.clear();
      const base = energyFieldPose(scene, scene.setupAt),
        frames = new Map<number, number>();
      for (let f = Math.ceil(scene.setupAt * 30); f <= Math.floor(scene.resolveAt * 30); f++) {
        const pose = energyFieldPose(scene, f / 30);
        if (!frames.has(pose.page)) frames.set(pose.page, f);
      }
      expect(frames.size).toBe(base.pages.length);
      const region =
        'presentation' in placement
          ? getLongformLayout(placement.presentation).model
          : DIAGRAM_REGIONS.body;
      const meet = Math.min(region.width / 952, region.height / 478);
      expect(22 * meet).toBeGreaterThanOrEqual(22);
      for (const [page, frame] of [...frames, [base.pages.length - 1, 359] as const]) {
        const pose = energyFieldPose(scene, frame / 30),
          current = pose.pages[page];
        expect(pose.page).toBe(page);
        const html = renderToStaticMarkup(
          createElement(Player<AnyZodObject, Parameters<typeof PlayerProof>[0]>, {
            component: PlayerProof,
            inputProps: { scene: { ...scene, visualMode: 'diagram' }, placement },
            durationInFrames: 360,
            compositionWidth: placement.aspect === '16:9' ? 1920 : 1080,
            compositionHeight: placement.aspect === '16:9' ? 1080 : 1920,
            fps: 30,
            initialFrame: frame,
            noSuspense: true,
          }),
        );
        expect(html).toContain(`data-page="${page}"`);
        expect(html).not.toMatch(
          /NaN|Infinity|ellipsis|textLength|lengthAdjust|<canvas|<foreignObject|clipPath/,
        );
        expect(html).toContain('preserveAspectRatio="xMidYMid meet"');
        expect(html).toContain(
          `left:${region.x}px;top:${region.y}px;width:${region.width}px;height:${region.height}px`,
        );
        const emitted: string[] = [],
          qualifications: string[] = [],
          states: string[] = [],
          boxes: number[][] = [];
        for (const m of html.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
          const a = attrs(m[1]),
            text = decode(m[2]),
            x = Number(a.x),
            y = Number(a.y),
            size = Number(a['font-size']);
          expect(a['font-family']).toBe(UI_FONT);
          expect(size).toBe(22);
          const g = extent(text, size),
            b = [x + g[0], y + g[1], x + g[2], y + g[3]];
          const lane =
            x === 16
              ? {
                  x: 8,
                  y: y <= 30 ? 8 : y < 240 ? 38 : 216,
                  width: 724,
                  height: y <= 30 ? 28 : y < 240 ? 168 : 246,
                }
              : { x: 744, y: 260, width: 208, height: 100 };
          bounded(b, lane, text);
          for (const other of boxes)
            expect(
              b[2] <= other[0] || b[0] >= other[2] || b[3] <= other[1] || b[1] >= other[3],
              text,
            ).toBe(true);
          boxes.push(b);
          bounded(
            [
              region.x + (region.width - 952 * meet) / 2 + b[0] * meet,
              region.y + (region.height - 478 * meet) / 2 + b[1] * meet,
              region.x + (region.width - 952 * meet) / 2 + b[2] * meet,
              region.y + (region.height - 478 * meet) / 2 + b[3] * meet,
            ],
            region,
            text,
          );
          if (x === 16) {
            if (y === 30) states.push(text);
            else if (y < 240) qualifications.push(text);
            else emitted.push(text);
          }
        }
        expect(states).toEqual([current.state]);
        expect(qualifications).toEqual(current.qualification);
        expect(emitted).toEqual(current.lines);
        const record = scene.records.find((r) => r.id === current.recordId);
        if (record) {
          expect(states).toEqual([record.quantity.state]);
          if ('condition' in record.quantity)
            expect(qualifications.join('')).toContain(record.quantity.condition);
          if ('qualifier' in record.quantity)
            expect(qualifications.join('')).toContain(record.quantity.qualifier);
        }
        if (scene.storyId === '80') expect(qualifications.join('')).toContain(scene.qualification);
        const companion = (mode: 'diagram' | 'hybrid') =>
          renderToStaticMarkup(
            createElement(
              ExplainerProvider,
              {
                value: { ...placement, nativeStage: true },
              },
              createElement(
                DiagramSurface,
                null,
                createElement(EnergyFieldDiagram, {
                  scene: { ...scene, visualMode: mode },
                  pose,
                }),
              ),
            ),
          );
        expect(companion('hybrid')).toBe(companion('diagram'));
        const chromeBoxes: number[][] = [],
          texts: string[] = [];
        const visit = (node: HtmlNode): void => {
          if (node.style.position === 'absolute' && node.style['font-size']) {
            const size = parseFloat(node.style['font-size']),
              x = parseFloat(node.style.left),
              y = parseFloat(node.style.top),
              width = parseFloat(node.style.width),
              leading = parseFloat(node.style['line-height']);
            expect(size).toBeGreaterThanOrEqual(22);
            expect(node.style['font-family']).toBe(UI_FONT);
            const text = (n: HtmlNode): string => n.text + n.children.map(text).join('');
            const lines = node.children.length
              ? node.children.flatMap((n) => text(n).split('\n'))
              : node.text.split('\n');
            const ascent = font.readInt16BE(table('hhea') + 4) / units,
              descent = font.readInt16BE(table('hhea') + 6) / units;
            lines.forEach((line, row) => {
              texts.push(line);
              const ink = extent(line, size),
                left = node.style['text-align'] === 'center' ? x + (width - ink[4]) / 2 : x;
              const baseline =
                y +
                ((leading - ascent + descent) * size) / 2 +
                ascent * size +
                row * size * leading;
              expect(ink[4], line).toBeLessThanOrEqual(width);
              chromeBoxes.push([
                left + ink[0],
                baseline + ink[1],
                left + ink[2],
                baseline + ink[3],
              ]);
            });
          } else node.children.forEach(visit);
        };
        visit(htmlTree(html));
        expect(chromeBoxes.length).toBeGreaterThanOrEqual(3);
        expect(texts.join('').replace(/\s/g, '')).toContain(scene.label.replace(/\s/g, ''));
        expect(texts.join('').replace(/\s/g, '')).toContain(scene.outcome.replace(/\s/g, ''));
        const slots =
          'presentation' in placement
            ? longformTextRegions(getLongformLayout(placement.presentation))
            : DIAGRAM_REGIONS;
        for (const b of chromeBoxes) {
          expect(
            (['title', 'condition', 'evidence', 'outcome'] as const).some((slot) => {
              const r = slots[slot];
              return b[0] >= r.x && b[1] >= r.y && b[2] <= r.x + r.width && b[3] <= r.y + r.height;
            }),
          ).toBe(true);
          expect(
            b[2] <= region.x ||
              b[0] >= region.x + region.width ||
              b[3] <= region.y ||
              b[1] >= region.y + region.height,
          ).toBe(true);
        }
        for (const [i, b] of chromeBoxes.entries())
          expect(
            chromeBoxes
              .slice(i + 1)
              .every((o) => b[2] <= o[0] || b[0] >= o[2] || b[3] <= o[1] || b[1] >= o[3]),
          ).toBe(true);
      }
      expect(cache.size).toBeLessThanOrEqual(512);
    });
    for (const [firstFrame, lastFrame] of [
      [0, 89],
      [90, 179],
      [180, 269],
      [270, 360],
    ] as const)
      it(`actual solid geometry, camera and every 30fps HybridStage turn ${name}/${firstFrame}-${lastFrame}`, () => {
        const wide =
          'presentation' in placement ? getLongformLayout(placement.presentation).model : undefined;
        const width = wide?.width ?? 1080,
          height = wide?.height ?? 960,
          meet = wide ? Math.min(width / 952, height / 478) : 1;
        const camera = new PerspectiveCamera(ENERGY_FIELD_CAMERA.fov, width / height, 0.1, 100);
        camera.position.set(...ENERGY_FIELD_CAMERA.position);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        const first = energyFieldPose(scene, scene.setupAt),
          geometries = energyFieldGeometry(scene, first);
        const corners = geometries.map(({ geometry }) => {
          geometry.computeBoundingBox();
          const box = geometry.boundingBox;
          if (!box) throw new Error('Missing actual geometry bounds');
          return [box.min.x, box.max.x].flatMap((x) =>
            [box.min.y, box.max.y].flatMap((y) =>
              [box.min.z, box.max.z].map((z) => new Vector3(x, y, z)),
            ),
          );
        });
        for (let frame = firstFrame; frame <= lastFrame; frame++) {
          const pose = energyFieldPose(scene, frame / 30),
            solids = energyFieldSolids(scene, pose),
            placement = energyFieldModelPlacement(wide);
          expect(solids.length).toBe(geometries.length);
          for (const [i, solid] of solids.entries())
            for (const corner of corners[i]) {
              const v = corner
                .clone()
                .applyEuler(new Euler(...solid.rotation))
                .add(new Vector3(...solid.position))
                .applyEuler(new Euler(...solid.parentRotation))
                .add(new Vector3(...solid.parentPosition))
                .multiplyScalar(placement.scale)
                .add(new Vector3(...placement.position))
                .applyEuler(new Euler(0, diagramPose(frame / 30, scene).modelTurn, 0))
                .project(camera);
              const x = ((v.x + 1) * width) / 2,
                y = ((1 - v.y) * height) / 2,
                ox = wide ? (width - 952 * meet) / 2 : 64,
                oy = wide ? (height - 478 * meet) / 2 : 262;
              bounded(
                [x, y, x, y],
                { x: ox + 748 * meet, y: oy + 96 * meet, width: 188 * meet, height: 170 * meet },
                'actual solid including opacity-zero handoff',
              );
            }
        }
        for (const { geometry } of geometries) geometry.dispose();
      });
  }
