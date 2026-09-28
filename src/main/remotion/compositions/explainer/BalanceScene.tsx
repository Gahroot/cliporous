/**
 * Balance scene (3D) — a classic clay balance scale: round base, slim pillar,
 * a beam pivoting on top and two shallow pans hanging on three strings each.
 * The pans always hang level while the beam rotates.
 *
 *  - `left.at` / `right.at`: a clay block drops onto that pan (lands 0.3 s
 *    later on the tick cue), squashes and bounces; the pan dips and the beam
 *    gives a small jolt. The label pill hangs under the pan (tracked with
 *    `projectToStage`).
 *  - `tipAt`: the beam tips toward `heavier` and thumps to rest at
 *    `tipAt + BALANCE_SETTLE_SEC`; for 'even' it wobbles and settles level.
 *    The heavier block (both for 'even') glows accent.
 *
 * Reactions: 0 = left, 1 = right.
 */

import type React from 'react';
import { useMemo } from 'react';
import { Easing, interpolate } from 'remotion';
import { Quaternion, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Clay, lathe, wobble } from './hero-kit';
import {
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
import type { BalanceScene as BalanceSceneData } from './types';

/** Same timing as BALANCE_SETTLE_SEC in src/main/ai/explainer/kinds-3d-objects.ts (thump/pop cue). */
const BALANCE_SETTLE_SEC = 0.55;
/** Block fall time; the spec's tick cue fires at `at + 0.3`. */
const DROP_SEC = 0.3;
const DROP_H = 2.3;

const CAMERA: CameraSpec = { position: [0, 1.1, 10.8], fov: 30 };
const GROUND_Y = -2.1;
const PIVOT_Y = 1.55;
const ARM = 1.85;
const STRING = 2.1;
const PAN_R = 0.85;
const PAN_DEPTH = 0.16;
const TIP_RAD = 0.26;

type Side = 'left' | 'right';
type Vec3 = [number, number, number];

function blockSize(scene: BalanceSceneData, side: Side): number {
  if (scene.heavier === 'even') return 0.72;
  return scene.heavier === side ? 0.84 : 0.6;
}

function landAt(scene: BalanceSceneData, side: Side): number {
  return scene[side].at + DROP_SEC;
}

/** Beam angle (radians, +: left end down) as a pure function of t. */
function beamAngle(scene: BalanceSceneData, t: number): number {
  let a = 0;
  // Small jolts as each block lands.
  for (const side of ['left', 'right'] as const) {
    const k = t - landAt(scene, side);
    if (k >= 0 && t < scene.tipAt) {
      a += (side === 'left' ? 1 : -1) * 0.05 * Math.exp(-k * 3.5) * Math.cos(k * 9);
    }
  }
  const settle = scene.tipAt + BALANCE_SETTLE_SEC;
  if (t < scene.tipAt) return a;
  if (scene.heavier === 'even') {
    if (t < settle) {
      const u = (t - scene.tipAt) / BALANCE_SETTLE_SEC;
      return 0.13 * Math.sin(u * Math.PI * 2.5) * (1 - u);
    }
    return 0.014 * wobble(t, settle, 14, 5);
  }
  const target = scene.heavier === 'left' ? TIP_RAD : -TIP_RAD;
  if (t < settle) {
    const u = (t - scene.tipAt) / BALANCE_SETTLE_SEC;
    return target * Easing.bezier(0.45, 0, 0.8, 1)(u);
  }
  // Thump: the beam hits its stop and rebounds a touch.
  const k = t - settle;
  return target * (1 - 0.1 * Math.exp(-k * 6) * Math.abs(Math.sin(k * 12)));
}

function hangPoint(side: Side, angle: number): Vec3 {
  const s = side === 'left' ? -1 : 1;
  return [s * ARM * Math.cos(angle), PIVOT_Y + s * ARM * Math.sin(angle), 0];
}

/** Pan dip after its block lands (world units, negative = down). */
function panDip(scene: BalanceSceneData, side: Side, t: number): number {
  const k = t - landAt(scene, side);
  if (k < 0) return 0;
  return -0.1 * Math.exp(-k * 5) * Math.cos(k * 13);
}

const UP = new Vector3(0, 1, 0);

/** Thin cylinder from a to b. */
const Rod: React.FC<{ a: Vec3; b: Vec3; r: number; color: string }> = ({ a, b, r, color }) => {
  const va = new Vector3(...a);
  const dir = new Vector3(...b).sub(va);
  const len = dir.length();
  const q = new Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  const mid = va.add(dir.multiplyScalar(0.5));
  return (
    <mesh position={[mid.x, mid.y, mid.z]} quaternion={[q.x, q.y, q.z, q.w]}>
      <cylinderGeometry args={[r, r, len, 8]} />
      <Clay color={color} roughness={0.6} />
    </mesh>
  );
};

const Stand: React.FC = () => {
  const S = useStage();
  const base = useMemo(
    () =>
      lathe(
        [
          [0.001, 0],
          [1.05, 0],
          [1.08, 0.07],
          [1.0, 0.18],
          [0.55, 0.28],
          [0.2, 0.36],
          [0.001, 0.36],
        ],
        48,
      ),
    [],
  );
  const stand = S.clay[2];
  const pillarH = PIVOT_Y - (GROUND_Y + 0.3);
  return (
    <group>
      <mesh geometry={base} position={[0, GROUND_Y, 0]}>
        <Clay color={stand} />
      </mesh>
      <mesh position={[0, GROUND_Y + 0.3 + pillarH / 2, 0]}>
        <cylinderGeometry args={[0.09, 0.13, pillarH, 24]} />
        <Clay color={mixHex(stand, S.paper, 0.12)} />
      </mesh>
      {/* Collar under the pivot. */}
      <mesh position={[0, PIVOT_Y - 0.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.13, 0.05, 10, 28]} />
        <Clay color={mixHex(stand, S.paper, 0.3)} />
      </mesh>
    </group>
  );
};

const Beam: React.FC<{ angle: number }> = ({ angle }) => {
  const S = useStage();
  const geom = useMemo(() => new RoundedBoxGeometry(ARM * 2 + 0.3, 0.16, 0.2, 3, 0.07), []);
  const beam = mixHex(S.clay[2], S.paper, 0.25);
  return (
    <group position={[0, PIVOT_Y, 0]} rotation={[0, 0, angle]}>
      <mesh geometry={geom}>
        <Clay color={beam} />
      </mesh>
      {/* Pivot hub + finial. */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.3, 28]} />
        <Clay color={mixHex(S.clay[2], S.accent2, 0.3)} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.12, 20, 14]} />
        <Clay color={mixHex(S.clay[2], S.paper, 0.35)} />
      </mesh>
      {/* End caps the strings hang from. */}
      {[-ARM, ARM].map((x) => (
        <mesh key={x} position={[x, 0, 0]}>
          <sphereGeometry args={[0.1, 16, 12]} />
          <Clay color={mixHex(beam, S.paper, 0.2)} />
        </mesh>
      ))}
    </group>
  );
};

