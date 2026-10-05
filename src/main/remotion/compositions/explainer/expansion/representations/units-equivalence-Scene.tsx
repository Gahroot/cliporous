import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { UnitsEquivalenceDiagram } from './units-equivalence-Diagram';
import { UNITS_EQUIVALENCE_CAMERA, UnitsEquivalenceModels } from './units-equivalence-models';
import { unitsEquivalencePose } from './units-equivalence-poses';
import type { ExpansionUnitsEquivalenceScene } from './units-equivalence-types';

export function UnitsEquivalenceView({
  scene,
}: {
  scene: ExpansionUnitsEquivalenceScene;
}): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = unitsEquivalencePose(scene, t);
  const diagram = <UnitsEquivalenceDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        diagram={null}
        camera={UNITS_EQUIVALENCE_CAMERA}
        model={
          <UnitsEquivalenceModels
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
