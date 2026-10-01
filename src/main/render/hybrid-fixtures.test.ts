import { describe, expect, it } from 'vitest';
import {
  hybridChainFixture,
  hybridFixtures,
  parseHybridFixture,
} from '../../../scripts/explainer-stills/hybrid-e2e.fixture';
import { parsePlanWithDiagnostics } from '../ai/explainer-scenes';
import { groupPlannedScenes } from './explainer-scenes';

describe('persisted authored hybrid fixture manifest', () => {
  const fixtures = hybridFixtures();
  for (const fixture of fixtures)
    it(`parses exact persisted ${fixture.name}`, () => {
      expect(parseHybridFixture(fixture).scene).toEqual(fixture.scene);
    });
  it('uses a real mixed transcript with unchanged baseline coverage and a genuine transition', () => {
    const f = hybridChainFixture(fixtures);
    for (const options of [{}, { profile: 'baseline-policy-codex-v1' as const }]) {
      const result = parsePlanWithDiagnostics(f.raw, f.words, f.bounds, options);
      expect(result.rejected).toEqual([]);
      expect(result.accepted).toHaveLength(7);
      const coverage = result.accepted.reduce((n, scene) => n + scene.endTime - scene.startTime, 0);
      expect(coverage / f.bounds.maxEnd).toBeLessThanOrEqual(0.55);
      expect(groupPlannedScenes(result.accepted)).toHaveLength(6);
      expect(result.accepted[2].chained).toBe(true);
    }
  });
});
