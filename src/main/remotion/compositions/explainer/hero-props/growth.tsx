/**
 * Hero props: sprout, mountain, dice, puzzle (real clay models) and gears,
 * key, door (still placeholders). Each prop's signature motion peaks exactly
 * `impactSec` after `at` (hero-catalog.ts) so burst, push and sound line up.
 */

import type React from 'react';
import { useMemo } from 'react';
import { type BufferGeometry, ConeGeometry, ExtrudeGeometry, Shape } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HERO_CATALOG } from '../hero-catalog';
import { Clay, type HeroPropDef, type HeroPropProps, lathe, wobble } from '../hero-kit';
import { mixHex } from '../palette';
import { useSceneTime, useStage } from '../stage';

/** Same timing as `impactSec` for these props in ../hero-catalog.ts. */
const SPROUT_IMPACT_SEC = HERO_CATALOG.sprout.impactSec;
const MOUNTAIN_IMPACT_SEC = HERO_CATALOG.mountain.impactSec;
const DICE_IMPACT_SEC = HERO_CATALOG.dice.impactSec;
const PUZZLE_IMPACT_SEC = HERO_CATALOG.puzzle.impactSec;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Linear progress 0→1 over [start, start+dur]. */
function lin(t: number, start: number, dur: number): number {
  return clamp01((t - start) / dur);
}

/** Smooth ease-in-out. */
function smooth(p: number): number {
  return p * p * (3 - 2 * p);
}

/** Ease-out cubic. */
function easeOut(p: number): number {
  return 1 - (1 - p) ** 3;
}

// ---------------------------------------------------------------------------
// Sprout — clay pot with soil; the stem grows and two leaves unfurl.
// ---------------------------------------------------------------------------

const SOIL_Y = -0.2;

const Leaf: React.FC<{ side: 1 | -1; open: number; color: string; vein: string }> = ({
  side,
  open,
  color,
  vein,
}) => {
  // Folded: pointing up along the stem. Open: reaching out, slightly raised.
  const angle = side * (1.45 - 1.1 * open);
  const s = 0.35 + 0.65 * Math.min(1.08, open);
  return (
    <group rotation={[0, 0, -angle]} scale={[s, s, s]}>
      <group position={[side * 0.47, 0, 0]} rotation={[side * 0.35, 0, 0]}>
        <mesh scale={[0.5, 0.085, 0.27]}>
          <sphereGeometry args={[1, 28, 16]} />
          <Clay color={color} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.06, 0]} scale={[0.4, 0.014, 0.02]}>
          <sphereGeometry args={[1, 12, 8]} />
          <Clay color={vein} />
        </mesh>
      </group>
    </group>
  );
};

const Sprout: React.FC<HeroPropProps> = ({ at }) => {
  const { t } = useSceneTime();
  const impact = at + SPROUT_IMPACT_SEC;
  const grow = easeOut(lin(t, at, SPROUT_IMPACT_SEC));
  const open = smooth(lin(t, at + 0.25, SPROUT_IMPACT_SEC - 0.25)) + wobble(t, impact, 9, 4) * 0.14;
  const sway = wobble(t, impact, 7, 3) * 0.08 + Math.sin(t * 1.6) * 0.02 * grow;
  return <SproutRig grow={grow} open={open} sway={sway} />;
};

