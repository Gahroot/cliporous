import type React from 'react';
import { Quaternion, Vector3 } from 'three';
import { Clay } from './hero-kit';
import { PressureGaugeRig, ValveRig } from './hero-props/transport';
import { sampleFeedbackControl } from './mechanisms/feedback-control-poses';
import { MechanismStage, useCompactMechanism } from './mechanisms/MechanismStage';
import type { Vec3 } from './mechanisms/paths';
import { Cable, RoundedBlock, Shaft } from './mechanisms/primitives';
import { mixHex } from './palette';
import { useSceneTime, useStage } from './stage';
import type { FeedbackControlScene as FeedbackControlData } from './types';

const VALVE_TILT = 0.38;
const VALVE_POSITION: [number, number, number] = [-1.22, -0.55, 0];
const GAUGE_POSITION: [number, number, number] = [1.42, 0.5, 0];
const SENSOR_POSITION: [number, number, number] = [-0.35, 1.12, 0];

// Fixed authored routes. Cable owns memoized/disposed geometry; no per-frame path rebuilding.
const PRESSURE_PIPE: readonly Vec3[] = [
  [-0.03, -0.55, 0], // The valve outlet ends at local x=1.19.
  [0.65, -0.55, 0],
  [1.02, -0.8, -0.045],
  [1.33, -0.82, -0.045],
  [1.42, -0.72, -0.045], // The gauge stem ends at local y=-1.22.
];
const SENSE_WIRE: readonly Vec3[] = [
  [0.82, 1.15, -0.055], // Gauge casing, clear of both needle and target notch.
  [0.17, 1.12, 0],
];
const COMMAND_WIRE: readonly Vec3[] = [
  [-0.59, 0.77, 0.1],
  [VALVE_POSITION[0], VALVE_POSITION[1] + Math.cos(VALVE_TILT) * 1.02, Math.sin(VALVE_TILT) * 1.02],
];
const commandDirection = new Vector3(...COMMAND_WIRE[1]).sub(new Vector3(...COMMAND_WIRE[0]));
const COMMAND_LENGTH = commandDirection.length();
const COMMAND_ROTATION = new Quaternion().setFromUnitVectors(
  new Vector3(0, 0, 1),
  commandDirection.normalize(),
);

/** Three readable actors, one canvas, and only the source label as editorial text. */
export const FeedbackControlScene: React.FC<{ scene: FeedbackControlData }> = ({ scene }) => {
  const S = useStage();
  const compact = useCompactMechanism();
  const pose = sampleFeedbackControl(useSceneTime().t, scene);
  const responseColor = mixHex(S.clay[2], S.accent2, pose.sensor.active);
  return (
    <MechanismStage title={scene.label}>
      {/* A triangle, not a wide row: the gauge remains legible in the 610×600 longform card. */}
      <group position={[0, -0.1, 0]} scale={compact ? 1.2 : 1.13}>
        <Cable points={PRESSURE_PIPE} radius={0.14} color={S.clay[1]} />
        <Cable points={SENSE_WIRE} radius={0.035} color={responseColor} />
        <Cable points={COMMAND_WIRE} radius={0.035} color={S.clay[2]} />

        <group position={GAUGE_POSITION}>
          <PressureGaugeRig {...pose.gauge} />
        </group>
        <group position={VALVE_POSITION} rotation={[VALVE_TILT, 0, 0]}>
          {/* This inlet closes: the standalone rig's bead reset is intentionally not displayed. */}
          <ValveRig open={pose.valve.open} flow={0} showFlow={false} />
        </group>

        <group position={SENSOR_POSITION}>
          <RoundedBlock size={[1.04, 0.7, 0.32]} color={S.clay[1]} />
          <RoundedBlock size={[0.86, 0.52, 0.07]} at={[0, 0, 0.18]} color={S.card} />
          <group position={[0, 0, 0.24]}>
            <Shaft radius={0.205} length={0.055} color={S.clay[2]} />
            <mesh position={[0, 0, 0.035]} scale={[1, 1, 0.4]}>
              <sphereGeometry args={[0.15, 24, 16]} />
              <Clay
                color={responseColor}
                emissive={S.accent2}
                emissiveIntensity={0.3 * pose.sensor.active}
              />
            </mesh>
          </group>
          {[-1, 1].map((side) => (
            <RoundedBlock
              key={side}
              size={[0.075, 0.25, 0.04]}
              at={[side * 0.33, 0, 0.235]}
              color={responseColor}
            />
          ))}
        </group>

        {/* Reveal a single command along the straight cable. Only transforms change: no
            new tube geometry, travelling fluid, gate crossing, or periodic particle reset.
            It reaches the fixed handwheel hub before correction and fades with the excess. */}
        <group position={[...COMMAND_WIRE[0]]} quaternion={COMMAND_ROTATION}>
          <group scale={[pose.sensor.active, pose.sensor.active, pose.sensor.signal]}>
            <group position={[0, 0, COMMAND_LENGTH / 2]}>
              <Shaft radius={0.06} length={COMMAND_LENGTH} color={S.accent2} />
            </group>
          </group>
        </group>
      </group>
    </MechanismStage>
  );
};
