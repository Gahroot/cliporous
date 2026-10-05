import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { diagramPose } from '../../diagrams/motion';
import { useSceneTime, useStage, useWideStage } from '../../stage';
import type { ExpansionKitColors } from '../scene-types';
import { PriorityTreeDiagram, PriorityTreeFacts } from './priority-tree-Diagram';
import { PriorityTreeModels } from './priority-tree-models';
import { PRIORITY_TREE_CAMERA, type PriorityTreeViewport } from './priority-tree-poses';
import type { ExpansionPriorityTreeScene } from './priority-tree-types';

export function PriorityTreeFrame({
  scene,
  t,
  colors,
  viewport,
}: {
  scene: ExpansionPriorityTreeScene;
  t: number;
  colors: ExpansionKitColors;
  viewport?: PriorityTreeViewport;
}): ReactElement {
  const planar = (
    <>
      <PriorityTreeDiagram scene={scene} t={t} />
      <PriorityTreeFacts scene={scene} t={t} />
    </>
  );
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{planar}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        camera={PRIORITY_TREE_CAMERA}
        model={
          <PriorityTreeModels
            scene={scene}
            t={t}
            colors={colors}
            viewport={viewport}
            turn={diagramPose(t, scene).modelTurn}
          />
        }
        diagram={null}
      />
      {/* No precision evidence crossfade: topology, priorities and factual pages remain planar. */}
      <DiagramSurface>{planar}</DiagramSurface>
    </>
  );
}
export function PriorityTreeView({ scene }: { scene: ExpansionPriorityTreeScene }): ReactElement {
  const { t } = useSceneTime(),
    S = useStage(),
    wide = useWideStage();
  const viewport = wide
    ? {
        width: wide.model.width,
        height: wide.model.height,
        surface: { x: 0, y: 0, width: wide.model.width, height: wide.model.height },
      }
    : undefined;
  return (
    <PriorityTreeFrame
      scene={scene}
      t={t}
      viewport={viewport}
      colors={{ surface: S.card, text: S.text, accent: S.accent, muted: S.muted }}
    />
  );
}
