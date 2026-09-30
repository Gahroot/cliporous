/** Seekable clay mechanisms. Rigs accept poses; wrappers alone sample scene time. */
import type React from 'react';
import { useEffect, useMemo } from 'react';
import { CatmullRomCurve3, Shape, TubeGeometry, Vector3 } from 'three';
import { Clay, type HeroPropDef, type HeroPropProps } from '../hero-kit';
import { clamp01, leverPose, pulleyTravel } from '../mechanisms/kinematics';
import type { Vec3 } from '../mechanisms/paths';
import { Cable, RoundedHousing, Shaft, Token, Wheel } from '../mechanisms/primitives';
import { useSceneTime, useStage } from '../stage';
import { sampleKineticPose } from './kinetic-poses';
import { Counterweight, DriveShoe, PressureFoot, PullRing } from './transport-models';

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
const TAU = Math.PI * 2;
const STRAIGHT_CABLE: readonly Vec3[] = [
  [0, 0, 0],
  [0, -1, 0],
];
const PULLEY_ARC: readonly Vec3[] = Array.from({ length: 25 }, (_, i): Vec3 => {
  const angle = Math.PI - (i * Math.PI) / 24;
  return [0.49 * Math.cos(angle), 0.49 * Math.sin(angle), 0];
});
const HELIX_CURVE = new CatmullRomCurve3(
  Array.from({ length: 177 }, (_, i) => {
    const u = i / 176;
    return new Vector3(0.4 * Math.cos(u * TAU * 5.5), 1.68 * u, 0.4 * Math.sin(u * TAU * 5.5));
  }),
  false,
  'centripetal',
);
const WEDGE = new Shape();
WEDGE.moveTo(0, 0);
WEDGE.lineTo(0.34, -0.65);
WEDGE.lineTo(-0.34, -0.65);
WEDGE.closePath();
const RATCHET_OUTLINE = new Shape();
for (let tooth = 0; tooth < 12; tooth++) {
  const start = (tooth * TAU) / 12;
  for (const [offset, radius] of [
    [0, 0.6],
    [0.05, 0.79],
    [0.13, 0.79],
    [TAU / 12 - 0.02, 0.6],
  ]) {
    const x = radius * Math.cos(start + offset);
    const y = radius * Math.sin(start + offset);
    if (tooth === 0 && offset === 0) RATCHET_OUTLINE.moveTo(x, y);
    else RATCHET_OUTLINE.lineTo(x, y);
  }
}
RATCHET_OUTLINE.closePath();
const PAWL = new Shape();
PAWL.moveTo(0.08, 0.07);
PAWL.lineTo(-0.48, 0.23);
PAWL.lineTo(-0.55, 0.16);
PAWL.lineTo(-0.5, 0.09);
PAWL.lineTo(0.06, -0.075);
PAWL.closePath();
const WEDGE_EXTRUSION = {
  depth: 0.42,
  steps: 1,
  bevelEnabled: true,
  bevelSegments: 3,
  bevelSize: 0.025,
  bevelThickness: 0.025,
};
const TOOTH_EXTRUSION = {
  depth: 0.18,
  steps: 1,
  bevelEnabled: true,
  bevelSegments: 3,
  bevelSize: 0.018,
  bevelThickness: 0.018,
};
const PAWL_EXTRUSION = { ...TOOTH_EXTRUSION, depth: 0.12, bevelSize: 0.02 };

export interface FlywheelRigProps {
  /** Unwrapped radians, supplied by the analytic spin schedule. */
  angle: number;
  /** Restrained tangential contact stroke, 0–1. */
  push: number;
}

export const FlywheelRig: React.FC<FlywheelRigProps> = ({ angle, push }) => {
  const S = useStage();
  return (
    <group>
      <group position={[0, -0.99, -0.1]} scale={[1.65, 0.17, 0.75]}>
        <Token size={1} color={S.clay[0]} />
      </group>
      <group position={[0, -0.43, -0.25]} scale={[0.4, 1.04, 0.38]}>
        <Token size={1} color={S.clay[0]} />
      </group>
      <group position={[0, 0.12, -0.08]}>
        <Shaft radius={0.18} length={0.64} color={S.clay[2]} />
      </group>
      <group position={[0, 0.12, 0]} rotation={[0, 0, finite(angle)]}>
        <Wheel radius={0.78} angle={0} spokes={5} color={S.clay[1]} />
        <mesh>
          <torusGeometry args={[0.78, 0.105, 12, 64]} />
          <Clay color={S.clay[1]} />
        </mesh>
        <group position={[0.77, 0, 0.095]}>
          <Token size={0.11} color={S.accent} />
        </group>
      </group>
      <group position={[0, 0.12, 0.2]}>
        <Shaft radius={0.12} length={0.08} color={S.accent} />
      </group>
      {/* A short tangential shoe touches the underside; the bearing never moves. */}
      <group position={[-0.13, -0.875, 0.02]} scale={[0.83, 0.13, 0.36]}>
        <Token size={1} color={S.clay[2]} />
      </group>
      <group position={[-0.16 + 0.24 * clamp01(push), -0.79, 0.015]} scale={[0.28, 0.13, 0.3]}>
        <DriveShoe color={S.accent} />
      </group>
    </group>
  );
};

