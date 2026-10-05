import type { ReactElement } from 'react';
import { useStage } from '../../stage';
import { RetainedChoiceClay } from '../kits/constraints';
import { EvidenceDocumentClay } from '../kits/evidence';
import { TemporalStateBadgeClay } from '../kits/temporal';
import type { ExpansionKitColors } from '../scene-types';
import { type ExploreEvidencePose, exploreEvidenceRecords } from './explore-evidence-poses';
import type { ExpansionExploreEvidenceScene } from './explore-evidence-types';

/** Text is exclusively planar. Documents represent actual ordered evidence, not trial rewards. */
export function ExploreEvidenceModels({
  scene,
  pose,
  colors: supplied,
}: {
  scene: ExpansionExploreEvidenceScene;
  pose: ExploreEvidencePose;
  colors?: ExpansionKitColors;
}): ReactElement {
  const S = useStage(),
    colors = supplied ?? { surface: S.card, text: S.text, accent: S.accent, muted: S.muted };
  return <ExploreEvidenceAssembly scene={scene} pose={pose} colors={colors} />;
}
export function ExploreEvidenceAssembly({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionExploreEvidenceScene;
  pose: ExploreEvidencePose;
  colors: ExpansionKitColors;
}): ReactElement {
  return (
    <group name={`explore-evidence-${scene.storyId}`}>
      {scene.entities.map((entity, i) => (
        <RetainedChoiceClay
          key={entity.id}
          id={entity.id}
          label={entity.label}
          disposition="unresolved"
          position={[-2.7 + i * 1.8, 0.9, 0]}
          scale={0.7}
          pose={pose}
          state="retained"
          colors={colors}
        />
      ))}
      {exploreEvidenceRecords(scene).map((record, i) => (
        <EvidenceDocumentClay
          key={record.id}
          id={record.id}
          label={'label' in record ? record.label : record.behavior}
          source={record.optionId}
          placement={{
            position: [-2.75 + (i % 6) * 1.1, -0.15 - Math.floor(i / 6) * 0.85, 0],
            scale: 0.55,
          }}
          pose={{ ...pose, reveal: i === 0 ? pose.action : pose.response }}
          state={
            record.state === 'unknown' || record.state === 'missing'
              ? 'unknown'
              : record.state === 'disputed'
                ? 'disputed'
                : 'active'
          }
          colors={colors}
        />
      ))}
      <TemporalStateBadgeClay
        id="ordered-source-history"
        label="Source order"
        history="retained"
        position={[0, -1.2, 0]}
        scale={0.65}
        pose={pose}
        state="retained"
        colors={colors}
      />
    </group>
  );
}
