import type React from 'react';
import { Clay } from './hero-kit';
import { ReservoirRig } from './hero-props/storage';
import { RESERVOIR_SIZE } from './hero-props/storage-poses';
import { clamp01 } from './mechanisms/kinematics';
import { MechanismStage, useCompactMechanism } from './mechanisms/MechanismStage';
import type { Vec3 } from './mechanisms/paths';
import { Cable, RoundedBlock, Shaft, Wheel } from './mechanisms/primitives';
import { sampleResourceLeak } from './mechanisms/resource-leak-poses';
import { useSceneTime, useStage } from './stage';
import type { ResourceLeakScene as ResourceLeakData } from './types';

const DRAIN_X = [-0.4, 0.4] as const;
const SPOUT: readonly Vec3[] = [
  [0, 0, 0],
  [0, 0, 0.2],
  [0, -0.08, 0.31],
  [0, -0.16, 0.31],
];
const BASIN_BOTTOM = -1.4;
// Tank cross-section matches ReservoirRig's visible fill; the catch tray retains all escaped volume.
const TANK_CAPACITY = 1.26 * 0.56 * RESERVOIR_SIZE.fillHeight;
const BASIN_AREA = 2 * 0.8;

export const ResourceLeakScene: React.FC<{ scene: ResourceLeakData }> = ({ scene }) => {
  const S = useStage();
  const compact = useCompactMechanism();
  const pose = sampleResourceLeak(useSceneTime().t, scene);
  const caughtHeight = (pose.escaped * TANK_CAPACITY) / BASIN_AREA;
  const caughtTop = BASIN_BOTTOM + caughtHeight;
  const streamTop = -0.61;
  const streamWidth = Math.sqrt(pose.leakOpen);
  return (
    <MechanismStage title={scene.label}>
      <group rotation={[0, -0.16, 0]} position={[0.1, 0.18, 0]} scale={compact ? 1.62 : 1.52}>
        <ReservoirRig level={pose.level} flow={clamp01(pose.inletRate * 4)} />
        {DRAIN_X.map((x) => (
          <group key={x} position={[x, -0.45, 0.44]}>
            {/* Two authored outlet taps, both below the lowest waterline. */}
            <Cable points={SPOUT} radius={0.075} color={S.clay[1]} />
            <Shaft radius={0.13} length={0.09} color={S.clay[2]} />
            <group position={[0, 0.02, 0.15]}>
              <Wheel
                radius={0.15}
                angle={((1 - pose.leakOpen) * Math.PI) / 2}
                spokes={3}
                color={S.accent}
              />
              <group rotation={[0, 0, ((1 - pose.leakOpen) * Math.PI) / 2]}>
                <RoundedBlock size={[0.27, 0.05, 0.04]} at={[0, 0, 0.06]} color={S.paper} />
              </group>
            </group>
          </group>
        ))}
        {DRAIN_X.map((x) => (
          <mesh
            key={`stream-${x}`}
            position={[x, (streamTop + caughtTop) / 2, 0.75]}
            scale={[
              Math.max(0.001, streamWidth),
              streamTop - caughtTop,
              Math.max(0.001, streamWidth),
            ]}
            visible={pose.leakRate > 0}
          >
            <cylinderGeometry args={[0.033, 0.033, 1, 12]} />
            <Clay color={S.accent2} roughness={0.35} />
          </mesh>
        ))}
        <RoundedBlock size={[2.2, 0.1, 1]} at={[0, BASIN_BOTTOM - 0.05, 0.84]} color={S.clay[1]} />
        {[-1.05, 1.05].map((x) => (
          <RoundedBlock
            key={x}
            size={[0.1, 0.34, 1]}
            at={[x, BASIN_BOTTOM + 0.17, 0.84]}
            color={S.clay[0]}
          />
        ))}
        <RoundedBlock size={[2, 0.34, 0.1]} at={[0, BASIN_BOTTOM + 0.17, 0.39]} color={S.clay[0]} />
        {/* A frosted front keeps the caught volume visible, without expensive transmission. */}
        <RoundedBlock
          size={[2, 0.055, 0.1]}
          at={[0, BASIN_BOTTOM + 0.0275, 1.29]}
          color={S.clay[0]}
        />
        <mesh position={[0, BASIN_BOTTOM + 0.17, 1.295]}>
          <planeGeometry args={[2, 0.34]} />
          <meshPhysicalMaterial
            color={S.paper}
            roughness={0.7}
            transparent
            opacity={0.11}
            depthWrite={false}
          />
        </mesh>
        <mesh
          position={[0, BASIN_BOTTOM + caughtHeight / 2, 0.84]}
          scale={[1, Math.max(0.001, caughtHeight), 1]}
          visible={caughtHeight > 0}
        >
          <boxGeometry args={[2, 1, 0.8]} />
          <Clay color={S.accent2} roughness={0.35} />
        </mesh>
      </group>
    </MechanismStage>
  );
};
