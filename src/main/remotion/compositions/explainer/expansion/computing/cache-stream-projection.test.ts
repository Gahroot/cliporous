import { readFileSync } from 'node:fs';
import { Player } from '@remotion/player';
import type { ReactElement } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AnyZodObject } from 'remotion';
import { describe, expect, it } from 'vitest';
import { getLongformLayout } from '../../../../../../shared/longform-layout';
import { DiagramChrome, DiagramSurface } from '../../diagrams/DiagramStage';
import { DIAGRAM_REGIONS } from '../../diagrams/layout';
import { ExplainerProvider } from '../../stage';
import { CacheStreamDiagram } from './cache-stream-Diagram';
import { cacheStreamPose } from './cache-stream-poses';
import { cacheStreamCases } from './cache-stream-test-fixtures';
import type { ExpansionCacheStreamScene } from './cache-stream-types';

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

describe('shipped Inter current-page glyph envelopes (CPU only)', () => {
  for (const [index, scene] of cacheStreamCases().entries())
    it(`source ${index}`, () => {
      cache.clear();
      const base = cacheStreamPose(scene, scene.setupAt);
      for (let page = 0; page < base.pages.length; page++) {
        const svg = renderToStaticMarkup(
          createElement(
            DiagramSurface,
            null,
            createElement(CacheStreamDiagram, { scene, pose: { ...base, page } }),
          ),
        );
        const fact = base.pages[page].fact;
        const stateLabels = [
          ...svg.matchAll(/<text\b([^>]*data-qualification-state[^>]*)>(.*?)<\/text>/g),
        ];
        expect(stateLabels).toHaveLength(fact ? 1 : 0);
        if (fact) {
          expect(attrs(stateLabels[0][1])['data-qualification-state']).toBe(
            fact.qualification.state,
          );
          expect(decode(stateLabels[0][2])).toBe(fact.qualification.state);
        }
        for (const match of svg.matchAll(/<text\b([^>]*)>(.*?)<\/text>/g)) {
          const a = attrs(match[1]),
            text = decode(match[2]),
            box = extent(text, Number(a['font-size']));
          const x = Number(a.x),
            y = Number(a.y);
          expect(Number(a['font-size'])).toBeGreaterThanOrEqual(22);
          expect(x + box[0], text).toBeGreaterThanOrEqual(0);
          expect(x + box[2], text).toBeLessThanOrEqual(x >= 484 ? 944 : 484);
          expect(y + box[1], text).toBeGreaterThanOrEqual(0);
          expect(y + box[3], text).toBeLessThanOrEqual(478);
          if (a['data-qualification-state']) {
            expect(x + box[0], text).toBeGreaterThanOrEqual(260);
            expect(x + box[2], text).toBeLessThanOrEqual(450);
            expect(y + box[1], text).toBeGreaterThanOrEqual(292);
            expect(y + box[3], text).toBeLessThanOrEqual(321);
          }
        }
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
type Box = { x: number; y: number; width: number; height: number };
const separated = (a: Box, b: Box): boolean =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
function ChromeProof({
  scene,
  placement,
}: {
  scene: ExpansionCacheStreamScene;
  placement: (typeof placements)[number];
}): ReactElement {
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
function chromeBoxes(html: string): { boxes: Box[]; text: string } {
  const boxes: Box[] = [],
    values: string[] = [];
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
      lines.forEach((line, i) => {
        values.push(line);
        const ink = extent(line, size);
        const left = n.style['text-align'] === 'center' ? x + (width - ink[2]) / 2 : x;
        const top = y + i * size * leading;
        const box = { x: left + ink[0], y: top, width: ink[2] - ink[0], height: ink[3] - ink[1] };
        expect(box.width, line).toBeLessThanOrEqual(width);
        boxes.push(box);
      });
    } else n.children.forEach(visit);
  };
  visit(htmlTree(html));
  return { boxes, text: values.join('') };
}

for (const [index, scene] of cacheStreamCases().entries())
  it(`real Chrome placement source ${index}`, () => {
    cache.clear();
    for (const p of placements) {
      const html = renderToStaticMarkup(
        createElement(Player<AnyZodObject, Parameters<typeof ChromeProof>[0]>, {
          component: ChromeProof,
          inputProps: { scene, placement: p },
          durationInFrames: 360,
          compositionWidth: p.aspect === '16:9' ? 1920 : 1080,
          compositionHeight: p.aspect === '16:9' ? 1080 : 1920,
          fps: 30,
          initialFrame: 330,
          noSuspense: true,
        }),
      );
      const chrome = chromeBoxes(html);
      expect(chrome.boxes.length).toBeGreaterThanOrEqual(3);
      expect(chrome.text).toContain(scene.label);
      expect(chrome.text).toContain(scene.outcome);
      if (scene.condition)
        expect(chrome.text.replace(/\s/g, '')).toContain(scene.condition.replace(/\s/g, ''));
      for (const [i, b] of chrome.boxes.entries()) {
        expect(chrome.boxes.slice(i + 1).every((other) => separated(b, other))).toBe(true);
        const region =
          'presentation' in p ? getLongformLayout(p.presentation).model : DIAGRAM_REGIONS.body;
        expect(separated(b, region)).toBe(true);
      }
      const base = cacheStreamPose(scene, scene.setupAt);
      const surface = renderToStaticMarkup(
        createElement(
          ExplainerProvider,
          {
            value: { ...p, nativeStage: true },
          },
          createElement(
            DiagramSurface,
            null,
            createElement(CacheStreamDiagram, { scene, pose: base }),
          ),
        ),
      );
      expect(surface).toContain('preserveAspectRatio="xMidYMid meet"');
    }
  });
