/**
 * Stairs scene (3D) — 2–5 clay steps rising left-bottom → right-top, each
 * labelled on its front riser. A glossy accent ball waits on the ground and
 * hops (parabola, crouch + squash on landing) onto step i, landing at
 * `steps[i].at + 0.3`. Reached steps warm toward the accent; the top step
 * glows when the ball arrives, next to a small waving flag.
 */

import type React from 'react';
import { useMemo } from 'react';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Clay } from './hero-kit';
import { Burst, Glow, reactionTransform, useReaction } from './motion';
import { mixHex } from './palette';
import { Stage3D, useRigCamera } from './Stage3D';
import { ramp, useSceneTime, useStage } from './stage';
import { type CameraSpec, projectToStage } from './three-helpers';
import type { StairsScene as StairsSceneData } from './types';

const CAMERA: CameraSpec = { position: [2.4, 2.6, 10.4], fov: 30 };
const GROUND_Y = -1.75;
const DEPTH = 1.1;
const BALL_R = 0.2;
const LAND_DELAY = 0.3;
const HOP_SEC = 0.42;

interface Layout {
  w: number;
  h: number;
  x0: number;
}

function layout(n: number): Layout {
  const span = 5.2;
  const w = span / n;
  const h = Math.min(0.75, 3.1 / n);
  return { w, h, x0: -span / 2 + 0.35 };
}

function stepCenterX(L: Layout, i: number): number {
  return L.x0 + (i + 0.5) * L.w;
}

interface Hop {
  from: [number, number];
  to: [number, number];
  land: number;
}

function hops(scene: StairsSceneData, L: Layout): Hop[] {
  let prev: [number, number] = [L.x0 - 0.5, GROUND_Y + BALL_R];
  return scene.steps.map((s, i) => {
    const to: [number, number] = [stepCenterX(L, i), GROUND_Y + (i + 1) * L.h + BALL_R];
    const hop = { from: prev, to, land: s.at + LAND_DELAY };
    prev = to;
    return hop;
  });
}

function ballAt(t: number, hs: readonly Hop[]): { x: number; y: number; sy: number } {
  let pos: [number, number] = hs[0]?.from ?? [0, 0];
  let sy = 1;
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i] as Hop;
    const prevLand = i > 0 ? (hs[i - 1] as Hop).land : Number.NEGATIVE_INFINITY;
    const start = Math.max(h.land - HOP_SEC, prevLand + 0.12);
    const dur = h.land - start;
    if (t < start - 0.1) break;
    if (t < start) {
      // Crouch before take-off.
      sy = 1 - Math.sin(((t - (start - 0.1)) / 0.1) * (Math.PI / 2)) * 0.18;
      break;
    }
    if (t < h.land) {
      const u = (t - start) / dur;
      const apex = Math.max(h.from[1], h.to[1]) + 0.55;
      // Quadratic Bézier through the apex control point.
      const cy = 2 * apex - (h.from[1] + h.to[1]) / 2;
      const x = h.from[0] + (h.to[0] - h.from[0]) * u;
      const y = (1 - u) ** 2 * h.from[1] + 2 * (1 - u) * u * cy + u * u * h.to[1];
      return { x, y, sy: 1.06 };
    }
    pos = h.to;
    const since = t - h.land;
    sy = since < 0.3 ? 1 - Math.sin((since / 0.3) * Math.PI) * Math.exp(-since * 6) * 0.3 : 1;
  }
  return { x: pos[0], y: pos[1], sy };
}

