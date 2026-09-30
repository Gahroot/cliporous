import type React from 'react';
import { useEffect, useMemo } from 'react';
import { ExtrudeGeometry, Shape } from 'three';
import { Clay, type HeroPropDef, type HeroPropProps, lathe } from '../hero-kit';
import { Cable, RoundedBlock, Shaft } from '../mechanisms/primitives';
import { mixHex } from '../palette';
import { useSceneTime, useStage } from '../stage';
import {
  type MetronomePose,
  sampleMetronomePose,
  sampleWateringCanPose,
  sampleWrenchPose,
  WATERING_CAN,
  type WateringCanPose,
  WRENCH_GEOMETRY,
} from './tools-poses';

export type MetronomeRigProps = MetronomePose;

/** Pose-only pyramid metronome. Pendulum angle is radians about its fixed lower pivot. */
export const MetronomeRig: React.FC<MetronomeRigProps> = ({ angle }) => {
  const S = useStage();
  const body = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-0.72, -0.93);
    shape.lineTo(0.72, -0.93);
    shape.lineTo(0.28, 1.02);
    shape.lineTo(-0.28, 1.02);
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, {
      depth: 0.5,
      bevelEnabled: true,
      bevelSize: 0.04,
      bevelThickness: 0.04,
      bevelSegments: 3,
    });
    geometry.translate(0, 0, -0.3);
    return geometry;
  }, []);
  useEffect(() => () => body.dispose(), [body]);
  return (
    <group>
      <mesh>
        <primitive object={body} attach="geometry" dispose={null} />
        <Clay color={S.clay[0]} />
      </mesh>
      <RoundedBlock size={[1.54, 0.14, 0.69]} at={[0, -0.98, -0.04]} color={S.clay[2]} />
      <RoundedBlock size={[0.36, 1.55, 0.035]} at={[0, 0.15, 0.25]} color={S.clay[2]} />
      {[-0.43, -0.21, 0.01, 0.23, 0.45, 0.67, 0.89].map((y) => (
        <RoundedBlock key={y} size={[0.26, 0.018, 0.016]} at={[0, y, 0.275]} color={S.paper} />
      ))}
      <group position={[0, -0.61, 0.33]} rotation={[0, 0, angle]}>
        <RoundedBlock size={[0.042, 1.72, 0.045]} at={[0, 0.64, 0]} color={S.paper} />
        {/* Sliding counterweight stays attached to the rod; no independent ambient bobbing. */}
        <RoundedBlock size={[0.24, 0.25, 0.15]} at={[0, 1.14, 0.035]} color={S.accent} />
        <mesh position={[0, -0.18, 0]}>
          <sphereGeometry args={[0.105, 16, 12]} />
          <Clay color={S.clay[2]} />
        </mesh>
      </group>
      <group position={[0, -0.61, 0.38]}>
        <Shaft radius={0.09} length={0.13} color={S.accent2} />
      </group>
    </group>
  );
};

export type WateringCanRigProps = Pick<WateringCanPose, 'tilt'>;
const SPOUT_PATH = [
  [0.34, -0.21, 0],
  [0.59, -0.04, 0],
  [0.82, 0.21, 0],
  [0.98, 0.43, 0],
] as const;
const ROSE_ANGLE = -Math.atan2(0.14, 0.03);
const ROSE_HOLES = [
  [0, 0],
  [-0.065, -0.04],
  [0, -0.075],
  [0.065, -0.04],
  [-0.065, 0.04],
  [0, 0.075],
  [0.065, 0.04],
] as const;

/**
 * Pose-only body, handle and rose. Origin = body centre, tilt = radians about Z.
 * The outlet is WATERING_CAN.spout before rotation; wateringCanSpout(tilt) locates it.
 * No drops, receiver, canvas or time hooks: relay scenes own their shared local space.
 */
