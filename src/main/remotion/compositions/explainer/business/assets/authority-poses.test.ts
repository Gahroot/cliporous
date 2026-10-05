import { describe, expect, it } from 'vitest';
import type { BusinessClock } from '../motion';
import {
  AUTHORITY_ASSET_BOUNDS,
  AUTHORITY_ASSET_BUDGETS,
  AUTHORITY_ASSET_IDS,
  type AuthorityAssetFacts,
  sampleAuthorityAssets,
} from './authority-poses';

const beats = Object.freeze({
  setupAt: 0.25,
  actionAt: 1,
  responseAt: 3,
  checkAt: 5,
  resolveAt: 7,
});
const compressed = Object.freeze({
  setupAt: 1,
  actionAt: 1.125,
  responseAt: 1.25,
  checkAt: 1.375,
  resolveAt: 1.5,
});
const beatKeys = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
const approved: AuthorityAssetFacts = Object.freeze({
  permissionState: 'allowed',
  gateState: 'approved',
  revision: 1,
  pending: true,
});
const facts: AuthorityAssetFacts[] = (['allowed', 'denied', 'unknown'] as const).flatMap(
  (permissionState) =>
    (['approved', 'denied', 'pending'] as const).flatMap((gateState) =>
      ([0, 1] as const).flatMap((revision) =>
        [false, true].map((pending) =>
          Object.freeze({ permissionState, gateState, revision, pending }),
        ),
      ),
    ),
);

function clock(t: number, schedule: BusinessClock['beats'] = beats): BusinessClock {
  return Object.freeze({ frame: t * 30, fps: 30, beats: schedule });
}
function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbers);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}
function unchangedFlags(c: BusinessClock, source: AuthorityAssetFacts): void {
  const pose = sampleAuthorityAssets(c, source);
  expect(pose.permissionCard.state).toBe(source.permissionState);
  expect(pose.gateState).toBe(source.gateState);
  expect(pose.playbookBinder.revision).toBe(source.revision ?? 0);
  expect(pose.exceptionTrolley.pending).toBe(source.pending);
  if (source.gateState !== 'approved') expect(pose.approvalRail.accepted).toBe(0);
}

