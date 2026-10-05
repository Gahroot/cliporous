import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { getLongformLayout } from '../../../../../../shared/longform-layout';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { DIAGRAM_REGIONS, labelLines, projectedDiagramRegion } from '../../diagrams/layout';
import { fitEditorialText, longformTextRegions } from '../../longform-stage-layout';
import { ExplainerProvider } from '../../stage';
import { stageSafeBox } from '../../types';
import { RegionsDimensionsDiagram } from './regions-dimensions-Diagram';
import { regionsConditionFit, regionsDimensionsPose } from './regions-dimensions-poses';
import { RegionsDimensionsCondition } from './regions-dimensions-Scene';
import { cases, interAscent, interBounds, interDescent } from './regions-dimensions-test-fixtures';

const placements = [
  { aspect: '9:16', layout: 'stack' },
  { aspect: '9:16', layout: 'stack-flipped' },
  { aspect: '16:9', layout: 'takeover', presentation: 'full-frame' },
  { aspect: '16:9', layout: 'takeover', presentation: 'speaker-side' },
  { aspect: '16:9', layout: 'takeover', presentation: 'speaker-pip' },
] as const;
const separated = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;

it('authored body/Chrome/caption/speaker envelopes, not unsupported compact layouts', () => {
  for (const placement of placements) {
    if ('presentation' in placement) {
      const layout = getLongformLayout(placement.presentation);
      for (const r of [layout.text, layout.caption, ...(layout.speaker ? [layout.speaker] : [])])
        expect(separated(layout.model, r)).toBe(true);
      expect(layout.model.x).toBeGreaterThanOrEqual(layout.explanation.x);
      expect(layout.model.x + layout.model.width).toBeLessThanOrEqual(
        layout.explanation.x + layout.explanation.width,
      );
      expect(layout.model.y + layout.model.height).toBeLessThanOrEqual(
        layout.explanation.y + layout.explanation.height,
      );
    } else {
      const body = projectedDiagramRegion(DIAGRAM_REGIONS.body, placement.layout, placement.aspect);
      const safe = stageSafeBox(placement.layout, placement.aspect);
      expect(body.x).toBeGreaterThanOrEqual(safe.x);
      expect(body.y).toBeGreaterThanOrEqual(safe.y);
      expect(body.x + body.width).toBeLessThanOrEqual(safe.x + safe.width);
      expect(body.y + body.height).toBeLessThanOrEqual(safe.y + safe.height);
      for (const rail of [
        DIAGRAM_REGIONS.title,
        DIAGRAM_REGIONS.condition,
        DIAGRAM_REGIONS.evidence,
        DIAGRAM_REGIONS.outcome,
      ])
        expect(
          separated(body, projectedDiagramRegion(rail, placement.layout, placement.aspect)),
        ).toBe(true);
    }
  }
});

for (const [index, scene] of cases().entries())
  it(`actual current-page Inter bounds ${index}`, () => {
    const pose = regionsDimensionsPose(scene, 10);
    for (let page = 0; page < pose.pages.length; page++) {
      const markup = renderToStaticMarkup(
        createElement(
          'svg',
          null,
          createElement(RegionsDimensionsDiagram, { scene, pose: { ...pose, page } }),
        ),
      );
      expect(markup).not.toMatch(/NaN|Infinity|ellipsis|clipPath|textLength|<canvas/);
      const boxes: number[][] = [];
      const emitted: string[] = [];
      for (const match of markup.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
        const attrs = Object.fromEntries(
          [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
        );
        const value = match[2]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#x27;/g, "'");
        const x = Number(attrs.x),
          y = Number(attrs.y),
          ink = interBounds(value);
        expect(Number(attrs['font-size'])).toBe(22);
        const b = [x + ink[0], y + ink[1], x + ink[2], y + ink[3]];
        expect(b[0], value).toBeGreaterThanOrEqual(8);
        expect(b[2], value).toBeLessThanOrEqual(x >= 492 ? 944 : 474);
        expect(b[1], value).toBeGreaterThanOrEqual(8);
        expect(b[3], value).toBeLessThanOrEqual(478);
        expect(
          boxes.every((a) => b[0] >= a[2] || b[2] <= a[0] || b[1] >= a[3] || b[3] <= a[1]),
          value,
        ).toBe(true);
        boxes.push(b);
        if (x === 492) emitted.push(value);
      }
      expect(emitted).toEqual(pose.pages[page].lines);
      for (const placement of placements) {
        const region =
          'presentation' in placement
            ? getLongformLayout(placement.presentation).model
            : DIAGRAM_REGIONS.body;
        const scale = Math.min(region.width / 952, region.height / 478);
        const ox = region.x + (region.width - 952 * scale) / 2,
          oy = region.y + (region.height - 478 * scale) / 2;
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
                createElement(RegionsDimensionsDiagram, {
                  scene,
                  pose: { ...pose, page },
                }),
              ),
            ),
          );
          expect(composed).toContain(
            `left:${region.x}px;top:${region.y}px;width:${region.width}px;height:${region.height}px`,
          );
          expect(composed).toContain('preserveAspectRatio="xMidYMid meet"');
          expect(composed).toContain(markup.slice(5, -6));
        }
      }
    }
  });