const Pan: React.FC<{ scene: BalanceSceneData; side: Side; angle: number; index: number }> = ({
  scene,
  side,
  angle,
  index,
}) => {
  const S = useStage();
  const { t } = useSceneTime();
  const reaction = useReaction(index);
  const dish = useMemo(
    () =>
      lathe(
        [
          [0.001, -PAN_DEPTH],
          [PAN_R * 0.55, -PAN_DEPTH],
          [PAN_R * 0.88, -PAN_DEPTH * 0.55],
          [PAN_R, 0],
          [PAN_R - 0.05, 0.03],
          [PAN_R * 0.85, -PAN_DEPTH * 0.5],
          [0.001, -PAN_DEPTH * 0.7],
        ],
        40,
      ),
    [],
  );
  const size = blockSize(scene, side);
  const box = useMemo(() => new RoundedBoxGeometry(size, size, size, 4, size * 0.16), [size]);
  const hang = hangPoint(side, angle);
  const panY = hang[1] - STRING + panDip(scene, side, t);
  const panX = hang[0];
  const stringColor = mixHex(S.clay[2], S.paper, 0.45);
  const rim = PAN_R * 0.93;
  const strings: Vec3[] = [0, 1, 2].map((i) => {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3 + 0.35;
    return [panX + Math.cos(a) * rim, panY, Math.sin(a) * rim];
  });

  // Block: gravity drop, then squash + small hop.
  const at = scene[side].at;
  const land = landAt(scene, side);
  const baseColor = side === 'left' ? S.clay[0] : S.clay[1];
  const win = winGlow(scene, side, t);
  let block: React.ReactNode = null;
  if (t >= at) {
    const u = Math.min(1, (t - at) / DROP_SEC);
    const k = Math.max(0, t - land);
    const fall = t < land ? DROP_H * (1 - u * u) : 0;
    const hop = t >= land ? 0.16 * Math.exp(-k * 7) * Math.abs(Math.sin(k * 11)) : 0;
    const squash = t >= land ? 0.16 * Math.exp(-k * 9) * Math.cos(k * 20) : 0;
    const sy = 1 - squash;
    const sxz = 1 + squash * 0.5;
    const s = reaction.scale;
    const color = mixHex(baseColor, S.accent, 0.75 * win);
    block = (
      <mesh
        geometry={box}
        position={[panX, panY + (size * sy) / 2 + fall + hop, 0]}
        rotation={[0, 0.35 + (side === 'left' ? -0.12 : 0.12), (reaction.rotate * Math.PI) / 180]}
        scale={[sxz * s, sy * s, sxz * s]}
      >
        <Clay
          color={color}
          emissive={S.accent}
          emissiveIntensity={0.28 * win + 0.3 * reaction.glow}
          opacity={Math.min(1, u * 3)}
        />
      </mesh>
    );
  }

  return (
    <group>
      {strings.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed three strings
        <Rod key={i} a={hang} b={p} r={0.014} color={stringColor} />
      ))}
      <mesh geometry={dish} position={[panX, panY, 0]}>
        <Clay color={mixHex(S.paper, S.clay[1], 0.3)} roughness={0.5} />
      </mesh>
      {block}
    </group>
  );
};

