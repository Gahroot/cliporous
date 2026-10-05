import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ExpansionBasis, ExpansionQuantity, ExpansionRational } from '../value-types';
import type { KitAssetProps } from './computing';
import {
  PartitionClay,
  type PartitionProps,
  PartitionSvg,
  PLOT_ASSET_BUDGETS,
  PlotBandSvg,
  type PlotDatum,
  PrecisionPlotClay,
  type PrecisionPlotProps,
  PrecisionPlotSvg,
  partitionLayout,
  plottedValueText,
  precisionPlotLayout,
  RankedTrackSvg,
} from './plots';

const base: KitAssetProps = {
  position: [0, 0, 0],
  state: 'retained',
  pose: { reveal: 1, action: 1, response: 1, check: 1, resolve: 1 },
  colors: { surface: '#f6ecd9', text: '#23100c', accent: '#9f75ff', muted: '#766e64' },
};
const basis: ExpansionBasis = { unit: 'count', population: 'Orders', period: 'March' };
const domain = [
  { numerator: -10, denominator: 1 },
  { numerator: 10, denominator: 1 },
] as const;
function known(value: number, notation?: string): ExpansionQuantity {
  return {
    actor: 'Acme',
    claim: 'Count',
    basis,
    evidence: { fromWord: 0, toWord: 12 },
    state: 'known',
    amount: { kind: 'rational', value: { numerator: value, denominator: 1 }, notation },
  };
}
function record(quantity: ExpansionQuantity, id = 'record-0'): PlotDatum {
  return { id, label: 'M'.repeat(28), quantity };
}
function plot(records: readonly PlotDatum[]): PrecisionPlotProps {
  return { ...base, records, basis, domain };
}
function markup(node: ReactElement): string {
  return renderToStaticMarkup(node);
}
function hosts(html: string): string[] {
  return [...html.matchAll(/<([A-Za-z][\w:-]*)(?=[\s/>])/g)].map((match) => match[1].toLowerCase());
}
function account(
  svg: ReactElement,
  clay: ReactElement | null,
  budget: { meshes: number; svgElements: number },
): void {
  const diagram = markup(svg);
  expect(hosts(diagram).length).toBe(budget.svgElements);
  const model = clay ? markup(clay) : '';
  expect(hosts(model).filter((tag) => tag === 'mesh').length).toBe(budget.meshes);
  expect(diagram + model).not.toMatch(/NaN|Infinity/);
  expect(diagram + model).not.toMatch(/<(?:canvas|primitive|instancedmesh|skinnedmesh)\b/i);
  expect(diagram).not.toMatch(/<(?:mesh|group|foreignObject)\b/i);
}

