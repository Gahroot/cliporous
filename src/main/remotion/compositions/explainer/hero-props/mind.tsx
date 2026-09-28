/**
 * Hero props: brain, heart, battery, flame — soft clay "mind & body" objects.
 *
 * Each one already reads as its object when it pops in on `at`; its signature
 * motion peaks exactly `heroImpactSec(prop, tone)` after `at` (hero-catalog.ts),
 * where the scene bursts, pushes the camera and plays the cue sound.
 */

import type React from 'react';
import { useMemo } from 'react';
import { Euler, ExtrudeGeometry, type LatheGeometry, Quaternion, Shape, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HERO_CATALOG } from '../hero-catalog';
import {
  Clay,
  type HeroPropDef,
  type HeroPropProps,
  lathe,
  useSpringAt,
  wobble,
} from '../hero-kit';
import { hash01 } from '../motion';
import { mixHex } from '../palette';
import { ramp, useSceneTime, useStage } from '../stage';

type Vec3 = [number, number, number];

function normalize([x, y, z]: Vec3): Vec3 {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

// ---------------------------------------------------------------------------
// Brain — two hemispheres of squashed clay lobes; pulses travel across it.
// ---------------------------------------------------------------------------

/** Seconds after `at` of the first neural flash (hero-catalog impactSec). */
const BRAIN_SPARK_SEC = HERO_CATALOG.brain.impactSec;
const HEMI_R: Vec3 = [0.5, 0.66, 0.9];
const HEMI_X = 0.46;
const LOBE_POINTS = 64;
/** Seconds a pulse needs to cross its arc, and the repeat period. */
const PULSE_TRAVEL = 0.75;
const PULSE_PERIOD = 1.5;

interface Lobe {
  pos: Vec3;
  rot: Vec3;
  r: number;
  tint: number;
}

/** Point on a hemisphere's ellipsoid surface for a unit direction. */
function hemiPoint(side: -1 | 1, dir: Vec3, k: number): Vec3 {
  return [side * HEMI_X + dir[0] * HEMI_R[0] * k, dir[1] * HEMI_R[1] * k, dir[2] * HEMI_R[2] * k];
}

function buildLobes(): Lobe[] {
  const lobes: Lobe[] = [];
  const up = new Vector3(0, 1, 0);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < LOBE_POINTS; i++) {
      const y = 1 - ((i + 0.5) / LOBE_POINTS) * 2;
      const rr = Math.sqrt(1 - y * y);
      const a = i * golden + (side > 0 ? 0.9 : 0);
      const dir: Vec3 = [Math.cos(a) * rr, y, Math.sin(a) * rr];
      // Skip the flat inner (medial) face and the underside.
      if (dir[0] * side < -0.25 || dir[1] < -0.72) continue;
      const pos = hemiPoint(side, dir, 0.97);
      const n = new Vector3(dir[0] / HEMI_R[0], dir[1] / HEMI_R[1], dir[2] / HEMI_R[2]).normalize();
      // Gyrus: capsule laid tangent to the surface (axis Y → X, spun about the
      // normal), its local X (after the lay-down) squashed along the normal.
      const spin = new Quaternion().setFromAxisAngle(up, hash01(`lobe-s${side}${i}`) * Math.PI);
      const lay = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
      const q = new Quaternion().setFromUnitVectors(up, n).multiply(spin).multiply(lay);
      const e = new Euler().setFromQuaternion(q);
      lobes.push({
        pos,
        rot: [e.x, e.y, e.z],
        r: 0.85 + hash01(`lobe-r${side}${i}`) * 0.3,
        tint: hash01(`lobe-c${side}${i}`),
      });
    }
  }
  return lobes;
}

interface PulsePath {
  side: -1 | 1;
  from: Vec3;
  to: Vec3;
  delay: number;
}

const PULSES: PulsePath[] = [
  { side: -1, from: normalize([-0.3, 0.3, 0.9]), to: normalize([-0.4, 0.5, -0.8]), delay: 0 },
  { side: 1, from: normalize([0.35, 0.85, 0.45]), to: normalize([0.6, -0.1, -0.8]), delay: 0.18 },
  { side: -1, from: normalize([-0.85, -0.2, 0.5]), to: normalize([-0.5, 0.85, -0.2]), delay: 0.5 },
  { side: 1, from: normalize([0.9, 0.1, 0.4]), to: normalize([0.3, 0.9, -0.3]), delay: 0.72 },
];

