import { describe, expect, it } from 'vitest';
import type { FeedbackControlScene } from '../types';
import {
  FEEDBACK_TARGET,
  type FeedbackControlPose,
  sampleFeedbackControl,
} from './feedback-control-poses';

const EPSILON = 1e-6;
const HIGH_READING = 0.84;
const REST: FeedbackControlPose = {
  gauge: { value: 0.5, target: 0.5 },
  valve: { open: 1 },
  sensor: { active: 0, signal: 0 },
};
const SETTLED: FeedbackControlPose = {
  gauge: { value: 0.5, target: 0.5 },
  valve: { open: 0.25 },
  sensor: { active: 0, signal: 1 },
};
const cases: { name: string; scene: FeedbackControlScene; duration: number }[] = [
  {
    name: 'minimum gaps and final hold / 3.5s',
    scene: {
      kind: 'feedback-control',
      label: 'Catch the drift',
      exceedAt: 0.8,
      senseAt: 1.35,
      correctAt: 1.9,
      settleAt: 2.9,
    },
    duration: 3.5,
  },
  {
    name: 'off-frame beats / 5.2s',
    scene: {
      kind: 'feedback-control',
      label: 'Catch the drift',
      exceedAt: 0.413,
      senseAt: 1.327,
      correctAt: 2.219,
      settleAt: 4.537,
    },
    duration: 5.2,
  },
  {
    name: 'long correction / 8s',
    scene: {
      kind: 'feedback-control',
      label: 'Catch the drift',
      exceedAt: 0,
      senseAt: 0.55,
      correctAt: 1.1,
      settleAt: 7.4,
    },
    duration: 8,
  },
  {
    name: 'long detection and command waits / 8s',
    scene: {
      kind: 'feedback-control',
      label: 'Catch the drift',
      exceedAt: 0.2,
      senseAt: 2.8,
      correctAt: 6.4,
      settleAt: 7.4,
    },
    duration: 8,
  },
];

function values(pose: FeedbackControlPose): number[] {
  return [
    pose.gauge.value,
    pose.gauge.target,
    pose.valve.open,
    pose.sensor.active,
    pose.sensor.signal,
  ];
}

// Include internal authored sub-beats as well as all four public beat boundaries.
function boundaries(scene: FeedbackControlScene): number[] {
  return [
    scene.exceedAt,
    scene.exceedAt + 0.35,
    scene.senseAt,
    scene.senseAt + 0.18,
    scene.correctAt - 0.08,
    scene.correctAt,
    scene.correctAt + 0.32,
    scene.settleAt,
  ];
}

function samples(duration: number, scene: FeedbackControlScene): number[] {
  return [
    ...Array.from({ length: Math.ceil((duration + 1) * 60) }, (_, frame) => (frame - 30) / 60),
    ...boundaries(scene).flatMap((time) => [time - EPSILON, time, time + EPSILON]),
  ].sort((a, b) => a - b);
}