for (const [index, scene] of cases().entries())
  it(`shared Chrome actual Inter metrics and authored text slots ${index}`, () => {
    for (const presentation of [undefined, 'full-frame', 'speaker-side', 'speaker-pip'] as const) {
      const values = {
        title: scene.label,
        condition: scene.condition ?? '',
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
        const value = values[slot];
        if (!value) continue;
        const region = regions[slot];
        const columns =
          slot === 'title' ? 24 : slot === 'condition' ? 38 : slot === 'evidence' ? 32 : 27;
        const compact = slot === 'condition' && labelLines(value, 38).length > 2;
        const fit =
          slot === 'condition'
            ? regionsConditionFit(value, region.width, Boolean(presentation))
            : presentation
              ? fitEditorialText(value, region, sizes[slot])
              : {
                  fontSize: sizes[slot],
                  lines: compact
                    ? Array.from({ length: Math.ceil(Array.from(value).length / 38) }, (_, i) =>
                        Array.from(value)
                          .slice(i * 38, (i + 1) * 38)
                          .join(''),
                      )
                    : labelLines(value, columns),
                };
        expect(fit.fontSize).toBeGreaterThanOrEqual(22);
        expect(fit.lines.join('').replace(/\s/g, '')).toBe(value.replace(/\s/g, ''));
        const leading =
          slot === 'condition'
            ? regionsConditionFit(value, region.width, Boolean(presentation)).leading
            : presentation
              ? 1.16
              : compact
                ? 1.1
                : 1.15;
        if (slot === 'condition') {
          const placement = presentation
            ? { aspect: '16:9' as const, layout: 'takeover' as const, presentation }
            : { aspect: '9:16' as const, layout: 'stack' as const };
          const markup = renderToStaticMarkup(
            createElement(
              ExplainerProvider,
              {
                value: { ...placement, nativeStage: true },
              },
              createElement(RegionsDimensionsCondition, { scene }),
            ),
          );
          expect(markup).toContain(`left:${region.x}px;top:${region.y}px;width:${region.width}px`);
          expect(markup).toContain(`font-size:${fit.fontSize}px`);
          for (const line of fit.lines) expect(markup).toContain(line);
        }
        for (const [row, line] of fit.lines.entries()) {
          const ink = interBounds(line).map((v) => (v * fit.fontSize) / 22);
          const baseline =
            region.y +
            ((leading - interAscent + interDescent) * fit.fontSize) / 2 +
            interAscent * fit.fontSize +
            row * fit.fontSize * leading;
          const x = presentation ? region.x : region.x + (region.width - ink[4]) / 2;
          expect(x + ink[0], `${slot}:${line}`).toBeGreaterThanOrEqual(region.x);
          expect(x + ink[2], `${slot}:${line}`).toBeLessThanOrEqual(region.x + region.width);
          expect(baseline + ink[1], slot).toBeGreaterThanOrEqual(region.y);
          expect(baseline + ink[3], slot).toBeLessThanOrEqual(region.y + region.height);
        }
      }
    }
  });
