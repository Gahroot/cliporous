import type React from 'react';
import { Quaternion, Vector3 } from 'three';
import { Clay } from '../hero-kit';
import { ParcelRig } from '../hero-props/storage';
import { ConveyorRig } from '../hero-props/transport';
import { useStage } from '../stage';
import type { Vec3 } from './paths';
import { type ParcelProcessPose, RELAY_BELT, RELAY_PARCEL, type RelayPulse } from './relay-poses';

/** Authored mail, not a generic token: fixed 0.5 × 0.05 × 0.30 envelope with folded seams. */
export const MailRig: React.FC = () => {
  const S = useStage();
  return (
    <group name="mail-workpiece">
      <mesh>
        <boxGeometry args={[0.5, 0.05, 0.3]} />
        <Clay color={S.paper} />
      </mesh>
      <SignalWire
        points={[
          [-0.24, 0.026, -0.14],
          [0, 0.026, 0.06],
          [0.24, 0.026, -0.14],
        ]}
        color={S.clay[1]}
        radius={0.006}
      />
      <mesh position={[0.15, 0.027, 0.07]}>
        <boxGeometry args={[0.08, 0.003, 0.08]} />
        <Clay color={S.accent} />
      </mesh>
    </group>
  );
};

/** Ferrous ring, with a real central hole and a tangent pole contact. */
export const SteelWasherRig: React.FC = () => {
  const S = useStage();
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.115, 0.025, 10, 32]} />
      <Clay color={S.clay[2]} metalness={0.3} />
    </mesh>
  );
};

/** Piecewise-linear cylinders share EXACT endpoints with samplePolyline's signal trajectory. */
export const SignalWire: React.FC<{ points: readonly Vec3[]; color: string; radius?: number }> = ({
  points,
  color,
  radius = 0.022,
}) => (
  <group>
    {points.slice(1).map((b, i) => {
      const a = points[i];
      const delta = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const length = delta.length();
      if (length === 0) return null;
      const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize());
      return (
        <mesh
          key={`${a.join(',')}:${b.join(',')}`}
          position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]}
          quaternion={rotation}
        >
          <cylinderGeometry args={[radius, radius, length, 8]} />
          <Clay color={color} />
        </mesh>
      );
    })}
  </group>
);

export const SignalPulse: React.FC<{ pulse: RelayPulse }> = ({ pulse }) => {
  const S = useStage();
  return (
    <mesh position={[...pulse.position]} visible={pulse.visible}>
      <sphereGeometry args={[0.065, 14, 10]} />
      <Clay color={S.accent2} emissive={S.accent2} emissiveIntensity={0.7} />
    </mesh>
  );
};

export const ParcelProcessRig: React.FC<{ pose: ParcelProcessPose }> = ({ pose }) => {
  const S = useStage();
  return (
    <group>
      <group position={[...RELAY_BELT.position]} scale={RELAY_BELT.scale}>
        <ConveyorRig distance={pose.beltDistance} />
      </group>
      {/* Supported transfer bridge: its top and both receiver floors are exactly y=-0.55. */}
      <mesh position={[1.285, -0.59, 0]}>
        <boxGeometry args={[0.32, 0.08, 0.42]} />
        <Clay color={S.clay[1]} />
      </mesh>
      <group position={[...RELAY_PARCEL.position]} scale={RELAY_PARCEL.scale}>
        <ParcelRig {...pose.parcel} />
      </group>
      <group position={[...pose.carrier.position]}>
        {pose.carrier.material === 'mail' ? <MailRig /> : <SteelWasherRig />}
      </group>
    </group>
  );
};
