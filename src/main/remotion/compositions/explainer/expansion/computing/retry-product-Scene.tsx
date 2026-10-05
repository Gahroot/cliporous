import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { RetryProductDiagram } from './retry-product-Diagram';
import { RETRY_PRODUCT_CAMERA, RetryProductModels } from './retry-product-models';
import { retryProductPose } from './retry-product-poses';
import type { ExpansionRetryProductScene } from './retry-product-types';

export function RetryProductView({ scene }: { scene: ExpansionRetryProductScene }): ReactElement {
  const { t } = useSceneTime(),
    S = useStage(),
    pose = retryProductPose(scene, t);
  const persistentDiagramSurface = (
    <DiagramSurface>
      <RetryProductDiagram scene={scene} pose={pose} />
    </DiagramSurface>
  );
  if (scene.visualMode === 'diagram')
    return (
      <DiagramStage scene={scene}>
        <RetryProductDiagram scene={scene} pose={pose} />
      </DiagramStage>
    );
  return (
    <>
      <HybridStage
        scene={scene}
        camera={RETRY_PRODUCT_CAMERA}
        diagram={null}
        model={
          <RetryProductModels
            scene={scene}
            pose={pose}
            colors={{ surface: S.card, text: S.text, accent: S.accent, muted: S.muted }}
          />
        }
      />
      {persistentDiagramSurface}
    </>
  );
}
