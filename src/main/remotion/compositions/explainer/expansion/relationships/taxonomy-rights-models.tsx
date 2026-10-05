import type { ReactElement } from 'react';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import { RelationshipEntityClay } from '../kits/relationships';
import type { ExpansionKitColors } from '../scene-types';
import type { TaxonomyRightsPose } from './taxonomy-rights-poses';
import type { ExpansionTaxonomyRightsScene } from './taxonomy-rights-types';

export const TAXONOMY_RIGHTS_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function taxonomyRightsModelPlacement(
  index: number,
  wide?: { width: number; height: number },
): { position: [number, number, number]; scale: number } {
  const width = wide?.width ?? 1080;
  const height = wide?.height ?? 960;
  const scale = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * scale) / 2 + (30 + index * 52) * scale : 94 + index * 52;
  const y = wide ? (height - 478 * scale) / 2 + 400 * scale : 662;
  const units = worldUnitsPerPixel(TAXONOMY_RIGHTS_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0],
    scale: 20 * scale * units,
  };
}
/** Source-declared identity tabs, never ownership geometry or perspective share evidence. */
export function TaxonomyRightsModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionTaxonomyRightsScene;
  pose: TaxonomyRightsPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage();
  return (
    <group rotation={[0, -pose.modelTurn, 0]}>
      {scene.entities.map((e, i) => {
        const placement = taxonomyRightsModelPlacement(i, wide?.model);
        return (
          <RelationshipEntityClay
            key={e.id}
            entity={{
              id: e.id,
              label: e.label,
              role: e.type === 'member' ? 'member' : e.type === 'actor' ? 'source' : 'resource',
            }}
            pose={pose}
            state="retained"
            colors={colors}
            position={placement.position}
            scale={placement.scale}
          />
        );
      })}
    </group>
  );
}
