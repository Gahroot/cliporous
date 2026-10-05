import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { DenominatorPartitionDiagram } from './denominator-partition-Diagram';
import {
  DENOMINATOR_PARTITION_CAMERA,
  DenominatorPartitionModels,
} from './denominator-partition-models';
import { denominatorPartitionPose } from './denominator-partition-poses';
import type { ExpansionDenominatorPartitionScene } from './denominator-partition-types';

export function DenominatorPartitionView({
  scene,
}: {
  scene: ExpansionDenominatorPartitionScene;
}): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = denominatorPartitionPose(scene, t);
  const diagram = <DenominatorPartitionDiagram scene={scene} pose={pose} />;
  // Unbounded source strings belong to the fixed-font paged lens, not the shared
  // chrome's short-title slots. These headings describe the view, not an outcome.
  const chrome = {
    ...scene,
    label: scene.storyId === '19' ? 'Amounts and references' : 'Parts and whole',
    outcome: 'Source details in lens',
    condition: undefined,
  };
  if (scene.visualMode === 'diagram') return <DiagramStage scene={chrome}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={chrome}
        camera={DENOMINATOR_PARTITION_CAMERA}
        model={
          <DenominatorPartitionModels
            scene={scene}
            pose={pose}
            colors={{ surface: S.card, text: S.text, accent: S.accent, muted: S.muted }}
          />
        }
        diagram={null}
      />
      <DiagramSurface>{diagram}</DiagramSurface>
    </>
  );
}
