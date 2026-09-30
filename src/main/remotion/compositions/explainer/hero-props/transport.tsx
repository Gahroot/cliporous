/** Seekable transport mechanisms: pose-only rigs, scene-time wrappers. */
import type React from 'react';
import { useEffect, useMemo } from 'react';
import { Curve, ExtrudeGeometry, Path, Shape, TubeGeometry, Vector3 } from 'three';
import { Clay, type HeroPropDef, type HeroPropProps } from '../hero-kit';
import { clamp01 } from '../mechanisms/kinematics';
import type { Vec3 } from '../mechanisms/paths';
import { Shaft, Token, Wheel } from '../mechanisms/primitives';
import { RailBranchBed, RailCarrier, RailStop } from '../mechanisms/rail-hardware';
import { useSceneTime, useStage } from '../stage';
import { Parcel } from './transport-models';
import {
  BELT_RADIUS,
  RAIL_HALF_GAUGE,
  sampleBeltPoint,
  sampleRailHeading,
  sampleRailPoint,
  sampleRailStop,
  sampleRailTrackPoint,
  sampleRailWheelAngles,
  sampleTransportPose,
} from './transport-poses';

const TREAD_IDS = Array.from({ length: 18 }, (_, i) => i);
const CARGO_STARTS = [-0.9, -0.4, 0.1] as const;
const FLOW_IDS = [0, 1, 2, 3, 4] as const;
const TICK_IDS = Array.from({ length: 13 }, (_, i) => i);
const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
const beltDistance = (distance: number): number => Math.max(0, Math.min(0.65, finite(distance)));

function beltShape(half: number): Shape {
  const shape = new Shape();
  shape.moveTo(-half, 0.25);
  shape.lineTo(half, 0.25);
  shape.absarc(half, 0, 0.25, Math.PI / 2, -Math.PI / 2, true);
  shape.lineTo(-half, -0.25);
  shape.absarc(-half, 0, 0.25, -Math.PI / 2, (-3 * Math.PI) / 2, true);
  shape.closePath();
  const hole = new Path();
  hole.moveTo(-half, 0.22);
  hole.absarc(-half, 0, 0.22, Math.PI / 2, (3 * Math.PI) / 2, false);
  hole.lineTo(half, -0.22);
  hole.absarc(half, 0, 0.22, -Math.PI / 2, Math.PI / 2, false);
  hole.closePath();
  shape.holes.push(hole);
  return shape;
}

export interface ConveyorRigProps {
  /** Shared unwrapped belt/cargo travel in model units; the host bounds its action. */
  distance: number;
  /** Two authored lengths; rollers stay circular rather than stretching the rig. */
  halfLength?: 1 | 1.5;
}

/** Bare belt, rollers and stand; cargo belongs to the wrapper or multipart caller. */
export const ConveyorRig: React.FC<ConveyorRigProps> = ({ distance, halfLength = 1 }) => {
  const S = useStage();
  const travel = finite(distance);
  const length = 4 * halfLength + 2 * Math.PI * BELT_RADIUS;
  const geometry = useMemo(
    () =>
      new ExtrudeGeometry(beltShape(halfLength), {
        depth: 0.68,
        bevelEnabled: false,
        curveSegments: 32,
      }),
    [halfLength],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group>
      <mesh position={[0, 0, -0.34]}>
        <primitive object={geometry} attach="geometry" dispose={null} />
        <Clay color={S.clay[2]} />
      </mesh>
      {TREAD_IDS.map((id) => {
        const point = sampleBeltPoint((id * length) / 18 + travel, halfLength);
        return (
          <mesh
            key={id}
            position={[
              point.x + Math.sin(point.angle) * 0.005,
              point.y - Math.cos(point.angle) * 0.005,
              0,
            ]}
            rotation={[0, 0, point.angle]}
          >
            <boxGeometry args={[0.036, 0.012, 0.69]} />
            <Clay color={S.clay[1]} />
          </mesh>
        );
      })}
      {[-halfLength, halfLength].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Shaft radius={0.22} length={0.65} color={S.clay[0]} />
          <group position={[0, 0, 0.35]}>
            <Wheel radius={0.17} angle={-travel / BELT_RADIUS} spokes={5} color={S.accent} />
            <Shaft radius={0.055} length={0.08} color={S.clay[2]} />
          </group>
        </group>
      ))}
      {[-0.36, 0.36].map((z) => (
        <group key={z} position={[0, -0.34, z]} scale={[2 * halfLength + 0.14, 0.14, 0.12]}>
          <Token size={1} color={S.clay[1]} />
        </group>
      ))}
      {[-halfLength + 0.17, halfLength - 0.17].map((x) => (
        <group key={x}>
          <group position={[x, -0.66, 0]} scale={[0.14, 0.65, 0.55]}>
            <Token size={1} color={S.clay[0]} />
          </group>
          <group position={[x, -0.97, 0]} scale={[0.35, 0.12, 0.78]}>
            <Token size={1} color={S.clay[1]} />
          </group>
        </group>
      ))}
    </group>
  );
};

