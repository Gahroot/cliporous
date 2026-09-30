import { describe, expect, it } from 'vitest';
import { WATERING_CAN, wateringCanSpout } from '../hero-props/tools-poses';
import { RELAY_PRESETS, type RelayPreset, type RelayScene } from './composed-types';
import {
  RELAY_BELT,
  RELAY_CAN,
  RELAY_PARCEL,
  RELAY_SOIL,
  relayWorldSoil,
  sampleRelayPose,
} from './relay-poses';

const scene = (preset: RelayPreset): RelayScene => ({
  kind: 'relay',
  preset,
  label: 'Source phrase',
  sourceAt: 0.3,
  transferAt: 1.2,
  receiveAt: 2.2,
  outcomeAt: 4.2,
});
function finite(value: unknown): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value)).toBe(true);
    expect(Math.abs(value)).toBeLessThan(100);
  } else if (value && typeof value === 'object')
    for (const entry of Object.values(value)) finite(entry);
}
describe('bounded shared-clock relay poses', () => {
  it.each(RELAY_PRESETS)('%s is seekable, finite and exactly settled', (preset) => {
    const s = scene(preset);
    for (const t of [3.2, 0, 1.2, 2.2, 1.6, 4.2, 100]) {
      const pose = sampleRelayPose(s, t);
      finite(pose);
      expect(pose).toEqual(sampleRelayPose(s, t));
    }
    expect(sampleRelayPose(s, 100)).toEqual(sampleRelayPose(s, s.outcomeAt));
  });
  it('inserts before turning, retracts the bolt before moving the hinged door', () => {
    const s = scene('unlock');
    for (let frame = 0; frame <= 140; frame++) {
      const p = sampleRelayPose(s, frame / 30);
      if (p.preset !== 'unlock') throw new Error('wrong preset');
      if (p.keyTurn > 0) expect(p.keySlide).toBe(1);
      if (p.boltRetract > 0) expect(p.keyTurn).toBe(Math.PI / 2);
      if (p.doorOpen > 0) expect(p.boltRetract).toBe(1);
    }
  });
  it('grows only after water reaches soil; stream starts at the actual rose', () => {
    const s = scene('nurture');
    const first = sampleRelayPose(s, s.receiveAt - WATERING_CAN.flightSec);
    if (first.preset !== 'nurture') throw new Error('wrong preset');
    expect(first.watering.drops).toHaveLength(WATERING_CAN.drops);
    expect(first.watering.drops[0].position).toEqual(wateringCanSpout(first.watering.tilt));
    expect(first.growth).toBe(0);
    const arrival = sampleRelayPose(s, s.receiveAt);
    if (arrival.preset !== 'nurture') throw new Error('wrong preset');
    expect(arrival.watering.drops[0].position).toEqual(RELAY_SOIL);
    expect(relayWorldSoil()[1]).toBeCloseTo(-0.168, 12);
    expect(RELAY_CAN.position[0] + RELAY_SOIL[0] * RELAY_CAN.scale).toBeCloseTo(0.65, 12);
    const end = sampleRelayPose(s, s.outcomeAt);
    if (end.preset !== 'nurture') throw new Error('wrong preset');
    expect(end.growth).toBeCloseTo(1);
    expect(end.watering.tilt).toBeCloseTo(0, 15);
    expect(end.watering.drops.every((drop) => !drop.visible)).toBe(true);
  });
  it('holds a magnetic tangent contact until landing, then clears before belt motion', () => {
    const s = scene('attract-process');
    for (const t of [s.transferAt, 1.7, s.receiveAt]) {
      const p = sampleRelayPose(s, t);
      if (p.preset !== 'attract-process') throw new Error('wrong preset');
      expect(p.magnetPosition[0] - 0.72 * 0.6 - p.carrier.position[0]).toBeCloseTo(0.14, 12);
      expect(p.beltDistance).toBe(0);
    }
    for (const t of [2.25, 2.35]) {
      const p = sampleRelayPose(s, t);
      if (p.preset !== 'attract-process') throw new Error('wrong preset');
      expect(p.beltDistance).toBe(0);
    }
  });
  it.each([
    'attract-process',
    'idea-process-result',
  ] as const)('%s retains one workpiece through supported packing', (preset) => {
    const s = scene(preset);
    for (const t of [2.5, 3, 3.8, 4, 4.2]) {
      const p = sampleRelayPose(s, t);
      if (p.preset !== preset) throw new Error('wrong preset');
      expect(p.carrier.id).toBe('workpiece-0');
      expect(p.carrier.position[1] - 0.025).toBeCloseTo(RELAY_BELT.top, 12);
      expect(p.carrier.position[0] + 0.12).toBeCloseTo(p.beltDistance * RELAY_BELT.scale, 12);
      if (p.parcel.sideAngle > 0) {
        expect(p.seated).toBe(true);
        expect(p.carrier.position[0]).toBeCloseTo(RELAY_PARCEL.position[0], 12);
      }
    }
  });
  it('activates chip only after the input arrives and bulb only after output arrival', () => {
    const s = scene('power-insight');
    for (const t of [0.3, 1.2, 2.19, 2.2, 2.6, 3, 4, 4.2]) {
      const p = sampleRelayPose(s, t);
      if (p.preset !== 'power-insight') throw new Error('wrong preset');
      if (t <= s.receiveAt) expect(p.chipActivation).toBe(0);
      if (t <= s.outcomeAt - 0.2) expect(p.bulbGlow).toBe(0);
      if (p.bulbGlow > 0) {
        expect(p.chipActivation).toBe(1);
        expect(p.output.visible).toBe(false);
      }
    }
  });
  it('seats the puzzle, completes its connection, then runs the gears', () => {
    const s = scene('complete-system');
    for (const t of [0, 1.2, 2, 2.3, 2.6, 4.2]) {
      const p = sampleRelayPose(s, t);
      if (p.preset !== 'complete-system') throw new Error('wrong preset');
      if (p.connection > 0) {
        expect(p.puzzleSlide).toBe(1);
        expect(p.puzzleLift).toBe(0);
      }
      if (p.gearAngle !== 0) expect(p.connection).toBe(1);
    }
  });
  it('engages idea drive before mail advances; gears and belt keep the same travel ratio', () => {
    const s = scene('idea-process-result');
    for (const t of [2.3, 2.8, 3.4, 4.2]) {
      const p = sampleRelayPose(s, t);
      if (p.preset !== 'idea-process-result') throw new Error('wrong preset');
      expect(p.clutch).toBe(1);
      expect(p.gearAngle + 0.7).toBeCloseTo(-p.beltDistance / 0.25, 12);
    }
  });
});
