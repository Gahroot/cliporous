import type React from 'react';
import { useEffect, useMemo } from 'react';
import { EdgesGeometry, ExtrudeGeometry, Quaternion, Shape, Vector3 } from 'three';
import { Clay, type HeroPropDef, type HeroPropProps } from '../hero-kit';
import type { Vec3 } from '../mechanisms/paths';
import { RoundedBlock, Shaft } from '../mechanisms/primitives';
import { useSceneTime, useStage } from '../stage';
import {
  type AperturePose,
  APERTURE_GEOMETRY as IRIS,
  type MagnifierPose,
  type PrismPose,
  sampleAperture,
  sampleMagnifier,
  samplePrism,
  sampleTelescope,
  type TelescopePose,
} from './optics-poses';

/** Straight authored rays and tripod struts share stable unit-cylinder geometry. */
const Segment: React.FC<{
  from: Vec3;
  to: Vec3;
  color: string;
  radius: number;
  progress?: number;
  glow?: boolean;
}> = ({ from, to, color, radius, progress = 1, glow = false }) => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  const rotation = useMemo(
    () =>
      new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(dx, dy, dz).normalize(),
      ),
    [dx, dy, dz],
  );
  return (
    <mesh
      quaternion={rotation}
      position={[
        from[0] + (dx * progress) / 2,
        from[1] + (dy * progress) / 2,
        from[2] + (dz * progress) / 2,
      ]}
      scale={[1, length * Math.max(0.001, progress), 1]}
      visible={progress > 0}
    >
      <cylinderGeometry args={[radius, radius, 1, 12]} />
      <Clay
        color={color}
        emissive={glow ? color : undefined}
        emissiveIntensity={glow ? 0.3 : 0}
        roughness={glow ? 0.35 : 0.55}
      />
    </mesh>
  );
};

const PRISM_CONTACT = 0.65 * (1 - 0.62 / 1.47);
export const PrismRig: React.FC<PrismPose> = ({ incident, through, split }) => {
  const S = useStage();
  const geometry = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-0.65, -0.62);
    shape.lineTo(0.65, -0.62);
    shape.lineTo(0, 0.85);
    shape.closePath();
    const solid = new ExtrudeGeometry(shape, {
      depth: 0.58,
      bevelEnabled: true,
      bevelSize: 0.025,
      bevelThickness: 0.025,
      bevelSegments: 3,
      steps: 1,
      curveSegments: 1,
    });
    solid.translate(0, 0, -0.29);
    return solid;
  }, []);
  const edges = useMemo(() => new EdgesGeometry(geometry, 35), [geometry]);
  useEffect(
    () => () => {
      edges.dispose();
      geometry.dispose();
    },
    [edges, geometry],
  );
  const colors = [S.accent, S.accent2, S.clay[2]];
  return (
    <group>
      <Segment
        from={[-1.65, 0, 0]}
        to={[-PRISM_CONTACT, 0, 0]}
        color={S.paper}
        radius={0.035}
        progress={incident}
        glow
      />
      <Segment
        from={[-PRISM_CONTACT, 0, 0]}
        to={[PRISM_CONTACT, 0, 0]}
        color={S.paper}
        radius={0.035}
        progress={through}
        glow
      />
      {[-0.48, 0, 0.48].map((y, i) => (
        <Segment
          key={y}
          from={[PRISM_CONTACT, 0, 0]}
          to={[1.65, y, 0]}
          color={colors[i]}
          radius={0.032}
          progress={split}
          glow
        />
      ))}
      <mesh>
        <primitive object={geometry} attach="geometry" dispose={null} />
        <meshPhysicalMaterial
          color={S.clay[0]}
          roughness={0.48}
          metalness={0.04}
          clearcoat={0.22}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>
      <lineSegments>
        <primitive object={edges} attach="geometry" dispose={null} />
        <lineBasicMaterial color={S.paper} transparent opacity={0.55} />
      </lineSegments>
    </group>
  );
};

