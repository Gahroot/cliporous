/**
 * Hero props: chip, globe, envelope, book — soft clay models built from
 * primitives (see hero-kit.tsx for the rules every prop follows).
 *
 * Signature motions peak exactly at `at + heroImpactSec(prop)`:
 *  - chip: core flashes, circuit traces light up in a sweep around the die;
 *  - globe: an accent map pin drops onto the spinning planet and squashes;
 *  - envelope: flap swings open, the letter slides up (fastest at impact);
 *  - book: front cover lands open, pages fan over with a stagger.
 */

import type React from 'react';
import { useMemo } from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { DoubleSide, ExtrudeGeometry, PlaneGeometry, Shape } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { heroImpactSec } from '../hero-catalog';
import {
  Clay,
  type HeroPropDef,
  type HeroPropProps,
  lathe,
  roundedRectGeometry,
  roundedRectShape,
  useSpringAt,
  wobble,
} from '../hero-kit';
import { hash01, useBreath } from '../motion';
import { mixHex } from '../palette';
import { ramp, useSceneTime, useStage } from '../stage';

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Decaying pulse that is exactly 1 at `atSec` (0 before). */
function impactPulse(t: number, atSec: number, decay = 5): number {
  return t < atSec ? 0 : Math.exp(-(t - atSec) * decay);
}

function extrude(shape: Shape, depth: number, bevel: number): ExtrudeGeometry {
  return new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 10,
  });
}

// ---------------------------------------------------------------------------
// Chip — dark die on a substrate, pins on four sides, "AI" core, traces.
// ---------------------------------------------------------------------------

const SUB = 2.2;
const DIE = 1.24;
const PINS = 6;
const PIN_GAP = 0.17;
const SUB_TOP = 0.06;
/** Seconds between consecutive traces lighting up (24 traces ≈ 0.65 s sweep). */
const TRACE_STEP = 0.028;

interface TraceSeg {
  x: number;
  z: number;
  len: number;
  rot: number;
}

interface Trace {
  key: string;
  side: number;
  order: number;
  segs: TraceSeg[];
  pad: [number, number];
}

function segBetween(x1: number, z1: number, x2: number, z2: number): TraceSeg {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return { x: (x1 + x2) / 2, z: (z1 + z2) / 2, len: Math.hypot(dx, dz), rot: Math.atan2(dx, dz) };
}

/** Per side: a short straight run off each pin, then a fan-out to a pad. */
function chipTraces(): Trace[] {
  const out: Trace[] = [];
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < PINS; i++) {
      const x = (i - (PINS - 1) / 2) * PIN_GAP;
      const bend = 0.84 + hash01(`chip-bend${side}-${i}`) * 0.05;
      const endX = x * 1.55;
      const endZ = 0.99;
      out.push({
        key: `${side}-${i}`,
        side,
        order: side * PINS + i,
        segs: [segBetween(x, 0.76, x, bend), segBetween(x, bend, endX, endZ)],
        pad: [endX, endZ],
      });
    }
  }
  return out;
}

/** "AI" as capsule strokes in the XY plane: [x, y, length, rotZ]. */
const AI_STROKES: readonly [number, number, number, number][] = [
  [-0.155, 0, 0.3, -0.3],
  [-0.045, 0, 0.3, 0.3],
  [-0.1, -0.03, 0.1, Math.PI / 2],
  [0.13, 0, 0.3, 0],
];

