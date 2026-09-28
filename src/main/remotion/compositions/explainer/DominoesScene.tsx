/**
 * Dominoes scene (3D) — 3–6 clay tiles standing in a gentle curve. Each tile
 * springs up on its beat with its label. At `fallAt` the first tile tips over
 * its far bottom edge; every next tile follows DOMINO_STEP_SEC later, each
 * coming to rest leaning on its neighbour, the last one lying flat with a
 * soft burst. The last tile is accent-tinted.
 */

import type React from 'react';
import { useMemo } from 'react';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Clay, useSpringAt } from './hero-kit';
import { Burst, Glow, reactionTransform, useFloat, useReaction } from './motion';
import { mixHex } from './palette';
import { Stage3D, useRigCamera } from './Stage3D';
import { ramp, useSceneTime, useStage } from './stage';
import { type CameraSpec, projectToStage } from './three-helpers';
import type { DominoesScene as DominoesSceneData } from './types';

/** Same timing as DOMINO_STEP_SEC in src/main/ai/explainer/kinds-3d-objects.ts */
const DOMINO_STEP_SEC = 0.28;

const CAMERA: CameraSpec = { position: [2.8, 2.8, 10], fov: 30 };
/** Line shifted left so the last tile has room to fall flat. */
const LINE_X = -1.45;
const GROUND_Y = -1.2;
const TILE_H = 1.7;
const TILE_W = 0.95;
const TILE_T = 0.26;
const FALL_SEC = 0.35;

interface TilePose {
  x: number;
  z: number;
  yaw: number;
}

function poses(n: number): TilePose[] {
  const span = Math.min(5, (n - 1) * 1.15);
  return Array.from({ length: n }, (_, i) => {
    const u = n > 1 ? i / (n - 1) : 0.5;
    const x = LINE_X - span / 2 + u * span;
    // Gentle arc: the middle bows toward the camera.
    const z = 0.35 * (1 - (2 * u - 1) ** 2) - 0.2;
    const dzdx = span > 0 ? (0.35 * -4 * (2 * u - 1)) / span : 0;
    return { x, z, yaw: -Math.atan(dzdx) };
  });
}

/** Tilt (radians) of tile i at time t. */
function tiltAt(t: number, i: number, n: number, fallAt: number, rest: number): number {
  const start = fallAt + i * DOMINO_STEP_SEC;
  if (t <= start) return 0;
  const last = i === n - 1;
  const target = last ? Math.PI / 2 - 0.02 : rest;
  const dur = last ? FALL_SEC + 0.05 : FALL_SEC;
  const u = Math.min(1, (t - start) / dur);
  let a = target * u * u;
  if (u >= 1) {
    // Tiny settle bounce after contact.
    const s = t - start - dur;
    a = target - Math.abs(Math.sin(s * 22)) * Math.exp(-s * 12) * 0.06;
  }
  return a;
}

export const DominoesScene: React.FC<{ scene: DominoesSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const n = scene.tiles.length;
  const ps = useMemo(() => poses(n), [n]);
  const geometry = useMemo(() => new RoundedBoxGeometry(TILE_T, TILE_H, TILE_W, 3, 0.07), []);
  const spacing =
    n > 1 ? Math.hypot((ps[1]?.x ?? 0) - (ps[0]?.x ?? 0), (ps[1]?.z ?? 0) - (ps[0]?.z ?? 0)) : 1;
  const rest = Math.asin(Math.min(0.95, Math.max(0.1, (spacing - TILE_T) / TILE_H)));
  const lastFall = scene.fallAt + (n - 1) * DOMINO_STEP_SEC + FALL_SEC + 0.05;
  const rig = { focusAt: scene.fallAt, driftDeg: 4, pushAmount: 0.06 };
  const camera = useRigCamera(CAMERA, rig);
  const lastPose = ps[n - 1] ?? { x: 0, z: 0, yaw: 0 };
  const landPt = projectToStage(camera, [lastPose.x + TILE_H * 0.55, GROUND_Y + 0.15, lastPose.z]);
  const fontSize = n >= 5 ? 36 : 42;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Stage3D camera={CAMERA} {...rig} groundY={GROUND_Y} shadowScale={7}>
        {scene.tiles.map((tile, i) => (
          <Tile
            // biome-ignore lint/suspicious/noArrayIndexKey: tiles are positional
            key={i}
            pose={ps[i] ?? lastPose}
            at={tile.at}
            tilt={tiltAt(t, i, n, scene.fallAt, rest)}
            hitAt={scene.fallAt + i * DOMINO_STEP_SEC + FALL_SEC}
            accent={i === n - 1}
            index={i}
            geometry={geometry}
          />
        ))}
      </Stage3D>
      {scene.tiles.map((tile, i) => {
        const p = ps[i] ?? lastPose;
        const above = i % 2 === 0;
        // Top labels alternate high/low so long neighbours never collide.
        const topY = GROUND_Y + TILE_H + (i % 4 === 0 ? 0.72 : 0.3);
        const anchor = projectToStage(
          camera,
          above ? [p.x, topY, p.z] : [p.x, GROUND_Y - 0.3, p.z + 0.4],
        );
        return (
          <TileLabel
            // biome-ignore lint/suspicious/noArrayIndexKey: tiles are positional
            key={i}
            label={tile.label}
            at={tile.at}
            x={anchor.x}
            y={anchor.y}
            above={above}
            index={i}
            accent={i === n - 1}
            fontSize={fontSize}
          />
        );
      })}
      <Burst
        atSec={lastFall}
        x={landPt.x}
        y={landPt.y}
        color={S.accent}
        radius={190}
        count={14}
        seed="dominoes"
      />
    </div>
  );
};

