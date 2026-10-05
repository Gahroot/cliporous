import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DIAGRAM_REGIONS, projectedDiagramRegion } from '../../diagrams/layout';
import { type ExplainerAspect, type ExplainerLayout, stageSafeBox } from '../../types';
import { plottedValueText } from '../kits/plots';
import { VectorFactorizationDiagram } from './vector-factorization-Diagram';
import {
  VECTOR_FACTORIZATION_TEXT,
  vectorFactorizationIdentity,
  vectorFactorizationPages,
  vectorFactorizationPose,
  vectorFactorizationValue,
  vectorFactorizationWrap,
} from './vector-factorization-poses';
import {
  parseVectorFactorization,
  vectorFactorizationFixtures,
  vectorFactorizationGlyphBounds,
} from './vector-factorization-test-fixtures';

const decode = (s: string): string =>
  s.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, key: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[key] ?? key,
  );
interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
// Authored production envelopes; compact variants are not typography-certified.
const envelopes: readonly { name: string; layout: ExplainerLayout; aspect: ExplainerAspect }[] = [
  { name: 'full-frame', layout: 'takeover', aspect: '9:16' },
  { name: 'speaker-side', layout: 'over', aspect: '16:9' },
  { name: 'pip', layout: 'pip', aspect: '16:9' },
];
describe('vector/factorization actual shipped Inter current-page glyph placement', () => {
  for (const [index, fixture] of vectorFactorizationFixtures().entries())
    it(`${fixture.id}/${index}: every complete page, both modes`, () => {
      for (const mode of ['diagram', 'hybrid'] as const) {
        const scene = parseVectorFactorization(fixture, mode);
        const pages = vectorFactorizationPages(scene);
        const rendered = new Map<string, string>();
        for (const [i, page] of pages.entries()) {
          const t =
            i === pages.length - 1
              ? scene.resolveAt
              : scene.setupAt +
                ((i + 0.5) / (pages.length - 1)) * (scene.resolveAt - scene.setupAt);
          const pose = vectorFactorizationPose(scene, t);
          expect(pose.page).toBe(i);
          const svg = renderToStaticMarkup(
            createElement('svg', null, createElement(VectorFactorizationDiagram, { scene, pose })),
          );
          const boxes: Box[] = [];
          const texts: string[] = [];
          for (const match of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
            const attrs = Object.fromEntries(
              [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
            );
            const size = Number(attrs['font-size']);
            expect(size).toBeGreaterThanOrEqual(22);
            const text = decode(match[2]);
            texts.push(text);
            const [l, top, r, b] = vectorFactorizationGlyphBounds(text, size);
            const box = {
              left: Number(attrs.x) + l,
              right: Number(attrs.x) + r,
              top: Number(attrs.y) + top,
              bottom: Number(attrs.y) + b,
            };
            expect(box.left).toBeGreaterThanOrEqual(8);
            expect(box.right).toBeLessThanOrEqual(944);
            expect(box.top).toBeGreaterThanOrEqual(8);
            expect(box.bottom).toBeLessThanOrEqual(470);
            for (const other of boxes)
              expect(
                box.right <= other.left ||
                  box.left >= other.right ||
                  box.bottom <= other.top ||
                  box.top >= other.bottom,
              ).toBe(true);
            boxes.push(box);
          }
          for (const line of page.lines) expect(texts).toContain(line);
          const factual = svg.match(/<g\b[^>]*data-factual-page="true"[^>]*>(.*?)<\/g>/)?.[1];
          expect(factual).toBeDefined();
          const actualSource = [...(factual ?? '').matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)]
            .map((m) => decode(m[1]))
            .join('');
          expect(actualSource).toBe(page.lines.join(''));
          rendered.set(page.sourceId, (rendered.get(page.sourceId) ?? '') + actualSource);
          const markedValues = [
            ...svg.matchAll(/<text\b[^>]*data-quantity-value="([^"]*)"[^>]*>([^<]*)<\/text>/g),
          ];
          for (const id of new Set(markedValues.map((m) => m[1]))) {
            const quantity =
              scene.storyId === '55'
                ? [scene.vector, ...scene.basis]
                    .flatMap((v) => v.components)
                    .find((c) => c.id === id)?.quantity
                : scene.operands.find((o) => o.id === id)?.quantity;
            expect(quantity).toBeDefined();
            if (quantity) {
              const expected =
                scene.storyId === '55'
                  ? vectorFactorizationValue(quantity)
                  : `${scene.operands.find((o) => o.id === id)?.role}: ${vectorFactorizationValue(quantity)}`;
              expect(
                markedValues
                  .filter((m) => m[1] === id)
                  .map((m) => decode(m[2]))
                  .join(''),
              ).toBe(expected);
            }
          }
          if (scene.storyId === '56')
            expect(
              [...svg.matchAll(/<text\b[^>]*data-approved-identity="true"[^>]*>([^<]*)<\/text>/g)]
                .map((m) => decode(m[1]))
                .join(''),
            ).toBe(vectorFactorizationIdentity(scene));
          else expect(texts).toContain(`Frame: ${scene.frame}`);
          for (const envelope of envelopes) {
            const body = projectedDiagramRegion(
              DIAGRAM_REGIONS.body,
              envelope.layout,
              envelope.aspect,
            );
            const safe = stageSafeBox(envelope.layout, envelope.aspect);
            const projected = boxes.map((b) => ({
              left: body.x + (b.left * body.width) / 952,
              right: body.x + (b.right * body.width) / 952,
              top: body.y + (b.top * body.height) / 478,
              bottom: body.y + (b.bottom * body.height) / 478,
            }));
            for (const [index, box] of projected.entries()) {
              expect(box.left, envelope.name).toBeGreaterThanOrEqual(safe.x);
              expect(box.right, envelope.name).toBeLessThanOrEqual(safe.x + safe.width);
              expect(box.top, envelope.name).toBeGreaterThanOrEqual(safe.y);
              expect(box.bottom, envelope.name).toBeLessThanOrEqual(safe.y + safe.height);
              for (const other of projected.slice(0, index))
                expect(
                  box.right <= other.left ||
                    box.left >= other.right ||
                    box.bottom <= other.top ||
                    box.top >= other.bottom,
                  envelope.name,
                ).toBe(true);
            }
          }
          expect(svg).not.toMatch(/NaN|Infinity|ellipsis|clipPath|foreignObject/);
        }
        const quantities =
          scene.storyId === '55'
            ? [scene.vector, ...scene.basis].flatMap((v) =>
                v.components.map((c) => ({ id: c.id, quantity: c.quantity })),
              )
            : scene.operands;
        for (const q of quantities) {
          const actual = rendered.get(q.id);
          expect(actual).toContain(plottedValueText(q.quantity));
          expect(actual).toContain(`State: ${q.quantity.state}`);
          expect(actual).toContain(`Unit: ${q.quantity.basis.unit}`);
          if ('qualifier' in q.quantity) expect(actual).toContain(q.quantity.qualifier);
          if ('condition' in q.quantity) expect(actual).toContain(q.quantity.condition);
        }
        if (scene.storyId === '56') {
          const identity = rendered.get('56:result');
          expect(identity).toContain(vectorFactorizationIdentity(scene));
          expect(identity?.includes('=')).toBe(scene.result.state === 'derived');
          if (scene.result.state !== 'derived') expect(identity).toContain(scene.result.qualifier);
          else {
            expect(identity).toContain(`Source state: ${scene.result.sourceState}`);
            if (scene.result.qualifier) expect(identity).toContain(scene.result.qualifier);
            if (scene.result.condition) expect(identity).toContain(scene.result.condition);
          }
        } else {
          const relation = rendered.get('55:correspondence');
          expect(relation).toContain(scene.correspondence.frame);
          for (const vector of [scene.vector, ...scene.basis]) {
            const label = scene.entities.find((e) => e.id === vector.entityId)?.label;
            expect(label).toBeDefined();
            expect(relation).toContain(label);
            for (const component of vector.components) {
              expect(rendered.get(component.id)).toContain(`Corresponds to frame: ${scene.frame}`);
              expect(rendered.get(component.id)).toContain(`Direction: ${component.direction}`);
            }
          }
        }
      }
    });
  it('wraps maximum-length wide glyph source without losing characters', () => {
    for (const length of [28, 34, 48, 54, 96, 256]) {
      const source = 'W'.repeat(length);
      const lines = vectorFactorizationWrap(source);
      expect(lines.join('')).toBe(source);
      for (const line of lines)
        expect(
          vectorFactorizationGlyphBounds(line, VECTOR_FACTORIZATION_TEXT.font)[2],
        ).toBeLessThan(920);
    }
  });
});
