import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { ExplainerProvider } from '../../stage';
import { VariationRangeDiagram } from './variation-range-Diagram';
import {
  variationRangeMeet,
  variationRangeModelProjection,
  variationRangePages,
  variationRangePageTimes,
  variationRangePose,
  variationRangeRecords,
} from './variation-range-poses';
import { variationRangeTestScenes, variationRangeTimes } from './variation-range-poses.fixtures';
import type { ExpansionProbabilityVariationRangeScene } from './variation-range-types';

function variationRangeSvgNodes(svg: string) {
  const stack: { opacity: number; attributes: Record<string, string> }[] = [];
  const nodes: {
    tag: string;
    opacity: number;
    attributes: Record<string, string>;
    parents: Record<string, string>[];
  }[] = [];
  for (const match of svg.matchAll(/<(\/)?([\w-]+)([^>]*?)(\/?)>/g)) {
    if (match[1]) {
      stack.pop();
      continue;
    }
    const attributes = Object.fromEntries(
      [...match[3].matchAll(/([\w-]+)="([^"]*)"/g)].map((entry) => [entry[1], entry[2]]),
    );
    const opacity = (stack.at(-1)?.opacity ?? 1) * Number(attributes.opacity ?? 1);
    nodes.push({
      tag: match[2],
      opacity,
      attributes,
      parents: stack.map((entry) => entry.attributes),
    });
    if (!match[4]) stack.push({ opacity, attributes });
  }
  return nodes;
}
function variationRangeMarkup(
  scene: ExpansionProbabilityVariationRangeScene,
  t: number,
  aspect: '9:16' | '16:9' = '9:16',
) {
  return renderToStaticMarkup(
    createElement(
      ExplainerProvider,
      {
        value: {
          aspect,
          nativeStage: true,
          presentation: aspect === '16:9' ? 'full-frame' : undefined,
        },
      },
      createElement(
        DiagramSurface,
        null,
        createElement(VariationRangeDiagram, {
          scene,
          pose: variationRangePose(scene, t),
        }),
      ),
    ),
  );
}
const escaped = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

/** Authored one-em text envelope, not browser glyph/raster or native GPU proof. */
function assertText(svg: string) {
  for (const node of variationRangeSvgNodes(svg).filter(
    (node) => node.attributes['data-source-text'],
  )) {
    const a = node.attributes,
      size = Number(a['font-size']),
      lines = Number(a['data-line-count']);
    expect(size).toBeGreaterThanOrEqual(22);
    expect(lines * size * 1.1).toBeLessThanOrEqual(Number(a['data-text-height']));
    expect(Number(a.x)).toBeGreaterThanOrEqual(0);
    expect(Number(a.x) + Number(a['data-text-width'])).toBeLessThanOrEqual(952);
    expect(Number(a['data-text-y']) + Number(a['data-text-height'])).toBeLessThanOrEqual(478);
  }
}