export const WateringCanRig: React.FC<WateringCanRigProps> = ({ tilt }) => {
  const S = useStage();
  const body = useMemo(
    () =>
      lathe(
        [
          [0, -0.46],
          [0.32, -0.46],
          [0.43, -0.4],
          [0.47, -0.27],
          [0.47, 0.22],
          [0.43, 0.36],
          [0.35, 0.4],
          [0.3, 0.4],
          [0.35, 0.33],
          [0.39, 0.19],
          [0.39, -0.29],
          [0, -0.35],
        ],
        32,
      ),
    [],
  );
  useEffect(() => () => body.dispose(), [body]);
  return (
    <group rotation={[0, 0, tilt]}>
      <mesh>
        <primitive object={body} attach="geometry" dispose={null} />
        <Clay color={S.clay[0]} />
      </mesh>
      <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.38, 32]} />
        <Clay color={mixHex(S.clay[0], S.clay[2], 0.65)} />
      </mesh>
      <mesh position={[-0.48, 0.05, 0]} scale={[0.86, 1.12, 1]}>
        <torusGeometry args={[0.35, 0.07, 10, 36]} />
        <Clay color={S.clay[1]} />
      </mesh>
      <Cable points={SPOUT_PATH} radius={0.078} color={S.clay[0]} />
      <group position={[...WATERING_CAN.spout]} rotation={[0, 0, ROSE_ANGLE]}>
        <mesh position={[0, -0.075, 0]}>
          <cylinderGeometry args={[0.16, 0.075, 0.15, 24]} />
          <Clay color={S.clay[1]} />
        </mesh>
        {ROSE_HOLES.map(([x, z]) => (
          <mesh key={`${x}:${z}`} position={[x, 0.002, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.014, 8]} />
            <Clay color={S.clay[2]} />
          </mesh>
        ))}
      </group>
    </group>
  );
};

export type WateringStreamProps = Pick<WateringCanPose, 'drops'>;

