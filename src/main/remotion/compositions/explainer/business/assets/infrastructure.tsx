import type React from 'react';
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { useStage } from '../../stage';

type Point = readonly [number, number, number];
type AuthoredBox = { size: Point; position: Point };
type Batch = { positions: Float32Array; normals: Float32Array };

/** Fixed authored solids, batched by material like the Detroit facade details. */
function boxBatch(boxes: readonly AuthoredBox[]): Batch {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const { size, position } of boxes) {
    for (const axis of [0, 1, 2] as const) {
      const u = (axis + 1) % 3;
      const v = (axis + 2) % 3;
      for (const side of [-1, 1]) {
        const corners = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ];
        for (const index of side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) {
          const point = [...position];
          point[axis] += (side * size[axis]) / 2;
          point[u] += (corners[index][0] * size[u]) / 2;
          point[v] += (corners[index][1] * size[v]) / 2;
          positions.push(...point);
          normals.push(axis === 0 ? side : 0, axis === 1 ? side : 0, axis === 2 ? side : 0);
        }
      }
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals) };
}

/** Private: only code-owned batches reach this component, never scene-supplied geometry. */
function BatchedDetails({
  batch,
  color,
  name,
  opacity,
}: {
  batch: Batch;
  color: string;
  name: string;
  opacity?: number;
}): React.ReactElement {
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    result.setAttribute('position', new BufferAttribute(batch.positions, 3));
    result.setAttribute('normal', new BufferAttribute(batch.normals, 3));
    return result;
  }, [batch]);
  // The component owns this non-intrinsic geometry; intrinsic materials remain R3F-owned.
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh name={name} geometry={geometry}>
      <Clay color={color} opacity={opacity} />
    </mesh>
  );
}

function unit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

const RACK_ROWS = [-1, -0.6, -0.2, 0.2, 0.6, 1] as const;
const RACK_TRAYS = boxBatch(
  RACK_ROWS.map((y) => ({ size: [1.96, 0.27, 1.2], position: [0, y, 0] })),
);
const RACK_FACE = boxBatch(
  RACK_ROWS.flatMap((y): AuthoredBox[] => [
    ...[-0.06, 0, 0.06].map(
      (dy): AuthoredBox => ({
        size: [0.84, 0.024, 0.028],
        position: [-0.32, y + dy, 0.616],
      }),
    ),
    ...[-0.83, 0.83].map(
      (x): AuthoredBox => ({
        size: [0.06, 0.12, 0.055],
        position: [x, y, 0.63],
      }),
    ),
  ]),
);
const RACK_MARKERS = boxBatch(
  RACK_ROWS.map((y) => ({ size: [0.12, 0.075, 0.036], position: [0.56, y, 0.626] })),
);

/** A-13: six fixed server trays, cabinet rails, vents and handles; no live monitoring. */
export function DataCenterRack({ activity }: { activity: number }): React.ReactElement {
  const S = useStage();
  return (
    <group name="data-center-rack">
      <ClayBlock size={[2.36, 0.16, 1.44]} position={[0, -1.28, 0]} color={S.clay[2]} />
      <ClayBlock size={[2.36, 0.16, 1.44]} position={[0, 1.28, 0]} color={S.clay[0]} />
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[0.14, 2.4, 1.44]}
          position={[side * 1.1, 0, 0]}
          color={S.clay[0]}
        />
      ))}
      <ClayBlock size={[2.06, 2.4, 0.1]} position={[0, 0, -0.65]} color={S.clay[0]} />
      <BatchedDetails name="server-trays" batch={RACK_TRAYS} color={S.clay[1]} />
      <BatchedDetails name="rack-vents-and-handles" batch={RACK_FACE} color={S.clay[2]} />
      {/* Illustrative emphasis only: no blinking, measured load or inferred power state. */}
      <BatchedDetails
        name="rack-emphasis"
        batch={RACK_MARKERS}
        color={S.accent}
        opacity={unit(activity)}
      />
    </group>
  );
}

const TRANSFORMER_FINS = boxBatch(
  [-0.97, -0.76, -0.55, -0.34, -0.13, 0.08].map((x) => ({
    size: [0.11, 1.05, 0.23],
    position: [x, -0.38, 0.65],
  })),
);

