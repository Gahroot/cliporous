import type { ReactElement } from 'react';
import { DiagramStage, DiagramSurface } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { DIAGRAM_REGIONS } from '../../diagrams/layout';
import { longformTextRegions } from '../../longform-stage-layout';
import { StageSpace, useSceneTime, useStage, useWideStage } from '../../stage';
import { RegionsDimensionsDiagram } from './regions-dimensions-Diagram';
import { RegionsDimensionsModels } from './regions-dimensions-models';
import { regionsConditionFit, regionsDimensionsPose } from './regions-dimensions-poses';
import type { ExpansionRegionsDimensionsScene } from './regions-dimensions-types';

export function RegionsDimensionsCondition({
  scene,
}: {
  scene: ExpansionRegionsDimensionsScene;
}): ReactElement | null {
  const S = useStage();
  const wide = useWideStage();
  if (!scene.condition) return null;
  const region = wide ? longformTextRegions(wide).condition : DIAGRAM_REGIONS.condition;
  const fit = regionsConditionFit(scene.condition, region.width, Boolean(wide));
  return (
    <StageSpace>
      <div
        data-regions-condition="true"
        style={{
          position: 'absolute',
          left: region.x,
          top: region.y,
          width: region.width,
          fontFamily: S.font,
          fontSize: fit.fontSize,
          lineHeight: fit.leading,
          color: S.text,
          textAlign: wide ? 'left' : 'center',
          whiteSpace: 'pre',
        }}
      >
        {fit.lines.join('\n')}
      </div>
    </StageSpace>
  );
}

export function RegionsDimensionsView({
  scene,
}: {
  scene: ExpansionRegionsDimensionsScene;
}): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = regionsDimensionsPose(scene, t);
  const diagram = <RegionsDimensionsDiagram scene={scene} pose={pose} />;
  const chromeScene = { ...scene, condition: undefined };
  if (scene.visualMode === 'diagram')
    return (
      <>
        <DiagramStage scene={chromeScene}>{diagram}</DiagramStage>
        <RegionsDimensionsCondition scene={scene} />
      </>
    );
  return (
    <>
      <HybridStage
        scene={chromeScene}
        diagram={null}
        model={
          <RegionsDimensionsModels
            scene={scene}
            pose={pose}
            colors={{ surface: S.card, text: S.text, accent: S.accent, muted: S.muted }}
          />
        }
      />
      <DiagramSurface>{diagram}</DiagramSurface>
      <RegionsDimensionsCondition scene={scene} />
    </>
  );
}
