/**
 * Hero props: target, piggybank, trophy, briefcase (real clay models) plus
 * megaphone, magnet, gift (placeholders wired from another file by the lead).
 */

import type React from 'react';
import { useMemo } from 'react';
import { interpolate } from 'remotion';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { heroImpactSec } from '../hero-catalog';
import {
  Clay,
  type HeroPropDef,
  type HeroPropProps,
  lathe,
  roundedRectGeometry,
  useSpringAt,
  wobble,
} from '../hero-kit';
import { useBreath } from '../motion';
import { mixHex } from '../palette';
import { ramp, useSceneTime, useStage } from '../stage';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

// ---------------------------------------------------------------------------
// Target — upright bullseye on a stand; a dart flies in and thunks the centre.
// ---------------------------------------------------------------------------

const RING_RADII = [1, 0.8, 0.6, 0.4, 0.2];
const DISC_Y = 0.2;
const DISC_FRONT = 0.09;

const Dart: React.FC<{ tip: string; body: string; flight: string }> = ({ tip, body, flight }) => (
  // Tip at the local origin, pointing -Z; the body trails towards +Z.
  <group>
    <mesh position={[0, 0, 0.09]} rotation={[-Math.PI / 2, 0, 0]}>
      <coneGeometry args={[0.035, 0.18, 12]} />
      <Clay color={tip} roughness={0.35} metalness={0.2} />
    </mesh>
    <mesh position={[0, 0, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.06, 0.045, 0.26, 16]} />
      <Clay color={body} />
    </mesh>
    <mesh position={[0, 0, 0.56]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.022, 0.022, 0.3, 10]} />
      <Clay color={body} />
    </mesh>
    <mesh position={[0, 0, 0.64]}>
      <boxGeometry args={[0.02, 0.3, 0.24]} />
      <Clay color={flight} />
    </mesh>
    <mesh position={[0, 0, 0.64]}>
      <boxGeometry args={[0.3, 0.02, 0.24]} />
      <Clay color={flight} />
    </mesh>
  </group>
);

