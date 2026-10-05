import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { EnergyFieldDiagram } from './energy-field-Diagram';
import { ENERGY_FIELD_CAMERA, EnergyFieldModels } from './energy-field-models';
import { energyFieldPose } from './energy-field-poses';
import type { ExpansionEnergyFieldScene } from './energy-field-types';
export function EnergyFieldView({ scene }: { scene: ExpansionEnergyFieldScene }): ReactElement {
  const { t } = useSceneTime(),
    S = useStage(),
    pose = energyFieldPose(scene, t);
  const diagram = <EnergyFieldDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        camera={ENERGY_FIELD_CAMERA}
        diagram={null}
        model={
          <EnergyFieldModels
            scene={scene}
            pose={pose}
            colors={{ surface: S.card, text: S.text, accent: S.accent, muted: S.muted }}
          />
        }
      />
      <DiagramSurface>{diagram}</DiagramSurface>
    </>
  );
}