describe('exact precision plots and states', () => {
  it('projects signed source values onto one fixed zero baseline without changing facts', () => {
    const input = plot([
      record(known(-5), 'minus'),
      record(known(0), 'zero'),
      record(known(5), 'plus'),
    ]);
    const original = structuredClone(input);
    expect(precisionPlotLayout(input).map((row) => row.positions)).toEqual([[120], [80], [40]]);
    expect(input).toEqual(original);
    const rendered = markup(createElement(PrecisionPlotSvg, input));
    expect(rendered).toContain('M18 80H280');
    expect(rendered).toContain('<circle');
  });
  it('does not substitute zero for missing, unknown or disputed information', () => {
    const claim = { actor: 'Acme', claim: 'Count', basis, evidence: { fromWord: 0, toWord: 12 } };
    const inputs: (ExpansionQuantity & { readonly qualifier: string })[] = [
      { ...claim, state: 'missing', qualifier: 'Not recorded' },
      { ...claim, state: 'unknown', qualifier: 'Not yet known' },
      {
        ...claim,
        state: 'disputed',
        alternatives: [
          { kind: 'rational', value: { numerator: -5, denominator: 1 } },
          { kind: 'rational', value: { numerator: 5, denominator: 1 } },
        ],
        qualifier: 'Sources disagree',
      },
    ];
    expect(
      precisionPlotLayout(plot(inputs.map((value, index) => record(value, `record-${index}`)))).map(
        (row) => row.positions,
      ),
    ).toEqual([[], [], [120, 40]]);
    for (const input of inputs) {
      const rendered = markup(createElement(PrecisionPlotSvg, plot([record(input)])));
      expect(rendered).toContain(`data-value-state="${input.state}"`);
      expect(rendered).toContain(input.qualifier);
    }
  });
  it('retains source precision and maximum-length qualifications visibly', () => {
    expect(plottedValueText(known(5, '+5.000000'))).toBe('+5.000000');
    const q = {
      ...known(5),
      state: 'conditional' as const,
      amount: { kind: 'rational' as const, value: { numerator: 5, denominator: 1 } },
      condition: 'Q'.repeat(96),
    };
    expect(markup(createElement(PrecisionPlotSvg, plot([record(q)])))).toContain(q.condition);
  });
  it('anchors partial positive and negative reveals to zero instead of floating bars', () => {
    const input = {
      ...plot([record(known(6), 'positive'), record(known(-6), 'negative')]),
      pose: { ...base.pose, action: 0.5 },
    };
    const rects = [
      ...markup(createElement(PrecisionPlotSvg, input)).matchAll(/<rect\b[^>]*>/g),
    ].map((match) => match[0]);
    const number = (rect: string, name: string): number =>
      Number(rect.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1]);
    expect(number(rects[0], 'y')).toBeCloseTo(56, 10);
    expect(number(rects[0], 'height')).toBeCloseTo(24, 10);
    expect(number(rects[1], 'y')).toBeCloseTo(80, 10);
    expect(number(rects[1], 'height')).toBeCloseTo(24, 10);
  });
  it('rejects incompatible units, periods, populations and denominators', () => {
    for (const incompatible of [
      { ...basis, unit: 'percent' as const },
      { ...basis, period: 'April' },
      { ...basis, population: 'Customers' },
      { ...basis, denominator: { numerator: 100, denominator: 1 } },
    ]) {
      const quantity = { ...known(5), basis: incompatible };
      expect(() => precisionPlotLayout(plot([record(quantity)]))).toThrow();
    }
  });
  it('rejects duplicate identities, excess bins, invalid values and domains', () => {
    const item = record(known(5));
    expect(() => precisionPlotLayout(plot([item, item]))).toThrow();
    expect(() =>
      precisionPlotLayout(
        plot(Array.from({ length: 13 }, (_, index) => record(known(5), `record-${index}`))),
      ),
    ).toThrow();
    for (const value of [Infinity, NaN, 11, 1_000_000_001])
      expect(() => precisionPlotLayout(plot([record(known(value))]))).toThrow();
    for (const limits of [
      [domain[1], domain[0]],
      [domain[0], domain[0]],
      [{ numerator: 1, denominator: 1 }, domain[1]],
    ] as const)
      expect(() => precisionPlotLayout({ ...plot([item]), domain: limits })).toThrow();
  });
  it('counts worst-case disputed records and hidden clay instruments without asset mocks', () => {
    const referencedBasis = { ...basis, denominator: { numerator: 100, denominator: 1 } };
    const quantity: ExpansionQuantity = {
      actor: 'Acme',
      claim: 'Count',
      basis: referencedBasis,
      evidence: { fromWord: 0, toWord: 12 },
      state: 'disputed',
      alternatives: [
        { kind: 'rational', value: domain[0], notation: `-${'0'.repeat(45)}10` },
        { kind: 'rational', value: domain[1], notation: `${'0'.repeat(46)}10` },
      ],
      qualifier: 'Q'.repeat(96),
    };
    const input = {
      ...plot(Array.from({ length: 12 }, (_, index) => record(quantity, `record-${index}`))),
      basis: referencedBasis,
    };
    for (const reveal of [0, 1]) {
      const props = { ...input, pose: { ...base.pose, reveal } };
      account(
        createElement(PrecisionPlotSvg, props),
        createElement(PrecisionPlotClay, props),
        PLOT_ASSET_BUDGETS.precision,
      );
    }
  });
  it('is identical on repeated and shuffled pure seeks', () => {
    const input = plot([record(known(-5))]);
    const saved = new Map<number, string>();
    for (const p of [0, 0.5, 1, 0.25, 0.5, 0, 1]) {
      const rendered = markup(
        createElement(PrecisionPlotSvg, {
          ...input,
          pose: { reveal: p, action: p, response: p, check: p, resolve: p },
        }),
      );
      expect(rendered).not.toMatch(/NaN|Infinity/);
      if (saved.has(p)) expect(rendered).toBe(saved.get(p));
      else saved.set(p, rendered);
    }
  });
});

