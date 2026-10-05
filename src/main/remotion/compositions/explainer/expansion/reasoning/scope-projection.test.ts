import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { UI_FONT } from '../../stage';
import { SCOPE_LAYOUT, ScopeDiagram } from './scope-Diagram';
import { SCOPE_CAMERA, scopeModelPlacement } from './scope-models';
import { scopeDetails, scopePose } from './scope-poses';
import { maximumFactsScene, maximumScopeScene, scopeTestScenes } from './scope-poses.test';
import type { ExpansionReasoningScopeScene } from './scope-types';

const scenes = () => [
  ...scopeTestScenes,
  maximumScopeScene(),
  maximumScopeScene(true),
  maximumFactsScene(),
  maximumFactsScene(true),
  maximumFactsScene(false, true),
];
const decode = (s: string) =>
  s.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, entity: string) =>
      ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[entity] ?? entity,
  );

/** Actual emitted nodes and inherited opacity; no fabricated page override. */
export function scopeSvgNodes(svg: string) {
  const stack: { tag: string; opacity: number }[] = [];
  const nodes: { tag: string; opacity: number; attrs: Record<string, string>; text: string }[] = [];
  for (const match of svg.matchAll(/<(\/)?([\w-]+)([^>]*?)(\/?)>/g)) {
    if (match[1]) {
      stack.pop();
      continue;
    }
    const attrs = Object.fromEntries(
      [...match[3].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]),
    );
    const styleOpacity = attrs.style?.match(/(?:^|;)opacity:([\d.]+)/)?.[1];
    const opacity = (stack.at(-1)?.opacity ?? 1) * Number(attrs.opacity ?? styleOpacity ?? 1);
    const text =
      match[2] === 'text'
        ? decode(svg.slice((match.index ?? 0) + match[0].length).split('</text>')[0])
        : '';
    nodes.push({ tag: match[2], opacity, attrs, text });
    if (!match[4]) stack.push({ tag: match[2], opacity });
  }
  return nodes;
}

export function scopeMarkup(scene: ExpansionReasoningScopeScene, t: number) {
  return renderToStaticMarkup(
    createElement(
      DiagramSurface,
      null,
      createElement(ScopeDiagram, { scene, pose: scopePose(scene, t) }),
    ),
  );
}

/** CPU glyph extents from the shipped Inter default instance. Not native shaping/raster proof. */
const font = readFileSync('resources/fonts/Inter.ttf');
const tables = new Map<string, number>();
for (let i = 0; i < font.readUInt16BE(4); i++) {
  const p = 12 + i * 16;
  tables.set(font.toString('ascii', p, p + 4), font.readUInt32BE(p + 8));
}
const table = (name: string) => {
  const p = tables.get(name);
  if (p === undefined) throw new Error(`Missing ${name}`);
  return p;
};
const units = font.readUInt16BE(table('head') + 18);
const metrics = font.readUInt16BE(table('hhea') + 34);
const longLoca = font.readInt16BE(table('head') + 50) === 1;
const cmap = table('cmap');
let mapping = 0;
for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
  const p = cmap + font.readUInt32BE(cmap + 8 + i * 8);
  if (font.readUInt16BE(p) === 12) mapping = p;
}
if (!mapping) throw new Error('Inter Unicode cmap12 missing');
function textExtent(text: string, size: number) {
  let pen = 0,
    left = 0,
    right = 0,
    top = 0,
    bottom = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    let glyph = 0;
    for (let i = 0; i < font.readUInt32BE(mapping + 12); i++) {
      const p = mapping + 16 + i * 12;
      if (code >= font.readUInt32BE(p) && code <= font.readUInt32BE(p + 4)) {
        glyph = font.readUInt32BE(p + 8) + code - font.readUInt32BE(p);
        break;
      }
    }
    expect(glyph, `Inter glyph ${character}`).toBeGreaterThan(0);
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
  return {
    left: (left * size) / units,
    right: (right * size) / units,
    top: (top * size) / units,
    bottom: (bottom * size) / units,
  };
}

function assertGeometry(svg: string, violations: Set<string>) {
  expect(svg).toContain('viewBox="0 0 952 478"');
  expect(svg).not.toMatch(/textLength|lengthAdjust|ellipsis|foreignObject|canvas|NaN|Infinity/);
  for (const node of scopeSvgNodes(svg)) {
    const a = node.attrs;
    if (node.tag === 'text' && node.opacity > 0) {
      const x = Number(a.x),
        y = Number(a.y),
        size = Number(a['font-size']);
      expect(size, node.text).toBeGreaterThanOrEqual(22);
      expect(a['font-family']).toBe(UI_FONT);
      const box = textExtent(node.text, size);
      const region = x >= SCOPE_LAYOUT.detail.x ? SCOPE_LAYOUT.detail : SCOPE_LAYOUT.overview;
      if (
        x + box.left < region.x ||
        x + box.right > region.x + region.width ||
        y + box.top < region.y ||
        y + box.bottom > region.y + region.height
      ) {
        violations.add(
          `${JSON.stringify(node.text)} glyph box [${x + box.left}, ${y + box.top}, ${x + box.right}, ${y + box.bottom}] outside [${region.x}, ${region.y}, ${region.x + region.width}, ${region.y + region.height}]`,
        );
      }
    }
    if (node.tag === 'rect') {
      expect(Number(a.x)).toBeGreaterThanOrEqual(0);
      expect(Number(a.y)).toBeGreaterThanOrEqual(0);
      expect(Number(a.x) + Number(a.width)).toBeLessThanOrEqual(952);
      expect(Number(a.y) + Number(a.height)).toBeLessThanOrEqual(478);
    }
  }
}

