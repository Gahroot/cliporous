/**
 * Signal hero props: megaphone (sound rings pulse from the mouth), magnet
 * (clay cubes snap onto the poles) and gift (lid pops off, light spills out).
 * Built only from primitives / lathes / rounded boxes via hero-kit.tsx and
 * animated purely from the frame. Impact = `at + HERO_CATALOG[prop].impactSec`.
 */

import type React from 'react';
import { useMemo } from 'react';
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

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// ---------------------------------------------------------------------------
// Megaphone — lathe horn, mouthpiece, handle; sound rings pulse from the mouth.
// ---------------------------------------------------------------------------

const RING_PERIOD = 0.6;
const RING_LIFE = 1.1;

const Megaphone: React.FC<HeroPropProps> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const impact = at + HERO_CATALOG.megaphone.impactSec;
  // Horn along local +Y (narrow at the back, flared mouth at the top).
  const horn = useMemo(
    () =>
      lathe(
        [
          [0, -0.5],
          [0.2, -0.5],
          [0.22, -0.3],
          [0.28, -0.05],
          [0.38, 0.2],
          [0.52, 0.45],
          [0.66, 0.62],
          [0.6, 0.62],
          [0.47, 0.44],
          [0, 0.44],
        ],
        40,
      ),
    [],
  );
  const handle = useMemo(() => new RoundedBoxGeometry(0.2, 0.5, 0.2, 3, 0.08), []);
  // Each pulse the horn kicks back slightly.
  const since = t - impact;
  const phase = since >= 0 ? (since % RING_PERIOD) / RING_PERIOD : 1;
  const kick = since >= 0 ? Math.exp(-phase * 7) * Math.sin(phase * Math.PI * 2) * 0.05 : 0;
  const latest = since >= 0 ? Math.floor(since / RING_PERIOD) : -1;
  const rings: { id: number; age: number }[] = [];
  for (let m = latest; m >= 0 && m > latest - 3; m--) {
    const age = since - m * RING_PERIOD;
    if (age < RING_LIFE) rings.push({ id: m, age });
  }
  return (
    <group rotation={[0, 0, -Math.PI / 2 + 0.28]} position={[-0.25, -0.05, 0]}>
      <group position={[0, -kick, 0]} scale={[1 + kick, 1 - kick * 0.6, 1 + kick]}>
        <mesh geometry={horn}>
          <Clay color={S.paper} />
        </mesh>
        {/* Mouth rim */}
        <mesh position={[0, 0.62, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.63, 0.05, 10, 40]} />
          <Clay color={S.accent} roughness={0.5} />
        </mesh>
        {/* Inner throat (dark) */}
        <mesh position={[0, 0.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.47, 32]} />
          <Clay color={mixHex(S.clay[2], '#000000', 0.25)} />
        </mesh>
        {/* Accent band */}
        <mesh position={[0, -0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.245, 0.035, 8, 28]} />
          <Clay color={S.accent} />
        </mesh>
        {/* Mouthpiece */}
        <mesh position={[0, -0.62, 0]}>
          <cylinderGeometry args={[0.13, 0.19, 0.24, 24]} />
          <Clay color={S.clay[2]} />
        </mesh>
        <mesh position={[0, -0.76, 0]} scale={[1, 0.5, 1]}>
          <sphereGeometry args={[0.14, 20, 12]} />
          <Clay color={S.clay[2]} />
        </mesh>
        {/* Handle (hangs below the horn) */}
        <mesh position={[0.36, -0.28, 0]} rotation={[0, 0, 0.25]}>
          <cylinderGeometry args={[0.05, 0.05, 0.3, 12]} />
          <Clay color={S.clay[1]} />
        </mesh>
        <mesh geometry={handle} position={[0.54, -0.36, 0]} rotation={[0, 0, Math.PI / 2 - 0.25]}>
          <Clay color={S.clay[0]} />
        </mesh>
      </group>
      {/* Sound rings travelling out of the mouth */}
      {rings.map(({ id, age }) => {
        const u = age / RING_LIFE;
        const grow = 1 - (1 - u) ** 2;
        return (
          <mesh
            key={id}
            position={[0, 0.72 + grow * 1.15, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={0.62 + grow * 0.5}
          >
            <torusGeometry args={[1, 0.045, 10, 48]} />
            <Clay
              color={mixHex(S.accent, S.paper, 0.2)}
              emissive={S.accent}
              emissiveIntensity={0.35}
              opacity={clamp01(Math.min(age / 0.08, 1) * (1 - u) ** 1.3 * 0.9)}
            />
          </mesh>
        );
      })}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Magnet — horseshoe (half torus + legs, paper tips); cubes snap onto the poles.
// ---------------------------------------------------------------------------

const MAG_R = 0.5;

/** Bare original magnet; composed scenes own their meaningful workpieces. */
export const MagnetRig: React.FC<{ snap?: number; flash?: number }> = ({ snap = 0, flash = 0 }) => {
  const S = useStage();
  return (
    <group rotation={[0, 0, Math.PI / 2]} position={[snap * -0.03, 0, 0]}>
      <mesh position={[0, 0.3, 0]}>
        <torusGeometry args={[MAG_R, 0.2, 18, 40, Math.PI]} />
        <Clay color={S.accent} roughness={0.5} />
      </mesh>
      {[-MAG_R, MAG_R].map((x) => (
        <group key={x}>
          <mesh position={[x, -0.05, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.7, 24]} />
            <Clay color={S.accent} roughness={0.5} />
          </mesh>
          <mesh position={[x, -0.56, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.32, 24]} />
            <Clay
              color={S.paper}
              emissive={S.accent2}
              emissiveIntensity={flash * 0.6}
              roughness={0.45}
            />
          </mesh>
          <mesh position={[x, -0.4, 0]}>
            <cylinderGeometry args={[0.205, 0.205, 0.03, 24]} />
            <Clay color={mixHex(S.accent, '#000000', 0.2)} />
          </mesh>
        </group>
      ))}
    </group>
  );
};
const CUBE = 0.3;
const PULL_SEC = 0.42;

const Magnet: React.FC<HeroPropProps> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const impact = at + HERO_CATALOG.magnet.impactSec;
  const cubeGeo = useMemo(() => new RoundedBoxGeometry(CUBE, CUBE, CUBE, 3, 0.06), []);
  // Magnet-local: arch on top, legs point down; the group turns it so the
  // poles face +X. Tips end at local y = -0.72.
  const snap = wobble(t, impact, 20, 7);
  const flash = t >= impact ? Math.exp(-(t - impact) * 4) : 0;
  const pull = clamp01((t - (impact - PULL_SEC)) / PULL_SEC) ** 2.6;
  const cubes = [
    { pole: -1, slot: 0 },
    { pole: 1, slot: 0 },
    { pole: -1, slot: 1 },
    { pole: 1, slot: 1 },
  ];
  return (
    <group position={[-0.2, 0, 0]}>
      <MagnetRig snap={snap} flash={flash} />
      {/* Clay cubes pulled in from the right, snapping on at impact. */}
      {cubes.map(({ pole, slot }, i) => {
        const tx = 0.72 + CUBE / 2 + 0.01 + slot * (CUBE + 0.01);
        const ty = pole * MAG_R;
        const sx = tx + 0.75 + hash01(`mag-x${i}`) * 0.35;
        const sy = ty + pole * (0.15 + hash01(`mag-y${i}`) * 0.25);
        const x = sx + (tx - sx) * pull;
        const y = sy + (ty - sy) * pull;
        const spin = (1 - pull) * (hash01(`mag-r${i}`) - 0.5) * 1.6;
        const s = 1 + snap * 0.12;
        return (
          <mesh
            key={`${pole}-${slot}`}
            geometry={cubeGeo}
            position={[x, y, 0]}
            rotation={[spin * 0.5, spin, spin]}
            scale={[1 - snap * 0.1, s, s]}
          >
            <Clay color={S.clay[i % 3]} />
          </mesh>
        );
      })}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Gift — box with ribbon cross + bow; lid pops up and tilts off, light inside.
// ---------------------------------------------------------------------------

const BOX_W = 1.3;
const BOX_H = 0.95;
const LID_H = 0.26;

const Gift: React.FC<HeroPropProps> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const impact = at + HERO_CATALOG.gift.impactSec;
  const box = useMemo(() => new RoundedBoxGeometry(BOX_W, BOX_H, BOX_W, 4, 0.08), []);
  const lid = useMemo(() => new RoundedBoxGeometry(BOX_W + 0.12, LID_H, BOX_W + 0.12, 4, 0.08), []);
  const pop = useSpringAt(impact, 170, 13, 0.8);
  // Anticipation: the box jiggles just before it opens.
  const pre = ramp(t, impact - 0.28, 0.28) * (t < impact ? 1 : 0);
  const jiggle = Math.sin(t * 46) * 0.025 * pre;
  const squash = wobble(t, impact, 16, 7) * 0.05;
  const glow = ramp(t, impact, 0.25);
  const top = -0.3 + BOX_H / 2;
  const ribbon = S.accent;
  const lidColor = mixHex(S.clay[0], S.paper, 0.12);
  const light = mixHex(S.accent2, S.paper, 0.35);
  return (
    <group position={[0, -0.05, 0]} rotation={[0, 0, jiggle]}>
      <group scale={[1 + squash, 1 - squash, 1 + squash]} position={[0, -0.3, 0]}>
        <mesh geometry={box}>
          <Clay color={S.clay[0]} />
        </mesh>
        {/* Ribbon cross on the box */}
        <mesh>
          <boxGeometry args={[0.24, BOX_H + 0.01, BOX_W + 0.03]} />
          <Clay color={ribbon} roughness={0.5} />
        </mesh>
        <mesh>
          <boxGeometry args={[BOX_W + 0.03, BOX_H + 0.01, 0.24]} />
          <Clay color={ribbon} roughness={0.5} />
        </mesh>
        {/* Glowing opening */}
        <mesh position={[0, BOX_H / 2 + 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[BOX_W - 0.14, BOX_W - 0.14]} />
          <Clay
            color={mixHex(S.clay[2], light, glow)}
            emissive={S.accent2}
            emissiveIntensity={glow * 1.4}
          />
        </mesh>
      </group>
      {/* Light beam spilling out */}
      {glow > 0 && (
        <mesh position={[0, top + 0.5, 0]}>
          <cylinderGeometry args={[0.85, 0.58, 1.0, 32, 1, true]} />
          <meshStandardMaterial
            color={light}
            emissive={S.accent2}
            emissiveIntensity={0.9}
            transparent
            opacity={glow * 0.12}
            depthWrite={false}
          />
        </mesh>
      )}
      <pointLight position={[0, top + 0.35, 0.2]} color={light} intensity={glow * 3} distance={3} />
      {/* Lid + bow: pops up, drifts right and tilts off. */}
      <group
        position={[
          pop * 0.55,
          top + LID_H / 2 - 0.04 + pop * 0.62 + Math.abs(jiggle) * 2,
          pop * 0.1,
        ]}
        rotation={[pop * 0.18, 0, -pop * 0.55]}
      >
        <mesh geometry={lid}>
          <Clay color={lidColor} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.25, LID_H + 0.01, BOX_W + 0.15]} />
          <Clay color={ribbon} roughness={0.5} />
        </mesh>
        <mesh>
          <boxGeometry args={[BOX_W + 0.15, LID_H + 0.01, 0.25]} />
          <Clay color={ribbon} roughness={0.5} />
        </mesh>
        {/* Bow: two loops + knot */}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * 0.24, LID_H / 2 + 0.2, 0]}
            rotation={[0, 0, side * 0.75]}
            scale={[1.15, 1, 0.8]}
          >
            <torusGeometry args={[0.2, 0.065, 12, 28]} />
            <Clay color={ribbon} roughness={0.5} />
          </mesh>
        ))}
        <mesh position={[0, LID_H / 2 + 0.08, 0]}>
          <sphereGeometry args={[0.11, 18, 12]} />
          <Clay color={mixHex(ribbon, '#000000', 0.1)} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------

export const SIGNAL_PROPS = {
  megaphone: { Model: Megaphone, yaw: -0.35, framing: { scale: 0.92, y: 0.05 } },
  magnet: { Model: Magnet, yaw: 0.3, framing: { scale: 1.0, y: 0.05 } },
  gift: { Model: Gift, yaw: 0.55, framing: { scale: 1.0, y: 0.1 } },
} satisfies Record<'megaphone' | 'magnet' | 'gift', HeroPropDef>;