/** A-14: transformer tank, radiator, ceramic bushings and a source-controlled disconnect. */
export function PowerReadinessSubstation({ ready }: { ready: boolean }): React.ReactElement {
  const S = useStage();
  return (
    <group name={ready ? 'substation-ready' : 'substation-not-ready'}>
      <ClayBlock size={[3, 0.16, 1.9]} position={[0, -1.1, 0]} color={S.clay[1]} />
      <ClayBlock size={[1.3, 1.3, 1.1]} position={[-0.45, -0.36, 0]} color={S.clay[0]} />
      <ClayBlock size={[1.48, 0.12, 1.22]} position={[-0.45, 0.35, 0]} color={S.clay[2]} />
      <BatchedDetails name="transformer-radiator" batch={TRANSFORMER_FINS} color={S.clay[2]} />
      {[-0.82, -0.08].map((x) => (
        <group key={x} name="transformer-bushing" position={[x, 0, 0]}>
          <mesh position={[0, 0.65, 0]}>
            <cylinderGeometry args={[0.13, 0.16, 0.48, 12]} />
            <Clay color={S.clay[1]} />
          </mesh>
          {[0.5, 0.65, 0.8].map((y) => (
            <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.15, 0.025, 6, 12]} />
              <Clay color={S.clay[1]} />
            </mesh>
          ))}
          <mesh position={[0, 1, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.24, 10]} />
            <Clay color={S.clay[2]} />
          </mesh>
        </group>
      ))}
      <ClayBlock size={[0.42, 1.65, 0.7]} position={[1.03, -0.2, 0]} color={S.clay[0]} />
      <mesh position={[1.03, 0.85, 0]}>
        <cylinderGeometry args={[0.105, 0.13, 0.42, 12]} />
        <Clay color={S.clay[1]} />
      </mesh>
      <ClayBlock size={[0.4, 0.07, 0.07]} position={[0.12, 1.1, 0]} color={S.clay[2]} />
      {/* Not-ready retains an open physical gap indefinitely, independent of the frame. */}
      <group
        name="readiness-disconnect"
        position={[1.03, 1.1, 0]}
        rotation={[0, 0, ready ? 0 : -Math.PI / 4]}
      >
        <ClayBlock size={[0.75, 0.065, 0.065]} position={[-0.375, 0, 0]} color={S.clay[2]} />
      </group>
      <ClayBlock
        size={[0.26, 0.13, 0.045]}
        position={[1.03, 0.32, 0.375]}
        color={ready ? S.positive : S.negative}
        radius={0.02}
      />
    </group>
  );
}

const COOLING_FINS = boxBatch(
  Array.from({ length: 10 }, (_, index) => ({
    size: [0.035, 1.54, 0.08] as const,
    position: [0.13 + index * 0.12, -0.08, 0.365] as const,
  })),
);
const FAN_BLADES = boxBatch([
  { size: [0.3, 0.085, 0.05], position: [0.49, -0.12, 0.505] },
  { size: [0.3, 0.085, 0.05], position: [0.87, -0.12, 0.505] },
  { size: [0.085, 0.3, 0.05], position: [0.68, -0.31, 0.505] },
  { size: [0.085, 0.3, 0.05], position: [0.68, 0.07, 0.505] },
]);

/** A-15: fixed pump, supply/return loop and heat exchanger; active is declared, not measured. */
export function CoolingLoop({ active }: { active: boolean }): React.ReactElement {
  const S = useStage();
  const pipeColor = active ? S.accent : S.clay[2];
  return (
    <group name={active ? 'cooling-declared-active' : 'cooling-declared-inactive'}>
      <ClayBlock size={[3.2, 0.16, 1.65]} position={[0, -1.13, 0]} color={S.clay[1]} />
      <ClayBlock size={[1.3, 1.85, 0.65]} position={[0.68, -0.08, 0]} color={S.clay[0]} />
      <ClayBlock size={[1.46, 0.12, 0.78]} position={[0.68, 0.91, 0]} color={S.clay[2]} />
      <BatchedDetails name="heat-exchanger-fins" batch={COOLING_FINS} color={S.clay[2]} />
      <mesh name="fixed-fan-face" position={[0.68, -0.12, 0.445]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.08, 16]} />
        <Clay color={S.clay[1]} />
      </mesh>
      <mesh position={[0.68, -0.12, 0.455]}>
        <torusGeometry args={[0.47, 0.045, 6, 16]} />
        <Clay color={S.clay[2]} />
      </mesh>
      <mesh position={[0.68, -0.12, 0.49]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.105, 0.105, 0.11, 12]} />
        <Clay color={pipeColor} />
      </mesh>
      {/* Static fan silhouette: no airflow animation or invented throughput. */}
      <BatchedDetails name="fixed-fan-blades" batch={FAN_BLADES} color={S.clay[2]} />
      <mesh name="loop-pump" position={[-0.89, -0.8, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.3, 0.3, 0.55, 12]} />
        <Clay color={S.clay[0]} />
      </mesh>
      <ClayBlock size={[0.8, 0.1, 0.65]} position={[-0.89, -1, 0]} color={S.clay[2]} />
      <ClayBlock size={[0.18, 0.45, 0.45]} position={[-1.19, -0.8, 0]} color={S.clay[2]} />
      {[-1.2, 0.06].map((x) => (
        <mesh key={x} name="loop-vertical-pipe" position={[x, 0.015, 0]}>
          <cylinderGeometry args={[0.065, 0.065, 1.57, 10]} />
          <Clay color={pipeColor} />
        </mesh>
      ))}
      {[-0.77, 0.8].map((y) => (
        <mesh
          key={y}
          name="loop-horizontal-pipe"
          position={[-0.57, y, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.065, 0.065, 1.26, 10]} />
          <Clay color={pipeColor} />
        </mesh>
      ))}
      {[-1.2, 0.06].flatMap((x) =>
        [-0.77, 0.8].map((y) => (
          <mesh key={`${x}-${y}`} name="pipe-coupling" position={[x, y, 0]}>
            <sphereGeometry args={[0.09, 12, 8]} />
            <Clay color={pipeColor} />
          </mesh>
        )),
      )}
    </group>
  );
}

