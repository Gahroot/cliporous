import { describe, expect, it } from 'vitest';
import {
  CABINET_DRAWER_TRAVEL,
  CABINET_PAPER,
  PARCEL_SIZE,
  RESERVOIR_SIZE,
  sampleFilingCabinetPose,
  sampleParcelPose,
  sampleReservoirPose,
} from './storage-poses';

const EPSILON = 1e-6;
const RIGHT_ANGLE = Math.PI / 2;
const BOUNDARIES = [0, 0.15, 0.2, 0.45, 0.6, 0.65, 0.7, 1, 1.05, 1.1, 1.15, 1.3, 1.5, 1.65];
const TIMES = [
  -Number.MAX_VALUE,
  ...BOUNDARIES.flatMap((time) => [time - EPSILON, time, time + EPSILON]),
  ...Array.from({ length: 121 }, (_, frame) => frame / 60),
  5,
  1e6,
  Number.MAX_VALUE,
];
const SAMPLERS = [
  ['parcel', sampleParcelPose, 1.5],
  ['filing-cabinet', sampleFilingCabinetPose, 1.65],
  ['reservoir up', sampleReservoirPose, 1.3],
  ['reservoir down', (t: number) => sampleReservoirPose(t, true), 1.3],
] as const;

function within(value: number, min: number, max: number): void {
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThanOrEqual(max);
}

describe('storage mesh/contact contracts', () => {
  it('exports the approved dimensions without inferred amounts or units', () => {
    expect(PARCEL_SIZE).toEqual({
      width: 1.5,
      depth: 1.15,
      height: 1.25,
      baseY: -0.65,
      thickness: 0.06,
    });
    expect(CABINET_PAPER).toEqual({
      width: 0.95,
      depth: 0.56,
      thickness: 0.02,
      seatY: 0.24,
      startY: 1.5,
      closedZ: 0.08,
    });
    expect(RESERVOIR_SIZE).toEqual({
      width: 1.55,
      height: 1.8,
      depth: 0.72,
      bottomY: -0.75,
      fillHeight: 1.5,
      low: 0.16,
      high: 0.82,
    });
  });
});

describe('parcel fold order', () => {
  it('folds sides during .15–.6, ends during .45–1, and the lid during 1.05–1.5', () => {
    expect(sampleParcelPose(0.15)).toEqual({ sideAngle: 0, endAngle: 0, lidAngle: 0 });
    expect(sampleParcelPose(0.15 + EPSILON).sideAngle).toBeGreaterThan(0);
    expect(sampleParcelPose(0.45).endAngle).toBe(0);
    expect(sampleParcelPose(0.45 + EPSILON).endAngle).toBeGreaterThan(0);
    expect(sampleParcelPose(0.6 - EPSILON).sideAngle).toBeLessThan(RIGHT_ANGLE);
    expect(sampleParcelPose(0.6).sideAngle).toBe(RIGHT_ANGLE);
    expect(sampleParcelPose(1 - EPSILON).endAngle).toBeLessThan(RIGHT_ANGLE);
    expect(sampleParcelPose(1)).toEqual({
      sideAngle: RIGHT_ANGLE,
      endAngle: RIGHT_ANGLE,
      lidAngle: 0,
    });
    expect(sampleParcelPose(1.05).lidAngle).toBe(0);
    expect(sampleParcelPose(1.05 + EPSILON).lidAngle).toBeGreaterThan(0);
    expect(sampleParcelPose(1.5 - EPSILON).lidAngle).toBeLessThan(RIGHT_ANGLE);
    expect(sampleParcelPose(1.5)).toEqual({
      sideAngle: RIGHT_ANGLE,
      endAngle: RIGHT_ANGLE,
      lidAngle: RIGHT_ANGLE,
    });
  });

  it('never moves the lid before all walls are up; every fold is bounded and monotone', () => {
    let previous = sampleParcelPose(-1);
    for (const time of [...TIMES].sort((a, b) => a - b)) {
      const pose = sampleParcelPose(time);
      for (const key of ['sideAngle', 'endAngle', 'lidAngle'] as const) {
        within(pose[key], 0, RIGHT_ANGLE);
        expect(pose[key]).toBeGreaterThanOrEqual(previous[key]);
      }
      if (pose.lidAngle > 0) {
        expect(pose.sideAngle).toBe(RIGHT_ANGLE);
        expect(pose.endAngle).toBe(RIGHT_ANGLE);
      }
      previous = pose;
    }
  });
});

