import { describe, expect, it } from 'vitest';
import { STORYBOARD_LIMITS as L } from '../../../shared/storyboards';
import { businessSourceFixture } from '../../remotion/compositions/explainer/business/source-fixtures';
import { wrapBoardText } from '../../remotion/compositions/storyboard/text-layout';
import { parsePlanWithDiagnostics } from '../explainer-scenes';
import {
  type BusinessDiagramLayoutInput,
  compileBusinessDiagramLayout,
} from './business-board-layout';
import {
  type BusinessPanelProjection,
  type BusinessStoryboardScene,
  businessPanelProjection,
} from './business-diagrams';
import { businessParagraphGroups } from './business-paragraph-groups';
import { BOARD_LAYOUT as G } from './catalog';

const projection = (patch: Partial<BusinessPanelProjection> = {}): BusinessPanelProjection => ({
  title: 'Source-bound business explanation',
  headings: ['Subject', 'Quantity basis', 'Evidence state'],
  rows: [
    {
      id: 'source-row',
      cells: ['Operating reserve', 'USD per quarter', 'unknown, not available cash'],
    },
  ],
  notes: ['Conditional: contribution only if approved; timing unknown.'],
  identities: [],
  resources: {
    identities: 0,
    textElements: 8,
    diagramEdges: 0,
    modelMeshes: 0,
    layoutRequired: true,
  },
  ...patch,
});
const input = (p = projection()): BusinessDiagramLayoutInput => ({
  panelId: 'panel-a',
  panelX: 1500,
  revealAt: 120.5,
  projection: p,
});
const compile = (p = projection()) => {
  const result = compileBusinessDiagramLayout(input(p));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.diagnostics[0].message);
  return result.value.elements;
};

function assertRails(p: BusinessPanelProjection) {
  const elements = compile(p);
  const allText = elements.map((el) => (el.kind === 'text' ? el.text : '')).join('\n');
  for (const label of [...p.headings, ...p.rows.flatMap((row) => [...row.cells]), ...p.notes]) {
    expect(allText).toContain(label);
  }
  expect(new Set(elements.map((el) => el.id)).size).toBe(elements.length);
  expect((elements.length + 2) * L.maxPanels).toBeLessThanOrEqual(L.maxElements);
  for (const [index, el] of elements.entries()) {
    expect(el.kind).toBe('text');
    if (el.kind !== 'text') throw new Error('Unexpected renderer kind');
    expect(el.id).toMatch(/^panel-a:business:/);
    expect(el.at).toBe(120.5); // absolute source time, not a 40-second local-time cap
    expect(el.x).toBe(1500 + G.inset);
    expect(el.width).toBe(G.panelWidth - G.inset * 2);
    expect(el.size).toBeGreaterThanOrEqual(G.contentMinFont);
    expect(el.size).toBeLessThanOrEqual(G.contentPreferredFont);
    expect(el.y).toBeGreaterThanOrEqual(G.contentTop);
    const rendererEstimate = wrapBoardText(el.text, el.size, el.width).length * el.size * 1.2;
    const next = elements[index + 1];
    expect(el.y + rendererEstimate).toBeLessThanOrEqual(
      next && next.kind === 'text' ? next.y - G.contentGap : G.panelHeight - G.inset,
    );
    for (const number of [el.x, el.y, el.size, el.width, el.at])
      expect(Number.isFinite(number)).toBe(true);
  }
}

