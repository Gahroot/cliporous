/**
 * Procedural soft-clay props for the hero scene (and small shared geometry
 * helpers). Every prop is built from primitives (spheres, cylinders, rounded
 * boxes, tori, lathes, extrusions) in the palette's clay tones, fits a
 * ~2.4-unit box centred on the origin, and animates purely from the frame.
 *
 * `at` is the appear beat in seconds (scene-relative).
 */

import type React from 'react';
import { useMemo } from 'react';
import { type BufferGeometry, ExtrudeGeometry, type LatheGeometry, Shape } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HERO_CATALOG } from './hero-catalog';
import {
  Clay,
  type HeroPropDef,
  type HeroPropProps,
  lathe,
  roundedRectGeometry,
  useSpringAt,
} from './hero-kit';
import { BUSINESS_PROPS } from './hero-props/business';
import { GROWTH_PROPS } from './hero-props/growth';
import { MECHANICS_PROPS } from './hero-props/mechanics';
import { MIND_PROPS } from './hero-props/mind';
import { SIGNAL_PROPS } from './hero-props/signals';
import { TIME_PROPS } from './hero-props/time';
import { WORLD_PROPS } from './hero-props/world';
import { hash01, useBreath } from './motion';
import { mixHex } from './palette';
import { ramp, useSceneTime, useStage } from './stage';
import type { HeroProp } from './types';

export { roundedRectGeometry } from './hero-kit';

/** Seconds after `at` when the flipping coin lands (hero-catalog impactSec). */
export const COIN_LAND_SEC = HERO_CATALOG.coins.impactSec;
/** Seconds after `at` when the lock shackle clicks shut / springs open. */
export const LOCK_CLICK_SEC = HERO_CATALOG.lock.impactSec;

// ---------------------------------------------------------------------------
// Lightbulb — glassy bulb with a glowing filament, ribbed clay base.
// ---------------------------------------------------------------------------

const Lightbulb: React.FC<{ at: number }> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const breath = useBreath('hero-bulb', 2.6);
  const bulb = useMemo(() => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * (Math.PI * 0.78);
      pts.push([0.78 * Math.sin(a), 0.42 + 0.78 * Math.cos(a)]);
    }
    pts.push([0.44, -0.28], [0.38, -0.4], [0, -0.4]);
    return lathe(pts, 36);
  }, []);
  // Switches on shortly after appearing, with one soft flicker.
  const on = ramp(t, at + 0.25, 0.35) * (t > at + 0.38 && t < at + 0.45 ? 0.55 : 1);
  const glow = on * (0.55 + breath * 0.45);
  const baseColor = S.clay[2];
  const glass = mixHex(S.paper, S.accent2, 0.22);
  return (
    <group position={[0, 0.25, 0]}>
      {/* Filament */}
      <mesh position={[0, 0.42, 0]}>
        <torusGeometry args={[0.17, 0.03, 8, 24]} />
        <Clay color={S.accent2} emissive={S.accent2} emissiveIntensity={0.3 + glow * 1.6} />
      </mesh>
      {[-0.12, 0.12].map((x) => (
        <mesh key={x} position={[x, 0.08, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.62, 6]} />
          <Clay color={mixHex(S.clay[2], S.paper, 0.3)} />
        </mesh>
      ))}
      {/* Glass */}
      <mesh geometry={bulb}>
        <meshStandardMaterial
          color={glass}
          roughness={0.28}
          metalness={0}
          emissive={S.accent2}
          emissiveIntensity={0.08 + glow * 0.42}
          transparent
          opacity={0.84}
          depthWrite={false}
        />
      </mesh>
      {/* Ribbed base */}
      <mesh position={[0, -0.62, 0]}>
        <cylinderGeometry args={[0.36, 0.33, 0.44, 28]} />
        <Clay color={baseColor} />
      </mesh>
      {[-0.46, -0.6, -0.74].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.36, 0.045, 8, 28]} />
          <Clay color={mixHex(baseColor, S.paper, 0.12)} />
        </mesh>
      ))}
      <mesh position={[0, -0.9, 0]} scale={[1, 0.55, 1]}>
        <sphereGeometry args={[0.22, 20, 12]} />
        <Clay color={mixHex(baseColor, '#000000', 0.25)} />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Rocket — lathe body, accent nose, porthole, extruded fins, exhaust puffs.
