import type React from 'react';
import { LeverRig } from './hero-props/kinetic';
import { sampleLeverage } from './mechanisms/leverage-poses';
import { MechanismStage } from './mechanisms/MechanismStage';
import { useSceneTime } from './stage';
import type { LeverageScene as LeverageData } from './types';

export const LeverageScene: React.FC<{ scene: LeverageData }> = ({ scene }) => {
  const pose = sampleLeverage(useSceneTime().t, scene);
  return (
    <MechanismStage title={scene.label}>
      <group scale={1.75} position={[0, 0.15, 0]} rotation={[0, -0.12, 0]}>
        <LeverRig pivotX={pose.pivotX} angle={pose.angle} />
      </group>
    </MechanismStage>
  );
};
