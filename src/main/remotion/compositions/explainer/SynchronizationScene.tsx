import type React from 'react';
import { Clay } from './hero-kit';
import { MetronomeRig } from './hero-props/tools';
import { ConveyorRig } from './hero-props/transport';
import { MailRig, SignalWire } from './mechanisms/composed-rigs';
import type { SynchronizationScene as Scene } from './mechanisms/composed-types';
import { MechanismStage } from './mechanisms/MechanismStage';
import { SYNC_BELT_SCALE, sampleSynchronizationPose } from './mechanisms/synchronization-poses';
import { useSceneTime, useStage } from './stage';

export const SynchronizationScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = sampleSynchronizationPose(scene, t);
  return (
    <MechanismStage title={scene.label}>
      <group position={[-1.22, -0.7, 0]} scale={SYNC_BELT_SCALE}>
        <ConveyorRig distance={pose.leftDistance} />
      </group>
      <group position={[1.22, -0.7, 0]} scale={SYNC_BELT_SCALE}>
        <ConveyorRig distance={pose.rightDistance} />
      </group>
      {/* Both conveyor tops and the bridge are y=-0.475; mail's bottom is on that plane. */}
      <mesh position={[0, -0.515, 0]}>
        <boxGeometry args={[0.64, 0.08, 0.65]} />
        <Clay color={S.clay[1]} />
      </mesh>
      <group position={[0, 0.75, 0]} scale={0.6}>
        <MetronomeRig angle={pose.metronomeAngle} />
      </group>
      <SignalWire
        points={[
          [-1.22, -0.72, -0.3],
          [-1.22, 0.35, -0.3],
          [0, 0.35, -0.3],
          [1.22, 0.35, -0.3],
          [1.22, -0.72, -0.3],
        ]}
        color={S.clay[2]}
        radius={0.015}
      />
      <group position={[-0.33, -0.37 + pose.gateLift, 0]}>
        <mesh>
          <boxGeometry args={[0.08, 0.16, 0.66]} />
          <Clay color={pose.phaseError === 0 ? S.positive : S.accent} />
        </mesh>
      </group>
      <group position={[...pose.carrier.position]}>
        <MailRig />
      </group>
    </MechanismStage>
  );
};
