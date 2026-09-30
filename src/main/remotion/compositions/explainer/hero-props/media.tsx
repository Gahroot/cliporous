import type React from 'react';
import { useEffect, useMemo } from 'react';
import { ExtrudeGeometry, Shape } from 'three';
import { Clay, type HeroPropDef, type HeroPropProps } from '../hero-kit';
import { Cable, RoundedBlock, Shaft } from '../mechanisms/primitives';
import { mixHex } from '../palette';
import { useSceneTime, useStage } from '../stage';
import {
  CLAPPER_GEOMETRY,
  sampleCameraPose,
  sampleClapperboardPose,
  sampleMicrophonePose,
} from './media-poses';

const MIC_YOKE = [
  [-0.47, 0.35, 0],
  [-0.47, -0.25, 0],
  [0, -0.4, 0],
  [0.47, -0.25, 0],
  [0.47, 0.35, 0],
] as const;
const WAVE_BARS = [0.32, 0.6, 0.38] as const;

const Microphone: React.FC<HeroPropProps> = ({ at, tone }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const pose = sampleMicrophonePose(t - at, tone === 'down');
  const dark = mixHex(S.clay[2], S.bgOuter, 0.55);
  return (
    <group>
      <mesh position={[0, -0.96, 0]}>
        <cylinderGeometry args={[0.57, 0.61, 0.14, 32]} />
        <Clay color={S.clay[2]} />
      </mesh>
      <mesh position={[0, -0.65, 0]}>
        <cylinderGeometry args={[0.065, 0.09, 0.55, 16]} />
        <Clay color={S.clay[1]} />
      </mesh>
      <Cable points={MIC_YOKE} radius={0.065} color={S.clay[2]} />
      {[-0.47, 0.47].map((x) => (
        <mesh key={x} position={[x, 0.28, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.115, 0.115, 0.12, 20]} />
          <Clay color={S.accent} />
        </mesh>
      ))}
      {/* A rounded capsule, front grille slots, yoke and desk stand — not a floating box. */}
      <RoundedBlock size={[0.74, 1.32, 0.5]} at={[0, 0.38, 0]} color={S.clay[1]} />
      {[-0.04, 0.12, 0.28, 0.44, 0.6, 0.76].map((y) => (
        <RoundedBlock key={y} size={[0.55, 0.05, 0.026]} at={[0, y, 0.254]} color={dark} />
      ))}
      <RoundedBlock size={[0.06, 1.03, 0.035]} at={[0, 0.38, 0.274]} color={S.clay[1]} />
      <RoundedBlock size={[0.24, 0.14, 0.02]} at={[0, -0.18, 0.261]} color={dark} />
      <RoundedBlock
        size={[0.09, 0.09, 0.028]}
        at={[-0.065 + 0.13 * pose.enabled, -0.18, 0.279]}
        color={mixHex(S.clay[2], S.accent, pose.enabled)}
      />
      {/* Six fixed meshes. Voice follows the switch; muting leaves none visible. */}
      {[-1, 1].map((side) => (
        <group key={side} visible={pose.wave > 0}>
          {WAVE_BARS.map((height, i) => (
            <group
              key={height}
              position={[side * (0.76 + i * 0.18), 0.34, 0]}
              scale={[1, Math.max(0.001, pose.wave), 1]}
            >
              <RoundedBlock size={[0.055, height, 0.055]} color={S.accent2} />
            </group>
          ))}
        </group>
      ))}
    </group>
  );
};