const Target: React.FC<HeroPropProps> = ({ at, tone }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const hitAt = at + heroImpactSec('target', tone);
  const base = useMemo(
    () =>
      lathe(
        [
          [0, -1.02],
          [0.5, -1.02],
          [0.54, -0.98],
          [0.54, -0.92],
          [0.48, -0.88],
          [0, -0.88],
        ],
        40,
      ),
    [],
  );
  // Flight: from upper-left front towards the bullseye, arriving on the hit.
  const flyStart = at + 0.15;
  const p = clamp01((t - flyStart) / (hitAt - flyStart));
  const e = p * p;
  const from: [number, number, number] = [-1.6, 1.3, 2.6];
  const dx = from[0] * (1 - e);
  const dy = from[1] * (1 - e) + Math.sin(Math.PI * p) * 0.25;
  const dz = from[2] * (1 - e);
  const hit = t >= hitAt;
  const wob = wobble(t, hitAt, 20, 5);
  const shake = wobble(t, hitAt, 34, 9);
  const centre = RING_RADII.length - 1;
  return (
    <group>
      <mesh geometry={base}>
        <Clay color={S.clay[2]} />
      </mesh>
      <mesh position={[0, -0.45 + DISC_Y / 2, -0.12]}>
        <cylinderGeometry args={[0.07, 0.09, 0.9 + DISC_Y, 16]} />
        <Clay color={S.clay[2]} />
      </mesh>
      {/* Disc pivots at its foot so the thunk rocks it back. */}
      <group position={[0, DISC_Y - 0.95, 0]} rotation={[-wob * 0.14, 0, shake * 0.03]}>
        <group position={[0, 0.95, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[1.04, 1.04, 0.16, 56]} />
            <Clay color={S.clay[1]} />
          </mesh>
          {RING_RADII.map((r, i) => (
            <mesh
              key={r}
              position={[0, 0, DISC_FRONT - 0.005 + i * 0.006]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[r, r, 0.02, 56]} />
              <Clay
                color={i === centre ? S.accent : i % 2 === 0 ? S.clay[0] : S.paper}
                emissive={i === centre ? S.accent : undefined}
                emissiveIntensity={
                  i === centre ? 0.15 + (hit ? 0.6 * Math.exp(-(t - hitAt) * 4) : 0) : 0
                }
              />
            </mesh>
          ))}
          {t >= flyStart && (
            <group
              position={[dx, dy, DISC_FRONT - 0.03 + dz]}
              scale={1.45}
              rotation={
                hit
                  ? [0.12 + shake * 0.12, -0.28, 0]
                  : [0.12 + (1 - e) * 0.25, -0.28 - (1 - e) * 0.3, 0]
              }
            >
              <Dart tip={mixHex(S.paper, S.clay[2], 0.4)} body={S.clay[2]} flight={S.accent2} />
            </group>
          )}
        </group>
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Piggybank — squashy clay pig; a coin drops into the slot and it bounces.
// ---------------------------------------------------------------------------

const PIG_LEGS: [number, number][] = [
  [0.5, 0.38],
  [0.5, -0.38],
  [-0.5, 0.38],
  [-0.5, -0.38],
];

const Piggybank: React.FC<HeroPropProps> = ({ at, tone }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const dropAt = at + heroImpactSec('piggybank', tone);
  const slot = useMemo(() => roundedRectGeometry(0.14, 0.56, 0.07), []);
  const pig = mixHex(S.clay[0], S.accent, 0.18);
  const pigDark = mixHex(pig, '#000000', 0.3);
  const eye = mixHex(S.clay[2], '#000000', 0.5);
  const sq = wobble(t, dropAt, 16, 5) * 0.09;
  const bodyTop = 0.82;
  // Coin: drops from above, reaches the slot on the impact, then sinks in.
  const fall = clamp01((t - (at + 0.1)) / (dropAt - (at + 0.1)));
  const sink = clamp01((t - dropAt) / 0.18);
  const coinY = bodyTop + 0.2 + (1 - fall * fall) * 1.4 - sink * 0.6;
  const coinOn = t >= at + 0.1 && sink < 1;
  return (
    <group position={[0, -0.05, 0]}>
      <group position={[0, -0.95, 0]} scale={[1 + sq * 0.5, 1 - sq, 1 + sq * 0.5]}>
        <group position={[0, 0.95, 0]}>
          <mesh scale={[1.2, 0.92, 0.92]}>
            <sphereGeometry args={[0.9, 48, 32]} />
            <Clay color={pig} />
          </mesh>
          {/* Snout */}
          <mesh position={[1.06, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.28, 0.3, 0.26, 32]} />
            <Clay color={pig} />
          </mesh>
          <mesh position={[1.19, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.27, 0.27, 0.02, 32]} />
            <Clay color={mixHex(pig, S.paper, 0.15)} />
          </mesh>
          {[-0.09, 0.09].map((z) => (
            <mesh
              key={z}
              position={[1.2, 0.02, z]}
              rotation={[0, 0, Math.PI / 2]}
              scale={[1, 1, 1.5]}
            >
              <cylinderGeometry args={[0.045, 0.045, 0.02, 16]} />
              <Clay color={pigDark} />
            </mesh>
          ))}
          {/* Eyes */}
          {[-0.3, 0.3].map((z) => (
            <mesh key={z} position={[0.86, 0.3, z]}>
              <sphereGeometry args={[0.065, 16, 12]} />
              <Clay color={eye} roughness={0.3} />
            </mesh>
          ))}
          {/* Ears */}
          {[-0.36, 0.36].map((z) => (
            <mesh
              key={z}
              position={[0.52, 0.74, z]}
              rotation={[z > 0 ? 0.5 : -0.5, 0, -0.7]}
              scale={[1, 1, 0.45]}
            >
              <coneGeometry args={[0.2, 0.26, 20]} />
              <Clay color={pig} />
            </mesh>
          ))}
          {/* Legs */}
          {PIG_LEGS.map(([x, z]) => (
            <mesh key={`${x}:${z}`} position={[x, -0.78, z]}>
              <cylinderGeometry args={[0.17, 0.15, 0.36, 20]} />
              <Clay color={pig} />
            </mesh>
          ))}
          {/* Curly tail */}
          <mesh position={[-1.12, 0.12, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.1, 0.035, 10, 24, Math.PI * 1.6]} />
            <Clay color={pig} />
          </mesh>
          {/* Coin slot on the back (runs across the body). */}
          <mesh
            geometry={slot}
            position={[-0.05, bodyTop + 0.002, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <Clay color={pigDark} />
          </mesh>
        </group>
      </group>
      {coinOn && (
        <group position={[-0.05, coinY, 0]} rotation={[0, 0, Math.PI / 2]}>
          <mesh>
            <cylinderGeometry args={[0.24, 0.24, 0.07, 36]} />
            <Clay color={S.accent2} roughness={0.4} metalness={0.15} />
          </mesh>
          <mesh position={[0, 0.036, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.15, 0.018, 8, 28]} />
            <Clay color={mixHex(S.accent2, S.paper, 0.35)} roughness={0.4} />
          </mesh>
        </group>
      )}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Trophy — lathe cup, torus handles, stepped base; shine sweep + lift on impact.
// ---------------------------------------------------------------------------

const CUP_PROFILE: [number, number][] = [
  [0.12, -0.12],
  [0.18, -0.02],
  [0.42, 0.08],
  [0.62, 0.26],
  [0.74, 0.55],
  [0.8, 0.9],
  [0.82, 1.0],
  [0.78, 1.03],
  [0.73, 0.94],
  [0.67, 0.6],
  [0.4, 0.42],
  [0, 0.38],
];

const Trophy: React.FC<HeroPropProps> = ({ at, tone }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const breath = useBreath('hero-trophy');
  const hitAt = at + heroImpactSec('trophy', tone);
  const cup = useMemo(() => lathe(CUP_PROFILE, 48), []);
  const stem = useMemo(
    () =>
      lathe(
        [
          [0, -0.62],
          [0.22, -0.6],
          [0.13, -0.48],
          [0.1, -0.3],
          [0.2, -0.22],
          [0.2, -0.16],
          [0.12, -0.12],
          [0, -0.1],
        ],
        40,
      ),
    [],
  );
  const base = useMemo(() => new RoundedBoxGeometry(1.2, 0.26, 1.0, 3, 0.06), []);
  const plinth = useMemo(() => new RoundedBoxGeometry(0.86, 0.2, 0.72, 3, 0.05), []);
  const plate = useMemo(() => roundedRectGeometry(0.62, 0.12, 0.04), []);
  const lift = useSpringAt(hitAt, 140, 11);
  const settle = ramp(t, hitAt + 0.35, 0.6);
  const up = t >= hitAt ? lift * (1 - settle * 0.6) * 0.14 : 0;
  // Shine band sweeps up the cup around the impact.
  const sweep = clamp01((t - (hitAt - 0.12)) / 0.5);
  const sweepY = interpolate(sweep, [0, 1], [0.02, 1.0]);
  const sweepR = interpolate(
    sweepY,
    [0.02, 0.08, 0.26, 0.55, 0.9, 1.0],
    [0.2, 0.43, 0.63, 0.75, 0.81, 0.83],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const sweepOn = t >= hitAt - 0.12 && sweep < 1;
  const flash = t >= hitAt ? Math.exp(-(t - hitAt) * 3.5) : 0;
  const gold = mixHex(S.accent2, S.clay[0], 0.25);
  return (
    <group position={[0, -0.1, 0]}>
      <mesh geometry={base} position={[0, -0.98, 0]}>
        <Clay color={S.clay[2]} />
      </mesh>
      <mesh geometry={plinth} position={[0, -0.76, 0]}>
        <Clay color={mixHex(S.clay[2], S.clay[1], 0.4)} />
      </mesh>
      <mesh geometry={plate} position={[0, -0.98, 0.502]}>
        <Clay color={gold} roughness={0.4} metalness={0.15} />
      </mesh>
      <group position={[0, up, 0]}>
        <mesh geometry={stem}>
          <Clay color={gold} roughness={0.38} metalness={0.15} />
        </mesh>
        <mesh geometry={cup}>
          <Clay
            color={gold}
            roughness={0.38}
            metalness={0.15}
            emissive={S.accent2}
            emissiveIntensity={0.05 + breath * 0.05 + flash * 0.45}
          />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * 0.74, 0.62, 0]}
            rotation={[0, 0, -side * (Math.PI / 2)]}
          >
            <torusGeometry args={[0.24, 0.06, 12, 28, Math.PI]} />
            <Clay color={gold} roughness={0.38} metalness={0.15} />
          </mesh>
        ))}
        {sweepOn && (
          <mesh position={[0, sweepY, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[sweepR + 0.005, 0.035, 8, 48]} />
            <Clay
              color={S.paper}
              emissive={S.paper}
              emissiveIntensity={0.9}
              opacity={Math.sin(sweep * Math.PI) * 0.85}
            />
          </mesh>
        )}
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Briefcase — rounded case, handle, two latches; latches pop and the lid
// cracks open with an accent glow inside on impact.
// ---------------------------------------------------------------------------

const CASE_W = 2.2;
const CASE_D = 0.7;
const SEAM_Y = 0.14;

const Briefcase: React.FC<HeroPropProps> = ({ at, tone }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const hitAt = at + heroImpactSec('briefcase', tone);
  const bottom = useMemo(() => new RoundedBoxGeometry(CASE_W, 1.06, CASE_D, 4, 0.12), []);
  const lid = useMemo(() => new RoundedBoxGeometry(CASE_W, 0.34, CASE_D, 4, 0.12), []);
  const latch = useMemo(() => new RoundedBoxGeometry(0.26, 0.22, 0.08, 2, 0.03), []);
  const glowPlane = useMemo(() => roundedRectGeometry(CASE_W - 0.2, CASE_D - 0.14, 0.06), []);
  const popped = t >= hitAt;
  const pop = useSpringAt(hitAt, 260, 10, 0.6);
  const open = useSpringAt(hitAt + 0.06, 120, 9);
  const lidRot = popped ? -0.2 * open : 0;
  const jolt = wobble(t, hitAt, 22, 7) * 0.05;
  const leather = S.clay[0];
  const trim = mixHex(S.clay[0], S.clay[2], 0.45);
  const metal = mixHex(S.paper, S.clay[1], 0.35);
  return (
    <group position={[0, -0.2 - jolt, 0]}>
      <mesh geometry={bottom} position={[0, SEAM_Y - 0.53, 0]}>
        <Clay color={leather} />
      </mesh>
      {/* Accent glow in the gap. */}
      <mesh position={[0, SEAM_Y + 0.02, 0.02]}>
        <boxGeometry args={[CASE_W - 0.34, 0.12, CASE_D - 0.22]} />
        <Clay
          color={S.accent}
          emissive={S.accent}
          emissiveIntensity={popped ? 0.6 + open * 1.8 : 0}
        />
      </mesh>
      <mesh geometry={glowPlane} position={[0, SEAM_Y - 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <Clay
          color={S.accent}
          emissive={S.accent}
          emissiveIntensity={popped ? 0.4 + open * 1.4 : 0}
        />
      </mesh>
      {/* Lid pivots on the back seam edge. */}
      <group position={[0, SEAM_Y, -CASE_D / 2]} rotation={[lidRot, 0, 0]}>
        <group position={[0, 0.17, CASE_D / 2]}>
          <mesh geometry={lid}>
            <Clay color={leather} />
          </mesh>
          {[-0.36, 0.36].map((x) => (
            <mesh key={x} position={[x, 0.2, 0]}>
              <cylinderGeometry args={[0.07, 0.08, 0.08, 16]} />
              <Clay color={trim} />
            </mesh>
          ))}
          <mesh position={[0, 0.22, 0]}>
            <torusGeometry args={[0.36, 0.07, 14, 36, Math.PI]} />
            <Clay color={trim} />
          </mesh>
        </group>
      </group>
      {/* Latches: hinged at their bottom, flip forward on the pop. */}
      {[-0.62, 0.62].map((x) => (
        <group
          key={x}
          position={[x, SEAM_Y - 0.1, CASE_D / 2 + 0.03]}
          rotation={[popped ? Math.min(1.1, pop * 1.1) : 0, 0, 0]}
        >
          <mesh geometry={latch} position={[0, 0.11, 0]}>
            <Clay color={metal} roughness={0.38} metalness={0.2} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, SEAM_Y - 0.06, CASE_D / 2 + 0.002]}>
        <boxGeometry args={[CASE_W - 0.24, 0.04, 0.01]} />
        <Clay color={trim} />
      </mesh>
    </group>
  );
};

export const BUSINESS_PROPS = {
  target: { Model: Target, yaw: 0.45, framing: { scale: 1.05, y: 0.04 } },
  piggybank: { Model: Piggybank, yaw: -0.6, framing: { scale: 1, y: 0.04 } },
  trophy: { Model: Trophy, yaw: 0.3, framing: { scale: 1.05, y: 0.06 } },
  briefcase: { Model: Briefcase, yaw: -0.4, framing: { scale: 0.95, y: 0.06 } },
} satisfies Record<'target' | 'piggybank' | 'trophy' | 'briefcase', HeroPropDef>;
