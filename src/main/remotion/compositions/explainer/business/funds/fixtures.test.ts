import { describe, expect, it } from 'vitest';
import { diagramPose } from '../../diagrams/motion';
import { BUSINESS_RECIPES } from '../catalog';
import { businessTextWidth } from '../text-width';
import {
  FUNDS_ACCEPTED_VARIANTS,
  FUNDS_RESOURCE_FIXTURES,
  FUNDS_SOURCE_FIXTURES,
  fundsFixtureContext,
  parseFundsFixture,
} from './fixtures';
import {
  FUNDS_TABLE,
  fundsPageAt,
  fundsPageDuration,
  fundsPages,
  fundsReadingStart,
  fundsResourceCounts,
  fundsRowLines,
  fundsRows,
  fundsSemanticIds,
} from './presentation';
import { fundsAmounts, fundsObserved, fundsRecipe } from './types';

const cases = [...FUNDS_SOURCE_FIXTURES, ...FUNDS_ACCEPTED_VARIANTS, ...FUNDS_RESOURCE_FIXTURES];
const modes = cases.flatMap((fixture) =>
  (fixture.id === 'OP-52' ? ['diagram'] : ['diagram', 'hybrid']).map((mode) => ({ fixture, mode })),
);
describe('authored synthetic funds source fixtures, not native render evidence', () => {
  it('covers all eight frozen routes with one primary each', () => {
    expect(FUNDS_SOURCE_FIXTURES.map((fixture) => fixture.id)).toEqual([
      'OP-49',
      'OP-50',
      'OP-51',
      'OP-52',
      'OP-53',
      'OP-54',
      'OP-55',
      'OP-56',
    ]);
    for (const fixture of FUNDS_SOURCE_FIXTURES) {
      const catalog = BUSINESS_RECIPES.find((recipe) => recipe.id === fixture.id);
      expect(catalog?.kind).toBe(fixture.raw.kind);
      expect(catalog?.preset).toBe(fixture.raw.preset);
      expect(catalog?.modes).toEqual(fixture.id === 'OP-52' ? ['diagram'] : ['diagram', 'hybrid']);
    }
  });
  it.each(modes)('$fixture.id $fixture.name $mode parses real source and complete 24px pages', ({
    fixture,
    mode,
  }) => {
    const copy = structuredClone(fixture);
    copy.raw.visualMode = mode;
    const before = structuredClone(copy);
    const { scene, issues } = parseFundsFixture(copy);
    if (!scene) throw new Error(issues.join('; '));
    expect(issues).toEqual([]);
    expect(copy).toEqual(before);
    expect(fundsRecipe(scene)).toBe(fixture.id);
    const ctx = fundsFixtureContext(copy);
    expect([
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
    ]).toEqual(
      ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'].map((field) =>
        ctx.at(copy.raw[field] as number),
      ),
    );
    expect(copy.window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
    expect(scene.fund.label).toBe(copy.raw.subject);
    expect(scene.operator.label).toBe('Mara');
    const counts = fundsResourceCounts(scene);
    expect(counts.entities).toBeLessThanOrEqual(8);
    expect(counts.relationships).toBeLessThanOrEqual(12);
    expect(counts.holds).toBeLessThanOrEqual(4);
    expect(new Set(fundsSemanticIds(scene)).size).toBe(fundsSemanticIds(scene).length);
    const pages = fundsPages(scene),
      duration = fundsPageDuration(scene);
    expect(duration).toBeGreaterThanOrEqual(1.5);
    expect(pages.flatMap((page) => page.rows)).toEqual(fundsRows(scene));
    pages.forEach((page, index) => {
      const at = fundsReadingStart(scene) + index * duration;
      for (const seconds of [at + 0.00001, at + 1.5 - 0.00001]) {
        expect(fundsPageAt(scene, seconds)).toEqual(page);
        if (mode === 'hybrid') expect(diagramPose(seconds, scene).diagramOpacity).toBe(1);
      }
      expect(page.height).toBeLessThanOrEqual(FUNDS_TABLE.rowBottom - FUNDS_TABLE.rowTop);
      page.rows.forEach((row) => {
        fundsRowLines(row).forEach((lines, column) => {
          expect(lines.join('').replace(/\s/gu, '')).toBe(row.cells[column].replace(/\s/gu, ''));
          lines.forEach((line) => {
            expect(businessTextWidth(line, 24)).toBeLessThanOrEqual(FUNDS_TABLE.railWidths[column]);
          });
        });
      });
    });
    expect(fundsPageAt(scene, scene.resolveAt)).toEqual(fundsPageAt(scene, copy.window.endTime));
    for (const value of fundsAmounts(scene)) {
      if (value.state !== 'source-stated' || value.basis.denominator === null)
        expect(fundsObserved(value)).toBe(false);
      if (['unknown', 'negative', 'pending'].includes(value.state)) expect(value.amount).toBeNull();
    }
  });
  it('exports the accepted zero-ceiling/zero-distribution then paid-tier repro without modifying M10', () => {
    const fixture = FUNDS_ACCEPTED_VARIANTS.find(
      (entry) => entry.name === 'zero ceiling followed by paid tier',
    );
    if (!fixture) throw new Error('Missing source-built zero ceiling repro');
    const { scene, issues } = parseFundsFixture(fixture);
    if (!scene || scene.preset !== 'stated-priority-tiers') throw new Error(issues.join('; '));
    expect(
      scene.tiers.map((tier) => [
        tier.ceiling.amount?.minorUnits,
        tier.allocation.amount?.minorUnits,
      ]),
    ).toEqual([
      [0, 0],
      [1000, 1000],
    ]);
    expect(scene.proceeds.amount?.minorUnits).toBe(1000);
    expect(scene.retained.amount?.minorUnits).toBe(0);
  });
  it('keeps dates literal and NAV and available cash incomparable', () => {
    const { scene } = parseFundsFixture(FUNDS_SOURCE_FIXTURES[4]);
    if (!scene || scene.preset !== 'source-periods') throw new Error('Missing source periods');
    expect(scene.periods.map((period) => [period.date, period.value.basis.period])).toEqual([
      ['June', 'June'],
      ['July', 'July'],
      ['August', 'August'],
    ]);
    const nav = parseFundsFixture(FUNDS_SOURCE_FIXTURES[7]).scene;
    if (!nav || nav.preset !== 'valuation-cash-distinction') throw new Error('Missing NAV fixture');
    expect(nav.valuation.basis.population).toBe('assets');
    expect(nav.cash.basis.population).toBe('cash accounts');
  });
});