/** 0–1 accent glow of a side's block once the beam has decided. */
function winGlow(scene: BalanceSceneData, side: Side, t: number): number {
  const on = ramp(t, scene.tipAt + BALANCE_SETTLE_SEC * 0.6, 0.6);
  if (scene.heavier === 'even') return on * 0.55;
  return scene.heavier === side ? on : 0;
}

// ---------------------------------------------------------------------------
// HTML label under each pan
// ---------------------------------------------------------------------------

const PanLabel: React.FC<{
  label: string;
  at: number;
  index: number;
  x: number;
  y: number;
  win: number;
}> = ({ label, at, index, x, y, win }) => {
  const S = useStage();
  const pop = usePop(at, 200, 15);
  const reaction = useReaction(index);
  const float = useFloat(`balance-label${index}`, 3);
  const shadow = useLivingShadow(`balance-label${index}`, 0.7);
  const breath = useBreath(`balance${index}`);
  if (pop <= 0.001) return null;
  const size = label.length > 11 ? 36 : 40;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, 0) translate(${float.x.toFixed(2)}px, ${(float.y - (1 - pop) * 24).toFixed(2)}px) scale(${(0.8 + pop * 0.2).toFixed(4)}) ${reactionTransform(reaction)}`,
        transformOrigin: 'center top',
        opacity: Math.min(1, pop * 1.4),
      }}
    >
      <Glow
        color={S.accent}
        intensity={win * (0.5 + breath * 0.3) + reaction.glow * 0.6}
        radius={100}
      />
      <div
        style={{
          position: 'relative',
          padding: '12px 30px',
          borderRadius: 999,
          background: mixHex(S.cardRaised, S.accent, win * 0.85),
          border: `1.5px solid ${win > 0.5 ? mixHex(S.cardRaised, S.accent, 0.6) : S.cardBorder}`,
          boxShadow: shadow,
          color: win > 0.5 ? '#ffffff' : S.text,
          fontFamily: S.font,
          fontWeight: 700,
          fontSize: size,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
    </div>
  );
};

export const BalanceScene: React.FC<{ scene: BalanceSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const settle = scene.tipAt + BALANCE_SETTLE_SEC;
  const rig = { focusAt: settle, driftDeg: 5, pushAmount: 0.06 };
  const camera = useRigCamera(CAMERA, rig);
  const breath = useBreath('balance');
  const enter = interpolate(t, [0, 0.55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const angle = beamAngle(scene, t);
  const sides: Side[] = ['left', 'right'];

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Accent glow behind the winning block (behind the transparent canvas). */}
      {sides.map((side) => {
        const win = winGlow(scene, side, t);
        if (win <= 0.01) return null;
        const hang = hangPoint(side, angle);
        const c = projectToStage(camera, [hang[0], hang[1] - STRING + 0.4, 0]);
        return (
          <div
            key={side}
            style={{
              position: 'absolute',
              left: c.x - 170,
              top: c.y - 170,
              width: 340,
              height: 340,
            }}
          >
            <Glow color={S.accent} intensity={win * (0.6 + breath * 0.3)} radius={170} />
          </div>
        );
      })}
      <Stage3D camera={CAMERA} {...rig} groundY={GROUND_Y} shadowScale={8}>
        <group position={[0, (1 - enter) * -0.4, 0]} scale={0.94 + enter * 0.06}>
          <Stand />
          <Beam angle={angle} />
          {sides.map((side, i) => (
            <Pan key={side} scene={scene} side={side} angle={angle} index={i} />
          ))}
        </group>
      </Stage3D>
      {sides.map((side, i) => {
        const hang = hangPoint(side, angle);
        const p = projectToStage(camera, [
          hang[0],
          hang[1] - STRING - PAN_DEPTH - 0.22 + panDip(scene, side, t),
          PAN_R * 0.6,
        ]);
        return (
          <PanLabel
            key={side}
            label={scene[side].label}
            at={scene[side].at}
            index={i}
            x={p.x}
            y={p.y}
            win={winGlow(scene, side, t)}
          />
        );
      })}
    </div>
  );
};