describe('filing cabinet contact order', () => {
  it('opens fully before the drop, seats at 1.1, then closes only after 1.15', () => {
    expect(CABINET_DRAWER_TRAVEL).toBe(0.8);
    expect(sampleFilingCabinetPose(0.2)).toEqual({ drawer: 0, paperY: 1.5, paperZ: 0.88 });
    expect(sampleFilingCabinetPose(0.2 + EPSILON).drawer).toBeGreaterThan(0);
    expect(sampleFilingCabinetPose(0.65 - EPSILON).drawer).toBeLessThan(0.8);
    expect(sampleFilingCabinetPose(0.65)).toEqual({ drawer: 0.8, paperY: 1.5, paperZ: 0.88 });
    expect(sampleFilingCabinetPose(0.7)).toEqual(sampleFilingCabinetPose(0.65));
    expect(sampleFilingCabinetPose(0.7 + EPSILON).paperY).toBeLessThan(1.5);
    expect(sampleFilingCabinetPose(1.1 - EPSILON).paperY).toBeGreaterThan(CABINET_PAPER.seatY);
    const seated = { drawer: 0.8, paperY: CABINET_PAPER.seatY, paperZ: 0.88 };
    expect(sampleFilingCabinetPose(1.1)).toEqual(seated);
    expect(sampleFilingCabinetPose(1.15)).toEqual(seated);
    expect(sampleFilingCabinetPose(1.15 + EPSILON).drawer).toBeLessThan(0.8);
    expect(sampleFilingCabinetPose(1.65 - EPSILON).drawer).toBeGreaterThan(0);
    expect(sampleFilingCabinetPose(1.65)).toEqual({
      drawer: 0,
      paperY: CABINET_PAPER.seatY,
      paperZ: CABINET_PAPER.closedZ,
    });
  });

  it('keeps the entire falling paper ahead of the .54 roof front with .06 clearance', () => {
    for (const time of TIMES.filter((t) => t >= 0.7 && t <= 1.1)) {
      const pose = sampleFilingCabinetPose(time);
      expect(pose.drawer).toBe(CABINET_DRAWER_TRAVEL);
      const rearEdge = pose.paperZ - CABINET_PAPER.depth / 2;
      expect(rearEdge).toBeCloseTo(0.6, 14);
      expect(rearEdge).toBeGreaterThan(0.54);
      expect(rearEdge - 0.54).toBeCloseTo(0.06, 14);
    }
  });

  it('seats the three-sheet group on the floor and only then carries it with the drawer', () => {
    // The one paperY origin moves all three sheets together. The bottom sheet contacts
    // the floor surface (.2 + half the .06 floor), not the floor centre.
    expect(CABINET_PAPER.seatY).toBeCloseTo(0.2 + 0.06 / 2 + CABINET_PAPER.thickness / 2, 14);
    for (const time of TIMES) {
      const pose = sampleFilingCabinetPose(time);
      within(pose.drawer, 0, CABINET_DRAWER_TRAVEL);
      within(pose.paperY, CABINET_PAPER.seatY, CABINET_PAPER.startY);
      within(pose.paperZ, CABINET_PAPER.closedZ, 0.88);
      if (pose.paperY < CABINET_PAPER.startY && pose.paperY > CABINET_PAPER.seatY) {
        expect(pose.drawer).toBe(CABINET_DRAWER_TRAVEL);
      }
      if (time <= 1.15) {
        expect(pose.paperZ).toBe(0.88);
      } else {
        expect(pose.paperY).toBe(CABINET_PAPER.seatY);
        expect(pose.paperZ).toBe(CABINET_PAPER.closedZ + pose.drawer);
      }
      if (time >= 1.1) expect(pose.paperY).toBe(CABINET_PAPER.seatY);
    }
  });
});

