import type React from 'react';
import { LightbulbRig } from './HeroProps';
import { Clay } from './hero-kit';
import { PuzzleRig, SproutRig } from './hero-props/growth';
import { DoorRig, GearsRig, KeyRig } from './hero-props/mechanics';
import { BatteryRig } from './hero-props/mind';
import { MagnetRig } from './hero-props/signals';
import { WateringCanRig, WateringStream } from './hero-props/tools';
import { ChipRig } from './hero-props/world';
import { ParcelProcessRig, SignalPulse, SignalWire } from './mechanisms/composed-rigs';
import type { RelayScene as Scene } from './mechanisms/composed-types';
import { MechanismStage } from './mechanisms/MechanismStage';
import type { Vec3 } from './mechanisms/paths';
import {
  IDEA_INPUT,
  POWER_INPUT,
  POWER_OUTPUT,
  PUZZLE_CONNECTION,
  RELAY_CAN,
  RELAY_SPROUT,
  type RelayPose,
  sampleRelayPose,
} from './mechanisms/relay-poses';
import { mixHex } from './palette';
import { useSceneTime, useStage } from './stage';

const RETURN_WIRE: readonly Vec3[] = [
  [1.77, 0.215, 0],
  [1.65, 0.215, 0],
  [1.65, -0.9, 0],
  [-2.4148, -0.9, 0],
  [-2.4148, 0.3036, 0],
];
const DRIVE_A: Vec3 = [-1.0316, 0.1136, 0.3];
const DRIVE_B: Vec3 = [-0.2, -0.7, 0.3];
const DRIVE_RADIUS = 0.15;
function driveLoop(): Vec3[] {
  const theta = Math.atan2(DRIVE_B[1] - DRIVE_A[1], DRIVE_B[0] - DRIVE_A[0]);
  const points: Vec3[] = [];
  for (const [center, start] of [
    [DRIVE_A, theta + Math.PI / 2],
    [DRIVE_B, theta - Math.PI / 2],
  ] as const) {
    for (let i = 0; i <= 12; i++) {
      const angle = start + (Math.PI * i) / 12;
      points.push([
        center[0] + DRIVE_RADIUS * Math.cos(angle),
        center[1] + DRIVE_RADIUS * Math.sin(angle),
        center[2],
      ]);
    }
  }
  points.push(points[0]);
  return points;
}
const DRIVE_LOOP = driveLoop();

const DriveCoupling: React.FC<{ pose: Extract<RelayPose, { preset: 'idea-process-result' }> }> = ({
  pose,
}) => {
  const S = useStage();
  return (
    <group>
      <SignalWire points={DRIVE_LOOP} radius={0.014} color={S.clay[2]} />
      {[DRIVE_A, DRIVE_B].map((center) => (
        <group key={center[0]} position={[...center]} rotation={[0, 0, -pose.beltDistance / 0.25]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[DRIVE_RADIUS, DRIVE_RADIUS, 0.05, 32]} />
            <Clay color={S.clay[1]} />
          </mesh>
          <mesh position={[0.075, 0, 0.03]}>
            <sphereGeometry args={[0.025, 10, 8]} />
            <Clay color={S.accent} />
          </mesh>
        </group>
      ))}
      {/* Sliding clutch sleeve seats onto the drive shaft before paper can advance. */}
      <mesh
        position={[DRIVE_A[0], DRIVE_A[1], 0.43 - 0.11 * pose.clutch]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.065, 0.065, 0.1, 16]} />
        <Clay color={S.accent} />
      </mesh>
    </group>
  );
};