const Tile: React.FC<{
  pose: TilePose;
  at: number;
  tilt: number;
  hitAt: number;
  accent: boolean;
  index: number;
  geometry: RoundedBoxGeometry;
}> = ({ pose, at, tilt, hitAt, accent, index, geometry }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const up = useSpringAt(at, 190, 13, 0.7);
  const reaction = useReaction(index);
  if (t < at) return null;
  const flash = t >= hitAt ? Math.exp(-(t - hitAt) / 0.3) : 0;
  const base = accent ? mixHex(S.clay[0], S.accent, 0.85) : mixHex(S.clay[0], S.paper, 0.55);
  const sy = Math.max(0.02, up);
  return (
    <group position={[pose.x, GROUND_Y, pose.z]} rotation={[0, pose.yaw, 0]} scale={reaction.scale}>
      {/* Pivot on the far bottom edge; tipping = rotation about z. */}
      <group position={[TILE_T / 2, 0, 0]} rotation={[0, 0, -tilt]}>
        <group position={[-TILE_T / 2, 0, 0]} scale={[1, sy, 1]}>
          <mesh geometry={geometry} position={[0, TILE_H / 2, 0]}>
            <Clay
              color={base}
              roughness={0.45}
              metalness={0.05}
              emissive={S.accent}
              emissiveIntensity={(accent ? 0.12 : 0) + flash * 0.4}
            />
          </mesh>
          {/* Two pips on the camera-facing side. */}
          {[0.32, 0.68].map((f) => (
            <mesh key={f} position={[TILE_T / 2 + 0.005, TILE_H * f, 0]}>
              <sphereGeometry args={[0.07, 16, 12]} />
              <Clay color={accent ? S.paper : mixHex(S.clay[0], S.accent, 0.3)} roughness={0.4} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
};

const TileLabel: React.FC<{
  label: string;
  at: number;
  x: number;
  y: number;
  above: boolean;
  index: number;
  accent: boolean;
  fontSize: number;
}> = ({ label, at, x, y, above, index, accent, fontSize }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const pop = useSpringAt(at, 200, 14, 0.7);
  const reaction = useReaction(index);
  const float = useFloat(`domino-label${index}`, 3);
  if (t < at) return null;
  const clampedX = Math.min(1080 - 60, Math.max(60, x));
  return (
    <div
      style={{
        position: 'absolute',
        left: clampedX,
        top: y,
        transform: `translate(-50%, ${above ? '-100%' : '0%'}) translateY(${((1 - pop) * (above ? 18 : -18) + float.y).toFixed(2)}px) scale(${(0.8 + 0.2 * Math.min(1, pop)).toFixed(4)}) ${reactionTransform(reaction)}`,
        opacity: ramp(t, at, 0.2),
      }}
    >
      <Glow color={S.accent} intensity={reaction.glow * 0.6} radius={80} />
      <div
        style={{
          position: 'relative',
          padding: '8px 22px',
          borderRadius: 999,
          background: accent ? S.accent : S.cardRaised,
          border: `1.5px solid ${accent ? S.accent : S.cardBorder}`,
          color: accent ? '#ffffff' : S.text,
          fontFamily: S.font,
          fontWeight: 800,
          fontSize,
          whiteSpace: 'nowrap',
          boxShadow: '0 12px 30px rgba(0,0,0,0.28)',
        }}
      >
        {label}
      </div>
    </div>
  );
};
