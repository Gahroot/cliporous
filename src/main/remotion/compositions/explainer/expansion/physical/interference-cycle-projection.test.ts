import { readFileSync } from 'node:fs';
import { Player } from '@remotion/player';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AnyZodObject } from 'remotion';
import { Euler, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { getLongformLayout } from '../../../../../../shared/longform-layout';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { DIAGRAM_REGIONS } from '../../diagrams/layout';
import { diagramPose } from '../../diagrams/motion';
import { longformTextRegions } from '../../longform-stage-layout';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { InterferenceCycleDiagram } from './interference-cycle-Diagram';
import {
  INTERFERENCE_CYCLE_CAMERA,
  interferenceCycleModelPlacement,
} from './interference-cycle-models';
import {
  interferenceCycleEligibility,
  interferenceCyclePages,
  interferenceCyclePose,
} from './interference-cycle-poses';
import { InterferenceCycleView } from './interference-cycle-Scene';
import {
  interferenceCycleCarrierGeometry,
  interferenceCycleCases,
} from './interference-cycle-test-fixtures';
import type { ExpansionInterferenceCycleScene } from './interference-cycle-types';

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
): void {
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
  scene: ExpansionInterferenceCycleScene;
  placement: (typeof placements)[number];
}): ReactElement {
  return createElement(
    ExplainerProvider,
    {
      value: { ...placement, nativeStage: true },
    },
    createElement(InterferenceCycleView, { scene }),
  );
}
const cases = interferenceCycleCases().filter((s) => s.visualMode === 'diagram');
for (const [index, scene] of cases.entries())
  for (const placement of placements) {
    it(`source ${index}/${placement.layout}/${'presentation' in placement ? placement.presentation : 'vertical'}: real Player Chrome, current source pages and shipped Inter ink`, () => {
      cache.clear();
      const pages = interferenceCyclePages(scene);
      const frames = new Map<number, number>();
      for (
        let frame = Math.ceil(scene.setupAt * 30);
        frame <= Math.floor(scene.resolveAt * 30);
        frame++
      ) {
        const page = interferenceCyclePose(scene, frame / 30).page;
        if (!frames.has(page)) frames.set(page, frame);
      }
      expect(frames.size).toBe(pages.length);
      const region =
        'presentation' in placement
          ? getLongformLayout(placement.presentation).model
          : DIAGRAM_REGIONS.body;
      const meet = Math.min(region.width / 952, region.height / 478);
      expect(22 * meet).toBeGreaterThanOrEqual(22);
      for (const [page, frame] of [
        ...frames,
        [pages.length - 1, Math.ceil((scene.resolveAt + 0.5) * 30)] as const,
      ]) {
        const html = renderToStaticMarkup(
          createElement(Player<AnyZodObject, Parameters<typeof PlayerProof>[0]>, {
            component: PlayerProof,
            inputProps: { scene, placement },
            durationInFrames: 600,
            compositionWidth: placement.aspect === '16:9' ? 1920 : 1080,
            compositionHeight: placement.aspect === '16:9' ? 1080 : 1920,
            fps: 30,
            initialFrame: frame,
            noSuspense: true,
          }),
        );
        expect(html).toContain(`data-source-page="${pages[page].id}"`);
        expect(html).not.toMatch(/NaN|Infinity|ellipsis|textLength|lengthAdjust|<canvas/);
        expect(html).toContain('preserveAspectRatio="xMidYMid meet"');
        expect(html).toContain(
          `left:${region.x}px;top:${region.y}px;width:${region.width}px;height:${region.height}px`,
        );
        const boxes: number[][] = [],
          emitted: string[] = [],
          legend: string[] = [];
        for (const m of html.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
          const a = attrs(m[1]),
            text = decode(m[2]),
            x = Number(a.x),
            y = Number(a.y),
            size = Number(a['font-size']);
          expect(a['font-family']).toBe(UI_FONT);
          expect(size).toBe(22);
          const g = extent(text, size),
            box = [x + g[0], y + g[1], x + g[2], y + g[3]];
          bounded(box, { x: 8, y: 8, width: 936, height: 462 }, text);
          for (const other of boxes)
            expect(
              box[2] <= other[0] || box[0] >= other[2] || box[3] <= other[1] || box[1] >= other[3],
              text,
            ).toBe(true);
          boxes.push(box);
          bounded(
            [
              region.x + (region.width - 952 * meet) / 2 + box[0] * meet,
              region.y + (region.height - 478 * meet) / 2 + box[1] * meet,
              region.x + (region.width - 952 * meet) / 2 + box[2] * meet,
              region.y + (region.height - 478 * meet) / 2 + box[3] * meet,
            ],
            region,
            text,
          );
          if (y >= 240 && y <= 436) emitted.push(text);
          if (scene.storyId === '77' && y >= 36 && y <= 120) legend.push(text);
        }
        if (scene.storyId === '77') {
          expect(legend).toEqual(
            (['amplitude', 'frequency', 'phaseData', 'domainDuration'] as const).map(
              (name) =>
                `Input 1 ${name === 'phaseData' ? 'phase' : name === 'domainDuration' ? 'duration' : name}: ${scene.waves[0][name].state}; Input 2: ${scene.waves[1][name].state}`,
            ),
          );
          const allAvailable = scene.waves.every((wave) =>
            [wave.amplitude, wave.frequency, wave.phaseData, wave.domainDuration].every(
              (q) => 'amount' in q,
            ),
          );
          if (!allAvailable || interferenceCycleEligibility(scene) !== 'supported') {
            expect(html).not.toContain('<polyline');
            if (allAvailable) {
              expect(html).toContain('Graphic resolution unavailable (64 samples; 8/cycle)');
              expect(html).toContain('Source values/states retained; no inferred curve or sum');
              expect(html).not.toContain('Unavailable parameters:');
            }
          } else {
            expect(html).toContain(`data-trace="${scene.waves[0].id}"`);
            expect(html).toContain(`data-trace="${scene.waves[1].id}"`);
            if (html.includes('data-trace="expansion-77-derived-sum"'))
              expect(html).toContain('Analytic teaching curves; derived sum, not measured');
          }
        }
        expect(emitted).toEqual(pages[page].lines);
        expect(emitted.join('')).toContain(pages[page].state);
        if (pages[page].state === 'conditional')
          expect(emitted.join('')).toContain(scene.condition);
        if (pages[page].id.startsWith('scope/') && scene.condition)
          expect(emitted.join('')).toContain(scene.condition);
        const planar = (visualMode: 'diagram' | 'hybrid'): string =>
          renderToStaticMarkup(
            createElement(
              ExplainerProvider,
              {
                value: { ...placement, nativeStage: true },
              },
              createElement(
                DiagramSurface,
                null,
                createElement(InterferenceCycleDiagram, {
                  scene: { ...scene, visualMode },
                  t: frame / 30,
                }),
              ),
            ),
          );
        expect(planar('hybrid')).toBe(planar('diagram'));
        const chromeBoxes: number[][] = [],
          texts: string[] = [];
        const textOf = (node: HtmlNode): string => node.text + node.children.map(textOf).join('');
        const visit = (node: HtmlNode): void => {
          if (node.style.position === 'absolute' && node.style['font-size']) {
            const size = parseFloat(node.style['font-size']),
              x = parseFloat(node.style.left),
              y = parseFloat(node.style.top),
              width = parseFloat(node.style.width),
              leading = parseFloat(node.style['line-height']);
            expect(size).toBeGreaterThanOrEqual(22);
            expect(node.style['font-family']).toBe(UI_FONT);
            const lines = node.children.length
              ? node.children.flatMap((n) => textOf(n).split('\n'))
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
        for (const exact of [scene.label, scene.outcome])
          if (exact) expect(texts.join('').replace(/\s/g, '')).toContain(exact.replace(/\s/g, ''));
        const slots =
          'presentation' in placement
            ? longformTextRegions(getLongformLayout(placement.presentation))
            : DIAGRAM_REGIONS;
        for (const box of chromeBoxes) {
          expect(
            ['title', 'condition', 'evidence', 'outcome'].some((slot) => {
              const r = slots[slot as 'title'];
              return (
                box[0] >= r.x &&
                box[1] >= r.y &&
                box[2] <= r.x + r.width &&
                box[3] <= r.y + r.height
              );
            }),
          ).toBe(true);
          expect(
            box[2] <= region.x ||
              box[0] >= region.x + region.width ||
              box[3] <= region.y ||
              box[1] >= region.y + region.height,
          ).toBe(true);
        }
        for (const [i, box] of chromeBoxes.entries())
          expect(
            chromeBoxes
              .slice(i + 1)
              .every(
                (other) =>
                  box[2] <= other[0] ||
                  box[0] >= other[2] ||
                  box[3] <= other[1] ||
                  box[1] >= other[3],
              ),
          ).toBe(true);
      }
      expect(cache.size).toBeLessThanOrEqual(512);
    });
  }
for (const [index, scene] of cases.entries())
  for (const presentation of [undefined, 'full-frame', 'speaker-side', 'speaker-pip'] as const) {
    it(`source ${index}/${presentation ?? 'vertical'}: actual camera/carrier/HybridStage turn, including hidden geometry`, () => {
      const wide = presentation ? getLongformLayout(presentation).model : undefined;
      const width = wide?.width ?? 1080,
        height = wide?.height ?? 960,
        meet = wide ? Math.min(width / 952, height / 478) : 1;
      const camera = new PerspectiveCamera(INTERFERENCE_CYCLE_CAMERA.fov, width / height, 0.1, 100);
      camera.position.set(...INTERFERENCE_CYCLE_CAMERA.position);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const count = scene.storyId === '77' ? 2 : 3;
      for (const t of [
        NaN,
        -Infinity,
        scene.setupAt - 1,
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
        scene.resolveAt + 1,
      ]) {
        const carriers = interferenceCycleCarrierGeometry(scene, t);
        const rotation = new Matrix4().makeRotationFromEuler(
          new Euler(
            0,
            diagramPose(Number.isFinite(t) ? t : scene.setupAt, scene, 'action').modelTurn,
            0,
          ),
        );
        for (let column = 0; column < count; column++) {
          const p = interferenceCycleModelPlacement(column, count, wide);
          const placement = new Matrix4().compose(
            new Vector3(...p.position),
            new Quaternion(),
            new Vector3(p.scale, p.scale, p.scale),
          );
          for (const { geometry, matrix } of carriers) {
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            if (!box) throw new Error('Missing actual geometry bounds');
            const transform = rotation.clone().multiply(placement).multiply(matrix);
            for (const dx of [box.min.x, box.max.x])
              for (const dy of [box.min.y, box.max.y])
                for (const dz of [box.min.z, box.max.z]) {
                  const v = new Vector3(dx, dy, dz).applyMatrix4(transform).project(camera);
                  expect(v.z).toBeGreaterThan(-1);
                  expect(v.z).toBeLessThan(1);
                  const x = ((v.x + 1) * width) / 2,
                    y = ((1 - v.y) * height) / 2;
                  const ox = wide ? (width - 952 * meet) / 2 : 64,
                    oy = wide ? (height - 478 * meet) / 2 : 262;
                  bounded(
                    [x, y, x, y],
                    { x: ox + 26 * meet, y: oy + 178 * meet, width: 900 * meet, height: 36 * meet },
                    'actual hidden or visible teaching rig',
                  );
                }
          }
        }
        for (const { geometry } of carriers) geometry.dispose();
      }
    });
  }
