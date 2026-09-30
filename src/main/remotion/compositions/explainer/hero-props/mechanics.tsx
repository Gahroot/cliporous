/**
 * Hero props: gears, key, door — soft-clay mechanics.
 *  - gears: three meshing extruded gears that spin up (counter-rotating,
 *    speed ∝ 1/teeth) on the impact.
 *  - key: key slides into a keyhole plate and turns 90° with a click jolt.
 *  - door: door swings open on its hinge and warm light spills out.
 */

import type React from 'react';
import { useMemo } from 'react';
import { ExtrudeGeometry, Path, Shape } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HERO_CATALOG } from '../hero-catalog';
import {
  Clay,
  type HeroPropDef,
  type HeroPropProps,
  roundedRectGeometry,
  roundedRectShape,
  useSpringAt,
  wobble,
} from '../hero-kit';
import { mixHex } from '../palette';
import { ramp, useSceneTime, useStage } from '../stage';

const GEARS_IMPACT_SEC = HERO_CATALOG.gears.impactSec;
const KEY_IMPACT_SEC = HERO_CATALOG.key.impactSec;
const DOOR_IMPACT_SEC = HERO_CATALOG.door.impactSec;

function extrude(shape: Shape, depth: number, bevel = 0.03): ExtrudeGeometry {
  const g = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 3,
    curveSegments: 16,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

function circlePath(x: number, y: number, r: number): Path {
  const p = new Path();
  p.absarc(x, y, r, 0, Math.PI * 2, true);
  return p;
}

// ---------------------------------------------------------------------------
// Gears
// ---------------------------------------------------------------------------

/** Gear module: pitch radius = MODULE * teeth / 2 (meshing gears share tooth size). */
const MODULE = 0.08;

export function gearShape(teeth: number, holeR: number, windows: number): Shape {
  const r = (MODULE * teeth) / 2;
  const rTip = r + MODULE;
  const rRoot = r - MODULE * 1.2;
  const p = (Math.PI * 2) / teeth;
  const s = new Shape();
  for (let k = 0; k < teeth; k++) {
    const c = k * p;
    const pts: [number, number][] = [
      [rRoot, c - p * 0.3],
      [rTip, c - p * 0.15],
      [rTip, c + p * 0.15],
      [rRoot, c + p * 0.3],
    ];
    pts.forEach(([rad, a], i) => {
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (k === 0 && i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    });
  }
  s.closePath();
  s.holes.push(circlePath(0, 0, holeR));
  for (let i = 0; i < windows; i++) {
    const a = (i / windows) * Math.PI * 2 + Math.PI / windows;
    const d = (holeR + rRoot) / 2;
    s.holes.push(circlePath(Math.cos(a) * d, Math.sin(a) * d, (rRoot - holeR) * 0.3));
  }
  return s;
}

interface GearSpec {
  teeth: number;
  /** Mesh direction from the driver gear (radians); the driver itself has none. */
  dir?: number;
  holeR: number;
  windows: number;
}

const GEAR_SPECS: readonly GearSpec[] = [
  { teeth: 16, holeR: 0.13, windows: 5 },
  { teeth: 10, dir: -0.38, holeR: 0.09, windows: 0 },
  { teeth: 8, dir: 2.45, holeR: 0.08, windows: 0 },
];

const Gears: React.FC<HeroPropProps> = ({ at }) => {
  const { t } = useSceneTime();
  const impact = at + GEARS_IMPACT_SEC;
  // Driver angle: eased-in spin-up from rest (quadratic ramp into constant speed).
  const omega = 1.5;
  const rampT = 0.7;
  const k = Math.max(0, t - impact);
  const a1 = k < rampT ? (omega * k * k) / (2 * rampT) : omega * (k - rampT / 2);
  const jolt = wobble(t, impact, 16, 7);
  return <GearsRig a1={a1} jolt={jolt} />;
};

/** Pose-only extraction; the standalone wrapper retains its original timing. */
export const GearsRig: React.FC<{ a1: number; jolt?: number }> = ({ a1, jolt = 0 }) => {
  const S = useStage();
  const geoms = useMemo(
    () => GEAR_SPECS.map((g) => extrude(gearShape(g.teeth, g.holeR, g.windows), 0.2, 0.035)),
    [],
  );
  const n1 = GEAR_SPECS[0].teeth;
  const r1 = (MODULE * n1) / 2;
  const colors = [S.clay[0], S.accent, S.clay[1]];
  return (
    <group position={[-0.12, 0.02, 0]} scale={1 + jolt * 0.03}>
      {GEAR_SPECS.map((g, i) => {
        const r = (MODULE * g.teeth) / 2;
        const hub = g.holeR * 0.95;
        let x = 0;
        let y = 0;
        let rot = a1;
        if (g.dir !== undefined) {
          const d = r1 + r;
          x = Math.cos(g.dir) * d;
          y = Math.sin(g.dir) * d;
          // Driver tooth faces `dir` when a1 = dir; the follower's gap faces it back.
          const rot0 = g.dir + Math.PI - Math.PI / g.teeth;
          rot = rot0 - (n1 / g.teeth) * (a1 - g.dir);
        }
        return (
          <group key={g.teeth} position={[x, y, 0]}>
            <mesh geometry={geoms[i]} rotation={[0, 0, rot]}>
              <Clay color={colors[i]} roughness={0.5} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[hub, hub, 0.34, 20]} />
              <Clay color={mixHex(S.paper, S.clay[2], 0.2)} roughness={0.45} />
            </mesh>
            <mesh position={[0, 0, 0.17]}>
              <sphereGeometry args={[hub * 0.7, 16, 12]} />
              <Clay color={mixHex(S.paper, S.clay[2], 0.35)} roughness={0.45} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Key
// ---------------------------------------------------------------------------

/** Keyhole circle centre on the plate. */
const KH_Y = 0.2;

function keyholePlateShape(): Shape {
  const s = roundedRectShape(1.3, 1.7, 0.32);
  const hole = new Path();
  const r = 0.17;
  const top = Math.atan2(-0.12, 0.075);
  hole.moveTo(-0.11, KH_Y - 0.55);
  hole.lineTo(0.11, KH_Y - 0.55);
  hole.lineTo(Math.cos(top) * r, KH_Y + Math.sin(top) * r);
  hole.absarc(0, KH_Y, r, top, Math.PI - top, false);
  hole.lineTo(-0.11, KH_Y - 0.55);
  s.holes.push(hole);
  return s;
}

const Key: React.FC<HeroPropProps> = ({ at }) => {
  const { t } = useSceneTime();
  const impact = at + KEY_IMPACT_SEC;
  // Slide in, then a quick 90° turn that lands exactly on the impact.
  const slide = ramp(t, at + 0.02, KEY_IMPACT_SEC - 0.16);
  const turnP = ramp(t, impact - 0.14, 0.14);
  const turn = turnP * turnP * (Math.PI / 2) + wobble(t, impact, 26, 9) * 0.1;
  const click = wobble(t, impact, 30, 10);
  const lit = ramp(t, impact, 0.3);
  return <KeyRig slide={slide} turn={turn} click={click} lit={lit} />;
};

export interface KeyRigProps {
  slide: number;
  turn: number;
  click?: number;
  lit?: number;
}
export const KeyRig: React.FC<KeyRigProps> = ({ slide, turn, click = 0, lit = 0 }) => {
  const S = useStage();
  const plate = useMemo(() => extrude(keyholePlateShape(), 0.2, 0.05), []);
  const backing = useMemo(() => roundedRectGeometry(0.6, 0.95, 0.2), []);
  const metal = mixHex(S.paper, S.accent2, 0.3);
  const hole = mixHex(S.clay[2], S.bgOuter, 0.45);
  const tipZ = -0.06 + (1 - slide) * 0.85;
  return (
    <group position={[0, -0.05, -0.45]}>
      <group scale={[1 + click * 0.02, 1 - click * 0.02, 1]}>
        <mesh geometry={plate}>
          <Clay color={S.clay[0]} />
        </mesh>
        <mesh geometry={backing} position={[0, KH_Y - 0.2, -0.13]}>
          <Clay color={hole} emissive={S.accent} emissiveIntensity={lit * 0.6} />
        </mesh>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sy) => (
            <mesh key={`${sx}${sy}`} position={[sx * 0.46, sy * 0.66, 0.14]}>
              <sphereGeometry args={[0.055, 14, 10]} />
              <Clay color={mixHex(S.paper, S.clay[1], 0.4)} />
            </mesh>
          )),
        )}
      </group>
      {/* Key: tip at local z=0, bow toward +z; turns around its shaft (z axis). */}
      <group position={[0, KH_Y, tipZ]} rotation={[0, 0, -turn]}>
        <mesh position={[0, 0, 0.48]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.065, 0.065, 0.96, 18]} />
          <Clay color={metal} roughness={0.4} metalness={0.15} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.065, 16, 12]} />
          <Clay color={metal} roughness={0.4} metalness={0.15} />
        </mesh>
        {[
          [0.12, 0.2],
          [0.26, 0.13],
          [0.4, 0.22],
        ].map(([z, h]) => (
          <mesh key={z} position={[0, -h / 2, z]}>
            <boxGeometry args={[0.07, h, 0.1]} />
            <Clay color={metal} roughness={0.4} metalness={0.15} />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.98]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.11, 0.11, 0.1, 18]} />
          <Clay color={metal} roughness={0.4} metalness={0.15} />
        </mesh>
        <mesh position={[0, 0, 1.3]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.24, 0.085, 16, 36]} />
          <Clay color={metal} roughness={0.4} metalness={0.15} />
        </mesh>
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Door
// ---------------------------------------------------------------------------

const WALL_W = 2.0;
const WALL_H = 2.3;
const OPEN_W = 1.0;
const OPEN_H = 1.72;
const OPEN_BOTTOM = -WALL_H / 2 + 0.12;
const OPEN_CY = OPEN_BOTTOM + OPEN_H / 2;

function wallShape(): Shape {
  const s = roundedRectShape(WALL_W, WALL_H, 0.2);
  const h = new Path();
  const x0 = -OPEN_W / 2;
  const x1 = OPEN_W / 2;
  const y0 = OPEN_BOTTOM;
  const y1 = OPEN_BOTTOM + OPEN_H;
  const r = 0.08;
  h.moveTo(x0, y0);
  h.lineTo(x1, y0);
  h.lineTo(x1, y1 - r);
  h.quadraticCurveTo(x1, y1, x1 - r, y1);
  h.lineTo(x0 + r, y1);
  h.quadraticCurveTo(x0, y1, x0, y1 - r);
  h.lineTo(x0, y0);
  s.holes.push(h);
  return s;
}

function spillShape(): Shape {
  const s = new Shape();
  s.moveTo(-OPEN_W / 2, 0);
  s.lineTo(OPEN_W / 2, 0);
  s.lineTo(OPEN_W * 0.95, 1.25);
  s.lineTo(-OPEN_W * 0.2, 1.25);
  s.closePath();
  return s;
}

const Door: React.FC<HeroPropProps> = ({ at }) => {
  const impact = at + DOOR_IMPACT_SEC;
  const open = useSpringAt(impact - 0.15, 170, 14, 0.7);
  return <DoorRig open={open} />;
};

/** Children are attached to the slab, so a seated key moves with the door hinge. */
export const DoorRig: React.FC<{ open: number; children?: React.ReactNode }> = ({
  open,
  children,
}) => {
  const S = useStage();
  const wall = useMemo(() => extrude(wallShape(), 0.3, 0.05), []);
  const slab = useMemo(
    () => new RoundedBoxGeometry(OPEN_W - 0.05, OPEN_H - 0.04, 0.09, 3, 0.03),
    [],
  );
  const panel = useMemo(() => new RoundedBoxGeometry(0.62, 0.62, 0.04, 2, 0.02), []);
  const light = useMemo(() => roundedRectGeometry(OPEN_W, OPEN_H, 0.04), []);
  const spillShapeGeo = useMemo(
    () => new ExtrudeGeometry(spillShape(), { depth: 0.001, bevelEnabled: false }),
    [],
  );
  const glow = Math.min(1, Math.max(0, open * 1.3));
  const warm = mixHex(S.accent2, S.paper, 0.5);
  const hingeX = -OPEN_W / 2 + 0.02;
  return (
    <group position={[0, 0.05, 0]}>
      <mesh geometry={wall}>
        <Clay color={S.clay[1]} />
      </mesh>
      {/* Warm light filling the opening (behind the door). */}
      <mesh geometry={light} position={[0, OPEN_CY, -0.1]}>
        <Clay color={warm} emissive={warm} emissiveIntensity={0.1 + glow * 0.55} />
      </mesh>
      {/* Light spilling onto the floor in front of the doorway. */}
      <mesh
        geometry={spillShapeGeo}
        position={[0, -WALL_H / 2 + 0.005, 0.18]}
        rotation={[Math.PI / 2, 0, 0]}
        visible={glow > 0.01}
      >
        <meshBasicMaterial color={warm} transparent opacity={glow * 0.55} depthWrite={false} />
      </mesh>
      {/* Door hinged on its left edge, swinging toward the viewer. */}
      <group position={[hingeX, OPEN_CY, 0.06]} rotation={[0, -open * 1.45, 0]}>
        <group position={[(OPEN_W - 0.05) / 2, 0, 0]}>
          <mesh geometry={slab}>
            <Clay color={S.clay[0]} />
          </mesh>
          {[0.36, -0.36].map((y) => (
            <mesh key={y} geometry={panel} position={[0, y, 0.05]}>
              <Clay color={mixHex(S.clay[0], S.paper, 0.18)} />
            </mesh>
          ))}
          {[1, -1].map((side) => (
            <mesh key={side} position={[0.34, -0.04, side * 0.075]}>
              <sphereGeometry args={[0.065, 18, 14]} />
              <Clay color={S.accent} roughness={0.35} metalness={0.2} />
            </mesh>
          ))}
          {children}
        </group>
      </group>
    </group>
  );
};

export const MECHANICS_PROPS = {
  gears: { Model: Gears, yaw: -0.3, framing: { scale: 1.1, y: 0.04 } },
  key: { Model: Key, yaw: 0.75, framing: { scale: 1.05, y: 0.04 } },
  door: { Model: Door, yaw: -0.42, framing: { scale: 1.0, y: 0.02 } },
} satisfies Record<'gears' | 'key' | 'door', HeroPropDef>;
