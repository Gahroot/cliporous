import type React from 'react';
import { useEffect, useMemo } from 'react';
import { CylinderGeometry, Quaternion, SphereGeometry, Vector3 } from 'three';
import { ClayBlock, type ClayPoint } from '../explanation-kit';
import { Clay } from '../hero-kit';
import { shade, useStage } from '../stage';
import { bounded } from './poses';

/** Fixed authored paths, revealed by scaling a shared unit cylinder, not rebuilding meshes. */
export function SolidRoute({
  points,
  progress = 1,
  color,
  radius = 0.04,
}: {
  points: readonly ClayPoint[];
  progress?: number;
  color: string;
  radius?: number;
}): React.ReactElement {
  const parts = useMemo(() => {
    let start = 0;
    const segments = points.slice(1).map((end, i) => {
      const from = new Vector3(...points[i]);
      const delta = new Vector3(...end).sub(from);
      const length = delta.length();
      const segment = {
        from,
        direction: delta.normalize(),
        length,
        start,
        rotation: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta),
      };
      start += length;
      return segment;
    });
    return { segments, length: start };
  }, [points]);
  const geometry = useMemo(() => new CylinderGeometry(radius, radius, 1, 12), [radius]);
  const elbow = useMemo(() => new SphereGeometry(radius, 12, 8), [radius]);
  useEffect(
    () => () => {
      geometry.dispose();
      elbow.dispose();
    },
    [geometry, elbow],
  );
  const drawn = bounded(progress) * parts.length;
  return (
    <group>
      {parts.segments.map((part) => {
        const length = Math.min(part.length, Math.max(0, drawn - part.start));
        if (length === 0) return null;
        const center = part.from.clone().addScaledVector(part.direction, length / 2);
        return (
          <group key={part.start}>
            <mesh
              geometry={geometry}
              dispose={null}
              position={center}
              quaternion={part.rotation}
              scale={[1, length, 1]}
            >
              <Clay color={color} />
            </mesh>
            <mesh geometry={elbow} dispose={null} position={part.from}>
              <Clay color={color} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export function KeyModel({ barred = 0 }: { barred?: number }): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <mesh>
        <torusGeometry args={[0.13, 0.033, 10, 24]} />
        <Clay color={S.accent} />
      </mesh>
      <mesh position={[0, 0, -0.23]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.026, 0.026, 0.46, 12]} />
        <Clay color={S.accent} />
      </mesh>
      {[-0.32, -0.42].map((z) => (
        <ClayBlock
          key={z}
          size={[0.09, 0.042, 0.042]}
          position={[0.035, -0.035, z]}
          color={S.accent}
          radius={0.013}
        />
      ))}
      {barred > 0 && (
        <group scale={[barred, 1, 1]}>
          <ClayBlock
            size={[0.38, 0.055, 0.04]}
            position={[0, 0, 0.04]}
            rotation={[0, 0, -Math.PI / 4]}
            color={S.text}
            radius={0.02}
          />
        </group>
      )}
    </group>
  );
}

export function Padlock(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <mesh position={[0, 0.09, 0]}>
        <torusGeometry args={[0.105, 0.027, 10, 20, Math.PI]} />
        <Clay color={S.text} />
      </mesh>
      <ClayBlock size={[0.27, 0.21, 0.12]} color={shade(S.accent, -0.25)} radius={0.035} />
      <ClayBlock
        size={[0.025, 0.065, 0.015]}
        position={[0, 0, 0.068]}
        color={S.text}
        radius={0.01}
      />
    </group>
  );
}

export type FurnitureKind = 'sofa' | 'chair' | 'table' | 'bed' | 'shelf';
/** The label remains verbatim in the editorial rail. Only bounded authored furniture is selected. */
export function furnitureForLabel(label: string): FurnitureKind {
  if (/sofa|couch|settee|sectional/i.test(label)) return 'sofa';
  if (/bed|mattress/i.test(label)) return 'bed';
  if (/table|desk|worktop/i.test(label)) return 'table';
  if (/shelf|shelv|cabinet|wardrobe|storage|bookcase/i.test(label)) return 'shelf';
  return 'chair';
}

export function FurnitureModel({ kind }: { kind: FurnitureKind }): React.ReactElement {
  const S = useStage();
  const legs = (width: number, depth: number, height: number): React.ReactNode =>
    [-1, 1].flatMap((x) =>
      [-1, 1].map((z) => (
        <ClayBlock
          key={`${x}:${z}`}
          size={[0.09, height, 0.09]}
          position={[(x * width) / 2, height / 2, (z * depth) / 2]}
          color={shade(S.text, -0.25)}
          radius={0.025}
        />
      )),
    );
  switch (kind) {
    case 'sofa':
      return (
        <group>
          {legs(1.32, 0.55, 0.2)}
          <ClayBlock
            size={[1.7, 0.25, 0.82]}
            position={[0, 0.28, 0]}
            color={shade(S.accent, -0.13)}
            radius={0.11}
          />
          <ClayBlock
            size={[1.66, 0.6, 0.19]}
            position={[0, 0.57, -0.34]}
            color={S.accent}
            radius={0.08}
          />
          {[-1, 1].map((x) => (
            <group key={x}>
              <ClayBlock
                size={[0.22, 0.41, 0.8]}
                position={[x * 0.74, 0.45, 0]}
                color={S.accent}
                radius={0.09}
              />
              <ClayBlock
                size={[0.59, 0.15, 0.59]}
                position={[x * 0.32, 0.44, 0.045]}
                color={shade(S.accent, 0.17)}
                radius={0.07}
              />
            </group>
          ))}
        </group>
      );
    case 'bed':
      return (
        <group>
          {legs(1.03, 1.44, 0.2)}
          <ClayBlock size={[1.3, 0.2, 1.72]} position={[0, 0.25, 0]} color={shade(S.text, -0.2)} />
          <ClayBlock
            size={[1.25, 0.21, 1.62]}
            position={[0, 0.45, 0]}
            color={S.text}
            radius={0.1}
          />
          <ClayBlock
            size={[1.28, 0.075, 1.06]}
            position={[0, 0.57, 0.25]}
            color={S.accent}
            radius={0.035}
          />
          <ClayBlock size={[0.9, 0.14, 0.36]} position={[0, 0.6, -0.52]} color={S.text} />
          <ClayBlock
            size={[1.38, 0.9, 0.15]}
            position={[0, 0.5, -0.86]}
            color={shade(S.accent, -0.24)}
          />
        </group>
      );
    case 'table':
      return (
        <group>
          {legs(1.22, 0.72, 0.76)}
          <ClayBlock size={[1.5, 0.12, 1]} position={[0, 0.79, 0]} color={S.text} />
          <ClayBlock
            size={[0.44, 0.045, 0.34]}
            position={[0.25, 0.88, -0.12]}
            color={S.accent}
            radius={0.025}
          />
        </group>
      );
    case 'shelf':
      return (
        <group>
          <ClayBlock size={[1.3, 0.1, 0.57]} position={[0, 0.05, 0]} color={shade(S.text, -0.2)} />
          {[-1, 1].map((side) => (
            <ClayBlock
              key={side}
              size={[0.11, 1.1, 0.52]}
              position={[side * 0.59, 0.6, 0]}
              color={S.text}
              radius={0.035}
            />
          ))}
          <ClayBlock
            size={[1.21, 1.1, 0.06]}
            position={[0, 0.6, -0.24]}
            color={shade(S.text, -0.24)}
            radius={0.025}
          />
          {[0.14, 0.61, 1.12].map((y) => (
            <ClayBlock
              key={y}
              size={[1.25, 0.07, 0.52]}
              position={[0, y, 0]}
              color={S.text}
              radius={0.025}
            />
          ))}
          {[-0.33, -0.08, 0.17].map((x) => (
            <ClayBlock
              key={x}
              size={[0.14, 0.33, 0.34]}
              position={[x, 0.82, 0]}
              color={S.accent}
              radius={0.018}
            />
          ))}
        </group>
      );
    case 'chair':
      return (
        <group>
          {legs(0.51, 0.51, 0.47)}
          <ClayBlock size={[0.73, 0.13, 0.73]} position={[0, 0.49, 0]} color={S.accent} />
          <ClayBlock size={[0.73, 0.64, 0.13]} position={[0, 0.84, -0.29]} color={S.accent} />
        </group>
      );
  }
}

export function Blueprint(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[1.55, 0.045, 1.23]} color={shade(S.accent, -0.4)} radius={0.025} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <ClayBlock
            size={[1.23, 0.018, 0.025]}
            position={[0, 0.032, side * 0.46]}
            color={S.text}
            radius={0.005}
          />
          <ClayBlock
            size={[0.025, 0.018, 0.94]}
            position={[side * 0.61, 0.032, 0]}
            color={S.text}
            radius={0.005}
          />
        </group>
      ))}
      <ClayBlock
        size={[0.022, 0.02, 0.91]}
        position={[0.06, 0.032, 0]}
        color={S.text}
        radius={0.005}
      />
      <ClayBlock
        size={[0.67, 0.02, 0.022]}
        position={[-0.28, 0.032, -0.12]}
        color={S.text}
        radius={0.005}
      />
      <mesh position={[-0.77, 0.015, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.052, 0.052, 1.24, 12]} />
        <Clay color={shade(S.accent, -0.25)} />
      </mesh>
    </group>
  );
}

