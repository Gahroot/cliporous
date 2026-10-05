import { describe, expect, it } from 'vitest';
import {
  CAPITAL_SOURCE_FIXTURES,
  capitalClaimAssetFixture,
  capitalFixtureContext,
  capitalRightsFixture,
} from '../../remotion/compositions/explainer/business/capital/fixtures';
import { capitalCards } from '../../remotion/compositions/explainer/business/capital/presentation';
import {
  ECONOMICS_SOURCE_FIXTURES,
  economicsFixtureContext,
} from '../../remotion/compositions/explainer/business/economics/fixtures';
import { economicsReadingCards } from '../../remotion/compositions/explainer/business/economics/readability';
import {
  createFundsFixture,
  FUNDS_ACCEPTED_VARIANTS,
  FUNDS_RESOURCE_FIXTURES,
  FUNDS_SOURCE_FIXTURES,
  parseFundsFixture,
} from '../../remotion/compositions/explainer/business/funds/fixtures';
import { fundsRows } from '../../remotion/compositions/explainer/business/funds/presentation';
import {
  parseCapitalStructureScene,
  parseEconomicRightsScene,
  parseInvestmentOutcomesScene,
} from '../explainer/business-capital-contract';
import {
  parseOperatingCostScene,
  parseScaleEconomicsScene,
  parseValueCaptureScene,
} from '../explainer/business-economics-contract';
import {
  type FinancialReadingCard,
  projectFinancialReadingCards,
  reconstructFinancialReadingCards,
} from './business-financial-projection';

