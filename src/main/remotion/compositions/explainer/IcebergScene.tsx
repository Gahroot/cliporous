/**
 * Iceberg scene (3D) — a faceted, pale low-poly iceberg sits in a cut-away
 * sea: a translucent accent2-tinted water column with a gently rolling
 * surface. Only a small tip rises above the waterline; the much larger mass
 * hides below.
 *
 *  - `top.at`: the tip label pops above the tip;
 *  - `diveAt`: the camera tilts and sinks below the waterline over ~0.8 s
 *    (frame-driven base camera fed to <Stage3D>), the water darkens;
 *  - `below[i].at`: a label pops beside the submerged mass at increasing depth,
 *    joined to the ice by a leader line.
 *
 * Reactions: 0 = top label, 1.. = below labels.
 */

import type React from 'react';
import { useEffect, useMemo } from 'react';
import { Easing, interpolate } from 'remotion';
import {
  type BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Shape,
  ShapeGeometry,
} from 'three';
import { lathe } from './hero-kit';
import { Glow, hash01, reactionTransform, useFloat, useLivingShadow, useReaction } from './motion';
import { mixHex } from './palette';
import { Stage3D, useRigCamera } from './Stage3D';
import { ramp, usePop, useSceneTime, useStage } from './stage';
import { type CameraSpec, projectToStage } from './three-helpers';
import { EXPLAINER_STAGE_WIDTH, type IcebergScene as IcebergSceneData } from './types';

const FOV = 30;
const CAM_DIST = 11.2;
/** Camera height above its target: looking down on the surface → level-ish below it. */
const CAM_Y_ABOVE = 0.45;
const CAM_Y_BELOW = -0.45;
/** World y the camera looks at, before/after the dive. */
const FOCUS_ABOVE = -0.25;
const FOCUS_BELOW = -2.05;
const DIVE_SEC = 0.8;
const ICE_X = -1.3;
const ICE_SX = 1.1;
const ICE_SZ = 0.85;
const TIP_Y = 1.2;
const WATER_FRONT_Z = 2.6;
const WATER_BACK_Z = -2.6;
const WATER_HALF_W = 13;
const WATER_BOTTOM = -9;
const LABEL_X = 640;
const LABEL_MAX_W = EXPLAINER_STAGE_WIDTH - 60 - LABEL_X;

/** Iceberg silhouette as [radius, y]: small tip, wide bulging mass below. */
const PROFILE: readonly [number, number][] = [
  [0.001, TIP_Y],
  [0.2, 1.02],
  [0.4, 0.64],
  [0.6, 0.24],
  [0.78, 0],
  [1.08, -0.34],
  [1.42, -0.9],
  [1.55, -1.6],
  [1.46, -2.4],
  [1.12, -3.1],
  [0.6, -3.7],
  [0.001, -3.95],
];

function profileRadius(y: number): number {
  for (let i = 1; i < PROFILE.length; i++) {
    const a = PROFILE[i - 1] as [number, number];
    const b = PROFILE[i] as [number, number];
    if (y <= a[1] && y >= b[1]) {
      const u = (a[1] - y) / (a[1] - b[1]);
      return a[0] + (b[0] - a[0]) * u;
    }
  }
  return 0;
}

