import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { SearchLandscapeDiagram } from './search-landscape-Diagram';
import { SearchLandscapeModels } from './search-landscape-models';
import type { ExpansionSearchLandscapeScene } from './search-landscape-types';

/** Parent owns dispatch and source fixtures. HybridStage owns the sole shared studio canvas. */
export function SearchLandscapeView({
  scene,
}: {
  scene: ExpansionSearchLandscapeScene;
}): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const diagram = <SearchLandscapeDiagram scene={scene} t={t} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        handoffBeat="action"
        model={
          <SearchLandscapeModels
            scene={scene}
            t={t}
            colors={{ surface: S.card, text: S.text, accent: S.accent, muted: S.muted }}
          />
        }
        diagram={null}
      />
      <DiagramSurface>{diagram}</DiagramSurface>
    </>
  );
}
