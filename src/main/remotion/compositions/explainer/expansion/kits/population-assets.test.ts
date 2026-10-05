import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClayBlock } from '../../explanation-kit';
import type { ExpansionKitPose, ExpansionKitState } from '../scene-types';
import {
  POPULATION_MAX_BUDGET,
  type PopulationCount,
  PopulationLegendSvg,
  PopulationMarkClay,
  PopulationMarkSvg,
  type PopulationMemberMark,
  PopulationTrayClay,
  type PopulationTrayProps,
  PopulationTraySvg,
  populationBudget,
  populationGridPosition,
  populationSlots,
  SamplingApertureClay,
  SamplingApertureSvg,
  validatePopulation,
} from './population';

const states: readonly ExpansionKitState[] = [
  'retained',
  'active',
  'excluded',
  'unknown',
  'disputed',
];
const pose: ExpansionKitPose = { reveal: 1, action: 1, response: 1, check: 1, resolve: 1 };
const known = (numerator: number): PopulationCount => ({
  state: 'known',
  value: { numerator, denominator: 1 },
});
const member = (
  index: number,
  state: ExpansionKitState = 'retained',
  represents: PopulationCount = known(1),
): PopulationMemberMark => ({
  id: `source-${String(index).padStart(3, '0')}`,
  membership: ['source-cohort'],
  state,
  represents,
});
function tray(marks = 100): PopulationTrayProps {
  return {
    pose,
    state: 'retained',
    colors: { surface: '#fafafa', text: '#111111', accent: '#9966ff', muted: '#888888' },
    placement: { position: [0, 0, 0] },
    marks: Array.from({ length: marks }, (_, index) =>
      member(index, states[index % states.length]),
    ),
    representedPopulation: known(marks),
    sourceDenominator: known(1000),
    basis: {
      unit: 'count',
      population: 'Source cohort',
      period: 'Source period',
      denominator: { numerator: 1000, denominator: 1 },
    },
    aggregation: { kind: 'literal' },
    aperture: { window: 'all', membership: 'source-cohort' },
  };
}
function markup(
  component: typeof PopulationTraySvg | typeof PopulationTrayClay,
  props: PopulationTrayProps,
): string {
  return renderToStaticMarkup(createElement(component, props));
}
function tags(html: string): string[] {
  return Array.from(html.matchAll(/<([A-Za-z][\w:-]*)(?=[\s/>])/g), (match) =>
    match[1].toLowerCase(),
  );
}
function count(html: string, names: readonly string[]): number {
  return tags(html).filter((tag) => names.includes(tag)).length;
}
function accountSvg(html: string) {
  return {
    elements: count(html, ['g', 'title', 'circle', 'rect', 'path', 'style', 'text', 'tspan']),
    shapes: count(html, ['circle', 'rect', 'path']),
  };
}
function ids(html: string): string[] {
  return Array.from(html.matchAll(/(?:data-member-id|name)="(source-\d+)"/g), (match) => match[1]);
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('population assets: actual SSR geometry accounting', () => {
  it('executes the real ClayBlock helper and accounts for its intrinsic mesh and geometry', () => {
    const html = renderToStaticMarkup(
      createElement(ClayBlock, { size: [1, 1, 1], color: '#fafafa', opacity: 0 }),
    );
    expect(count(html, ['mesh'])).toBe(1);
    expect(count(html, ['meshphysicalmaterial'])).toBe(1);
    expect(html).toMatch(/<mesh\s[^>]*geometry=/);
    expect(count(html, ['primitive', 'instancedmesh', 'skinnedmesh', 'canvas'])).toBe(0);
  });

  for (const state of states) {
    for (const reveal of [0, 1]) {
      it(`counts all 100 ${state} marks with reveal=${reveal}, including invisible geometry`, () => {
        const props = {
          ...tray(),
          marks: Array.from({ length: 100 }, (_, index) => member(index, state)),
          pose: { ...pose, reveal },
        };
        const svg = markup(PopulationTraySvg, props);
        const clay = markup(PopulationTrayClay, props);
        expect(accountSvg(svg)).toEqual({ elements: 412, shapes: 202 });
        expect(count(clay, ['mesh'])).toBe(309);
        expect(count(clay, ['meshphysicalmaterial'])).toBe(309);
        // 209 actual rounded-box meshes plus 100 native cylinders, without mocked totals.
        expect(Array.from(clay.matchAll(/<mesh\s[^>]*geometry=/g))).toHaveLength(209);
        expect(count(clay, ['cylindergeometry'])).toBe(100);
        expect(count(svg + clay, ['canvas', 'primitive', 'instancedmesh', 'skinnedmesh'])).toBe(0);
        expect(ids(svg)).toHaveLength(100);
        expect(ids(clay)).toHaveLength(100);
        expect(POPULATION_MAX_BUDGET.clayMeshes).toBe(309);
        expect(POPULATION_MAX_BUDGET.svgElements).toBe(412);
        expect(POPULATION_MAX_BUDGET.svgShapes).toBe(202);
      });
    }
  }

  for (let size = 0; size <= 100; size += 1) {
    it(`accounts for accepted population size ${size} using actual SVG and clay geometry`, () => {
      const props = tray(size);
      const budget = populationBudget(size);
      expect(accountSvg(markup(PopulationTraySvg, props))).toEqual({
        elements: budget.svgElements,
        shapes: budget.svgShapes,
      });
      expect(count(markup(PopulationTrayClay, props), ['mesh'])).toBe(budget.clayMeshes);
    });
  }

  it('accounts for the planar legend and every authored aperture window', () => {
    for (const window of ['all', 'first-half', 'second-half'] as const) {
      const props = { ...tray(), window, membership: 'source-cohort' };
      expect(accountSvg(renderToStaticMarkup(createElement(SamplingApertureSvg, props)))).toEqual({
        elements: 2,
        shapes: 1,
      });
      expect(
        count(renderToStaticMarkup(createElement(SamplingApertureClay, props)), ['mesh']),
      ).toBe(4);
    }
    const legend = renderToStaticMarkup(createElement(PopulationLegendSvg, tray()));
    expect(accountSvg(legend)).toEqual({ elements: 8, shapes: 0 });
    expect(count(legend, ['canvas'])).toBe(0);
    expect(legend).toContain('font-family=');
    expect(legend).toContain('--population-ink:#111111');
  });
});

describe('population assets: source identity, quantities and seek stability', () => {
  it('keeps identities and geometry canonical across repeats, shuffled inputs and frozen-input seeks', () => {
    const original = deepFreeze(tray());
    const shuffled = {
      ...original,
      marks: [...original.marks.slice(37), ...original.marks.slice(0, 37)].reverse(),
    };
    const canonicalIds = original.marks.map((mark) => mark.id);
    expect(populationSlots(shuffled.marks).map((mark) => mark.id)).toEqual(canonicalIds);
    const snapshot = JSON.stringify(original);
    for (const component of [PopulationTraySvg, PopulationTrayClay]) {
      const first = markup(component, original);
      expect(markup(component, original)).toBe(first);
      expect(markup(component, shuffled)).toBe(first);
      for (const reveal of [0, 0.6, 1, 0.2, 1]) {
        const seek = {
          ...original,
          pose: { reveal, action: reveal, response: reveal, check: reveal, resolve: reveal },
        };
        expect(ids(markup(component, seek))).toEqual(canonicalIds);
      }
      expect(markup(component, original)).toBe(first);
    }
    expect(JSON.stringify(original)).toBe(snapshot);
    const slots = Array.from({ length: 100 }, (_, index) => populationGridPosition(index));
    expect(new Set(slots.map(String)).size).toBe(100);
    expect(slots[0]).toEqual([-2.16, 2.16, 0.04]);
    expect(slots[99]).toEqual([2.16, -2.16, 0.04]);
  });

  it('keeps 10 displayed aggregate groups, 100 represented members and denominator 1000 distinct', () => {
    const props = {
      ...tray(10),
      marks: Array.from({ length: 10 }, (_, index) => member(index, 'retained', known(10))),
      representedPopulation: known(100),
      aggregation: {
        kind: 'aggregate',
        qualifier: 'Each group represents ten source members',
      } as const,
    };
    const html = markup(PopulationTraySvg, props);
    expect(html).toContain('Population: 100; reference denominator: 1000');
    expect(html).toContain(
      '10 displayed aggregate groups; Each group represents ten source members',
    );
    expect(ids(html)).toHaveLength(10);
    expect(() => validatePopulation({ ...props, aggregation: { kind: 'literal' } })).toThrow();
    expect(() =>
      validatePopulation({ ...props, aggregation: { kind: 'aggregate', qualifier: '' } }),
    ).toThrow();
    expect(() => validatePopulation({ ...props, representedPopulation: known(99) })).toThrow();
    expect(() => validatePopulation({ ...props, sourceDenominator: known(99) })).toThrow();
    expect(() =>
      validatePopulation({
        ...props,
        basis: { ...props.basis, denominator: { numerator: 10, denominator: 1 } },
      }),
    ).toThrow();
  });

  it('shows explicit zero without fabricating any member marks', () => {
    const props = {
      ...tray(0),
      sourceDenominator: known(0),
      basis: { ...tray(0).basis, denominator: { numerator: 0, denominator: 1 } },
    };
    const html = markup(PopulationTraySvg, props);
    expect(html).toContain('Population: 0; reference denominator: 0');
    expect(ids(html)).toEqual([]);
    expect(count(markup(PopulationTrayClay, props), ['mesh'])).toBe(9);
    expect(() => validatePopulation({ ...props, marks: [member(0)] })).toThrow();
    expect(() =>
      validatePopulation({ ...tray(1), marks: [member(0, 'retained', known(0))] }),
    ).toThrow();
  });

  for (const state of ['unknown', 'missing', 'disputed'] as const) {
    it(`retains ${state} counts/remainders instead of measured zero or invented individuals`, () => {
      const quantity: PopulationCount = { state, qualifier: 'Source does not resolve this count' };
      const markState = state === 'disputed' ? 'disputed' : 'unknown';
      const props = {
        ...tray(1),
        marks: [member(0, markState, quantity)],
        representedPopulation: quantity,
        sourceDenominator: quantity,
        basis: { ...tray().basis, denominator: undefined },
        aggregation: {
          kind: 'aggregate',
          qualifier: 'One source group; count unresolved',
        } as const,
      };
      const html = markup(PopulationTraySvg, props);
      expect(html).toContain(`Population: ${state}: Source does not resolve this count`);
      expect(html).toContain(`reference denominator: ${state}: Source does not resolve this count`);
      expect(html).toContain('includes unmeasured groups');
      expect(html).not.toContain('Population: 0');
      expect(ids(html)).toEqual(['source-000']);
      expect(count(markup(PopulationTrayClay, props), ['mesh'])).toBe(12);
      expect(() =>
        validatePopulation({ ...props, marks: [member(0, 'retained', quantity)] }),
      ).toThrow();
      // A known total may coexist with an unresolved remainder, not a zero-filled remainder.
      expect(() =>
        validatePopulation({
          ...props,
          representedPopulation: known(10),
          sourceDenominator: known(20),
        }),
      ).not.toThrow();
      expect(() => validatePopulation({ ...props, representedPopulation: known(0) })).toThrow();
    });
  }

  it('keeps SVG state glyphs distinct and preserves all source memberships across modes', () => {
    const glyphs = new Set<string>();
    for (const state of states) {
      const props = {
        ...tray(1),
        state,
        member: { ...member(0, state), membership: ['cohort-A', 'sample-B'] },
      };
      const svg = renderToStaticMarkup(createElement(PopulationMarkSvg, props));
      const clay = renderToStaticMarkup(createElement(PopulationMarkClay, props));
      glyphs.add(svg.match(/<path d="([^"]+)"/)?.[1] ?? '');
      expect(svg).toContain('cohort-A');
      expect(svg).toContain('sample-B');
      expect(ids(svg)).toEqual(ids(clay));
      expect(count(clay, ['mesh'])).toBe(3);
    }
    expect(glyphs.size).toBe(5);
    expect(glyphs.has('')).toBe(false);
  });
});

describe('population assets: bounded inputs', () => {
  it('keeps maximum accepted labels within the claimed SVG ceiling', () => {
    const quantity: PopulationCount = { state: 'disputed', qualifier: 'q'.repeat(96) };
    const props = {
      ...tray(),
      marks: Array.from({ length: 100 }, (_, index) => ({
        ...member(index, 'disputed', quantity),
        id: `${String(index).padStart(3, '0')}${'i'.repeat(93)}`,
        membership: Array.from({ length: 8 }, (_, group) => `${group}${'m'.repeat(95)}`),
      })),
      representedPopulation: quantity,
      sourceDenominator: quantity,
      basis: { unit: 'count', population: 'p'.repeat(40), period: 't'.repeat(32) } as const,
      aggregation: { kind: 'aggregate', qualifier: 'a'.repeat(96) } as const,
    };
    expect(accountSvg(markup(PopulationTraySvg, props))).toEqual({ elements: 412, shapes: 202 });
    expect(count(markup(PopulationTrayClay, props), ['mesh'])).toBe(309);
    expect(() =>
      validatePopulation({
        ...props,
        aggregation: { kind: 'aggregate', qualifier: 'a'.repeat(97) },
      }),
    ).toThrow();
    expect(() =>
      validatePopulation({ ...props, basis: { ...props.basis, population: 'p'.repeat(41) } }),
    ).toThrow();
    expect(() =>
      validatePopulation({ ...props, basis: { ...props.basis, period: 't'.repeat(33) } }),
    ).toThrow();
    expect(() =>
      validatePopulation({
        ...props,
        sourceDenominator: { state: 'unknown', qualifier: 'q'.repeat(97) },
      }),
    ).toThrow();
  });

  it('rejects excessive marks, duplicate IDs, malformed memberships, invalid counts and slots', () => {
    expect(() => validatePopulation(tray(101))).toThrow();
    expect(() => validatePopulation({ ...tray(2), marks: [member(0), member(0)] })).toThrow();
    expect(() => populationSlots([member(0), member(0)])).toThrow();
    for (const index of [-1, 100, 1.5, NaN, Infinity])
      expect(() => populationGridPosition(index)).toThrow();
    for (const size of [-1, 101, 1.5, NaN, Infinity])
      expect(() => populationBudget(size)).toThrow();
    for (const membership of [
      ['x', 'x'],
      Array.from({ length: 9 }, (_, index) => String(index)),
      [''],
      ['m'.repeat(97)],
    ])
      expect(() =>
        validatePopulation({ ...tray(1), marks: [{ ...member(0), membership }] }),
      ).toThrow();
    for (const id of ['', 'i'.repeat(97)])
      expect(() => validatePopulation({ ...tray(1), marks: [{ ...member(0), id }] })).toThrow();
    for (const numerator of [-1, 0.5, 1_000_000_001, NaN, Infinity])
      expect(() =>
        validatePopulation({ ...tray(0), representedPopulation: known(numerator) }),
      ).toThrow();
    for (const denominator of [0, -1, 2, NaN, Infinity])
      expect(() =>
        validatePopulation({
          ...tray(0),
          representedPopulation: { state: 'known', value: { numerator: 0, denominator } },
        }),
      ).toThrow();
    expect(() =>
      validatePopulation({ ...tray(0), basis: { ...tray(0).basis, unit: 'ratio' } }),
    ).toThrow();
  });

  for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
    it(`rejects nonfinite ${key} in every asset, without relying on geometry visibility`, () => {
      for (const value of [NaN, Infinity, -Infinity]) {
        const props = {
          ...tray(1),
          pose: { ...pose, [key]: value },
          member: member(0),
          ...tray().aperture,
        };
        for (const component of [
          PopulationTraySvg,
          PopulationTrayClay,
          PopulationLegendSvg,
          PopulationMarkSvg,
          PopulationMarkClay,
          SamplingApertureSvg,
          SamplingApertureClay,
        ]) {
          expect(() => renderToStaticMarkup(createElement<typeof props>(component, props))).toThrow(
            /finite/,
          );
        }
      }
    });
  }
});
