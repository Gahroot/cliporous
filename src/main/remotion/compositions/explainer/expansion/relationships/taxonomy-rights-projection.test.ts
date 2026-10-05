import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { getLongformLayout } from '../../../../../../shared/longform-layout';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { UI_FONT } from '../../stage';
import { TaxonomyRightsDiagram } from './taxonomy-rights-Diagram';
import { TAXONOMY_RIGHTS_CAMERA, taxonomyRightsModelPlacement } from './taxonomy-rights-models';
import { taxonomyRightsPose } from './taxonomy-rights-poses';
import { taxonomyRightsTestScenes } from './taxonomy-rights-test-fixtures';

const font = readFileSync('resources/fonts/Inter.ttf');
const tables = new Map<string, number>();
for (let i = 0; i < font.readUInt16BE(4); i++) {
  const p = 12 + i * 16;
  tables.set(font.toString('ascii', p, p + 4), font.readUInt32BE(p + 8));
}
function table(name: string): number {
  const p = tables.get(name);
  if (p === undefined) throw new Error(`Missing Inter ${name}`);
  return p;
}
const units = font.readUInt16BE(table('head') + 18);
const metrics = font.readUInt16BE(table('hhea') + 34);
const longLoca = font.readInt16BE(table('head') + 50) === 1;
const cmap = table('cmap');
let mapping = 0;
for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
  const p = cmap + font.readUInt32BE(cmap + 8 + i * 8);
  if (font.readUInt16BE(p) === 12) mapping = p;
}
if (!mapping) throw new Error('Inter cmap12 missing');
interface Glyph {
  readonly advance: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}
const glyphs = new Map<string, Glyph>();
/** Bounded test-local cache: one lookup per distinct source codepoint, not per frame. */
function glyph(character: string): Glyph {
  const cached = glyphs.get(character);
  if (cached) return cached;
  const code = character.codePointAt(0) ?? 0;
  let id = 0;
  for (let i = 0; i < font.readUInt32BE(mapping + 12); i++) {
    const p = mapping + 16 + i * 12;
    if (code >= font.readUInt32BE(p) && code <= font.readUInt32BE(p + 4)) {
      id = font.readUInt32BE(p + 8) + code - font.readUInt32BE(p);
      break;
    }
  }
  if (!id) throw new Error(`Missing shipped Inter glyph ${character}`);
  const offset = (index: number): number =>
    longLoca
      ? font.readUInt32BE(table('loca') + index * 4)
      : font.readUInt16BE(table('loca') + index * 2) * 2;
  const p = table('glyf') + offset(id);
  const ink = offset(id + 1) > offset(id);
  const result = {
    advance: font.readUInt16BE(table('hmtx') + Math.min(id, metrics - 1) * 4),
    left: ink ? font.readInt16BE(p + 2) : 0,
    right: ink ? font.readInt16BE(p + 6) : 0,
    top: ink ? -font.readInt16BE(p + 8) : 0,
    bottom: ink ? -font.readInt16BE(p + 4) : 0,
  };
  glyphs.set(character, result);
  return result;
}
function extent(text: string): { left: number; right: number; top: number; bottom: number } {
  let pen = 0,
    left = 0,
    right = 0,
    top = 0,
    bottom = 0;
  for (const character of text) {
    const g = glyph(character);
    left = Math.min(left, pen + g.left);
    right = Math.max(right, pen + g.right);
    top = Math.min(top, g.top);
    bottom = Math.max(bottom, g.bottom);
    pen += g.advance;
  }
  return {
    left: (left * 22) / units,
    right: (right * 22) / units,
    top: (top * 22) / units,
    bottom: (bottom * 22) / units,
  };
}
function decode(text: string): string {
  return text.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, entity: string) =>
      ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[entity] ?? entity,
  );
}
const regions = [
  undefined,
  ...(['speaker-side', 'speaker-pip', 'full-frame'] as const).map(
    (p) => getLongformLayout(p).model,
  ),
];
const scenes = taxonomyRightsTestScenes();
// Precompute every accepted source glyph before the per-page physical placement assertions.
for (const scene of scenes)
  for (const page of taxonomyRightsPose(scene, scene.setupAt).pages)
    for (const line of page.lines) for (const c of line) glyph(c);