const Chip: React.FC<HeroPropProps> = ({ at, tone }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const breath = useBreath('hero-chip', 2.4);
  const impact = at + heroImpactSec('chip', tone);
  const substrate = useMemo(() => new RoundedBoxGeometry(SUB, 0.12, SUB, 3, 0.05), []);
  const die = useMemo(() => new RoundedBoxGeometry(DIE, 0.2, DIE, 4, 0.08), []);
  const core = useMemo(() => new RoundedBoxGeometry(0.66, 0.05, 0.66, 3, 0.02), []);
  const pin = useMemo(() => new RoundedBoxGeometry(0.085, 0.06, 0.22, 2, 0.022), []);
  const traces = useMemo(chipTraces, []);

  // Core charges up to a flash exactly on the impact, then settles to a glow.
  const charge = clamp01((t - (impact - 0.2)) / 0.2);
  const pulse = impactPulse(t, impact, 3.6);
  const glow = t < impact ? 0.12 + charge * charge * 1.5 : 0.62 + pulse + breath * 0.14;
  const press = pulse * Math.cos((t - impact) * 22);
  const dieColor = mixHex(S.clay[2], S.bgOuter, 0.55);
  const subColor = mixHex(S.clay[1], S.clay[2], 0.35);
  const traceBase = mixHex(subColor, S.paper, 0.35);
  const metal = mixHex(S.paper, S.clay[1], 0.35);

  return (
    <group rotation={[0.95, 0, 0]} position={[0, -0.05, 0]}>
      <mesh geometry={substrate}>
        <Clay color={subColor} />
      </mesh>
      {/* Pins + traces, one side at a time (side 0 faces +Z). */}
      {[0, 1, 2, 3].map((side) => (
        <group key={side} rotation={[0, (side * Math.PI) / 2, 0]}>
          {Array.from({ length: PINS }, (_, i) => (
            <mesh
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed pin row
              key={i}
              geometry={pin}
              position={[(i - (PINS - 1) / 2) * PIN_GAP, SUB_TOP + 0.03, 0.67]}
            >
              <Clay color={metal} roughness={0.42} metalness={0.15} />
            </mesh>
          ))}
          {traces
            .filter((tr) => tr.side === side)
            .map((tr) => {
              const lightAt = impact + tr.order * TRACE_STEP;
              const on = ramp(t, lightAt, 0.14);
              const flash = impactPulse(t, lightAt, 6);
              const color = mixHex(traceBase, S.accent, on * 0.85);
              const intensity = on * (0.5 + flash * 1.1 + breath * 0.15);
              return (
                <group key={tr.key}>
                  {tr.segs.map((sg) => (
                    <mesh
                      key={`${sg.x.toFixed(3)}:${sg.z.toFixed(3)}`}
                      position={[sg.x, SUB_TOP + 0.006, sg.z]}
                      rotation={[0, sg.rot, 0]}
                      scale={[1, 1, sg.len + 0.035]}
                    >
                      <boxGeometry args={[0.035, 0.014, 1]} />
                      <Clay color={color} emissive={S.accent} emissiveIntensity={intensity} />
                    </mesh>
                  ))}
                  <mesh position={[tr.pad[0], SUB_TOP + 0.008, tr.pad[1]]}>
                    <cylinderGeometry args={[0.042, 0.042, 0.018, 14]} />
                    <Clay color={color} emissive={S.accent} emissiveIntensity={intensity} />
                  </mesh>
                </group>
              );
            })}
        </group>
      ))}
      {/* Die, core and the "AI" mark. */}
      <group position={[0, SUB_TOP + 0.1 - press * 0.02, 0]}>
        <mesh geometry={die}>
          <Clay color={dieColor} roughness={0.5} />
        </mesh>
        <group position={[0, 0.125, 0]} scale={[1 + press * 0.05, 1, 1 + press * 0.05]}>
          <mesh geometry={core}>
            <Clay
              color={mixHex(dieColor, S.accent, 0.45)}
              emissive={S.accent}
              emissiveIntensity={glow * 0.55}
              roughness={0.4}
            />
          </mesh>
          <group position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            {AI_STROKES.map(([x, y, len, rz]) => (
              <mesh key={`${x}:${rz}`} position={[x, y, 0]} rotation={[0, 0, rz]}>
                <capsuleGeometry args={[0.03, len, 4, 10]} />
                <Clay color={S.paper} emissive={S.accent2} emissiveIntensity={glow * 0.35} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Globe — clay planet with raised continents on a desk stand; a map pin drops.
// ---------------------------------------------------------------------------

const GLOBE_R = 0.84;
const GLOBE_TILT = 0.4;
const GLOBE_YAW = -0.3;
const SPIN_RATE = 0.32;
const PIN_LAT = 0.42;
const PIN_FALL_SEC = 0.36;

interface Blob {
  key: string;
  lat: number;
  lon: number;
  r: number;
  squash: number;
  twist: number;
}

function continentBlobs(pinLon: number): Blob[] {
  const out: Blob[] = [];
  const clusters = 6;
  for (let c = 0; c < clusters; c++) {
    const lon = (c / clusters) * Math.PI * 2 + (hash01(`gl-lon${c}`) - 0.5) * 0.7;
    const lat = (hash01(`gl-lat${c}`) - 0.5) * 1.5;
    const n = 2 + Math.floor(hash01(`gl-n${c}`) * 3);
    for (let b = 0; b < n; b++) {
      out.push({
        key: `c${c}-${b}`,
        lat: lat + (hash01(`gl-dl${c}-${b}`) - 0.5) * 0.55,
        lon: lon + (hash01(`gl-do${c}-${b}`) - 0.5) * 0.7,
        r: 0.2 + hash01(`gl-r${c}-${b}`) * 0.17,
        squash: 0.6 + hash01(`gl-s${c}-${b}`) * 0.4,
        twist: hash01(`gl-t${c}-${b}`) * Math.PI,
      });
    }
  }
  // The pin lands on its own little landmass.
  out.push({ key: 'pin-a', lat: PIN_LAT, lon: pinLon, r: 0.3, squash: 0.75, twist: 0.4 });
  out.push({
    key: 'pin-b',
    lat: PIN_LAT - 0.22,
    lon: pinLon + 0.2,
    r: 0.22,
    squash: 0.8,
    twist: 1,
  });
  return out;
}

/** Orients children so local +Y is the sphere's surface normal at (lat, lon). */
const OnSurface: React.FC<{ lat: number; lon: number; children: React.ReactNode }> = ({
  lat,
  lon,
  children,
}) => (
  <group rotation={[0, lon, 0]}>
    <group rotation={[Math.PI / 2 - lat, 0, 0]}>{children}</group>
  </group>
);

const Globe: React.FC<HeroPropProps> = ({ at, tone }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const impactSec = heroImpactSec('globe', tone);
  const impact = at + impactSec;
  const spinAt = (time: number): number => SPIN_RATE * (time - at);
  // Place the pin so it faces the camera (slightly right) as it lands: undo the
  // resting yaw, the hero's idle turn at impact (HeroScene) and the spin so far.
  const turnAtImpact = Math.sin(impactSec * 0.5) * 0.3;
  const pinLon = 0.35 - GLOBE_YAW - turnAtImpact - SPIN_RATE * impactSec;
  const blobs = useMemo(() => continentBlobs(pinLon), [pinLon]);
  const base = useMemo(
    () =>
      lathe(
        [
          [0, 0.1],
          [0.3, 0.1],
          [0.46, 0.06],
          [0.52, 0.0],
          [0.5, -0.04],
          [0, -0.04],
        ],
        40,
      ),
    [],
  );
  const pinHead = useMemo(
    () =>
      lathe(
        [
          [0, 0],
          [0.035, 0.08],
          [0.07, 0.2],
          [0.12, 0.3],
          [0.16, 0.4],
          [0.165, 0.46],
          [0.14, 0.54],
          [0.08, 0.59],
          [0, 0.605],
        ],
        28,
      ),
    [],
  );

  const ocean = mixHex(S.clay[0], S.accent, 0.18);
  const land = S.clay[1];
  const metal = mixHex(S.paper, S.clay[1], 0.35);
  const stand = S.clay[2];

  // Pin: accelerating fall along the normal, lands exactly on impact + squash.
  const fallStart = impact - PIN_FALL_SEC;
  const p = clamp01((t - fallStart) / PIN_FALL_SEC);
  const lift = (1 - p * p) * 1.1;
  const pinIn = clamp01((t - fallStart) / 0.1);
  const settle = impactPulse(t, impact, 8) * Math.cos((t - impact) * 20);
  const squash = t >= impact ? settle * 0.3 : 0;
  const ripple = clamp01((t - impact) / 0.7);
  const rippleR = 0.12 + ripple * 0.3;

  // Globe centre sits left of the stand so the tilted axis ends over the stem.
  const gx = -0.19;
  const gy = 0.14;
  const ringR = GLOBE_R + 0.12;
  const poleX = gx + Math.sin(GLOBE_TILT) * ringR;
  const poleY = gy - Math.cos(GLOBE_TILT) * ringR;
  const baseY = -1.18;

  return (
    <group>
      {/* Stand */}
      <mesh geometry={base} position={[poleX, baseY, 0]}>
        <Clay color={stand} />
      </mesh>
      <mesh position={[poleX, (baseY + 0.1 + poleY) / 2, 0]}>
        <cylinderGeometry args={[0.055, 0.075, poleY - baseY - 0.1, 16]} />
        <Clay color={stand} />
      </mesh>
      <group position={[gx, gy, 0]} rotation={[0, 0, GLOBE_TILT]}>
        {/* Meridian half-ring from pole to pole, plus pole caps. */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[ringR, 0.032, 10, 64, Math.PI]} />
          <Clay color={metal} roughness={0.4} metalness={0.18} />
        </mesh>
        {[1, -1].map((s) => (
          <mesh key={s} position={[0, s * (ringR - 0.02), 0]}>
            <sphereGeometry args={[0.06, 16, 12]} />
            <Clay color={metal} roughness={0.4} metalness={0.18} />
          </mesh>
        ))}
        {/* Spinning planet */}
        <group rotation={[0, spinAt(t), 0]}>
          <mesh>
            <sphereGeometry args={[GLOBE_R, 48, 36]} />
            <Clay color={ocean} roughness={0.5} />
          </mesh>
          {blobs.map((b) => (
            <OnSurface key={b.key} lat={b.lat} lon={b.lon}>
              <mesh
                position={[0, GLOBE_R - 0.012, 0]}
                rotation={[0, b.twist, 0]}
                scale={[b.r, 0.07, b.r * b.squash]}
              >
                <sphereGeometry args={[1, 24, 12]} />
                <Clay color={land} roughness={0.58} />
              </mesh>
            </OnSurface>
          ))}
          {t >= fallStart && (
            <OnSurface lat={PIN_LAT} lon={pinLon}>
              <group position={[0, GLOBE_R + 0.04 + lift, 0]}>
                <group
                  scale={[
                    pinIn * (1 + squash * 0.6),
                    pinIn * (1 - squash),
                    pinIn * (1 + squash * 0.6),
                  ]}
                >
                  <mesh geometry={pinHead}>
                    <Clay color={S.accent} roughness={0.45} />
                  </mesh>
                  <mesh position={[0, 0.45, 0.13]}>
                    <sphereGeometry args={[0.055, 16, 12]} />
                    <Clay color={S.paper} />
                  </mesh>
                </group>
              </group>
              {t >= impact && ripple < 1 && (
                <mesh
                  position={[0, GLOBE_R + 0.04 + (rippleR * rippleR) / (2 * GLOBE_R), 0]}
                  rotation={[Math.PI / 2, 0, 0]}
                  scale={rippleR}
                >
                  <torusGeometry args={[1, 0.08, 8, 40]} />
                  <Clay
                    color={S.accent2}
                    emissive={S.accent2}
                    emissiveIntensity={0.4}
                    opacity={(1 - ripple) * 0.9}
                  />
                </mesh>
              )}
            </OnSurface>
          )}
        </group>
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Envelope — back panel, letter, V-cut pocket, hinged flap with a liner.
// ---------------------------------------------------------------------------

const ENV_W = 2.2;
const ENV_H = 1.42;
const FLAP_H = 0.86;
const LETTER_RISE = 0.95;

function flapShape(w: number, h: number): Shape {
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0.14, -h + 0.1);
  s.quadraticCurveTo(0, -h - 0.02, -0.14, -h + 0.1);
  s.lineTo(-w / 2, 0);
  return s;
}

/** Envelope front pocket: rounded bottom corners, shallow V cut at the top. */
function pocketShape(): Shape {
  const w = ENV_W - 0.04;
  const h = ENV_H - 0.04;
  const r = 0.08;
  const x = -w / 2;
  const y = -h / 2;
  const s = new Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h);
  s.lineTo(0.16, y + h - 0.44);
  s.quadraticCurveTo(0, y + h - 0.5, -0.16, y + h - 0.44);
  s.lineTo(x, y + h);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

const Envelope: React.FC<HeroPropProps> = ({ at, tone }) => {
  const S = useStage();
  const impact = at + heroImpactSec('envelope', tone);
  const back = useMemo(() => new RoundedBoxGeometry(ENV_W, ENV_H, 0.05, 3, 0.022), []);
  const letter = useMemo(() => new RoundedBoxGeometry(1.92, 1.28, 0.022, 2, 0.01), []);
  const pocket = useMemo(() => extrude(pocketShape(), 0.02, 0.018), []);
  const flap = useMemo(() => extrude(flapShape(ENV_W - 0.02, FLAP_H), 0.018, 0.016), []);
  const liner = useMemo(() => extrude(flapShape(ENV_W - 0.36, FLAP_H - 0.2), 0.004, 0), []);
  const headLine = useMemo(() => roundedRectGeometry(0.72, 0.1, 0.05), []);
  const textLine = useMemo(() => roundedRectGeometry(1, 0.06, 0.03), []);

  // Flap swings up and over, fully open just before impact; the letter's
  // slide is fastest on the impact (the 'slide' cue).
  const open = useSpringAt(at + 0.16, 150, 16);
  const flapAngle = -(Math.PI + 0.22) * open;
  const slide = useSpringAt(impact - 0.08, 120, 15);
  const letterY = -0.1 + slide * LETTER_RISE;

  const paperBody = S.clay[1];
  const pocketColor = mixHex(S.clay[1], S.paper, 0.25);
  const flapColor = mixHex(S.clay[1], S.clay[0], 0.12);
  const linerColor = mixHex(S.accent, S.clay[0], 0.35);
  const ink = mixHex(S.paper, S.paperText, 0.32);

  return (
    <group position={[0, -0.36, 0]} rotation={[-0.1, 0, 0]}>
      <mesh geometry={back} position={[0, 0, -0.05]}>
        <Clay color={paperBody} />
      </mesh>
      {/* Letter (between back panel and pocket). */}
      <group position={[0, letterY, 0]}>
        <mesh geometry={letter}>
          <Clay color={S.paper} roughness={0.6} />
        </mesh>
        <group position={[0, 0, 0.013]}>
          <mesh geometry={headLine} position={[-0.5, 0.44, 0]}>
            <Clay color={S.accent} emissive={S.accent} emissiveIntensity={0.15} />
          </mesh>
          {[1.5, 1.28, 1.44, 0.9].map((w, i) => (
            <mesh
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed text lines
              key={i}
              geometry={textLine}
              position={[-0.86 + w / 2, 0.24 - i * 0.15, 0]}
              scale={[w, 1, 1]}
            >
              <Clay color={ink} />
            </mesh>
          ))}
        </group>
      </group>
      {/* Pocket front with folds. */}
      <mesh geometry={pocket} position={[0, 0, 0.03]}>
        <Clay color={pocketColor} />
      </mesh>
      {[-1, 1].map((s) => {
        const x1 = s * (ENV_W / 2 - 0.12);
        const y1 = -ENV_H / 2 + 0.12;
        const x2 = s * 0.22;
        const y2 = -0.12;
        const len = Math.hypot(x2 - x1, y2 - y1);
        return (
          <mesh
            key={s}
            position={[(x1 + x2) / 2, (y1 + y2) / 2, 0.07]}
            rotation={[0, 0, Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2]}
          >
            <capsuleGeometry args={[0.012, len, 3, 8]} />
            <Clay color={mixHex(pocketColor, S.clay[2], 0.3)} />
          </mesh>
        );
      })}
      {/* Flap hinged on the top edge; liner shows once it flips over. */}
      <group position={[0, ENV_H / 2 - 0.02, 0.085]} rotation={[flapAngle, 0, 0]}>
        <mesh geometry={flap}>
          <Clay color={flapColor} />
        </mesh>
        <mesh geometry={liner} position={[0, -0.04, -0.02]} rotation={[0, Math.PI, 0]}>
          <Clay color={linerColor} />
        </mesh>
        <group position={[0, -FLAP_H + 0.2, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[0.13, 0.14, 0.05, 28]} />
            <Clay color={S.accent} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.028, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.075, 0.016, 8, 24]} />
            <Clay color={mixHex(S.accent, S.paper, 0.35)} roughness={0.45} />
          </mesh>
        </group>
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Book — hardcover lying at an angle; cover lands open on impact, pages fan.
// ---------------------------------------------------------------------------

const BOOK_W = 1.12;
const BOOK_D = 1.56;
const COVER_T = 0.06;
const BLOCK_T = 0.13;
/** Gutter height: the spine hinge sits mid-thickness of the closed book. */
const HINGE_Y = COVER_T + BLOCK_T;
/** Final fan angle of each loose page (fraction of a half turn). */
const PAGE_TARGETS = [0.97, 0.92, 0.84, 0.72, 0.58];
const PAGE_STAGGER = 0.07;

const PageLines: React.FC<{ color: string }> = ({ color }) => {
  const line = useMemo(() => roundedRectGeometry(1, 0.035, 0.017), []);
  return (
    <>
      {[0.6, 0.72, 0.66, 0.7, 0.5].map((w, i) => (
        <mesh
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed text lines
          key={i}
          geometry={line}
          position={[(w - 0.7) / 2, 0, -0.44 + i * 0.2]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[w, 1, 1]}
        >
          <Clay color={color} />
        </mesh>
      ))}
    </>
  );
};

const Book: React.FC<HeroPropProps> = ({ at, tone }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const impact = at + heroImpactSec('book', tone);
  const cover = useMemo(() => new RoundedBoxGeometry(BOOK_W, COVER_T, BOOK_D, 3, 0.025), []);
  const block = useMemo(
    () => new RoundedBoxGeometry(BOOK_W - 0.07, BLOCK_T, BOOK_D - 0.1, 2, 0.02),
    [],
  );
  const plate = useMemo(() => extrude(roundedRectShape(0.62, 0.46, 0.06), 0.006, 0.008), []);
  const line = useMemo(() => roundedRectGeometry(1, 0.035, 0.017), []);
  const page = useMemo(() => {
    const w = BOOK_W - 0.1;
    const g = new PlaneGeometry(w, BOOK_D - 0.14, 14, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(w / 2 + 0.02, 0, 0);
    const pos = g.attributes.position;
    if (pos) {
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i) / BOOK_W;
        // Curl: the free edge trails the flip (local -Y).
        pos.setY(i, -0.35 * u * u);
      }
    }
    g.computeVertexNormals();
    return g;
  }, []);

  // Cover falls open (accelerating) and lands flat exactly on the impact.
  const openStart = impact - 0.3;
  const p = clamp01((t - openStart) / 0.3);
  const land = wobble(t, impact, 20, 7);
  const open = p * p - Math.max(0, land) * 0.04;
  const coverAngle = open * Math.PI;
  const centreX = -BOOK_W / 2 + (BOOK_W / 2) * p * p;

  const coverColor = S.clay[0];
  const inside = mixHex(S.clay[1], S.paper, 0.2);
  const pages = S.paper;
  const ink = mixHex(S.paper, S.paperText, 0.28);

  return (
    <group rotation={[0.62, 0, -0.08]} position={[0, -0.2, 0.1]}>
      <group position={[centreX, -HINGE_Y, 0]}>
        {/* Back cover + right half of the pages (static). */}
        <mesh geometry={cover} position={[BOOK_W / 2, COVER_T / 2, 0]}>
          <Clay color={coverColor} />
        </mesh>
        <mesh geometry={block} position={[(BOOK_W - 0.07) / 2 + 0.01, COVER_T + BLOCK_T / 2, 0]}>
          <Clay color={pages} roughness={0.62} />
        </mesh>
        <group position={[BOOK_W / 2, HINGE_Y + 0.002, 0]}>
          <PageLines color={ink} />
        </group>
        {/* Spine: half-cylinder that rolls under the gutter as it opens. */}
        <group position={[0, HINGE_Y, 0]} rotation={[0, 0, coverAngle / 2]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[HINGE_Y, HINGE_Y, BOOK_D, 24, 1, false, Math.PI, Math.PI]} />
            <Clay color={mixHex(coverColor, S.clay[2], 0.35)} />
          </mesh>
        </group>
        {/* Front cover + left half of the pages, rotating about the spine. */}
        <group position={[0, HINGE_Y, 0]} rotation={[0, 0, coverAngle]}>
          <group position={[0, -HINGE_Y, 0]}>
            <mesh
              geometry={block}
              position={[(BOOK_W - 0.07) / 2 + 0.01, COVER_T + BLOCK_T * 1.5, 0]}
            >
              <Clay color={pages} roughness={0.62} />
            </mesh>
            <group position={[BOOK_W / 2, HINGE_Y - 0.002, 0]} rotation={[Math.PI, 0, 0]}>
              <PageLines color={ink} />
            </group>
            <mesh geometry={cover} position={[BOOK_W / 2, COVER_T * 1.5 + BLOCK_T * 2, 0]}>
              <Clay color={coverColor} />
            </mesh>
            {/* Title plate on the outside, endpaper on the inside. */}
            <group position={[BOOK_W / 2 + 0.04, COVER_T * 2 + BLOCK_T * 2 + 0.003, -0.12]}>
              <mesh geometry={plate} rotation={[-Math.PI / 2, 0, 0]}>
                <Clay color={mixHex(S.paper, S.clay[0], 0.15)} />
              </mesh>
              {[0.4, 0.3].map((w, i) => (
                <mesh
                  key={w}
                  geometry={line}
                  position={[0, 0.02, -0.06 + i * 0.12]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  scale={[w, 1.4, 1]}
                >
                  <Clay color={i === 0 ? S.accent : ink} />
                </mesh>
              ))}
            </group>
            <mesh
              geometry={cover}
              position={[BOOK_W / 2, COVER_T + BLOCK_T * 2 - 0.004, 0]}
              scale={[0.94, 0.1, 0.94]}
            >
              <Clay color={inside} />
            </mesh>
            <mesh position={[BOOK_W / 2, COVER_T * 1.5 + BLOCK_T * 2, BOOK_D / 2 - 0.3]}>
              <boxGeometry args={[BOOK_W + 0.004, COVER_T * 0.5, 0.08]} />
              <Clay color={S.accent} />
            </mesh>
          </group>
        </group>
        {/* Loose pages fanning over from the gutter, staggered. */}
        <group position={[0, HINGE_Y, 0]}>
          {PAGE_TARGETS.map((target, i) => {
            const flip = spring({
              frame: frame - Math.round((impact - 0.04 + i * PAGE_STAGGER) * fps),
              fps,
              config: { stiffness: 110, damping: 14, mass: 1 },
            });
            if (flip <= 0.001) return null;
            const curl = Math.sin(clamp01(flip) * Math.PI) * 0.8 + 0.2 * flip;
            return (
              <group key={target} rotation={[0, 0, flip * target * Math.PI]} scale={[1, curl, 1]}>
                <mesh geometry={page}>
                  <meshStandardMaterial
                    color={mixHex(pages, S.clay[1], i * 0.06)}
                    roughness={0.62}
                    side={DoubleSide}
                  />
                </mesh>
              </group>
            );
          })}
        </group>
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------

export const WORLD_PROPS = {
  chip: { Model: Chip, yaw: -0.42, framing: { scale: 1, y: 0.05 } },
  globe: { Model: Globe, yaw: GLOBE_YAW, framing: { scale: 1.08, y: 0.08 } },
  envelope: { Model: Envelope, yaw: -0.34, framing: { scale: 1, y: 0.05 } },
  book: { Model: Book, yaw: 0.35, framing: { scale: 1.05, y: 0.08 } },
} satisfies Record<'chip' | 'globe' | 'envelope' | 'book', HeroPropDef>;
