import { describe, expect, it } from 'vitest';
import { COMMERCIAL_SOURCE_FIXTURES } from '../../remotion/compositions/explainer/business/commercial/fixtures';
import { makeParseContext } from './kind-spec';
import { BUSINESS_BLUEPRINT_SPEC, BUSINESS_REPLICATION_SPEC } from './kinds-business-commercial';

describe('concrete commercial local specifications', () => {
  it.each(
    COMMERCIAL_SOURCE_FIXTURES,
  )('$fixtureId uses its concrete parser and emits only neutral source-beat cues', (fixture) => {
    const context = makeParseContext(fixture.words, fixture.window);
    const scene =
      fixture.raw.kind === 'business-replication'
        ? BUSINESS_REPLICATION_SPEC.parse(fixture.raw, context)
        : BUSINESS_BLUEPRINT_SPEC.parse(fixture.raw, context);
    expect(context.issues).toEqual([]);
    if (!scene) throw new Error(`rejected authored ${fixture.fixtureId}`);
    const cues =
      scene.kind === 'business-replication'
        ? BUSINESS_REPLICATION_SPEC.cues(scene)
        : BUSINESS_BLUEPRINT_SPEC.cues(scene);
    expect(cues.map((cue) => cue.at)).toEqual([
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
    ]);
    expect(new Set(cues.map((cue) => cue.at)).size).toBe(5);
    expect(cues.every((cue) => Number.isFinite(cue.at) && (cue.gain ?? 1) <= 0.25)).toBe(true);
    expect(cues.map((cue) => cue.kind)).not.toContain('stamp');
    const badContext = makeParseContext(fixture.words, fixture.window);
    const raw = { ...fixture.raw, actorOverride: 'not allowed' };
    const rejected =
      fixture.raw.kind === 'business-replication'
        ? BUSINESS_REPLICATION_SPEC.parse(raw, badContext)
        : BUSINESS_BLUEPRINT_SPEC.parse(raw, badContext);
    expect(rejected).toBeNull();
    expect(badContext.issues.length).toBeGreaterThan(0);
  });
  it('advertises all concrete presets without inventing a variety family or raising bounds', () => {
    expect(BUSINESS_BLUEPRINT_SPEC.family).toBe('framework');
    expect(BUSINESS_REPLICATION_SPEC.family).toBe('process');
    for (const preset of [
      'back-office',
      'service-slots',
      'service-lifecycle',
      'owner-dependency',
      'service-modules',
    ]) {
      expect(BUSINESS_BLUEPRINT_SPEC.schema).toContain(preset);
    }
    expect(BUSINESS_REPLICATION_SPEC.schema).toContain('shared-standard-local-context');
    for (const spec of [BUSINESS_BLUEPRINT_SPEC, BUSINESS_REPLICATION_SPEC]) {
      expect(spec.durationSec).toEqual([5, 12]);
      expect(spec.layouts).toEqual(['stack', 'stack-flipped', 'takeover', 'pip', 'over']);
      expect(spec.limits).toContain('<=8');
      expect(spec.limits).toContain('<=12');
    }
  });
});
