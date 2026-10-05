import type { ReactElement } from 'react';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import { ConstraintCandidateClay } from '../kits/constraints';
import { PrecisionPlotClay } from '../kits/plots';
import type { ExpansionKitColors } from '../scene-types';
import { frontierDomain, type SieveFrontierPose } from './sieve-frontier-poses';
import type { ExpansionSieveFrontierScene } from './sieve-frontier-types';

export const SIEVE_FRONTIER_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function sieveFrontierModelPlacement(
  index: number,
  wide?: { width: number; height: number },
) {
  const width = wide?.width ?? 1080,
    height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * meet) / 2 + (64 + index * 106) * meet : 128 + index * 106;
  const y = wide ? (height - 478 * meet) / 2 + 373 * meet : 635;
  const units = worldUnitsPerPixel(SIEVE_FRONTIER_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0] as [number, number, number],
    scale: 14 * units * meet,
  };
}
/** Carriers only: every factual magnitude and relation remains planar, not projected 3D text. */
export function SieveFrontierModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionSieveFrontierScene;
  pose: SieveFrontierPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage();
  return (
    <group rotation={[0, -pose.turn, 0]}>
      {scene.storyId === '25'
        ? scene.entities.map((e, i) => {
            const p = sieveFrontierModelPlacement(i, wide?.model);
            return (
              <group key={e.id} position={p.position} scale={p.scale}>
                <ConstraintCandidateClay
                  state="retained"
                  position={[0, 0, 0]}
                  id={e.id}
                  label={e.label}
                  pose={pose}
                  colors={colors}
                  requirements={scene.requirements.map((q) => {
                    const r = scene.records.find(
                      (r) => r.optionId === e.id && r.requirementId === q.id,
                    );
                    if (!r) throw new Error('Missing source check');
                    return {
                      id: q.id,
                      label: q.label,
                      result:
                        r.state === 'known'
                          ? r.status
                          : r.state === 'missing'
                            ? 'not-stated'
                            : 'unknown',
                    };
                  })}
                />
              </group>
            );
          })
        : scene.criteria.map((c, i) => {
            const p = sieveFrontierModelPlacement(i, wide?.model);
            const records = scene.records.filter((r) => r.criterionId === c.id);
            return (
              <group key={c.id} position={p.position} scale={p.scale}>
                <PrecisionPlotClay
                  state="retained"
                  position={[0, 0, 0]}
                  pose={pose}
                  colors={colors}
                  records={records.map((r) => ({
                    id: r.id,
                    label: scene.entities.find((e) => e.id === r.optionId)?.label ?? '',
                    quantity: r.quantity,
                  }))}
                  basis={records[0].quantity.basis}
                  domain={frontierDomain(scene, c.id)}
                />
              </group>
            );
          })}
    </group>
  );
}