/** Eight spherical droplets, positioned by the pure sampler in the same space as the can. */
export const WateringStream: React.FC<WateringStreamProps> = ({ drops }) => {
  const S = useStage();
  return (
    <group>
      {drops.slice(0, WATERING_CAN.drops).map((drop) => (
        <mesh key={drop.id} position={[...drop.position]} visible={drop.visible}>
          <sphereGeometry args={[0.038, 12, 8]} />
          <Clay color={S.accent2} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
};

const Metronome: React.FC<HeroPropProps> = ({ at }) => {
  const { t } = useSceneTime();
  return <MetronomeRig {...sampleMetronomePose(t - at)} />;
};

const WateringCan: React.FC<HeroPropProps> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const pose = sampleWateringCanPose(t - at);
  const pot = useMemo(
    () =>
      lathe(
        [
          [0, -0.38],
          [0.2, -0.38],
          [0.29, -0.04],
          [0.33, -0.04],
          [0.33, 0.03],
          [0.27, 0.03],
          [0.24, -0.28],
          [0, -0.28],
        ],
        28,
      ),
    [],
  );
  useEffect(() => () => pot.dispose(), [pot]);
  return (
    <group position={[-0.3, 0.18, 0]} scale={0.9}>
      <WateringCanRig tilt={pose.tilt} />
      <WateringStream drops={pose.drops} />
      <group position={[...WATERING_CAN.target]}>
        <mesh>
          <primitive object={pot} attach="geometry" dispose={null} />
          <Clay color={S.clay[1]} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.27, 28]} />
          <Clay color={mixHex(S.clay[2], S.bgOuter, 0.25 + 0.45 * pose.received)} />
        </mesh>
        {/* A wet patch belongs to the soil and appears only AFTER the first droplet lands. */}
        <mesh
          position={[0, 0.004, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={Math.max(0.001, pose.received)}
          visible={pose.received > 0}
        >
          <circleGeometry args={[0.24, 28]} />
          <Clay color={mixHex(S.clay[2], S.accent2, 0.3)} />
        </mesh>
      </group>
    </group>
  );
};

const Wrench: React.FC<HeroPropProps> = ({ at, tone }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const pose = sampleWrenchPose(t - at, tone === 'down');
  const geometries = useMemo(() => {
    const jaw = WRENCH_GEOMETRY.jawHalfGap;
    const toolShape = new Shape();
    toolShape.moveTo(-jaw, 0.27);
    toolShape.lineTo(-0.34, 0.33);
    toolShape.quadraticCurveTo(-0.43, 0.02, -0.32, -0.27);
    toolShape.quadraticCurveTo(-0.26, -0.39, -0.12, -0.4);
    toolShape.lineTo(-0.1, -1.03);
    toolShape.quadraticCurveTo(-0.1, -1.15, 0, -1.15);
    toolShape.quadraticCurveTo(0.1, -1.15, 0.1, -1.03);
    toolShape.lineTo(0.12, -0.4);
    toolShape.quadraticCurveTo(0.26, -0.39, 0.32, -0.27);
    toolShape.quadraticCurveTo(0.43, 0.02, 0.34, 0.33);
    toolShape.lineTo(jaw, 0.27);
    toolShape.lineTo(jaw, -0.1);
    toolShape.quadraticCurveTo(jaw, -0.23, 0, -0.23);
    toolShape.quadraticCurveTo(-jaw, -0.23, -jaw, -0.1);
    toolShape.closePath();
    const tool = new ExtrudeGeometry(toolShape, {
      depth: 0.09,
      bevelEnabled: true,
      bevelSize: 0.005,
      bevelThickness: 0.008,
      bevelSegments: 2,
      curveSegments: 12,
    });
    const nutShape = new Shape();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const x = Math.cos(a) * WRENCH_GEOMETRY.nutRadius;
      const y = Math.sin(a) * WRENCH_GEOMETRY.nutRadius;
      if (i === 0) nutShape.moveTo(x, y);
      else nutShape.lineTo(x, y);
    }
    nutShape.closePath();
    const nut = new ExtrudeGeometry(nutShape, {
      depth: 0.13,
      bevelEnabled: true,
      bevelSize: 0.002,
      bevelThickness: 0.005,
      bevelSegments: 2,
    });
    return { tool, nut };
  }, []);
  useEffect(
    () => () => {
      geometries.tool.dispose();
      geometries.nut.dispose();
    },
    [geometries],
  );
  return (
    <group position={[0, 0.16, 0]} scale={0.9}>
      {/* Two pipe ends and a front clamp provide an actual bolted joint for the tool. */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.46, 0.24, -0.25]} rotation={[0, 0, Math.PI / 2]}>
          <mesh>
            <cylinderGeometry args={[0.2, 0.2, 0.9, 24]} />
            <Clay color={S.clay[1]} />
          </mesh>
          <mesh position={[0, side * 0.22, 0]}>
            <cylinderGeometry args={[0.26, 0.26, 0.14, 24]} />
            <Clay color={S.clay[2]} />
          </mesh>
        </group>
      ))}
      <RoundedBlock size={[0.74, 0.46, 0.1]} at={[0, 0.24, -0.015]} color={S.clay[0]} />
      <group position={[0, 0.24, 0.055]}>
        <Shaft radius={0.085} length={0.3} color={S.clay[2]} />
        <mesh>
          <ringGeometry args={[0.09, 0.285, 32]} />
          <Clay color={S.paper} />
        </mesh>
        <group position={[0, 0, 0.014 + pose.lift]} rotation={[0, 0, pose.nutAngle]}>
          <mesh>
            <primitive object={geometries.nut} attach="geometry" dispose={null} />
            <Clay color={S.accent} />
          </mesh>
          <mesh position={[0, 0, 0.137]}>
            <circleGeometry args={[0.07, 20]} />
            <Clay color={S.clay[2]} />
          </mesh>
          <RoundedBlock size={[0.06, 0.018, 0.008]} at={[0.117, 0, 0.138]} color={S.paper} />
        </group>
        <group position={[0, -pose.gap, 0.025 + pose.lift]} rotation={[0, 0, pose.angle]}>
          <mesh>
            <primitive object={geometries.tool} attach="geometry" dispose={null} />
            <Clay color={S.clay[1]} />
          </mesh>
          <RoundedBlock size={[0.095, 0.49, 0.018]} at={[0, -0.74, 0.103]} color={S.clay[2]} />
        </group>
      </group>
    </group>
  );
};

export const TOOLS_PROPS = {
  metronome: { Model: Metronome, yaw: -0.16, framing: { scale: 1.1, y: 0.02 } },
  'watering-can': { Model: WateringCan, yaw: -0.12, framing: { scale: 1.1, y: 0.06 } },
  wrench: { Model: Wrench, yaw: -0.14, framing: { scale: 1.15, y: 0.1 } },
} satisfies Record<'metronome' | 'watering-can' | 'wrench', HeroPropDef>;