// ---------------------------------------------------------------------------

const PUFFS = 10;
const PUFF_PERIOD = 1.2;

const Rocket: React.FC<{ at: number }> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const nose = useMemo(
    () =>
      lathe([
        [0, 1.3],
        [0.1, 1.24],
        [0.2, 1.1],
        [0.28, 0.95],
        [0.33, 0.82],
        [0, 0.82],
      ]),
    [],
  );
  const body = useMemo(
    () =>
      lathe([
        [0, 0.83],
        [0.335, 0.83],
        [0.39, 0.6],
        [0.42, 0.32],
        [0.43, 0.02],
        [0.41, -0.3],
        [0.37, -0.58],
        [0.33, -0.74],
        [0, -0.74],
      ]),
    [],
  );
  const fin = useMemo(() => {
    const s = new Shape();
    s.moveTo(0, 0.1);
    s.quadraticCurveTo(0.34, -0.12, 0.44, -0.5);
    s.lineTo(0.44, -0.66);
    s.quadraticCurveTo(0.2, -0.52, 0, -0.5);
    s.lineTo(0, 0.1);
    return new ExtrudeGeometry(s, {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 2,
      curveSegments: 8,
    });
  }, []);
  const since = t - at;
  const thrust = ramp(t, at + 0.1, 0.4);
  const rumble = Math.sin(t * 38) * 0.006 * thrust;
  return (
    <group rotation={[0, 0, -0.32]} position={[0.05, 0.1 + rumble, 0]}>
      <mesh geometry={nose}>
        <Clay color={S.accent} roughness={0.5} />
      </mesh>
      <mesh geometry={body}>
        <Clay color={S.paper} />
      </mesh>
      {/* Accent band + porthole */}
      <mesh position={[0, -0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.385, 0.035, 8, 32]} />
        <Clay color={S.clay[0]} />
      </mesh>
      <group position={[0, 0.34, 0.405]} rotation={[-0.02, 0, 0]}>
        <mesh>
          <torusGeometry args={[0.15, 0.045, 10, 28]} />
          <Clay color={S.clay[2]} />
        </mesh>
        <mesh position={[0, 0, -0.01]}>
          <circleGeometry args={[0.14, 24]} />
          <Clay
            color={mixHex(S.accent2, S.paper, 0.2)}
            emissive={S.accent2}
            emissiveIntensity={0.35}
            roughness={0.25}
          />
        </mesh>
      </group>
      {/* Fins */}
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((a) => (
        <group key={a} rotation={[0, a + Math.PI / 2, 0]}>
          <mesh geometry={fin} position={[0.3, -0.12, -0.025]}>
            <Clay color={S.clay[0]} />
          </mesh>
        </group>
      ))}
      {/* Nozzle */}
      <mesh position={[0, -0.84, 0]}>
        <cylinderGeometry args={[0.2, 0.27, 0.2, 24]} />
        <Clay color={S.clay[2]} />
      </mesh>
      {/* Exhaust puffs */}
      {since > 0.1 &&
        Array.from({ length: PUFFS }, (_, i) => {
          const u = ((since - 0.1) / PUFF_PERIOD + i / PUFFS) % 1;
          // Only puffs already emitted since ignition are visible.
          if (since - 0.1 < u * PUFF_PERIOD) return null;
          const jx = (hash01(`puff-x${i}`) - 0.5) * 0.5 * u;
          const jz = (hash01(`puff-z${i}`) - 0.5) * 0.4 * u;
          const size = (0.1 + u * 0.2) * thrust;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length particle pool
            <mesh key={i} position={[jx, -1.0 - u * 0.7, jz]} scale={size}>
              <sphereGeometry args={[1, 14, 10]} />
              <Clay
                color={mixHex(S.paper, S.clay[1], hash01(`puff-c${i}`) * 0.6)}
                roughness={0.7}
                opacity={Math.max(0, (1 - u) ** 1.4 * 0.9)}
              />
            </mesh>
          );
        })}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Coins — a small stack plus one coin flipping onto it.
