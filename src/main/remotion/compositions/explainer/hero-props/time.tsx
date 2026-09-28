/**
 * Hero props: hourglass, stopwatch, calendar — soft clay "time" objects.
 *
 * Each one already reads as its object when it pops in on `at`; its signature
 * motion peaks exactly `heroImpactSec(prop)` after `at` (hero-catalog.ts), where
 * the scene bursts, pushes the camera and plays the cue sound.
 */

import type React from 'react';
import { useMemo } from 'react';
import type { LatheGeometry, ShapeGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HERO_CATALOG } from '../hero-catalog';
import {
  Clay,
  type HeroPropDef,
  type HeroPropProps,
  lathe,
  roundedRectGeometry,
  useSpringAt,
  wobble,
} from '../hero-kit';
import { hash01 } from '../motion';
import { mixHex } from '../palette';
import { ramp, useSceneTime, useStage } from '../stage';

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function easeInOut(p: number): number {
  const x = clamp01(p);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Rounded disc (plate/base) as a lathe: radius `r`, height `h`, edge round `e`. */
function roundedDisc(r: number, h: number, e: number, segments = 40): LatheGeometry {
  const y = h / 2;
  return lathe(
    [
      [0, y],
      [r - e, y],
      [r - e * 0.3, y - e * 0.3],
      [r, y - e],
      [r, -y + e],
      [r - e * 0.3, -y + e * 0.3],
      [r - e, -y],
      [0, -y],
    ],
    segments,
  );
}

// ---------------------------------------------------------------------------
// Hourglass — glass bulbs between clay plates; flips over, then sand drains.
// ---------------------------------------------------------------------------

/** Seconds after `at` when the flip lands (hero-catalog impactSec). */
const HOURGLASS_FLIP_SEC = HERO_CATALOG.hourglass.impactSec;
/** Seconds the sand takes to run through after landing. */
const SAND_RUN_SEC = 5;
const PLATE_Y = 1.0;
const NECK_Y = 0.04;
const GRAINS = 6;
/** Resting yaw of the hourglass (TIME_PROPS) — pillars are placed around it. */
const HOURGLASS_YAW = 0.35;
/** Pillars at world angles 15°/165° (sides, clear of the sand) and 270° (back). */
const PILLAR_ANGLES = [15, 165, 270].map((deg) => (deg * Math.PI) / 180 + HOURGLASS_YAW);

/** Upper glass bulb profile [radius, y] from the neck (y≈0) up to the plate. */
const BULB_PROFILE: [number, number][] = [
  [0.07, 0],
  [0.12, 0.08],
  [0.3, 0.26],
  [0.46, 0.44],
  [0.54, 0.6],
  [0.56, 0.74],
  [0.53, 0.86],
  [0.46, 0.94],
];

const Hourglass: React.FC<HeroPropProps> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const plate = useMemo(() => roundedDisc(0.74, 0.16, 0.06), []);
  const glass = useMemo(() => {
    const lower = BULB_PROFILE.map(([r, y]): [number, number] => [r, -y]).reverse();
    return lathe([[0, -0.95], ...lower, ...BULB_PROFILE.slice(1), [0, 0.95]], 40);
  }, []);
  // Funnel of sand whose tip sits at the neck (origin), opening upwards.
  const funnel = useMemo(
    () =>
      lathe(
        [
          [0, 0.46],
          [0.2, 0.455],
          [0.36, 0.44],
          [0.42, 0.4],
          [0.26, 0.24],
          [0.1, 0.06],
          [0, 0],
        ],
        32,
      ),
    [],
  );
  // Pile resting on the lower plate (base at origin), mound on top.
  const pile = useMemo(
    () =>
      lathe(
        [
          [0, 0.42],
          [0.12, 0.38],
          [0.32, 0.24],
          [0.47, 0.12],
          [0.49, 0.04],
          [0.48, 0],
          [0, 0],
        ],
        32,
      ),
    [],
  );

  const landAt = at + HOURGLASS_FLIP_SEC;
  // Accelerating flip that lands (180°) exactly on the impact.
  const p = clamp01((t - at) / HOURGLASS_FLIP_SEC);
  const flip = Math.PI * (p < 1 ? p * p * (2.2 - 1.2 * p) : 1);
  const landed = t >= landAt;
  const jolt = wobble(t, landAt, 20, 7);
  const run = landed ? clamp01((t - landAt - 0.08) / SAND_RUN_SEC) : 0;
  // Top funnel shrinks toward the neck (volume ∝ s³); bottom pile grows.
  const topScale = landed ? Math.cbrt(1 - run * 0.92) : 1;
  const pileScale = landed ? 0.04 + run ** 0.8 * 0.9 : 1;
  const pileTop = -PLATE_Y + 0.09 + 0.42 * pileScale;
  const streamOn = landed ? ramp(t, landAt + 0.02, 0.12) : 0;
  const since = t - landAt;

  const sand = mixHex(S.accent, S.accent2, 0.3);
  const glassColor = mixHex(S.paper, S.accent2, 0.18);
  const plateColor = S.clay[2];
  const pillarColor = S.clay[0];

  return (
    <group rotation={[0, 0, jolt * 0.05]} position={[0, -0.02, 0]}>
      <group rotation={[0, 0, flip]}>
        {/* Plates + pillars */}
        {[PLATE_Y, -PLATE_Y].map((y) => (
          <mesh key={y} geometry={plate} position={[0, y, 0]}>
            <Clay color={plateColor} />
          </mesh>
        ))}
        {PILLAR_ANGLES.map((a) => (
          <group key={a} position={[Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62]}>
            <mesh>
              <cylinderGeometry args={[0.055, 0.055, PLATE_Y * 2, 14]} />
              <Clay color={pillarColor} />
            </mesh>
            {[0.84, 0, -0.84].map((y) => (
              <mesh key={y} position={[0, y, 0]}>
                <sphereGeometry args={[0.085, 16, 12]} />
                <Clay color={mixHex(pillarColor, S.paper, 0.15)} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Sand: before landing it is a full pile in the (local) lower bulb. */}
        {!landed ? (
          <mesh geometry={pile} position={[0, -PLATE_Y + 0.08, 0]}>
            <Clay color={sand} roughness={0.7} />
          </mesh>
        ) : null}
        {/* Glass */}
        <mesh geometry={glass}>
          <meshStandardMaterial
            color={glassColor}
            roughness={0.18}
            metalness={0}
            transparent
            opacity={0.34}
            depthWrite={false}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.1, 0.03, 8, 24]} />
          <Clay color={mixHex(plateColor, S.paper, 0.2)} />
        </mesh>
      </group>
      {/* After landing the glass is upright again (symmetric), so the sand
          lives in world space: funnel draining at the top, pile growing below. */}
      {landed ? (
        <>
          {topScale > 0.02 ? (
            <mesh geometry={funnel} position={[0, NECK_Y, 0]} scale={topScale}>
              <Clay color={sand} roughness={0.7} />
            </mesh>
          ) : null}
          <mesh geometry={pile} position={[0, -PLATE_Y + 0.08, 0]} scale={[1, pileScale, 1]}>
            <Clay color={sand} roughness={0.7} />
          </mesh>
          {streamOn > 0 && run < 1 ? (
            <mesh
              position={[0, (NECK_Y + pileTop) / 2, 0]}
              scale={[streamOn, Math.max(0.01, NECK_Y - pileTop), streamOn]}
            >
              <cylinderGeometry args={[0.022, 0.03, 1, 10]} />
              <Clay color={sand} roughness={0.6} emissive={S.accent2} emissiveIntensity={0.15} />
            </mesh>
          ) : null}
          {since > 0.05 &&
            Array.from({ length: GRAINS }, (_, i) => {
              const u = ((since - 0.05) / 0.5 + i / GRAINS) % 1;
              if (since - 0.05 < u * 0.5) return null;
              const y = NECK_Y - u * (NECK_Y - pileTop);
              const jx = (hash01(`hg-x${i}`) - 0.5) * 0.05;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed grain pool
                <mesh key={i} position={[jx, y, 0.02]} scale={0.035 * streamOn}>
                  <sphereGeometry args={[1, 8, 6]} />
                  <Clay color={mixHex(sand, S.paper, 0.2)} roughness={0.6} />
                </mesh>
              );
            })}
        </>
      ) : null}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Stopwatch — lathe body, crown + loop, ticked face; button press starts it.
// ---------------------------------------------------------------------------

/** Seconds after `at` when the crown button bottoms out (hero-catalog impactSec). */
const STOPWATCH_PRESS_SEC = HERO_CATALOG.stopwatch.impactSec;
/** Radians per second of the sweep hand once started. */
const SWEEP_SPEED = 1.7;

const Stopwatch: React.FC<HeroPropProps> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const body = useMemo(
    () =>
      lathe(
        [
          [0, 0.24],
          [0.78, 0.24],
          [0.9, 0.2],
          [0.97, 0.1],
          [0.98, 0],
          [0.96, -0.12],
          [0.88, -0.2],
          [0.7, -0.24],
          [0, -0.24],
        ],
        56,
      ),
    [],
  );
  const tick = useMemo(() => roundedRectGeometry(0.045, 0.1, 0.02), []);
  const tickMajor = useMemo(() => roundedRectGeometry(0.07, 0.17, 0.03), []);
  const hand = useMemo(() => roundedRectGeometry(0.06, 0.74, 0.03), []);
  const minuteHand = useMemo(() => roundedRectGeometry(0.075, 0.44, 0.035), []);

  const pressAt = at + STOPWATCH_PRESS_SEC;
  // Button travels in during the last 0.1 s, bottoms out on the impact, springs back.
  const pressIn = ramp(t, pressAt - 0.1, 0.1);
  const release = useSpringAt(pressAt + 0.06, 260, 14, 0.6);
  const press = t < pressAt + 0.06 ? pressIn : Math.max(0, 1 - release);
  const buttonY = 1.2 - press * 0.1;
  const jolt = wobble(t, pressAt, 22, 8);
  const elapsed = Math.max(0, t - pressAt);
  const kick = useSpringAt(pressAt, 200, 16, 0.5);
  const sweep = elapsed * SWEEP_SPEED + Math.min(1, kick) * 0.12;
  const running = ramp(t, pressAt, 0.2);

  const bodyColor = S.clay[0];
  const bezel = S.clay[2];
  const tickColor = mixHex(S.paperText, S.paper, 0.35);

  return (
    <group position={[0, -0.18, 0]} rotation={[0, 0, jolt * 0.03]}>
      {/* Body (lathe around Y, turned to face +Z) */}
      <group rotation={[Math.PI / 2, 0, 0]}>
        <mesh geometry={body}>
          <Clay color={bodyColor} />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.23]}>
        <torusGeometry args={[0.8, 0.07, 14, 56]} />
        <Clay color={bezel} />
      </mesh>
      <group position={[0, 0, 0.245]}>
        <mesh>
          <circleGeometry args={[0.79, 56]} />
          <Clay color={S.paper} roughness={0.5} />
        </mesh>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          const major = i % 3 === 0;
          const r = major ? 0.6 : 0.63;
          return (
            <mesh
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed dial ticks
              key={i}
              geometry={major ? tickMajor : tick}
              position={[Math.sin(a) * r, Math.cos(a) * r, 0.004]}
              rotation={[0, 0, -a]}
            >
              <Clay color={major ? S.paperText : tickColor} />
            </mesh>
          );
        })}
        {/* Elapsed arc behind the hand */}
        {sweep > 0.01 ? (
          <mesh position={[0, 0, 0.003]} rotation={[0, 0, Math.PI / 2 - sweep]}>
            <circleGeometry args={[0.5, 48, 0, Math.min(sweep, Math.PI * 2)]} />
            <Clay
              color={mixHex(S.paper, S.accent, 0.22)}
              emissive={S.accent}
              emissiveIntensity={0.05}
            />
          </mesh>
        ) : null}
        {/* Minute hand (slow) */}
        <group rotation={[0, 0, -0.9 - sweep / 60]} position={[0, 0, 0.012]}>
          <mesh geometry={minuteHand} position={[0, 0.17, 0]}>
            <Clay color={S.paperText} />
          </mesh>
        </group>
        {/* Accent sweep hand */}
        <group rotation={[0, 0, -sweep]} position={[0, 0, 0.02]}>
          <mesh geometry={hand} position={[0, 0.25, 0]}>
            <Clay color={S.accent} emissive={S.accent} emissiveIntensity={0.15 + running * 0.25} />
          </mesh>
        </group>
        <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.04, 20]} />
          <Clay color={S.accent} />
        </mesh>
      </group>
      {/* Crown stem, button and loop */}
      <mesh position={[0, 0.99, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.16, 20]} />
        <Clay color={bezel} />
      </mesh>
      <group position={[0, buttonY, 0]}>
        <mesh>
          <cylinderGeometry args={[0.17, 0.17, 0.14, 24]} />
          <Clay color={S.accent} emissive={S.accent} emissiveIntensity={press * 0.4} />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <torusGeometry args={[0.16, 0.05, 12, 28]} />
          <Clay color={bezel} />
        </mesh>
      </group>
      {/* Side pusher */}
      <group rotation={[0, 0, -Math.PI / 4]}>
        <mesh position={[0, 1.02, 0]}>
          <cylinderGeometry args={[0.07, 0.08, 0.16, 16]} />
          <Clay color={bezel} />
        </mesh>
        <mesh position={[0, 1.12, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.08, 18]} />
          <Clay color={bezel} />
        </mesh>
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Calendar — desk block with rings + accent header; the top page flips away.
// ---------------------------------------------------------------------------

