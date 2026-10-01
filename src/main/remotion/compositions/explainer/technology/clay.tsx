import type React from 'react';
import { useMemo } from 'react';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Clay } from '../hero-kit';
import { createIconShapes } from '../hero-props/icon-shapes';
import { useStage } from '../stage';

type Point = [number, number, number];

/** Shared sculpted solid; scene assemblies supply meaning, not arbitrary graph geometry. */
export function ClayPart({
  size,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  color,
  radius = 0.08,
}: {
  size: Point;
  position?: Point;
  rotation?: Point;
  color: string;
  radius?: number;
}): React.ReactElement {
  const [w, h, d] = size;
  const geometry = useMemo(
    () => new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2, h / 2, d / 2)),
    [w, h, d, radius],
  );
  return (
    <mesh geometry={geometry} position={position} rotation={rotation}>
      <Clay color={color} />
    </mesh>
  );
}

/** A shape-backed status, shown only after the owning pose's prerequisite. */
export function CheckSeal({
  position,
  scale = 1,
}: {
  position: Point;
  scale?: number;
}): React.ReactElement {
  const S = useStage();
  const shapes = useMemo(() => createIconShapes('checkmark').body, []);
  return (
    <group position={position} scale={scale}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.09, 32]} />
        <Clay color={S.positive} />
      </mesh>
      <group position={[0, 0, 0.06]} scale={0.22}>
        {shapes.map((shape) => (
          <mesh key={shape.uuid}>
            <extrudeGeometry
              args={[
                shape,
                {
                  depth: 0.055,
                  bevelEnabled: true,
                  bevelThickness: 0.015,
                  bevelSize: 0.015,
                  bevelSegments: 2,
                  steps: 1,
                },
              ]}
            />
            <Clay color={S.paper} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function StopSeal({ position }: { position: Point }): React.ReactElement {
  const S = useStage();
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, Math.PI / 8, 0]}>
        <cylinderGeometry args={[0.31, 0.31, 0.1, 8]} />
        <Clay color={S.negative} />
      </mesh>
      <ClayPart
        size={[0.32, 0.065, 0.035]}
        position={[0, 0, 0.07]}
        color={S.paper}
        radius={0.025}
      />
    </group>
  );
}