export interface ValveRigProps {
  /** Gate lift and quarter-turn handwheel, normalized 0–1. */
  open: number;
  /** Normalized finite bead transfer; the sampler holds it while shut. */
  flow: number;
  /** Closing controllers may omit beads rather than resetting them behind a closed gate. */
  showFlow?: boolean;
}

export const ValveRig: React.FC<ValveRigProps> = ({ open, flow, showFlow = true }) => {
  const S = useStage();
  const opening = clamp01(open);
  // A bead cannot cross until its entire diameter clears the rising gate.
  const clear = opening >= 0.5;
  const travel = clear ? clamp01(flow) : 0;
  const pipe = useMemo(() => {
    const section = new Shape();
    section.moveTo(0, 0.23);
    section.absarc(0, 0, 0.23, Math.PI / 2, -Math.PI / 2, true);
    section.lineTo(0, -0.18);
    section.absarc(0, 0, 0.18, -Math.PI / 2, Math.PI / 2, false);
    section.closePath();
    return new ExtrudeGeometry(section, { depth: 0.82, bevelEnabled: false, curveSegments: 24 });
  }, []);
  useEffect(() => () => pipe.dispose(), [pipe]);
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          {/* Front halves removed: the flow stays INSIDE the two X-axis pipes. */}
          <mesh position={[side * 0.78 - 0.41, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <primitive object={pipe} attach="geometry" dispose={null} />
            <Clay color={S.clay[1]} />
          </mesh>
          {[0.39, 1.14].map((x) => (
            <mesh key={x} position={[side * x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[0.23, 0.045, 10, 32]} />
              <Clay color={S.clay[2]} />
            </mesh>
          ))}
        </group>
      ))}
      <group position={[0, 0, -0.19]} scale={[0.74, 0.55, 0.16]}>
        <Token size={1} color={S.clay[1]} />
      </group>
      <group position={[0, -0.28, 0]} scale={[0.8, 0.15, 0.55]}>
        <Token size={1} color={S.clay[1]} />
      </group>
      {[-0.28, 0.28].map((x) => (
        <group key={x} position={[x, 0.49, -0.055]} scale={[0.09, 1.04, 0.17]}>
          <Token size={1} color={S.clay[2]} />
        </group>
      ))}
      {/* The cutaway exposes the gate all the way from closed to raised. */}
      <group position={[0, 0.62 * opening, 0.015]} scale={[0.14, 0.42, 0.37]}>
        <Token size={1} color={S.accent} />
      </group>
      <group position={[0, 0.615 + 0.31 * opening, 0]} scale={[1, 0.81 - 0.62 * opening, 1]}>
        <mesh>
          <cylinderGeometry args={[0.055, 0.055, 1, 20]} />
          <Clay color={S.clay[2]} />
        </mesh>
      </group>
      <group position={[0, 1.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <Wheel radius={0.27} angle={(-opening * Math.PI) / 2} spokes={4} color={S.accent2} />
        <group rotation={[0, 0, (-opening * Math.PI) / 2]}>
          <group position={[0.27, 0, -0.06]}>
            <Shaft radius={0.045} length={0.14} color={S.accent} />
          </group>
        </group>
      </group>
      {showFlow &&
        FLOW_IDS.map((id) => {
          const x = -1.04 + id * 0.18 + travel * 1.5;
          return (
            <mesh key={id} position={[x, 0, 0.015]}>
              <sphereGeometry args={[0.06, 20, 12]} />
              <Clay color={S.accent2} />
            </mesh>
          );
        })}
    </group>
  );
};

export interface PressureGaugeRigProps {
  /** Normalized reading, not a physical unit. */
  value: number;
  /** Optional fixed reference notch; omitted by the standalone hero. */
  target?: number;
}

export const PressureGaugeRig: React.FC<PressureGaugeRigProps> = ({ value, target }) => {
  const S = useStage();
  const angle = Math.PI * 1.25 - clamp01(value) * Math.PI * 1.5;
  const targetAngle = Math.PI * 1.25 - clamp01(target ?? 0) * Math.PI * 1.5;
  const needle = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-0.16, -0.06);
    shape.lineTo(0.63, 0);
    shape.lineTo(-0.16, 0.06);
    shape.closePath();
    return new ExtrudeGeometry(shape, {
      depth: 0.035,
      bevelEnabled: true,
      bevelSize: 0.009,
      bevelThickness: 0.009,
      bevelSegments: 2,
    });
  }, []);
  useEffect(() => () => needle.dispose(), [needle]);
  return (
    <group>
      <mesh position={[0, -1.02, -0.045]}>
        <cylinderGeometry args={[0.14, 0.14, 0.4, 24]} />
        <Clay color={S.clay[2]} />
      </mesh>
      <group position={[0, 0, -0.055]}>
        <Shaft radius={0.89} length={0.29} color={S.clay[1]} />
      </group>
      <group position={[0, 0, 0.11]}>
        <Shaft radius={0.79} length={0.04} color={S.card} />
      </group>
      <mesh position={[0, 0, 0.13]}>
        <torusGeometry args={[0.82, 0.075, 12, 64]} />
        <Clay color={S.clay[2]} />
      </mesh>
      {TICK_IDS.map((id) => {
        const tickAngle = Math.PI * 1.25 - (id / 12) * Math.PI * 1.5;
        return (
          <mesh
            key={id}
            position={[Math.cos(tickAngle) * 0.67, Math.sin(tickAngle) * 0.67, 0.15]}
            rotation={[0, 0, tickAngle]}
          >
            <boxGeometry args={[id % 3 === 0 ? 0.14 : 0.085, 0.035, 0.025]} />
            <Clay color={S.text} />
          </mesh>
        );
      })}
      {target !== undefined && (
        <group
          position={[Math.cos(targetAngle) * 0.94, Math.sin(targetAngle) * 0.94, 0.21]}
          rotation={[0, 0, targetAngle - Math.PI / 2]}
        >
          {/* A fixed inward chevron, outside the dial: no invented scale or units. */}
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * 0.07, 0.07, 0]}
              rotation={[0, 0, (-side * Math.PI) / 4]}
            >
              <boxGeometry args={[0.055, 0.21, 0.045]} />
              <Clay color={S.accent2} />
            </mesh>
          ))}
        </group>
      )}
      <mesh position={[0, 0, 0.185]} rotation={[0, 0, angle]}>
        <primitive object={needle} attach="geometry" dispose={null} />
        <Clay color={S.accent} />
      </mesh>
      <group position={[0, 0, 0.22]}>
        <Shaft radius={0.11} length={0.095} color={S.accent2} />
      </group>
    </group>
  );
};

