import type { ReactElement } from 'react';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { diagramPose } from '../../diagrams/motion';
import { useSceneTime } from '../../stage';
import { VariationRangeDiagram } from './variation-range-Diagram';
import { VariationRangeModels } from './variation-range-models';
import { variationRangePose } from './variation-range-poses';
import type { ExpansionProbabilityVariationRangeScene } from './variation-range-types';

/** Local dispatch only: the parent owns global registration. One shared studio, zero canvas in diagram. */
export function VariationRangeView({
  scene,
}: {
  scene: ExpansionProbabilityVariationRangeScene;
}): ReactElement {
  const { t } = useSceneTime();
  const pose = variationRangePose(scene, t);
  const diagram = <VariationRangeDiagram scene={scene} pose={pose} />;
  return (
    <>
      <HybridStage
        scene={scene}
        handoffBeat="response"
        model={<VariationRangeModels scene={scene} pose={pose} />}
        diagram={diagram}
      />
      {/* Keep numerical comparisons in the same meet-projected plane during the clay handoff. */}
      {scene.visualMode === 'hybrid' && (
        <DiagramSurface opacity={diagramPose(pose.time, scene, 'response').modelOpacity}>
          {diagram}
        </DiagramSurface>
      )}
    </>
  );
}
