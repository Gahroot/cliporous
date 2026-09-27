/**
 * Funnel scene (3D) — a translucent clay funnel (one lathe band per stage,
 * soft rim highlights) with tracked stage labels on the right. From the first
 * stage's beat many small clay pebbles drop into the mouth and swirl down;
 * each band holds its pebbles until the next stage's word, and fewer make it
 * through every stage (deterministic quotas from `hash01`). A few survivors
 * turn accent, drop out of the spout and land as the optional result pill.
 */

import type React from 'react';
import { useMemo } from 'react';
import { Easing, interpolate } from 'remotion';
import { DoubleSide, LatheGeometry, SphereGeometry, Vector2 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  Burst,
  Glow,
  hash01,
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
import type { FunnelScene as FunnelSceneData } from './types';

const CAMERA: CameraSpec = { position: [0, 2.4, 10.6], fov: 30 };
const FUNNEL_X = -1.3;
const Y_TOP = 1.5;
const Y_NECK = -0.85;
const Y_SPOUT = -1.25;
const Y_OUT = -1.8;
const GROUND_Y = -2.05;
const R_TOP = 1.3;
const R_NECK = 0.24;
const LABEL_X = 630;
const PEBBLES = 34;
const PEBBLE = 0.085;
const DROP_SEC = 0.5;
const SETTLE_SEC = 0.4;
const MOVE_SEC = 0.42;

/** Funnel wall radius at height y (flared horn profile). */
function radiusAt(y: number): number {
  if (y <= Y_NECK) return R_NECK;
  const u = Math.min(1, (y - Y_NECK) / (Y_TOP - Y_NECK));
  return R_NECK + (R_TOP - R_NECK) * u ** 1.7;
}

interface Band {
  top: number;
  bottom: number;
  mid: number;
}

function bands(n: number): Band[] {
  const h = (Y_TOP - Y_NECK) / n;
  return Array.from({ length: n }, (_, i) => {
    const top = Y_TOP - i * h;
    return { top, bottom: top - h, mid: top - h / 2 };
  });
}

// ---------------------------------------------------------------------------
// Pebble simulation (pure function of t)
// ---------------------------------------------------------------------------

interface Waypoint {
  t: number;
  y: number;
}

interface PebblePlan {
  spawn: number;
  /** Stages passed: < n = filtered in that band, n = exits the spout. */
  level: number;
  rf: number;
  theta0: number;
  omega: number;
  waypoints: Waypoint[];
  /** Fade/shrink start (filtered: in the band; survivors: after landing). */
  fadeAt: number;
  /** When a survivor leaves the last band (turns accent). */
  exitAt: number;
  cube: boolean;
  tone: number;
}

function planPebbles(scene: FunnelSceneData): PebblePlan[] {
  const n = scene.stages.length;
  const bs = bands(n);
  const first = scene.stages[0]?.at ?? 0.3;
  const last = scene.stages[n - 1]?.at ?? first;
  const exitGate = Math.max(
    last + 0.3,
    scene.resultAt !== undefined ? scene.resultAt - 0.75 : last + 0.5,
  );
  const gateOut = (i: number): number => (i < n - 1 ? (scene.stages[i + 1]?.at ?? last) : exitGate);
  const span = Math.min(2.2, Math.max(1.1, last - first + 0.4));

  // Deterministic quotas: half survive each stage, at least 3 exit.
  const pass = Array.from({ length: n }, (_, j) =>
    Math.max(3, Math.round(PEBBLES * 0.5 ** (j + 1))),
  );
  const ranks = Array.from({ length: PEBBLES }, (_, k) => k).sort(
    (a, b) => hash01(`fn-rank${a}`) - hash01(`fn-rank${b}`),
  );
  const rankOf = new Array<number>(PEBBLES);
  ranks.forEach((k, r) => {
    rankOf[k] = r;
  });

  return Array.from({ length: PEBBLES }, (_, k) => {
    const rank = rankOf[k] ?? k;
    const level = pass.filter((p) => rank < p).length;
    const h = (s: string): number => hash01(`fn-${s}${k}`);
    // Survivors spawn early so they have time to travel the whole funnel.
    const order = level === n ? h('o') * 0.35 : k / PEBBLES;
    const spawn = first - 0.2 + order * span;
    const rf = 0.3 + h('r') * 0.5;
    const yStart = Y_TOP + 1.5 + h('y') * 0.9;
    const wps: Waypoint[] = [
      { t: spawn, y: yStart },
      { t: spawn + DROP_SEC, y: Y_TOP - 0.05 },
    ];
    let arrive = spawn + DROP_SEC;
    let fadeAt = Number.POSITIVE_INFINITY;
    let exitAt = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      const b = bs[i] as Band;
      const rest = b.bottom + (b.top - b.bottom) * (0.2 + h(`h${i}`) * 0.45);
      const settled = arrive + SETTLE_SEC;
      wps.push({ t: settled, y: rest });
      if (level === i) {
        fadeAt = Math.max(settled, (scene.stages[i]?.at ?? 0) + 0.15 + h('f') * 0.6);
        break;
      }
      const leave = Math.max(settled, gateOut(i) + h(`l${i}`) * 0.4);
      wps.push({ t: leave, y: rest });
      arrive = leave + MOVE_SEC * 0.6;
      if (i === n - 1) {
        exitAt = leave;
        wps.push({ t: leave + 0.35, y: Y_SPOUT });
        wps.push({ t: leave + 0.65, y: Y_OUT });
        fadeAt = leave + 0.7;
      }
    }
    return {
      spawn,
      level,
      rf,
      theta0: h('t') * Math.PI * 2,
      omega: 1 + h('w') * 1.3,
      waypoints: wps,
      fadeAt,
      exitAt,
      cube: h('c') > 0.55,
      tone: Math.floor(h('k') * 3),
    };
  });
}

