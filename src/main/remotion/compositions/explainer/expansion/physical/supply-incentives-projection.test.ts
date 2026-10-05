import { readFileSync } from 'node:fs';
import { Player } from '@remotion/player';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AnyZodObject } from 'remotion';
import { Matrix4, PerspectiveCamera } from 'three';
import { expect, it } from 'vitest';
import { getLongformLayout } from '../../../../../../shared/longform-layout';
import { DiagramChrome, DiagramSurface } from '../../diagrams/DiagramStage';
import { DIAGRAM_REGIONS } from '../../diagrams/layout';
import { diagramPose } from '../../diagrams/motion';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { SupplyIncentivesDiagram } from './supply-incentives-Diagram';
import { SUPPLY_INCENTIVES_CAMERA } from './supply-incentives-models';
import { supplyIncentivesActiveRecord, supplyIncentivesPose } from './supply-incentives-poses';
import {
  supplyIncentivesCases,
  supplyIncentivesModelEvidence,
} from './supply-incentives-test-fixtures';
import type { ExpansionSupplyIncentivesScene } from './supply-incentives-types';

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
function interInk() {
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
  return { extent, cache };
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

const cases = supplyIncentivesCases();
const presentations = [undefined, 'speaker-side', 'speaker-pip', 'full-frame'] as const;
for (const [index, scene] of cases.entries())
  for (const presentation of presentations)
    it(`source ${index}, ${presentation ?? 'vertical'}: shipped Inter current-page ink, exact qualifiers and planar nonoverlap in both modes`, () => {
      const { extent, cache } = interInk();
      const reachable = new Map<number, ReturnType<typeof supplyIncentivesPose>>();
      for (
        let frame = Math.ceil(scene.setupAt * 30);
        frame <= Math.floor(scene.resolveAt * 30);
        frame++
      ) {
        const pose = supplyIncentivesPose(scene, frame / 30);
        if (!reachable.has(pose.page)) reachable.set(pose.page, pose);
      }
      const region = presentation ? getLongformLayout(presentation).model : DIAGRAM_REGIONS.body;
      const meet = Math.min(region.width / 952, region.height / 478);
      expect(22 * meet).toBeGreaterThanOrEqual(22);
      expect(reachable.size).toBe(supplyIncentivesPose(scene, scene.setupAt).pages.length);
      for (const pose of reachable.values()) {
        const page = pose.pages[pose.page];
        const render = (visualMode: 'diagram' | 'hybrid') =>
          renderToStaticMarkup(
            createElement(
              ExplainerProvider,
              {
                value: { aspect: presentation ? '16:9' : '9:16', presentation, nativeStage: true },
              },
              createElement(
                DiagramSurface,
                null,
                createElement(SupplyIncentivesDiagram, {
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
          emitted: string[] = [],
          qualification: string[] = [];
        for (const m of markup.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
          const a = attrs(m[1]),
            text = decode(m[2]),
            x = Number(a.x),
            y = Number(a.y),
            size = Number(a['font-size']);
          expect(a['font-family']).toBe(UI_FONT);
          expect(size).toBe(22);
          const ink = extent(text, size),
            box = [x + ink[0], y + ink[1], x + ink[2], y + ink[3]];
          bounded(
            box,
            x >= 484
              ? { x: 484, y: 8, width: 460, height: 462 }
              : { x: 0, y: 8, width: 484, height: 350 },
            text,
          );
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
          if (x === 500 && y >= 246 && y <= 386) emitted.push(text);
          if (x === 500 && y >= 66 && y <= 206) qualification.push(text);
        }
        expect(emitted).toEqual(page.lines);
        expect(qualification).toEqual(page.qualification);
        expect(markup).toContain(
          `${page.quantityIndex === undefined ? 'Fact' : 'Quantity'}: ${page.state ?? scene.evidence}</text>`,
        );
        if (page.quantityIndex !== undefined)
          expect(markup).toContain(
            `data-quantity-state="${scene.quantities[page.quantityIndex].state}"`,
          );
      }
      expect(cache.size).toBeLessThanOrEqual(512);
    });

const placements = [
  { aspect: '9:16', layout: 'stack' },
  { aspect: '9:16', layout: 'stack-flipped' },
  { aspect: '16:9', layout: 'takeover', presentation: 'full-frame' },
  { aspect: '16:9', layout: 'takeover', presentation: 'speaker-side' },
  { aspect: '16:9', layout: 'takeover', presentation: 'speaker-pip' },
] as const;
type Box = { x: number; y: number; width: number; height: number };
const separated = (a: Box, b: Box): boolean =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}
type ChromeProps = {
  scene: ExpansionSupplyIncentivesScene;
  placement: (typeof placements)[number];
};
function ChromeProof({ scene, placement }: ChromeProps): ReactElement {
  return createElement(
    ExplainerProvider,
    {
      value: { ...placement, nativeStage: true },
    },
    createElement(DiagramChrome, { scene }),
  );
}
// Small bounded parser for actual server markup. Not a DOM, font cache or fake context.
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
      const style = /style="([^"]*)"/.exec(m[1])?.[1] ?? '';
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
function chromeBoxes(
  html: string,
  extent: ReturnType<typeof interInk>['extent'],
): { boxes: Box[]; fields: string[][] } {
  const boxes: Box[] = [],
    fields: string[][] = [];
  const visit = (n: HtmlNode) => {
    if (n.style.position === 'absolute' && n.style['font-size']) {
      const size = parseFloat(n.style['font-size']),
        width = parseFloat(n.style.width),
        x = parseFloat(n.style.left),
        y = parseFloat(n.style.top),
        leading = parseFloat(n.style['line-height']);
      const allText = (a: HtmlNode): string => a.text + a.children.map(allText).join('');
      const lines = n.children.length
        ? n.children.flatMap((c) => allText(c).split('\n'))
        : n.text.split('\n');
      fields.push(lines);
      lines.forEach((line, i) => {
        const ink = extent(line, size);
        const left = n.style['text-align'] === 'center' ? x + (width - ink[4]) / 2 : x;
        const top = y + i * size * leading;
        const box = { x: left + ink[0], y: top, width: ink[2] - ink[0], height: ink[3] - ink[1] };
        expect(box.width, line).toBeLessThanOrEqual(width);
        boxes.push(box);
      });
    } else n.children.forEach(visit);
  };
  visit(htmlTree(html));
  return { boxes, fields };
}

for (const [index, scene] of cases.entries())
  for (const p of placements) {
    it(`source ${index}, ${p.layout}, ${'presentation' in p ? p.presentation : p.aspect}: actual Player-hosted Chrome preserves fields and reserved envelopes`, () => {
      const { extent, cache } = interInk();
      {
        const html = renderToStaticMarkup(
          createElement(Player<AnyZodObject, ChromeProps>, {
            component: ChromeProof,
            inputProps: { scene, placement: p },
            durationInFrames: 360,
            compositionWidth: p.aspect === '16:9' ? 1920 : 1080,
            compositionHeight: p.aspect === '16:9' ? 1080 : 1920,
            fps: 30,
            initialFrame: 359,
            noSuspense: true,
          }),
        );
        const chrome = chromeBoxes(html, extent);
        expect(chrome.boxes.length).toBeGreaterThanOrEqual(3);
        expect(chrome.fields.map((lines) => lines.join('').replace(/\s/gu, ''))).toEqual(
          [
            scene.label,
            ...(scene.condition ? [scene.condition] : []),
            'Source-stated',
            scene.outcome,
          ].map((s) => s.replace(/\s/gu, '')),
        );
        const region =
          'presentation' in p ? getLongformLayout(p.presentation).model : DIAGRAM_REGIONS.body;
        for (const [i, b] of chrome.boxes.entries()) {
          expect(
            contains(
              {
                x: 0,
                y: 0,
                width: p.aspect === '16:9' ? 1920 : 1080,
                height: p.aspect === '16:9' ? 1080 : 960,
              },
              b,
            ),
          ).toBe(true);
          expect(chrome.boxes.slice(i + 1).every((other) => separated(b, other))).toBe(true);
          expect(separated(b, region)).toBe(true);
        }
      }
      expect(cache.size).toBeLessThanOrEqual(512);
    });
  }
for (const [index, scene] of cases.entries())
  for (const presentation of [undefined, 'speaker-side', 'speaker-pip', 'full-frame'] as const)
    it(`source ${index}, ${presentation ?? 'vertical'}: actual composed geometry and HybridStage turn stay in the model strip at every frame`, () => {
      const region = presentation
        ? getLongformLayout(presentation).model
        : { x: 0, y: 0, width: 1080, height: 960 };
      const camera = new PerspectiveCamera(
        SUPPLY_INCENTIVES_CAMERA.fov,
        region.width / region.height,
        0.1,
        100,
      );
      camera.position.set(...SUPPLY_INCENTIVES_CAMERA.position);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const meet = presentation ? Math.min(region.width / 952, region.height / 478) : 1;
      const ox = presentation ? (region.width - 952 * meet) / 2 : 64;
      const oy = presentation ? (region.height - 478 * meet) / 2 : 262;
      const strip = {
        x: ox + 24 * meet,
        y: oy + 368 * meet,
        width: 320 * meet,
        height: 102 * meet,
      };
      const evidence = new Map<string, ReturnType<typeof supplyIncentivesModelEvidence>>();
      for (const time of [
        ...Array.from({ length: 361 }, (_, f) => f / 30),
        NaN,
        Infinity,
        -Infinity,
        100,
      ]) {
        const pose = supplyIncentivesPose(scene, time);
        const r = supplyIncentivesActiveRecord(scene, pose);
        let model = evidence.get(r.id);
        if (!model) {
          const from = supplyIncentivesModelEvidence(
            scene,
            { ...pose, travel: -0.8 },
            presentation,
          );
          const to = supplyIncentivesModelEvidence(scene, { ...pose, travel: 0.8 }, presentation);
          model = { ...from, corners: [...from.corners, ...to.corners] };
          evidence.set(r.id, model);
        }
        expect(evidence.size).toBeLessThanOrEqual(5);
        const turn = new Matrix4().makeRotationY(
          diagramPose(Number.isFinite(time) ? time : scene.setupAt, scene).modelTurn,
        );
        const envelope = [Infinity, Infinity, -Infinity, -Infinity];
        for (const corner of model.corners) {
          const v = corner.clone().applyMatrix4(turn).project(camera);
          const x = ((v.x + 1) * region.width) / 2,
            y = ((1 - v.y) * region.height) / 2;
          envelope[0] = Math.min(envelope[0], x);
          envelope[1] = Math.min(envelope[1], y);
          envelope[2] = Math.max(envelope[2], x);
          envelope[3] = Math.max(envelope[3], y);
        }
        // Extrema of EVERY composed corner are equivalent to the individual strict bounds.
        expect(envelope.every(Number.isFinite)).toBe(true);
        bounded(envelope, strip, `actual ${r.id} geometry at ${time}`);
      }
    });
