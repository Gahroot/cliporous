import { describe, expect, it } from 'vitest';
import type { BusinessClock } from '../motion';
import {
  INFRASTRUCTURE_ASSET_BOUNDS,
  INFRASTRUCTURE_ASSET_BUDGETS,
  INFRASTRUCTURE_ASSET_IDS,
  sampleInfrastructureAssets,
} from './infrastructure-poses';

const beats = Object.freeze({
  setupAt: 0.5,
  actionAt: 1.5,
  responseAt: 3,
  checkAt: 4.5,
  resolveAt: 6,
});
const clock = (frame: number): BusinessClock => ({ frame, fps: 30, beats });
const frames = [-30, 0, 14, 15, 16, 44, 45, 46, 89, 90, 91, 134, 135, 136, 179, 180, 181, 240, 600];

function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}

function parameters(frame: number): number[] {
  return numbers(sampleInfrastructureAssets(clock(frame)));
}

describe('pure infrastructure presentation samples', () => {
  it('is finite, bounded and repeatable in forward, backward and shuffled seek order', () => {
    const expected = new Map(
      frames.map((frame) => [frame, sampleInfrastructureAssets(clock(frame))]),
    );
    const shuffled = [
      180, 14, 600, 45, 0, 136, 89, 181, -30, 90, 44, 240, 15, 179, 91, 16, 135, 46, 134,
    ];
    for (const frame of [...frames, ...[...frames].reverse(), ...shuffled, ...frames]) {
      const input = Object.freeze(clock(frame));
      const actual = sampleInfrastructureAssets(input);
      expect(actual).toEqual(expected.get(frame));
      expect(actual).not.toBe(expected.get(frame));
      expect(numbers(actual)).toHaveLength(6);
      for (const value of numbers(actual)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(input.frame).toBe(frame);
      expect(input.beats).toBe(beats);
    }
  });

  it('has exact ordered beat boundaries and continuous adjacent-frame changes', () => {
    expect(parameters(14)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(parameters(15)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(parameters(45)).toEqual([1, 0, 0, 0, 1, 0]);
    expect(parameters(90)).toEqual([1, 1, 1, 0, 1, 0]);
    expect(parameters(135)).toEqual([1, 1, 1, 1, 1, 0]);
    expect(parameters(180)).toEqual([1, 1, 1, 1, 1, 1]);
    for (const boundary of [15, 45, 90, 135, 180]) {
      const before = parameters(boundary - 1);
      const at = parameters(boundary);
      const after = parameters(boundary + 1);
      for (let index = 0; index < at.length; index++) {
        expect(before[index]).toBeLessThanOrEqual(at[index]);
        expect(after[index]).toBeGreaterThanOrEqual(at[index]);
        expect(Math.abs(at[index] - before[index])).toBeLessThan(0.01);
        expect(Math.abs(after[index] - at[index])).toBeLessThan(0.01);
      }
    }
    expect(sampleInfrastructureAssets(clock(30)).rack.reveal).toBe(0.5);
    expect(sampleInfrastructureAssets(clock(67.5)).rack.activity).toBe(0.5);
    expect(sampleInfrastructureAssets(clock(157.5)).provider.progress).toBe(0.5);
  });

  it('is fully settled at resolveAt and unchanged throughout the final reading hold', () => {
    const final = sampleInfrastructureAssets(clock(180));
    for (const frame of [180, 180.5, 181, 240, 600, 30_000]) {
      expect(sampleInfrastructureAssets(clock(frame))).toEqual(final);
    }
    expect(sampleInfrastructureAssets(clock(179)).provider.progress).toBeLessThan(1);
    for (const fps of [24, 30, 60]) {
      expect(sampleInfrastructureAssets({ frame: beats.resolveAt * fps, fps, beats })).toEqual(
        final,
      );
    }
  });

  it('settles even with short valid beat intervals without adding an after-resolution tail', () => {
    const shortBeats = {
      setupAt: 0,
      actionAt: 1 / 30,
      responseAt: 2 / 30,
      checkAt: 3 / 30,
      resolveAt: 4 / 30,
    };
    const final = sampleInfrastructureAssets({ frame: 4, fps: 30, beats: shortBeats });
    expect(numbers(final)).toEqual([1, 1, 1, 1, 1, 1]);
    for (const frame of [5, 30, 300]) {
      expect(sampleInfrastructureAssets({ frame, fps: 30, beats: shortBeats })).toEqual(final);
    }
  });

  it('fails closed to finite parameters for invalid clocks and beat probes', () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(numbers(sampleInfrastructureAssets(clock(value)))).toEqual([0, 0, 0, 0, 0, 0]);
      for (const field of ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const) {
        expect(
          numbers(
            sampleInfrastructureAssets({ ...clock(120), beats: { ...beats, [field]: value } }),
          ).every(Number.isFinite),
        ).toBe(true);
      }
    }
    for (const fps of [0, -30, NaN, Infinity, -Infinity]) {
      expect(numbers(sampleInfrastructureAssets({ ...clock(120), fps }))).toEqual([
        0, 0, 0, 0, 0, 0,
      ]);
    }
    expect(
      numbers(
        sampleInfrastructureAssets({ ...clock(Number.MAX_VALUE), fps: Number.MIN_VALUE }),
      ).every(Number.isFinite),
    ).toBe(true);
    const collapsed = { setupAt: 1, actionAt: 1, responseAt: 1, checkAt: 1, resolveAt: 1 };
    expect(numbers(sampleInfrastructureAssets({ ...clock(300), beats: collapsed }))).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
  });

  it('never derives source readiness, cooling activity or provider connection from elapsed time', () => {
    for (const frame of frames) {
      const actual = sampleInfrastructureAssets(clock(frame));
      expect(actual.substation).not.toHaveProperty('ready');
      expect(actual.cooling).not.toHaveProperty('active');
      expect(actual.provider).not.toHaveProperty('connected');
      expect(Object.keys(actual.rack)).toEqual(['reveal', 'activity']);
      expect(Object.keys(actual.substation)).toEqual(['reveal']);
      expect(Object.keys(actual.cooling)).toEqual(['reveal']);
      expect(Object.keys(actual.provider)).toEqual(['reveal', 'progress']);
      expect(numbers(actual).every((value) => typeof value === 'number')).toBe(true);
    }
  });

  it('records exactly four fixed, finite asset envelopes and ceilings no greater than 24', () => {
    expect(INFRASTRUCTURE_ASSET_IDS).toEqual(['A-13', 'A-14', 'A-15', 'A-16']);
    expect(Object.keys(INFRASTRUCTURE_ASSET_BUDGETS)).toEqual(INFRASTRUCTURE_ASSET_IDS);
    expect(Object.keys(INFRASTRUCTURE_ASSET_BOUNDS)).toEqual(INFRASTRUCTURE_ASSET_IDS);
    for (const id of INFRASTRUCTURE_ASSET_IDS) {
      const ceiling = INFRASTRUCTURE_ASSET_BUDGETS[id];
      expect(Number.isInteger(ceiling)).toBe(true);
      expect(ceiling).toBeGreaterThan(0);
      expect(ceiling).toBeLessThanOrEqual(24);
      const bounds = INFRASTRUCTURE_ASSET_BOUNDS[id];
      for (const axis of [0, 1, 2]) {
        expect(Number.isFinite(bounds.min[axis])).toBe(true);
        expect(Number.isFinite(bounds.max[axis])).toBe(true);
        expect(bounds.min[axis]).toBeLessThan(bounds.max[axis]);
      }
    }
  });
});
