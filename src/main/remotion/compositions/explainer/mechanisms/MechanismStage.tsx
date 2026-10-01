import type React from 'react';
import { useVideoConfig } from 'remotion';
import { Stage3D, useRigCamera } from '../Stage3D';
import { useStage, useWideStage, WideStageText } from '../stage';
import type { CameraSpec } from '../three-helpers';
import { MECHANISM_CAMERA } from './anchors';

export function useCompactMechanism(): boolean {
  const { width } = useVideoConfig();
  const wide = useWideStage();
  // Retain the old small-card adjustment only for legacy long-form renders.
  return !wide && width === 1920;
}

/** A single WebGL stage and a sibling editorial layer, both driven by the same Remotion frame. */
export function MechanismStage({
  children,
  title,
  overlay,
  camera = MECHANISM_CAMERA,
  bobAmount,
}: {
  children: React.ReactNode;
  title?: string;
  overlay?: (camera: CameraSpec) => React.ReactNode;
  camera?: CameraSpec;
  bobAmount?: number;
}): React.ReactElement {
  const S = useStage();
  const wide = useWideStage();
  const compact = useCompactMechanism();
  const sampled = useRigCamera(camera, { driftDeg: 0, pushAmount: 0, bobAmount });
  return (
    <>
      <Stage3D
        camera={camera}
        driftDeg={0}
        pushAmount={0}
        bobAmount={bobAmount}
        groundY={-1.4}
        shadowScale={9}
      >
        {children}
      </Stage3D>
      {title &&
        (wide ? (
          <WideStageText slot="title" text={title} size={48} />
        ) : (
          <div
            style={{
              position: 'absolute',
              top: 70,
              left: 72,
              width: 936,
              color: S.text,
              fontFamily: S.font,
              fontSize: compact ? 60 : 50,
              fontWeight: 750,
              lineHeight: 1.15,
              textAlign: 'center',
            }}
          >
            {title}
          </div>
        ))}
      {overlay?.(sampled)}
    </>
  );
}