describe('scope actual emitted lenses and CPU projection', () => {
  it('shows every section at a real frame, with readable shipped-font extents and persistent source references', () => {
    const violations = new Set<string>();
    for (const scene of scenes())
      for (const mode of ['diagram', 'hybrid'] as const) {
        const current = { ...scene, visualMode: mode };
        const pages = scopeDetails(current);
        const frames = Array.from({ length: 361 }, (_, frame) => scopePose(current, frame / 30));
        pages.forEach((page, index) => {
          const sample = frames.findIndex((p) => p.page === index && p.action > 0);
          expect(sample, `section ${index}`).toBeGreaterThanOrEqual(0);
          const svg = scopeMarkup(current, sample / 30);
          assertGeometry(svg, violations);
          const nodes = scopeSvgNodes(svg);
          const detail = nodes.find((n) => n.attrs['data-scope-page']);
          expect(detail?.opacity).toBe(1);
          expect(detail?.attrs['data-scope-id']).toBe(page.id);
          expect(detail?.attrs['data-scope-page']).toBe(String(index));
          const text = nodes.filter(
            (n) => n.tag === 'text' && n.opacity === 1 && Number(n.attrs.x) >= 352,
          );
          expect(
            text
              .filter((n) => Number(n.attrs.y) >= 100 && Number(n.attrs.y) < 350)
              .map((n) => n.text),
          ).toEqual(page.lines);
          expect(
            text
              .filter((n) => Number(n.attrs.y) >= 350 && Number(n.attrs.y) < 450)
              .map((n) => n.text),
          ).toEqual(page.qualification);
          const ids =
            current.storyId === '07'
              ? current.statements.map((s) => s.id)
              : current.facts.map((f) => f.id);
          expect(
            nodes
              .filter((n) => n.attrs['data-source-id'] && n.opacity === 1)
              .map((n) => n.attrs['data-source-id']),
          ).toEqual(ids);
          if (current.storyId === '08') {
            current.frames.forEach((view) => {
              expect(
                nodes.find((n) => n.attrs['data-frame-id'] === view.id)?.attrs['data-reference-id'],
              ).toBe(view.referenceFactId);
            });
            expect(
              nodes
                .filter((n) => n.attrs['data-view-fact-id'])
                .map((n) => n.attrs['data-view-fact-id']),
            ).toEqual([...ids, ...ids]);
          }
        });
      }
    expect([...violations]).toEqual([]);
  });

  it('retains identical essential emitted mode facts, repeat seeks and final hold', () => {
    for (const scene of scenes()) {
      const essential = (svg: string) =>
        scopeSvgNodes(svg)
          .filter((n) => n.tag === 'text' && Number(n.attrs.x) >= 352)
          .map((n) => [n.text, n.opacity]);
      const frames = Array.from({ length: 361 }, (_, frame) => {
        const diagram = scopeMarkup({ ...scene, visualMode: 'diagram' }, frame / 30);
        const hybrid = scopeMarkup({ ...scene, visualMode: 'hybrid' }, frame / 30);
        expect(essential(diagram)).toEqual(essential(hybrid));
        return diagram;
      });
      for (const frame of [360, 0, 88, 19, 215, 88])
        expect(scopeMarkup({ ...scene, visualMode: 'diagram' }, frame / 30)).toBe(frames[frame]);
      expect(scopeMarkup(scene, scene.resolveAt + 0.3)).toBe(scopeMarkup(scene, 100));
    }
  });

  it('forward-projects camera-aligned model tabs into the actual DiagramSurface body', () => {
    for (const wide of [undefined, { width: 1200, height: 620 }, { width: 1600, height: 820 }]) {
      const width = wide?.width ?? 1080,
        height = wide?.height ?? 960;
      const camera = new PerspectiveCamera(SCOPE_CAMERA.fov, width / height, 0.1, 100);
      camera.position.set(...SCOPE_CAMERA.position);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      for (const index of [0, 1]) {
        const placement = scopeModelPlacement(index, wide);
        const p = new Vector3(...placement.position).project(camera);
        // DiagramSurface uses xMidYMid meet, not independent x/y stretching.
        const unit = wide ? Math.min(width / 952, height / 478) : 1;
        const left = wide ? (width - 952 * unit) / 2 : 64;
        const top = wide ? (height - 478 * unit) / 2 : 262;
        expect(((p.x + 1) * width) / 2).toBeCloseTo(left + (80 + index * 160) * unit, 8);
        expect(((1 - p.y) * height) / 2).toBeCloseTo(top + 380 * unit, 8);
        const right = new Vector3(...placement.position)
          .add(new Vector3(placement.scale, 0, 0))
          .project(camera);
        expect(((right.x - p.x) * width) / 2).toBeCloseTo(22 * unit, 8);
      }
    }
  });
});
