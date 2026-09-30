/** Folding, filing and retaining resources, all sampled from one scene time. */
import type React from 'react';
import { useEffect, useMemo } from 'react';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Clay, type HeroPropDef, type HeroPropProps } from '../hero-kit';
import type { Vec3 } from '../mechanisms/paths';
import { RoundedBlock as Block, Cable, Shaft } from '../mechanisms/primitives';
import { useSceneTime, useStage } from '../stage';
import {
  CABINET_PAPER,
  type FilingCabinetPose,
  PARCEL_SIZE,
  type ParcelPose,
  RESERVOIR_SIZE,
  type ReservoirPose,
  sampleFilingCabinetPose,
  sampleParcelPose,
  sampleReservoirPose,
} from './storage-poses';

/** Thin folding panels keep a physical corner radius rather than stretched token corners. */
const ParcelPanel: React.FC<{
  size: [number, number, number];
  at: [number, number, number];
  color: string;
}> = ({ size: [w, h, d], at, color }) => {
  const geometry = useMemo(
    () => new RoundedBoxGeometry(w, h, d, 3, Math.min(0.025, w / 2, h / 2, d / 2)),
    [w, h, d],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh position={at}>
      <primitive object={geometry} attach="geometry" dispose={null} />
      <Clay color={color} />
    </mesh>
  );
};

export const ParcelRig: React.FC<ParcelPose> = ({ sideAngle, endAngle, lidAngle }) => {
  const S = useStage();
  const { width: w, depth: d, height: h, baseY, thickness: th } = PARCEL_SIZE;
  return (
    <group>
      <ParcelPanel size={[w, th, d]} at={[0, baseY, 0]} color={S.clay[2]} />
      {[-1, 1].map((side) => (
        <group
          key={`side-${side}`}
          position={[(side * w) / 2, baseY, 0]}
          rotation={[0, 0, side * sideAngle]}
        >
          <ParcelPanel size={[h, th, d - th]} at={[(side * h) / 2, 0, 0]} color={S.clay[0]} />
        </group>
      ))}
      {[-1, 1].map((side) => (
        <group
          key={`end-${side}`}
          position={[0, baseY, (side * d) / 2]}
          rotation={[-side * endAngle, 0, 0]}
        >
          <ParcelPanel size={[w - th, th, h]} at={[0, 0, (side * h) / 2]} color={S.clay[1]} />
          {side === 1 && (
            <>
              <Block size={[0.22, 0.01, h]} at={[0, -th / 2 - 0.006, h / 2]} color={S.clay[2]} />
              <Block
                size={[0.4, 0.012, 0.27]}
                at={[-0.4, -th / 2 - 0.008, h * 0.58]}
                color={S.paper}
              />
              {[0, 0.065].map((dz) => (
                <Block
                  key={dz}
                  size={[0.25, 0.006, 0.018]}
                  at={[-0.4, -th / 2 - 0.017, h * 0.58 + dz]}
                  color={S.clay[2]}
                />
              ))}
            </>
          )}
          {side === -1 && (
            <group position={[0, 0, -h - th / 2]} rotation={[lidAngle, 0, 0]}>
              <ParcelPanel size={[w + th, th, d + th]} at={[0, 0, -d / 2]} color={S.clay[0]} />
              <Block
                size={[0.22, 0.01, d + th]}
                at={[0, -th / 2 - 0.006, -d / 2]}
                color={S.clay[2]}
              />
              <Block
                size={[0.48, 0.012, 0.32]}
                at={[-0.37, -th / 2 - 0.008, -d / 2]}
                color={S.paper}
              />
            </group>
          )}
        </group>
      ))}
    </group>
  );
};