export const SproutRig: React.FC<{ grow: number; open: number; sway?: number }> = ({
  grow,
  open,
  sway = 0,
}) => {
  const S = useStage();
  const pot = useMemo(
    () =>
      lathe(
        [
          [0, -1.05],
          [0.46, -1.05],
          [0.52, -1.0],
          [0.62, -0.36],
          [0.72, -0.34],
          [0.76, -0.26],
          [0.74, -0.14],
          [0.66, -0.12],
          [0.62, -0.16],
          [0.6, -0.24],
          [0, -0.24],
        ],
        48,
      ),
    [],
  );
  const stemH = 0.22 + 0.9 * grow;
  const green = S.positive;
  const stemColor = mixHex(S.positive, S.clay[2], 0.3);
  const vein = mixHex(S.positive, S.paper, 0.35);
  return (
    <group position={[0, -0.05, 0]}>
      <mesh geometry={pot}>
        <Clay color={S.clay[0]} />
      </mesh>
      {/* Pot band */}
      <mesh position={[0, -0.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.73, 0.05, 12, 48]} />
        <Clay color={mixHex(S.clay[0], S.clay[1], 0.5)} />
      </mesh>
      {/* Soil mound */}
      <mesh position={[0, SOIL_Y, 0]} scale={[0.62, 0.09, 0.62]}>
        <sphereGeometry args={[1, 32, 12]} />
        <Clay color={mixHex(S.clay[2], S.bgOuter, 0.55)} roughness={0.8} />
      </mesh>
      <group position={[0, SOIL_Y + 0.04, 0]} rotation={[0, 0, sway]}>
        <mesh position={[0, stemH / 2, 0]}>
          <cylinderGeometry args={[0.055, 0.075, stemH, 14]} />
          <Clay color={stemColor} />
        </mesh>
        <group position={[0, stemH, 0]}>
          <mesh>
            <sphereGeometry args={[0.07, 16, 12]} />
            <Clay color={stemColor} />
          </mesh>
          <Leaf side={1} open={open} color={green} vein={vein} />
          <group rotation={[0, 0.25, 0]}>
            <Leaf side={-1} open={open} color={green} vein={vein} />
          </group>
        </group>
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Mountain — low-poly peaks with snow caps; a flag plants on the summit.
// ---------------------------------------------------------------------------

function facetedCone(r: number, h: number, seg: number): BufferGeometry {
  const g = new ConeGeometry(r, h, seg, 1).toNonIndexed();
  g.computeVertexNormals();
  return g;
}

interface PeakDims {
  r: number;
  h: number;
  capH: number;
}

const Peak: React.FC<PeakDims & { rock: string; snow: string }> = ({ r, h, capH, rock, snow }) => {
  const body = useMemo(() => facetedCone(r, h, 7), [r, h]);
  const capR = (r * capH) / h;
  const cap = useMemo(() => facetedCone(capR * 1.08, capH * 1.08, 7), [capR, capH]);
  return (
    <group>
      <mesh geometry={body} position={[0, h / 2, 0]}>
        <Clay color={rock} roughness={0.6} />
      </mesh>
      <mesh geometry={cap} position={[0, h - (capH * 1.08) / 2 + 0.015, 0]}>
        <Clay color={snow} roughness={0.5} />
      </mesh>
    </group>
  );
};

const MAIN_PEAK: PeakDims = { r: 1.05, h: 1.75, capH: 0.55 };
const SIDE_PEAK: PeakDims = { r: 0.72, h: 1.05, capH: 0.36 };
const BASE_Y = -1.05;

const Mountain: React.FC<HeroPropProps> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const impact = at + MOUNTAIN_IMPACT_SEC;
  // Flag drops from above and plants into the summit exactly at impact.
  const fall = lin(t, at + 0.2, MOUNTAIN_IMPACT_SEC - 0.2);
  const drop = (1 - fall * fall) * 0.75;
  const visible = t >= at + 0.2;
  const jolt = t >= impact ? Math.abs(wobble(t, impact, 16, 7)) * 0.03 : 0;
  const settled = lin(t, impact, 0.4);
  const wave = wobble(t, impact, 12, 4) * 0.35 + Math.sin((t - impact) * 5) * 0.12 * settled;
  const apexY = BASE_Y + MAIN_PEAK.h;
  const poleH = 0.78;
  return (
    <group position={[0, -0.12, 0]}>
      <group scale={[1 + jolt, 1 - jolt, 1 + jolt]} position={[0, BASE_Y * jolt, 0]}>
        <group position={[-0.22, BASE_Y, 0]}>
          <Peak {...MAIN_PEAK} rock={S.clay[1]} snow={S.paper} />
        </group>
        <group position={[0.78, BASE_Y, -0.38]} rotation={[0, 0.5, 0]}>
          <Peak {...SIDE_PEAK} rock={mixHex(S.clay[1], S.clay[2], 0.45)} snow={S.paper} />
        </group>
      </group>
      {visible && (
        <group position={[-0.22, apexY - 0.1 + drop, 0]} rotation={[0, 0, -0.04]}>
          <mesh position={[0, poleH / 2, 0]}>
            <cylinderGeometry args={[0.026, 0.026, poleH, 12]} />
            <Clay color={mixHex(S.paper, S.clay[2], 0.3)} />
          </mesh>
          <mesh position={[0, poleH + 0.03, 0]}>
            <sphereGeometry args={[0.05, 14, 10]} />
            <Clay color={S.paper} />
          </mesh>
          <group position={[0, poleH - 0.16, 0]} rotation={[0, wave, 0]}>
            <mesh position={[0.24, 0, 0]} rotation={[0, 0, 0]}>
              <boxGeometry args={[0.46, 0.28, 0.03]} />
              <Clay color={S.accent} emissive={S.accent} emissiveIntensity={0.12} />
            </mesh>
          </group>
        </group>
      )}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Dice — two rounded cubes tumble in and land showing a six on top.
// ---------------------------------------------------------------------------

const DIE = 0.8;
const PIP_D = 0.19;
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-PIP_D, -PIP_D],
    [PIP_D, PIP_D],
  ],
  3: [
    [-PIP_D, -PIP_D],
    [0, 0],
    [PIP_D, PIP_D],
  ],
  4: [
    [-PIP_D, -PIP_D],
    [PIP_D, -PIP_D],
    [-PIP_D, PIP_D],
    [PIP_D, PIP_D],
  ],
  5: [
    [-PIP_D, -PIP_D],
    [PIP_D, -PIP_D],
    [0, 0],
    [-PIP_D, PIP_D],
    [PIP_D, PIP_D],
  ],
  6: [
    [-PIP_D, -PIP_D],
    [-PIP_D, 0],
    [-PIP_D, PIP_D],
    [PIP_D, -PIP_D],
    [PIP_D, 0],
    [PIP_D, PIP_D],
  ],
};
/** Face value → rotation turning local +Z onto that face's normal (opposites sum to 7). */
const FACES: [number, [number, number, number]][] = [
  [6, [-Math.PI / 2, 0, 0]],
  [1, [Math.PI / 2, 0, 0]],
  [2, [0, 0, 0]],
  [5, [0, Math.PI, 0]],
  [3, [0, Math.PI / 2, 0]],
  [4, [0, -Math.PI / 2, 0]],
];