describe('reservoir fill/drain', () => {
  it.each([false, true])('has exact rest/settled levels and finite flow, down=%s', (down) => {
    const from = down ? RESERVOIR_SIZE.high : RESERVOIR_SIZE.low;
    const to = down ? RESERVOIR_SIZE.low : RESERVOIR_SIZE.high;
    expect(sampleReservoirPose(0.2, down)).toEqual({ level: from, flow: 0 });
    expect(sampleReservoirPose(0.2 + EPSILON, down).flow).toBeGreaterThan(0);
    expect(sampleReservoirPose(0.75, down).level).toBeCloseTo(0.49, 14);
    expect(sampleReservoirPose(0.75, down).flow).toBe(1);
    expect(sampleReservoirPose(1.3 - EPSILON, down).flow).toBeGreaterThan(0);
    expect(sampleReservoirPose(1.3, down)).toEqual({ level: to, flow: 0 });
  });

  it.each([false, true])('is monotonic, bounded and quiet outside the action, down=%s', (down) => {
    let previous: number = down ? RESERVOIR_SIZE.high : RESERVOIR_SIZE.low;
    for (const time of [...TIMES].sort((a, b) => a - b)) {
      const pose = sampleReservoirPose(time, down);
      within(pose.level, RESERVOIR_SIZE.low, RESERVOIR_SIZE.high);
      within(pose.flow, 0, 1);
      if (down) expect(pose.level).toBeLessThanOrEqual(previous);
      else expect(pose.level).toBeGreaterThanOrEqual(previous);
      if (time <= 0.2 || time >= 1.3) expect(pose.flow).toBe(0);
      const p = down
        ? (RESERVOIR_SIZE.high - pose.level) / 0.66
        : (pose.level - RESERVOIR_SIZE.low) / 0.66;
      expect(pose.flow).toBeCloseTo(4 * p * (1 - p), 12);
      previous = pose.level;
    }
  });
});

describe('storage seekability', () => {
  it.each(SAMPLERS)('%s stays finite and continuous across every boundary', (_id, sample) => {
    for (const time of TIMES) expect(Object.values(sample(time)).every(Number.isFinite)).toBe(true);
    for (const boundary of BOUNDARIES) {
      const at = Object.values(sample(boundary));
      const before = Object.values(sample(boundary - EPSILON));
      const after = Object.values(sample(boundary + EPSILON));
      for (const [index, value] of at.entries()) {
        expect(Math.abs(before[index] - value)).toBeLessThan(0.0001);
        expect(Math.abs(after[index] - value)).toBeLessThan(0.0001);
      }
    }
  });

  it.each(SAMPLERS)('%s treats invalid times as rest', (_id, sample) => {
    for (const time of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const pose = sample(time);
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
      expect(pose).toEqual(sample(0));
    }
  });

  it.each(
    SAMPLERS,
  )('%s is unchanged by repeated, reversed or shuffled frame requests', (_id, sample) => {
    const reference = TIMES.map((time) => structuredClone(sample(time)));
    const indexes = TIMES.map((_, index) => index);
    const shuffled = [...indexes].sort(
      (a, b) => ((a * 37) % indexes.length) - ((b * 37) % indexes.length),
    );
    for (const order of [indexes, [...indexes].reverse(), shuffled, shuffled]) {
      for (const index of order) expect(sample(TIMES[index])).toEqual(reference[index]);
    }
  });

  it.each(
    SAMPLERS,
  )('%s holds the exact final pose with no idle motion', (_id, sample, settledAt) => {
    const settled = sample(settledAt);
    for (const time of [
      settledAt + EPSILON,
      settledAt + 1 / 30,
      2,
      5,
      100,
      1e6,
      Number.MAX_VALUE,
    ]) {
      expect(sample(time)).toEqual(settled);
    }
    expect(sample(-1e6)).toEqual(sample(0));
  });
});
