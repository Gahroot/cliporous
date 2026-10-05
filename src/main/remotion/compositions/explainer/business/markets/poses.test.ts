import { describe, expect, it } from 'vitest';
import {
  parseMarketDependencyScene,
  parseProcurementCommitmentScene,
} from '../../../../../ai/explainer/business-markets-contract';
import type { Rec } from '../../../../../ai/explainer/kind-spec';
import {
  MARKETS_ADDITIONAL_SOURCE_FIXTURES,
  MARKETS_SOURCE_FIXTURES,
  type MarketsSourceFixture,
  marketsSourceContext,
  marketsSourceWindow,
  procurementSourceFixture,
} from './fixtures';
import { marketsAssets, marketsKey, sampleMarkets } from './poses';
import { marketsIdentities } from './presentation';
import type { MarketsScene } from './types';

function parsed(
  fixture: MarketsSourceFixture,
  mode: 'diagram' | 'hybrid' = 'diagram',
): MarketsScene {
  const ctx = marketsSourceContext(fixture);
  const raw: Rec = { ...fixture.raw, visualMode: mode };
  const scene =
    raw.kind === 'procurement-commitment'
      ? parseProcurementCommitmentScene(raw, ctx)
      : parseMarketDependencyScene(raw, ctx);
  if (!scene) throw new Error(`${fixture.fixtureId}: ${ctx.issues.join('; ')}`);
  return scene;
}
function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbers);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}
const fixtures = [...MARKETS_SOURCE_FIXTURES, ...MARKETS_ADDITIONAL_SOURCE_FIXTURES];