function sampleY(wps: readonly Waypoint[], t: number): number {
  const firstWp = wps[0] as Waypoint;
  if (t <= firstWp.t) return firstWp.y;
  for (let i = 1; i < wps.length; i++) {
    const a = wps[i - 1] as Waypoint;
    const b = wps[i] as Waypoint;
    if (t <= b.t) {
      const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      // First segment is a gravity drop; the rest ease in/out.
      const e = i === 1 ? u * u : Easing.inOut(Easing.cubic)(u);
      return a.y + (b.y - a.y) * e;
    }
  }
  return (wps[wps.length - 1] as Waypoint).y;
}

const Pebbles: React.FC<{ scene: FunnelSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const plans = useMemo(() => planPebbles(scene), [scene]);
  const sphere = useMemo(() => new SphereGeometry(1, 12, 9), []);
  const cube = useMemo(() => new RoundedBoxGeometry(1.6, 1.6, 1.6, 2, 0.4), []);
  const tones = [S.clay[0], S.clay[1], S.paper];
  return (
    <>
      {plans.map((p, k) => {
        if (t < p.spawn) return null;
        const fade = t < p.fadeAt ? 1 : 1 - Math.min(1, (t - p.fadeAt) / 0.35);
        if (fade <= 0.01) return null;
        const y = sampleY(p.waypoints, t);
        const enteredAt = p.spawn + DROP_SEC;
        const theta = p.theta0 + Math.max(0, t - enteredAt) * p.omega;
        // Radius follows the wall; survivors converge on the axis below the spout.
        const wall = Math.max(0.05, radiusAt(Math.min(y, Y_TOP)) - PEBBLE * 1.4);
        const below = y < Y_SPOUT ? Math.max(0, 1 - (Y_SPOUT - y) / 0.3) : 1;
        const r = p.rf * wall * below;
        const x = FUNNEL_X + Math.cos(theta) * r;
        const z = Math.sin(theta) * r;
        const accent = p.level === scene.stages.length ? ramp(t, p.exitAt, 0.4) : 0;
        const color = mixHex(tones[p.tone] ?? S.paper, S.accent, accent);
        const size = PEBBLE * (0.85 + hash01(`fn-s${k}`) * 0.35) * (0.4 + 0.6 * fade);
        return (
          <mesh
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed pebble pool
            key={k}
            geometry={p.cube ? cube : sphere}
            position={[x, y, z]}
            rotation={[t * 2 + k, t * 1.4 + k * 0.7, 0]}
            scale={size}
          >
            <meshStandardMaterial
              color={color}
              roughness={0.55}
              metalness={0.02}
              emissive={S.accent}
              emissiveIntensity={accent * 0.35}
            />
          </mesh>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------------------
// Funnel body
// ---------------------------------------------------------------------------

function bandGeometry(b: Band): LatheGeometry {
  const pts: Vector2[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const y = b.bottom + ((b.top - b.bottom) * i) / steps;
    pts.push(new Vector2(radiusAt(y), y));
  }
  return new LatheGeometry(pts, 48);
}

const Funnel: React.FC<{ scene: FunnelSceneData; enter: number }> = ({ scene, enter }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const n = scene.stages.length;
  const bs = useMemo(() => bands(n), [n]);
  const geoms = useMemo(() => bs.map(bandGeometry), [bs]);
  const spout = useMemo(
    () =>
      new LatheGeometry(
        [
          new Vector2(R_NECK, Y_NECK),
          new Vector2(R_NECK * 0.92, Y_SPOUT + 0.1),
          new Vector2(R_NECK * 0.95, Y_SPOUT),
        ],
        40,
      ),
    [],
  );
  return (
    <group position={[FUNNEL_X, 0, 0]} scale={0.9 + enter * 0.1}>
      {bs.map((b, i) => {
        const st = scene.stages[i];
        const lit = st ? ramp(t, st.at, 0.4) : 0;
        const flash = st && t >= st.at ? Math.exp(-(t - st.at) / 0.35) : 0;
        const base = mixHex(S.clay[1], S.clay[0], n > 1 ? i / (n - 1) : 0);
        const color = mixHex(base, S.accent, 0.4 * lit);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: bands are positional
          <group key={i}>
            <mesh geometry={geoms[i]} renderOrder={2}>
              <meshStandardMaterial
                color={color}
                roughness={0.5}
                metalness={0.02}
                transparent
                opacity={(0.34 + 0.16 * lit) * enter}
                side={DoubleSide}
                depthWrite={false}
                emissive={S.accent}
                emissiveIntensity={0.12 * lit + 0.35 * flash}
              />
            </mesh>
            {/* Rim highlight at the band's upper edge. */}
            <mesh position={[0, b.top, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[radiusAt(b.top), i === 0 ? 0.05 : 0.03, 8, 64]} />
              <meshStandardMaterial
                color={mixHex(S.paper, S.accent, 0.7 * lit)}
                roughness={0.45}
                metalness={0.05}
                emissive={S.accent}
                emissiveIntensity={0.25 * lit + 0.6 * flash}
                transparent
                opacity={enter}
              />
            </mesh>
          </group>
        );
      })}
      <mesh geometry={spout} renderOrder={2}>
        <meshStandardMaterial
          color={S.clay[0]}
          roughness={0.5}
          transparent
          opacity={0.5 * enter}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, Y_SPOUT, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R_NECK * 0.95, 0.028, 8, 32]} />
        <meshStandardMaterial color={S.paper} roughness={0.45} transparent opacity={enter} />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Labels + result (HTML, tracked to the 3D bands)
// ---------------------------------------------------------------------------

const StageLabel: React.FC<{
  label: string;
  at: number;
  index: number;
  anchor: { x: number; y: number };
}> = ({ label, at, index, anchor }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const enter = ramp(t, 0.15 + index * 0.09, 0.55);
  const lit = ramp(t, at, 0.35);
  const pop = usePop(at, 240, 12);
  const bump =
    t >= at ? Math.sin(Math.min(1, pop) * Math.PI) * (1 - Math.min(1, (t - at) / 0.8)) : 0;
  const reaction = useReaction(index);
  const float = useFloat(`funnel-label${index}`, 3);
  const shadow = useLivingShadow(`funnel-label${index}`, 0.7);
  const lineFrom = anchor.x + 14;
  const lineTo = LABEL_X - 14;
  const lineColor = lit > 0.5 ? S.accent : S.muted;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: lineFrom,
          top: anchor.y - 1.5,
          width: Math.max(0, (lineTo - lineFrom) * enter),
          height: 3,
          borderRadius: 2,
          background: lineColor,
          opacity: 0.25 + 0.6 * lit,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: anchor.x + 6,
          top: anchor.y - 6,
          width: 12,
          height: 12,
          borderRadius: 6,
          background: lineColor,
          opacity: enter * (0.4 + 0.6 * lit),
          boxShadow: lit > 0.5 ? `0 0 14px ${S.accent}` : undefined,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: LABEL_X,
          top: anchor.y,
          transform: `translate(${(1 - enter) * 40 + float.x}px, calc(-50% + ${float.y.toFixed(2)}px)) scale(${(1 + bump * 0.09).toFixed(4)}) ${reactionTransform(reaction)}`,
          transformOrigin: 'left center',
          opacity: enter * (0.5 + 0.5 * lit),
        }}
      >
        <Glow color={S.accent} intensity={bump * 0.9 + reaction.glow * 0.6} radius={90} />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '10px 28px 10px 12px',
            borderRadius: 999,
            background: S.cardRaised,
            border: `1.5px solid ${lit > 0.5 ? mixHex(S.cardRaised, S.accent, 0.5) : S.cardBorder}`,
            boxShadow: shadow,
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: lit > 0.5 ? S.accent : S.card,
              color: lit > 0.5 ? '#ffffff' : S.muted,
              fontFamily: S.font,
              fontWeight: 800,
              fontSize: 24,
            }}
          >
            {index + 1}
          </div>
          <div
            style={{
              fontFamily: S.font,
              fontWeight: 700,
              fontSize: 36,
              color: lit > 0.5 ? S.text : S.muted,
            }}
          >
            {label}
          </div>
        </div>
      </div>
    </>
  );
};

const ResultPill: React.FC<{ text: string; at: number; x: number; y: number; index: number }> = ({
  text,
  at,
  x,
  y,
  index,
}) => {
  const S = useStage();
  const pop = usePop(at, 200, 13);
  const breath = useBreath('funnel-result');
  const reaction = useReaction(index);
  if (pop <= 0.001) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${(0.6 + pop * 0.4).toFixed(4)}) ${reactionTransform(reaction)}`,
        opacity: Math.min(1, pop * 1.5),
      }}
    >
      <Glow color={S.accent} intensity={0.5 + breath * 0.35} radius={110} />
      <div
        style={{
          position: 'relative',
          padding: '12px 32px',
          borderRadius: 999,
          background: S.accent,
          color: '#ffffff',
          fontFamily: S.font,
          fontWeight: 800,
          fontSize: 38,
          whiteSpace: 'nowrap',
          boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
        }}
      >
        {text}
      </div>
    </div>
  );
};

export const FunnelScene: React.FC<{ scene: FunnelSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const n = scene.stages.length;
  const bs = useMemo(() => bands(n), [n]);
  const last = scene.stages[n - 1]?.at ?? 0;
  const rig = { focusAt: scene.resultAt ?? last, driftDeg: 5, pushAmount: 0.07 };
  const camera = useRigCamera(CAMERA, rig);
  const enter = interpolate(t, [0, 0.55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const result = projectToStage(camera, [FUNNEL_X, Y_OUT - 0.05, 0.3]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Stage3D camera={CAMERA} {...rig} groundY={GROUND_Y} shadowScale={6}>
        <Funnel scene={scene} enter={enter} />
        <Pebbles scene={scene} />
      </Stage3D>
      {scene.stages.map((st, i) => {
        const b = bs[i] as Band;
        const anchor = projectToStage(camera, [FUNNEL_X + radiusAt(b.mid) * 0.98, b.mid, 0]);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: stages are positional
          <StageLabel key={i} label={st.label} at={st.at} index={i} anchor={anchor} />
        );
      })}
      {scene.result && scene.resultAt !== undefined && (
        <>
          <Burst
            atSec={scene.resultAt}
            x={result.x}
            y={result.y}
            color={S.accent}
            radius={200}
            count={14}
            seed="funnel"
          />
          <ResultPill text={scene.result} at={scene.resultAt} x={result.x} y={result.y} index={n} />
        </>
      )}
    </div>
  );
};
