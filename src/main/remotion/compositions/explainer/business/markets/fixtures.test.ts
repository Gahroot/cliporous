import { describe, expect, it } from 'vitest';
import {
  parseMarketDependencyScene,
  parseProcurementCommitmentScene,
} from '../../../../../ai/explainer/business-markets-contract';
import type { Rec } from '../../../../../ai/explainer/kind-spec';
import { diagramPose } from '../../diagrams/motion';
import {
  MARKETS_ADDITIONAL_SOURCE_FIXTURES,
  MARKETS_RECIPE_IDS,
  MARKETS_SOURCE_FIXTURES,
  MARKETS_SOURCE_NEGATIVES,
  type MarketsSourceFixture,
  marketsSourceContext,
  marketsSourceWindow,
} from './fixtures';
import {
  MARKETS_RAIL,
  marketsContentFits,
  marketsDetailWindows,
  marketsIdentities,
  marketsLines,
  marketsPageIndex,
  marketsPages,
  marketsPresentationFits,
  marketsReadingStart,
  marketsRows,
  marketsTextWidth,
} from './presentation';

const BEAT_FIELDS = [
  ['setupWord', 'setupAt'],
  ['actionWord', 'actionAt'],
  ['responseWord', 'responseAt'],
  ['checkWord', 'checkAt'],
  ['resolveWord', 'resolveAt'],
] as const;