const PORTS = [-0.55, 0.55].flatMap((x) => [-0.36, 0.36].map((y) => [x, y] as const));
const SOCKETS = boxBatch(
  PORTS.map(([x, y]) => ({ size: [0.58, 0.4, 0.12], position: [x, y, 0.07] })),
);
const SOCKET_INSETS = boxBatch(
  PORTS.map(([x, y]) => ({ size: [0.4, 0.24, 0.018], position: [x, y, 0.139] })),
);
const CONTACTS = boxBatch([
  ...PORTS.flatMap(([x, y]) =>
    [-0.09, 0.09].map(
      (dx): AuthoredBox => ({
        size: [0.07, 0.1, 0.022],
        position: [x + dx, y, 0.158],
      }),
    ),
  ),
  ...[-1.17, 1.17].flatMap((x) =>
    [-0.85, 0.85].map(
      (y): AuthoredBox => ({
        size: [0.08, 0.08, 0.05],
        position: [x, y, 0.14],
      }),
    ),
  ),
]);
const PLUGS = boxBatch(PORTS.map(([x, y]) => ({ size: [0.5, 0.3, 0.3], position: [x, y, 0.41] })));
const PLUG_PINS = boxBatch(
  PORTS.flatMap(([x, y]) =>
    [-0.09, 0.09].map(
      (dx): AuthoredBox => ({
        size: [0.05, 0.085, 0.2],
        position: [x + dx, y, 0.22],
      }),
    ),
  ),
);
const STRAIN_RELIEFS = boxBatch(
  PORTS.map(([x, y]) => ({ size: [0.16, 0.16, 0.2], position: [x, y, 0.63] })),
);
const CABLE_SLEEVES = boxBatch(
  PORTS.map(([x, y]) => ({ size: [0.1, 0.1, 0.6], position: [x, y, 1] })),
);

/** A-16: neutral four-port patch panel; declared configuration is not observed performance. */
export function ProviderConnectorPanel({
  connected,
  progress,
}: {
  connected: boolean;
  progress: number;
}): React.ReactElement {
  const S = useStage();
  // A disconnected source state always retains the full gap, even at progress=1.
  const offset = connected ? 0.65 * (1 - unit(progress)) : 0.65;
  return (
    <group name={connected ? 'provider-declared-connected' : 'provider-declared-disconnected'}>
      <ClayBlock size={[2.6, 2, 0.18]} position={[0, 0, -0.08]} color={S.clay[0]} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <ClayBlock size={[2.76, 0.13, 0.32]} position={[0, side * 1.02, 0]} color={S.clay[2]} />
          <ClayBlock size={[0.13, 1.91, 0.32]} position={[side * 1.315, 0, 0]} color={S.clay[2]} />
        </group>
      ))}
      <BatchedDetails name="provider-sockets" batch={SOCKETS} color={S.clay[1]} />
      <BatchedDetails name="provider-socket-insets" batch={SOCKET_INSETS} color={S.clay[2]} />
      <BatchedDetails name="provider-contacts-and-fasteners" batch={CONTACTS} color={S.clay[1]} />
      <ClayBlock
        size={[0.88, 0.13, 0.04]}
        position={[0, 0.77, 0.05]}
        color={connected ? S.accent : S.clay[1]}
        radius={0.02}
      />
      <group name="provider-plugs" position={[0, 0, offset]}>
        <BatchedDetails name="provider-plug-bodies" batch={PLUGS} color={S.clay[1]} />
        <BatchedDetails name="provider-plug-pins" batch={PLUG_PINS} color={S.clay[2]} />
        <BatchedDetails name="provider-strain-reliefs" batch={STRAIN_RELIEFS} color={S.clay[2]} />
        <BatchedDetails name="provider-cable-sleeves" batch={CABLE_SLEEVES} color={S.clay[0]} />
      </group>
    </group>
  );
}
