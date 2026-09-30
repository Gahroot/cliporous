import { type ParcelPose, sampleParcelPose } from '../hero-props/storage-poses';
import { sampleWateringPour, WATERING_CAN, type WateringCanPose } from '../hero-props/tools-poses';
import type { RelayScene } from './composed-types';
import { smoothPhase } from './kinematics';
import { lerpPoint, samplePolyline, type Vec3 } from './paths';

export const RELAY_BELT = { position: [0.4, -0.7, 0] as Vec3, scale: 0.6, top: -0.55 } as const;
export const RELAY_PARCEL = { position: [1.8, -0.24, 0] as Vec3, scale: 0.5 } as const;
export const RELAY_PAPER_Y = -0.525;
export const RELAY_CAN = { position: [-1.35, 0.6, 0] as Vec3, scale: 0.8 } as const;
export const RELAY_SOIL: Vec3 = [2.5, -0.96, 0];
export const RELAY_SPROUT = { position: [0.65, 0, 0] as Vec3, scale: 1.05 } as const;
export const POWER_INPUT: readonly Vec3[] = [
  [-1.1533, 0.3036, 0],
  [-0.94, 0.3036, 0],
  [-0.94, -0.5, 0],
  [-0.5148, -0.5, 0],
  [-0.5148, 0.094568, 0.02876],
];
export const POWER_OUTPUT: readonly Vec3[] = [
  [0.5148, 0.094568, 0.02876],
  [0.8, 0.094568, 0],
  [0.8, -0.5, 0],
  [1.95, -0.5, 0],
  [1.95, 0.0145, 0],
];
export const IDEA_INPUT: readonly Vec3[] = [
  [-2.25, 0.33015, 0],
  [-2.25, -0.12, 0],
  [-1.0316, -0.12, 0.21],
  [-1.0316, 0.1136, 0.21],
];
export const PUZZLE_CONNECTION: readonly Vec3[] = [
  [-0.8, 0.065, 0],
  [-0.2, 0.065, 0],
  [-0.2, -0.5, 0],
  [1.236, -0.5, 0],
  [1.236, 0.119, 0],
];

export interface RelayPulse {
  position: Vec3;
  visible: boolean;
}
export interface ParcelProcessPose {
  carrier: { id: 'workpiece-0'; position: Vec3; material: 'mail' | 'steel' };
  beltDistance: number;
  parcel: ParcelPose;
  seated: boolean;
}
export type RelayPose =
  | { preset: 'unlock'; keySlide: number; keyTurn: number; boltRetract: number; doorOpen: number }
  | { preset: 'nurture'; watering: WateringCanPose; growth: number }
  | ({ preset: 'attract-process'; magnetPosition: Vec3; magnetLift: number } & ParcelProcessPose)
  | {
      preset: 'power-insight';
      batteryLevel: number;
      chipActivation: number;
      bulbGlow: number;
      input: RelayPulse;
      output: RelayPulse;
    }
  | {
      preset: 'complete-system';
      puzzleSlide: number;
      puzzleLift: number;
      connection: number;
      gearAngle: number;
      pulse: RelayPulse;
    }
  | ({
      preset: 'idea-process-result';
      bulbGlow: number;
      gearAngle: number;
      clutch: number;
      pulse: RelayPulse;
    } & ParcelProcessPose);

function pulse(path: readonly Vec3[], t: number, start: number, end: number): RelayPulse {
  return {
    position: samplePolyline(path, smoothPhase(t, start, end)).position,
    visible: t >= start && t < end,
  };
}

function process(
  scene: RelayScene,
  t: number,
  moveAt: number,
  from: number,
  material: 'mail' | 'steel',
): ParcelProcessPose {
  const seatAt = scene.outcomeAt - 0.4;
  const travel = smoothPhase(t, moveAt, seatAt);
  const distance = (RELAY_PARCEL.position[0] - from) * travel;
  return {
    carrier: { id: 'workpiece-0', position: [from + distance, RELAY_PAPER_Y, 0], material },
    beltDistance: distance / RELAY_BELT.scale,
    parcel: sampleParcelPose(1.5 * smoothPhase(t, seatAt, scene.outcomeAt)),
    seated: t >= seatAt,
  };
}