function parse(fixture: MarketsSourceFixture, mode: 'diagram' | 'hybrid') {
  const raw: Rec = { ...fixture.raw, visualMode: mode };
  const ctx = marketsSourceContext(fixture);
  const scene =
    raw.kind === 'procurement-commitment'
      ? parseProcurementCommitmentScene(raw, ctx)
      : parseMarketDependencyScene(raw, ctx);
  return { scene, ctx };
}
const cases = [...MARKETS_SOURCE_FIXTURES, ...MARKETS_ADDITIONAL_SOURCE_FIXTURES].flatMap(
  (fixture) =>
    (fixture.id === 'OP-44' ? (['diagram'] as const) : (['diagram', 'hybrid'] as const)).map(
      (mode) => ({ fixture, mode, name: `${fixture.fixtureId}:${mode}` }),
    ),
);
describe('markets authored raw source fixtures (CPU parser/readability only)', () => {
  it('exports exactly one primary per each of nine recipes with no catalog mode duplicates', () => {
    expect(MARKETS_SOURCE_FIXTURES.map((f) => f.id)).toEqual(MARKETS_RECIPE_IDS);
    expect(new Set(MARKETS_SOURCE_FIXTURES.map((f) => f.id)).size).toBe(9);
    expect(
      new Set(MARKETS_SOURCE_FIXTURES.map((f) => f.words.map((w) => w.text).join(' '))).size,
    ).toBe(9);
    const all = [...MARKETS_SOURCE_FIXTURES, ...MARKETS_ADDITIONAL_SOURCE_FIXTURES];
    expect(new Set(all.map((f) => f.fixtureId)).size).toBe(all.length);
  });
  it.each(cases)('accepts $name in the real lead-in/tail window', ({ fixture, mode }) => {
    const { scene, ctx } = parse(fixture, mode);
    expect(scene, `${fixture.fixtureId}: ${ctx.issues.join('; ')}`).not.toBeNull();
    expect(ctx.issues).toEqual([]);
    if (!scene) throw new Error('Missing accepted scene');
    const window = marketsSourceWindow(fixture);
    const firstWord = fixture.words[0],
      lastWord = fixture.words.at(-1);
    if (!firstWord || !lastWord) throw new Error('Authored fixture needs source words');
    expect(window.startTime).toBeCloseTo(firstWord.start - 0.25);
    expect(window.endTime).toBeCloseTo(lastWord.end + 0.35);
    expect(window.endTime - window.startTime).toBeGreaterThanOrEqual(5);
    expect(window.endTime - window.startTime).toBeLessThanOrEqual(12);
    for (const [wordField, timeField] of BEAT_FIELDS) {
      const word = fixture.raw[wordField];
      if (typeof word !== 'number' || !fixture.words[word])
        throw new Error('Missing authored beat');
      expect(scene[timeField]).toBeCloseTo(ctx.at(word));
      expect(fixture.words[word].start).toBeGreaterThanOrEqual(window.startTime);
      expect(fixture.words[word].end).toBeLessThanOrEqual(window.endTime);
    }
    expect(marketsPresentationFits(scene, window.endTime)).toBe(true);
    expect(marketsContentFits(scene)).toBe(true);
    expect(window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
    expect(marketsIdentities(scene).length).toBeLessThanOrEqual(8);
  });
  it.each(cases)('shows every complete detail page at fixed font and full opacity: $name', ({
    fixture,
    mode,
  }) => {
    const { scene } = parse(fixture, mode);
    if (!scene) throw new Error('Missing accepted scene');
    const pages = marketsPages(scene),
      windows = marketsDetailWindows(scene);
    expect(pages.length).toBeLessThanOrEqual(4);
    expect(pages.flatMap((p) => p.rows)).toEqual(marketsRows(scene));
    expect(MARKETS_RAIL.fontSize).toBe(24);
    expect(MARKETS_RAIL.height).toBe(478);
    expect(diagramPose(marketsReadingStart(scene), scene).setup).toBe(1);
    if (mode === 'hybrid') {
      expect(diagramPose(windows[0].start, scene).diagramOpacity).toBe(1);
      expect(diagramPose(windows[0].start - 0.0001, scene).diagramOpacity).toBeLessThan(1);
    }
    windows.forEach((w, index) => {
      expect(w.end - w.start).toBeGreaterThanOrEqual(1.5);
      expect(marketsPageIndex(scene, w.start + 1e-8)).toBe(index);
      expect(marketsPageIndex(scene, w.end - 1e-8)).toBe(index);
      expect(pages[index].lines).toBeLessThanOrEqual(MARKETS_RAIL.bodyLines);
      for (const row of pages[index].rows)
        for (const text of [row.text, `${row.label} · ${row.state}`]) {
          const lines = marketsLines(text);
          expect(lines.join(' ')).toBe(text);
          expect(lines.every((line) => marketsTextWidth(line) <= MARKETS_RAIL.width - 48)).toBe(
            true,
          );
        }
    });
    const end = marketsSourceWindow(fixture).endTime;
    expect(marketsPageIndex(scene, scene.resolveAt)).toBe(pages.length - 1);
    expect(marketsPageIndex(scene, end)).toBe(pages.length - 1);
    const probes = [
      end,
      windows[0].start,
      ...windows.map((w) => w.start),
      scene.resolveAt,
      0,
      NaN,
      Infinity,
      -Infinity,
    ];
    for (const t of probes) {
      const a = marketsPageIndex(scene, t);
      expect(Number.isFinite(a)).toBe(true);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(pages.length);
      expect(marketsPageIndex(scene, t)).toBe(a);
    }
  });
  it.each(
    MARKETS_SOURCE_FIXTURES.filter((f) => f.id !== 'OP-44'),
  )('preserves every fact/identity in both modes: $id', (fixture) => {
    const diagram = parse(fixture, 'diagram').scene,
      hybrid = parse(fixture, 'hybrid').scene;
    expect(diagram).not.toBeNull();
    expect(hybrid).not.toBeNull();
    if (!diagram || !hybrid) throw new Error('Missing mode');
    expect(marketsRows(diagram)).toEqual(marketsRows(hybrid));
    expect(marketsIdentities(diagram)).toEqual(marketsIdentities(hybrid));
    expect({ ...hybrid, visualMode: 'diagram' }).toEqual(diagram);
  });
  it('exports substantive named negatives for every recipe', () => {
    expect(new Set(MARKETS_SOURCE_NEGATIVES.map((n) => n.recipeId))).toEqual(
      new Set(MARKETS_RECIPE_IDS),
    );
    expect(new Set(MARKETS_SOURCE_NEGATIVES.map((n) => n.name)).size).toBe(
      MARKETS_SOURCE_NEGATIVES.length,
    );
    for (const id of MARKETS_RECIPE_IDS)
      expect(
        MARKETS_SOURCE_NEGATIVES.filter((n) => n.recipeId === id).length,
      ).toBeGreaterThanOrEqual(2);
  });
  it.each(MARKETS_SOURCE_NEGATIVES)('rejects source-specific $recipeId / $name with diagnostics', ({
    fixture,
    name,
  }) => {
    const ctx = marketsSourceContext(fixture);
    const scene =
      fixture.raw.kind === 'procurement-commitment'
        ? parseProcurementCommitmentScene(fixture.raw, ctx)
        : parseMarketDependencyScene(fixture.raw, ctx);
    expect(scene, name).toBeNull();
    expect(ctx.issues.length, name).toBeGreaterThan(0);
    expect(ctx.issues.length).toBeLessThanOrEqual(4);
  });
});
