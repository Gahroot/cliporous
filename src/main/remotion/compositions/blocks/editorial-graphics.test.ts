import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useCurrentFrame } from 'remotion';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BarChart } from './BarChart';
import { StatHero } from './StatHero';

vi.mock('remotion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('remotion')>();
  return {
    ...actual,
    useCurrentFrame: vi.fn(),
    useVideoConfig: () => ({ fps: 30, durationInFrames: 120 }),
  };
});
vi.mock('../../shared/fonts', () => ({ PrestyjFonts: () => null }));

beforeEach(() => {
  vi.mocked(useCurrentFrame).mockReturnValue(60);
});

describe('editorial graphics', () => {
  it('keeps the count-up geometry fixed and reaches the exact formatted target', () => {
    const props = {
      skinId: 'editorial',
      kicker: 'REVENUE',
      heading: 'Annual revenue',
      value: 123456.78,
      decimals: 2,
      prefix: '$',
      suffix: ' USD',
      label: 'This year',
    } as const;
    vi.mocked(useCurrentFrame).mockReturnValue(0);
    const first = renderToStaticMarkup(createElement(StatHero, props));
    vi.mocked(useCurrentFrame).mockReturnValue(60);
    const settled = renderToStaticMarkup(createElement(StatHero, props));
    const valueStyle = /style="([^"]*font-variant-numeric:tabular-nums[^"]*)"/;
    expect(first.match(valueStyle)?.[1]).toBeDefined();
    expect(first.match(valueStyle)?.[1]).toBe(settled.match(valueStyle)?.[1]);
    expect(first).toContain('$0.00 USD');
    expect(settled).toContain('$123456.78 USD');
    expect(settled).not.toContain('text-shadow');
  });

  it.each([
    'up',
    'down',
    undefined,
  ] as const)('only shows a supplied trend direction (%s)', (trend) => {
    const html = renderToStaticMarkup(
      createElement(StatHero, {
        skinId: 'editorial',
        kicker: 'CHANGE',
        heading: 'Quarterly change',
        value: -12.5,
        decimals: 1,
        suffix: '%',
        label: 'Compared with last quarter',
        delta: '-12.5%',
        ...(trend ? { trend } : {}),
      }),
    );
    expect(html).toContain('-12.5%');
    if (trend) expect(html).toContain(`lucide-trending-${trend}`);
    else expect(html).not.toContain('lucide-trending');
  });

  it('preserves zero and tiny values without inventing a minimum bar height', () => {
    const html = renderToStaticMarkup(
      createElement(BarChart, {
        skinId: 'editorial',
        kicker: 'REVENUE',
        heading: 'By channel',
        bars: [
          { label: 'No sales', value: 0, valueLabel: '$0' },
          { label: 'Pilot', value: 0.001, valueLabel: '$1' },
          { label: 'All channels', value: 1, valueLabel: '$1000' },
        ],
      }),
    );
    const barStyles = Array.from(
      html.matchAll(/style="([^"]*transform-origin:center bottom[^"]*)"/g),
      (match) => match[1],
    );
    expect(barStyles).toHaveLength(3);
    expect(barStyles[0]).toContain('height:0;');
    expect(barStyles[1]).toContain('height:0.296px;');
    expect(barStyles[2]).toContain('height:296px;');
    expect(html).toContain('No sales');
    expect(html).toContain('All channels');
    expect(html).not.toContain('box-shadow');
  });

  it('does not move chart labels as the bars reveal', () => {
    const props = {
      skinId: 'editorial',
      kicker: 'REVENUE',
      heading: 'By channel',
      bars: [{ label: 'Channel', value: 0.5, valueLabel: '$500' }],
    } as const;
    const render = (): string =>
      renderToStaticMarkup(
        createElement(BarChart, {
          ...props,
          bars: [...props.bars],
        }),
      );
    vi.mocked(useCurrentFrame).mockReturnValue(6);
    const early = render();
    vi.mocked(useCurrentFrame).mockReturnValue(60);
    const settled = render();
    expect(early).toContain('bottom:164px');
    expect(settled).toContain('bottom:164px');
    expect(early).toContain('height:148px');
    expect(settled).toContain('height:148px');
    expect(early).not.toContain('scaleY(1)');
    expect(settled).toContain('scaleY(1)');
  });
});