export type RailRoute = 'left' | 'right';
export interface RailSwitchRigProps {
  route: RailRoute;
  /** 0 = opposite seat, 1 = selected route fully seated. */
  seat: number;
  /** Omit for a bare switch. One persistent token otherwise, normalized 0–1. */
  tokenProgress?: number;
}

const RAIL_ENDPOINTS: Readonly<Record<'entry' | 'junction' | RailRoute, Vec3>> = {
  entry: sampleRailPoint(0, 'left'),
  junction: sampleRailPoint(0.45, 'left'),
  left: sampleRailPoint(1, 'left'),
  right: sampleRailPoint(1, 'right'),
};
const RAIL_SECTIONS: readonly { route: RailRoute; start: number; end: number }[] = [
  { route: 'left', start: 0, end: 0.45 },
  { route: 'left', start: 0.45, end: 1 },
  { route: 'right', start: 0.45, end: 1 },
];

/** Exact same centerline as the token sampler, with no spline overshoot at the junction. */
class RailCurve extends Curve<Vector3> {
  constructor(
    private readonly route: RailRoute,
    private readonly start: number,
    private readonly end: number,
    private readonly offset: number,
  ) {
    super();
  }

  getPoint(t: number, target = new Vector3()): Vector3 {
    const point = sampleRailTrackPoint(
      this.start + t * (this.end - this.start),
      this.route,
      this.offset,
    );
    return target.set(...point);
  }
}

