/**
 * Compound scene (3D) — 3–6 towers of stacked clay coins on the ground,
 * heights proportional to each point's value (≤14 coins). From `growAt` the
 * towers fill one after another: coins drop in and settle with a tiny squash.
 * The last tower is accent-tinted; its optional callout pill pops above it.
 * Labels track under the towers; the title sits on top as HTML.
 */

import type React from 'react';
import { useMemo } from 'react';
import { Easing, interpolate } from 'remotion';
import type { BufferGeometry } from 'three';
import { Clay, lathe } from './hero-kit';
import {
  Burst,
  Glow,
  reactionTransform,
  useBreath,
  useFloat,
  useLivingShadow,
  useReaction,
} from './motion';
import { mixHex } from './palette';
import { Stage3D, useRigCamera } from './Stage3D';
import { ramp, usePop, useSceneTime, useStage } from './stage';
import { type CameraSpec, projectToStage } from './three-helpers';
import type { CompoundScene as CompoundSceneData } from './types';

/** Same timing as COMPOUND_GROW_SEC in src/main/ai/explainer/kinds-3d-objects.ts */
const COMPOUND_GROW_SEC = 0.55;
/** Same timing as COMPOUND_STAGGER_SEC in src/main/ai/explainer/kinds-3d-objects.ts */
const COMPOUND_STAGGER_SEC = 0.22;
/** Same as compoundCalloutAt in src/main/ai/explainer/kinds-3d-objects.ts */
function compoundCalloutAt(growAt: number, count: number): number {
  return growAt + (count - 1) * COMPOUND_STAGGER_SEC + COMPOUND_GROW_SEC + 0.15;
}

const CAMERA: CameraSpec = { position: [0, 2.2, 10.6], fov: 30 };
const GROUND_Y = -1.7;
const MAX_COINS = 14;
const COIN_STEP = 0.19;
const COIN_SCALE = 0.7;
const DROP_SEC = 0.2;
const DROP_H = 0.8;
const COIN_THICK = 1.2;

function coinGeometry(): BufferGeometry {
  return lathe(
    [
      [0, -0.075],
      [0.55, -0.075],
      [0.6, -0.065],
      [0.62, -0.035],
      [0.62, 0.035],
      [0.6, 0.065],
      [0.55, 0.075],
      [0.47, 0.075],
      [0.45, 0.06],
      [0, 0.06],
    ],
    44,
  );
}

function towerX(i: number, n: number): number {
  const gap = n <= 3 ? 1.55 : n === 4 ? 1.3 : n === 5 ? 1.1 : 0.95;
  return (i - (n - 1) / 2) * gap;
}

function coinCounts(points: CompoundSceneData['points']): number[] {
  const max = Math.max(1e-6, ...points.map((p) => p.value));
  return points.map((p) =>
    Math.max(1, Math.min(MAX_COINS, Math.round((p.value / max) * MAX_COINS))),
  );
}

/** Seconds coin k of a tower (with `count` coins) lands, tower starts at `start`. */
function landAt(start: number, k: number, count: number): number {
  const span = COMPOUND_GROW_SEC - DROP_SEC;
  return start + DROP_SEC + (count > 1 ? (span * k) / (count - 1) : 0);
}