/** Slerp between unit vectors. */
function slerp(a: Vec3, b: Vec3, u: number): Vec3 {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const th = Math.acos(dot);
  if (th < 1e-4) return a;
  const s = Math.sin(th);
  const wa = Math.sin((1 - u) * th) / s;
  const wb = Math.sin(u * th) / s;
  return normalize([a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb]);
}

/** Pulse head position + visibility at scene time `t` (null when idle). */
function pulseAt(
  p: PulsePath,
  t: number,
  startAt: number,
  lag = 0,
): { pos: Vec3; alpha: number } | null {
  const since = t - startAt - p.delay - lag;
  if (since < 0) return null;
  const local = since % PULSE_PERIOD;
  if (local > PULSE_TRAVEL) return null;
  const u = local / PULSE_TRAVEL;
  const eased = u * u * (3 - 2 * u);
  const dir = slerp(p.from, p.to, eased);
  return { pos: hemiPoint(p.side, dir, 1.04), alpha: Math.sin(Math.PI * u) ** 0.6 };
}

const Brain: React.FC<HeroPropProps> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const lobes = useMemo(buildLobes, []);
  const sparkAt = at + BRAIN_SPARK_SEC;
  // Whole-brain flash peaking exactly on the impact.
  const flash = t < sparkAt ? ramp(t, sparkAt - 0.12, 0.12) ** 2 : Math.exp(-(t - sparkAt) * 4.5);
  const live = ramp(t, sparkAt, 0.3);
  const heads = PULSES.map((p) => pulseAt(p, t, sparkAt));
  const base = mixHex(S.clay[0], S.negative, 0.3);
  const lobeA = mixHex(base, S.paper, 0.12);
  const lobeB = mixHex(base, S.accent, 0.12);
  const glow = S.accent;

  return (
    <group position={[0, 0.08, 0]} rotation={[0.12, 0, 0]}>
      {/* Hemisphere cores */}
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[side * HEMI_X, 0, 0]} scale={HEMI_R}>
          <sphereGeometry args={[0.97, 32, 24]} />
          <Clay
            color={mixHex(base, S.clay[2], 0.25)}
            emissive={glow}
            emissiveIntensity={flash * 0.25}
          />
        </mesh>
      ))}
      {/* Lobes */}
      {lobes.map((l, i) => {
        let hot = 0;
        for (const h of heads) {
          if (!h) continue;
          const dx = l.pos[0] - h.pos[0];
          const dy = l.pos[1] - h.pos[1];
          const dz = l.pos[2] - h.pos[2];
          hot += Math.exp(-(dx * dx + dy * dy + dz * dz) / 0.06) * h.alpha;
        }
        return (
          <mesh
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed procedural lobes
            key={i}
            position={l.pos}
            rotation={l.rot}
            scale={[l.r * 0.75, l.r, l.r]}
          >
            <capsuleGeometry args={[0.12, 0.3, 6, 14]} />
            <Clay
              color={mixHex(lobeA, lobeB, l.tint)}
              roughness={0.58}
              emissive={glow}
              emissiveIntensity={flash * 0.45 + Math.min(1.2, hot) * 1.1 * live}
            />
          </mesh>
        );
      })}
      {/* Cerebellum + stem */}
      <mesh position={[0, -0.52, -0.55]} scale={[0.62, 0.3, 0.36]}>
        <sphereGeometry args={[1, 28, 18]} />
        <Clay color={mixHex(base, S.clay[2], 0.35)} />
      </mesh>
      <mesh position={[0, -0.78, -0.25]} rotation={[0.35, 0, 0]}>
        <cylinderGeometry args={[0.14, 0.1, 0.46, 18]} />
        <Clay color={mixHex(base, S.clay[2], 0.45)} />
      </mesh>
      {/* Travelling pulses (head + fading trail) */}
      {PULSES.map((p, i) =>
        [0, 0.035, 0.07, 0.105].map((lag, j) => {
          const h = j === 0 ? heads[i] : pulseAt(p, t, sparkAt, lag);
          if (!h) return null;
          const size = (j === 0 ? 0.09 : 0.075 - j * 0.014) * h.alpha;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed pulse trail
            <group key={`${i}-${j}`} position={h.pos}>
              <mesh scale={size}>
                <sphereGeometry args={[1, 12, 8]} />
                <Clay color={S.paper} emissive={S.paper} emissiveIntensity={1.4} />
              </mesh>
              {j === 0 ? (
                <mesh scale={0.26 * h.alpha}>
                  <sphereGeometry args={[1, 16, 12]} />
                  <meshBasicMaterial
                    color={glow}
                    transparent
                    opacity={0.5 * h.alpha}
                    depthWrite={false}
                  />
                </mesh>
              ) : null}
            </group>
          );
        }),
      )}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Heart — puffy extruded heart; double-thump heartbeat from the impact.
