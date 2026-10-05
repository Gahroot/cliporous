import { readFileSync } from 'node:fs';
import { Player } from '@remotion/player';
import type { ReactElement } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AnyZodObject } from 'remotion';
import { Euler, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { getLongformLayout } from '../../../../../../shared/longform-layout';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { DIAGRAM_REGIONS, labelLines } from '../../diagrams/layout';
import { diagramPose } from '../../diagrams/motion';
import { fitEditorialText, longformTextRegions } from '../../longform-stage-layout';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { GeneralizationDriftDiagram } from './generalization-drift-Diagram';
import {
  GENERALIZATION_DRIFT_CAMERA,
  generalizationDriftModelPlacement,
} from './generalization-drift-models';
import { generalizationDriftPose } from './generalization-drift-poses';
import { GeneralizationDriftView } from './generalization-drift-Scene';
import {
  generalizationDriftCarrierGeometry,
  generalizationDriftCases,
} from './generalization-drift-test-fixtures';
import type { ExpansionGeneralizationDriftScene } from './generalization-drift-types';

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

describe('generalization/drift shipped Inter ink and actual projection (CPU only)', () => {
  for (const [index, scene] of generalizationDriftCases().entries())
    it(`source case ${index}: all pages and native envelopes`, () => {
      cache.clear();
      const base = generalizationDriftPose(scene, scene.setupAt);
      for (const presentation of [
        undefined,
        'speaker-side',
        'speaker-pip',
        'full-frame',
      ] as const) {
        const region = presentation ? getLongformLayout(presentation).model : DIAGRAM_REGIONS.body;
        const meet = Math.min(region.width / 952, region.height / 478);
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
                  createElement(GeneralizationDriftDiagram, {
                    scene: { ...scene, visualMode },
                    pose,
                  }),
                ),
              ),
            );
          const markup = render('diagram');
          expect(render('hybrid')).toBe(markup);
          expect(markup).not.toMatch(/NaN|Infinity|ellipsis|textLength|lengthAdjust|<canvas/);
          const boxes: number[][] = [];
          const emitted: string[][] = [[], []];
          for (const m of markup.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
            const a = attrs(m[1]),
              text = decode(m[2]),
              x = Number(a.x),
              y = Number(a.y),
              size = Number(a['font-size']);
            expect(a['font-family']).toBe(UI_FONT);
            expect(size).toBe(22);
            const g = extent(text, size),
              box = [x + g[0], y + g[1], x + g[2], y + g[3]],
              col = x < 476 ? 0 : 1;
            bounded(
              box,
              { x: 12 + col * 476, y: y <= 394 ? 8 : 420, width: 452, height: y <= 394 ? 386 : 58 },
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
            if (y >= 126 && y <= 322) emitted[col].push(text);
            if (y === 36 && (x === 250 || x === 726)) {
              expect(text).toBe(scene.records[col].result.state);
              bounded(
                box,
                { x: 250 + col * 476, y: 12, width: 198, height: 30 },
                `persistent ${text} tag`,
              );
            }
          }
          expect(emitted).toEqual(pose.pages[page].lanes);
        }
      }
      expect(cache.size).toBeLessThanOrEqual(512);
    });
  for (const [index, scene] of generalizationDriftCases().entries())
    it(`source ${index}: exact shared Chrome wrapping and actual reserved slots`, () => {
      cache.clear();
      // DiagramChrome calls these exact labelLines/fitEditorialText functions and uses these slots.
      for (const presentation of [
        undefined,
        'speaker-side',
        'speaker-pip',
        'full-frame',
      ] as const) {
        const texts = {
          title: scene.label,
          condition: '',
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
      }
    });
  for (const presentation of [undefined, 'speaker-side', 'speaker-pip', 'full-frame'] as const)
    it(`actual carrier geometry and HybridStage rotation: ${presentation ?? 'vertical'}`, () => {
      const wide = presentation ? getLongformLayout(presentation).model : undefined;
      const width = wide?.width ?? 1080,
        height = wide?.height ?? 960,
        meet = wide ? Math.min(width / 952, height / 478) : 1;
      const camera = new PerspectiveCamera(
        GENERALIZATION_DRIFT_CAMERA.fov,
        width / height,
        0.1,
        100,
      );
      camera.position.set(...GENERALIZATION_DRIFT_CAMERA.position);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const carriers = generalizationDriftCarrierGeometry();
      expect(carriers).toHaveLength(3);
      const scene = generalizationDriftCases()[0];
      for (let frame = 0; frame <= 360; frame++) {
        const rotation = new Euler(0, diagramPose(frame / 30, scene).modelTurn, 0);
        for (const column of [0, 1]) {
          const p = generalizationDriftModelPlacement(column, wide);
          for (const { geometry, position } of carriers) {
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            if (!box) throw new Error('Missing real geometry bounds');
            for (const dx of [box.min.x, box.max.x])
              for (const dy of [box.min.y, box.max.y])
                for (const dz of [box.min.z, box.max.z]) {
                  const v = new Vector3(
                    p.position[0] + (dx + position[0]) * p.scale,
                    p.position[1] + (dy + position[1]) * p.scale,
                    (dz + position[2]) * p.scale,
                  )
                    .applyEuler(rotation)
                    .project(camera);
                  const x = ((v.x + 1) * width) / 2,
                    y = ((1 - v.y) * height) / 2,
                    ox = wide ? (width - 952 * meet) / 2 : 64,
                    oy = wide ? (height - 478 * meet) / 2 : 262;
                  bounded(
                    [x, y, x, y],
                    {
                      x: ox + (200 + column * 476) * meet,
                      y: oy + 400 * meet,
                      width: 76 * meet,
                      height: 46 * meet,
                    },
                    'carrier including zero-opacity handoff',
                  );
                }
          }
        }
      }
      for (const { geometry } of carriers) geometry.dispose();
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
  scene: ExpansionGeneralizationDriftScene;
  placement: (typeof placements)[number];
}): ReactElement {
  return createElement(
    ExplainerProvider,
    {
      value: { ...placement, nativeStage: true },
    },
    createElement(GeneralizationDriftView, { scene }),
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
for (const [index, scene] of generalizationDriftCases().entries())
  for (const placement of placements)
    it(`real Player current pages + actual Chrome ink source ${index}/${placement.layout}/${'presentation' in placement ? placement.presentation : 'vertical'}`, () => {
      cache.clear();
      const pages = generalizationDriftPose(scene, 0).pages;
      const frames = new Map<number, number>();
      for (let f = Math.ceil(scene.setupAt * 30); f <= Math.floor(scene.resolveAt * 30); f++) {
        const p = generalizationDriftPose(scene, f / 30);
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
        expect(html).toContain(`data-generalization-drift-page="${page}"`);
        for (const column of [0, 1])
          expect(html).toContain(
            `x="${250 + column * 476}" y="36" font-family="${UI_FONT.replace(/'/g, '&#x27;')}" font-size="22"`,
          );
        const tags = [...html.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].filter(
          (m) => Number(attrs(m[1]).y) === 36 && [250, 726].includes(Number(attrs(m[1]).x)),
        );
        expect(tags.map((m) => decode(m[2]))).toEqual(scene.records.map((r) => r.result.state));
        const emitted: string[][] = [[], []];
        for (const m of html.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
          const a = attrs(m[1]),
            y = Number(a.y);
          if (y >= 126 && y <= 322) emitted[Number(a.x) < 476 ? 0 : 1].push(decode(m[2]));
        }
        expect(emitted).toEqual(pages[page].lanes);
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
        expect(texts.join('').replace(/\s/g, '')).toContain(scene.label.replace(/\s/g, ''));
        expect(texts.join('').replace(/\s/g, '')).toContain(scene.outcome.replace(/\s/g, ''));
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