describe('actual current-page SVG, shipped Inter ink extents and physical placements', () => {
  for (const [caseIndex, original] of scenes.entries())
    it(`case ${caseIndex}: every page / both modes / all model reservations`, () => {
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        const scene = { ...original, visualMode };
        const pages = taxonomyRightsPose(scene, scene.setupAt).pages;
        const violations: string[] = [];
        for (const [pageIndex, page] of pages.entries()) {
          const t =
            pageIndex === pages.length - 1
              ? scene.resolveAt
              : scene.setupAt +
                ((pageIndex + 0.5) * (scene.resolveAt - scene.setupAt)) / pages.length;
          const pose = taxonomyRightsPose(scene, t);
          expect(pose.page).toBe(pageIndex);
          const markup = renderToStaticMarkup(
            createElement(
              DiagramSurface,
              null,
              createElement(TaxonomyRightsDiagram, { scene, pose }),
            ),
          );
          expect(markup).not.toMatch(
            /ellipsis|textLength|lengthAdjust|canvas|foreignObject|NaN|Infinity/,
          );
          expect(markup).toContain('viewBox="0 0 952 478"');
          const boxes: { x1: number; x2: number; y1: number; y2: number; text: string }[] = [];
          const detail: string[] = [];
          for (const node of markup.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
            const a = Object.fromEntries(
              [...node[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
            );
            const text = decode(node[2]);
            expect(Number(a['font-size'])).toBe(22);
            expect(decode(a['font-family'])).toBe(UI_FONT);
            const x = Number(a.x),
              y = Number(a.y),
              ink = extent(text);
            const b = {
              x1: x + ink.left,
              x2: x + ink.right,
              y1: y + ink.top,
              y2: y + ink.bottom,
              text,
            };
            if (x >= 472 && y >= 72) detail.push(text);
            const region =
              x >= 456
                ? { x: 456, y: 8, width: 488, height: 462 }
                : { x: 8, y: 8, width: 432, height: 462 };
            if (
              b.x1 < region.x ||
              b.x2 > region.x + region.width ||
              b.y1 < region.y ||
              b.y2 > region.y + region.height
            )
              violations.push(`page ${pageIndex}: ${text} out of reservation`);
            for (const other of boxes)
              if (
                text &&
                other.text &&
                b.x1 < other.x2 &&
                b.x2 > other.x1 &&
                b.y1 < other.y2 &&
                b.y2 > other.y1
              )
                violations.push(`page ${pageIndex}: ${text} overlaps ${other.text}`);
            boxes.push(b);
            for (const physical of regions) {
              const scale = physical ? Math.min(physical.width / 952, physical.height / 478) : 1;
              expect(22 * scale).toBeGreaterThanOrEqual(22);
              expect((b.x2 - b.x1) * scale).toBeLessThanOrEqual(physical?.width ?? 952);
            }
          }
          expect(detail).toEqual(page.lines);
          expect(markup.match(/data-taxonomy-rights-page=/g)).toHaveLength(1);
          expect(markup.match(/data-relation-id=/g)).toHaveLength(
            scene.storyId === '33' ? 1 : scene.relations.length,
          );
          if (scene.storyId === '33') {
            expect(markup.match(/data-taxonomy-node=/g)).toHaveLength(scene.entities.length);
            const selected =
              scene.relations.find((r) => r.id === page.id) ??
              (page.id === 'resolve' ? scene.relations.at(-1) : scene.relations[0]);
            if (!selected) throw new Error('Missing selected relation');
            expect(markup).toContain(`data-from-id="${selected.fromId}"`);
            expect(markup).toContain(`data-to-id="${selected.toId}"`);
            expect(markup).toContain(`data-typed-edge="${selected.role}"`);
            expect(markup.includes('data-excluded-cross="true"')).toBe(
              'status' in selected && selected.status === 'excluded',
            );
          }
        }
        expect(violations).toEqual([]);
      }
    });
  it('places every authored clay identity under its matching planar E reference in real reservations', () => {
    for (const region of regions) {
      const width = region?.width ?? 1080,
        height = region?.height ?? 960;
      const camera = new PerspectiveCamera(TAXONOMY_RIGHTS_CAMERA.fov, width / height, 0.1, 100);
      camera.position.set(...TAXONOMY_RIGHTS_CAMERA.position);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const scale = region ? Math.min(width / 952, height / 478) : 1;
      for (let i = 0; i < 8; i++) {
        const placement = taxonomyRightsModelPlacement(i, region);
        const projected = new Vector3(...placement.position).project(camera);
        expect(((projected.x + 1) * width) / 2).toBeCloseTo(
          (region ? (width - 952 * scale) / 2 : 64) + (30 + i * 52) * scale,
          5,
        );
        expect(((1 - projected.y) * height) / 2).toBeCloseTo(
          (region ? (height - 478 * scale) / 2 : 262) + 400 * scale,
          5,
        );
      }
    }
  });
});
