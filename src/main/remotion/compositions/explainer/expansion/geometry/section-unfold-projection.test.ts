import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { getLongformLayout } from '../../../../../../shared/longform-layout';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { DIAGRAM_REGIONS, labelLines, projectedDiagramRegion } from '../../diagrams/layout';
import { fitEditorialText, longformTextRegions } from '../../longform-stage-layout';
import { ExplainerProvider, UI_FONT } from '../../stage';
import { stageSafeBox } from '../../types';
import { interBounds } from '../representations/projection-matrix-test-fixtures';
import { SectionUnfoldDiagram } from './section-unfold-Diagram';
import { sectionUnfoldPages, sectionUnfoldPose } from './section-unfold-poses';
import { sectionAccepted, sectionCases } from './section-unfold-test-fixtures';

const placements = [
  { aspect: '9:16', layout: 'stack' },
  { aspect: '9:16', layout: 'stack-flipped' },
  { aspect: '16:9', layout: 'takeover', presentation: 'full-frame' },
  { aspect: '16:9', layout: 'takeover', presentation: 'speaker-side' },
  { aspect: '16:9', layout: 'takeover', presentation: 'speaker-pip' },
] as const;
type Rect = { x: number; y: number; width: number; height: number };
const separate = (a: Rect, b: Rect) =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
const decode = (text: string): string =>
  text.replace(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, k: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[k] ?? k,
  );
for (const story of sectionCases)
  it(`actual shipped Inter current-page ink bounds ${story.id}/${story.name}`, () => {
    const scene = sectionAccepted(story);
    const pages = sectionUnfoldPages(scene);
    for (const [page, source] of pages.entries()) {
      const pose = { ...sectionUnfoldPose(scene, scene.resolveAt, pages), page };
      const markup = renderToStaticMarkup(
        createElement('svg', null, createElement(SectionUnfoldDiagram, { scene, pose })),
      );
      expect(markup).not.toMatch(/NaN|Infinity|textLength|lengthAdjust|ellipsis|clipPath|<canvas/);
      const boxes: number[][] = [];
      const lines: string[] = [];
      for (const m of markup.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
        const attrs = Object.fromEntries(
          [...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], decode(a[2])]),
        );
        const text = decode(m[2]),
          x = Number(attrs.x),
          y = Number(attrs.y),
          ink = interBounds(text);
        expect(attrs['font-family']).toBe(UI_FONT);
        expect(Number(attrs['font-size'])).toBe(22);
        const b = [x + ink[0], y + ink[1], x + ink[2], y + ink[3]];
        expect(b[0], text).toBeGreaterThanOrEqual(8);
        expect(b[2], text).toBeLessThanOrEqual(x >= 492 ? 944 : 474);
        expect(b[1], text).toBeGreaterThanOrEqual(8);
        expect(b[3], text).toBeLessThanOrEqual(478);
        expect(
          boxes.every((o) => b[0] >= o[2] || b[2] <= o[0] || b[1] >= o[3] || b[3] <= o[1]),
          text,
        ).toBe(true);
        boxes.push(b);
        if (x === 492) lines.push(text);
      }
      expect(lines).toEqual(source.lines);
      for (const placement of placements) {
        const region =
          'presentation' in placement
            ? getLongformLayout(placement.presentation).model
            : DIAGRAM_REGIONS.body;
        const scale = Math.min(region.width / 952, region.height / 478);
        const ox = region.x + (region.width - 952 * scale) / 2,
          oy = region.y + (region.height - 478 * scale) / 2;
        expect(scale * 22).toBeGreaterThanOrEqual(22);
        for (const b of boxes) {
          expect(ox + b[0] * scale).toBeGreaterThanOrEqual(region.x);
          expect(ox + b[2] * scale).toBeLessThanOrEqual(region.x + region.width);
          expect(oy + b[1] * scale).toBeGreaterThanOrEqual(region.y);
          expect(oy + b[3] * scale).toBeLessThanOrEqual(region.y + region.height);
        }
        if (page === 0) {
          const composed = renderToStaticMarkup(
            createElement(
              ExplainerProvider,
              {
                value: { ...placement, nativeStage: true },
              },
              createElement(
                DiagramSurface,
                null,
                createElement(SectionUnfoldDiagram, { scene, pose }),
              ),
            ),
          );
          expect(composed).toContain(
            `left:${region.x}px;top:${region.y}px;width:${region.width}px;height:${region.height}px`,
          );
          expect(composed).toContain(markup.slice(5, -6));
          expect(composed).toContain('preserveAspectRatio="xMidYMid meet"');
        }
      }
      expect(
        renderToStaticMarkup(
          createElement(
            'svg',
            null,
            createElement(SectionUnfoldDiagram, {
              scene: { ...scene, visualMode: 'hybrid' },
              pose,
            }),
          ),
        ),
      ).toBe(markup);
    }
  });

