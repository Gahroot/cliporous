import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { CacheStreamDiagram } from './cache-stream-Diagram';
import { CACHE_STREAM_CAMERA, CacheStreamModels } from './cache-stream-models';
import { cacheStreamPose } from './cache-stream-poses';
import type { ExpansionCacheStreamScene } from './cache-stream-types';
export function CacheStreamView({ scene }: { scene: ExpansionCacheStreamScene }): ReactElement {
  const { t } = useSceneTime(),
    S = useStage(),
    pose = cacheStreamPose(scene, t);
  const diagram = <CacheStreamDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        camera={CACHE_STREAM_CAMERA}
        diagram={null}
        model={
          <CacheStreamModels
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