const Camera: React.FC<HeroPropProps> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const pose = sampleCameraPose(t - at);
  const dark = mixHex(S.clay[2], S.bgOuter, 0.65);
  return (
    <group position={[0, -0.05, -0.22]}>
      <RoundedBlock size={[1.94, 1.16, 0.66]} color={S.clay[1]} />
      <RoundedBlock size={[0.42, 1.08, 0.19]} at={[-0.68, 0, 0.36]} color={S.clay[2]} />
      <RoundedBlock size={[0.58, 0.25, 0.44]} at={[0.05, 0.66, -0.04]} color={S.clay[1]} />
      <RoundedBlock size={[0.27, 0.12, 0.02]} at={[0.05, 0.675, 0.193]} color={dark} />
      <mesh position={[-0.65, 0.65 - pose.button * 0.045, 0.04]}>
        <cylinderGeometry args={[0.125, 0.125, 0.12, 20]} />
        <Clay color={S.accent} />
      </mesh>
      <group position={[0.12, 0, 0.46]}>
        <Shaft radius={0.56} length={0.25} color={S.clay[2]} />
        <group position={[0, 0, 0.16 + pose.focus * 0.16]}>
          <Shaft radius={0.5} length={0.3} color={S.clay[1]} />
          {[0.01, 0.08, 0.15].map((z) => (
            <mesh key={z} position={[0, 0, z]}>
              <torusGeometry args={[0.5, 0.022, 8, 40]} />
              <Clay color={S.clay[2]} />
            </mesh>
          ))}
          <mesh position={[0, 0, 0.156]}>
            <circleGeometry args={[0.48, 40]} />
            <Clay color={dark} />
          </mesh>
          {/* Opposed semicircular leaves retract entirely behind the opaque annulus. */}
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * 0.24 * (1 - pose.shutter), 0, 0.163]}
              rotation={[0, 0, side === 1 ? 0 : Math.PI]}
            >
              <circleGeometry args={[0.24, 24, -Math.PI / 2, Math.PI]} />
              <Clay color={S.clay[2]} />
            </mesh>
          ))}
          <mesh position={[0, 0, 0.174]}>
            <ringGeometry args={[0.235, 0.52, 48]} />
            <Clay color={S.clay[1]} />
          </mesh>
          <mesh position={[0, 0, 0.177]}>
            <torusGeometry args={[0.255, 0.025, 8, 40]} />
            <Clay color={S.accent2} />
          </mesh>
        </group>
      </group>
    </group>
  );
};

const Clapperboard: React.FC<HeroPropProps> = ({ at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const pose = sampleClapperboardPose(t - at);
  const { width, barHeight, pivotX, contactY } = CLAPPER_GEOMETRY;
  const stripe = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.21, 0);
    shape.lineTo(0.31, barHeight);
    shape.lineTo(0.1, barHeight);
    shape.closePath();
    return new ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
  }, []);
  useEffect(() => () => stripe.dispose(), [stripe]);
  const stripes = (y: number) =>
    [0.06, 0.44, 0.82, 1.2, 1.58].map((x) => (
      <mesh key={x} position={[x, y, 0.091]}>
        <primitive object={stripe} attach="geometry" dispose={null} />
        <Clay color={S.paper} />
      </mesh>
    ));
  return (
    <group position={[0, -0.12, 0]}>
      <RoundedBlock size={[1.94, 1.2, 0.14]} at={[0, -0.45, 0]} color={S.clay[2]} />
      {/* Blank ruled slate: no invented take numbers, amounts, or lettering. */}
      {[-0.15, -0.42, -0.69].map((y) => (
        <RoundedBlock key={y} size={[1.62, 0.025, 0.014]} at={[0, y, 0.079]} color={S.clay[1]} />
      ))}
      <group position={[pivotX, contactY - barHeight, 0]}>
        <RoundedBlock
          size={[width, barHeight, 0.18]}
          at={[width / 2, barHeight / 2, 0]}
          color={S.clay[2]}
        />
        {stripes(0)}
      </group>
      {/* Local y=0 is the bottom contact edge; the hinge never floats. */}
      <group position={[pivotX, contactY, 0]} rotation={[0, 0, pose.angle]}>
        <RoundedBlock
          size={[width, barHeight, 0.18]}
          at={[width / 2, barHeight / 2, 0]}
          color={S.clay[2]}
        />
        {stripes(0)}
      </group>
      <group position={[pivotX + 0.055, contactY, 0.13]}>
        <Shaft radius={0.085} length={0.1} color={S.accent} />
      </group>
    </group>
  );
};

export const MEDIA_PROPS = {
  microphone: { Model: Microphone, yaw: -0.12, framing: { scale: 1.06, y: 0.04 } },
  camera: { Model: Camera, yaw: -0.3, framing: { scale: 1.16, y: 0.02 } },
  clapperboard: { Model: Clapperboard, yaw: -0.12, framing: { scale: 1.02, y: 0.02 } },
} satisfies Record<'microphone' | 'camera' | 'clapperboard', HeroPropDef>;
