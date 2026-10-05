import { Player } from '@remotion/player';
import type { ReactElement } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AnyZodObject } from 'remotion';
import { expect, it } from 'vitest';
import { getLongformLayout } from '../../../../../../shared/longform-layout';
import { DiagramChrome, DiagramSurface } from '../../diagrams/DiagramStage';
import { DIAGRAM_REGIONS, projectedDiagramRegion } from '../../diagrams/layout';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { stageSafeBox } from '../../types';
import { FitScaleDiagram } from './fit-scale-Diagram';
import { fitScalePose } from './fit-scale-poses';
import {
  accepted,
  decode,
  interBounds,
  linkedFixture,
  maximumPacking,
  packet,
  qualifiedResult,
} from './fit-scale-test-fixtures';
import type { ExpansionFitScaleScene } from './fit-scale-types';

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
function ChromeProof({
  scene,
  placement,
}: {
  scene: ExpansionFitScaleScene;
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
  return { boxes, text: values.join('') };
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

for (const state of ['missing', 'disputed'] as const)
  it(`packing preserves supplied ${state} with unknown verdict`, () => {
    const scene = accepted(qualifiedResult('59', state));
    expect(scene.result.state).toBe(state);
    expect(scene.outcome).toBe(state);
    if (scene.storyId !== '59') throw new Error('Packing scene expected');
    expect(scene.result.verdict).toBe('unknown');
  });
for (const story of [
  ...packet.stories,
  maximumPacking(),
  ...(['unknown', 'missing', 'disputed'] as const).map((state) => qualifiedResult('60', state)),
  qualifiedResult('59', 'unknown'),
  qualifiedResult('59', 'missing'),
  qualifiedResult('59', 'disputed'),
  linkedFixture('measured'),
  linkedFixture('schematic'),
  linkedFixture('measured', true),
  qualifiedResult('59', 'blocked'),
])
  it(`actual Inter source pages ${story.id}`, () => {
    const scene = accepted(story);
    const pose = fitScalePose(scene, 10);
    for (let page = 0; page < pose.pages.length; page++) {
      const markup = renderToStaticMarkup(
        createElement(
          'svg',
          null,
          createElement(FitScaleDiagram, { scene, pose: { ...pose, page } }),
        ),
      );
      expect(markup).toContain(`Supplied ${scene.result.state}`);
      if (scene.storyId === '60') {
        expect(markup).toContain(`Continuity: ${scene.result.state}`);
        expect(markup).not.toContain('Same source identity');
        for (const role of ['Object', 'Room', 'Building']) expect(markup).toContain(role);
      }
      if ('condition' in scene.result) expect(markup).toContain(scene.result.condition);
      expect(markup).not.toMatch(/NaN|Infinity|textLength|clipPath|ellipsis|canvas/);
      const boxes: number[][] = [];
      for (const m of markup.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
        const attrs = Object.fromEntries(
          [...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]),
        );
        const x = Number(attrs.x),
          y = Number(attrs.y),
          ink = interBounds(decode(m[2]));
        const box = [x + ink[0], y + ink[1], x + ink[2], y + ink[3]];
        expect(box[0]).toBeGreaterThanOrEqual(8);
        expect(box[2]).toBeLessThanOrEqual(x >= 492 ? 944 : 474);
        expect(box[1]).toBeGreaterThanOrEqual(8);
        expect(box[3]).toBeLessThanOrEqual(478);
        expect(
          boxes.every((b) => box[0] >= b[2] || box[2] <= b[0] || box[1] >= b[3] || box[3] <= b[1]),
        ).toBe(true);
        boxes.push(box);
      }
    }
  });

for (const [index, source] of [
  ...packet.stories,
  maximumPacking(),
  linkedFixture('measured'),
  linkedFixture('schematic'),
  linkedFixture('measured', true),
  ...(['unknown', 'missing', 'disputed'] as const).flatMap((s) => [
    qualifiedResult('59', s),
    qualifiedResult('60', s),
  ]),
].entries())
  it(`source ${index}: actual 30fps SVG pages and real Chrome/Inter ink in authored envelopes`, () => {
    const scene = accepted(source),
      pages = fitScalePose(scene, 0).pages,
      visited = new Set<number>();
    for (let frame = 0; frame <= Math.floor(source.window.endTime * 30); frame++) {
      const pose = fitScalePose(scene, frame / 30);
      if (visited.has(pose.page)) continue;
      visited.add(pose.page);
      const diagram = createElement(FitScaleDiagram, { scene, pose });
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
        expect(decode(markup)).toContain(`font-family="${UI_FONT}"`);
        expect(markup).toContain('font-size="22"');
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
          createElement(FitScaleDiagram, { scene: { ...scene, visualMode: 'hybrid' }, pose }),
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
      if (scene.condition) expect(chrome.text).toContain(scene.condition);
      for (const [i, b] of chrome.boxes.entries()) {
        expect(chrome.boxes.slice(i + 1).every((other) => separated(b, other))).toBe(true);
        const region =
          'presentation' in p ? getLongformLayout(p.presentation).model : DIAGRAM_REGIONS.body;
        expect(separated(b, region)).toBe(true);
      }
    }
  });