// ---------------------------------------------------------------------------

/** Seconds after `at` of the first thump (hero-catalog impactSec). */
const HEART_BEAT_SEC = HERO_CATALOG.heart.impactSec;
const BEAT_PERIOD = 0.9;
const SECOND_THUMP = 0.24;

function heartShape(): Shape {
  const s = new Shape();
  s.moveTo(0, -1);
  s.bezierCurveTo(-0.3, -0.7, -1, -0.28, -1, 0.3);
  s.bezierCurveTo(-1, 0.7, -0.76, 0.96, -0.5, 0.96);
  s.bezierCurveTo(-0.22, 0.96, -0.04, 0.78, 0, 0.6);
  s.bezierCurveTo(0.04, 0.78, 0.22, 0.96, 0.5, 0.96);
  s.bezierCurveTo(0.76, 0.96, 1, 0.7, 1, 0.3);
  s.bezierCurveTo(1, -0.28, 0.3, -0.7, 0, -1);
  return s;
}

/** Sharp-attack / soft-decay bump peaking at dt = 0. */
function bump(dt: number): number {
  return dt < 0 ? Math.exp(-((dt / 0.045) ** 2)) : Math.exp(-((dt / 0.12) ** 2));
}

/** Lub-dub heartbeat envelope: first thump exactly at `beatAt`, repeating. */
function heartbeat(t: number, beatAt: number): number {
  if (t < beatAt - 0.2) return 0;
  const k = Math.max(0, Math.floor((t - beatAt + 0.2) / BEAT_PERIOD));
  let v = 0;
  for (const n of [k - 1, k, k + 1]) {
    if (n < 0) continue;
    const at = beatAt + n * BEAT_PERIOD;
    v += bump(t - at) + 0.55 * bump(t - at - SECOND_THUMP);
  }
  return v;
}

const Heart: React.FC<HeroPropProps> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const geometry = useMemo(() => {
    const g = new ExtrudeGeometry(heartShape(), {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.36,
      bevelSize: 0.26,
      bevelSegments: 14,
      curveSegments: 48,
    });
    g.center();
    return g;
  }, []);
  const beat = heartbeat(t, at + HEART_BEAT_SEC);
  const sx = 1 + beat * 0.13;
  const sy = 1 + beat * 0.09;
  const color = mixHex(S.accent, S.clay[0], 0.12);
  return (
    <group position={[0, 0.02, 0]} rotation={[0, 0, beat * -0.03]} scale={[sx, sy, sx]}>
      <mesh geometry={geometry}>
        <Clay color={color} roughness={0.48} emissive={S.accent} emissiveIntensity={beat * 0.3} />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Battery — translucent shell with 4 cells: charges up, or drains ('down').
// ---------------------------------------------------------------------------

/** Seconds after `at` when the battery is full / empty (hero-catalog impactSec). */
const BATTERY_UP_SEC = HERO_CATALOG.battery.impactSec;
const BATTERY_DOWN_SEC = HERO_CATALOG.battery.downImpactSec ?? BATTERY_UP_SEC;
const CELLS = 4;
const CELL_X = [-0.63, -0.21, 0.21, 0.63];

const BatteryCell: React.FC<{
  x: number;
  geometry: RoundedBoxGeometry;
  color: string;
  emissive: string;
  emissiveIntensity: number;
  scaleY: number;
  pop: number;
}> = ({ x, geometry, color, emissive, emissiveIntensity, scaleY, pop }) => (
  <mesh geometry={geometry} position={[x, 0, 0]} scale={[pop, scaleY * pop, pop]}>
    <Clay color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} roughness={0.5} />
  </mesh>
);