export const FilingCabinetRig: React.FC<FilingCabinetPose> = ({ drawer, paperY, paperZ }) => {
  const S = useStage();
  return (
    <group>
      <Block size={[1.5, 2.24, 0.14]} at={[0, 0, -0.42]} color={S.clay[2]} />
      {[-0.685, 0.685].map((x) => (
        <Block key={x} size={[0.13, 2.24, 1]} at={[x, 0, 0.04]} color={S.clay[0]} />
      ))}
      {[-1.055, 1.055].map((y) => (
        <Block key={y} size={[1.5, 0.13, 1]} at={[0, y, 0.04]} color={S.clay[0]} />
      ))}
      <Block size={[1.25, 0.07, 0.87]} at={[0, 0.07, 0.045]} color={S.clay[2]} />
      <Block size={[1.21, 0.88, 0.1]} at={[0, -0.49, 0.53]} color={S.clay[1]} />
      <Block size={[0.43, 0.085, 0.09]} at={[0, -0.39, 0.63]} color={S.paper} />
      <Block size={[0.33, 0.105, 0.012]} at={[0, -0.62, 0.59]} color={S.paper} />
      {[-0.58, 0.58].map((x) => (
        <Block key={x} size={[0.11, 0.09, 0.98]} at={[x, 0.13, 0.05]} color={S.clay[2]} />
      ))}
      <group position={[0, 0, drawer]}>
        <Block size={[1.21, 0.8, 0.1]} at={[0, 0.53, 0.53]} color={S.clay[1]} />
        <Block size={[1.2, 0.06, 0.8]} at={[0, 0.2, 0.08]} color={S.clay[2]} />
        {[-0.575, 0.575].map((x) => (
          <Block key={x} size={[0.05, 0.45, 0.8]} at={[x, 0.45, 0.08]} color={S.clay[0]} />
        ))}
        <Block size={[1.16, 0.45, 0.035]} at={[0, 0.45, -0.3]} color={S.clay[0]} />
        <Block size={[0.43, 0.085, 0.09]} at={[0, 0.64, 0.63]} color={S.paper} />
        <Block size={[0.33, 0.105, 0.012]} at={[0, 0.37, 0.59]} color={S.paper} />
      </group>
      <group position={[0, paperY, paperZ]}>
        {[0, 1, 2].map((i) => (
          <group key={i} position={[0, i * CABINET_PAPER.thickness, 0]}>
            <Block
              size={[CABINET_PAPER.width, CABINET_PAPER.thickness, CABINET_PAPER.depth]}
              color={S.paper}
            />
            {i === 2 && (
              <Block
                size={[0.46, 0.003, 0.027]}
                at={[-0.1, CABINET_PAPER.thickness / 2 + 0.003, -0.11]}
                color={S.clay[2]}
              />
            )}
          </group>
        ))}
      </group>
      {[-0.57, 0.57].map((x) => (
        <Block key={x} size={[0.25, 0.12, 0.55]} at={[x, -1.16, 0]} color={S.clay[2]} />
      ))}
    </group>
  );
};

const INLET: readonly Vec3[] = [
  [-1.13, -0.5, 0],
  [-1.13, 0.88, 0],
  [-1.01, 1.1, 0],
  [-0.51, 1.1, 0],
  [-0.42, 0.94, 0],
];
const OUTLET: readonly Vec3[] = [
  [0.64, -0.62, 0],
  [1.04, -0.62, 0],
  [1.13, -0.68, 0],
  [1.13, -0.79, 0],
];