function verify(cards: readonly FinancialReadingCard[]) {
  const before = structuredClone(cards);
  const table = projectFinancialReadingCards(cards);
  expect(reconstructFinancialReadingCards(table)).toEqual(
    cards.map((card) => ({
      id: card.id,
      title: card.title,
      lines: card.lines.map((line) => (typeof line === 'string' ? line : line.text)),
    })),
  );
  expect(cards).toEqual(before);
  expect(table.headings.length).toBeLessThanOrEqual(4);
  expect(Object.isFrozen(table.reconstruction)).toBe(true);
  return table;
}
const words = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length;
function nativeShape(cards: readonly FinancialReadingCard[]) {
  const table = verify(cards);
  for (const label of [
    ...table.headings,
    ...table.notes,
    ...table.rows.flatMap((row) => row.cells),
  ]) {
    expect(label.trim()).not.toBe('');
    expect(label.length).toBeLessThanOrEqual(512);
    expect([...label].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)).toBe(
      false,
    );
  }
  return table;
}
function measure(id: string, cards: readonly FinancialReadingCard[]) {
  const table = nativeShape(cards);
  const original = words(
    cards
      .flatMap((card) => [
        card.title,
        ...card.lines.map((line) => (typeof line === 'string' ? line : line.text)),
      ])
      .join(' '),
  );
  const projected = words(
    [...table.headings, ...table.notes, ...table.rows.flatMap((row) => row.cells)].join(' '),
  );
  console.info(
    `${id}: ${original} -> ${projected} words; ${table.rows.length}x${table.headings.length}; max cell ${Math.max(...table.rows.flatMap((row) => row.cells.map((cell) => cell.length)))}; notes ${table.notes.join('; ').length}`,
  );
  return table;
}
describe('lossless authored financial table projection', () => {
  for (const fixture of ECONOMICS_SOURCE_FIXTURES) {
    it(`economics ${fixture.id}`, () => {
      const ctx = economicsFixtureContext(fixture);
      const parse =
        fixture.raw.kind === 'operating-cost'
          ? parseOperatingCostScene
          : fixture.raw.kind === 'scale-economics'
            ? parseScaleEconomicsScene
            : parseValueCaptureScene;
      const scene = parse(fixture.raw, ctx);
      expect(scene, ctx.issues.join('; ')).not.toBeNull();
      if (!scene) throw new Error('Fixture rejected');
      const cards = economicsReadingCards(scene);
      const table = nativeShape(cards);
      const original = words(cards.flatMap((card) => [card.title, ...card.lines]).join(' '));
      const projected = words(
        [...table.headings, ...table.notes, ...table.rows.flatMap((row) => row.cells)].join(' '),
      );
      expect(projected).toBeLessThan(original);
      expect(table.rows.length).toBeLessThanOrEqual(8);
      expect(table.notes.join('\n').length).toBeLessThanOrEqual(300);
      for (const row of table.rows)
        for (const cell of row.cells) expect(cell.length).toBeLessThanOrEqual(300);
      console.info(
        `${fixture.id}: ${original} -> ${projected} words; ${table.rows.length}x${table.headings.length}; max cell ${Math.max(...table.rows.flatMap((row) => row.cells.map((cell) => cell.length)))}; notes ${table.notes.join('\n').length}`,
      );
    });
  }
  for (const fixture of CAPITAL_SOURCE_FIXTURES) {
    it(`capital ${fixture.id}`, () => {
      const ctx = capitalFixtureContext(fixture);
      const parse =
        fixture.raw.kind === 'economic-rights'
          ? parseEconomicRightsScene
          : fixture.raw.kind === 'investment-outcomes'
            ? parseInvestmentOutcomesScene
            : parseCapitalStructureScene;
      const scene = parse(fixture.raw, ctx);
      if (!scene) throw new Error(ctx.issues.join('; '));
      nativeShape(capitalCards(scene));
    });
  }
  for (const fixture of [
    ...FUNDS_SOURCE_FIXTURES,
    ...FUNDS_ACCEPTED_VARIANTS,
    ...FUNDS_RESOURCE_FIXTURES,
  ]) {
    it(`funds ${fixture.id} ${fixture.name}`, () => {
      const { scene, issues } = parseFundsFixture(fixture);
      if (!scene) throw new Error(issues.join('; '));
      nativeShape(
        fundsRows(scene).map((row) => ({
          id: row.id,
          title: row.cells[0],
          lines: row.cells.slice(1).map((text) => ({ text })),
        })),
      );
    });
  }
  it('S-02 measures the complete OP-33 native reading-card pack without importing the sequence writer', () => {
    // Exact pack derived from transaction() and economicsFacts/economicsReadingCards;
    // this is a text-projection proof, not a second source/planner constructor.
    const cards = [
      { id: 'review', title: 'Review cost', amount: '2 USD', unit: 'USD' },
      { id: 'total', title: 'Stated total cost', amount: '2 USD', unit: 'USD' },
      {
        id: 'resolved',
        title: 'Resolved tasks (not paid outcomes)',
        amount: '1 tasks',
        unit: 'tasks',
      },
      { id: 'per-outcome', title: 'Cost per resolved task', amount: '2 USD', unit: 'USD' },
    ].map(({ id, title, amount, unit }) => ({
      id,
      title,
      lines: [
        amount,
        'State: source-stated',
        'Subject: Mira',
        'Activity: Acquire',
        `Unit: ${unit}`,
        'Population: kits',
        'Period: June',
        'Denominator: 1',
      ],
    }));
    const table = measure('S-02 OP-33 reading pack', cards);
    expect(table.rows.length).toBe(4);
    expect(table.headings.length).toBe(3);
    expect(
      words(
        [...table.headings, ...table.notes, ...table.rows.flatMap((row) => row.cells)].join(' '),
      ),
    ).toBeLessThan(60);
  });
  it('S-08 uses the actual native constructors without importing the sequence writer', () => {
    const fixtures = [
      capitalRightsFixture({
        priority: 'source-stated',
        payout: null,
        payoutState: 'unknown',
        control: 'negative',
      }),
      capitalClaimAssetFixture({ transfer: 'conditional', liquidity: 'unknown' }),
    ];
    for (const fixture of fixtures) {
      const ctx = capitalFixtureContext(fixture);
      const scene = parseEconomicRightsScene(fixture.raw, ctx);
      if (!scene) throw new Error(ctx.issues.join('; '));
      measure(`S-08 ${fixture.id}`, capitalCards(scene));
    }
  });
  it('S-04 measures native fund constructor packs (before sequence identity renaming)', () => {
    const fixtures = [
      createFundsFixture('OP-49', {
        period: 'August',
        committedMinor: 12000,
        calledMinor: 8000,
        contributedMinor: 7000,
        deployedMinor: 5000,
        retainedMinor: 2000,
      }),
      createFundsFixture('OP-51', {
        period: 'August',
        proceedsMinor: 9000,
        retainedMinor: 2000,
        tierAmounts: [3000, 4000],
        tierCeilings: [3000, 4000],
      }),
    ];
    for (const fixture of fixtures) {
      const { scene, issues } = parseFundsFixture(fixture);
      if (!scene) throw new Error(issues.join('; '));
      measure(
        `S-04 ${fixture.id}`,
        fundsRows(scene).map((row) => ({
          id: row.id,
          title: row.cells[0],
          lines: row.cells.slice(1).map((text) => ({ text })),
        })),
      );
    }
  });
  it('uses a visible nonfact placeholder for fully qualified cards', () => {
    const table = nativeShape([
      { id: 'a', title: 'A', lines: ['Subject: Atlas', 'State: unknown'] },
      { id: 'b', title: 'B', lines: ['Subject: Atlas', 'State: pending'] },
    ]);
    expect(table.rows.map((row) => row.cells[1])).toEqual(['—', '—']);
    expect(table.headings[1]).toBe('Reading (—: no separate reading text)');
  });
  it('preserves unknowns, differing bases, exact money, multiline and unparsed qualifications', () => {
    const cards = [
      {
        id: 'a',
        title: 'First',
        lines: [
          'USD 100.01',
          'State: conditional',
          'Subject: Same',
          'Period: unknown',
          'Basis: employees; USD; annual; denominator unknown.',
          'Not observed: this is not cash\nand is not a promise.',
        ],
      },
      {
        id: 'b',
        title: 'Second',
        lines: [
          'USD 100.00',
          'State: pending',
          'Subject: Same',
          'Period: monthly',
          'Basis: customers; USD; monthly; denominator 2.',
          'Not observed: different words remain.',
        ],
      },
    ];
    const table = verify(cards);
    expect(table.notes).toEqual(['Subject: Same']);
    expect(table.headings).toEqual(['Field', 'Reading', 'State', 'Period · Basis']);
    expect(table.rows[0].cells[3]).toBe('unknown · employees; USD; annual; denominator unknown.');
    // Authored controls stay lossless, deliberately failing the unchanged native label gate.
    expect(table.rows[0].cells[1]).toContain('\n');
  });
  it('does not deduplicate unparsed wording, missing or repeated fields', () => {
    verify([
      { id: 'a', title: '', lines: ['Unit: USD', 'Unit: shares', '', 'same'] },
      { id: 'b', title: 'B', lines: ['same'] },
    ]);
    expect(projectFinancialReadingCards([]).rows).toEqual([]);
  });
});
