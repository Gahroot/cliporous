import { Player } from '@remotion/player';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AnyZodObject } from 'remotion';
import { expect, it } from 'vitest';
import { getLongformLayout } from '../../../../../../shared/longform-layout';
import { DiagramChrome, DiagramSurface } from '../../diagrams/DiagramStage';
import { DIAGRAM_REGIONS, projectedDiagramRegion } from '../../diagrams/layout';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { stageSafeBox } from '../../types';
import { VisibilityAccessDiagram } from './visibility-access-Diagram';
import { visibilityAccessPages, visibilityAccessPose } from './visibility-access-poses';
import { accepted, interBounds, sources } from './visibility-access-test-fixtures';
import type { ExpansionVisibilityAccessScene } from './visibility-access-types';

const placements = [
  { aspect: '9:16', layout: 'stack' },
  { aspect: '9:16', layout: 'stack-flipped' },
  { aspect: '16:9', layout: 'takeover', presentation: 'full-frame' },
  { aspect: '16:9', layout: 'takeover', presentation: 'speaker-side' },
  { aspect: '16:9', layout: 'takeover', presentation: 'speaker-pip' },
] as const;
const decode = (s: string): string =>
  s.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, k: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[k] ?? k,
  );
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
  scene: ExpansionVisibilityAccessScene;
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
function chromeBoxes(html: string): { boxes: Box[]; fields: string[][] } {
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
        const ink = interBounds(line).map((v) => (v * size) / 22);
        const left = n.style['text-align'] === 'center' ? x + (width - ink[2]) / 2 : x;
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
it('authored full/speaker-side/pip and vertical envelope reservations, not compact certification', () => {
  for (const p of placements) {
    if ('presentation' in p) {
      const wide = getLongformLayout(p.presentation);
      expect(contains(wide.explanation, wide.model)).toBe(true);
      expect(separated(wide.model, wide.text)).toBe(true);
      expect(separated(wide.model, wide.caption)).toBe(true);
      if (wide.speaker) expect(separated(wide.model, wide.speaker)).toBe(true);
    } else {
      const body = projectedDiagramRegion(DIAGRAM_REGIONS.body, p.layout, p.aspect);
      expect(contains(stageSafeBox(p.layout, p.aspect), body)).toBe(true);
      for (const r of [
        DIAGRAM_REGIONS.title,
        DIAGRAM_REGIONS.condition,
        DIAGRAM_REGIONS.evidence,
        DIAGRAM_REGIONS.outcome,
      ])
        expect(separated(body, projectedDiagramRegion(r, p.layout, p.aspect))).toBe(true);
    }
  }
});
for (const [index, source] of sources.entries())
  it(`source ${index}: actual 30fps SVG pages and real Chrome/Inter ink in authored envelopes`, () => {
    const scene = accepted(source),
      pages = visibilityAccessPages(scene),
      visited = new Set<number>();
    for (let frame = 0; frame <= Math.floor(source.window.endTime * 30); frame++) {
      const pose = visibilityAccessPose(scene, frame / 30, pages);
      if (visited.has(pose.page)) continue;
      visited.add(pose.page);
      const diagram = createElement(VisibilityAccessDiagram, { scene, pose });
      const markup = renderToStaticMarkup(createElement('svg', null, diagram));
      expect(markup).not.toMatch(/textLength|lengthAdjust|clipPath|ellipsis|<canvas|NaN|Infinity/);
      const boxes: Box[] = [],
        sourceLines: string[] = [];
      for (const m of markup.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
        const attrs = Object.fromEntries(
            [...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], decode(a[2])]),
          ),
          value = decode(m[2]);
        const x = Number(attrs.x),
          y = Number(attrs.y),
          ink = interBounds(value);
        expect(attrs['font-family']).toBe(UI_FONT);
        expect(Number(attrs['font-size'])).toBe(22);
        const b = { x: x + ink[0], y: y + ink[1], width: ink[2] - ink[0], height: ink[3] - ink[1] };
        expect(
          contains({ x: x >= 492 ? 484 : 8, y: 8, width: x >= 492 ? 460 : 466, height: 470 }, b),
          value,
        ).toBe(true);
        expect(
          boxes.every((other) => separated(b, other)),
          `${value}: text overlap`,
        ).toBe(true);
        boxes.push(b);
        if (x === 492) sourceLines.push(value);
      }
      expect(sourceLines).toEqual(pages[pose.page].lines);
      const hybrid = renderToStaticMarkup(
        createElement(
          'svg',
          null,
          createElement(VisibilityAccessDiagram, {
            scene: { ...scene, visualMode: 'hybrid' },
            pose,
          }),
        ),
      );
      expect(hybrid).toBe(markup);
      for (const p of placements) {
        const region =
          'presentation' in p ? getLongformLayout(p.presentation).model : DIAGRAM_REGIONS.body;
        const scale = Math.min(region.width / 952, region.height / 478),
          ox = region.x + (region.width - 952 * scale) / 2,
          oy = region.y + (region.height - 478 * scale) / 2;
        for (const b of boxes)
          expect(
            contains(region, {
              x: ox + b.x * scale,
              y: oy + b.y * scale,
              width: b.width * scale,
              height: b.height * scale,
            }),
          ).toBe(true);
        if (pose.page === 0) {
          const surface = renderToStaticMarkup(
            createElement(
              ExplainerProvider,
              {
                value: { ...p, nativeStage: true },
              },
              createElement(DiagramSurface, null, diagram),
            ),
          );
          expect(surface).toContain(
            `left:${region.x}px;top:${region.y}px;width:${region.width}px;height:${region.height}px`,
          );
          expect(surface).toContain('preserveAspectRatio="xMidYMid meet"');
        }
      }
    }
    expect(visited.size).toBe(pages.length);
    for (const p of placements) {
      const html = renderToStaticMarkup(
        createElement(Player<AnyZodObject, ChromeProps>, {
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
      // Wrapping can split a long token or consume a separator at a line boundary.
      // Compare each complete field independently, preserving every non-whitespace character.
      const expected = [
        scene.label,
        ...(scene.condition ? [scene.condition] : []),
        scene.evidence === 'illustrative' ? 'Illustrative example' : 'Source-stated',
        scene.outcome,
      ];
      expect(chrome.fields.map((lines) => lines.join('').replace(/\s/gu, ''))).toEqual(
        expected.map((value) => value.replace(/\s/gu, '')),
      );
      for (const [i, b] of chrome.boxes.entries()) {
        expect(chrome.boxes.slice(i + 1).every((other) => separated(b, other))).toBe(true);
        const region =
          'presentation' in p ? getLongformLayout(p.presentation).model : DIAGRAM_REGIONS.body;
        expect(separated(b, region)).toBe(true);
      }
    }
  });
