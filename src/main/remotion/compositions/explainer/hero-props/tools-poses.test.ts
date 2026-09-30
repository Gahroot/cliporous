import { describe, expect, it } from 'vitest';
import { HERO_CATALOG, TOOLS_TIMING } from '../hero-catalog';
import {
  METRONOME_SWING,
  metronomePoseAtPhase,
  sampleMetronomePose,
  sampleWateringCanPose,
  sampleWateringPour,
  sampleWrenchPose,
  WATERING_CAN,
  WATERING_SCHEDULE,
  WRENCH_GEOMETRY,
  wateringCanSpout,
} from './tools-poses';

const EPSILON = 1e-6;
const TIMES = [
  -Number.MAX_VALUE,
  -1,
  0,
  0.2,
  0.25,
  0.4,
  0.65,
  0.7,
  0.8,
  0.97,
  1.33,
  1.4,
  1.65,
  1.95,
  2,
  2.4,
  4,
  Number.MAX_VALUE,
  ...Array.from({ length: 121 }, (_, f) => f / 30),
];
const SAMPLERS = [
  ['metronome', sampleMetronomePose, 2.4],
  ['watering can', sampleWateringCanPose, 1.95],
  ['wrench tighten', sampleWrenchPose, 1.4],
  ['wrench loosen', (t: number) => sampleWrenchPose(t, true), 1.4],
] as const;

function within(value: number, min: number, max: number): void {
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThanOrEqual(max);
}

function finite(value: unknown): void {
  if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  else if (value && typeof value === 'object') Object.values(value).forEach(finite);
}

describe('seekable tools poses', () => {
  it.each(
    SAMPLERS,
  )('%s is finite, repeatable out of order, and holds the exact end pose', (_, sample, end) => {
    const reference = TIMES.map((t) => sample(t));
    reference.forEach(finite);
    for (let i = TIMES.length - 1; i >= 0; i--) expect(sample(TIMES[i])).toEqual(reference[i]);
    expect(sample(-1)).toEqual(sample(0));
    expect(sample(end)).toEqual(sample(100));
    for (const bad of [Number.NaN, Infinity, -Infinity]) expect(sample(bad)).toEqual(sample(0));
  });
});

describe('metronome synchronization API', () => {
  it('accepts phase/amplitude, so many rigs can share a scene-owned clock', () => {
    expect(metronomePoseAtPhase(0)).toEqual({ angle: 0 });
    expect(metronomePoseAtPhase(Math.PI / 2)).toEqual({ angle: METRONOME_SWING });
    expect(metronomePoseAtPhase(-Math.PI / 2, 0.5)).toEqual({ angle: -METRONOME_SWING / 2 });
    expect(metronomePoseAtPhase(Math.PI / 2, 2)).toEqual({ angle: METRONOME_SWING });
    expect(metronomePoseAtPhase(1, -1)).toEqual({ angle: 0 });
    expect(metronomePoseAtPhase(Infinity)).toEqual({ angle: 0 });
    expect(metronomePoseAtPhase(1, Number.NaN)).toEqual({ angle: 0 });
  });

  it('establishes measured opposite swings, crosses the pivot on its beat, then rests', () => {
    expect(sampleMetronomePose(0.2)).toEqual({ angle: 0 });
    expect(sampleMetronomePose(0.6).angle).toBeCloseTo(-METRONOME_SWING);
    expect(sampleMetronomePose(1).angle).toBeCloseTo(METRONOME_SWING);
    const beat = HERO_CATALOG.metronome.impactSec;
    expect(beat).toBe(TOOLS_TIMING.metronome);
    expect(sampleMetronomePose(beat).angle).toBe(0);
    expect(sampleMetronomePose(beat - EPSILON).angle).toBeLessThan(0);
    expect(sampleMetronomePose(beat + EPSILON).angle).toBeGreaterThan(0);
    expect(sampleMetronomePose(2.4)).toEqual({ angle: 0 });
    for (const t of TIMES) within(sampleMetronomePose(t).angle, -METRONOME_SWING, METRONOME_SWING);
  });
});