export const StairsScene: React.FC<{ scene: StairsSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const n = scene.steps.length;
  const L = useMemo(() => layout(n), [n]);
  const hs = useMemo(() => hops(scene, L), [scene, L]);
  const topLand = hs[n - 1]?.land ?? 0;
  const rig = { focusAt: topLand, driftDeg: 4, pushAmount: 0.06 };
  const camera = useRigCamera(CAMERA, rig);
  const enter = ramp(t, 0, 0.5);
  const ball = ballAt(t, hs);
  const fontSize = n >= 5 ? 32 : n === 4 ? 36 : 42;
  const topPt = projectToStage(camera, [stepCenterX(L, n - 1), GROUND_Y + n * L.h + 0.2, 0]);

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: enter }}>
      <Stage3D camera={CAMERA} {...rig} groundY={GROUND_Y} shadowScale={7}>
        {scene.steps.map((_, i) => (
          <Step
            // biome-ignore lint/suspicious/noArrayIndexKey: steps are positional
            key={i}
            L={L}
            index={i}
            reachedAt={hs[i]?.land ?? 0}
            top={i === n - 1}
          />
        ))}
        <Flag x={stepCenterX(L, n - 1) + L.w * 0.3} y={GROUND_Y + n * L.h} litAt={topLand} />
        <group
          position={[ball.x, ball.y - BALL_R, 0]}
          scale={[1 + (1 - ball.sy) * 0.6, ball.sy, 1 + (1 - ball.sy) * 0.6]}
        >
          <mesh position={[0, BALL_R, 0]}>
            <sphereGeometry args={[BALL_R, 32, 24]} />
            <meshStandardMaterial
              color={S.accent}
              roughness={0.18}
              metalness={0.25}
              emissive={S.accent}
              emissiveIntensity={0.18}
            />
          </mesh>
        </group>
      </Stage3D>
      {scene.steps.map((s, i) => {
        const anchor = projectToStage(camera, [
          stepCenterX(L, i),
          GROUND_Y + (i + 0.5) * L.h,
          DEPTH / 2,
        ]);
        return (
          <StepLabel
            // biome-ignore lint/suspicious/noArrayIndexKey: steps are positional
            key={i}
            label={s.label}
            at={s.at}
            x={anchor.x}
            y={anchor.y}
            maxWidth={(1080 / 6.4) * L.w - 12}
            index={i}
            fontSize={fontSize}
          />
        );
      })}
      <Burst
        atSec={topLand}
        x={topPt.x}
        y={topPt.y}
        color={S.accent}
        radius={180}
        count={12}
        seed="stairs"
      />
    </div>
  );
};

const Step: React.FC<{ L: Layout; index: number; reachedAt: number; top: boolean }> = ({
  L,
  index,
  reachedAt,
  top,
}) => {
  const S = useStage();
  const { t } = useSceneTime();
  const reaction = useReaction(index);
  const height = (index + 1) * L.h;
  const geometry = useMemo(
    () => new RoundedBoxGeometry(L.w - 0.04, height, DEPTH, 3, 0.06),
    [L.w, height],
  );
  const lit = ramp(t, reachedAt, 0.35);
  const flash = t >= reachedAt ? Math.exp(-(t - reachedAt) / 0.35) : 0;
  const base = mixHex(S.clay[0], S.paper, 0.55 - index * 0.05);
  const color = mixHex(base, S.accent, (top ? 0.75 : 0.3) * lit);
  return (
    <group position={[stepCenterX(L, index), GROUND_Y + height / 2, 0]} scale={reaction.scale}>
      <mesh geometry={geometry}>
        <Clay
          color={color}
          roughness={0.5}
          metalness={0.03}
          emissive={S.accent}
          emissiveIntensity={flash * 0.35 + (top ? 0.3 * lit : 0)}
        />
      </mesh>
    </group>
  );
};

const Flag: React.FC<{ x: number; y: number; litAt: number }> = ({ x, y, litAt }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const lit = ramp(t, litAt, 0.4);
  const wave = Math.sin(t * 5) * 0.12;
  return (
    <group position={[x, y, -0.2]}>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.8, 10]} />
        <Clay color={S.paper} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.8, 0]}>
        <sphereGeometry args={[0.04, 12, 10]} />
        <Clay color={S.paper} roughness={0.4} />
      </mesh>
      <mesh position={[0.2, 0.64, 0]} rotation={[0, wave, 0]}>
        <boxGeometry args={[0.38, 0.24, 0.02]} />
        <Clay
          color={mixHex(S.clay[0], S.accent, 0.5 + 0.5 * lit)}
          roughness={0.45}
          emissive={S.accent}
          emissiveIntensity={0.3 * lit}
        />
      </mesh>
    </group>
  );
};

const StepLabel: React.FC<{
  label: string;
  at: number;
  x: number;
  y: number;
  maxWidth: number;
  index: number;
  fontSize: number;
}> = ({ label, at, x, y, maxWidth, index, fontSize }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const reaction = useReaction(index);
  const enter = ramp(t, at, 0.3);
  if (t < at) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: maxWidth,
        transform: `translate(-50%, calc(-50% + ${((1 - enter) * 14).toFixed(2)}px)) ${reactionTransform(reaction)}`,
        opacity: enter,
        textAlign: 'center',
        fontFamily: S.font,
        fontWeight: 800,
        fontSize,
        lineHeight: 1.05,
        color: S.paperText,
      }}
    >
      <Glow color={S.accent} intensity={reaction.glow * 0.5} radius={70} />
      <span style={{ position: 'relative' }}>{label}</span>
    </div>
  );
};
