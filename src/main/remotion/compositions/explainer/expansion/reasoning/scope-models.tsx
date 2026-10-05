import type { ReactElement } from 'react';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import { EvidenceDocumentClay, ScopeTabClay } from '../kits/evidence';
import type { ExpansionKitColors } from '../scene-types';
import type { ScopePose } from './scope-poses';
import type { ExpansionReasoningScopeScene } from './scope-types';

export const SCOPE_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
/** Body-local planar marks (80/240, 380); inverse projection of fixed authored positions. */
export function scopeModelPlacement(index: number, wide?: { width: number; height: number }) {
  const width = wide?.width ?? 1080;
  const height = wide?.height ?? 960;
  // Match DiagramSurface's xMidYMid meet transform, never stretch axes independently.
  const meetScale = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide
    ? (width - 952 * meetScale) / 2 + (80 + index * 160) * meetScale
    : 144 + index * 160;
  const y = wide ? (height - 478 * meetScale) / 2 + 380 * meetScale : 642;
  const units = worldUnitsPerPixel(SCOPE_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0] as [number, number, number],
    scale: 22 * units * meetScale,
  };
}

/** Two authored source sheets with scope tabs; all precision lives in the planar lens. */
export function ScopeModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionReasoningScopeScene;
  pose: ScopePose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage();
  return (
    <group rotation={[0, -pose.modelTurn, 0]}>
      {[0, 1].map((i) => {
        const placement = scopeModelPlacement(i, wide?.model);
        const props = {
          id: `scope-document-${i}`,
          pose,
          state: 'unknown' as const,
          colors,
          placement: { position: [0, 0, 0] as const },
        };
        return (
          <group key={i} position={placement.position} scale={placement.scale}>
            <EvidenceDocumentClay {...props} label={scene.label} source={scene.subject} />
            <ScopeTabClay
              {...props}
              id={`scope-tab-${i}`}
              scope={scene.storyId === '07' ? scene.statements[i].scope : scene.frames[i].label}
              version={
                scene.storyId === '07'
                  ? scene.statements[i].version
                  : scene.frames[i].referenceFactId
              }
              placement={{ position: [0, -0.4, 0.1], scale: 0.5 }}
            />
          </group>
        );
      })}
    </group>
  );
}