// Pure CPU motion checks: no React renderer, GPU, media or measured resource proof.
describe('authority asset poses', () => {
  it('exports exactly four bounded, finite asset envelopes and <=24 mesh ceilings', () => {
    expect(AUTHORITY_ASSET_IDS).toEqual(['A-05', 'A-06', 'A-07', 'A-08']);
    expect(Object.keys(AUTHORITY_ASSET_BUDGETS)).toEqual([...AUTHORITY_ASSET_IDS]);
    expect(Object.keys(AUTHORITY_ASSET_BOUNDS)).toEqual([...AUTHORITY_ASSET_IDS]);
    for (const id of AUTHORITY_ASSET_IDS) {
      expect(AUTHORITY_ASSET_BUDGETS[id]).toBeGreaterThan(0);
      expect(AUTHORITY_ASSET_BUDGETS[id]).toBeLessThanOrEqual(24);
      const bounds = AUTHORITY_ASSET_BOUNDS[id];
      expect(numbers(bounds).every(Number.isFinite)).toBe(true);
      for (let axis = 0; axis < 3; axis++) expect(bounds.min[axis]).toBeLessThan(bounds.max[axis]);
    }
  });

  it('is finite, bounded and exact on repeated, backward and shuffled seeks for all 36 fact combinations', () => {
    const times = [-2, 0, 0.25, 0.5, 1, 1.1, 2.9, 3, 3.1, 4, 4.9, 5, 5.1, 6, 6.9, 7, 7.1, 30];
    for (const source of facts) {
      const reference = new Map(times.map((t) => [t, sampleAuthorityAssets(clock(t), source)]));
      for (const t of [...times, ...[...times].reverse(), 5, 0.25, 7, 1, 4, 3, 6, 7, 0]) {
        const pose = sampleAuthorityAssets(clock(t), source);
        expect(pose).toStrictEqual(reference.get(t));
        expect(numbers(pose).every((n) => Number.isFinite(n) && n >= 0 && n <= 1)).toBe(true);
        unchangedFlags(clock(t), source);
      }
    }
  });

  it('keeps numeric samples finite for invalid clocks, overflowed times and nonfinite beat probes', () => {
    const probes: BusinessClock[] = [];
    for (const bad of [NaN, Infinity, -Infinity]) {
      probes.push({ ...clock(4), frame: bad }, { ...clock(4), fps: bad });
      for (const key of beatKeys) probes.push({ ...clock(4), beats: { ...beats, [key]: bad } });
    }
    probes.push(
      { ...clock(4), fps: 0 },
      { ...clock(4), fps: -30 },
      { ...clock(4), frame: Number.MAX_VALUE, fps: Number.MIN_VALUE },
    );
    for (const probe of probes) {
      for (const source of facts) {
        expect(numbers(sampleAuthorityAssets(probe, source)).every(Number.isFinite)).toBe(true);
        unchangedFlags(probe, source);
      }
    }
  });

  it('has the authored beat and midpoint boundaries without revealing an unsupported acceptance', () => {
    expect(sampleAuthorityAssets(clock(-1), approved)).toEqual({
      permissionCard: { state: 'allowed', focus: 0 },
      approvalRail: { accepted: 0 },
      playbookBinder: { open: 0, revision: 1 },
      exceptionTrolley: { pending: true },
      gateState: 'approved',
    });
    for (const t of [beats.setupAt, beats.actionAt, beats.responseAt]) {
      const pose = sampleAuthorityAssets(clock(t), approved);
      expect(pose.permissionCard.focus).toBe(0);
      expect(pose.playbookBinder.open).toBe(0);
      expect(pose.approvalRail.accepted).toBe(0);
    }
    const responseMidpoint = sampleAuthorityAssets(clock(4), approved);
    expect(responseMidpoint.playbookBinder.open).toBe(0.5);
    expect(responseMidpoint.permissionCard.focus).toBe(0.15625);
    expect(responseMidpoint.approvalRail.accepted).toBe(0);
    const check = sampleAuthorityAssets(clock(beats.checkAt), approved);
    expect(check.playbookBinder.open).toBe(1);
    expect(check.permissionCard.focus).toBe(0.5);
    expect(check.approvalRail.accepted).toBe(0);
    const checkMidpoint = sampleAuthorityAssets(clock(6), approved);
    expect(checkMidpoint.approvalRail.accepted).toBe(0.5);
    expect(checkMidpoint.permissionCard.focus).toBe(0.84375);
    expect(sampleAuthorityAssets(clock(beats.resolveAt), approved).approvalRail.accepted).toBe(1);
  });

  it('is continuous immediately before/at/after all five beats, including compressed off-frame beats', () => {
    const epsilon = 1e-6;
    for (const schedule of [beats, compressed]) {
      // Smoothstep has maximum slope 1.5/duration; focus is still moving at checkAt.
      const maxSlope =
        1.5 /
        Math.min(
          schedule.checkAt - schedule.responseAt,
          schedule.resolveAt - schedule.checkAt,
          schedule.resolveAt - schedule.responseAt,
        );
      for (const key of beatKeys) {
        for (const source of facts) {
          const boundary = numbers(sampleAuthorityAssets(clock(schedule[key], schedule), source));
          for (const offset of [-epsilon, epsilon]) {
            const adjacent = numbers(
              sampleAuthorityAssets(clock(schedule[key] + offset, schedule), source),
            );
            expect(adjacent).toHaveLength(boundary.length);
            adjacent.forEach((n, index) => {
              expect(Math.abs(n - boundary[index])).toBeLessThanOrEqual(maxSlope * epsilon + 1e-12);
            });
            unchangedFlags(clock(schedule[key] + offset, schedule), source);
          }
        }
      }
    }
  });

  it('settles every visual parameter by resolveAt and retains the entire final hold', () => {
    for (const schedule of [beats, compressed]) {
      for (const source of facts) {
        const final = sampleAuthorityAssets(clock(schedule.resolveAt, schedule), source);
        expect(final.permissionCard.focus).toBe(1);
        expect(final.playbookBinder.open).toBe(1);
        expect(final.approvalRail.accepted).toBe(source.gateState === 'approved' ? 1 : 0);
        for (const offset of [1 / 30, 0.5, 1, 10, 300]) {
          expect(
            sampleAuthorityAssets(clock(schedule.resolveAt + offset, schedule), source),
          ).toEqual(final);
        }
      }
    }
  });

  it.each([
    'pending',
    'denied',
  ] as const)('never grants approval to a %s gate even when permission is allowed', (gateState) => {
    const source: AuthorityAssetFacts = { ...approved, gateState };
    for (let frame = -30; frame <= 600; frame++) {
      const pose = sampleAuthorityAssets({ frame, fps: 30, beats }, source);
      expect(pose.approvalRail.accepted).toBe(0);
      expect(pose.gateState).toBe(gateState);
      expect(pose.permissionCard.state).toBe('allowed');
    }
  });

  it('preserves source permission, revision and pending flags without mutating frozen inputs', () => {
    for (const source of facts) {
      const c = clock(30);
      const original = JSON.stringify({ source, c });
      const pose = sampleAuthorityAssets(c, source);
      unchangedFlags(c, source);
      expect(JSON.stringify({ source, c })).toBe(original);
      expect(pose.playbookBinder.revision).toBe(source.revision);
      expect(pose.exceptionTrolley.pending).toBe(source.pending);
    }
  });

  it('defaults only the omitted guidance slot to revision zero, never advancing it with time', () => {
    const source: AuthorityAssetFacts = {
      permissionState: 'unknown',
      gateState: 'pending',
      pending: true,
    };
    for (const t of [-1, 0, 4, 7, 600]) {
      const pose = sampleAuthorityAssets(clock(t), source);
      expect(pose.playbookBinder.revision).toBe(0);
      expect(pose.permissionCard.state).toBe('unknown');
      expect(pose.gateState).toBe('pending');
      expect(pose.exceptionTrolley.pending).toBe(true);
      expect(pose.approvalRail.accepted).toBe(0);
    }
    expect(source.revision).toBeUndefined();
  });
});
