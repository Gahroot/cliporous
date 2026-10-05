import { readFileSync } from 'node:fs';
import { Player } from '@remotion/player';
import type { ReactElement } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AnyZodObject } from 'remotion';
import { Euler, PerspectiveCamera, Vector3 } from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { getLongformLayout } from '../../../../../../shared/longform-layout';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { DIAGRAM_REGIONS, labelLines } from '../../diagrams/layout';
import { diagramPose } from '../../diagrams/motion';
import { fitEditorialText, longformTextRegions } from '../../longform-stage-layout';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { ResourceDiffusionDiagram } from './resource-diffusion-Diagram';
import { RESOURCE_DIFFUSION_CAMERA, resourceDiffusionPlacement } from './resource-diffusion-models';
import { resourceDiffusionChrome, resourceDiffusionPose } from './resource-diffusion-poses';
import { ResourceDiffusionView } from './resource-diffusion-Scene';
import {
  resourceDiffusionCases,
  resourceDiffusionGeometry,
} from './resource-diffusion-test-fixtures';
import type { ExpansionResourceDiffusionScene } from './resource-diffusion-types';

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

describe('resource and diffusion actual Inter CPU projection (not native pixels)', () => {
  for (const [index, scene] of resourceDiffusionCases().entries()) {
    for (const presentation of [undefined, 'speaker-side', 'speaker-pip', 'full-frame'] as const)
      it(`source case ${index}/${presentation ?? 'vertical'}: actual current-page ink, identical both modes`, () => {
        cache.clear();
        const region = presentation ? getLongformLayout(presentation).model : DIAGRAM_REGIONS.body;
        const meet = Math.min(region.width / 952, region.height / 478),
          base = resourceDiffusionPose(scene, scene.setupAt);
        expect(22 * meet).toBeGreaterThanOrEqual(22);
        for (let page = 0; page < base.pages.length; page++) {
          const pose = { ...base, page };
          const render = (visualMode: 'diagram' | 'hybrid') =>
            renderToStaticMarkup(
              createElement(
                ExplainerProvider,
                {
                  value: {
                    aspect: presentation ? '16:9' : '9:16',
                    presentation,
                    nativeStage: true,
                  },
                },
                createElement(
                  DiagramSurface,
                  null,
                  createElement(ResourceDiffusionDiagram, {
                    scene: { ...scene, visualMode },
                    pose,
                  }),
                ),
              ),
            );
          const markup = render('diagram');
          expect(render('hybrid')).toBe(markup);
          expect(markup).not.toMatch(/NaN|Infinity|ellipsis|textLength|lengthAdjust|<canvas/);
          const boxes: number[][] = [],
            emitted: string[] = [];
          for (const m of markup.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
            const a = attrs(m[1]),
              text = decode(m[2]),
              x = Number(a.x),
              y = Number(a.y),
              size = Number(a['font-size']);
            expect(a['font-family']).toBe(UI_FONT);
            expect(size).toBe(22);
            const g = extent(text, size),
              box = [x + g[0], y + g[1], x + g[2], y + g[3]];
            bounded(
              box,
              x >= 484
                ? { x: 484, y: 8, width: 460, height: 462 }
                : { x: 0, y: 8, width: 484, height: 462 },
              text,
            );

            for (const other of boxes)
              expect(
                box[2] <= other[0] ||
                  box[0] >= other[2] ||
                  box[3] <= other[1] ||
                  box[1] >= other[3],
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
            if (x === 500 && y >= 84 && y <= 324) emitted.push(text);
          }
          expect(emitted).toEqual(pose.pages[page].lines);
        }
        expect(cache.size).toBeLessThanOrEqual(512);
      });
  }
  for (const [index, original] of resourceDiffusionCases().entries())
    for (const presentation of [undefined, 'speaker-side', 'speaker-pip', 'full-frame'] as const)
      it(`Chrome source ${index}/${presentation ?? 'vertical'}: source-preserving current chunks and actual reserved slots`, () => {
        cache.clear();
        const scene = resourceDiffusionChrome(
          original,
          resourceDiffusionPose(original, original.setupAt),
        );
        const texts = {
          title: scene.label,
          condition: scene.condition ?? '',
          evidence: scene.evidence === 'illustrative' ? 'Illustrative example' : 'Source-stated',
          outcome: scene.outcome,
        };
        const sizes = {
          title: presentation ? 48 : 38,
          condition: presentation ? 28 : 24,
          evidence: 28,
          outcome: presentation ? 36 : 34,
        };
        const regions = presentation
          ? longformTextRegions(getLongformLayout(presentation))
          : DIAGRAM_REGIONS;
        for (const slot of ['title', 'condition', 'evidence', 'outcome'] as const) {
          const text = texts[slot];
          if (!text) continue;
          const region = regions[slot],
            fit = presentation
              ? fitEditorialText(text, region, sizes[slot])
              : {
                  fontSize: sizes[slot],
                  lines: labelLines(
                    text,
                    slot === 'title'
                      ? 24
                      : slot === 'condition'
                        ? 38
                        : slot === 'evidence'
                          ? 32
                          : 27,
                  ),
                };
          expect(fit.fontSize).toBeGreaterThanOrEqual(22);
          expect(fit.lines.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
          const leading = presentation
            ? 1.16
            : slot === 'condition' && fit.lines.length > 2
              ? 1.1
              : 1.15;
          const ascent = font.readInt16BE(table('hhea') + 4) / units,
            descent = font.readInt16BE(table('hhea') + 6) / units;
          fit.lines.forEach((line, row) => {
            const g = extent(line, fit.fontSize),
              baseline =
                region.y +
                ((leading - ascent + descent) * fit.fontSize) / 2 +
                ascent * fit.fontSize +
                row * fit.fontSize * leading,
              x = presentation ? region.x : region.x + (region.width - g[4]) / 2;
            bounded(
              [x + g[0], baseline + g[1], x + g[2], baseline + g[3]],
              region,
              `${slot}: ${line}`,
            );
          });
        }
      });
});

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
  scene: ExpansionResourceDiffusionScene;
  placement: (typeof placements)[number];
}): ReactElement {
  return createElement(
    ExplainerProvider,
    {
      value: { ...placement, nativeStage: true },
    },
    createElement(ResourceDiffusionView, { scene }),
  );
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
for (const [index, scene] of resourceDiffusionCases().entries())
  for (const placement of placements)
    it(`real Player current pages + actual Chrome ink source ${index}/${placement.layout}/${'presentation' in placement ? placement.presentation : 'vertical'}`, () => {
      cache.clear();
      const pages = resourceDiffusionPose(scene, 0).pages;
      const frames = new Map<number, number>();
      for (let f = Math.ceil(scene.setupAt * 30); f <= Math.floor(scene.resolveAt * 30); f++) {
        const p = resourceDiffusionPose(scene, f / 30);
        if (!frames.has(p.page)) frames.set(p.page, f);
      }
      expect(frames.size).toBe(pages.length);
      for (const [page, frame] of [...frames, [pages.length - 1, 330] as const]) {
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
        expect(html).toContain(`data-resource-diffusion-page="${page}"`);
        const pose = resourceDiffusionPose(scene, frame / 30);
        const chrome = resourceDiffusionChrome(scene, pose);
        const tags = [...html.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].filter(
          (m) => Number(attrs(m[1]).y) === 44 && Number(attrs(m[1]).x) === 500,
        );
        expect(tags.map((m) => decode(m[2]))).toEqual([`State: ${pages[page].state}`]);
        const emitted = [...html.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)]
          .filter((m) => {
            const a = attrs(m[1]);
            return Number(a.x) === 500 && Number(a.y) >= 84 && Number(a.y) <= 324;
          })
          .map((m) => decode(m[2]));
        expect(emitted).toEqual(pages[page].lines);
        expect(html).toContain('preserveAspectRatio="xMidYMid meet"');
        expect(html).not.toContain('<canvas');
        const region =
          'presentation' in placement
            ? getLongformLayout(placement.presentation).model
            : DIAGRAM_REGIONS.body;
        expect(html).toContain(
          `left:${region.x}px;top:${region.y}px;width:${region.width}px;height:${region.height}px`,
        );
        const boxes: number[][] = [],
          texts: string[] = [];
        const visit = (node: HtmlNode) => {
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
              const b = [left + ink[0], baseline + ink[1], left + ink[2], baseline + ink[3]];
              expect(ink[4], line).toBeLessThanOrEqual(width);
              boxes.push(b);
            });
          } else node.children.forEach(visit);
        };
        visit(htmlTree(html));
        expect(boxes.length).toBeGreaterThanOrEqual(3);
        expect(texts.join('').replace(/\s/g, '')).toContain(chrome.label.replace(/\s/g, ''));
        expect(texts.join('').replace(/\s/g, '')).toContain(chrome.outcome.replace(/\s/g, ''));
        const slots =
          'presentation' in placement
            ? longformTextRegions(getLongformLayout(placement.presentation))
            : DIAGRAM_REGIONS;
        for (const b of boxes) {
          expect(
            ['title', 'evidence', 'outcome'].some((slot) => {
              const r = slots[slot as 'title'];
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
        for (const [i, b] of boxes.entries())
          expect(
            boxes
              .slice(i + 1)
              .every((o) => b[2] <= o[0] || b[0] >= o[2] || b[3] <= o[1] || b[1] >= o[3]),
          ).toBe(true);
      }
      expect(cache.size).toBeLessThanOrEqual(512);
    });

// Actual kit vertices, including rear faces and zero-opacity geometry. Two-story local cache only.
const solids = { '75': resourceDiffusionGeometry('75'), '76': resourceDiffusionGeometry('76') };
const vertices = new Map<'75' | '76', { column: number; vertex: Vector3 }[]>();
for (const story of ['75', '76'] as const) {
  const local: { column: number; vertex: Vector3 }[] = [];
  for (const solid of solids[story]) {
    const positions = solid.geometry.getAttribute('position');
    const rotation = new Euler(...solid.rotation);
    for (let i = 0; i < positions.count; i++)
      local.push({
        column: solid.column,
        vertex: new Vector3()
          .fromBufferAttribute(positions, i)
          .applyEuler(rotation)
          .add(new Vector3(...solid.position)),
      });
  }
  vertices.set(story, local);
}
const projected = new Map<string, readonly number[]>();
afterAll(() => {
  for (const story of ['75', '76'] as const)
    for (const solid of solids[story]) solid.geometry.dispose();
  expect(vertices.size).toBe(2);
  expect(projected.size).toBeLessThanOrEqual(2048);
});
for (const [index, scene] of resourceDiffusionCases().entries())
  for (const presentation of [undefined, 'speaker-side', 'speaker-pip', 'full-frame'] as const)
    it(`actual kit vertex envelope source ${index}/${presentation ?? 'vertical'}: every 30fps frame and hold under shipped HybridStage turn`, () => {
      const wide = presentation ? getLongformLayout(presentation).model : undefined;
      const width = wide?.width ?? 1080,
        height = wide?.height ?? 960,
        meet = wide ? Math.min(width / 952, height / 478) : 1;
      const camera = new PerspectiveCamera(RESOURCE_DIFFUSION_CAMERA.fov, width / height, 0.1, 100);
      camera.position.set(...RESOURCE_DIFFUSION_CAMERA.position);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const originX = wide ? (width - 952 * meet) / 2 : 64,
        originY = wide ? (height - 478 * meet) / 2 : 262;
      const placement = [resourceDiffusionPlacement(0, wide), resourceDiffusionPlacement(1, wide)];
      const local = vertices.get(scene.storyId);
      if (!local) throw new Error('Missing actual authored geometry');
      expect(local.length).toBeGreaterThan(100);
      for (let frame = 0; frame <= Math.ceil((scene.resolveAt + 0.8) * 30); frame++) {
        const turn = diagramPose(frame / 30, scene).modelTurn,
          key = `${scene.storyId}:${presentation}:${turn}`;
        let box = projected.get(key);
        if (!box) {
          const extent = [Infinity, Infinity, -Infinity, -Infinity],
            v = new Vector3();
          for (const point of local) {
            const p = placement[point.column];
            v.copy(point.vertex)
              .multiplyScalar(p.scale)
              .add(new Vector3(...p.position))
              .applyAxisAngle(new Vector3(0, 1, 0), turn)
              .project(camera);
            const x = ((v.x + 1) * width) / 2,
              y = ((1 - v.y) * height) / 2;
            extent[0] = Math.min(extent[0], x);
            extent[1] = Math.min(extent[1], y);
            extent[2] = Math.max(extent[2], x);
            extent[3] = Math.max(extent[3], y);
          }
          if (projected.size === 2048) {
            const oldest = projected.keys().next().value;
            if (oldest !== undefined) projected.delete(oldest);
          }
          projected.set(key, extent);
          box = extent;
        }
        bounded(
          box,
          { x: originX, y: originY + 312 * meet, width: 484 * meet, height: 150 * meet },
          'actual kit vertices; no guessed proxy bounds',
        );
      }
    });
