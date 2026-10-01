import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FLOW_POINTS } from './layout';
import { DiagramNode, OwnershipStrip, TimeLane } from './primitives';

vi.mock('../stage', async (original) => {
  const actual = await original<typeof import('../stage')>();
  return { ...actual, useStage: () => actual.STAGE };
});

/** Geometry regression only; the fixture matrix supplies real font/raster evidence. */
function textBaselines(markup: string): number[] {
  return [...markup.matchAll(/<text\s[^>]*\by="([\d.-]+)"/g)].map((match) => Number(match[1]));
}

describe('diagram label reservations', () => {
  it('keeps lane headings above, rather than on, account/invoice symbols', () => {
    for (const y of [160, 330]) {
      const html = renderToStaticMarkup(TimeLane({ y, label: 'W'.repeat(28), children: null }));
      const [baseline] = textBaselines(html);
      // Two 28px lines plus descenders must finish before the 62px symbol starts.
      expect(baseline + 28 * 1.2 + 6).toBeLessThan(y - 59 - 31);
    }
  });

  it('reserves four complete actor-name lines without pushing money into the next node', () => {
    for (const point of [...FLOW_POINTS.sources, ...FLOW_POINTS.targets]) {
      const html = renderToStaticMarkup(
        createElement(DiagramNode, {
          entity: { id: 'actor', role: 'investor', label: 'W'.repeat(28) },
          point,
          detail: '100000000 USD',
        }),
      );
      const [label, money] = textBaselines(html);
      expect(label + 3 * 36 + 6).toBeLessThan(money - 26);
      expect(money + 6).toBeLessThan(478);
      if (point.y === FLOW_POINTS.sources[0].y) {
        expect(money + 6).toBeLessThan(FLOW_POINTS.sources[1].y - 25 - 24);
      }
      expect((html.match(/W/g) ?? []).length).toBe(28);
    }
  });

  it('keeps two ownership heading lines clear of the strip and the following count', () => {
    const html = renderToStaticMarkup(
      createElement(OwnershipStrip, {
        x: 56,
        y: 95,
        width: 420,
        total: 100,
        retained: 40,
        label: `${'W'.repeat(28)}: before`,
      }),
    );
    const [heading, count] = textBaselines(html);
    expect(heading + 28 * 1.2 + 6).toBeLessThan(95);
    expect(count - 34).toBeGreaterThan(95 + 56);
  });
});
