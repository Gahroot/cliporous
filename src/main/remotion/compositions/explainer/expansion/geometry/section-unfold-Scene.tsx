import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { SectionUnfoldDiagram } from './section-unfold-Diagram';
import { SectionUnfoldModels } from './section-unfold-models';
import { sectionUnfoldPose } from './section-unfold-poses';
import type { ExpansionSectionUnfoldScene } from './section-unfold-types';

export function SectionUnfoldView({ scene }: { scene: ExpansionSectionUnfoldScene }): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = sectionUnfoldPose(scene, t);
  const diagram = <SectionUnfoldDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        diagram={null}
        model={
          <SectionUnfoldModels
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
