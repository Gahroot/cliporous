import type React from 'react';
import { useEffect, useMemo } from 'react';
import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Clay, roundedRectGeometry } from '../hero-kit';
import { useStage } from '../stage';
import type { Vec3 } from './paths';

// Dimensions are local scene units; parents own placement and frame-driven transforms.
// Owned geometries attach as primitives (no R3F auto-disposal); effects own cleanup.
// Declarative geometries and Clay materials retain normal R3F disposal.

export interface RoundedHousingProps {
  width: number;
  height: number;
  cornerRadius?: number;
  color?: string;
}

/** Flat rounded backing plate, centred in XY and facing +Z. */
export const RoundedHousing: React.FC<RoundedHousingProps> = ({
  width,
  height,
  cornerRadius = 0.12,
  color,
}) => {
  const S = useStage();
  const geometry = useMemo(
    () => roundedRectGeometry(width, height, cornerRadius),
    [width, height, cornerRadius],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh>
      <primitive object={geometry} attach="geometry" dispose={null} />
      <Clay color={color ?? S.clay[0]} />
    </mesh>
  );
};

export interface ShaftProps {
  radius: number;
  /** End-to-end length along Z, centred on the origin. */
  length: number;
  color?: string;
}

export const Shaft: React.FC<ShaftProps> = ({ radius, length, color }) => {
  const S = useStage();
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[radius, radius, length, 24]} />
      <Clay color={color ?? S.clay[2]} />
    </mesh>
  );
};

export interface WheelProps {
  /** Radius to the rim tube's centreline; tube thickness is 8% of this. */
  radius: number;
  /** Rotation about Z in radians; only the enclosing group rotates. */
  angle: number;
  color?: string;
  /** Authored positive integer; all spokes have identical dimensions. */
  spokes?: number;
}

/** Hub, torus rim and radial spokes rotate together in the XY plane. */
export const Wheel: React.FC<WheelProps> = ({ radius, angle, color, spokes = 6 }) => {
  const S = useStage();
  const clay = color ?? S.clay[1];
  const count = Number.isFinite(spokes) ? Math.max(1, Math.min(12, Math.floor(spokes))) : 6;
  const spokeAngles = useMemo(
    () => Array.from({ length: count }, (_, i) => (i * Math.PI * 2) / count),
    [count],
  );
  const spokeDimensions: [number, number, number] = [radius, radius * 0.1, radius * 0.12];
  return (
    <group rotation={[0, 0, angle]}>
      <Shaft radius={radius * 0.18} length={radius * 0.32} color={clay} />
      <mesh>
        <torusGeometry args={[radius, radius * 0.08, 8, 48]} />
        <Clay color={clay} />
      </mesh>
      {spokeAngles.map((spokeAngle) => (
        <mesh
          key={spokeAngle}
          position={[Math.cos(spokeAngle) * radius * 0.5, Math.sin(spokeAngle) * radius * 0.5, 0]}
          rotation={[0, 0, spokeAngle]}
        >
          <boxGeometry args={spokeDimensions} />
          <Clay color={clay} />
        </mesh>
      ))}
    </group>
  );
};

export interface CableProps {
  /** Fixed authored local points (at least two); keep the array identity stable. */
  points: readonly Vec3[];
  /** Tube cross-section radius, not diameter. */
  radius?: number;
  color?: string;
}

/** Open centripetal spline with a fixed budget of 64 tubular × 8 radial segments. */
export const Cable: React.FC<CableProps> = ({ points, radius = 0.035, color }) => {
  const S = useStage();
  const geometry = useMemo(() => {
    if (
      points.length < 2 ||
      points.length > 64 ||
      !points.every((point) => point.every(Number.isFinite)) ||
      !Number.isFinite(radius) ||
      radius <= 0
    )
      throw new RangeError('Cable requires 2–64 finite authored points and a positive radius');
    const curve = new CatmullRomCurve3(
      points.map(([x, y, z]) => new Vector3(x, y, z)),
      false,
      'centripetal',
    );
    return new TubeGeometry(curve, 64, radius, 8, false);
  }, [points, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh>
      <primitive object={geometry} attach="geometry" dispose={null} />
      <Clay color={color ?? S.clay[2]} />
    </mesh>
  );
};

export interface TokenProps {
  /** Cube edge length; rounding is 18% of this. Animate a parent group, not size. */
  size?: number;
  color?: string;
}

/** Small rounded cube centred at the origin, ready for parent-driven transfers. */
export const Token: React.FC<TokenProps> = ({ size = 0.2, color }) => {
  const S = useStage();
  const geometry = useMemo(() => new RoundedBoxGeometry(size, size, size, 3, size * 0.18), [size]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh>
      <primitive object={geometry} attach="geometry" dispose={null} />
      <Clay color={color ?? S.accent} />
    </mesh>
  );
};

/** Repeated panels/housings transform bounded rounded geometry instead of rebuilding it. */
export const RoundedBlock: React.FC<{
  size: [number, number, number];
  at?: [number, number, number];
  color?: string;
}> = ({ size, at, color }) => (
  <group position={at} scale={size}>
    <Token size={1} color={color} />
  </group>
);
