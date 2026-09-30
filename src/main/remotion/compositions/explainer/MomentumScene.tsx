import type React from 'react';
import { Clay } from './hero-kit';
import { FlywheelRig } from './hero-props/kinetic';
import { ConveyorRig } from './hero-props/transport';
import { Parcel } from './hero-props/transport-models';
import { BELT_LENGTH, BELT_RADIUS, sampleBeltPoint } from './hero-props/transport-poses';
import { MechanismStage, useCompactMechanism } from './mechanisms/MechanismStage';
import { sampleMomentum } from './mechanisms/momentum-poses';
import type { Vec3 } from './mechanisms/paths';
import { Cable, Shaft, Wheel } from './mechanisms/primitives';
import { useSceneTime, useStage } from './stage';
import type { MomentumScene as MomentumData } from './types';

// Equal-radius drive pulleys, two units apart, in a plane clear of BOTH rigs.
// The cable touches their rims; every tread uses the conveyor's signed distance.
const DRIVE_Z = 1.18;
const DRIVE_PATH: readonly Vec3[] = Array.from({ length: 49 }, (_, id): Vec3 => {
  const point = sampleBeltPoint((id * BELT_LENGTH) / 48);
  return [point.x, point.y, 0];
});
const DRIVE_TREADS = [0, 1, 2, 3, 4, 5] as const;

export const MomentumScene: React.FC<{ scene: MomentumData }> = ({ scene }) => {
  const S = useStage();
  const compact = useCompactMechanism();
  const pose = sampleMomentum(useSceneTime().t, scene);
  return (
    <MechanismStage title={scene.label}>
      {/* The oblique view exposes the axial clutch instead of hiding it behind the pulley. */}
      <group position={[0.15, -0.16, 0]} rotation={[0, 0.42, 0]} scale={compact ? 1.25 : 1.18}>
        <group position={[-2, 0, 0]}>
          <FlywheelRig angle={pose.flywheel.angle} push={pose.flywheel.push} />
        </group>
        <group position={[1, 0.12, 0]}>
          <ConveyorRig distance={pose.output.distance} />
          {/* One persistent parcel stays wholly on the straight run, including the final hold. */}
          <group name="cargo-0" position={[pose.output.tokenX, BELT_RADIUS + 0.14, 0]}>
            <Parcel size={0.28} color={S.accent2} />
          </group>
        </group>

        <group position={[-2, 0.12, 0]}>
          {/* Input shaft meets the flywheel hub (z=.2) and the fixed input friction face. */}
          <group position={[0, 0, 0.325]}>
            <Shaft radius={0.09} length={0.25} color={S.clay[2]} />
          </group>
          <group position={[0, 0, 0.48]} rotation={[0, 0, pose.flywheel.angle]}>
            <Shaft radius={0.22} length={0.08} color={S.clay[1]} />
          </group>
          {/* Face-to-face contact is exactly z=.52: no teeth/interpenetration or angle snap.
              It closes BEFORE torque transfers, then slips briefly while speeds synchronize. */}
          <group
            position={[0, 0, 0.565 + 0.28 * (1 - pose.clutch)]}
            rotation={[0, 0, pose.output.angle]}
          >
            <Shaft radius={0.22} length={0.09} color={S.accent} />
          </group>
          <group position={[0, 0, (0.565 + DRIVE_Z) / 2]}>
            <Shaft radius={0.075} length={DRIVE_Z - 0.565} color={S.clay[2]} />
          </group>
        </group>
        {/* Output extension meets the conveyor's existing left roller hub at z=.35. */}
        <group position={[0, 0.12, (0.35 + DRIVE_Z) / 2]}>
          <Shaft radius={0.055} length={DRIVE_Z - 0.35} color={S.clay[2]} />
        </group>
        <group position={[-1, 0.12, DRIVE_Z]}>
          <Cable points={DRIVE_PATH} radius={0.028} color={S.clay[2]} />
          {[-1, 1].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <Shaft radius={BELT_RADIUS - 0.028} length={0.12} color={S.clay[1]} />
              <group position={[0, 0, 0.07]}>
                <Wheel radius={0.19} angle={pose.output.angle} spokes={4} color={S.accent} />
              </group>
            </group>
          ))}
          {DRIVE_TREADS.map((id) => {
            const point = sampleBeltPoint((id * BELT_LENGTH) / 6 + pose.output.distance);
            return (
              <mesh key={id} position={[point.x, point.y, 0]} rotation={[0, 0, point.angle]}>
                <boxGeometry args={[0.055, 0.064, 0.075]} />
                <Clay color={S.accent} />
              </mesh>
            );
          })}
        </group>
      </group>
    </MechanismStage>
  );
};