const LEAVES = [0, 1, 2, 3, 4, 5] as const;
export const ApertureRig: React.FC<AperturePose> = ({ closed }) => {
  const S = useStage();
  const blade = useMemo(() => {
    const shape = new Shape();
    const [first, ...rest] = IRIS.points;
    shape.moveTo(...first);
    for (const [x, y] of rest) shape.lineTo(x, y);
    shape.closePath();
    return new ExtrudeGeometry(shape, {
      depth: IRIS.bladeDepth,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    });
  }, []);
  useEffect(() => () => blade.dispose(), [blade]);
  return (
    <group>
      <group position={[0, 0, -0.14]}>
        <Shaft radius={IRIS.outerRadius} length={0.2} color={S.clay[2]} />
      </group>
      <mesh position={[0, 0, -0.032]}>
        <circleGeometry args={[0.99, 48]} />
        <Clay color={S.card} />
      </mesh>
      {LEAVES.map((i) => (
        <group key={i} rotation={[0, 0, (i * Math.PI) / 3]}>
          <group
            position={[IRIS.pivot, 0, i * IRIS.layerStep]}
            rotation={[0, 0, closed * IRIS.swing]}
          >
            <mesh>
              <primitive object={blade} attach="geometry" dispose={null} />
              <Clay color={S.clay[i % 3]} metalness={0.15} roughness={0.48} />
            </mesh>
          </group>
        </group>
      ))}
      {/* The rim masks the spare outer blade area, leaving six continuous moving edges. */}
      <mesh position={[0, 0, 0.17]}>
        <ringGeometry args={[IRIS.innerRadius, IRIS.outerRadius, 64]} />
        <Clay color={S.clay[0]} />
      </mesh>
      <mesh position={[0, 0, 0.14]}>
        <torusGeometry args={[IRIS.outerRadius - 0.06, 0.075, 10, 64]} />
        <Clay color={S.clay[1]} />
      </mesh>
      <mesh position={[0, 0, 0.175]}>
        <torusGeometry args={[0.79, 0.028, 8, 64]} />
        <Clay color={S.clay[2]} />
      </mesh>
      {LEAVES.map((i) => (
        <group
          key={i}
          position={[Math.cos((i * Math.PI) / 3) * 1.1, Math.sin((i * Math.PI) / 3) * 1.1, 0.184]}
        >
          <Shaft radius={0.025} length={0.025} color={S.paper} />
        </group>
      ))}
    </group>
  );
};

/** One authored mark, not unrelated content substituted inside the lens. */
const PaperDetail: React.FC<{ scale: number }> = ({ scale }) => {
  const S = useStage();
  return (
    <group position={[0, 0.22, 0.065]} scale={scale}>
      {[0.18, 0.25, 0.12].map((width, i) => (
        <RoundedBlock
          key={width}
          size={[width, 0.035, 0.012]}
          at={[0, (i - 1) * 0.095, 0]}
          color={S.clay[2]}
        />
      ))}
    </group>
  );
};

export const MagnifierRig: React.FC<MagnifierPose> = ({ x, y, magnification }) => {
  const S = useStage();
  return (
    <group>
      <RoundedBlock size={[1.5, 1.65, 0.1]} at={[-0.08, 0, 0]} color={S.paper} />
      <RoundedBlock size={[0.62, 0.032, 0.012]} at={[-0.16, -0.45, 0.06]} color={S.clay[1]} />
      <RoundedBlock size={[0.4, 0.032, 0.012]} at={[-0.27, -0.58, 0.06]} color={S.clay[1]} />
      <PaperDetail scale={magnification} />
      <group position={[x, y, 0.25]}>
        <mesh>
          <torusGeometry args={[0.53, 0.065, 12, 56]} />
          <Clay color={S.clay[1]} roughness={0.38} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0, 0.018]}>
          <circleGeometry args={[0.468, 48]} />
          <meshPhysicalMaterial
            color={S.accent2}
            roughness={0.38}
            transparent
            opacity={0.12}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0.44, -0.44, 0]}>
          <sphereGeometry args={[0.105, 16, 12]} />
          <Clay color={S.clay[1]} />
        </mesh>
        <mesh position={[0.73, -0.73, 0]} rotation={[0, 0, Math.PI / 4]}>
          <capsuleGeometry args={[0.105, 0.62, 6, 16]} />
          <Clay color={S.clay[2]} />
        </mesh>
      </group>
    </group>
  );
};

