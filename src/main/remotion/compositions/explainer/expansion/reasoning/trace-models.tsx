import type { ReactElement } from 'react';
import { ClaimPlaqueClay, EvidenceDocumentClay } from '../kits/evidence';
import type { ExpansionKitColors } from '../scene-types';
import {
  TRACE_DEFAULT_VIEWPORT,
  type TraceViewport,
  traceModelPlacement,
  tracePose,
} from './trace-poses';
import type { ReasoningTraceScene } from './trace-types';

/** One assembly. Precision labels and all typed relations are in its planar companion. */
export function TraceModels({
  scene,
  t,
  colors,
  viewport = TRACE_DEFAULT_VIEWPORT,
}: {
  scene: ReasoningTraceScene;
  t: number;
  colors: ExpansionKitColors;
  viewport?: TraceViewport;
}): ReactElement {
  const pose = tracePose(scene, t);
  return (
    <group name={`reasoning-trace-${scene.storyId}`}>
      {pose.entities.map((entity) => {
        const label = scene.entities.find((entry) => entry.id === entity.id)?.label ?? '';
        const placement = traceModelPlacement(entity.x, entity.y, viewport);
        const props = {
          id: entity.id,
          pose: entity.pose,
          state: entity.state,
          colors,
          placement: {
            position: [0, 0, 0] as const,
            scale: 1,
          },
        };
        return (
          <group
            key={entity.id}
            name={`projected/${entity.id}`}
            position={[...placement.position]}
            quaternion={[...placement.quaternion]}
            scale={placement.scale}
          >
            {entity.kind === 'document' || entity.kind === 'excerpt' ? (
              <EvidenceDocumentClay {...props} label={label} source={label} />
            ) : (
              <ClaimPlaqueClay {...props} claim={label} />
            )}
          </group>
        );
      })}
    </group>
  );
}
