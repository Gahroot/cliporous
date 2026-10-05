import { describe, expect, it } from 'vitest';
import { BUSINESS_ALTERNATIVE_SCOPE } from '../../remotion/compositions/explainer/business/decisions/alternative-presentation';
import { businessSourceFixtures } from '../../remotion/compositions/explainer/business/source-fixtures';
import { parseLongformSceneSpec } from '../explainer-scenes';
import {
  type BorrowedPanelContent,
  projectBusinessAlternatives,
  projectCapitalDependency,
} from './business-borrowed-projection';

const fixtures = businessSourceFixtures().filter((f) => f.id === 'OP-58' || f.id === 'OP-75');
function visible(content: BorrowedPanelContent) {
  return [...content.headings, ...content.rows.flatMap((row) => row.cells), ...content.notes].join(
    ' ',
  );
}
describe('borrowed source-native concise content', () => {
  it('covers both recipes in both native visual modes', () => {
    expect(fixtures).toHaveLength(4);
  });
  it.each(fixtures)('$fixtureId preserves typed facts through the concrete parser', (fixture) => {
    const planned = parseLongformSceneSpec(fixture.raw, fixture.words, {
      clipStart: 0,
      clipEnd: 90,
    });
    expect(planned).not.toBeNull();
    if (!planned) throw new Error('Fixture rejected');
    const scene = planned.scene;
    const before = structuredClone(scene);
    let content: BorrowedPanelContent;
    if (scene.kind === 'portfolio-exposure' && scene.dependencyLens) {
      content = projectCapitalDependency(scene);
      const text = visible(content);
      expect(content.notes[0]).toBe(`Common driver: ${scene.exposure.label}.`);
      scene.funds.forEach((fund, index) => {
        const firm = scene.dependencyLens?.firms.find((entry) => entry.fundId === fund.id);
        if (!firm) throw new Error('Missing firm');
        expect(content.rows[index]).toEqual({
          id: `${fund.id}:holds:${firm.identity.id}`,
          cells: [
            `Fund ${fund.label} holds → Company ${firm.identity.label} depends on → common driver`,
          ],
        });
      });
      for (const fact of [
        'maintain asset ownership and economic claim records',
        'no correlation, risk, numeric weights or payout inferred',
        'inspection only, not money or rights movement',
        'Other exposures: not represented',
      ])
        expect(text).toContain(fact);
    } else if (scene.kind === 'possible-futures' && scene.businessAlternatives) {
      content = projectBusinessAlternatives(scene);
      const lens = scene.businessAlternatives;
      const b = lens.baseline;
      expect(content.notes[0]).toBe(
        `Actual baseline: ${b.subject.label}; ${b.identity.label}; period: ${b.period}; revision: ${b.revision}.`,
      );
      expect(content.notes).toContain(`Evidence: ${lens.evidence.label}; ${lens.evidence.state}.`);
      expect(content.notes).toContain(BUSINESS_ALTERNATIVE_SCOPE);
      expect(content.notes).toContain(scene.uncertainty);
      expect(
        content.notes.includes(
          'Baseline subject maintains these illustrative operating-unit records.',
        ),
      ).toBe(lens.native !== null);
      scene.alternatives.forEach((alternative, index) => {
        const record = lens.records.find((entry) => entry.alternativeId === alternative.id);
        if (!record) throw new Error('Missing record');
        expect(record).toMatchObject({
          baselineId: b.identity.id,
          subjectId: b.subject.id,
          period: b.period,
          revision: b.revision,
        });
        expect(content.rows[index]).toEqual({
          id: `record:${record.identity.id}`,
          cells: [
            alternative.label,
            record.identity.label,
            alternative.change,
            alternative.qualifier,
          ],
        });
      });
      // No independent native claim is manufactured when its literal evidence is absent.
      const withoutNative = structuredClone(scene);
      if (!withoutNative.businessAlternatives) throw new Error('Missing lens');
      withoutNative.businessAlternatives.native = null;
      expect(visible(projectBusinessAlternatives(withoutNative))).not.toContain(
        'Subject maintains',
      );
    } else throw new Error('Unexpected fixture kind');
    if (scene.condition !== undefined)
      expect(content.notes).toContain(`Condition: ${scene.condition}`);
    expect(scene).toEqual(before);
    expect(content.rows.length).toBeLessThanOrEqual(4);
    for (const row of content.rows) expect(row.cells.join(' · ').length).toBeLessThanOrEqual(512);
    expect(
      [...visible(content)].every(
        (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      ),
    ).toBe(true);
    console.info(`${fixture.fixtureId}: ${visible(content).split(/\s+/u).length} visible words`);
  });
});