for (const story of sectionCases)
  it(`real Chrome wrapping/Inter metrics and authored envelopes ${story.name}`, () => {
    const scene = sectionAccepted(story);
    for (const placement of placements) {
      const wide =
        'presentation' in placement ? getLongformLayout(placement.presentation) : undefined;
      const regions = wide ? longformTextRegions(wide) : DIAGRAM_REGIONS;
      const specs = [
        {
          key: 'title' as const,
          text: scene.label,
          size: wide ? 48 : 38,
          columns: 24,
          leading: 1.15,
        },
        {
          key: 'condition' as const,
          text: scene.condition ?? '',
          size: wide ? 28 : 24,
          columns: 38,
          leading: scene.condition && labelLines(scene.condition, 38).length > 2 ? 1.1 : 1.15,
        },
        {
          key: 'evidence' as const,
          text: scene.evidence === 'illustrative' ? 'Illustrative example' : 'Source-stated',
          size: 28,
          columns: 32,
          leading: 1.15,
        },
        {
          key: 'outcome' as const,
          text: scene.outcome,
          size: wide ? 36 : 34,
          columns: 27,
          leading: 1.15,
        },
      ];
      const used: Rect[] = [];
      for (const spec of specs) {
        if (!spec.text) continue;
        const r = regions[spec.key];
        const compact = !wide && spec.key === 'condition' && spec.leading === 1.1;
        const fit = wide
          ? fitEditorialText(spec.text, r, spec.size)
          : {
              fontSize: spec.size,
              lines: compact
                ? Array.from({ length: Math.ceil(spec.text.length / 38) }, (_, i) =>
                    spec.text.slice(i * 38, (i + 1) * 38),
                  )
                : labelLines(spec.text, spec.columns),
            };
        const leading = wide ? 1.16 : spec.leading;
        expect(fit.fontSize).toBeGreaterThanOrEqual(22);
        expect(fit.lines.join('').replace(/\s/g, '')).toBe(spec.text.replace(/\s/g, ''));
        const height = fit.lines.length * fit.fontSize * leading;
        expect(height).toBeLessThanOrEqual(r.height);
        for (const line of fit.lines) {
          const ink = interBounds(line).map((n) => (n * fit.fontSize) / 22);
          expect(ink[2] - ink[0]).toBeLessThanOrEqual(r.width);
          expect(ink[3] - ink[1]).toBeLessThanOrEqual(fit.fontSize * leading);
        }
        const reservation = { ...r, height };
        expect(used.every((o) => separate(reservation, o))).toBe(true);
        used.push(reservation);
      }
      if (wide) {
        expect(separate(wide.model, wide.text)).toBe(true);
        for (const r of [wide.model, ...used]) {
          expect(separate(r, wide.caption)).toBe(true);
          if (wide.speaker) expect(separate(r, wide.speaker)).toBe(true);
          expect(r.x).toBeGreaterThanOrEqual(wide.explanation.x);
          expect(r.y).toBeGreaterThanOrEqual(wide.explanation.y);
          expect(r.x + r.width).toBeLessThanOrEqual(wide.explanation.x + wide.explanation.width);
          expect(r.y + r.height).toBeLessThanOrEqual(wide.explanation.y + wide.explanation.height);
        }
      } else {
        const safe = stageSafeBox(placement.layout, placement.aspect);
        for (const r of [DIAGRAM_REGIONS.body, ...used]) {
          const p = projectedDiagramRegion(r, placement.layout, placement.aspect);
          expect(p.x).toBeGreaterThanOrEqual(safe.x);
          expect(p.y).toBeGreaterThanOrEqual(safe.y);
          expect(p.x + p.width).toBeLessThanOrEqual(safe.x + safe.width);
          expect(p.y + p.height).toBeLessThanOrEqual(safe.y + safe.height);
        }
      }
    }
  });