/** Low-poly lathe with deterministic per-vertex jitter (shared seam/pole vertices move together). */
function icebergGeometry(top: string, deep: string): BufferGeometry {
  const g = lathe(PROFILE, 9);
  const pos = g.getAttribute('position');
  const colors: number[] = [];
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
    const r = 1 + (hash01(`ice-r${key}`) - 0.5) * 0.3;
    const dy = (hash01(`ice-y${key}`) - 0.5) * 0.16;
    // The tip leans a little off-axis so the berg doesn't read as a spinning top.
    const lean = y > 0 ? (y / TIP_Y) * 0.2 : 0;
    pos.setXYZ(i, x * r * ICE_SX + lean, y + (Math.abs(y) < 3.9 ? dy : 0), z * r * ICE_SZ);
    // Bright snow above the waterline, colder and deeper toward the base.
    const depth = y > 0.05 ? 0 : Math.min(1, 0.35 + (-y / 3.9) * 0.65);
    c.set(mixHex(top, deep, depth));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** Wave height of the water surface at x (world), time t. */
function wave(x: number, t: number): number {
  return Math.sin(x * 1.2 + t * 1.5) * 0.035 + Math.sin(x * 0.55 - t * 1.05 + 1.3) * 0.025;
}

/** Cross-section water column (front face) with a wavy top edge, or a thin waterline strip. */
function waterFront(t: number, band: number | null): ShapeGeometry {
  const s = new Shape();
  const step = 0.25;
  const pts: [number, number][] = [];
  for (let x = -WATER_HALF_W; x <= WATER_HALF_W + 1e-6; x += step) pts.push([x, wave(x, t)]);
  const first = pts[0] as [number, number];
  if (band === null) {
    s.moveTo(-WATER_HALF_W, WATER_BOTTOM);
    s.lineTo(WATER_HALF_W, WATER_BOTTOM);
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i] as [number, number];
      s.lineTo(p[0], p[1]);
    }
  } else {
    s.moveTo(first[0], first[1] - band);
    for (const p of pts) s.lineTo(p[0], p[1] - band);
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i] as [number, number];
      s.lineTo(p[0], p[1] + band);
    }
  }
  s.closePath();
  return new ShapeGeometry(s, 1);
}

/** Per-frame geometry, disposed when replaced. */
function useFrameGeometry(make: () => ShapeGeometry, key: number): ShapeGeometry {
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuilt per frame key only
  const g = useMemo(make, [key]);
  useEffect(() => () => g.dispose(), [g]);
  return g;
}

const BUBBLES = 12;

