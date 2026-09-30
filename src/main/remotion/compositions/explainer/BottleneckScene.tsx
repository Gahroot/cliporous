import type React from 'react';
import { Clay } from './hero-kit';
import { ConveyorRig } from './hero-props/transport';
import { Parcel } from './hero-props/transport-models';
import { sampleBottleneck } from './mechanisms/bottleneck-poses';
import { MechanismStage } from './mechanisms/MechanismStage';
import { Token } from './mechanisms/primitives';
import { useSceneTime, useStage } from './stage';
import type { BottleneckScene as BottleneckData } from './types';

export const BottleneckScene: React.FC<{ scene: BottleneckData }> = ({ scene }) => {
  const S = useStage();
  const pose = sampleBottleneck(useSceneTime().t, scene);
  return (
    <MechanismStage title={scene.label}>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 1.775, -0.35, 0]}>
          <ConveyorRig distance={pose.distance} halfLength={1.5} />
        </group>
      ))}
      {/* Transfer plate bridges the roller noses; parcels retain their y=-.1 support plane. */}
      <mesh name="transfer-plate" position={[0, -0.125, 0]}>
        <boxGeometry args={[0.55, 0.05, 0.68]} />
        <Clay color={S.clay[2]} />
      </mesh>
      {/* A fixed guide and a rising gate: the opening is clear before the queue moves. */}
      {[-0.26, 0.26].map((x) => (
        <group key={x} position={[x, 0.38, -0.43]} scale={[0.1, 1.5, 0.12]}>
          <Token size={1} color={S.clay[1]} />
        </group>
      ))}
      <group position={[0, 1.08, -0.08]} scale={[0.76, 0.16, 0.85]}>
        <Token size={1} color={S.clay[1]} />
      </group>
      <group position={[0, 0.16 + pose.gate * 0.62, 0]} scale={[0.34, 0.55, 0.7]}>
        <Token size={1} color={S.accent} />
      </group>
      {pose.tokens.map((token) => (
        <group key={token.id} name={`cargo-${token.id}`} position={[token.x, 0.02, 0]}>
          <Parcel size={0.24} color={token.id % 2 === 0 ? S.accent2 : S.accent} />
        </group>
      ))}
    </MechanismStage>
  );
};
