import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { RankingCalendarDiagram } from './ranking-calendar-Diagram';
import { RANKING_CALENDAR_CAMERA, RankingCalendarModels } from './ranking-calendar-models';
import { rankingCalendarPose } from './ranking-calendar-poses';
import type { ExpansionRankingCalendarScene } from './ranking-calendar-types';

export function RankingCalendarView({
  scene,
}: {
  scene: ExpansionRankingCalendarScene;
}): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = rankingCalendarPose(scene, t);
  const diagram = <RankingCalendarDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        diagram={null}
        camera={RANKING_CALENDAR_CAMERA}
        model={
          <RankingCalendarModels
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
