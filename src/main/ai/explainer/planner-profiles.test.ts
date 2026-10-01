import { describe, expect, it } from 'vitest';
import {
  EVALUATION_DEFAULT_PROFILE,
  EVALUATION_PROFILES,
  getPlannerProfile,
  PRODUCTION_PLANNER_PROFILE,
} from './planner-profiles';
import { createPlanningDiagnostics } from './planning-diagnostics';

describe('versioned planner profiles and diagnostics', () => {
  it('separates experiment profiles from production selection', () => {
    expect(EVALUATION_PROFILES.map((p) => p.id)).toEqual([
      'baseline-policy-codex-v1',
      'content-led-codex-v1',
      'semantic-variety-codex-v1',
    ]);
    expect(PRODUCTION_PLANNER_PROFILE).toBe('content-led-codex-v1');
    expect(EVALUATION_DEFAULT_PROFILE).toBeNull();
    expect(getPlannerProfile('not-a-profile')).toBeUndefined();
    expect(Object.isFrozen(EVALUATION_PROFILES[0])).toBe(true);
  });
  it('records bounded events with counts and IDs, never raw prompt fields', () => {
    const diagnostics = createPlanningDiagnostics();
    for (let i = 0; i < 2000; i++)
      diagnostics.emit({
        stage: 'policy',
        action: 'removed',
        reason: 'coverage-limit',
        kind: 'hero',
        index: i,
      });
    expect(diagnostics.events.length).toBeLessThanOrEqual(512);
    expect(diagnostics.dropped()).toBeGreaterThan(0);
  });
});