export interface LeverRigProps {
  pivotX: number;
  angle: number;
}

export const LeverRig: React.FC<LeverRigProps> = ({ pivotX, angle }) => {
  const S = useStage();
  const pose = leverPose(pivotX, angle);
  return (
    <group>
      <group position={[0, -0.8, -0.02]} scale={[2.3, 0.16, 0.72]}>
        <Token size={1} color={S.clay[0]} />
      </group>
      <mesh position={[pose.pivotX, -0.06, -0.21]}>
        <extrudeGeometry args={[WEDGE, WEDGE_EXTRUSION]} />
        <Clay color={S.clay[1]} />
      </mesh>
      <group position={[pose.pivotX, 0, 0]} rotation={[0, 0, pose.angle]}>
        <group position={[-pose.pivotX, 0, 0]} scale={[2.3, 0.12, 0.3]}>
          <Token size={1} color={S.clay[2]} />
        </group>
      </group>
      <group position={[pose.pivotX, -0.06, 0.06]}>
        <Shaft radius={0.065} length={0.46} color={S.accent} />
      </group>
      {/* Both contacts use the same rigid-beam transform, including the shifted pivot. */}
      <group position={[pose.load[0], pose.load[1], 0]} rotation={[0, 0, pose.angle]}>
        <group position={[0, 0.22, 0]}>
          <Counterweight width={0.32} height={0.32} color={S.accent} />
        </group>
      </group>
      <group position={[pose.effort[0], pose.effort[1], 0]} rotation={[0, 0, pose.angle]}>
        <group position={[0, 0.16, 0]}>
          <PressureFoot width={0.2} height={0.2} color={S.accent2} />
        </group>
      </group>
    </group>
  );
};

export interface PulleyRigProps {
  /** Positive travel lifts the left load and lowers the right effort. */
  travel: number;
}

export const PulleyRig: React.FC<PulleyRigProps> = ({ travel }) => {
  const S = useStage();
  const pose = pulleyTravel(Math.max(0, Math.min(0.75, finite(travel))), 0.49);
  const loadY = -0.95 + pose.loadY;
  const effortY = -0.2 + pose.effortY;
  return (
    <group>
      <group position={[0, 1.1, -0.22]} scale={[0.85, 0.14, 0.42]}>
        <Token size={1} color={S.clay[0]} />
      </group>
      <group position={[0, 0.8, -0.17]}>
        <RoundedHousing width={0.27} height={0.65} cornerRadius={0.1} color={S.clay[0]} />
      </group>
      <group position={[0, 0.55, 0]}>
        {/* Left rising means clockwise in XY, hence the negative wheel angle. */}
        <Wheel radius={0.45} angle={-pose.wheelAngle} spokes={5} color={S.clay[1]} />
        <Cable points={PULLEY_ARC} radius={0.025} color={S.accent} />
        <Shaft radius={0.095} length={0.4} color={S.clay[2]} />
      </group>
      <group position={[-0.49, 0.55, 0]} scale={[1, 0.55 - loadY, 1]}>
        <Cable points={STRAIGHT_CABLE} radius={0.025} color={S.accent} />
      </group>
      <group position={[0.49, 0.55, 0]} scale={[1, 0.55 - effortY, 1]}>
        <Cable points={STRAIGHT_CABLE} radius={0.025} color={S.accent} />
      </group>
      <group position={[-0.49, loadY - 0.13, 0]}>
        <Counterweight width={0.28} height={0.26} color={S.clay[2]} />
      </group>
      <group position={[0.49, effortY, 0]}>
        <PullRing radius={0.085} color={S.accent2} />
      </group>
    </group>
  );
};

export interface SpringRigProps {
  /** Fraction of resting height removed; bounded to 0–0.65. */
  compression: number;
}