const Die: React.FC<{ body: BufferGeometry; color: string; pip: string }> = ({
  body,
  color,
  pip,
}) => (
  <group>
    <mesh geometry={body}>
      <Clay color={color} roughness={0.5} />
    </mesh>
    {FACES.map(([value, rot]) => (
      <group key={value} rotation={rot}>
        {(PIPS[value] ?? []).map(([u, v]) => (
          <mesh key={`${u},${v}`} position={[u, v, DIE / 2 + 0.002]} scale={[1, 1, 0.3]}>
            <sphereGeometry args={[0.07, 16, 10]} />
            <Clay color={pip} roughness={0.6} />
          </mesh>
        ))}
      </group>
    ))}
  </group>
);

interface DieThrow {
  x: number;
  z: number;
  yaw: number;
  fromX: number;
  spin: [number, number, number];
}

const THROWS: DieThrow[] = [
  { x: -0.5, z: 0.12, yaw: 0.35, fromX: -0.7, spin: [5.2, 2.1, 3.4] },
  { x: 0.55, z: -0.22, yaw: -0.55, fromX: 0.7, spin: [-4.1, -2.6, 4.8] },
];

const Dice: React.FC<HeroPropProps> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const body = useMemo(() => new RoundedBoxGeometry(DIE, DIE, DIE, 5, 0.13), []);
  const impact = at + DICE_IMPACT_SEC;
  const p = lin(t, at, DICE_IMPACT_SEC);
  const restY = -0.95 + DIE / 2;
  const pip = mixHex(S.clay[2], S.bgOuter, 0.6);
  const colors = [mixHex(S.paper, S.clay[0], 0.12), S.accent];
  return (
    <group position={[0, 0.05, 0]} rotation={[0.38, 0, 0]}>
      {THROWS.map((th, i) => {
        const bounce = Math.abs(wobble(t, impact + i * 0.02, 11, 5.5)) * 0.2;
        const tilt = wobble(t, impact, 11, 5.5) * 0.06;
        const y = restY + (1 - p * p) * 1.5 + bounce;
        const x = th.x + (1 - easeOut(p)) * th.fromX;
        const r = 1 - easeOut(p);
        return (
          <group
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed pair
            key={i}
            position={[x, y, th.z]}
            rotation={[th.spin[0] * r + tilt, th.yaw + th.spin[1] * r, th.spin[2] * r - tilt]}
          >
            <Die body={body} color={colors[i] ?? S.paper} pip={i === 1 ? S.paper : pip} />
          </group>
        );
      })}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Puzzle — 2×2 jigsaw, the missing accent piece slides in and snaps down.
// ---------------------------------------------------------------------------

/** Edge profile: 1 tab (out), -1 blank (in), 0 flat. Order: bottom, right, top, left. */
type Edges = [number, number, number, number];

const HALF = 0.49;
const TAB_R = 0.16;
const PIECE_DEPTH = 0.2;

function pieceShape(edges: Edges): Shape {
  const h = HALF;
  const corners: [number, number][] = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ];
  const s = new Shape();
  s.moveTo(-h, -h);
  for (let i = 0; i < 4; i++) {
    const a = corners[i] ?? [0, 0];
    const b = corners[(i + 1) % 4] ?? [0, 0];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const e = edges[i] ?? 0;
    if (e !== 0) {
      const start = Math.atan2(a[1] - my, a[0] - mx);
      const r = e > 0 ? TAB_R : TAB_R + 0.012;
      s.lineTo(mx + Math.cos(start) * r, my + Math.sin(start) * r);
      if (e > 0) s.absarc(mx, my, r, start, start + Math.PI, false);
      else s.absarc(mx, my, r, start, start - Math.PI, true);
    }
    s.lineTo(b[0], b[1]);
  }
  return s;
}

