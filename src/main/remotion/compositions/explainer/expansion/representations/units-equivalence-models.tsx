import type { ReactElement } from 'react';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import { EvidenceDocumentClay } from '../kits/evidence';
import type { ExpansionKitColors } from '../scene-types';
import type { UnitsEquivalencePose } from './units-equivalence-poses';
import type { ExpansionUnitsEquivalenceScene } from './units-equivalence-types';

export const UNITS_EQUIVALENCE_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function unitsEquivalenceModelPlacement(
  index: number,
  wide?: { width: number; height: number },
): { position: [number, number, number]; scale: number } {
  const width = wide?.width ?? 1080,
    height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * meet) / 2 + (140 + index * 240) * meet : 204 + index * 240;
  const y = wide ? (height - 478 * meet) / 2 + 408 * meet : 686;
  const units = worldUnitsPerPixel(UNITS_EQUIVALENCE_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0],
    scale: 24 * units * meet,
  };
}
/** Retained source sheets carry operands and approved result, not an invented numeric balance. */
export function UnitsEquivalenceModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionUnitsEquivalenceScene;
  pose: UnitsEquivalencePose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage();
  const records = scene.storyId === '49' ? [scene.record] : scene.records;
  const sheets = [
    ...records.map((r) => ({ id: r.id, label: r.quantity.claim, source: r.quantity.actor })),
    { id: scene.result.id, label: scene.result.operation, source: scene.subject },
  ];
  return (
    <group rotation={[0, -pose.turn, 0]}>
      {sheets.map((s, i) => {
        const p = unitsEquivalenceModelPlacement(i, wide?.model);
        return (
          <group key={s.id} position={p.position} scale={p.scale}>
            <EvidenceDocumentClay
              id={s.id}
              label={s.label}
              source={s.source}
              pose={pose}
              state="retained"
              colors={colors}
              placement={{ position: [0, 0, 0] }}
            />
          </group>
        );
      })}
    </group>
  );
}