/** Optional outlet is an authored draining action, not an arbitrary plumbing graph. */
export const ReservoirRig: React.FC<ReservoirPose & { draining?: boolean }> = ({
  level,
  flow,
  draining = false,
}) => {
  const S = useStage();
  const top = RESERVOIR_SIZE.bottomY + RESERVOIR_SIZE.fillHeight * level;
  const streamTop = draining ? -0.815 : 0.91;
  const streamBottom = draining ? -1.075 : top;
  const streamX = draining ? 1.13 : -0.42;
  return (
    <group>
      <Block
        size={[RESERVOIR_SIZE.width, 0.16, RESERVOIR_SIZE.depth + 0.09]}
        at={[0, -0.83, 0]}
        color={S.clay[0]}
      />
      <Block size={[1.45, RESERVOIR_SIZE.height, 0.09]} at={[0, 0, -0.36]} color={S.clay[2]} />
      {[-0.715, 0.715].map((x) => (
        <group key={x}>
          <Block
            size={[0.12, RESERVOIR_SIZE.height, RESERVOIR_SIZE.depth]}
            at={[x, 0, 0]}
            color={S.clay[0]}
          />
          <Block size={[0.15, 0.15, 0.8]} at={[x, 0.88, 0]} color={S.clay[1]} />
        </group>
      ))}
      <group
        position={[0, RESERVOIR_SIZE.bottomY + (RESERVOIR_SIZE.fillHeight * level) / 2, 0]}
        scale={[1, RESERVOIR_SIZE.fillHeight * level, 1]}
      >
        <mesh>
          <boxGeometry args={[1.26, 1, 0.56]} />
          <Clay color={S.accent2} roughness={0.34} />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.38]}>
        <planeGeometry args={[1.32, 1.66]} />
        <meshPhysicalMaterial
          color={S.paper}
          roughness={0.7}
          transparent
          opacity={0.11}
          depthWrite={false}
        />
      </mesh>
      {!draining && (
        <group>
          <Block size={[0.25, 0.3, 0.3]} at={[-1.13, -0.62, 0]} color={S.clay[1]} />
          <Block size={[0.2, 0.33, 0.24]} at={[-1.13, -0.93, 0]} color={S.clay[2]} />
        </group>
      )}
      <Cable points={draining ? OUTLET : INLET} radius={0.065} color={S.clay[1]} />
      <group
        position={[draining ? 1.13 : -0.42, draining ? -0.77 : 0.955, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <Shaft radius={0.085} length={0.09} color={S.paper} />
      </group>
      <mesh
        position={[streamX, (streamTop + streamBottom) / 2, 0]}
        scale={[Math.max(0.001, flow), streamTop - streamBottom, Math.max(0.001, flow)]}
        visible={flow > 0}
      >
        <cylinderGeometry args={[0.036, 0.036, 1, 12]} />
        <Clay color={S.accent2} roughness={0.35} />
      </mesh>
      {draining && (
        <group>
          <Block size={[0.52, 0.06, 0.48]} at={[1.13, -1.12, 0]} color={S.clay[0]} />
          <Block size={[0.4, 0.018, 0.37]} at={[1.13, -1.081, 0]} color={S.accent2} />
        </group>
      )}
      {[-0.7, 0.7].map((x) => (
        <Block key={x} size={[0.19, 0.2, 0.42]} at={[x, -1, 0]} color={S.clay[2]} />
      ))}
    </group>
  );
};

const Parcel: React.FC<HeroPropProps> = ({ at }) => (
  <ParcelRig {...sampleParcelPose(useSceneTime().t - at)} />
);
const FilingCabinet: React.FC<HeroPropProps> = ({ at }) => (
  <FilingCabinetRig {...sampleFilingCabinetPose(useSceneTime().t - at)} />
);
const Reservoir: React.FC<HeroPropProps> = ({ at, tone }) => (
  <ReservoirRig
    {...sampleReservoirPose(useSceneTime().t - at, tone === 'down')}
    draining={tone === 'down'}
  />
);

export const STORAGE_PROPS = {
  parcel: { Model: Parcel, yaw: -0.48, framing: { scale: 0.94, y: 0.05 } },
  'filing-cabinet': { Model: FilingCabinet, yaw: -0.38, framing: { scale: 1.0, y: -0.12 } },
  reservoir: { Model: Reservoir, yaw: -0.28, framing: { scale: 1.05, y: 0.02 } },
} satisfies Record<'parcel' | 'filing-cabinet' | 'reservoir', HeroPropDef>;