/** Seconds after `at` when the flipping page passes the top (hero-catalog impactSec). */
const CALENDAR_FLIP_SEC = HERO_CATALOG.calendar.impactSec;
const PAGE_W = 1.84;
const PAGE_H = 1.46;
const COLS = 7;
const ROWS = 4;
/** Highlighted day on the top page; the next page highlights the day after. */
const TODAY = 10;

const DayGrid: React.FC<{
  cell: ShapeGeometry;
  highlight: number;
  highlightScale: number;
  dim: string;
  accent: string;
  opacity: number;
}> = ({ cell, highlight, highlightScale, dim, accent, opacity }) => {
  const gx = 0.225;
  const gy = 0.215;
  return (
    <group position={[0, -0.12, 0]}>
      {Array.from({ length: COLS * ROWS }, (_, i) => {
        const c = i % COLS;
        const r = Math.floor(i / COLS);
        const hi = i === highlight;
        return (
          <mesh
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed day grid
            key={i}
            geometry={cell}
            position={[(c - (COLS - 1) / 2) * gx, ((ROWS - 1) / 2 - r) * gy, hi ? 0.006 : 0]}
            scale={hi ? highlightScale : 1}
          >
            <Clay
              color={hi ? accent : dim}
              {...(hi ? { emissive: accent, emissiveIntensity: 0.25 } : {})}
              opacity={opacity}
            />
          </mesh>
        );
      })}
    </group>
  );
};