const Tower: React.FC<{
  geometry: BufferGeometry;
  x: number;
  count: number;
  start: number;
  accent: boolean;
  index: number;
}> = ({ geometry, x, count, start, accent, index }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const reaction = useReaction(index);
  const base = accent ? mixHex(S.clay[0], S.accent, 0.85) : mixHex(S.clay[0], S.paper, 0.55);
  const rim = mixHex(base, S.paper, 0.35);
  return (
    <group position={[x, GROUND_Y, 0]} scale={reaction.scale}>
      {/* Faint base plate so empty towers read before they grow. */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.62 * COIN_SCALE + 0.06, 40]} />
        <meshBasicMaterial color={S.card} transparent opacity={0.8} />
      </mesh>
      {Array.from({ length: count }, (_, k) => {
        const land = landAt(start, k, count);
        const from = land - DROP_SEC;
        if (t < from) return null;
        const p = Math.min(1, (t - from) / DROP_SEC);
        const restY = 0.075 * COIN_THICK + k * COIN_STEP;
        const y = restY + (1 - p * p) * DROP_H;
        const since = t - land;
        const squash =
          since >= 0 && since < 0.25 ? 1 - Math.sin((since / 0.25) * Math.PI) * 0.18 : 1;
        const tilt = (1 - p) * 0.5 * (k % 2 === 0 ? 1 : -1);
        const glow = accent && k === count - 1 ? ramp(t, land, 0.3) : 0;
        return (
          <group
            // biome-ignore lint/suspicious/noArrayIndexKey: coins are positional
            key={k}
            position={[((k * 37) % 5) * 0.006 - 0.012, y, 0]}
            rotation={[tilt, k * 0.7, 0]}
            scale={[COIN_SCALE, COIN_SCALE * COIN_THICK * squash, COIN_SCALE]}
          >
            <mesh geometry={geometry}>
              <Clay
                color={base}
                roughness={0.42}
                metalness={0.12}
                emissive={S.accent}
                emissiveIntensity={accent ? 0.12 + glow * 0.15 : 0}
              />
            </mesh>
            <mesh position={[0, 0.058, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.33, 0.028, 8, 36]} />
              <Clay color={rim} roughness={0.42} metalness={0.12} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

const PointLabel: React.FC<{
  label: string;
  x: number;
  y: number;
  start: number;
  index: number;
  accent: boolean;
  fontSize: number;
}> = ({ label, x, y, start, index, accent, fontSize }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const enter = ramp(t, 0.1 + index * 0.06, 0.5);
  const lit = ramp(t, start, 0.35);
  const reaction = useReaction(index);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, ${(1 - enter) * 16}px) ${reactionTransform(reaction)}`,
        opacity: enter * (0.4 + 0.6 * lit),
        fontFamily: S.font,
        fontWeight: 800,
        fontSize,
        color: accent && lit > 0.5 ? S.accent : lit > 0.5 ? S.text : S.muted,
        whiteSpace: 'nowrap',
        letterSpacing: -0.5,
      }}
    >
      {label}
    </div>
  );
};

const Callout: React.FC<{ text: string; at: number; x: number; y: number; index: number }> = ({
  text,
  at,
  x,
  y,
  index,
}) => {
  const S = useStage();
  const pop = usePop(at, 200, 13);
  const breath = useBreath('compound-callout');
  const float = useFloat('compound-callout', 4);
  const shadow = useLivingShadow('compound-callout', 0.8);
  const reaction = useReaction(index);
  if (pop <= 0.001) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, calc(-100% + ${((1 - pop) * 30 + float.y).toFixed(2)}px)) scale(${(0.6 + pop * 0.4).toFixed(4)}) ${reactionTransform(reaction)}`,
        transformOrigin: 'center bottom',
        opacity: Math.min(1, pop * 1.5),
      }}
    >
      <Glow color={S.accent} intensity={0.45 + breath * 0.3} radius={110} />
      <div
        style={{
          position: 'relative',
          padding: '12px 32px',
          borderRadius: 999,
          background: S.accent,
          color: '#ffffff',
          fontFamily: S.font,
          fontWeight: 800,
          fontSize: 44,
          whiteSpace: 'nowrap',
          boxShadow: shadow,
        }}
      >
        {text}
      </div>
    </div>
  );
};

export const CompoundScene: React.FC<{ scene: CompoundSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const n = scene.points.length;
  const counts = useMemo(() => coinCounts(scene.points), [scene.points]);
  const geometry = useMemo(coinGeometry, []);
  const calloutAt = compoundCalloutAt(scene.growAt, n);
  const rig = { focusAt: calloutAt, driftDeg: 5, pushAmount: 0.06 };
  const camera = useRigCamera(CAMERA, rig);
  const titleIn = interpolate(t, [0, 0.55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const labelSize = n >= 6 ? 36 : n >= 5 ? 40 : 46;
  const lastCount = counts[n - 1] ?? 1;
  const lastX = towerX(n - 1, n);
  const top = projectToStage(camera, [lastX, GROUND_Y + lastCount * COIN_STEP + 0.3, 0]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div
        style={{
          position: 'absolute',
          left: 60,
          right: 60,
          top: 64,
          textAlign: 'center',
          fontFamily: S.font,
          fontWeight: 800,
          fontSize: 64,
          letterSpacing: -1,
          color: S.text,
          opacity: titleIn,
          transform: `translateY(${(1 - titleIn) * 18}px)`,
        }}
      >
        {scene.title}
      </div>
      <Stage3D camera={CAMERA} {...rig} groundY={GROUND_Y} shadowScale={7}>
        {scene.points.map((_, i) => (
          <Tower
            // biome-ignore lint/suspicious/noArrayIndexKey: towers are positional
            key={i}
            geometry={geometry}
            x={towerX(i, n)}
            count={counts[i] ?? 1}
            start={scene.growAt + i * COMPOUND_STAGGER_SEC}
            accent={i === n - 1}
            index={i}
          />
        ))}
      </Stage3D>
      {scene.points.map((p, i) => {
        const anchor = projectToStage(camera, [towerX(i, n), GROUND_Y - 0.12, 0.6]);
        return (
          <PointLabel
            // biome-ignore lint/suspicious/noArrayIndexKey: labels are positional
            key={i}
            label={p.label}
            x={anchor.x}
            y={anchor.y}
            start={scene.growAt + i * COMPOUND_STAGGER_SEC}
            index={i}
            accent={i === n - 1}
            fontSize={labelSize}
          />
        );
      })}
      {scene.callout && (
        <>
          <Burst
            atSec={calloutAt}
            x={top.x}
            y={top.y}
            color={S.accent}
            radius={170}
            count={12}
            seed="compound"
          />
          <Callout text={scene.callout} at={calloutAt} x={top.x} y={top.y} index={n - 1} />
        </>
      )}
    </div>
  );
};
