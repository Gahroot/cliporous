/** Small authored cargo/contact models. Parents own identity, trajectory and timing. */
import type React from 'react';
import { useEffect, useMemo } from 'react';
import { Clay, lathe } from '../hero-kit';
import { useStage } from '../stage';

/** Centred carton: the flat base remains exactly -size/2, including the tape. Six meshes. */
export const Parcel: React.FC<{ size: number; color: string }> = ({ size, color }) => {
  const S = useStage();
  return (
    <group name="parcel" scale={size}>
      <mesh name="carton">
        <boxGeometry args={[1, 1, 0.86]} />
        <Clay color={color} />
      </mesh>
      <mesh name="lid-seam" position={[0, 0.5005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.96, 0.018]} />
        <Clay color={S.clay[2]} />
      </mesh>
      <mesh name="packing-tape" position={[0, 0.501, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.2, 0.86]} />
        <Clay color={S.paper} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          name="tape-end"
          position={[0, 0.32, side * 0.4305]}
          rotation={[0, side === -1 ? Math.PI : 0, 0]}
        >
          <planeGeometry args={[0.2, 0.36]} />
          <Clay color={S.paper} />
        </mesh>
      ))}
      <mesh name="shipping-label" position={[0.29, -0.12, 0.431]}>
        <planeGeometry args={[0.24, 0.17]} />
        <Clay color={S.paper} />
      </mesh>
    </group>
  );
};

// Unit-height lifting weight. The eye's outer top is exactly +0.5; base is -0.5.
export const WEIGHT_CONTACT = { base: -0.5, eyeY: 0.34, eyeRadius: 0.12, eyeTube: 0.04 } as const;

/** Cast lifting weight, not a crate. Width/height include its lifting eye and flat foot. */
export const Counterweight: React.FC<{ width: number; height: number; color: string }> = ({
  width,
  height,
  color,
}) => {
  const S = useStage();
  const body = useMemo(
    () =>
      lathe(
        [
          [0, -0.5],
          [0.46, -0.5],
          [0.5, -0.46],
          [0.5, -0.38],
          [0.46, -0.34],
          [0.36, 0.08],
          [0.28, 0.16],
          [0.1, 0.16],
          [0.1, 0.24],
          [0, 0.24],
        ],
        24,
      ),
    [],
  );
  useEffect(() => () => body.dispose(), [body]);
  return (
    <group name="cast-counterweight" scale={[width, height, width]}>
      <mesh name="weight-body">
        <primitive object={body} attach="geometry" dispose={null} />
        <Clay color={color} />
      </mesh>
      <mesh name="lifting-eye" position={[0, WEIGHT_CONTACT.eyeY, 0]}>
        <torusGeometry args={[WEIGHT_CONTACT.eyeRadius, WEIGHT_CONTACT.eyeTube, 8, 24]} />
        <Clay color={S.clay[2]} />
      </mesh>
    </group>
  );
};

/** Centred cable reel, axle along X. Two end cheeks and one grooved winding mesh. */
export const CableReel: React.FC<{ radius: number; length: number; color: string }> = ({
  radius,
  length,
  color,
}) => {
  const S = useStage();
  const winding = useMemo(() => {
    const profile: [number, number][] = [
      [0, -0.44],
      [0.76, -0.44],
    ];
    for (let turn = 0; turn < 7; turn++) {
      const x = -0.44 + (turn * 0.88) / 7;
      profile.push([0.82, x + 0.025], [0.82, x + 0.1], [0.76, x + 0.88 / 7]);
    }
    profile.push([0, 0.44]);
    return lathe(profile, 24);
  }, []);
  useEffect(() => () => winding.dispose(), [winding]);
  return (
    <group name="cable-reel">
      <mesh name="wound-cable" rotation={[0, 0, -Math.PI / 2]} scale={[radius, length, radius]}>
        <primitive object={winding} attach="geometry" dispose={null} />
        <Clay color={S.clay[2]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          name="reel-cheek"
          position={[side * length * 0.47, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
        >
          <cylinderGeometry args={[radius, radius, length * 0.06, 24]} />
          <Clay color={color} />
        </mesh>
      ))}
    </group>
  );
};

/** Effort ram with a flat pressure foot. Its bottom remains at -height/2. */
export const PressureFoot: React.FC<{ width: number; height: number; color: string }> = ({
  width,
  height,
  color,
}) => {
  const S = useStage();
  return (
    <group name="pressure-foot" scale={[width, height, width]}>
      <mesh position={[0, -0.36, 0]}>
        <cylinderGeometry args={[0.4, 0.5, 0.28, 24]} />
        <Clay color={color} />
      </mesh>
      <mesh position={[0, 0.09, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.62, 16]} />
        <Clay color={S.clay[2]} />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.1, 20]} />
        <Clay color={color} />
      </mesh>
    </group>
  );
};

/** Cable end is the origin; a closed pull-ring meets it at the ring's outer top. */
export const PullRing: React.FC<{ radius: number; color: string }> = ({ radius, color }) => (
  <mesh name="cable-pull-ring" position={[0, -radius, 0]}>
    <torusGeometry args={[radius * 0.78, radius * 0.22, 8, 24]} />
    <Clay color={color} />
  </mesh>
);

/** Unit tangential shoe: the replaceable friction pad preserves the original +Y contact. */
export const DriveShoe: React.FC<{ color: string }> = ({ color }) => {
  const S = useStage();
  return (
    <group name="drive-shoe">
      <mesh position={[0, -0.14, 0]}>
        <boxGeometry args={[0.96, 0.72, 0.86]} />
        <Clay color={color} />
      </mesh>
      <mesh name="friction-pad" position={[0, 0.36, 0]}>
        <boxGeometry args={[1, 0.28, 1]} />
        <Clay color={S.clay[2]} />
      </mesh>
      <mesh name="shoe-pin" position={[0, -0.16, 0.435]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.11, 0.11, 0.02, 12]} />
        <Clay color={S.accent2} />
      </mesh>
    </group>
  );
};
