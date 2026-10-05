import { describe, expect, it } from 'vitest';
import { taskOwnership } from '../../../../../ai/explainer/business-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { labelLines } from '../../diagrams/layout';
import { parseWorkFixture, WORK_SOURCE_FIXTURES } from './fixtures';
import { workIdentities } from './identities';
import { layoutWorkTable, workPresentationFits, workTable } from './presentation';
import type { BusinessWorkScene } from './types';

function accepted(id: string) {
  const fixture = WORK_SOURCE_FIXTURES.find((entry) => entry.id === id);
  if (!fixture) throw new Error(`Missing ${id}`);
  const { scene, issues } = parseWorkFixture(fixture);
  if (!scene) throw new Error(`${id}: ${issues.join('; ')}`);
  return scene;
}

describe('work factual text projection and bounded natural layout', () => {
  it.each(
    WORK_SOURCE_FIXTURES,
  )('$id retains its source table inside the authored body', (fixture) => {
    const scene = accepted(fixture.id);
    const table = workTable(scene);
    const layout = layoutWorkTable(table);
    expect(workPresentationFits(scene)).toBe(true);
    expect(layout.height).toBeLessThanOrEqual(478);
    expect(layout.fontSize).toBeGreaterThanOrEqual(22);
    expect(new Set(table.rows.map((row) => row.id)).size).toBe(table.rows.length);
    for (const [index, row] of table.rows.entries()) {
      expect(row.cells.length).toBe(table.headings.length);
      expect(layout.rowY[index]).toBeGreaterThanOrEqual(60);
      for (const cell of row.cells) {
        const lines = labelLines(cell, layout.columns);
        expect(lines.join('').replace(/\s/gu, '')).toBe(cell.replace(/\s/gu, ''));
        expect(lines.length * layout.fontSize * 1.2).toBeLessThan(layout.rowHeights[index]);
      }
    }
    if (scene.kind === 'task-map' && scene.preset === 'capability-boundary') {
      expect(scene.visualMode).toBe('diagram');
    } else {
      const otherMode: BusinessWorkScene = {
        ...scene,
        visualMode: scene.visualMode === 'diagram' ? 'hybrid' : 'diagram',
      };
      expect(workTable(otherMode)).toEqual(table);
    }
  });
  it('keeps all three task roles separate and explicit no-approval distinct', () => {
    const scene = accepted('OP-04');
    expect(workTable(scene).headings).toEqual(['Task', 'Performer', 'Approver', 'Accountable']);
    if (scene.kind !== 'task-map' || scene.preset !== 'responsibility')
      throw new Error('Wrong fixture');
    const words =
      'Ada performs Review. Review requires no approval. Cy remains accountable for Review.'
        .split(' ')
        .map((text, index) => ({ text, start: index * 0.2, end: index * 0.2 + 0.1 }));
    const ctx = makeParseContext(words, {
      startWord: 0,
      endWord: words.length - 1,
      startTime: 0,
      endTime: 8,
    });
    const noApproval = taskOwnership(
      {
        ...scene.ownership[0],
        approverId: null,
        source: { fromWord: 0, toWord: words.length - 1 },
      },
      workIdentities(scene),
      ctx,
    );
    if (!noApproval) throw new Error(ctx.issues.join('; '));
    expect(workTable({ ...scene, ownership: [noApproval] }).rows[0].cells[2]).toBe('No approval');
  });
  it('unknown review capacity supplies no number, unit or fabricated period', () => {
    const table = workTable(accepted('OP-07'));
    expect(table.notes).toContain('Review capacity: not stated');
  });
  it('rejects excess content instead of lowering font size or truncating claims', () => {
    const table = {
      headings: ['Actor', 'Task', 'State'],
      rows: Array.from({ length: 8 }, (_, index) => ({
        id: `row-${index}`,
        cells: ['W'.repeat(28), 'M'.repeat(28), 'unknown'],
      })),
      notes: ['W'.repeat(96)],
    };
    const layout = layoutWorkTable(table);
    expect(layout.height).toBeGreaterThan(478);
    expect(layout.fontSize).toBe(24);
    expect(labelLines(table.rows[0].cells[0], layout.columns).join('')).toBe('W'.repeat(28));
  });
});