/** All six relays share an absolute, finite timeline. Receiving action follows actual contact. */
export function sampleRelayPose(scene: RelayScene, time: number): RelayPose {
  const t = Number.isFinite(time) ? Math.min(time, scene.outcomeAt) : scene.sourceAt - 1;
  const { sourceAt, transferAt, receiveAt, outcomeAt } = scene;
  switch (scene.preset) {
    case 'unlock': {
      const releaseAt = receiveAt + 0.25 * (outcomeAt - receiveAt);
      return {
        preset: scene.preset,
        keySlide: smoothPhase(t, sourceAt, transferAt),
        keyTurn: (Math.PI / 2) * smoothPhase(t, transferAt, receiveAt),
        boltRetract: smoothPhase(t, receiveAt, releaseAt),
        doorOpen: smoothPhase(t, releaseAt, outcomeAt),
      };
    }
    case 'nurture': {
      const watering = sampleWateringPour(
        t,
        {
          tiltAt: sourceAt,
          flowAt: receiveAt - WATERING_CAN.flightSec,
          stopAt: Math.min(receiveAt + 0.32, outcomeAt - WATERING_CAN.flightSec - 0.1),
          restAt: outcomeAt,
        },
        RELAY_SOIL,
      );
      return { preset: scene.preset, watering, growth: watering.received };
    }
    case 'attract-process': {
      const grab = smoothPhase(t, sourceAt, transferAt);
      const carry = smoothPhase(t, transferAt, receiveAt);
      const magnetLift = 0.5 * smoothPhase(t, receiveAt, receiveAt + 0.2);
      const delivered = process(scene, t, receiveAt + 0.2, -0.12, 'steel');
      // A steel washer meets the lower pole tangentially, travels rigidly with it, then rests
      // on the belt until the pole clears it. No disconnected marker masquerades as cargo.
      const x = t < transferAt ? -2.35 + 1.058 * grab : -1.292 + 1.172 * carry;
      return {
        ...delivered,
        preset: scene.preset,
        carrier: {
          ...delivered.carrier,
          position: t < receiveAt ? [x, RELAY_PAPER_Y, 0] : delivered.carrier.position,
        },
        magnetPosition: [-0.72 + 1.172 * carry, -0.225 + magnetLift, 0],
        magnetLift,
      };
    }
    case 'power-insight': {
      const chipAt = receiveAt + (outcomeAt - receiveAt) * 0.25;
      const lightAt = outcomeAt - 0.2;
      return {
        preset: scene.preset,
        batteryLevel: 1 - 0.6 * smoothPhase(t, transferAt, receiveAt),
        chipActivation: smoothPhase(t, receiveAt, chipAt),
        bulbGlow: smoothPhase(t, lightAt, outcomeAt),
        input: pulse(POWER_INPUT, t, transferAt, receiveAt),
        output: pulse(POWER_OUTPUT, t, chipAt, lightAt),
      };
    }
    case 'complete-system': {
      const engagedAt = receiveAt + 0.25;
      return {
        preset: scene.preset,
        puzzleSlide: smoothPhase(t, sourceAt, transferAt),
        puzzleLift: 0.55 * (1 - smoothPhase(t, transferAt, receiveAt)),
        connection: smoothPhase(t, receiveAt, engagedAt),
        gearAngle: -Math.PI * 1.2 * smoothPhase(t, engagedAt, outcomeAt),
        pulse: pulse(PUZZLE_CONNECTION, t, receiveAt, engagedAt),
      };
    }
    case 'idea-process-result': {
      const delivered = process(scene, t, receiveAt, -0.12, 'mail');
      return {
        ...delivered,
        preset: scene.preset,
        bulbGlow: smoothPhase(t, sourceAt, transferAt),
        gearAngle: -0.7 * smoothPhase(t, transferAt, receiveAt) - delivered.beltDistance / 0.25,
        clutch: smoothPhase(t, transferAt, receiveAt),
        pulse: pulse(IDEA_INPUT, t, sourceAt, transferAt),
      };
    }
  }
}

/** Geometry-independent contact query used by invariants and shot composition. */
export function relayWorldSoil(): Vec3 {
  return lerpPoint(
    RELAY_CAN.position,
    [
      RELAY_CAN.position[0] + RELAY_SOIL[0] * RELAY_CAN.scale,
      RELAY_CAN.position[1] + RELAY_SOIL[1] * RELAY_CAN.scale,
      0,
    ],
    1,
  );
}
