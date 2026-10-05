import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import { TaxonomyRightsDiagram } from './taxonomy-rights-Diagram';
import { TAXONOMY_RIGHTS_CAMERA, TaxonomyRightsModels } from './taxonomy-rights-models';
import { taxonomyRightsPose } from './taxonomy-rights-poses';
import type { ExpansionTaxonomyRightsScene } from './taxonomy-rights-types';

export function TaxonomyRightsView({
  scene,
}: {
  scene: ExpansionTaxonomyRightsScene;
}): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = taxonomyRightsPose(scene, t);
  const diagram = <TaxonomyRightsDiagram scene={scene} pose={pose} />;
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <HybridStage
        scene={scene}
        camera={TAXONOMY_RIGHTS_CAMERA}
        model={
          <TaxonomyRightsModels
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