const RelayRig: React.FC<{ pose: RelayPose }> = ({ pose }) => {
  const S = useStage();
  switch (pose.preset) {
    case 'unlock':
      return (
        <group scale={1.15} rotation={[0, 0.55, 0]}>
          <DoorRig open={pose.doorOpen}>
            {/* KeyRig's local -0.45 offset must clear the slab and raised door panel.
                The oblique view exposes its shaft and teeth, not just an edge-on bow. */}
            <group position={[0.2, -0.26, 0.31]} scale={0.38}>
              <KeyRig slide={pose.keySlide} turn={pose.keyTurn} lit={pose.boltRetract} />
            </group>
            <mesh position={[0.27 + 0.18 * (1 - pose.boltRetract), -0.24, 0.13]}>
              <boxGeometry args={[0.24, 0.065, 0.06]} />
              <Clay color={S.accent2} metalness={0.2} />
            </mesh>
          </DoorRig>
        </group>
      );
    case 'nurture':
      return (
        <group>
          <group position={[...RELAY_CAN.position]} scale={RELAY_CAN.scale}>
            <WateringCanRig tilt={pose.watering.tilt} />
            <WateringStream drops={pose.watering.drops} />
          </group>
          <group position={[...RELAY_SPROUT.position]} scale={RELAY_SPROUT.scale}>
            <SproutRig grow={pose.growth} open={pose.growth} />
          </group>
        </group>
      );
    case 'attract-process':
      return (
        <group>
          <ParcelProcessRig pose={pose} />
          <mesh position={[-1.36, -0.59, 0]}>
            <boxGeometry args={[2.28, 0.08, 0.32]} />
            <Clay color={S.clay[1]} />
          </mesh>
          <group position={[...pose.magnetPosition]} rotation={[0, 0, Math.PI]} scale={0.6}>
            <MagnetRig flash={1 - pose.magnetLift * 2} />
          </group>
          <SignalWire
            points={[
              [-0.72, 0.8, -0.2],
              [0.452, 0.8, -0.2],
            ]}
            color={S.clay[2]}
            radius={0.035}
          />
        </group>
      );
    case 'power-insight':
      return (
        <group>
          <group position={[-1.8, 0.35, 0]} scale={0.58}>
            <BatteryRig
              cells={Array.from({ length: 4 }, (_, i) => {
                const fill = Math.max(0, Math.min(1, pose.batteryLevel * 4 - i));
                return {
                  color: mixHex(S.clay[2], S.positive, fill),
                  emissive: S.positive,
                  intensity: 0.22 * fill,
                  scaleY: 1,
                  pop: 1,
                };
              })}
            />
          </group>
          <group position={[0, 0.1, 0]} scale={0.52}>
            <ChipRig glow={pose.chipActivation} />
          </group>
          <group position={[1.95, 0.4, 0]} scale={0.5}>
            <LightbulbRig glow={pose.bulbGlow} />
          </group>
          <SignalWire points={POWER_INPUT} color={S.clay[2]} />
          <SignalWire points={POWER_OUTPUT} color={S.clay[2]} />
          <SignalWire points={RETURN_WIRE} color={S.clay[1]} />
          <SignalPulse pulse={pose.input} />
          <SignalPulse pulse={pose.output} />
        </group>
      );
    case 'complete-system':
      return (
        <group>
          <group position={[-1.5, 0.1, 0]} scale={0.7}>
            <PuzzleRig slide={pose.puzzleSlide} lift={pose.puzzleLift} />
          </group>
          <group position={[1.35, 0.1, 0]} scale={0.95}>
            <GearsRig a1={pose.gearAngle} />
          </group>
          <SignalWire
            points={PUZZLE_CONNECTION}
            color={mixHex(S.clay[2], S.accent, pose.connection)}
          />
          <SignalPulse pulse={pose.pulse} />
          <mesh position={[-0.8, 0.065, 0]}>
            <sphereGeometry args={[0.065, 14, 10]} />
            <Clay color={S.accent} />
          </mesh>
        </group>
      );
    case 'idea-process-result':
      return (
        <group>
          <group position={[-2.25, 0.6, 0]} scale={0.35}>
            <LightbulbRig glow={pose.bulbGlow} />
          </group>
          <group position={[-0.95, 0.1, 0.21]} scale={0.68}>
            <GearsRig a1={pose.gearAngle} />
          </group>
          <SignalWire points={IDEA_INPUT} color={S.clay[2]} />
          <SignalPulse pulse={pose.pulse} />
          <ParcelProcessRig pose={pose} />
          <DriveCoupling pose={pose} />
        </group>
      );
  }
};

export const RelayScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const { t } = useSceneTime();
  return (
    <MechanismStage title={scene.label}>
      <RelayRig pose={sampleRelayPose(scene, t)} />
    </MechanismStage>
  );
};
