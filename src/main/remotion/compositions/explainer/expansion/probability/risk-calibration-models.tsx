import type { ReactElement } from 'react';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import { EvidenceDocumentClay } from '../kits/evidence';
import { PrecisionPlotClay } from '../kits/plots';
import type { ExpansionKitColors } from '../scene-types';
import { type RiskCalibrationPose, riskQuantityDomain } from './risk-calibration-poses';
import type { ExpansionRiskCalibrationScene } from './risk-calibration-types';

export const RISK_CALIBRATION_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function riskCalibrationModelPlacement(
  index: number,
  wide?: { width: number; height: number },
) {
  const width = wide?.width ?? 1080;
  const height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * meet) / 2 + (140 + index * 240) * meet : 64 + 140 + index * 240;
  const y = wide ? (height - 478 * meet) / 2 + 424 * meet : 262 + 424;
  const units = worldUnitsPerPixel(RISK_CALIBRATION_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0] as [number, number, number],
    scale: 12 * units * meet,
  };
}
/** Plot instruments and source sheets, not probability-shaped populations or fabricated dots. */
export function RiskCalibrationModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionRiskCalibrationScene;
  pose: RiskCalibrationPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage();
  const record = scene.records[pose.record];
  const quantities =
    scene.storyId === '15'
      ? [scene.records[pose.record].likelihood, scene.records[pose.record].impact].map((d) =>
          d.state === 'quantity' ? d.quantity : undefined,
        )
      : [scene.records[pose.record].prediction, scene.records[pose.record].observation];
  const dimensions =
    scene.storyId === '15' ? ['likelihood', 'impact'] : ['prediction', 'observation'];
  return (
    <group userData={{ sourceRecord: record.id }}>
      {quantities.map((q, i) => {
        const placement = riskCalibrationModelPlacement(i, wide?.model);
        return (
          <group
            key={`${record.id}:${dimensions[i]}`}
            position={placement.position}
            scale={placement.scale}
          >
            {q ? (
              <PrecisionPlotClay
                records={[{ id: record.id, label: 'source value', quantity: q }]}
                domain={riskQuantityDomain(q)}
                basis={q.basis}
                pose={pose}
                state="retained"
                colors={colors}
                position={[0, 0, 0]}
              />
            ) : (
              <EvidenceDocumentClay
                id={`${record.id}-${i}`}
                label={scene.label}
                source={scene.subject}
                pose={pose}
                state="unknown"
                colors={colors}
                placement={{ position: [0, 0, 0] }}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}