describe('code-owned business board layout', () => {
  it('reserves the exact renderer wrapping height at fixed type instead of a flat per-character guess', () => {
    const p = projection({
      headings: [],
      notes: [],
      rows: [
        { id: 'native', cells: [Array.from({ length: 65 }, () => 'ill').join(' ')] },
        { id: 'next', cells: ['Unknown'] },
      ],
    });
    const result = compile(p);
    expect(result).toHaveLength(2);
    const text = result[0];
    const next = result[1];
    if (text.kind !== 'text' || next.kind !== 'text') throw new Error('Missing authored paragraph');
    expect(next.y - text.y - G.contentGap).toBe(
      wrapBoardText(text.text, text.size, text.width).length * text.size * 1.2,
    );
    expect(text.size).toBeGreaterThanOrEqual(G.contentMinFont);
  });
  it('groups complete native fact rows without raising four paragraphs or 48 rendered elements', () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({
      id: `fact-${index}`,
      cells: [`Fact ${index}`, 'Unknown; conditional'],
    }));
    const p = projection({
      headings: [],
      notes: [],
      rows,
      layoutGroups: businessParagraphGroups(rows),
    });
    assertRails(p);
    expect(compile(p)).toHaveLength(L.maxItems);
    for (const groups of [
      p.layoutGroups?.slice(1),
      p.layoutGroups?.map((group, index) =>
        index === 0 ? { ...group, rowIds: [...group.rowIds, group.rowIds[0]] } : group,
      ),
      p.layoutGroups?.map((group, index) =>
        index === 0 ? { ...group, rowIds: [...group.rowIds].reverse() } : group,
      ),
    ])
      expect(compileBusinessDiagramLayout(input({ ...p, layoutGroups: groups })).ok).toBe(false);
    expect(compileBusinessDiagramLayout(input(projection({ rows }))).ok).toBe(false);
  });
  it('preserves every heading, exact cell and unknown/conditional qualifier without frame/title duplication', () => {
    const p = projection();
    assertRails(p);
    expect(compile(p).map((el) => el.id)).toEqual([
      'panel-a:business:headings',
      'panel-a:business:row:source-row',
      'panel-a:business:notes',
    ]);
    expect(compile(p).some((el) => el.kind === 'text' && el.text === p.title)).toBe(false);
  });

  it('retains namespaced semantic row IDs when source rows reorder', () => {
    const rows = [
      { id: 'note-0', cells: ['Unknown cash', 'Conditional, not available'] },
      { id: 'source:reserve/東京', cells: ['Reserve', 'USD per quarter'] },
    ];
    const p = projection({ rows });
    const original = compile(p);
    const reordered = compile(projection({ rows: [...rows].reverse() }));
    for (const row of rows) {
      const id = `panel-a:business:row:${row.id}`;
      const first = original.find((element) => element.id === id);
      const second = reordered.find((element) => element.id === id);
      expect(first?.kind).toBe('text');
      expect(second?.kind).toBe('text');
      if (first?.kind !== 'text' || second?.kind !== 'text')
        throw new Error('Missing semantic row');
      expect(second.text).toBe(first.text);
      expect(first.text).toBe(row.cells.join(' · '));
      expect(second.y).not.toBe(first.y);
    }
    assertRails(p);
    assertRails(projection({ rows: [...rows].reverse() }));
  });

  it('preserves every qualifier in a real complete projection without an artificial note cap', () => {
    const source = businessSourceFixture('OP-01', 'diagram');
    if (!source) throw new Error('Missing authored OP-01 source fixture');
    const parsed = parsePlanWithDiagnostics(
      { scenes: [{ ...source.raw, layout: 'stack' }] },
      source.words,
      { minStart: 0, maxEnd: 90 },
    );
    expect(parsed.rejected).toEqual([]);
    expect(parsed.omitted).toEqual([]);
    expect(parsed.accepted).toHaveLength(1);
    const scene = parsed.accepted[0].scene;
    expect(scene.kind).toBe('task-map');
    const projected = businessPanelProjection(scene as BusinessStoryboardScene);
    expect(projected.ok).toBe(true);
    if (!projected.ok) throw new Error(projected.diagnostics[0].message);
    expect(projected.value.notes.length).toBeGreaterThan(2);
    const before = JSON.stringify(projected.value);
    const result = compileBusinessDiagramLayout(input(projected.value));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.diagnostics[0].message);
    const notes = result.value.elements.find((element) => element.id === 'panel-a:business:notes');
    expect(notes?.kind).toBe('text');
    if (notes?.kind !== 'text') throw new Error('Missing complete notes paragraph');
    for (const note of projected.value.notes) expect(notes.text).toContain(note);
    assertRails(projected.value);
    expect(JSON.stringify(projected.value)).toBe(before);
  });

  it('fits complete maximum legacy labels on four rows without cutting facts', () => {
    const label =
      'Source operating reserve remains unknown until the stated quarterly contribution is approved now';
    expect(label.length).toBe(L.maxLabelChars);
    expect(label.split(' ').length).toBeLessThanOrEqual(L.maxLabelWords);
    assertRails(
      projection({
        headings: [],
        notes: [],
        rows: Array.from({ length: 4 }, (_, index) => ({ id: `r${index}`, cells: [label] })),
      }),
    );
  });

  it('preserves long exact numeric bases as text, never rounded counters or invented comparisons', () => {
    assertRails(
      projection({
        rows: [
          {
            id: 'quantity',
            cells: [
              '1,234,567,890.12 USD',
              'per 10,000 source-stated participants per calendar quarter, denominator includes inactive accounts',
              'Unknown payout; committed amount is not paid cash',
            ],
          },
        ],
      }),
    );
  });

  it('bounds wide Unicode and supplementary glyphs conservatively', () => {
    assertRails(
      projection({
        headings: ['状態'],
        rows: [
          { id: 'wide', cells: ['承認待ち 条件付き 未払い'.repeat(4)] },
          { id: 'emoji', cells: ['🧮 🏦 🧾 未知 状態 条件付き'.repeat(4)] },
        ],
        notes: ['未知はゼロではない'],
      }),
    );
  });

  it('fits all seven content slots within the five-panel element reservation', () => {
    assertRails(
      projection({
        headings: ['Subject'],
        rows: Array.from({ length: 4 }, (_, index) => ({ id: `r${index}`, cells: ['Unknown'] })),
        notes: ['Conditional', 'Illustrative, not measured'],
      }),
    );
  });

  it('is deterministic, translation-only and does not mutate frozen input', () => {
    const p = projection();
    p.rows.forEach((row) => {
      Object.freeze(row.cells);
      Object.freeze(row);
    });
    Object.freeze(p.rows);
    Object.freeze(p.headings);
    Object.freeze(p.notes);
    Object.freeze(p);
    const before = JSON.stringify(p);
    expect(compileBusinessDiagramLayout(input(p))).toEqual(compileBusinessDiagramLayout(input(p)));
    const shifted = compileBusinessDiagramLayout({ ...input(p), panelX: 3000, panelId: 'panel-b' });
    expect(shifted.ok).toBe(true);
    if (shifted.ok)
      shifted.value.elements.forEach((el, i) => {
        const original = compile(p)[i];
        if (el.kind === 'text' && original.kind === 'text') {
          expect(el.x - original.x).toBe(1500);
          expect(el.y).toBe(original.y);
          expect(el.id).toMatch(/^panel-b:business:/);
        }
      });
    expect(JSON.stringify(p)).toBe(before);
  });

  it.each([
    projection({ rows: Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, cells: ['unknown'] })) }),
    projection({
      notes: Array(3).fill(
        'Unknown stated basis and contingent conditions remain unresolved '.repeat(7),
      ),
    }),
    projection({ headings: Array(9).fill('Unknown') }),
    projection({ rows: [{ id: 'a', cells: Array(9).fill('Unknown') }] }),
    projection({ rows: [{ id: 'a', cells: ['W'.repeat(96)] }] }),
    projection({ rows: [{ id: 'a', cells: ['🧮'.repeat(96)] }] }),
    projection({
      rows: Array.from({ length: 4 }, (_, i) => ({
        id: `${i}`,
        cells: Array(8).fill('Unknown basis and source-stated conditions remain unresolved'),
      })),
    }),
    projection({ rows: [{ id: 'a', cells: ['unknown\nqualifier'] }] }),
  ])('rejects overflow atomically with budget diagnostics, not truncated success', (p) => {
    const result = compileBusinessDiagramLayout(input(p));
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.diagnostics[0]).toMatchObject({
        code: 'budget',
        panelId: 'panel-a',
        repairable: true,
      });
    expect(result).not.toHaveProperty('value');
  });

  it.each([
    NaN,
    Infinity,
    -1,
    L.maxWorldWidth - G.panelWidth + 1,
  ])('rejects invalid world coordinates %s', (panelX) => {
    expect(compileBusinessDiagramLayout({ ...input(), panelX }).ok).toBe(false);
  });

  it('rejects nonfinite clocks and ambiguous row identities', () => {
    expect(compileBusinessDiagramLayout({ ...input(), revealAt: Infinity }).ok).toBe(false);
    expect(
      compileBusinessDiagramLayout(
        input(
          projection({
            rows: [
              { id: 'same', cells: ['A'] },
              { id: 'same', cells: ['B'] },
            ],
          }),
        ),
      ).ok,
    ).toBe(false);
  });
});
