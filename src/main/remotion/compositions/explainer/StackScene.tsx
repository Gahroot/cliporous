/**
 * Stack scene (3D) — soft rounded slabs drop into an isometric stack on the
 * word that names each layer; labels ride on the slabs. Optionally the whole
 * stack dims on a "broken"/"fails" beat.
 */

import { ThreeCanvas } from '@remotion/three';
import type React from 'react';
import { useMemo } from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ramp, STAGE, shade, useSceneTime } from './stage';
import { type CameraSpec, projectToStage } from './three-helpers';
import {
  EXPLAINER_STAGE_HEIGHT,
  EXPLAINER_STAGE_WIDTH,
  type StackLayer,
  type StackScene as StackSceneData,
} from './types';

const CAMERA: CameraSpec = { position: [5.2, 4.4, 6.4], fov: 30 };
const SLAB = { w: 2.4, h: 0.28, d: 1.7 } as const;
const GAP = 0.72;
const DROP_HEIGHT = 2.2;

function layerColors(accent: string): string[] {
  return ['#4f6aa8', shade(accent, 0.5), '#f2f2f5', shade(accent, 0.2), '#9fb3dc'];
}

function restY(index: number, count: number): number {
  return (index - (count - 1) / 2) * GAP;
}

/** 0→1 drop progress for a layer (spring with a light bounce). */
function useDrop(layer: StackLayer): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: frame - Math.round(layer.at * fps),
    fps,
    config: { stiffness: 160, damping: 14, mass: 0.9 },
  });
}

const Slab: React.FC<{
  layer: StackLayer;
  index: number;
  count: number;
  color: string;
  dim: number;
  geometry: RoundedBoxGeometry;
}> = ({ layer, index, count, color, dim, geometry }) => {
  const drop = useDrop(layer);
  if (drop <= 0.001) return null;
  const y = restY(index, count) + (1 - drop) * DROP_HEIGHT;
  return (
    <mesh geometry={geometry} position={[0, y, 0]}>
      <meshStandardMaterial
        color={color}
        roughness={0.6}
        metalness={0.02}
        transparent
        opacity={Math.min(1, drop * 1.4) * (1 - dim * 0.6)}
      />
    </mesh>
  );
};

const Label: React.FC<{ layer: StackLayer; index: number; count: number; dim: number }> = ({
  layer,
  index,
  count,
  dim,
}) => {
  const { t } = useSceneTime();
  const show = ramp(t, layer.at + 0.2, 0.35);
  // Anchor just right of the slab's front corner.
  const p = projectToStage(CAMERA, [SLAB.w / 2, restY(index, count), SLAB.d / 2]);
  return (
    <div
      style={{
        position: 'absolute',
        left: p.x,
        top: p.y,
        transform: `translate(28px, -50%) scale(${0.85 + show * 0.15})`,
        transformOrigin: 'left center',
        opacity: show * (1 - dim * 0.6),
        background: 'rgba(12,16,30,0.82)',
        color: STAGE.text,
        fontFamily: STAGE.font,
        fontWeight: 700,
        fontSize: 28,
        padding: '6px 18px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        border: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      {layer.label}
    </div>
  );
};

export const StackScene: React.FC<{ scene: StackSceneData; accent: string }> = ({
  scene,
  accent,
}) => {
  const { t } = useSceneTime();
  const geometry = useMemo(() => new RoundedBoxGeometry(SLAB.w, SLAB.h, SLAB.d, 4, 0.12), []);
  const colors = layerColors(accent);
  const count = scene.layers.length;
  const dim = scene.dimAt === undefined ? 0 : ramp(t, scene.dimAt, 0.5);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <ThreeCanvas
        width={EXPLAINER_STAGE_WIDTH}
        height={EXPLAINER_STAGE_HEIGHT}
        camera={{ position: CAMERA.position, fov: CAMERA.fov }}
        flat
        gl={{ alpha: true, antialias: true }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <ambientLight intensity={0.35} />
        <hemisphereLight args={['#ffffff', '#1b2036', 0.9]} />
        <directionalLight position={[-3, 6, 4]} intensity={2.4} />
        <directionalLight position={[5, 1, -2]} intensity={0.3} />
        <group>
          {scene.layers.map((layer, i) => (
            <Slab
              key={`${i}-${layer.label}`}
              layer={layer}
              index={i}
              count={count}
              color={colors[i % colors.length] ?? STAGE.paper}
              dim={dim}
              geometry={geometry}
            />
          ))}
        </group>
      </ThreeCanvas>
      {scene.layers.map((layer, i) => (
        <Label key={`${i}-${layer.label}`} layer={layer} index={i} count={count} dim={dim} />
      ))}
    </div>
  );
};
