import type React from 'react';
import { useEffect, useMemo } from 'react';
import { ExtrudeGeometry, Shape } from 'three';
import { Clay, type HeroPropDef, type HeroPropProps } from '../hero-kit';
import { RoundedBlock, Shaft } from '../mechanisms/primitives';
import { useSceneTime, useStage } from '../stage';
import {
  ARCH_BLOCK_IDS,
  ARCH_SIZE,
  type ArchPose,
  archBlockAngle,
  archBlockOffset,
  BRIDGE_SIZE,
  type BridgePose,
  sampleArch,
  sampleBridge,
} from './structures-poses';

export const BridgeRig: React.FC<BridgePose> = ({ angle }) => {
  const S = useStage();
  const deck = useMemo(() => {
    const shape = new Shape();
    const B = BRIDGE_SIZE;
    // Chamfered lower noses clear one another throughout closing; the top tips meet exactly.
    shape.moveTo(0, B.bottom);
    shape.lineTo(B.halfSpan - B.noseInset, B.bottom);
    shape.lineTo(B.halfSpan, B.top);
    shape.lineTo(0, B.top);
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, {
      depth: B.depth,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    });
    geometry.translate(0, 0, -B.depth / 2);
    return geometry;
  }, []);
  useEffect(() => () => deck.dispose(), [deck]);
  return (
    <group>
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[side * BRIDGE_SIZE.halfSpan, BRIDGE_SIZE.pivotY, 0]}>
          <RoundedBlock size={[0.38, 0.65, 0.62]} at={[0, -0.45, 0]} color={S.clay[2]} />
          <RoundedBlock size={[0.56, 0.13, 0.86]} at={[0, -0.82, 0]} color={S.clay[1]} />
          <Shaft radius={0.13} length={0.82} color={S.clay[0]} />
          <group rotation={[0, 0, -side * angle]}>
            <group scale={[-side, 1, 1]}>
              <mesh>
                <primitive object={deck} attach="geometry" dispose={null} />
                <Clay color={S.clay[0]} />
              </mesh>
              {[-0.29, 0.29].map((z) => (
                <group key={z}>
                  {[0.14, 0.55, 0.97].map((x) => (
                    <RoundedBlock
                      key={x}
                      size={[0.05, 0.3, 0.05]}
                      at={[x, BRIDGE_SIZE.top + 0.15, z]}
                      color={S.clay[1]}
                    />
                  ))}
                  <RoundedBlock
                    size={[BRIDGE_SIZE.halfSpan, 0.065, 0.065]}
                    at={[BRIDGE_SIZE.halfSpan / 2, BRIDGE_SIZE.top + 0.31, z]}
                    color={S.clay[2]}
                  />
                </group>
              ))}
              {[0.3, 0.73].map((x) => (
                <RoundedBlock
                  key={x}
                  size={[0.18, 0.008, 0.035]}
                  at={[x, BRIDGE_SIZE.top + 0.005, 0]}
                  color={S.paper}
                />
              ))}
            </group>
          </group>
        </group>
      ))}
    </group>
  );
};

export const ArchRig: React.FC<ArchPose> = ({ seating }) => {
  const S = useStage();
  const wedge = useMemo(() => {
    const shape = new Shape();
    const A = ARCH_SIZE;
    const half = (Math.PI / ARCH_BLOCK_IDS.length - A.seamRadians) / 2;
    shape.moveTo(A.outerRadius * Math.cos(-half), A.outerRadius * Math.sin(-half));
    shape.absarc(0, 0, A.outerRadius, -half, half, false);
    shape.lineTo(A.innerRadius * Math.cos(half), A.innerRadius * Math.sin(half));
    shape.absarc(0, 0, A.innerRadius, half, -half, true);
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, {
      depth: A.depth,
      bevelEnabled: true,
      bevelSize: A.bevel,
      bevelThickness: A.bevel,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 8,
    });
    geometry.translate(0, 0, -A.depth / 2);
    return geometry;
  }, []);
  useEffect(() => () => wedge.dispose(), [wedge]);
  return (
    <group>
      {([-1, 1] as const).map((side) => (
        <group
          key={side}
          position={[(side * (ARCH_SIZE.innerRadius + ARCH_SIZE.outerRadius)) / 2, 0, 0]}
        >
          <RoundedBlock
            size={[0.344, 0.64, 0.56]}
            at={[0, ARCH_SIZE.baseY - 0.32, 0]}
            color={S.clay[1]}
          />
          <RoundedBlock
            size={[0.55, 0.12, 0.75]}
            at={[0, ARCH_SIZE.baseY - 0.7, 0]}
            color={S.clay[2]}
          />
        </group>
      ))}
      <group position={[0, ARCH_SIZE.baseY, 0]}>
        {ARCH_BLOCK_IDS.map((id) => (
          <group
            key={id}
            position={[...archBlockOffset(id, seating[id])]}
            rotation={[0, 0, archBlockAngle(id)]}
          >
            <mesh>
              <primitive object={wedge} attach="geometry" dispose={null} />
              <Clay color={id === 3 ? S.clay[2] : S.clay[id % 2]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
};

const Bridge: React.FC<HeroPropProps> = ({ at }) => (
  <BridgeRig {...sampleBridge(useSceneTime().t - at)} />
);
const Arch: React.FC<HeroPropProps> = ({ at }) => (
  <ArchRig {...sampleArch(useSceneTime().t - at)} />
);

export const STRUCTURE_PROPS = {
  bridge: { Model: Bridge, yaw: -0.32, framing: { scale: 1.1, y: 0.13 } },
  arch: { Model: Arch, yaw: -0.26, framing: { scale: 1.15, y: 0.06 } },
} satisfies Record<'bridge' | 'arch', HeroPropDef>;
