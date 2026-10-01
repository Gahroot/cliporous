import type React from 'react';
import { ClayBlock } from '../explanation-kit';
import { Clay } from '../hero-kit';
import { shade, useStage } from '../stage';
import {
  projectRencen,
  RENCEN_PARTS,
  type RencenFacade,
  type RencenSolid,
  rencenOutline,
  rencenVisibleFaces,
} from './rencen-geometry';

export { RENCEN_TOWERS } from './rencen-geometry';

function Tower({
  solid,
  facade,
  surface,
}: {
  solid: RencenSolid;
  facade: RencenFacade;
  surface: RencenFacade | null;
}): React.ReactElement {
  const S = useStage();
  const body =
    solid.role === 'hotel' || solid.role === 'core' ? S.clay[0] : shade(S.clay[2], -0.25);
  return (
    <group name={solid.id} position={[solid.x, solid.bottom, solid.z]}>
      <mesh
        position={[0, surface ? 0 : solid.height / 2, 0]}
        rotation={[0, surface ? 0 : solid.rotation, 0]}
      >
        {surface ? (
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[surface.positions, 3]} />
            <bufferAttribute attach="attributes-normal" args={[surface.normals, 3]} />
          </bufferGeometry>
        ) : (
          <cylinderGeometry args={[solid.radius, solid.radius, solid.height, solid.sides]} />
        )}
        <Clay color={body} />
      </mesh>
      <mesh position={[0, solid.height + 0.025, 0]} rotation={[0, solid.rotation, 0]}>
        <cylinderGeometry args={[solid.radius * 0.97, solid.radius * 1.025, 0.05, solid.sides]} />
        <Clay color={S.clay[1]} />
      </mesh>
      <mesh>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[facade.positions, 3]} />
          <bufferAttribute attach="attributes-normal" args={[facade.normals, 3]} />
        </bufferGeometry>
        <Clay color={shade(body, solid.role === 'hotel' || solid.role === 'core' ? -0.2 : 0.18)} />
      </mesh>
      {solid.role !== 'core' && (
        <mesh position={[0, 0.035, 0]} rotation={[0, solid.rotation, 0]}>
          <cylinderGeometry args={[solid.radius * 1.03, solid.radius * 1.05, 0.07, solid.sides]} />
          <Clay color={S.clay[1]} />
        </mesh>
      )}
      {solid.role === 'east' && (
        <ClayBlock
          size={[0.44, 0.13, 0.44]}
          position={[0, solid.height + 0.11, 0]}
          color={S.clay[1]}
          radius={0.015}
        />
      )}
    </group>
  );
}

/** Faceted offices and slim circulation cores surround the cylindrical hotel. */
export function RenaissanceCenter(): React.ReactElement {
  const S = useStage();
  return (
    <group position={[-0.8, -1.22, 0]}>
      <ClayBlock
        size={[6.7, 0.14, 3.7]}
        position={[1.02, -0.1, 0.12]}
        color={S.clay[1]}
        radius={0.04}
      />
      <ClayBlock
        size={[6.7, 0.045, 0.24]}
        position={[1.02, -0.14, 2.12]}
        color={S.accent2}
        radius={0.012}
      />
      <ClayBlock
        size={[6.1, 0.25, 2.65]}
        position={[1, 0.075, -0.03]}
        color={S.clay[1]}
        radius={0.04}
      />
      {RENCEN_PARTS.map((part) => (
        <Tower key={part.solid.id} {...part} />
      ))}
      {/* Low river-facing Wintergarden, not a row of disconnected freestanding towers. */}
      <mesh position={[0, 0.27, 1.16]}>
        <cylinderGeometry args={[1.08, 1.08, 0.38, 24, 1, false, -Math.PI / 2, Math.PI]} />
        <Clay color={S.clay[2]} />
      </mesh>
      <mesh position={[0, 0.485, 1.16]}>
        <cylinderGeometry args={[1.055, 1.11, 0.05, 24, 1, false, -Math.PI / 2, Math.PI]} />
        <Clay color={S.clay[1]} />
      </mesh>
      <ClayBlock
        size={[1.82, 0.025, 0.045]}
        position={[0, 0.26, 1.73]}
        color={S.clay[1]}
        radius={0.007}
      />
    </group>
  );
}