function pieceGeometry(edges: Edges): ExtrudeGeometry {
  const g = new ExtrudeGeometry(pieceShape(edges), {
    depth: PIECE_DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.035,
    bevelSegments: 3,
    curveSegments: 16,
  });
  g.translate(0, 0, -PIECE_DEPTH / 2);
  return g;
}

/** TL, BL, BR fixed; TR is the missing accent piece. */
const PIECES: { key: string; x: number; y: number; edges: Edges }[] = [
  { key: 'tl', x: -0.5, y: 0.5, edges: [-1, 1, 0, 0] },
  { key: 'bl', x: -0.5, y: -0.5, edges: [0, -1, 1, 0] },
  { key: 'br', x: 0.5, y: -0.5, edges: [0, 0, -1, 1] },
];
const MISSING_EDGES: Edges = [1, 0, 0, -1];

const Puzzle: React.FC<HeroPropProps> = ({ at }) => {
  const { t } = useSceneTime();
  const impact = at + PUZZLE_IMPACT_SEC;
  const slide = easeOut(lin(t, at, PUZZLE_IMPACT_SEC - 0.15));
  const dropP = lin(t, impact - 0.13, 0.13);
  const lift = (0.95 - 0.55 * slide) * (1 - dropP * dropP);
  const jolt = wobble(t, impact, 16, 7) * 0.05;
  return <PuzzleRig slide={slide} lift={lift} jolt={jolt} />;
};

export const PuzzleRig: React.FC<{ slide: number; lift: number; jolt?: number }> = ({
  slide,
  lift,
  jolt = 0,
}) => {
  const S = useStage();
  const geos = useMemo(() => PIECES.map((p) => pieceGeometry(p.edges)), []);
  const missing = useMemo(() => pieceGeometry(MISSING_EDGES), []);
  const colors = [S.clay[0], S.clay[1], mixHex(S.clay[0], S.clay[1], 0.5)];
  return (
    <group position={[0, -0.05, 0]} rotation={[-0.95, 0, 0]}>
      <group scale={[1, 1, 1 - Math.abs(jolt)]}>
        {PIECES.map((p, i) => (
          <mesh key={p.key} geometry={geos[i]} position={[p.x, p.y, 0]}>
            <Clay color={colors[i] ?? S.clay[0]} />
          </mesh>
        ))}
      </group>
      <mesh
        geometry={missing}
        position={[0.5 + (1 - slide) * 0.75, 0.5 + (1 - slide) * 0.45, lift]}
        rotation={[0, 0, (1 - slide) * 0.45]}
      >
        <Clay color={S.accent} emissive={S.accent} emissiveIntensity={0.12} />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------------------

export const GROWTH_PROPS = {
  sprout: { Model: Sprout, yaw: 0.3, framing: { scale: 1.15, y: 0.02 } },
  mountain: { Model: Mountain, yaw: 0.25, framing: { scale: 1.0, y: 0.04 } },
  dice: { Model: Dice, yaw: 0.2, framing: { scale: 1.1, y: 0.1 } },
  puzzle: { Model: Puzzle, yaw: 0.2, framing: { scale: 1.1, y: 0.02 } },
} satisfies Record<'sprout' | 'mountain' | 'dice' | 'puzzle', HeroPropDef>;
