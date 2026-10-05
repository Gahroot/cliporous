import type { ReactElement } from 'react';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { Stage3D } from '../../Stage3D';
import { useSceneTime, useStage } from '../../stage';
import { DeviationMultiplesDiagram } from './deviation-multiples-Diagram';
import { DEVIATION_MULTIPLES_CAMERA, DeviationMultiplesModels } from './deviation-multiples-models';
import { deviationMultiplesPose } from './deviation-multiples-poses';
import type { ExpansionDeviationMultiplesScene } from './deviation-multiples-types';

/** Same complete planar facts in both modes. Source chrome is paged, never squeezed. */
export function DeviationMultiplesView({
  scene,
}: {
  scene: ExpansionDeviationMultiplesScene;
}): ReactElement {
  const { t } = useSceneTime(),
    S = useStage(),
    pose = deviationMultiplesPose(scene, t);
  const diagram = (
    <DiagramSurface>
      <DeviationMultiplesDiagram scene={scene} pose={pose} />
    </DiagramSurface>
  );
  if (scene.visualMode === 'diagram') return diagram;
  return (
    <>
      <Stage3D
        camera={DEVIATION_MULTIPLES_CAMERA}
        driftDeg={0}
        pushAmount={0}
        bobAmount={0}
        groundY={-1.4}
        shadowScale={9}
      >
        <DeviationMultiplesModels
          scene={scene}
          pose={pose}
          colors={{ surface: S.card, text: S.text, accent: S.accent, muted: S.muted }}
        />
      </Stage3D>
      {diagram}
    </>
  );
}