describe.each(cases)('feedback control: $name', ({ scene, duration }) => {
  it('holds the illustrative target until exceedAt, then finishes rising before sensing', () => {
    expect(FEEDBACK_TARGET).toBe(0.5);
    for (const time of [-1e6, -1, 0, scene.exceedAt - EPSILON, scene.exceedAt]) {
      expect(sampleFeedbackControl(time, scene)).toEqual(REST);
    }
    const firstRise = sampleFeedbackControl(scene.exceedAt + EPSILON, scene);
    expect(firstRise.gauge.value).toBeGreaterThan(0.5);
    expect(firstRise.sensor).toEqual(REST.sensor);
    expect(firstRise.valve).toEqual(REST.valve);
    expect(sampleFeedbackControl(scene.exceedAt + 0.175, scene).gauge.value).toBeCloseTo(0.67, 12);
    expect(scene.exceedAt + 0.35).toBeLessThan(scene.senseAt);
    expect(sampleFeedbackControl(scene.exceedAt + 0.35 - EPSILON, scene).gauge.value).toBeLessThan(
      HIGH_READING,
    );
    for (const time of [scene.exceedAt + 0.35, scene.senseAt - EPSILON, scene.senseAt]) {
      expect(sampleFeedbackControl(time, scene)).toEqual({
        ...REST,
        gauge: { value: HIGH_READING, target: 0.5 },
      });
    }
  });

  it('starts the visible sensor response at senseAt and delivers the command before actuation', () => {
    expect(sampleFeedbackControl(scene.senseAt - EPSILON, scene).sensor).toEqual(REST.sensor);
    expect(sampleFeedbackControl(scene.senseAt, scene).sensor).toEqual(REST.sensor);
    const firstResponse = sampleFeedbackControl(scene.senseAt + EPSILON, scene);
    expect(firstResponse.sensor.active).toBeGreaterThan(0);
    expect(firstResponse.sensor.signal).toBeGreaterThan(0);
    expect(firstResponse.valve.open).toBe(1);
    expect(firstResponse.gauge.value).toBe(HIGH_READING);
    expect(sampleFeedbackControl(scene.senseAt + 0.09, scene).sensor.active).toBeCloseTo(0.5, 12);
    expect(sampleFeedbackControl(scene.senseAt + 0.18, scene).sensor.active).toBe(1);
    const signalMidpoint = (scene.senseAt + scene.correctAt - 0.08) / 2;
    expect(sampleFeedbackControl(signalMidpoint, scene).sensor.signal).toBeCloseTo(0.5, 12);
    expect(scene.senseAt + 0.18).toBeLessThan(scene.correctAt - 0.08);
    expect(
      sampleFeedbackControl(scene.correctAt - 0.08 - EPSILON, scene).sensor.signal,
    ).toBeLessThan(1);
    for (const time of [scene.correctAt - 0.08, scene.correctAt - EPSILON, scene.correctAt]) {
      const pose = sampleFeedbackControl(time, scene);
      expect(pose.sensor).toEqual({ active: 1, signal: 1 });
      expect(pose.valve.open).toBe(1);
      expect(pose.gauge.value).toBe(HIGH_READING);
    }
  });

  it('closes the valve only after sensing, and changes pressure only after the valve has moved', () => {
    const valveAt = scene.correctAt + 0.32;
    const firstValveChange = sampleFeedbackControl(scene.correctAt + EPSILON, scene);
    expect(firstValveChange.valve.open).toBeLessThan(1);
    expect(firstValveChange.gauge.value).toBe(HIGH_READING);
    expect(firstValveChange.sensor).toEqual({ active: 1, signal: 1 });
    const midValve = sampleFeedbackControl(scene.correctAt + 0.16, scene);
    expect(midValve.valve.open).toBeCloseTo(0.625, 12);
    expect(midValve.gauge.value).toBe(HIGH_READING);
    expect(sampleFeedbackControl(valveAt - EPSILON, scene).valve.open).toBeGreaterThan(0.25);
    expect(sampleFeedbackControl(valveAt, scene)).toEqual({
      gauge: { value: HIGH_READING, target: 0.5 },
      valve: { open: 0.25 },
      sensor: { active: 1, signal: 1 },
    });
    const firstCorrection = sampleFeedbackControl(valveAt + EPSILON, scene);
    expect(firstCorrection.valve.open).toBe(0.25);
    expect(firstCorrection.gauge.value).toBeLessThan(HIGH_READING);
    expect(firstCorrection.sensor.active).toBeLessThan(1);
    const midCorrection = sampleFeedbackControl((valveAt + scene.settleAt) / 2, scene);
    expect(midCorrection.gauge.value).toBeCloseTo(0.67, 12);
    expect(midCorrection.sensor.active).toBeCloseTo(0.5, 12);
  });

  it('bounds every reading and preserves causal ordering throughout the sampled timeline', () => {
    for (const time of samples(duration, scene)) {
      const pose = sampleFeedbackControl(time, scene);
      for (const value of values(pose)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(pose.gauge.target).toBe(0.5);
      expect(pose.gauge.value).toBeGreaterThanOrEqual(0.5);
      expect(pose.gauge.value).toBeLessThanOrEqual(HIGH_READING);
      expect(pose.valve.open).toBeGreaterThanOrEqual(0.25);
      if (time <= scene.senseAt) expect(pose.sensor).toEqual(REST.sensor);
      if (time <= scene.correctAt) expect(pose.valve.open).toBe(1);
      if (pose.valve.open < 1) {
        expect(time).toBeGreaterThan(scene.correctAt);
        expect(pose.sensor.signal).toBe(1);
      }
      if (time >= scene.exceedAt + 0.35 && time <= scene.correctAt + 0.32) {
        expect(pose.gauge.value).toBe(HIGH_READING);
      }
      if (time > scene.correctAt + 0.32) expect(pose.valve.open).toBe(0.25);
      if (time >= scene.senseAt + 0.18) {
        // Once detection is complete, the sensor's excess indication follows the gauge exactly.
        expect(pose.sensor.active).toBeCloseTo((pose.gauge.value - 0.5) / (HIGH_READING - 0.5), 12);
      }
    }
  });

  it('has one rise and one correction, with no valve reversal, signal reset, or oscillation', () => {
    let previous = sampleFeedbackControl(-1, scene);
    for (const time of samples(duration, scene)) {
      const pose = sampleFeedbackControl(time, scene);
      if (time <= scene.correctAt + 0.32) {
        expect(pose.gauge.value).toBeGreaterThanOrEqual(previous.gauge.value);
      } else {
        expect(pose.gauge.value).toBeLessThanOrEqual(previous.gauge.value);
      }
      expect(pose.valve.open).toBeLessThanOrEqual(previous.valve.open);
      expect(pose.sensor.signal).toBeGreaterThanOrEqual(previous.sensor.signal);
      if (time <= scene.correctAt + 0.32) {
        expect(pose.sensor.active).toBeGreaterThanOrEqual(previous.sensor.active);
      } else {
        expect(pose.sensor.active).toBeLessThanOrEqual(previous.sensor.active);
      }
      previous = pose;
    }
  });

  it('is finite and continuous at boundary-minus-epsilon, boundary, and boundary-plus-epsilon', () => {
    for (const time of boundaries(scene)) {
      const before = values(sampleFeedbackControl(time - EPSILON, scene));
      const at = values(sampleFeedbackControl(time, scene));
      const after = values(sampleFeedbackControl(time + EPSILON, scene));
      expect([...before, ...at, ...after].every(Number.isFinite)).toBe(true);
      for (const [index, value] of at.entries()) {
        expect(Math.abs(value - before[index])).toBeLessThan(1e-4);
        expect(Math.abs(value - after[index])).toBeLessThan(1e-4);
      }
    }
  });

  it('has matching left and right velocities at all authored phase boundaries', () => {
    const step = 1e-5;
    for (const time of boundaries(scene)) {
      const before = values(sampleFeedbackControl(time - step, scene));
      const at = values(sampleFeedbackControl(time, scene));
      const after = values(sampleFeedbackControl(time + step, scene));
      for (const [index, value] of at.entries()) {
        const leftVelocity = (value - before[index]) / step;
        const rightVelocity = (after[index] - value) / step;
        expect(Math.abs(leftVelocity - rightVelocity)).toBeLessThan(0.002);
      }
    }
  });

  it('reaches the exact target at settleAt and holds the entire pose for at least 0.6s', () => {
    expect(duration - scene.settleAt).toBeGreaterThanOrEqual(0.6 - Number.EPSILON * 4);
    const justBefore = sampleFeedbackControl(scene.settleAt - EPSILON, scene);
    expect(justBefore.gauge.value).toBeGreaterThan(0.5);
    expect(justBefore.sensor.active).toBeGreaterThan(0);
    for (const time of [
      scene.settleAt,
      scene.settleAt + EPSILON,
      ...Array.from({ length: 37 }, (_, frame) => scene.settleAt + frame / 60),
      duration,
      1e6,
      Number.MAX_VALUE,
    ]) {
      expect(sampleFeedbackControl(time, scene)).toEqual(SETTLED);
    }
    expect(sampleFeedbackControl(-Number.MAX_VALUE, scene)).toEqual(REST);
  });

  it('returns identical poses for shuffled, repeated, and reverse seeks without mutating the scene', () => {
    const times = samples(duration, scene);
    const frozenScene = Object.freeze({ ...scene });
    const expected = new Map(times.map((time) => [time, sampleFeedbackControl(time, frozenScene)]));
    const shuffled = [
      ...times.filter((_, index) => index % 3 === 0).reverse(),
      ...times.filter((_, index) => index % 3 !== 0),
    ];
    for (const time of [...shuffled, ...[...times].reverse(), ...shuffled]) {
      const pose = sampleFeedbackControl(time, frozenScene);
      expect(values(pose).every(Number.isFinite)).toBe(true);
      expect(pose).toEqual(expected.get(time));
    }
    expect(frozenScene).toEqual(scene);
  });

  it('depends only on scene-relative time, not an absolute frame or clock', () => {
    const offset = 32.125;
    const shifted = {
      ...scene,
      exceedAt: scene.exceedAt + offset,
      senseAt: scene.senseAt + offset,
      correctAt: scene.correctAt + offset,
      settleAt: scene.settleAt + offset,
    };
    for (const time of samples(duration, scene)) {
      const expected = values(sampleFeedbackControl(time, scene));
      const actual = values(sampleFeedbackControl(time + offset, shifted));
      for (const [index, value] of actual.entries()) expect(value).toBeCloseTo(expected[index], 11);
    }
  });
});

describe('feedback control invalid inputs', () => {
  const scene = cases[1].scene;

  it.each([
    NaN,
    Infinity,
    -Infinity,
  ])('holds a finite rest pose for invalid sample time %s', (time) => {
    expect(sampleFeedbackControl(time, scene)).toEqual(REST);
  });

  it.each([
    'exceedAt',
    'senseAt',
    'correctAt',
    'settleAt',
  ] as const)('holds a finite rest pose for every non-finite %s', (field) => {
    for (const value of [NaN, Infinity, -Infinity]) {
      const invalid = { ...scene, [field]: value };
      for (const time of [-1, scene.exceedAt, scene.correctAt, scene.settleAt, 1e6]) {
        expect(sampleFeedbackControl(time, invalid)).toEqual(REST);
      }
    }
  });

  it.each([
    { name: 'sensing before rise', changes: { senseAt: scene.exceedAt - 1 } },
    { name: 'coincident rise and sensing', changes: { senseAt: scene.exceedAt } },
    { name: 'sensing before rise completes', changes: { senseAt: scene.exceedAt + 0.2 } },
    { name: 'sensing exactly at rise completion', changes: { senseAt: scene.exceedAt + 0.35 } },
    { name: 'correction before sensing', changes: { correctAt: scene.senseAt - 0.1 } },
    { name: 'coincident sensing and correction', changes: { correctAt: scene.senseAt } },
    {
      name: 'command delivered before detection completes',
      changes: { correctAt: scene.senseAt + 0.2 },
    },
    { name: 'settling before correction', changes: { settleAt: scene.correctAt - 0.1 } },
    { name: 'coincident correction and settling', changes: { settleAt: scene.correctAt } },
    { name: 'settling before valve closes', changes: { settleAt: scene.correctAt + 0.2 } },
    { name: 'settling exactly when valve closes', changes: { settleAt: scene.correctAt + 0.32 } },
  ])('rejects an impossible schedule: $name', ({ changes }) => {
    const invalid = { ...scene, ...changes };
    for (const time of [-100, 0, 1, 2, 4, 8, 1e6]) {
      expect(sampleFeedbackControl(time, invalid)).toEqual(REST);
    }
  });
});