/** A hollow X-axis tube, with clay collars; no geometry changes during extension. */
const TelescopeTube: React.FC<{ radius: number; length: number; color: string }> = ({
  radius,
  length,
  color,
}) => (
  <group>
    <mesh rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[radius, radius, length, 32, 1, true]} />
      <Clay color={color} roughness={0.45} />
    </mesh>
    {[-1, 1].map((side) => (
      <mesh key={side} position={[(side * length) / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[radius, 0.028, 8, 32]} />
        <Clay color={color} />
      </mesh>
    ))}
  </group>
);

export const TelescopeRig: React.FC<TelescopePose> = ({ extension, aim }) => {
  const S = useStage();
  return (
    <group position={[-0.15, 0, 0]}>
      <Segment from={[0, -0.55, 0]} to={[0, 0.18, 0]} radius={0.09} color={S.clay[2]} />
      {(
        [
          [-0.6, -1, 0.35],
          [0.6, -1, 0.35],
          [0, -1, -0.55],
        ] as const
      ).map((foot) => (
        <Segment key={foot[0]} from={[0, -0.5, 0]} to={foot} radius={0.055} color={S.clay[1]} />
      ))}
      <mesh position={[0, 0.18, 0]}>
        <sphereGeometry args={[0.16, 20, 16]} />
        <Clay color={S.clay[2]} />
      </mesh>
      <group position={[0, 0.25, 0]} rotation={[0, 0, -aim]}>
        <group position={[-0.25, 0, 0]}>
          <TelescopeTube radius={0.38} length={0.9} color={S.clay[0]} />
        </group>
        <group position={[0.07 + 0.4 * extension, 0, 0]}>
          <TelescopeTube radius={0.3} length={0.8} color={S.clay[1]} />
        </group>
        <group position={[0.25 + 0.75 * extension, 0, 0]}>
          <TelescopeTube radius={0.23} length={0.65} color={S.clay[2]} />
        </group>
        <mesh position={[-0.704, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <circleGeometry args={[0.353, 40]} />
          <Clay color={S.card} roughness={0.3} />
        </mesh>
        <mesh position={[-0.708, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <circleGeometry args={[0.326, 40]} />
          <meshPhysicalMaterial
            color={S.accent2}
            transparent
            opacity={0.25}
            roughness={0.35}
            depthWrite={false}
          />
        </mesh>
        <group position={[0.6 + 0.75 * extension, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <Shaft radius={0.19} length={0.12} color={S.clay[2]} />
          <mesh position={[0, 0, 0.063]}>
            <circleGeometry args={[0.135, 32]} />
            <Clay color={S.card} />
          </mesh>
        </group>
      </group>
    </group>
  );
};

const Prism: React.FC<HeroPropProps> = ({ at }) => (
  <PrismRig {...samplePrism(useSceneTime().t - at)} />
);
const Aperture: React.FC<HeroPropProps> = ({ at }) => (
  <ApertureRig {...sampleAperture(useSceneTime().t - at)} />
);
const MagnifyingGlass: React.FC<HeroPropProps> = ({ at }) => (
  <MagnifierRig {...sampleMagnifier(useSceneTime().t - at)} />
);
const Telescope: React.FC<HeroPropProps> = ({ at }) => (
  <TelescopeRig {...sampleTelescope(useSceneTime().t - at)} />
);

export const OPTICS_PROPS = {
  prism: { Model: Prism, yaw: -0.3, framing: { scale: 1, y: 0.06 } },
  aperture: { Model: Aperture, yaw: -0.2, framing: { scale: 1, y: 0.04 } },
  'magnifying-glass': { Model: MagnifyingGlass, yaw: -0.18, framing: { scale: 1.06, y: 0.04 } },
  telescope: { Model: Telescope, yaw: 0.45, framing: { scale: 1.03, y: 0.12 } },
} satisfies Record<'prism' | 'aperture' | 'magnifying-glass' | 'telescope', HeroPropDef>;
