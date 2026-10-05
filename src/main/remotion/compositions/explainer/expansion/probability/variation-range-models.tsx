import type { ReactElement } from 'react';
import { useStage } from '../../stage';
import { EvidenceDocumentClay } from '../kits/evidence';
import { PrecisionPlotClay } from '../kits/plots';
import { PopulationMarkClay } from '../kits/population';
import type { ExpansionKitColors } from '../scene-types';
import {
  type VariationRangePose,
  variationRangeDomain,
  variationRangeMagnitude,
  variationRangeModelPosition,
  variationRangeRecords,
} from './variation-range-poses';
import type { ExpansionProbabilityVariationRangeScene } from './variation-range-types';

/** Instruments and count tokens, not perspective-scaled quantitative bars. All precision stays planar. */
export function VariationRangeModels({
  scene,
  pose,
}: {
  scene: ExpansionProbabilityVariationRangeScene;
  pose: VariationRangePose;
}): ReactElement {
  const S = useStage();
  const colors: ExpansionKitColors = {
    surface: S.card,
    text: S.text,
    accent: S.accent,
    muted: S.muted,
  };
  const records = variationRangeRecords(scene),
    domain = variationRangeDomain(scene);
  return (
    <group>
      {records.map((record, index) => {
        const value = variationRangeMagnitude(record.quantity),
          position = variationRangeModelPosition(index);
        const localPose = { ...pose, reveal: pose.records[index].reveal };
        return (
          <group
            key={record.id}
            visible={localPose.reveal > 0}
            position={position}
            userData={{
              recordId: record.id,
              actor: record.quantity.actor,
              state: record.quantity.state,
            }}
          >
            <PrecisionPlotClay
              records={[record]}
              basis={record.quantity.basis}
              domain={domain}
              colors={colors}
              state="retained"
              pose={localPose}
              position={[0, 0, 0]}
              scale={0.48}
            />
            {scene.storyId === '13' &&
              record.quantity.basis.unit === 'count' &&
              value &&
              value.denominator === 1 &&
              value.numerator > 0 && (
                <PopulationMarkClay
                  member={{
                    id: record.id,
                    membership: [scene.populationId],
                    state: 'retained',
                    represents: { state: 'known', value },
                  }}
                  state="retained"
                  colors={colors}
                  pose={localPose}
                  placement={{ position: [0, 0, 0.15], scale: 0.8 }}
                />
              )}
          </group>
        );
      })}
      {scene.storyId === '14' && (
        <EvidenceDocumentClay
          id={scene.actorId}
          label={scene.subject}
          source={scene.period}
          state="retained"
          colors={colors}
          pose={pose}
          placement={{ position: [0, -0.5, 0], scale: 0.6 }}
        />
      )}
    </group>
  );
}
