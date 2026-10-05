import { describe, expect, it } from 'vitest';
import { sampleScaleLens } from '../motion';
import type { BusinessIdentity, BusinessStory } from '../types';
import { commercialIdentities, sampleCommercial } from './poses';
import type {
  BusinessReplicationScene,
  CommercialScene,
  CommercialStageState,
  ServiceLifecycleBlueprintScene,
} from './types';

// Typed scene facts for pure pose tests only; these do not prove source parsing.
const source = { fromWord: 0, toWord: 0 };
const story: BusinessStory = {
  setupAt: 0,
  actionAt: 1,
  responseAt: 3,
  checkAt: 5,
  resolveAt: 7,
  visualMode: 'diagram',
  label: 'Service inspection',
  subject: 'Studio',
  outcome: 'No success inferred',
  evidence: 'source-stated',
  factEvidence: { state: 'source-stated', label: 'Declared facts', source },
};
function identity(id: string): BusinessIdentity {
  return { id, label: id, source };
}
function lifecycle(
  booking: CommercialStageState,
  delivery: CommercialStageState,
): ServiceLifecycleBlueprintScene {
  return {
    ...story,
    kind: 'business-blueprint',
    preset: 'service-lifecycle',
    business: identity('business'),
    service: identity('service'),
    lead: { identity: identity('lead'), state: 'observed', source },
    booking: { identity: identity('booking'), state: booking, source },
    delivery: { identity: identity('delivery'), state: delivery, source },
  };
}
const replication: BusinessReplicationScene = {
  ...story,
  kind: 'business-replication',
  preset: 'shared-standard-local-context',
  business: identity('business'),
  standard: identity('standard'),
  units: [
    {
      identity: identity('north'),
      standardUse: { state: 'conditional', source },
      localDifference: { label: 'Local hours', state: 'source-stated', source },
    },
    {
      identity: identity('south'),
      standardUse: { state: 'unknown', source },
      localDifference: { label: 'Local demand', state: 'unknown', source },
    },
  ],
};
const scenes: readonly CommercialScene[] = [
  {
    ...story,
    kind: 'business-blueprint',
    preset: 'back-office',
    business: identity('business'),
    service: identity('service'),
    tasks: [
      { task: identity('intake'), state: 'conditional', source },
      { task: identity('review'), state: 'unknown', source },
    ],
  },
  {
    ...story,
    kind: 'business-blueprint',
    preset: 'service-slots',
    business: identity('business'),
    service: identity('service'),
    reserved: null,
    used: null,
    available: null,
  },
  lifecycle('observed', 'pending'),
  {
    ...story,
    kind: 'business-blueprint',
    preset: 'owner-dependency',
    business: identity('business'),
    founder: identity('founder'),
    task: identity('review'),
    dependency: { state: 'dependent', source },
  },
  {
    ...story,
    kind: 'business-blueprint',
    preset: 'service-modules',
    business: identity('business'),
    service: identity('service'),
    modules: [identity('intake'), identity('delivery')],
    compatibility: [
      { leftModuleId: 'intake', rightModuleId: 'delivery', state: 'unknown', source },
    ],
    repeatedOffering: null,
  },
  replication,
];
function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbers);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}

describe('commercial frame-driven poses', () => {
  it.each(
    scenes,
  )('$preset preserves facts and is finite and independent of seek order', (scene) => {
    const before = structuredClone(scene);
    const times = [-1, 0, 1 / 30, 1, 3, 5, 7, 8, 30];
    const expected = new Map(times.map((seconds) => [seconds, sampleCommercial(scene, seconds)]));
    for (const seconds of [...times, ...[...times].reverse(), 3, 0, 7]) {
      expect(sampleCommercial(scene, seconds)).toEqual(expected.get(seconds));
      expect(numbers(sampleCommercial(scene, seconds)).every(Number.isFinite)).toBe(true);
      expect(sampleCommercial({ ...scene, visualMode: 'hybrid' }, seconds)).toEqual(
        expected.get(seconds),
      );
    }
    for (const seconds of [NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
      expect(numbers(sampleCommercial(scene, seconds)).every(Number.isFinite)).toBe(true);
    }
    for (const seconds of [8, 30]) {
      expect(sampleCommercial(scene, seconds)).toEqual(sampleCommercial(scene, scene.resolveAt));
    }
    expect(scene).toEqual(before);
    expect(new Set(commercialIdentities(scene).map((entry) => entry.id)).size).toBe(
      commercialIdentities(scene).length,
    );
  });
  it('uses the existing scale-lens helper and never merges the two local identities', () => {
    for (const seconds of [0, 1, 2, 3, 5, 7, 8]) {
      const actual = sampleCommercial(replication, seconds);
      const expected = sampleScaleLens({ frame: seconds * 30, fps: 30, beats: replication }, [
        'north',
        'south',
      ]);
      expect(actual.localUnits).toEqual(expected.units);
      expect(actual.localLens).toBe(expected.lens);
      expect(actual.localUnits.map((entry) => entry.id)).toEqual(['north', 'south']);
      for (const entry of actual.localUnits) {
        expect(Math.abs(entry.x)).toBeLessThanOrEqual(0.5);
        expect(entry.opacity).toBeGreaterThanOrEqual(0);
        expect(entry.opacity).toBeLessThanOrEqual(1);
        expect(entry.scale).toBeGreaterThanOrEqual(0.75);
        expect(entry.scale).toBeLessThanOrEqual(1);
      }
    }
  });
  it.each([
    'pending',
    'conditional',
    'negative',
    'unknown',
  ] as const)('keeps %s delivery distinct from an observed booking and never accepts it', (state) => {
    const scene = lifecycle('observed', state);
    for (const seconds of [0, 1, 3, 5, 7, 8, 30]) {
      const pose = sampleCommercial(scene, seconds);
      expect(pose.booking?.state).toBe('observed');
      expect(pose.delivery?.state).toBe(state);
      expect(pose.delivery?.accepted).toBe(0);
    }
    expect(sampleCommercial(scene, 8).booking?.accepted).toBe(1);
  });
  it('does not infer a booking from separately observed delivery', () => {
    const pose = sampleCommercial(lifecycle('unknown', 'observed'), 8);
    expect(pose.booking).toMatchObject({ state: 'unknown', accepted: 0 });
    expect(pose.delivery).toMatchObject({ state: 'observed', accepted: 1 });
  });
  it('does not add lifecycle facts or a local lens to other blueprints', () => {
    for (const scene of scenes) {
      const pose = sampleCommercial(scene, 8);
      if (scene.kind !== 'business-blueprint' || scene.preset !== 'service-lifecycle') {
        expect(pose.booking).toBeNull();
        expect(pose.delivery).toBeNull();
      }
      if (scene.kind !== 'business-replication') {
        expect(pose.localUnits).toEqual([]);
        expect(pose.localLens).toBe(0);
      }
    }
  });
  it('removes a founder dependency only for an explicit removed source state', () => {
    const base = scenes.find(
      (scene) => scene.kind === 'business-blueprint' && scene.preset === 'owner-dependency',
    );
    if (base?.kind !== 'business-blueprint' || base.preset !== 'owner-dependency')
      throw new Error('missing owner-dependency pose case');
    for (const state of ['dependent', 'conditional', 'negative', 'unknown'] as const) {
      expect(
        sampleCommercial({ ...base, dependency: { state, source } }, 8).dependencyRemoval,
      ).toBe(0);
    }
    expect(
      sampleCommercial({ ...base, dependency: { state: 'removed', source } }, 8).dependencyRemoval,
    ).toBe(1);
  });
});