const Battery: React.FC<HeroPropProps> = ({ at, tone }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const shell = useMemo(() => new RoundedBoxGeometry(2.0, 1.14, 0.92, 5, 0.26), []);
  const cell = useMemo(() => new RoundedBoxGeometry(0.34, 0.78, 0.6, 3, 0.09), []);
  const tray = useMemo(() => new RoundedBoxGeometry(1.76, 0.9, 0.1, 3, 0.04), []);
  const down = tone === 'down';
  const impactAt = at + (down ? BATTERY_DOWN_SEC : BATTERY_UP_SEC);
  const jolt = wobble(t, impactAt, 18, 6);
  const flash = t >= impactAt ? Math.exp(-(t - impactAt) * 3.5) : 0;
  const empty = mixHex(S.clay[2], S.bgOuter, 0.45);
  const pops = [
    useSpringAt(impactAt - 0.675, 260, 12, 0.6),
    useSpringAt(impactAt - 0.45, 260, 12, 0.6),
    useSpringAt(impactAt - 0.225, 260, 12, 0.6),
    useSpringAt(impactAt, 260, 12, 0.6),
  ];

  const cells = Array.from({ length: CELLS }, (_, i) => {
    if (!down) {
      // Cell i fills at impact − (3 − i)·0.225 s; the 4th lands on the impact.
      const fillAt = impactAt - (CELLS - 1 - i) * 0.225;
      const f = ramp(t, fillAt - 0.1, 0.1);
      const pop = pops[i] ?? 1;
      const bounce = t >= fillAt ? 1 + Math.sin(Math.min(1, pop) * Math.PI) * 0.08 : 1;
      return {
        color: mixHex(empty, S.positive, f),
        emissive: S.positive,
        intensity: f * 0.22 + flash * 0.5,
        scaleY: 0.92 + f * 0.08,
        pop: bounce,
      };
    }
    // Drain: right-most cells empty first; the last one turns negative + blinks.
    if (i > 0) {
      const outAt = impactAt - (CELLS - i) * 0.2 + 0.05;
      const f = 1 - ramp(t, outAt - 0.1, 0.1);
      return {
        color: mixHex(empty, S.positive, f),
        emissive: S.positive,
        intensity: f * 0.22,
        scaleY: 0.92 + f * 0.08,
        pop: 1,
      };
    }
    const turned = ramp(t, impactAt - 0.08, 0.08);
    const blink = t >= impactAt ? 0.5 + 0.5 * Math.cos((t - impactAt) * Math.PI * 2 * 1.3) : 1;
    const warn = mixHex(empty, S.negative, 0.35 + blink * 0.65);
    return {
      color: mixHex(S.positive, warn, turned),
      emissive: mixHex(S.positive, S.negative, turned),
      intensity: 0.22 + turned * blink * 0.5,
      scaleY: 1,
      pop: 1 + flash * 0.1,
    };
  });

  const glass = mixHex(S.paper, S.accent2, 0.12);
  return (
    <group position={[-0.06, -0.08, 0]} rotation={[0.05, 0, jolt * 0.04]}>
      <mesh geometry={tray} position={[0, 0, -0.34]}>
        <Clay color={mixHex(S.clay[2], S.bgOuter, 0.25)} />
      </mesh>
      {cells.map((c, i) => (
        <BatteryCell
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed cells
          key={i}
          x={CELL_X[i] ?? 0}
          geometry={cell}
          color={c.color}
          emissive={c.emissive}
          emissiveIntensity={c.intensity}
          scaleY={c.scaleY}
          pop={c.pop}
        />
      ))}
      <mesh geometry={shell}>
        <meshStandardMaterial
          color={glass}
          roughness={0.16}
          metalness={0}
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </mesh>
      {/* Terminal cap */}
      <mesh position={[1.06, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.24, 0.24, 0.16, 28]} />
        <Clay color={S.clay[0]} />
      </mesh>
      <mesh position={[1.15, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.2, 0.24, 0.05, 28]} />
        <Clay color={mixHex(S.clay[0], S.paper, 0.2)} />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Flame — layered clay teardrops that ignite on the impact and flicker.
// ---------------------------------------------------------------------------

/** Seconds after `at` when the flame ignites (hero-catalog impactSec). */
const FLAME_IGNITE_SEC = HERO_CATALOG.flame.impactSec;
const EMBERS = 5;

/** Teardrop lathe: round bottom at y = −1, sharp tip at y = +1. */
function teardrop(): LatheGeometry {
  const pts: [number, number][] = [];
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * Math.PI;
    pts.push([Math.sin(th) * Math.sin(th / 2) ** 1.4 * 0.95, Math.cos(th)]);
  }
  return lathe(pts, 36);
}

interface FlameLayer {
  key: string;
  color: string;
  emissive: string;
  emissiveIntensity: number;
  size: Vec3;
  z: number;
  lift: number;
  grow: number;
  sway: number;
}

const Flame: React.FC<HeroPropProps> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const drop = useMemo(teardrop, []);
  const igniteAt = at + FLAME_IGNITE_SEC;
  const gOuter = useSpringAt(igniteAt, 170, 10, 0.7);
  const gInner = useSpringAt(igniteAt - 0.04, 180, 11, 0.7);
  const gCore = useSpringAt(igniteAt - 0.08, 190, 12, 0.7);
  const alive = ramp(t, igniteAt, 0.4);
  const layers: FlameLayer[] = [
    {
      key: 'outer',
      color: mixHex(S.accent2, S.clay[1], 0.1),
      emissive: S.accent2,
      emissiveIntensity: 0.3,
      size: [0.8, 1.12, 0.6],
      z: 0,
      lift: 0,
      grow: gOuter,
      sway: 1,
    },
    {
      key: 'inner',
      color: S.accent,
      emissive: S.accent,
      emissiveIntensity: 0.4,
      size: [0.55, 0.8, 0.44],
      z: 0.2,
      lift: 0.04,
      grow: 0.25 + 0.75 * gInner,
      sway: 0.7,
    },
    {
      key: 'core',
      color: S.paper,
      emissive: S.paper,
      emissiveIntensity: 0.55,
      size: [0.3, 0.46, 0.26],
      z: 0.36,
      lift: 0.08,
      grow: 0.45 + 0.55 * gCore,
      sway: 0.45,
    },
  ];
  const baseY = -1.02;
  return (
    <group position={[0, 0, 0]}>
      {layers.map((l, i) => {
        const ph = (n: number): number => hash01(`flame-${l.key}-${n}`) * Math.PI * 2;
        const fx =
          1 + (0.035 * Math.sin(t * 7.3 + ph(1)) + 0.02 * Math.sin(t * 12.9 + ph(2))) * alive;
        const fy =
          1 + (0.06 * Math.sin(t * 8.7 + ph(3)) + 0.03 * Math.sin(t * 15.1 + ph(4))) * alive;
        const lean =
          (0.06 * Math.sin(t * 4.9 + ph(5)) + 0.03 * Math.sin(t * 10.3 + ph(6))) * alive * l.sway;
        const g = Math.max(0, l.grow);
        if (g < 0.001) return null;
        return (
          <group key={l.key} position={[0, baseY + l.lift, l.z]} rotation={[0, 0, lean]}>
            <mesh
              geometry={drop}
              position={[0, l.size[1] * g * fy, 0]}
              scale={[l.size[0] * g * fx, l.size[1] * g * fy, l.size[2] * g * fx]}
            >
              <Clay
                color={l.color}
                roughness={0.45}
                emissive={l.emissive}
                emissiveIntensity={l.emissiveIntensity * (0.6 + 0.4 * alive) + (i === 2 ? 0.3 : 0)}
              />
            </mesh>
          </group>
        );
      })}
      {/* Embers drifting up once lit */}
      {t > igniteAt + 0.15 &&
        Array.from({ length: EMBERS }, (_, i) => {
          const since = t - igniteAt - 0.15;
          const u = (since / 1.4 + i / EMBERS) % 1;
          if (since < u * 1.4) return null;
          const x = (hash01(`ember-x${i}`) - 0.5) * 0.9 + Math.sin(t * 3 + i) * 0.08 * u;
          const y = 0.2 + u * 1.2;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed ember pool
            <mesh key={i} position={[x, y, 0.2]} scale={0.045 * (1 - u) * alive}>
              <sphereGeometry args={[1, 10, 8]} />
              <Clay color={S.accent2} emissive={S.accent2} emissiveIntensity={1.4} />
            </mesh>
          );
        })}
    </group>
  );
};

export const MIND_PROPS = {
  brain: { Model: Brain, yaw: 0.75, framing: { scale: 1.12, y: 0.06 } },
  heart: { Model: Heart, yaw: -0.2, framing: { scale: 0.8, y: 0.08 } },
  battery: { Model: Battery, yaw: -0.35, framing: { scale: 1.04, y: 0.06 } },
  flame: { Model: Flame, yaw: 0, framing: { scale: 1.02, y: 0.1 } },
} satisfies Record<'brain' | 'heart' | 'battery' | 'flame', HeroPropDef>;