const Calendar: React.FC<HeroPropProps> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const block = useMemo(() => new RoundedBoxGeometry(PAGE_W + 0.04, PAGE_H, 0.42, 4, 0.06), []);
  const page = useMemo(() => new RoundedBoxGeometry(PAGE_W, PAGE_H, 0.025, 2, 0.012), []);
  const header = useMemo(() => new RoundedBoxGeometry(PAGE_W + 0.12, 0.44, 0.5, 4, 0.12), []);
  const base = useMemo(() => new RoundedBoxGeometry(2.2, 0.16, 0.8, 4, 0.07), []);
  const cell = useMemo(() => roundedRectGeometry(0.15, 0.15, 0.045), []);
  const bar = useMemo(() => roundedRectGeometry(0.9, 0.09, 0.045), []);

  const flipAt = at + CALENDAR_FLIP_SEC;
  // Peel (anticipation) → fast flip over the top, passing the midpoint on the impact.
  const peel = ramp(t, flipAt - 0.3, 0.12) * 0.18;
  const swing = easeInOut((t - (flipAt - 0.2)) / 0.42);
  const angle = -(peel + swing * (Math.PI + 0.25 - 0.18));
  const pageFade = 1 - ramp(t, flipAt + 0.08, 0.14);
  const nextPop = useSpringAt(flipAt, 220, 12, 0.7);
  const jolt = wobble(t, flipAt, 16, 6);

  const pageTop = PAGE_H / 2 - 0.02;
  const frontZ = 0.23;
  const dim = mixHex(S.paper, S.paperText, 0.18);

  return (
    <group position={[0, -0.12, 0]} rotation={[-0.1, 0, 0]}>
      <group position={[0, jolt * 0.02, 0]}>
        <mesh geometry={base} position={[0, -PAGE_H / 2 - 0.1, 0.02]}>
          <Clay color={S.clay[2]} />
        </mesh>
        {/* Page block */}
        <mesh geometry={block}>
          <Clay color={mixHex(S.paper, S.clay[1], 0.35)} />
        </mesh>
        {/* Next page (revealed) */}
        <group position={[0, 0, 0.212]}>
          <mesh geometry={page}>
            <Clay color={S.paper} />
          </mesh>
          <mesh geometry={bar} position={[0, 0.4, 0.014]}>
            <Clay color={dim} />
          </mesh>
          <group position={[0, 0, 0.014]}>
            <DayGrid
              cell={cell}
              highlight={TODAY + 1}
              highlightScale={t >= flipAt ? 0.4 + Math.min(1.2, nextPop) * 0.6 : 0.4}
              dim={dim}
              accent={S.accent}
              opacity={1}
            />
          </group>
        </group>
        {/* Top page, hinged at the rings */}
        {pageFade > 0.01 ? (
          <group position={[0, pageTop, frontZ + 0.01]} rotation={[angle, 0, 0]}>
            <group position={[0, -PAGE_H / 2 + 0.02, 0]}>
              <mesh geometry={page}>
                <Clay color={S.paper} opacity={pageFade} />
              </mesh>
              <mesh geometry={bar} position={[0, 0.4, 0.014]}>
                <Clay color={dim} opacity={pageFade} />
              </mesh>
              <group position={[0, 0, 0.014]}>
                <DayGrid
                  cell={cell}
                  highlight={TODAY}
                  highlightScale={1}
                  dim={dim}
                  accent={S.accent}
                  opacity={pageFade}
                />
              </group>
            </group>
          </group>
        ) : null}
        {/* Header strip + ring binders */}
        <mesh geometry={header} position={[0, PAGE_H / 2 + 0.16, 0]}>
          <Clay color={S.accent} roughness={0.5} />
        </mesh>
        {[-0.5, 0.5].map((x) => (
          <group key={x} position={[x, PAGE_H / 2 + 0.02, 0.1]}>
            <mesh rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[0.2, 0.045, 10, 28, Math.PI * 1.25]} />
              <Clay color={mixHex(S.paper, S.clay[1], 0.3)} roughness={0.4} metalness={0.15} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
};

export const TIME_PROPS = {
  hourglass: { Model: Hourglass, yaw: HOURGLASS_YAW, framing: { scale: 1.08, y: 0.06 } },
  stopwatch: { Model: Stopwatch, yaw: -0.3, framing: { scale: 1.02, y: 0.08 } },
  calendar: { Model: Calendar, yaw: -0.32, framing: { scale: 1.02, y: 0.04 } },
} satisfies Record<'hourglass' | 'stopwatch' | 'calendar', HeroPropDef>;