export const RailSwitchRig: React.FC<RailSwitchRigProps> = ({ route, seat, tokenProgress }) => {
  const S = useStage();
  const selected: RailRoute = route === 'right' ? 'right' : 'left';
  const seated = clamp01(seat);
  const rails = useMemo(
    () =>
      RAIL_SECTIONS.flatMap(({ route: branch, start, end }) =>
        [-RAIL_HALF_GAUGE, RAIL_HALF_GAUGE].map((offset) => ({
          id: `${branch}-${start}-${offset}`,
          geometry: new TubeGeometry(
            new RailCurve(branch, start, end, offset),
            40,
            0.035,
            8,
            false,
          ),
        })),
      ),
    [],
  );
  useEffect(
    () => () => {
      for (const { geometry } of rails) geometry.dispose();
    },
    [rails],
  );
  const tip = sampleRailPoint(0.66, selected);
  const junction = RAIL_ENDPOINTS.junction;
  const turn = 2 * seated - 1;
  const tipHeading = sampleRailHeading(0.66, selected) * turn;
  // Hold the token's leading edge (not only its centre) before the junction until seated.
  const progress = Math.min(clamp01(tokenProgress ?? 0), seated < 1 ? 0.38 : 1);
  const token = sampleRailPoint(progress, selected);
  return (
    <group>
      <RailBranchBed />
      {RAIL_SECTIONS.flatMap(({ route: branch, start, end }) =>
        [0.15, 0.5, 0.85].map((u) => {
          const p = start + (end - start) * u;
          const a = sampleRailPoint(p, branch);
          const heading = sampleRailHeading(p, branch);
          return (
            <group
              key={`${branch}-${start}-${u}`}
              position={[a[0], a[1], -0.045]}
              rotation={[0, 0, heading]}
              scale={[0.48, 0.09, 0.07]}
            >
              <Token size={1} color={S.clay[1]} />
            </group>
          );
        }),
      )}
      {rails.map(({ id, geometry }) => (
        <mesh key={id}>
          <primitive object={geometry} attach="geometry" dispose={null} />
          <Clay color={S.clay[2]} />
        </mesh>
      ))}
      {[-RAIL_HALF_GAUGE, RAIL_HALF_GAUGE].map((offset) => {
        const dx = tip[0] * turn + (Math.cos(tipHeading) - 1) * offset;
        const dy = tip[1] - junction[1] + Math.sin(tipHeading) * offset;
        const tongueAngle = -Math.atan2(dx, dy);
        const tongueLength = Math.hypot(dx, dy);
        return (
          <group
            key={offset}
            position={[junction[0] + offset, junction[1], 0.0075]}
            rotation={[0, 0, tongueAngle]}
          >
            <group position={[0, tongueLength / 2, 0]} scale={[0.045, tongueLength, 0.04]}>
              <Token size={1} color={S.accent} />
            </group>
            <Shaft radius={0.055} length={0.055} color={S.accent2} />
          </group>
        );
      })}
      {tokenProgress !== undefined &&
        (['left', 'right'] as const).map((branch) => {
          const stop = sampleRailStop(branch);
          return (
            <group key={branch} position={[...stop.position]} rotation={[0, 0, stop.heading]}>
              <RailStop color={branch === selected ? S.accent : S.clay[1]} />
            </group>
          );
        })}
      {tokenProgress !== undefined && (
        <group
          name="rail-car-0"
          position={[...token]}
          rotation={[0, 0, sampleRailHeading(progress, selected)]}
        >
          <RailCarrier color={S.accent2} wheelAngles={sampleRailWheelAngles(progress, selected)} />
        </group>
      )}
    </group>
  );
};

export const Conveyor: React.FC<HeroPropProps> = ({ at }) => {
  const S = useStage();
  const { distance } = sampleTransportPose(useSceneTime().t, at).conveyor;
  const travel = beltDistance(distance);
  return (
    <group>
      <ConveyorRig distance={travel} />
      {CARGO_STARTS.map((x, id) => (
        <group key={x} name={`cargo-${id}`} position={[x + travel, 0.36, 0]}>
          <Parcel size={0.22} color={id === 1 ? S.accent2 : S.accent} />
        </group>
      ))}
    </group>
  );
};
export const Valve: React.FC<HeroPropProps> = ({ at }) => (
  <group rotation={[0.38, 0, 0]}>
    <ValveRig {...sampleTransportPose(useSceneTime().t, at).valve} />
  </group>
);
export const PressureGauge: React.FC<HeroPropProps> = ({ at }) => (
  <PressureGaugeRig {...sampleTransportPose(useSceneTime().t, at).gauge} />
);
export const RailSwitch: React.FC<HeroPropProps> = ({ at }) => (
  <RailSwitchRig {...sampleTransportPose(useSceneTime().t, at).rail} />
);

/** Tones deliberately share one action until reverse mechanisms are approved. */
export const TRANSPORT_PROPS = {
  conveyor: { Model: Conveyor, yaw: -0.28, framing: { scale: 0.97, y: 0.22 } },
  valve: { Model: Valve, yaw: -0.22, framing: { scale: 1.02, y: -0.2 } },
  'pressure-gauge': { Model: PressureGauge, yaw: -0.14, framing: { scale: 1.07, y: 0.09 } },
  'rail-switch': { Model: RailSwitch, yaw: -0.12, framing: { scale: 1.03, y: 0 } },
} satisfies Record<'conveyor' | 'valve' | 'pressure-gauge' | 'rail-switch', HeroPropDef>;