export function PaintRoller({ turn }: { turn: number }): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.13, 0.13, 0.56, 20]} />
        <Clay color={S.text} />
      </mesh>
      <group rotation={[turn, 0, 0]}>
        <ClayBlock
          size={[0.52, 0.025, 0.06]}
          position={[0, 0.125, 0]}
          color={shade(S.accent, 0.2)}
          radius={0.01}
        />
      </group>
      <ClayBlock
        size={[0.038, 0.26, 0.04]}
        position={[0.3, -0.12, 0]}
        color={S.text}
        radius={0.013}
      />
      <ClayBlock
        size={[0.34, 0.04, 0.04]}
        position={[0.15, -0.25, 0]}
        color={S.text}
        radius={0.013}
      />
      <ClayBlock size={[0.09, 0.34, 0.1]} position={[0, -0.4, 0]} color={S.accent} radius={0.035} />
    </group>
  );
}

export function WrenchModel(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI * 0.23]}>
        <torusGeometry args={[0.15, 0.06, 10, 20, Math.PI * 1.54]} />
        <Clay color={S.text} />
      </mesh>
      <ClayBlock
        size={[0.12, 0.55, 0.095]}
        position={[0, -0.35, 0]}
        color={S.text}
        radius={0.045}
      />
      <ClayBlock
        size={[0.16, 0.26, 0.12]}
        position={[0, -0.52, 0]}
        color={S.accent}
        radius={0.05}
      />
    </group>
  );
}