describe('partitions, qualified bands and supplied ranks', () => {
  function partition(
    shares: readonly ExpansionRational[],
    remainder: PartitionProps['remainder'] = 'known-complete',
  ): PartitionProps {
    return {
      ...base,
      basisLabel: 'Orders in March',
      remainder,
      parts: shares.map((share, index) => ({
        id: `part-${index}`,
        label: 'M'.repeat(28),
        provenance: 'source',
        share,
      })),
    };
  }
  it('checks exact whole coverage, overflow and distinct unknown/missing remainders', () => {
    const thirds = partition(Array.from({ length: 3 }, () => ({ numerator: 1, denominator: 3 })));
    expect(partitionLayout(thirds).map(({ start, width }) => [start, width])).toEqual([
      [0, 80],
      [80, 80],
      [160, 80],
    ]);
    expect(() => partitionLayout(partition([{ numerator: 1, denominator: 3 }]))).toThrow();
    expect(() =>
      partitionLayout(
        partition([
          { numerator: 1, denominator: 1 },
          { numerator: 1, denominator: 10 },
        ]),
      ),
    ).toThrow();
    expect(() => partitionLayout(partition([{ numerator: -1, denominator: 3 }]))).toThrow();
    expect(() => partitionLayout(partition([{ numerator: 1, denominator: 0 }]))).toThrow();
    for (const remainder of ['missing', 'unknown'] as const) {
      const partial = partition([{ numerator: 1, denominator: 3 }], remainder);
      expect(markup(createElement(PartitionSvg, partial))).toContain(
        `data-remainder="${remainder}"`,
      );
      expect(markup(createElement(PartitionSvg, partial))).toContain(`>${remainder}<`);
    }
  });
  it('counts the maximum partition with a separately indicated remainder', () => {
    const parts = partition(
      Array.from({ length: 12 }, () => ({ numerator: 1, denominator: 24 })),
      'unknown',
    );
    account(
      createElement(PartitionSvg, parts),
      createElement(PartitionClay, parts),
      PLOT_ASSET_BUDGETS.partition,
    );
  });
  it('projects numerically indistinguishable endpoints exactly, without inventing confidence', () => {
    const lowerValue = { numerator: 999999998, denominator: 999999999 };
    const upperValue = { numerator: 999999999, denominator: 1000000000 };
    expect(lowerValue.numerator / lowerValue.denominator).toBe(
      upperValue.numerator / upperValue.denominator,
    );
    const props = {
      ...base,
      id: 'range-0',
      lowerValue,
      upperValue,
      domain: [lowerValue, upperValue] as const,
      meaning: 'Reported range; confidence not stated',
    };
    const rendered = markup(createElement(PlotBandSvg, props));
    expect(rendered).toContain('width="240"');
    expect(rendered).toContain(props.meaning);
    account(createElement(PlotBandSvg, props), null, PLOT_ASSET_BUDGETS.band);
    expect(() =>
      markup(
        createElement(PlotBandSvg, { ...props, lowerValue: upperValue, upperValue: lowerValue }),
      ),
    ).toThrow();
  });
  it('keeps unknown rank outside the supplied ranking rather than inventing last place', () => {
    const props = {
      ...base,
      id: 'rank-0',
      label: 'Acme',
      periodLabel: 'March',
      rank: 'unknown' as const,
    };
    const rendered = markup(createElement(RankedTrackSvg, props));
    expect(rendered).toContain('x="260"');
    expect(rendered).toContain('March: unknown');
    account(createElement(RankedTrackSvg, props), null, PLOT_ASSET_BUDGETS.ranked);
    for (const rank of [0, 9, 1.5, NaN, Infinity])
      expect(() => markup(createElement(RankedTrackSvg, { ...props, rank }))).toThrow();
  });
});