describe('markets pure authored poses from accepted raw source windows', () => {
  it.each(
    fixtures,
  )('$fixtureId is immutable, finite, repeatable and settled over the actual final hold', (fixture) => {
    const scene = parsed(fixture);
    const before = structuredClone(scene);
    const end = marketsSourceWindow(fixture).endTime;
    for (const t of [
      end,
      scene.responseAt,
      -Infinity,
      scene.setupAt,
      NaN,
      Infinity,
      scene.resolveAt,
      -1,
      0,
    ]) {
      const pose = sampleMarkets(scene, t);
      expect(numbers(pose).every(Number.isFinite)).toBe(true);
      expect(sampleMarkets(scene, t)).toEqual(pose);
      expect(pose.identities.map((i) => i.id)).toEqual(marketsIdentities(scene).map((i) => i.id));
      expect(new Set(pose.identities.map((i) => i.key)).size).toBe(pose.identities.length);
      for (const identity of pose.identities)
        expect(identity.key).toBe(marketsKey(scene, 'identity', identity.id));
    }
    expect(sampleMarkets(scene, end)).toEqual(sampleMarkets(scene, scene.resolveAt));
    expect(scene).toEqual(before);
    const supported = new Set(marketsIdentities(scene).map((i) => i.id));
    for (const asset of marketsAssets(scene)) expect(supported.has(asset.id)).toBe(true);
  });
  it('M-03 focuses a qualified boundary without changing its state or erasing it', () => {
    const fixture = MARKETS_SOURCE_FIXTURES.find((f) => f.id === 'OP-41');
    if (!fixture) throw new Error('Missing OP-41');
    const scene = parsed(fixture);
    const start = sampleMarkets(scene, scene.actionAt);
    const end = sampleMarkets(scene, scene.resolveAt);
    expect(end.constraints.some((c) => c.focus === 1)).toBe(true);
    expect(start.constraints.every((c) => c.focus === 0)).toBe(true);
    expect(end.procurement).toBeNull();
  });
  it('M-07 changes the specialist scope, not source identities/capabilities', () => {
    const fixture = MARKETS_SOURCE_FIXTURES.find((f) => f.id === 'OP-48');
    if (!fixture) throw new Error('Missing OP-48');
    const scene = parsed(fixture);
    const early = sampleMarkets(scene, scene.actionAt);
    const late = sampleMarkets(scene, scene.resolveAt);
    expect(late.lens).toBe(1);
    expect(early.identities.map((i) => i.x)).not.toEqual(late.identities.map((i) => i.x));
    expect(late.matches).toEqual([]);
    expect(late.procurement).toBeNull();
  });
  it('M-08 alternatives have identical area, baseline and visibility, with no winner', () => {
    const fixture = MARKETS_SOURCE_FIXTURES.find((f) => f.id === 'OP-45');
    if (!fixture) throw new Error('Missing OP-45');
    const scene = parsed(fixture);
    for (const t of [scene.actionAt, scene.responseAt, scene.resolveAt]) {
      const alternatives = sampleMarkets(scene, t).alternatives;
      expect(alternatives.length).toBeGreaterThan(1);
      expect(new Set(alternatives.map((a) => `${a.area}:${a.baseline}:${a.opacity}`)).size).toBe(1);
      expect(alternatives.every((a) => a.area === 1 && a.baseline === 0)).toBe(true);
    }
  });
  it.each(
    fixtures.filter((f) => f.id === 'OP-42'),
  )('M-12 retains the source-bound migration gate: $fixtureId', (fixture) => {
    const scene = parsed(fixture);
    if (scene.kind !== 'market-dependency' || scene.preset !== 'migration-constraints')
      throw new Error('Missing migration');
    const actual =
      scene.migration.state === 'completed' &&
      scene.constraints.every((c) => c.state === 'satisfied');
    expect(sampleMarkets(scene, scene.resolveAt).migration?.gate).toBe(actual ? 1 : 0);
    if (!actual)
      for (const t of [scene.actionAt, scene.checkAt, scene.resolveAt])
        expect(sampleMarkets(scene, t).migration?.gate).toBe(0);
  });
  it.each(
    fixtures.filter((f) => f.id === 'OP-43'),
  )('M-09 keeps matching, acceptance and settlement independent: $fixtureId', (fixture) => {
    const scene = parsed(fixture);
    if (scene.kind !== 'market-dependency' || scene.preset !== 'participation-matching')
      throw new Error('Missing matches');
    const pose = sampleMarkets(scene, scene.resolveAt);
    scene.matches.forEach((match, index) => {
      expect(pose.matches[index].matching).toBe(match.state === 'matched' ? 1 : 0);
      expect(pose.matches[index].acceptance.accepted).toBe(
        match.acceptance.state === 'accepted' ? 1 : 0,
      );
    });
    expect(pose.procurement).toBeNull();
  });
  it.each(
    fixtures.filter((f) => f.id === 'OP-47'),
  )('M-09 gates authorization/acceptance/payment on their OWN facts: $fixtureId', (fixture) => {
    const scene = parsed(fixture);
    if (scene.kind !== 'procurement-commitment') throw new Error('Missing procurement');
    for (const t of [
      scene.actionAt,
      scene.checkAt,
      scene.resolveAt,
      marketsSourceWindow(fixture).endTime,
    ]) {
      const pose = sampleMarkets(scene, t).procurement;
      if (!pose) throw new Error('Missing procurement pose');
      expect(pose.quote.amount).toBe(scene.quote.amount);
      expect(pose.payment.amount).toBe(scene.payment.amount);
      expect(pose.quote.basis).toBe(scene.quote.basis);
      expect(pose.payment.basis).toBe(scene.payment.basis);
      if (scene.authority.state !== 'granted') expect(pose.authority.accepted).toBe(0);
      if (scene.acceptance.state !== 'accepted') expect(pose.acceptance.accepted).toBe(0);
      if (scene.payment.state !== 'paid') expect(pose.settlement).toBe(0);
    }
    const final = sampleMarkets(scene, scene.resolveAt).procurement;
    expect(final?.settlement).toBe(scene.payment.state === 'paid' ? 1 : 0);
    expect(final?.authority.accepted).toBe(scene.authority.state === 'granted' ? 1 : 0);
  });
  it('unknown approver never becomes a modeled approval actor', () => {
    const scene = parsed(procurementSourceFixture('unknown-approver'));
    expect(marketsAssets(scene).map((a) => a.asset)).not.toContain('A-06');
  });
  it('OP-44 has no model assets even though participants have supported identities', () => {
    const fixture = MARKETS_SOURCE_FIXTURES.find((f) => f.id === 'OP-44');
    if (!fixture) throw new Error('Missing OP-44');
    expect(marketsAssets(parsed(fixture))).toEqual([]);
  });
});
