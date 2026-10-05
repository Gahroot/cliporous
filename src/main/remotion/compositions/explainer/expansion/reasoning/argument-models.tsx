import type { ReactElement } from 'react';
import { ClaimPlaqueClay, EvidenceDocumentClay, ScopeTabClay } from '../kits/evidence';
import type { ExpansionKitColors } from '../scene-types';
import { type ArgumentPose, argumentModelPosition } from './argument-poses';
import type { ExpansionReasoningArgumentScene } from './argument-types';

/** Quotation stations and folded source sheets, not anonymous truth-value blocks. */
export function ArgumentModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionReasoningArgumentScene;
  pose: ArgumentPose;
  colors: ExpansionKitColors;
}): ReactElement {
  return (
    <group name={`argument-${scene.storyId}`}>
      {pose.stations.map((station, index) => {
        const node = scene.kind === 'argument-map' ? scene.nodes[index] : undefined;
        const props = {
          id: station.id,
          colors,
          pose: { ...pose, reveal: station.reveal },
          // Active means editorial attention, never affirmed/proven/retained truth.
          state: scene.resolution === 'disputed' ? ('disputed' as const) : ('unknown' as const),
          placement: { position: argumentModelPosition(index), scale: 0.6 },
        };
        return node?.role === 'claim' ? (
          <ClaimPlaqueClay key={station.id} {...props} claim={node.statement} />
        ) : (
          <EvidenceDocumentClay
            key={station.id}
            {...props}
            label={node?.role ?? 'alternative'}
            source={station.actorId}
          />
        );
      })}
      {scene.condition && (
        <ScopeTabClay
          id={`argument-${scene.storyId}-condition`}
          colors={colors}
          pose={pose}
          state="unknown"
          scope="Source assumption"
          version="Stated"
          placement={{ position: [0, -1.05, 0], scale: 0.65 }}
        />
      )}
    </group>
  );
}