export const SpringRig: React.FC<SpringRigProps> = ({ compression }) => {
  const S = useStage();
  const height = 1 - Math.max(0, Math.min(0.65, finite(compression)));
  const geometry = useMemo(() => new TubeGeometry(HELIX_CURVE, 220, 0.055, 10, false), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // Scale about the fixed lower contact, not the coil centre. End plates follow wire thickness.
  const bottom = -0.895;
  return (
    <group>
      <group position={[0, bottom - 0.07, 0]} scale={[1.15, 0.14, 1.05]}>
        <Token size={1} color={S.clay[0]} />
      </group>
      <group position={[0, bottom, 0]} scale={[1, height, 1]}>
        <mesh position={[0, 0.055, 0]}>
          <primitive object={geometry} attach="geometry" dispose={null} />
          <Clay color={S.clay[1]} roughness={0.42} />
        </mesh>
      </group>
      <group position={[0, bottom + 1.765 * height + 0.07, 0]} scale={[1.15, 0.14, 1.05]}>
        <Token size={1} color={S.accent} />
      </group>
    </group>
  );
};

export interface RatchetRigProps {
  /** Monotone unwrapped wheel angle; the rig never reverses it for pawl reset. */
  angle: number;
  /** Independent reset lift in radians (authored sampler: 0–0.18). */
  pawl: number;
}

export const RatchetRig: React.FC<RatchetRigProps> = ({ angle, pawl }) => {
  const S = useStage();
  return (
    <group>
      <group position={[0, -0.1, -0.23]}>
        <RoundedHousing width={1.95} height={1.85} cornerRadius={0.24} color={S.clay[0]} />
      </group>
      <group position={[-0.15, 0, -0.09]} rotation={[0, 0, Math.max(0, finite(angle))]}>
        <mesh>
          <extrudeGeometry args={[RATCHET_OUTLINE, TOOTH_EXTRUSION]} />
          <Clay color={S.clay[1]} />
        </mesh>
        <group position={[0, 0, 0.19]}>
          <Wheel radius={0.4} angle={0} spokes={4} color={S.clay[2]} />
        </group>
      </group>
      <group position={[-0.15, 0, 0.035]}>
        <Shaft radius={0.13} length={0.51} color={S.accent} />
      </group>
      <group position={[0.95, 0.14, -0.08]} scale={[0.24, 0.32, 0.28]}>
        <Token size={1} color={S.clay[2]} />
      </group>
      <group
        position={[0.95, 0.14, 0.035]}
        rotation={[0, 0, -2.2 * Math.max(0, Math.min(0.18, finite(pawl)))]}
      >
        <mesh>
          <extrudeGeometry args={[PAWL, PAWL_EXTRUSION]} />
          <Clay color={S.accent2} />
        </mesh>
      </group>
      <group position={[0.95, 0.14, 0.09]}>
        <Shaft radius={0.07} length={0.3} color={S.clay[2]} />
      </group>
    </group>
  );
};

const Flywheel: React.FC<HeroPropProps> = ({ at }) => (
  <FlywheelRig {...sampleKineticPose(useSceneTime().t, at).flywheel} />
);
const Lever: React.FC<HeroPropProps> = ({ at }) => (
  <LeverRig {...sampleKineticPose(useSceneTime().t, at).lever} />
);
const Pulley: React.FC<HeroPropProps> = ({ at }) => (
  <PulleyRig {...sampleKineticPose(useSceneTime().t, at).pulley} />
);
const Spring: React.FC<HeroPropProps> = ({ at }) => (
  <SpringRig {...sampleKineticPose(useSceneTime().t, at).spring} />
);
const Ratchet: React.FC<HeroPropProps> = ({ at }) => (
  <RatchetRig {...sampleKineticPose(useSceneTime().t, at).ratchet} />
);

/** All tones intentionally share the default action; these are not reversible props. */
export const KINETIC_PROPS = {
  flywheel: { Model: Flywheel, yaw: -0.24, framing: { scale: 1.05, y: 0 } },
  lever: { Model: Lever, yaw: -0.2, framing: { scale: 0.96, y: 0.15 } },
  pulley: { Model: Pulley, yaw: -0.18, framing: { scale: 1, y: 0 } },
  spring: { Model: Spring, yaw: -0.3, framing: { scale: 1.05, y: 0 } },
  ratchet: { Model: Ratchet, yaw: -0.16, framing: { scale: 1.03, y: 0 } },
} satisfies Record<'flywheel' | 'lever' | 'pulley' | 'spring' | 'ratchet', HeroPropDef>;