// ---------------------------------------------------------------------------

const COIN_H = 0.17;
const STACK = 4;

function coinGeometry(): LatheGeometry {
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

const Coin: React.FC<{ geometry: BufferGeometry; color: string; rim: string }> = ({
  geometry,
  color,
  rim,
}) => (
  <group>
    <mesh geometry={geometry}>
      <Clay color={color} roughness={0.42} metalness={0.12} />
    </mesh>
    <mesh position={[0, 0.058, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.33, 0.028, 8, 36]} />
      <Clay color={rim} roughness={0.42} metalness={0.12} />
    </mesh>
  </group>
);

const Coins: React.FC<{ at: number }> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const geometry = useMemo(coinGeometry, []);
  const color = S.clay[0];
  const rim = mixHex(S.clay[0], S.paper, 0.35);
  const baseY = -0.95;
  const topY = baseY + STACK * COIN_H;
  const p = Math.min(1, Math.max(0, (t - at) / COIN_LAND_SEC));
  const landed = t >= at + COIN_LAND_SEC;
  // Tossed up then falling onto the stack, two full flips, lands flat.
  const flyY = topY + (1 - p * p) * 1.2 + Math.sin(Math.PI * p) * 0.55;
  const flip = (1 - p) * Math.PI * 4;
  const settle = useSpringAt(at + COIN_LAND_SEC, 260, 12, 0.7);
  const squash = landed ? 1 - Math.sin(Math.min(1, settle) * Math.PI) * 0.06 : 1;
  return (
    <group position={[0, 0.1, 0]} rotation={[0.28, 0, 0]}>
      <group scale={[1, squash, 1]} position={[0, baseY * (1 - squash), 0]}>
        {Array.from({ length: STACK }, (_, i) => (
          <group
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed stack
            key={i}
            position={[
              (hash01(`coin-x${i}`) - 0.5) * 0.09,
              baseY + i * COIN_H,
              (hash01(`coin-z${i}`) - 0.5) * 0.09,
            ]}
            rotation={[0, hash01(`coin-r${i}`) * Math.PI, 0]}
          >
            <Coin geometry={geometry} color={color} rim={rim} />
          </group>
        ))}
      </group>
      {t >= at && (
        <group position={[0.02, landed ? topY : flyY, 0]} rotation={[flip, 0.4, 0]}>
          <Coin geometry={geometry} color={color} rim={rim} />
        </group>
      )}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Phone — rounded slab, glowing accent screen, message bubbles popping in.
// ---------------------------------------------------------------------------

const PhoneBubble: React.FC<{ at: number; y: number; w: number; side: -1 | 1; color: string }> = ({
  at,
  y,
  w,
  side,
  color,
}) => {
  const geometry = useMemo(() => roundedRectGeometry(w, 0.26, 0.12), [w]);
  const pop = useSpringAt(at, 200, 14, 0.8);
  if (pop <= 0.001) return null;
  return (
    <mesh geometry={geometry} position={[side * (0.46 - w / 2), y, 0.004]} scale={pop}>
      <Clay color={color} roughness={0.5} />
    </mesh>
  );
};

const Phone: React.FC<{ at: number }> = ({ at }) => {
  const S = useStage();
  const breath = useBreath('hero-phone');
  const body = useMemo(() => new RoundedBoxGeometry(1.24, 2.36, 0.17, 4, 0.08), []);
  const screen = useMemo(() => roundedRectGeometry(1.08, 2.18, 0.12), []);
  const notch = useMemo(() => roundedRectGeometry(0.34, 0.08, 0.04), []);
  const screenColor = mixHex(S.bgInner, S.accent, 0.35);
  return (
    <group rotation={[-0.06, 0, 0.05]}>
      <mesh geometry={body}>
        <Clay color={S.clay[2]} />
      </mesh>
      <group position={[0, 0, 0.086]}>
        <mesh geometry={screen}>
          <Clay
            color={screenColor}
            emissive={S.accent}
            emissiveIntensity={0.18 + breath * 0.18}
            roughness={0.35}
          />
        </mesh>
        <mesh geometry={notch} position={[0, 0.96, 0.003]}>
          <Clay color={mixHex(S.clay[2], '#000000', 0.2)} />
        </mesh>
        <PhoneBubble at={at + 0.3} y={0.45} w={0.72} side={-1} color={S.paper} />
        <PhoneBubble at={at + 0.6} y={0.08} w={0.6} side={1} color={S.accent2} />
        <PhoneBubble at={at + 0.9} y={-0.29} w={0.78} side={-1} color={S.paper} />
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Laptop — base with keyboard inset, lid opening on `at` with a glowing screen.
// ---------------------------------------------------------------------------

const Laptop: React.FC<{ at: number }> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const breath = useBreath('hero-laptop');
  const base = useMemo(() => new RoundedBoxGeometry(2.5, 0.12, 1.66, 3, 0.05), []);
  const lid = useMemo(() => new RoundedBoxGeometry(2.5, 1.62, 0.08, 3, 0.035), []);
  const keys = useMemo(() => roundedRectGeometry(2.14, 0.78, 0.06), []);
  const pad = useMemo(() => roundedRectGeometry(0.72, 0.4, 0.06), []);
  const screen = useMemo(() => roundedRectGeometry(2.3, 1.42, 0.06), []);
  const bar = useMemo(() => roundedRectGeometry(0.22, 1, 0.05), []);
  const open = useSpringAt(at + 0.12, 90, 13);
  const lidRot = Math.PI / 2 - open * (Math.PI / 2 + 0.24);
  const shell = S.clay[1];
  const inset = mixHex(S.clay[1], S.clay[2], 0.55);
  const screenColor = mixHex(S.bgInner, S.accent, 0.28);
  const heights = [0.32, 0.5, 0.42, 0.78];
  return (
    <group position={[0, -0.25, 0.1]}>
      <mesh geometry={base} position={[0, -0.5, 0]}>
        <Clay color={shell} />
      </mesh>
      <mesh geometry={keys} position={[0, -0.437, -0.22]} rotation={[-Math.PI / 2, 0, 0]}>
        <Clay color={inset} />
      </mesh>
      <mesh geometry={pad} position={[0, -0.437, 0.47]} rotation={[-Math.PI / 2, 0, 0]}>
        <Clay color={mixHex(shell, S.paper, 0.25)} />
      </mesh>
      {/* Lid pivots on the back edge of the base. */}
      <group position={[0, -0.46, -0.8]} rotation={[lidRot, 0, 0]}>
        <mesh geometry={lid} position={[0, 0.81, 0]}>
          <Clay color={shell} />
        </mesh>
        <group position={[0, 0.83, 0.042]}>
          <mesh geometry={screen}>
            <Clay
              color={screenColor}
              emissive={S.accent}
              emissiveIntensity={(0.12 + breath * 0.16) * open}
              roughness={0.35}
            />
          </mesh>
          {heights.map((h, i) => {
            const grow = ramp(t, at + 0.5 + i * 0.12, 0.45);
            const hh = Math.max(0.001, h * grow);
            return (
              <mesh
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed bars
                key={i}
                geometry={bar}
                position={[-0.54 + i * 0.36, -0.52 + hh / 2, 0.003]}
                scale={[1, hh, 1]}
              >
                <Clay color={i === heights.length - 1 ? S.accent2 : S.paper} roughness={0.5} />
              </mesh>
            );
          })}
        </group>
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Lock — rounded body with a keyhole, shackle that swings in and clicks shut.
// ---------------------------------------------------------------------------

const Lock: React.FC<HeroPropProps> = ({ at, tone }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const body = useMemo(() => new RoundedBoxGeometry(1.5, 1.22, 0.62, 4, 0.2), []);
  const slot = useMemo(() => roundedRectGeometry(0.1, 0.28, 0.05), []);
  const clickAt = at + LOCK_CLICK_SEC;
  const settle = useSpringAt(clickAt, 320, 11, 0.6);
  const bounce =
    t >= clickAt ? Math.sin(Math.min(1, settle) * Math.PI) * (1 - Math.min(1, settle)) : 0;
  const jolt = t >= clickAt ? Math.sin(Math.min(1, settle) * Math.PI) * 0.035 : 0;
  let lift: number;
  let yaw: number;
  let locked: number;
  if (tone === 'down') {
    // Unlock: starts shut, the shackle pops up on the click, then swings open.
    const pop = Math.min(1, Math.max(0, (t - clickAt) / 0.12));
    const swingOpen = ramp(t, clickAt + 0.1, 0.35);
    lift = 0.36 * pop * pop;
    yaw = 0.9 * swingOpen;
    locked = 1 - ramp(t, clickAt, 0.35);
  } else {
    // Swing back over the body, then drop fast into the body on the click.
    const swing = ramp(t, at + 0.05, 0.3);
    const drop = Math.min(1, Math.max(0, (t - (clickAt - 0.1)) / 0.1)) ** 2;
    lift = 0.36 * (1 - drop);
    yaw = 0.9 * (1 - swing);
    locked = ramp(t, clickAt, 0.35);
  }
  const metal = mixHex(S.paper, S.clay[1], 0.35);
  const R = 0.44;
  return (
    <group position={[0, -0.1, 0]}>
      <group position={[0, -0.42 - jolt, 0]} scale={[1 + jolt * 0.5, 1 - jolt, 1 + jolt * 0.5]}>
        <mesh geometry={body}>
          <Clay color={S.clay[0]} />
        </mesh>
        <group position={[0, 0.02, 0.312]}>
          <mesh position={[0, 0.07, 0]}>
            <circleGeometry args={[0.12, 24]} />
            <Clay
              color={mixHex(S.clay[2], S.bgOuter, 0.35)}
              emissive={S.accent}
              emissiveIntensity={locked * 0.5}
            />
          </mesh>
          <mesh geometry={slot} position={[0, -0.1, 0]}>
            <Clay
              color={mixHex(S.clay[2], S.bgOuter, 0.35)}
              emissive={S.accent}
              emissiveIntensity={locked * 0.5}
            />
          </mesh>
        </group>
      </group>
      {/* Shackle pivots around its right leg. */}
      <group position={[R, 0.2 + lift + bounce * 0.05, 0]} rotation={[0, yaw, 0]}>
        <group position={[-R, 0, 0]}>
          <mesh position={[0, 0.34, 0]}>
            <torusGeometry args={[R, 0.11, 12, 28, Math.PI]} />
            <Clay color={metal} roughness={0.4} metalness={0.2} />
          </mesh>
          {[-R, R].map((x) => (
            <mesh key={x} position={[x, 0.12, 0]}>
              <cylinderGeometry args={[0.11, 0.11, 0.44, 16]} />
              <Clay color={metal} roughness={0.4} metalness={0.2} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------

/** Every hero prop: model + resting pose. `satisfies` keeps it exhaustive. */
export const HERO_PROP_DEFS = {
  lightbulb: { Model: Lightbulb, yaw: 0, framing: { scale: 1.1, y: 0.02 } },
  rocket: { Model: Rocket, yaw: 0.2, framing: { scale: 0.92, y: 0.16 } },
  coins: { Model: Coins, yaw: 0.3, framing: { scale: 1.45, y: 0.22 } },
  phone: { Model: Phone, yaw: -0.32, framing: { scale: 1.04, y: 0.04 } },
  laptop: { Model: Laptop, yaw: -0.42, framing: { scale: 1.05, y: 0.02 } },
  lock: { Model: Lock, yaw: 0.28, framing: { scale: 1.12, y: 0.06 } },
  ...BUSINESS_PROPS,
  ...TIME_PROPS,
  ...MIND_PROPS,
  ...GROWTH_PROPS,
  ...WORLD_PROPS,
  ...MECHANICS_PROPS,
  ...SIGNAL_PROPS,
} satisfies Record<HeroProp, HeroPropDef>;

export const HeroPropModel: React.FC<HeroPropProps & { prop: HeroProp }> = ({ prop, at, tone }) => {
  const { Model } = HERO_PROP_DEFS[prop];
  return <Model at={at} {...(tone ? { tone } : {})} />;
};
