import type React from 'react';
import { useEffect, useMemo } from 'react';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  EXPLANATION_CAMERA,
  EXPLANATION_LABEL_LINE_HEIGHT,
  EXPLANATION_LABEL_SIZE,
  EXPLANATION_OUTCOME_TOP,
  explanationLabelTop,
} from './explanation-layout';
import { Clay } from './hero-kit';
import { MechanismStage } from './mechanisms/MechanismStage';
import { useSceneTime, useStage } from './stage';
import { TechText } from './technology/primitives';
import type { TechnologyStory } from './technology/types';
import type { CameraSpec } from './three-helpers';

export type ClayPoint = [number, number, number];

/** Shared authored solid; dimensions are fixed by a scene, never model JSON. */
export function ClayBlock({
  size,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  color,
  radius = 0.07,
  opacity,
}: {
  size: ClayPoint;
  position?: ClayPoint;
  rotation?: ClayPoint;
  color: string;
  radius?: number;
  opacity?: number;
}): React.ReactElement {
  const [width, height, depth] = size;
  const geometry = useMemo(
    () =>
      new RoundedBoxGeometry(
        width,
        height,
        depth,
        3,
        Math.min(radius, width / 2, height / 2, depth / 2),
      ),
    [width, height, depth, radius],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={position} rotation={rotation}>
      <Clay color={color} opacity={opacity} />
    </mesh>
  );
}

/** Existing studio and typography, with a calm camera and a reserved editorial rail. */
export function ExplanationStage({
  scene,
  children,
  labels = [],
  labelRows = 2,
  camera = EXPLANATION_CAMERA,
}: {
  scene: TechnologyStory;
  children: React.ReactNode;
  labels?: readonly string[];
  labelRows?: 2 | 3 | 4;
  camera?: CameraSpec;
}): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  return (
    <MechanismStage
      camera={camera}
      bobAmount={0}
      title={scene.label}
      overlay={() => (
        <>
          {scene.condition && (
            <TechText x={100} y={146} width={880} size={30} align="center">
              {scene.condition}
            </TechText>
          )}
          <div
            style={{
              position: 'absolute',
              left: 80,
              top: explanationLabelTop(labelRows),
              width: 920,
              display: 'flex',
              justifyContent: 'space-evenly',
              gap: 28,
              color: S.text,
              fontFamily: S.font,
              fontSize: EXPLANATION_LABEL_SIZE,
              fontWeight: 650,
              lineHeight: EXPLANATION_LABEL_LINE_HEIGHT,
              textAlign: 'center',
            }}
          >
            {labels.map((label) => (
              <span key={label} style={{ flex: 1, overflowWrap: 'anywhere' }}>
                {label}
              </span>
            ))}
          </div>
          {t >= scene.resolveAt && (
            <TechText x={100} y={EXPLANATION_OUTCOME_TOP} width={880} size={36} align="center">
              {scene.outcome}
            </TechText>
          )}
        </>
      )}
    >
      {children}
    </MechanismStage>
  );
}
