import { describe, expect, it } from 'vitest';
import { capitalMoneyLabel } from '../../remotion/compositions/explainer/business/capital/presentation';
import { businessSourceFixtures } from '../../remotion/compositions/explainer/business/source-fixtures';
import { parseBusinessExplanationSource } from './business-adapters';
import { projectEconomicRights } from './business-rights-projection';

const fixtures = businessSourceFixtures().filter(
  (fixture) => fixture.id === 'OP-57' || fixture.id === 'OP-64',
);
describe('complete rights-role tables', () => {
  it.each(
    fixtures,
  )('$fixtureId preserves every source-native right, amount, basis and condition', (fixture) => {
    const result = parseBusinessExplanationSource(
      { sourceVersion: 2, recipe: fixture.id, sourceChoices: fixture.raw, identityLinks: [] },
      fixture.words,
      { clipStart: 0, clipEnd: 90 },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    const scene = result.value.planned.scene;
    if (scene.kind !== 'economic-rights') throw new Error('Wrong native source');
    const original = JSON.stringify(scene);
    const table = projectEconomicRights(scene);
    const visible = [
      ...table.headings,
      ...table.rows.flatMap((row) => row.cells),
      ...table.notes,
    ].join(' ');
    for (const text of [
      scene.company.label,
      scene.holder.label,
      scene.claim.label,
      scene.claimEvidence.label,
    ])
      expect(visible).toContain(text);
    if (scene.preset === 'claim-asset-distinction') {
      for (const text of [
        scene.transfer.label,
        scene.transfer.state,
        scene.liquidity.label,
        scene.liquidity.state,
        scene.period,
      ])
        expect(visible).toContain(text);
    } else {
      expect(visible).toContain(`${scene.ownership.shares}/${scene.ownership.total}`);
      expect(visible).toContain(`${scene.ownership.percent}%`);
      for (const text of [
        scene.control.label,
        scene.priority.label,
        scene.priority.state,
        capitalMoneyLabel(scene.payout),
        ...[scene.ownership.basis, scene.payout.basis].flatMap((basis) => [
          basis.population,
          basis.unit,
          basis.period,
          String(basis.denominator ?? 'unknown'),
        ]),
      ])
        expect(visible).toContain(text);
      expect(table.notes).toContain('Shares ≠ control ≠ payout.');
    }
    expect(JSON.stringify(scene)).toBe(original);
  });
});