describe('watering can mouth → droplet → soil contact', () => {
  it('tilts before emission and never wets soil before the first arrival', () => {
    const { flowAt } = WATERING_SCHEDULE;
    expect(sampleWateringCanPose(flowAt - EPSILON).drops.every((d) => !d.visible)).toBe(true);
    expect(sampleWateringCanPose(flowAt).tilt).toBe(WATERING_CAN.tilt);
    const contact = HERO_CATALOG['watering-can'].impactSec;
    expect(contact).toBeCloseTo(flowAt + WATERING_CAN.flightSec);
    expect(sampleWateringCanPose(contact - EPSILON).received).toBe(0);
    expect(sampleWateringCanPose(contact).received).toBe(0);
    expect(sampleWateringCanPose(contact + EPSILON).received).toBeGreaterThan(0);
    const landed = sampleWateringCanPose(contact).drops[0];
    expect(landed.visible).toBe(true);
    landed.position.forEach((v, i) => {
      expect(v).toBeCloseTo(WATERING_CAN.target[i]);
    });
  });

  it('all eight drops start on the actual rotated rose and land on the same bounded receiver', () => {
    const { flowAt, stopAt } = WATERING_SCHEDULE;
    for (let id = 0; id < WATERING_CAN.drops; id++) {
      const emitAt = flowAt + (id / (WATERING_CAN.drops - 1)) * (stopAt - flowAt);
      const atEmission = sampleWateringCanPose(emitAt);
      expect(atEmission.drops[id].visible).toBe(true);
      expect(atEmission.drops[id].position).toEqual(wateringCanSpout(atEmission.tilt));
      const atLanding = sampleWateringCanPose(emitAt + WATERING_CAN.flightSec);
      atLanding.drops[id].position.forEach((v, i) => {
        expect(v).toBeCloseTo(WATERING_CAN.target[i]);
      });
      expect(
        sampleWateringCanPose(emitAt + WATERING_CAN.flightSec + EPSILON).drops[id].visible,
      ).toBe(false);
    }
  });

  it('does not teleport in-flight water when the can rights itself; the wet result holds', () => {
    const source = wateringCanSpout(WATERING_CAN.tilt);
    let previous = 0;
    for (const t of [...TIMES].sort((a, b) => a - b)) {
      const pose = sampleWateringCanPose(t);
      within(pose.tilt, WATERING_CAN.tilt, 0);
      within(pose.received, 0, 1);
      expect(pose.received).toBeGreaterThanOrEqual(previous);
      previous = pose.received;
      expect(pose.drops).toHaveLength(WATERING_CAN.drops);
      expect(new Set(pose.drops.map((drop) => drop.id)).size).toBe(WATERING_CAN.drops);
      for (const drop of pose.drops) {
        within(drop.position[0], source[0], WATERING_CAN.target[0]);
        within(drop.position[1], WATERING_CAN.target[1], source[1]);
        expect(drop.position[2]).toBe(0);
      }
    }
    const settling = sampleWateringCanPose(1.5);
    expect(settling.tilt).toBeGreaterThan(WATERING_CAN.tilt);
    expect(settling.drops.some((d) => d.visible)).toBe(true);
    expect(sampleWateringCanPose(1.95).received).toBe(1);
    expect(sampleWateringCanPose(1.95).tilt).toBeCloseTo(0);
    expect(sampleWateringCanPose(1.95).drops.every((d) => !d.visible)).toBe(true);
  });

  it('supports a relay-owned timeline and target in shared local space', () => {
    const schedule = { tiltAt: 2, flowAt: 2.5, stopAt: 3, restAt: 3.5 };
    const target = [1.7, -1.3, 0.2] as const;
    const firstLanding = sampleWateringPour(2.5 + WATERING_CAN.flightSec, schedule, target);
    firstLanding.drops[0].position.forEach((v, i) => {
      expect(v).toBeCloseTo(target[i]);
    });
    expect(sampleWateringPour(3.5, schedule, target).received).toBe(1);
    expect(sampleWateringPour(2, { ...schedule, flowAt: 2 })).toEqual(sampleWateringCanPose(0));
    expect(sampleWateringPour(2, schedule, [Number.NaN, 0, 0])).toEqual(sampleWateringCanPose(0));
  });
});

describe('wrench engages before torque', () => {
  it('has an open jaw sized to the hex nut, including bevel clearance', () => {
    const nutFlat = WRENCH_GEOMETRY.nutRadius * Math.cos(Math.PI / 6) + 0.002;
    const jawFlat = WRENCH_GEOMETRY.jawHalfGap - 0.005;
    expect(jawFlat).toBeGreaterThan(nutFlat);
    expect(jawFlat - nutFlat).toBeLessThan(0.003);
  });

  it.each([false, true])('holds the same nut/tool axis in both directions (down=%s)', (down) => {
    const contact = down
      ? (HERO_CATALOG.wrench.downImpactSec ?? -1)
      : HERO_CATALOG.wrench.impactSec;
    expect(sampleWrenchPose(contact - EPSILON, down).gap).toBeGreaterThan(0);
    expect(sampleWrenchPose(contact, down).gap).toBe(0);
    for (const t of TIMES) {
      const pose = sampleWrenchPose(t, down);
      within(pose.gap, 0, WRENCH_GEOMETRY.travel);
      within(pose.lift, 0, 0.07);
      within(pose.angle, -WRENCH_GEOMETRY.turn, WRENCH_GEOMETRY.turn);
      expect(pose.nutAngle).toBe(pose.angle);
      if (pose.gap > 0) expect(pose.angle).toBeCloseTo(0);
    }
  });

  it('tightening seats the nut; loosening reverses torque and backs it off, not the engagement order', () => {
    const tight = sampleWrenchPose(1.4);
    const loose = sampleWrenchPose(1.4, true);
    expect(tight.angle).toBe(-WRENCH_GEOMETRY.turn);
    expect(loose.angle).toBe(WRENCH_GEOMETRY.turn);
    expect(tight.lift).toBe(0);
    expect(loose.lift).toBe(0.07);
    expect(loose.gap).toBe(tight.gap);
  });
});