const Sea: React.FC<{ dive: number }> = ({ dive }) => {
  const S = useStage();
  const { t, frame } = useSceneTime();
  const front = useFrameGeometry(() => waterFront(t, null), frame);
  const line = useFrameGeometry(() => waterFront(t, 0.022), frame);
  const deep = mixHex(S.accent2, S.bgOuter, 0.55 + dive * 0.2);
  const tint = mixHex(S.accent2, S.bgOuter, 0.35 + dive * 0.25);
  const surface = mixHex(S.accent2, S.paper, 0.35);
  const bob = Math.sin(t * 1.3) * 0.02;
  return (
    <group>
      {/* Back wall of the water column (the deep sea behind the berg). */}
      <mesh position={[0, WATER_BOTTOM / 2 + bob, WATER_BACK_Z]} renderOrder={1}>
        <planeGeometry args={[WATER_HALF_W * 2, -WATER_BOTTOM]} />
        <meshBasicMaterial
          color={deep}
          transparent
          opacity={0.55 + dive * 0.25}
          depthWrite={false}
        />
      </mesh>
      {/* Surface, seen from above before the dive and from below after it. */}
      <mesh
        position={[0, bob, (WATER_FRONT_Z + WATER_BACK_Z) / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={2}
      >
        <planeGeometry args={[WATER_HALF_W * 2, WATER_FRONT_Z - WATER_BACK_Z]} />
        <meshBasicMaterial
          color={surface}
          transparent
          opacity={0.14 - dive * 0.06}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Front glass of the cut-away: tints everything underwater. */}
      <mesh geometry={front} position={[0, 0, WATER_FRONT_Z]} renderOrder={3}>
        <meshBasicMaterial
          color={tint}
          transparent
          opacity={0.44 + dive * 0.18}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh geometry={line} position={[0, 0, WATER_FRONT_Z + 0.01]} renderOrder={4}>
        <meshBasicMaterial
          color={mixHex(S.paper, S.accent2, 0.2)}
          transparent
          opacity={0.85}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {Array.from({ length: BUBBLES }, (_, i) => {
        const h = (s: string): number => hash01(`ice-bub-${s}${i}`);
        const span = 4.2;
        const speed = 0.35 + h('v') * 0.35;
        const y = -4.4 + ((t * speed + h('p') * span) % span);
        const x = ICE_X + (h('x') - 0.35) * 5.2 + Math.sin(t * 1.7 + i) * 0.06;
        const fade = Math.min(1, (-y - 0.05) / 0.4);
        if (fade <= 0) return null;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed bubble pool
          <mesh key={i} position={[x, y, 1.5 + h('z') * 0.9]} renderOrder={5}>
            <sphereGeometry args={[0.035 + h('s') * 0.04, 10, 8]} />
            <meshBasicMaterial
              color={mixHex(S.paper, S.accent2, 0.3)}
              transparent
              opacity={fade * (0.35 + dive * 0.3)}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
};

const Iceberg: React.FC<{ enter: number }> = ({ enter }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const top = mixHex(S.paper, '#ffffff', 0.6);
  const deep = mixHex(mixHex(S.paper, S.accent2, 0.5), S.bgOuter, 0.42);
  const geometry = useMemo(() => icebergGeometry(top, deep), [top, deep]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const bob = Math.sin(t * 1.1 + 0.5) * 0.045;
  const roll = Math.sin(t * 0.8) * 0.018;
  return (
    <group
      position={[ICE_X, bob - (1 - enter) * 0.5, 0]}
      rotation={[roll * 0.6, 0.35 + Math.sin(t * 0.3) * 0.08, roll]}
    >
      <mesh geometry={geometry}>
        <meshStandardMaterial
          vertexColors
          roughness={0.42}
          metalness={0.02}
          flatShading
          emissive={S.paper}
          emissiveIntensity={0.3}
          transparent={enter < 1}
          opacity={enter}
        />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------------------
// HTML labels
// ---------------------------------------------------------------------------

const TopLabel: React.FC<{ label: string; at: number; x: number; y: number }> = ({
  label,
  at,
  x,
  y,
}) => {
  const S = useStage();
  const pop = usePop(at, 200, 14);
  const reaction = useReaction(0);
  const float = useFloat('ice-top', 4);
  const shadow = useLivingShadow('ice-top', 0.8);
  if (pop <= 0.001) return null;
  // Fades as the dive carries it off the top of the stage.
  const onStage = Math.min(1, Math.max(0, (y - 60) / 140));
  if (onStage <= 0) return null;
  const size = label.length > 12 ? 40 : 46;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -100%) translate(${float.x.toFixed(2)}px, ${(float.y + (1 - pop) * 30).toFixed(2)}px) scale(${(0.7 + pop * 0.3).toFixed(4)}) ${reactionTransform(reaction)}`,
        transformOrigin: 'center bottom',
        opacity: Math.min(1, pop * 1.4) * onStage,
      }}
    >
      <Glow color={S.accent} intensity={0.35 + reaction.glow * 0.6} radius={110} />
      <div
        style={{
          position: 'relative',
          padding: '14px 34px',
          borderRadius: 999,
          background: S.cardRaised,
          border: `1.5px solid ${mixHex(S.cardRaised, S.accent, 0.45)}`,
          boxShadow: shadow,
          color: S.text,
          fontFamily: S.font,
          fontWeight: 800,
          fontSize: size,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      {/* Pointer down to the tip. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: -22,
          width: 3,
          height: 20,
          marginLeft: -1.5,
          borderRadius: 2,
          background: S.accent,
          opacity: 0.8,
        }}
      />
    </div>
  );
};

const DepthLabel: React.FC<{
  label: string;
  at: number;
  index: number;
  anchor: { x: number; y: number };
}> = ({ label, at, index, anchor }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const pop = usePop(at, 190, 15);
  const line = ramp(t, at, 0.45);
  const reaction = useReaction(index + 1);
  const float = useFloat(`ice-below${index}`, 3);
  const shadow = useLivingShadow(`ice-below${index}`, 0.7);
  const flash = t >= at ? Math.exp(-(t - at) / 0.5) : 0;
  if (t < at) return null;
  const from = anchor.x + 10;
  const to = LABEL_X - 10;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: from,
          top: anchor.y - 1.5,
          width: Math.max(0, (to - from) * line),
          height: 3,
          borderRadius: 2,
          background: S.accent,
          opacity: 0.75,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: anchor.x - 8,
          top: anchor.y - 8,
          width: 16,
          height: 16,
          borderRadius: 8,
          background: S.accent,
          boxShadow: `0 0 ${12 + flash * 16}px ${S.accent}`,
          transform: `scale(${Math.min(1.3, pop).toFixed(3)})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: LABEL_X,
          top: anchor.y,
          maxWidth: LABEL_MAX_W,
          transform: `translate(${((1 - pop) * 40 + float.x).toFixed(2)}px, calc(-50% + ${float.y.toFixed(2)}px)) scale(${(0.85 + pop * 0.15).toFixed(4)}) ${reactionTransform(reaction)}`,
          transformOrigin: 'left center',
          opacity: Math.min(1, pop * 1.4),
        }}
      >
        <Glow color={S.accent} intensity={flash * 0.8 + reaction.glow * 0.6} radius={90} />
        <div
          style={{
            position: 'relative',
            padding: '12px 28px',
            borderRadius: 26,
            background: S.cardRaised,
            border: `1.5px solid ${S.cardBorder}`,
            boxShadow: shadow,
            color: S.text,
            fontFamily: S.font,
            fontWeight: 700,
            fontSize: label.length > 11 ? 36 : 40,
            lineHeight: 1.15,
          }}
        >
          {label}
        </div>
      </div>
    </>
  );
};

const EDGE_FADE_X =
  'linear-gradient(to right, transparent 0%, #000 10%, #000 90%, transparent 100%)';
const EDGE_FADE_Y = 'linear-gradient(to bottom, #000 78%, transparent 100%)';

function mask(gradient: string): React.CSSProperties {
  return { maskImage: gradient, WebkitMaskImage: gradient };
}

/** Depth (world y) of the i-th hidden layer's anchor on the ice. */
function layerY(i: number, n: number): number {
  const top = -0.75;
  const bottom = -3.3;
  if (n <= 1) return -1.8;
  return top + ((bottom - top) * i) / (n - 1);
}

export const IcebergScene: React.FC<{ scene: IcebergSceneData }> = ({ scene }) => {
  const { t } = useSceneTime();
  const dive = interpolate(t, [scene.diveAt, scene.diveAt + DIVE_SEC], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.65, 0, 0.25, 1),
  });
  const focus = FOCUS_ABOVE + (FOCUS_BELOW - FOCUS_ABOVE) * dive;
  const camY = CAM_Y_ABOVE + (CAM_Y_BELOW - CAM_Y_ABOVE) * dive;
  const base: CameraSpec = {
    position: [0, camY, Math.sqrt(CAM_DIST * CAM_DIST - camY * camY)],
    fov: FOV,
  };
  const rig = { focusAt: scene.diveAt + DIVE_SEC * 0.6, driftDeg: 4, pushAmount: 0.05 };
  const camera = useRigCamera(base, rig);
  const enter = interpolate(t, [0, 0.6], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  // The world is shifted so the camera's fixed look-at (origin) lands on `focus`.
  const w = (x: number, y: number, z: number): { x: number; y: number } =>
    projectToStage(camera, [x, y - focus, z]);
  const tip = w(ICE_X + 0.22, TIP_Y + 0.22, 0);
  const n = scene.below.length;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Soft edges so the cut-away sea dissolves into the stage instead of ending in a hard box. */}
      <div style={{ position: 'absolute', inset: 0, ...mask(EDGE_FADE_X) }}>
        <div style={{ position: 'absolute', inset: 0, ...mask(EDGE_FADE_Y) }}>
          <Stage3D camera={base} {...rig}>
            <group position={[0, -focus, 0]}>
              <Sea dive={dive} />
              <Iceberg enter={enter} />
            </group>
          </Stage3D>
        </div>
      </div>
      <TopLabel label={scene.top.label} at={scene.top.at} x={tip.x} y={tip.y} />
      {scene.below.map((b, i) => {
        const y = layerY(i, n);
        const anchor = w(ICE_X + profileRadius(y) * ICE_SX * 0.92, y, 0.4);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: layers are positional
          <DepthLabel key={i} label={b.label} at={b.at} index={i} anchor={anchor} />
        );
      })}
    </div>
  );
};