export function Occupant({ variant = false }: { variant?: boolean }): React.ReactElement {
  const S = useStage();
  const color = variant ? S.accent : shade(S.text, -0.15);
  return (
    <group>
      <mesh position={[0, 0.64, 0]}>
        <sphereGeometry args={[0.1, 16, 12]} />
        <Clay color={S.text} />
      </mesh>
      <mesh position={[0, 0.41, 0]}>
        <capsuleGeometry args={[0.11, 0.23, 4, 12]} />
        <Clay color={color} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <ClayBlock
            size={[0.085, 0.28, 0.09]}
            position={[side * 0.065, 0.16, 0]}
            color={shade(color, -0.25)}
            radius={0.035}
          />
          <ClayBlock
            size={[0.1, 0.07, 0.15]}
            position={[side * 0.065, 0.035, 0.025]}
            color={shade(S.card, 0.17)}
            radius={0.025}
          />
          <mesh position={[side * 0.14, 0.42, 0]} rotation={[0, 0, side * 0.14]}>
            <capsuleGeometry args={[0.038, 0.18, 4, 10]} />
            <Clay color={color} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function TreeModel(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.055, 0.075, 0.84, 12]} />
        <Clay color={shade(S.text, -0.36)} />
      </mesh>
      <mesh position={[-0.11, 0.58, 0]} rotation={[0, 0, 0.6]}>
        <cylinderGeometry args={[0.028, 0.035, 0.38, 10]} />
        <Clay color={shade(S.text, -0.36)} />
      </mesh>
      {[
        [0, 1.05, 0, 0.42],
        [-0.23, 0.9, 0.02, 0.28],
        [0.24, 1.03, -0.02, 0.29],
      ].map(([x, y, z, scale], i) => (
        <mesh key={x} position={[x, y, z]} scale={[scale, scale * 1.2, scale]}>
          <sphereGeometry args={[1, 16, 12]} />
          <Clay color={shade(S.accent, -0.2 + i * 0.08)} />
        </mesh>
      ))}
    </group>
  );
}

export function ParkBench(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[0.08, 0.35, 0.48]}
          position={[side * 0.42, 0.175, 0]}
          color={S.text}
          radius={0.025}
        />
      ))}
      {[-0.14, 0, 0.14].map((z) => (
        <ClayBlock
          key={z}
          size={[1.1, 0.07, 0.1]}
          position={[0, 0.38, z]}
          color={shade(S.text, -0.22)}
          radius={0.025}
        />
      ))}
      {[0.53, 0.69].map((y) => (
        <ClayBlock
          key={y}
          size={[1.1, 0.12, 0.07]}
          position={[0, y, -0.19]}
          color={shade(S.text, -0.22)}
          radius={0.025}
        />
      ))}
    </group>
  );
}

export function StreetLamp(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.035, 0.045, 1.6, 12]} />
        <Clay color={S.text} />
      </mesh>
      <ClayBlock
        size={[0.38, 0.045, 0.05]}
        position={[0.17, 1.58, 0]}
        color={S.text}
        radius={0.02}
      />
      <ClayBlock
        size={[0.28, 0.1, 0.2]}
        position={[0.34, 1.55, 0]}
        color={S.accent}
        radius={0.045}
      />
      <ClayBlock
        size={[0.19, 0.03, 0.13]}
        position={[0.34, 1.487, 0]}
        color={S.text}
        radius={0.014}
      />
    </group>
  );
}

export function CoinModel(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.065, 24]} />
        <Clay color={S.accent} />
      </mesh>
      <mesh position={[0, 0, 0.039]}>
        <torusGeometry args={[0.128, 0.012, 8, 24]} />
        <Clay color={S.text} />
      </mesh>
    </group>
  );
}