describe('variation/range composed planar source text and static camera projection (CPU/SSR)', () => {
  it('retains every complete operand, source identity, unit, scope, state and qualified meaning in both modes/aspects', () => {
    for (const original of variationRangeTestScenes())
      for (const visualMode of ['diagram', 'hybrid'] as const)
        for (const aspect of ['9:16', '16:9'] as const) {
          const scene = { ...original, visualMode },
            t = scene.resolveAt + 0.2;
          const svg = variationRangeMarkup(scene, t, aspect);
          expect(svg).toContain('viewBox="0 0 952 478"');
          expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
          expect(svg).not.toMatch(/NaN|Infinity|…|<canvas/);
          assertText(svg);
          for (const record of variationRangeRecords(scene)) {
            expect(svg).toContain(`data-page-record-id="${record.id}"`);
            if (scene.storyId === '13')
              expect(svg).toContain(`data-value-state="${record.quantity.state}"`);
            expect(svg).toContain(escaped(record.quantity.actor));
            if ('amount' in record.quantity) {
              const notation = record.quantity.amount.notation;
              if (notation === undefined)
                throw new Error('Accepted source operands must retain notation');
              expect(svg).toContain(escaped(notation));
            }
            // Qualifications may span fixed-size pages; exact emitted reconstruction is checked below.
            const basis = record.quantity.basis;
            for (const text of [basis.unit, basis.period, basis.population])
              expect(svg).toContain(escaped(text));
          }
          expect(svg).toContain(escaped(scene.meaning.qualification));
          if (scene.storyId === '13')
            for (const sample of scene.samples)
              expect(svg).toContain(`data-entity-id="${sample.entityId}"`);
          else expect(svg).toContain(`data-actor-id="${scene.actorId}"`);
          expect(svg).toEqual(variationRangeMarkup(scene, scene.resolveAt + 100, aspect));
          const seen = new Set<number>();
          const emitted = new Map<number, string>();
          for (const [index, time] of variationRangePageTimes(scene).entries()) {
            const pageSvg = variationRangeMarkup(scene, time, aspect);
            assertText(pageSvg);
            const visible = variationRangeSvgNodes(pageSvg).filter(
              (node) => node.attributes['data-page-index'] && node.opacity === 1,
            );
            expect(visible).toHaveLength(1);
            expect(Number(visible[0].attributes['data-page-index'])).toBe(index);
            seen.add(index);
            const page = variationRangePages(scene)[index];
            const nodes = [
              ...pageSvg.matchAll(/<text[^>]*data-source-text="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g),
            ];
            const body = nodes.find((node) => node[1] === escaped(page.text));
            if (!body) throw new Error('The focused source page must actually emit its text');
            const printed = body[2]
              .replace(/<[^>]+>/g, '')
              .replace(/&#x27;/g, "'")
              .replace(/&quot;/g, '"')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&amp;/g, '&');
            expect(printed).toBe(page.text);
            emitted.set(page.recordIndex, (emitted.get(page.recordIndex) ?? '') + printed);
          }
          expect(seen.size).toBe(variationRangePages(scene).length);
          // Each operand's facts are partitioned losslessly, not clipped/shrunk or dropped on long-label pages.
          for (const [recordIndex, record] of variationRangeRecords(scene).entries()) {
            const text = emitted.get(recordIndex);
            if (text === undefined)
              throw new Error('Every source record must have a visible emitted page');
            expect(text).toBe(
              variationRangePages(scene)
                .filter((page) => page.recordIndex === recordIndex)
                .map((page) => page.text)
                .join(''),
            );
            expect(text).toContain(record.quantity.claim);
            expect(text).toContain(scene.meaning.qualification);
            if ('qualifier' in record.quantity) expect(text).toContain(record.quantity.qualifier);
            if ('condition' in record.quantity) expect(text).toContain(record.quantity.condition);
          }
        }
  });
  it('checks actual rendered row, band and text bounds with uniform meet in portrait/wide; bounded source-preserving pages', () => {
    for (const scene of variationRangeTestScenes()) {
      const svg = variationRangeMarkup(scene, scene.resolveAt + 0.2);
      for (const node of variationRangeSvgNodes(svg)) {
        const a = node.attributes;
        if (node.tag === 'circle') {
          expect(Number(a.cx)).toBeGreaterThanOrEqual(20);
          expect(Number(a.cx)).toBeLessThanOrEqual(908);
        }
        if (node.tag === 'rect' && !node.parents.some((parent) => parent['data-range-id'])) {
          expect(Number(a.x)).toBeGreaterThanOrEqual(0);
          expect(Number(a.x) + Number(a.width)).toBeLessThanOrEqual(952);
          expect(Number(a.y) + Number(a.height)).toBeLessThanOrEqual(478);
        }
        if (a['data-range-id']) {
          expect(a.transform).toBe('translate(16 212) scale(1.5)');
          // Actual validated kit shape: domain width 240 and height 36, projected uniformly.
          expect(16 + 240 * 1.5).toBeLessThanOrEqual(952);
          expect(212 + 36 * 1.5).toBeLessThanOrEqual(276);
        }
      }
      for (const [width, height] of [
        [1080, 960],
        [1280, 720],
        [1920, 1080],
      ]) {
        const meet = variationRangeMeet(width, height);
        for (const [x, y] of [
          [0, 0],
          [952, 478],
        ]) {
          expect(meet.x + x * meet.scale).toBeGreaterThanOrEqual(0);
          expect(meet.x + x * meet.scale).toBeLessThanOrEqual(width + 1e-8);
          expect(meet.y + y * meet.scale).toBeGreaterThanOrEqual(0);
          expect(meet.y + y * meet.scale).toBeLessThanOrEqual(height + 1e-8);
        }
      }
    }
  });
  it('projects authored model corner envelopes through the same fixed studio camera and handoff rotation, every frame and nonfinite input', () => {
    for (const scene of variationRangeTestScenes())
      for (const t of [...variationRangeTimes(scene), NaN, Infinity, -Infinity]) {
        for (let index = 0; index < variationRangeRecords(scene).length; index++) {
          for (const [width, height] of [
            [1080, 960],
            [1280, 720],
          ]) {
            const anchor = variationRangeModelProjection(scene, t, index, width, height);
            expect(Number.isFinite(anchor.x) && Number.isFinite(anchor.y)).toBe(true);
            expect(anchor.x).toBeGreaterThanOrEqual(0);
            expect(anchor.x).toBeLessThanOrEqual(width);
            expect(anchor.y).toBeGreaterThanOrEqual(0);
            expect(anchor.y).toBeLessThanOrEqual(height);
            // Instrument station extent includes the base, label-free slab and count badge, not just its origin.
            for (const dx of [-0.67, 0.67])
              for (const dy of [-0.45, 0.45]) {
                const p = variationRangeModelProjection(scene, t, index, width, height, [
                  dx,
                  dy,
                  0.2,
                ]);
                expect(p.x).toBeGreaterThanOrEqual(0);
                expect(p.x).toBeLessThanOrEqual(width);
                expect(p.y).toBeGreaterThanOrEqual(0);
                expect(p.y).toBeLessThanOrEqual(height);
              }
          }
        }
      }
  }, 20000);
  it('keeps source numerical planes through the clay handoff; source-only ownership marker is not Canvas execution proof', () => {
    const scene = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/probability/variation-range-Scene.tsx',
      'utf8',
    );
    expect(scene).toContain('export function VariationRangeView');
    expect(scene.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(scene).toContain('modelOpacity');
    expect(scene).not.toMatch(/<ThreeCanvas|<Stage3D/);
  });
});
