import { describe, expect, it } from 'vitest';
import { diagramPose } from '../../diagrams/motion';
import { businessTextWidth } from '../text-width';
import {
  ORGANIZATION_RESOURCE_FIXTURES,
  ORGANIZATION_SOURCE_FIXTURES,
  ORGANIZATION_SOURCE_NEGATIVES,
  organizationFixture,
  organizationFixtureWindow,
  parseOrganizationFixture,
} from './fixtures';
import {
  ORGANIZATION_TABLE,
  organizationPageAt,
  organizationPageDuration,
  organizationPresentation,
  organizationReadingStart,
  organizationRowLines,
} from './presentation';

const modes = ORGANIZATION_SOURCE_FIXTURES.flatMap((fixture) =>
  (fixture.id === 'OP-31' ? ['diagram'] : ['diagram', 'hybrid']).map((mode) => ({
    id: fixture.id,
    mode,
    fixture,
  })),
);

describe('organization production-source specimens', () => {
  it.each(
    ORGANIZATION_RESOURCE_FIXTURES,
  )('$fixture.id $name is source-accepted at its coexisting resource boundary', ({
    fixture,
    entities,
    relationships,
    holds,
  }) => {
    const { scene, issues } = parseOrganizationFixture(fixture);
    if (!scene) throw new Error(issues.join('; '));
    expect(issues).toEqual([]);
    let entityCount = 0,
      relationshipCount = 0;
    let states: string[] = [];
    switch (scene.preset) {
      case 'federated-units':
        entityCount = 1 + scene.units.length + scene.tasks.length;
        relationshipCount = entityCount - 1 + scene.responsibilities.length;
        states = scene.responsibilities.map((entry) => entry.state);
        break;
      case 'decision-rights':
        entityCount = 1 + scene.units.length + scene.rights.length;
        states = scene.rights.flatMap((right) => [
          right.permission,
          ...(right.escalation ? [right.escalation.state] : []),
        ]);
        relationshipCount = entityCount - 1 + states.length;
        break;
      case 'rollout-rings':
        entityCount = 2 + scene.rings.length;
        relationshipCount = entityCount + scene.rings.length;
        states = scene.rings.map((ring) => ring.state);
        break;
      case 'legacy-boundaries':
        entityCount = 4;
        relationshipCount = 4;
        states = [scene.boundary.state];
        break;
      case 'merge-identities':
        entityCount = 2 + scene.systems.length + scene.records.length;
        relationshipCount = entityCount - 1 + scene.systems.length + scene.collisions.length;
        states = scene.collisions.map((collision) => collision.state);
        break;
      case 'stated-chargeback':
        entityCount = 3 + scene.units.length;
        states = [
          scene.total.state,
          ...scene.allocations.map((allocation) => allocation.state),
          scene.remainder.state,
        ];
        relationshipCount = entityCount - 1 + states.length;
        break;
      case 'declared-tool-boundaries':
        entityCount = 1 + scene.units.length + scene.workers.length + scene.tools.length;
        relationshipCount = entityCount - 1 + scene.tools.length + scene.uses.length;
        states = [...scene.tools.map((tool) => tool.state), ...scene.uses.map((use) => use.state)];
        break;
    }
    const holdCount = states.filter(
      (state) =>
        ![
          'declared',
          'permitted',
          'configured',
          'observed',
          'matched',
          'allowed',
          'source-stated',
        ].includes(state),
    ).length;
    expect([entityCount, relationshipCount, holdCount]).toEqual([entities, relationships, holds]);
    expect(entityCount).toBeLessThanOrEqual(8);
    expect(relationshipCount).toBeLessThanOrEqual(12);
    expect(holdCount).toBeLessThanOrEqual(4);
    expect(scene.setupAt).toBe(
      Math.max(
        fixture.words[fixture.raw.setupWord as number].start,
        fixture.window.startTime + 0.3,
      ),
    );
    expect(scene.resolveAt).toBe(fixture.words[fixture.raw.resolveWord as number].start);
  });
  it('exports exactly one dedicated primary source per recipe', () => {
    expect(ORGANIZATION_SOURCE_FIXTURES.map((fixture) => fixture.id)).toEqual([
      'OP-25',
      'OP-26',
      'OP-27',
      'OP-28',
      'OP-29',
      'OP-30',
      'OP-31',
    ]);
    expect(new Set(ORGANIZATION_SOURCE_FIXTURES.map((fixture) => fixture.raw.subject)).size).toBe(
      7,
    );
    expect(ORGANIZATION_SOURCE_NEGATIVES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(ORGANIZATION_SOURCE_NEGATIVES.map((negative) => negative.recipeId)).size).toBe(
      7,
    );
  });

  it.each(modes)('$id accepts $mode and settles every complete page in its real planner window', ({
    fixture,
    mode,
  }) => {
    const copy = structuredClone(fixture);
    copy.raw.visualMode = mode;
    const before = structuredClone(copy);
    const { scene, issues } = parseOrganizationFixture(copy);
    expect(issues).toEqual([]);
    expect(scene).not.toBeNull();
    expect(copy).toEqual(before);
    if (!scene) throw new Error('Expected primary fixture');
    const window = organizationFixtureWindow(copy.words);
    expect(window).toEqual(copy.window);
    expect(window.startTime).toBeCloseTo(copy.words[0].start - 0.25);
    expect(window.endTime).toBeCloseTo(copy.words[copy.words.length - 1].end + 0.35);
    expect(window.endTime - window.startTime).toBeGreaterThanOrEqual(5);
    expect(window.endTime - window.startTime).toBeLessThanOrEqual(12);
    expect(window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
    expect(
      [scene.setupAt, scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt].every(
        (at, index, beats) => index === 0 || at > beats[index - 1],
      ),
    ).toBe(true);
    const presentation = organizationPresentation(scene);
    const first = organizationReadingStart(scene);
    const duration = organizationPageDuration(scene, presentation.pages.length);
    expect(duration).toBeGreaterThanOrEqual(1.5);
    expect(presentation.pages.flatMap((page) => page.rows)).toEqual(presentation.rows);
    expect(presentation.title).not.toContain('—');
    expect(ORGANIZATION_TABLE.font).toBe(24);
    presentation.pages.forEach((page, index) => {
      const start = first + index * duration;
      for (const at of [start + 0.001, start + 1.5 - 0.001]) {
        const pose = diagramPose(at, scene);
        expect(pose.setup).toBe(1);
        if (mode === 'hybrid') expect(pose.diagramOpacity).toBe(1);
        expect(organizationPageAt(scene, at)).toBe(index);
      }
      expect(page.height).toBeLessThanOrEqual(
        ORGANIZATION_TABLE.rowBottom - ORGANIZATION_TABLE.rowTop,
      );
      expect(page.heights).toHaveLength(page.rows.length);
      for (const row of page.rows) {
        const cells = organizationRowLines(row);
        expect(cells.flat().join(' ')).not.toContain('…');
        cells.forEach((lines, column) => {
          expect(lines.join('').replace(/\s/gu, '')).toBe(row.cells[column].replace(/\s/gu, ''));
          for (const line of lines)
            expect(businessTextWidth(line, ORGANIZATION_TABLE.font)).toBeLessThanOrEqual(
              ORGANIZATION_TABLE.railWidths[column],
            );
        });
      }
    });
    expect(organizationPageAt(scene, scene.resolveAt)).toBe(presentation.pages.length - 1);
    expect(organizationPageAt(scene, window.endTime)).toBe(presentation.pages.length - 1);
    expect(organizationPageAt(scene, Number.NaN)).toBe(0);
  });

  it.each(ORGANIZATION_SOURCE_NEGATIVES)('$recipeId refuses source-specific negative: $name', ({
    fixture,
  }) => {
    const before = structuredClone(fixture);
    const { scene, issues } = parseOrganizationFixture(fixture);
    expect(scene).toBeNull();
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.length).toBeLessThanOrEqual(4);
    expect(fixture).toEqual(before);
  });

  it('wraps worst-wide and unknown-glyph labels inside the unchanged pixel rails without losing text', () => {
    expect(ORGANIZATION_TABLE.x).toEqual([24, 296, 722]);
    expect(ORGANIZATION_TABLE.railWidths).toEqual([252, 402, 206]);
    for (const glyph of ['W', 'M', '界']) {
      const cells = [
        glyph.repeat(42),
        `${glyph.repeat(42)} named source condition ${glyph.repeat(42)}`,
        glyph.repeat(42),
      ] as const;
      organizationRowLines({ id: 'wide-label', cells, state: 'unknown' }).forEach(
        (lines, column) => {
          expect(lines.join('').replace(/\s/gu, '')).toBe(cells[column].replace(/\s/gu, ''));
          for (const line of lines)
            expect(businessTextWidth(line, 24)).toBeLessThanOrEqual(
              ORGANIZATION_TABLE.railWidths[column],
            );
        },
      );
    }
  });

  it('preserves configured, pending, paused and rolled-back dates and distinct units together', () => {
    const { scene } = parseOrganizationFixture(organizationFixture('OP-27'));
    if (scene?.preset !== 'rollout-rings') throw new Error('Expected rollout');
    expect(scene.rings.map((ring) => [ring.unit.id, ring.date, ring.state])).toEqual([
      ['elm', 'July', 'configured'],
      ['oak', 'August', 'pending'],
      ['ash', 'September', 'paused'],
      ['yew', 'October', 'rolled-back'],
    ]);
    const rows = organizationPresentation(scene).rows;
    for (const ring of scene.rings)
      expect(rows.find((row) => row.id === `ring:${ring.unit.id}`)?.cells.join(' ')).toContain(
        ring.date,
      );
  });

  it('keeps declaration status separate from informal worker use and configured unit use', () => {
    const { scene } = parseOrganizationFixture(organizationFixture('OP-31'));
    if (scene?.preset !== 'declared-tool-boundaries') throw new Error('Expected tools');
    expect(scene.tools.map((tool) => tool.state)).toEqual(['unapproved', 'allowed']);
    expect(scene.uses.map((use) => [use.toolId, use.workerId, use.context, use.state])).toEqual([
      ['slate', 'mira', 'informal', 'observed'],
      ['pen', null, 'declared', 'configured'],
    ]);
    const text = organizationPresentation(scene)
      .rows.flatMap((row) => row.cells)
      .join(' ');
    expect(text).toContain('Mira in Bay');
    expect(text).toContain('not approval or telemetry');
  });

  it('retains literal provenance and unresolved collision without a replacement identity', () => {
    const { scene } = parseOrganizationFixture(organizationFixture('OP-29'));
    if (scene?.preset !== 'merge-identities') throw new Error('Expected reconciliation');
    expect(
      scene.records.map((record) => [record.identity.id, record.sourceId, record.sourceSystemId]),
    ).toEqual([
      ['amber', 'A17', 'east'],
      ['bronze', 'B91', 'west'],
    ]);
    expect(scene.collisions[0].state).toBe('unresolved');
    const rows = organizationPresentation(scene).rows;
    expect(rows.find((row) => row.id === 'record:amber')?.cells[1]).toContain('Source ID A17');
    expect(rows.find((row) => row.id === 'record:bronze')?.cells[1]).toContain('Source ID B91');
  });

  it('shows the complete monetary basis on every quantity row, including separate pages', () => {
    const { scene, issues } = parseOrganizationFixture(organizationFixture('OP-30'));
    expect(issues).toEqual([]);
    if (scene?.preset !== 'stated-chargeback') throw new Error('Expected chargeback');
    const presentation = organizationPresentation(scene);
    expect(presentation.pages.length).toBeGreaterThan(1);
    for (const row of presentation.rows.filter((row) => row.id !== 'service')) {
      for (const essential of ['Treasury', 'Hub', 'Sol', 'unit USD', 'July', 'per 10 requests'])
        expect(row.cells.join(' ')).toContain(essential);
    }
    expect(presentation.rows.find((row) => row.id === 'remainder')?.cells[1]).toContain(
      '20.01 USD',
    );
  });
});
