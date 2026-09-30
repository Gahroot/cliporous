import { describe, expect, it } from 'vitest';
import { HERO_CATALOG, MEDIA_TIMING } from '../hero-catalog';
import {
  CLAPPER_GEOMETRY,
  sampleCameraPose,
  sampleClapperboardPose,
  sampleMicrophonePose,
} from './media-poses';

const TIMES = [
  -Number.MAX_VALUE,
  -1,
  0,
  0.25,
  0.3,
  0.65,
  0.7,
  0.8,
  0.86,
  0.9,
  0.98,
  1.04,
  1.1,
  1.17,
  1.7,
  3,
  Number.MAX_VALUE,
  ...Array.from({ length: 121 }, (_, f) => f / 30),
];
const SAMPLERS = [
  ['microphone', sampleMicrophonePose, 1.7],
  ['microphone mute', (t: number) => sampleMicrophonePose(t, true), 0.8],
  ['camera', sampleCameraPose, 1.17],
  ['clapperboard', sampleClapperboardPose, 0.9],
] as const;

function within(value: number, min: number, max: number): void {
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThanOrEqual(max);
}

describe('seekable, finite media poses', () => {
  it.each(SAMPLERS)('%s has bounded poses and exact setup/settled holds', (_, sample, settled) => {
    for (const t of TIMES) {
      for (const value of Object.values(sample(t))) within(value, 0, 1);
    }
    expect(sample(-1)).toEqual(sample(0));
    expect(sample(settled)).toEqual(sample(100));
    for (const bad of [Number.NaN, Infinity, -Infinity]) expect(sample(bad)).toEqual(sample(0));
  });

  it.each(SAMPLERS)('%s is identical on repeated and out-of-order seeks', (_, sample) => {
    const reference = TIMES.map((t) => sample(t));
    for (let i = TIMES.length - 1; i >= 0; i--) expect(sample(TIMES[i])).toEqual(reference[i]);
    expect(TIMES.map((t) => sample(t))).toEqual(reference);
  });
});

describe('microphone switch and mute', () => {
  it('enables the mic before the voice starts; the waveform has a finite envelope', () => {
    expect(sampleMicrophonePose(0)).toEqual({ enabled: 0, wave: 0 });
    for (const t of TIMES) {
      const pose = sampleMicrophonePose(t);
      if (pose.enabled < 1) expect(pose.wave).toBe(0);
    }
    expect(sampleMicrophonePose(MEDIA_TIMING.microphone)).toEqual({ enabled: 1, wave: 1 });
    expect(sampleMicrophonePose(1.7)).toEqual({ enabled: 1, wave: 0 });
  });

  it('down actually silences an initially live microphone', () => {
    expect(sampleMicrophonePose(0, true)).toEqual({ enabled: 1, wave: 1 });
    const middle = sampleMicrophonePose(0.55, true);
    expect(middle.enabled).toBeGreaterThan(0);
    expect(middle.enabled).toBeLessThan(1);
    expect(middle.wave).toBe(middle.enabled);
    expect(sampleMicrophonePose(HERO_CATALOG.microphone.downImpactSec ?? -1, true)).toEqual({
      enabled: 0,
      wave: 0,
    });
  });
});

describe('camera focus before exposure', () => {
  it('finishes focus before the release or shutter can move', () => {
    expect(sampleCameraPose(0)).toEqual({ focus: 0, shutter: 0, button: 0 });
    for (const t of TIMES) {
      const pose = sampleCameraPose(t);
      if (pose.button > 0 || pose.shutter > 0) expect(pose.focus).toBe(1);
    }
    expect(sampleCameraPose(0.7)).toEqual({ focus: 1, shutter: 0, button: 0 });
    expect(sampleCameraPose(HERO_CATALOG.camera.impactSec)).toEqual({
      focus: 1,
      shutter: 1,
      button: 1,
    });
    expect(sampleCameraPose(1.17)).toEqual({ focus: 1, shutter: 0, button: 0 });
  });

  it('seats once, holds exposure, then reopens without losing focus', () => {
    expect(sampleCameraPose(MEDIA_TIMING.camera - 0.001).shutter).toBeLessThan(1);
    expect(sampleCameraPose(1.04).shutter).toBe(1);
    expect(sampleCameraPose(1.1).shutter).toBeLessThan(1);
    expect(sampleCameraPose(1.1).shutter).toBeGreaterThan(0);
  });
});

describe('clapper contact geometry', () => {
  it('keeps the hinge fixed and never crosses below the fixed bar', () => {
    let previous: number = CLAPPER_GEOMETRY.openAngle;
    for (const t of [...TIMES].sort((a, b) => a - b)) {
      const { angle } = sampleClapperboardPose(t);
      expect(angle).toBeLessThanOrEqual(previous);
      for (const x of [0, 0.5, 1, CLAPPER_GEOMETRY.width]) {
        const bottomY = CLAPPER_GEOMETRY.contactY + Math.sin(angle) * x;
        expect(bottomY).toBeGreaterThanOrEqual(CLAPPER_GEOMETRY.contactY);
      }
      previous = angle;
    }
  });

  it('the impact cue coincides with the first full bottom-edge contact, not appearance', () => {
    const contact = HERO_CATALOG.clapperboard.impactSec;
    expect(contact).toBe(MEDIA_TIMING.clapperboard);
    expect(sampleClapperboardPose(contact - 0.001).angle).toBeGreaterThan(0);
    expect(sampleClapperboardPose(contact).angle).toBe(0);
    expect(sampleClapperboardPose(contact + 1).angle).toBe(0);
  });
});
