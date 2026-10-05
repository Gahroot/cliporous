import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { FitScaleDiagram } from './fit-scale-Diagram';
import { FitScaleModels } from './fit-scale-models';
import { fitScalePose } from './fit-scale-poses';
import type { ExpansionFitScaleScene } from './fit-scale-types';
export function FitScaleView({ scene }: { scene: ExpansionFitScaleScene }): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = fitScalePose(scene, t);
  const diagram = <FitScaleDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        diagram={null}
        model={
          <FitScaleModels
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
