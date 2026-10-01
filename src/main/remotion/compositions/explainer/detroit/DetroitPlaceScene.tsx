import type React from 'react';
import { HybridStage } from '../diagrams/HybridStage';
import { DiagramText } from '../diagrams/primitives';
import { useSceneTime } from '../stage';
import {
  AmbassadorBridge,
  AmbassadorBridge2D,
  EasternMarket,
  EasternMarket2D,
  GuardianBuilding,
  GuardianBuilding2D,
  PenobscotBuilding,
  PenobscotBuilding2D,
} from './ClassicLandmarks';
import { getDetroitLandmark } from './catalog';
import { FoxTheatre, FoxTheatre2D } from './FoxTheatre';
import { MichiganCentral, MichiganCentral2D } from './MichiganCentral';
import { detroitPose } from './poses';
import { RenaissanceCenter, RenaissanceCenter2D } from './RenaissanceCenter';
import { RENCEN_CAMERA } from './rencen-geometry';
import type { DetroitLandmarkId, DetroitPlaceScene as Scene } from './types';

export const DETROIT_COMPONENTS = {
  'renaissance-center': { Model: RenaissanceCenter, Diagram: RenaissanceCenter2D },
  'michigan-central': { Model: MichiganCentral, Diagram: MichiganCentral2D },
  'fox-theatre': { Model: FoxTheatre, Diagram: FoxTheatre2D },
  'guardian-building': { Model: GuardianBuilding, Diagram: GuardianBuilding2D },
  'penobscot-building': { Model: PenobscotBuilding, Diagram: PenobscotBuilding2D },
  'ambassador-bridge': { Model: AmbassadorBridge, Diagram: AmbassadorBridge2D },
  'eastern-market': { Model: EasternMarket, Diagram: EasternMarket2D },
} satisfies Record<DetroitLandmarkId, { Model: React.ComponentType; Diagram: React.ComponentType }>;

export function detroitPlacement(
  scene: Pick<Scene, 'landmarks' | 'preset' | 'condition'>,
  index: number,
): {
  model: { x: number; y: number; scale: number };
  vector: {
    x: number;
    y: number;
    scale: number;
    labelX: number;
    labelY: number;
    size: number;
    columns: number;
  };
} {
  const id = scene.landmarks[index];
  const montage = scene.landmarks.length > 1;
  const headerScale = scene.condition && scene.landmarks.includes('renaissance-center') ? 0.76 : 1;
  if (
    montage &&
    scene.preset === 'city-portrait' &&
    scene.landmarks.includes('renaissance-center')
  ) {
    const primary = id === 'renaissance-center';
    const support = scene.landmarks
      .filter((landmark) => landmark !== 'renaissance-center')
      .findIndex((landmark) => landmark === id);
    const scale = (primary ? 0.88 : id === 'michigan-central' ? 0.3 : 0.42) * headerScale;
    return {
      model: {
        x: (primary ? 0 : support === 0 ? -4 : 4.1) * headerScale,
        y: -1.4 * (1 - scale),
        scale,
      },
      vector: {
        x: primary ? 96 : support === 0 ? -8 : 700,
        y: primary ? 0 : 214,
        scale: primary ? 0.8 : 0.29,
        labelX: primary ? 476 : support === 0 ? 128 : 828,
        labelY: 420,
        size: primary ? 32 : 28,
        columns: primary ? 32 : 16,
      },
    };
  }
  const width = 952 / scene.landmarks.length;
  const scale = montage ? width / 1010 : 0.88;
  return {
    model: {
      x: (montage ? (index - (scene.landmarks.length - 1) / 2) * 2.8 : 0) * headerScale,
      y: -1.4 * (1 - headerScale),
      scale: (montage ? (id === 'renaissance-center' ? 0.72 : 0.49) : 1) * headerScale,
    },
    vector: {
      x: montage ? index * width + (width - 952 * scale) / 2 : 57,
      y: montage ? 80 : -12,
      scale,
      labelX: width * (index + 0.5),
      labelY: montage ? 354 : 456,
      size: montage ? 30 : 34,
      columns: montage ? 16 : 32,
    },
  };
}

export function DetroitPlaceScene({ scene }: { scene: Scene }): React.ReactElement {
  const { t } = useSceneTime();
  return (
    <HybridStage
      scene={scene}
      {...(scene.landmarks.includes('renaissance-center') ? { camera: RENCEN_CAMERA } : {})}
      model={
        <>
          {scene.landmarks.map((id, i) => {
            const { Model } = DETROIT_COMPONENTS[id];
            const p = detroitPose(t, scene, i);
            const { model } = detroitPlacement(scene, i);
            return (
              <group
                key={id}
                position={[model.x, model.y + p.rise, 0]}
                scale={p.scale * model.scale}
              >
                <Model />
              </group>
            );
          })}
        </>
      }
      diagram={
        <>
          {scene.landmarks.map((id, i) => {
            const { Diagram } = DETROIT_COMPONENTS[id];
            const { vector } = detroitPlacement(scene, i);
            return (
              <g key={id} data-entity-id={id}>
                <g transform={`translate(${vector.x} ${vector.y}) scale(${vector.scale})`}>
                  <Diagram />
                </g>
                <g opacity={detroitPose(t, scene, i).label}>
                  <DiagramText
                    x={vector.labelX}
                    y={vector.labelY}
                    size={vector.size}
                    columns={vector.columns}
                    strong
                  >
                    {getDetroitLandmark(id)?.label ?? scene.subject}
                  </DiagramText>
                </g>
              </g>
            );
          })}
        </>
      }
    />
  );
}
