import type React from 'react';
import { DetailInset, DetailOverlay, detailFocusOpacity } from './editorial/DetailOverlay';
import type { DetailTreatment } from './editorial/types';
import type { ExplodedViewScene as Scene } from './mechanisms/composed-types';
import { getExplodedDetailAnchor, sampleExplodedViewPose } from './mechanisms/exploded-view-poses';
import { ExplodedPartRig } from './mechanisms/exploded-view-rigs';
import { MechanismStage, useCompactMechanism } from './mechanisms/MechanismStage';
import { useRigCamera } from './Stage3D';
import { useSceneTime } from './stage';
import type { CameraSpec } from './three-helpers';

// The templates stack in Y. A front-on camera makes a gear or chip look like a bar.
// Both the stage and projected detail layer use this same authored oblique view.
const EXPLODED_CAMERA: CameraSpec = { position: [3.1, 5.2, 10.8], fov: 32 };

export const ExplodedViewScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const { t } = useSceneTime();
  const compact = useCompactMechanism();
  // Identical inputs to MechanismStage/Stage3D: one sampled camera, no inset camera/canvas.
  const camera = useRigCamera(EXPLODED_CAMERA, { driftDeg: 0, pushAmount: 0 });
  const pose = sampleExplodedViewPose(scene, t);
  const detail: DetailTreatment = scene.detail ?? {
    kind: 'tracked-callout',
    target: scene.target,
    at: scene.explainAt,
    label: scene.detailLabel,
  };
  const anchor = getExplodedDetailAnchor(pose, detail.target);
  const selected = pose.parts.find((part) => part.id === detail.target);
  return (
    <MechanismStage
      camera={EXPLODED_CAMERA}
      title={scene.label}
      overlay={(sampledCamera) =>
        anchor && (
          <div style={{ opacity: pose.explaining }}>
            <DetailOverlay
              detail={detail}
              camera={sampledCamera}
              anchor={anchor}
              compact={compact}
            />
          </div>
        )
      }
    >
      {pose.parts.map((part) => (
        <group key={part.id} position={[...part.position]}>
          <ExplodedPartRig
            part={part}
            opacity={1 - (1 - detailFocusOpacity(detail, part.id, t)) * pose.explaining}
          />
        </group>
      ))}
      {anchor && selected && (
        <group visible={pose.explaining > 0}>
          <DetailInset detail={detail} camera={camera} anchor={anchor} compact={compact}>
            <ExplodedPartRig part={selected} />
          </DetailInset>
        </group>
      )}
    </MechanismStage>
  );
};
