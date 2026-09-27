/**
 * Shared 3D stage for explainer scenes: ThreeCanvas on the 1080×960 virtual
 * stage (SceneFrame scales it into each layout), a camera rig (slow drift + push-in on the focus beat), soft studio
 * lighting and a drei ContactShadows ground shadow.
 *
 * Determinism: @remotion/three calls `advance()` once per rendered frame and
 * drei's ContactShadows re-renders its depth pass inside `useFrame`, so the
 * shadow is recomputed per frame from the frame-driven scene state. Clock-based
 * drei helpers (Float, Sparkles, Wobble…) are NOT used anywhere.
 *
 * Deep imports (`@react-three/drei/core/*`) keep the Remotion bundle small —
 * the drei root pulls in troika text, loaders and more.
 */

import { ContactShadows } from '@react-three/drei/core/ContactShadows';
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import type React from 'react';
import { useLayoutEffect } from 'react';
import { mixHex } from './palette';
import { useSceneTime, useStage } from './stage';
import { type CameraSpec, cameraRig } from './three-helpers';
import { EXPLAINER_STAGE_HEIGHT, EXPLAINER_STAGE_WIDTH } from './types';

/** Applies the rig camera every frame (R3F only reads `camera` on mount). */
const RigCamera: React.FC<{ spec: CameraSpec }> = ({ spec }) => {
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    camera.position.set(...spec.position);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, spec]);
  return null;
};

export interface Stage3DProps {
  camera: CameraSpec;
  /** Seconds — camera pushes in around this beat. */
  focusAt?: number;
  driftDeg?: number;
  pushAmount?: number;
  /** World y of the ground shadow plane; omit to hide the shadow. */
  groundY?: number;
  shadowScale?: number;
  children: React.ReactNode;
}

/** Hook for HTML overlays that must track the same camera as the 3D scene. */
export function useRigCamera(
  camera: CameraSpec,
  opts: Pick<Stage3DProps, 'focusAt' | 'driftDeg' | 'pushAmount'> = {},
): CameraSpec {
  const { t } = useSceneTime();
  return cameraRig(camera, t, opts);
}

export const Stage3D: React.FC<Stage3DProps> = ({
  camera,
  focusAt,
  driftDeg,
  pushAmount,
  groundY,
  shadowScale = 9,
  children,
}) => {
  const S = useStage();
  const spec = useRigCamera(camera, { focusAt, driftDeg, pushAmount });
  const sky = mixHex(S.text, '#ffffff', 0.4);
  const ground = S.bgInner;

  return (
    <ThreeCanvas
      width={EXPLAINER_STAGE_WIDTH}
      height={EXPLAINER_STAGE_HEIGHT}
      camera={{ position: spec.position, fov: spec.fov }}
      flat
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <RigCamera spec={spec} />
      <ambientLight intensity={0.32} />
      <hemisphereLight args={[sky, ground, 0.95]} />
      {/* Key light upper-left, soft fill right, faint rim from behind. */}
      <directionalLight position={[-3.5, 6, 5]} intensity={2.3} />
      <directionalLight position={[5, 1.5, 3]} intensity={0.45} />
      <directionalLight position={[0, 3, -6]} intensity={0.6} color={S.accent2} />
      {groundY !== undefined && (
        <ContactShadows
          position={[0, groundY, 0]}
          scale={shadowScale}
          opacity={0.55}
          blur={2.6}
          far={4}
          resolution={512}
          color="#000000"
        />
      )}
      {children}
    </ThreeCanvas>
  );
};