function points(values: readonly (readonly [number, number])[]): string {
  return values.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

function VectorTower({ solid }: { solid: RencenSolid }): React.ReactElement {
  const S = useStage();
  const body =
    solid.role === 'hotel' || solid.role === 'core' ? S.clay[0] : shade(S.clay[2], -0.25);
  const project = (x: number, y: number, z: number): readonly [number, number] =>
    projectRencen(x + solid.x, y + solid.bottom, z + solid.z);
  const roof = rencenOutline(solid).map(([x, z]) => project(x, solid.height, z));
  const faces = rencenVisibleFaces(solid);
  const facade = faces
    .flatMap(([a, b]) => {
      const line = (
        x1: number,
        y1: number,
        z1: number,
        x2: number,
        y2: number,
        z2: number,
      ): string => `M${project(x1, y1, z1).join(' ')}L${project(x2, y2, z2).join(' ')}`;
      const rows = Array.from({ length: solid.floors - 1 }, (_, i) => {
        const y = ((i + 1) * solid.height) / solid.floors;
        return line(a[0], y, a[1], b[0], y, b[1]);
      });
      const divisions = solid.sides <= 8 ? 4 : 1;
      const columns = Array.from({ length: divisions }, (_, i) => {
        const x = a[0] + ((b[0] - a[0]) * i) / divisions;
        const z = a[1] + ((b[1] - a[1]) * i) / divisions;
        return line(x, 0, z, x, solid.height, z);
      });
      return [...rows, ...columns];
    })
    .join('');
  return (
    <g data-entity-id={solid.id} data-profile={solid.role}>
      {faces.map(([a, b]) => {
        const light = (a[0] + b[0]) / (solid.radius * 2);
        return (
          <polygon
            key={`${a[0]}/${a[1]}`}
            points={points([
              project(a[0], 0, a[1]),
              project(b[0], 0, b[1]),
              project(b[0], solid.height, b[1]),
              project(a[0], solid.height, a[1]),
            ])}
            fill={shade(body, -0.18 * light)}
          />
        );
      })}
      <path d={facade} stroke={S.paper} strokeWidth={0.75} opacity={0.32} fill="none" />
      <polygon points={points(roof)} fill={S.paper} stroke={shade(body, -0.15)} strokeWidth={1.4} />
      {solid.role === 'east' && (
        <VectorPodium
          x={solid.x}
          z={solid.z}
          width={0.44}
          depth={0.44}
          bottom={solid.bottom + solid.height}
          height={0.13}
        />
      )}
    </g>
  );
}

function VectorPodium({
  x,
  z,
  width,
  depth,
  bottom,
  height,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
  bottom: number;
  height: number;
}): React.ReactElement {
  const S = useStage();
  const outline = [
    [x - width / 2, z - depth / 2],
    [x + width / 2, z - depth / 2],
    [x + width / 2, z + depth / 2],
    [x - width / 2, z + depth / 2],
  ] as const;
  const top = outline.map(([px, pz]) => projectRencen(px, bottom + height, pz));
  const side = (a: readonly [number, number], b: readonly [number, number]): string =>
    points([
      projectRencen(a[0], bottom, a[1]),
      projectRencen(b[0], bottom, b[1]),
      projectRencen(b[0], bottom + height, b[1]),
      projectRencen(a[0], bottom + height, a[1]),
    ]);
  return (
    <g>
      <polygon points={side(outline[1], outline[2])} fill={shade(S.paper, -0.22)} />
      <polygon points={side(outline[2], outline[3])} fill={shade(S.paper, -0.1)} />
      <polygon points={points(top)} fill={S.paper} />
    </g>
  );
}

/** Authored vector architecture shares the actual tower profiles and placement, not seven pills. */
export function RenaissanceCenter2D(): React.ReactElement {
  const S = useStage();
  const river = [projectRencen(-2.3, -0.17, 2.12), projectRencen(4.37, -0.17, 2.12)];
  const garden: RencenSolid = {
    id: 'wintergarden',
    role: 'office',
    x: 0,
    z: 1.16,
    bottom: 0.08,
    height: 0.38,
    radius: 1.08,
    sides: 24,
    rotation: 0,
    floors: 2,
    half: true,
  };
  return (
    <g>
      <VectorPodium x={1.02} z={0.12} width={6.7} depth={3.7} bottom={-0.17} height={0.14} />
      <VectorPodium x={1} z={-0.03} width={6.1} depth={2.65} bottom={-0.05} height={0.25} />
      {[...RENCEN_PARTS]
        .sort((a, b) => a.solid.z + a.solid.x * 0.311 - (b.solid.z + b.solid.x * 0.311))
        .map(({ solid }) => (
          <VectorTower key={solid.id} solid={solid} />
        ))}
      <VectorTower solid={garden} />
      <path
        d={`M${river.map((p) => p.join(' ')).join('L')}`}
        fill="none"
        stroke={S.accent2}
        strokeWidth={4}
      />
    </g>
  );
}
