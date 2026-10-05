import { describe, expect, it } from 'vitest';
import {
  parseCapacityMapScene,
  parseOperatingLineageScene,
} from '../../../../../ai/explainer/business-infrastructure-contract';
import type { Rec } from '../../../../../ai/explainer/kind-spec';
import { businessRecipe } from '../catalog';
import {
  INFRASTRUCTURE_ADDITIONAL_SOURCE_FIXTURES,
  INFRASTRUCTURE_NO_NATIVE_SOURCE_FIXTURES,
  INFRASTRUCTURE_SOURCE_FIXTURES,
  type InfrastructureSourceFixture,
  infrastructureSourceContext,
  infrastructureSourceWindow,
} from './fixtures';
import {
  infrastructureAssets,
  infrastructureKey,
  infrastructureRecipeId,
  sampleInfrastructure,
} from './poses';
import { infrastructureIdentities } from './presentation';
import type { InfrastructureScene } from './types';

const all = [...INFRASTRUCTURE_SOURCE_FIXTURES, ...INFRASTRUCTURE_ADDITIONAL_SOURCE_FIXTURES];
function parsed(fixture: InfrastructureSourceFixture): InfrastructureScene {
  const ctx = infrastructureSourceContext(fixture),
    raw: Rec = fixture.raw;
  const scene =
    raw.kind === 'capacity-map'
      ? parseCapacityMapScene(raw, ctx)
      : parseOperatingLineageScene(raw, ctx);
  if (!scene) throw new Error(ctx.issues.join('; '));
  return scene;
}
function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbers);
  return value !== null && typeof value === 'object' ? Object.values(value).flatMap(numbers) : [];
}
function fixture(id: string) {
  const found = all.find((f) => f.fixtureId === id);
  if (!found) throw new Error(`Missing ${id}`);
  return found;
}
describe('infrastructure pure source-gated authored poses', () => {
  it.each(
    all,
  )('$fixtureId is finite, immutable, repeatable at ALL source frames, backwards/shuffled and settled for the whole final hold', (source) => {
    const scene = parsed(source),
      before = structuredClone(scene),
      win = infrastructureSourceWindow(source);
    const times = [
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
      win.endTime,
      ...Array.from({ length: Math.ceil((win.endTime - win.startTime) * 30) + 1 }, (_, i) =>
        Math.min(win.endTime, win.startTime + i / 30),
      ),
    ];
    const snapshots = new Map<number, ReturnType<typeof sampleInfrastructure>>();
    for (const t of times) {
      const pose = sampleInfrastructure(scene, t);
      expect(numbers(pose).every(Number.isFinite)).toBe(true);
      snapshots.set(t, pose);
    }
    for (const t of [...times].reverse())
      expect(sampleInfrastructure(scene, t)).toEqual(snapshots.get(t));
    for (const t of [...times.filter((_, i) => i % 2), ...times.filter((_, i) => !(i % 2))])
      expect(sampleInfrastructure(scene, t)).toEqual(snapshots.get(t));
    for (let t = scene.resolveAt; t <= win.endTime; t += 1 / 30)
      expect(sampleInfrastructure(scene, t)).toEqual(sampleInfrastructure(scene, scene.resolveAt));
    expect(sampleInfrastructure(scene, win.endTime)).toEqual(
      sampleInfrastructure(scene, scene.resolveAt),
    );
    for (const t of [NaN, Infinity, -Infinity, -1])
      expect(numbers(sampleInfrastructure(scene, t)).every(Number.isFinite)).toBe(true);
    expect(scene).toEqual(before);
    expect(sampleInfrastructure(scene, scene.resolveAt - 1e-8).diagram.resolve).toBe(0);
    expect(sampleInfrastructure(scene, scene.resolveAt).diagram.resolve).toBe(1);
  });
  it.each(
    INFRASTRUCTURE_SOURCE_FIXTURES,
  )('$id binds literal frozen-catalog assets to ONLY actual source identities', (source) => {
    const scene = parsed(source),
      recipe = businessRecipe(scene.kind, scene.preset),
      assets = infrastructureAssets(scene);
    expect(recipe?.id).toBe(infrastructureRecipeId(scene));
    expect(assets.map((a) => a.asset).sort()).toEqual([...(recipe?.assets ?? [])].sort());
    const identities = infrastructureIdentities(scene);
    for (const asset of assets) expect(identities.some((i) => i.id === asset.id)).toBe(true);
    const pose = sampleInfrastructure(scene, scene.resolveAt);
    expect(pose.identities.map((i) => i.id)).toEqual(identities.map((i) => i.id));
    expect(new Set(pose.identities.map((i) => i.key)).size).toBe(identities.length);
    for (const identity of identities)
      expect(
        pose.identities.some((i) => i.key === infrastructureKey(scene, 'identity', identity.id)),
      ).toBe(true);
  });
  it('M12 capacity shares use ONLY observed same-basis quantities; known conditional amounts stay immutable and never fill', () => {
    const scene = parsed(fixture('OP-35:conditional'));
    if (scene.preset !== 'installed-used-reserved') throw new Error('Missing capacity');
    const final = sampleInfrastructure(scene, scene.resolveAt);
    expect(final.shares.find((s) => s.id === 'used')).toMatchObject({
      value: 4,
      state: 'conditional',
      weight: 0,
    });
    expect(final.shares.find((s) => s.id === 'reserved')?.weight).toBe(2 / 10);
    expect(final.clamp.gate).toBe(0);
    expect(final.latency).toBeNull();
  });
  it('M12 financing, power and cooling stay independent; money alone does not satisfy the gate', () => {
    const scene = parsed(fixture('OP-65:negative')),
      pose = sampleInfrastructure(scene, scene.resolveAt);
    expect(pose.readiness).toEqual({ money: true, power: false, cooling: false });
    expect(pose.clamp.state).toBe('blocked');
    expect(pose.clamp.gate).toBe(0);
    const conditional = sampleInfrastructure(parsed(fixture('OP-65:conditional')), scene.resolveAt);
    expect(conditional.readiness).toEqual({ money: true, power: false, cooling: false });
    expect(conditional.clamp.gate).toBe(0);
  });
  it('M12 queue limits retain exact 6-vs-4 request facts and never imply completed inference', () => {
    const scene = parsed(fixture('OP-66:source-stated')),
      pose = sampleInfrastructure(scene, scene.resolveAt);
    expect(pose.queue).toEqual({ queued: 6, capacity: 4, observed: true });
    expect(pose.clamp.state).toBe('blocked');
    expect(pose.clamp.gate).toBe(0);
    expect(pose.transition).toBeNull();
    expect(
      sampleInfrastructure(parsed(fixture('OP-66:conditional')), scene.resolveAt).queue,
    ).toEqual({ queued: 6, capacity: 4, observed: false });
  });
  it('M03 focuses processing qualification without changing boundaries or claiming compliance', () => {
    const scene = parsed(fixture('OP-68:conditional:primary'));
    expect(sampleInfrastructure(scene, scene.actionAt).focus.every((f) => f.focus === 0)).toBe(
      true,
    );
    expect(
      sampleInfrastructure(scene, scene.resolveAt).focus.find((f) => f.id === 'processing')?.focus,
    ).toBe(1);
    expect(sampleInfrastructure(scene, scene.resolveAt).transition).toBeNull();
  });
  it.each([
    'pending',
    'blocked',
    'conditional',
    'unknown',
    'completed',
  ])('M09 %s provider transition connects ONLY when explicitly completed', (state) => {
    const scene = parsed(fixture(`OP-69:${state}`));
    for (const t of [
      scene.actionAt,
      scene.checkAt,
      scene.resolveAt,
      infrastructureSourceWindow(fixture(`OP-69:${state}`)).endTime,
    ]) {
      const transition = sampleInfrastructure(scene, t).transition;
      expect(transition?.sourceState).toBe(state);
      expect(transition?.connected).toBe(state === 'completed');
      if (state !== 'completed') expect(transition?.motion.accepted).toBe(0);
    }
  });
  it.each([
    'source-stated',
    'pending',
    'negative',
    'conditional',
    'unknown',
  ])('M11 %s provenance never becomes invented approval, training or provider connectivity', (state) => {
    const scene = parsed(fixture(`OP-70:${state}`)),
      early = sampleInfrastructure(scene, scene.responseAt),
      final = sampleInfrastructure(scene, scene.resolveAt);
    expect(final.trace[0].linkProgress).toBe(state === 'source-stated' ? 1 : 0);
    if (state === 'source-stated')
      expect(early.trace[0].linkProgress).toBeLessThan(final.trace[0].linkProgress);
    expect(final.transition).toBeNull();
  });
  it('M11 missing evidence retains its named/versioned/date fact rather than a successful diligence result', () => {
    const scene = parsed(fixture('OP-63:unknown:2')),
      pose = sampleInfrastructure(scene, scene.resolveAt);
    expect(pose.trace.find((p) => p.id === 'record-2:v2')?.linkProgress).toBe(0);
    expect(pose.trace.find((p) => p.id === 'record-1:v1')?.linkProgress).toBe(1);
  });
  it('M06 dates/versions are source data, not animation clocks or a live trend', () => {
    const scene = parsed(fixture('OP-71:primary'));
    const early = sampleInfrastructure(scene, scene.actionAt),
      final = sampleInfrastructure(scene, scene.resolveAt);
    expect(early.snapshots.map((s) => s.date)).toEqual(['2026-06-01', '2026-06-08']);
    expect(final.snapshots.map((s) => s.date)).toEqual(early.snapshots.map((s) => s.date));
    expect(early.snapshots.map((s) => s.visible)).toEqual([true, false]);
    expect(final.snapshots.map((s) => s.visible)).toEqual([true, true]);
    expect(infrastructureAssets(scene)).toEqual([]);
  });
  it('M02 exact supplied sequential latency is conserved once; unknown aggregation stays uncalibrated', () => {
    const scene = parsed(fixture('OP-72:sequential:2')),
      early = sampleInfrastructure(scene, scene.actionAt),
      final = sampleInfrastructure(scene, scene.resolveAt);
    expect(final.latency?.total).toBe(5);
    expect(final.latency?.parts.map((p) => p.amount)).toEqual([2, 3]);
    expect(final.latency?.parts.map((p) => p.visualWeight)).toEqual([0.4, 0.6]);
    expect(early.latency?.parts.every((p) => p.visualWeight === 0)).toBe(true);
    expect(
      sampleInfrastructure(parsed(fixture('OP-72:unknown:2')), scene.resolveAt).latency,
    ).toBeNull();
  });
});

describe('native source boundary pure poses', () => {
  it.each(
    INFRASTRUCTURE_NO_NATIVE_SOURCE_FIXTURES,
  )('$id accepted actual diagram/null selects no native assets at every 30fps frame or backward seek', (source) => {
    const scene = parsed(source),
      before = structuredClone(scene),
      win = infrastructureSourceWindow(source);
    expect(scene.visualMode).toBe('diagram');
    expect(scene.modelSource).toBeNull();
    const times = [
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
      win.endTime,
      ...Array.from({ length: Math.ceil((win.endTime - win.startTime) * 30) + 1 }, (_, i) =>
        Math.min(win.endTime, win.startTime + i / 30),
      ),
    ];
    for (const time of [...times, ...times.slice().reverse()]) {
      expect(infrastructureAssets(scene)).toEqual([]);
      const pose = sampleInfrastructure(scene, time);
      expect(numbers(pose).every(Number.isFinite)).toBe(true);
      expect(pose.identities.map((identity) => identity.id)).toEqual(
        infrastructureIdentities(scene).map((identity) => identity.id),
      );
      expect(sampleInfrastructure(scene, time)).toEqual(pose);
    }
    expect(scene).toEqual(before);
  });
});
