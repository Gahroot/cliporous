import type React from 'react';
import { Quaternion, Vector3 } from 'three';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { useStage } from '../../stage';
import type { Point } from './poses';

/** Individually recognizable shopper. A satchel and notched base identify the original. */
export function Customer({ tracked = false }: { tracked?: boolean }): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <mesh position={[0, 0.48, 0]}>
        <sphereGeometry args={[0.19, 20, 14]} />
        <Clay color={S.clay[1]} />
      </mesh>
      <ClayBlock
        size={[0.43, 0.58, 0.28]}
        position={[0, 0.01, 0]}
        color={tracked ? S.accent : S.clay[0]}
        radius={0.13}
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          <ClayBlock
            size={[0.12, 0.46, 0.16]}
            position={[side * 0.27, -0.01, 0]}
            rotation={[0, 0, side * 0.12]}
            color={S.clay[1]}
          />
          <ClayBlock
            size={[0.14, 0.44, 0.18]}
            position={[side * 0.12, -0.48, 0]}
            color={S.clay[2]}
          />
          <ClayBlock
            size={[0.2, 0.11, 0.3]}
            position={[side * 0.12, -0.73, 0.055]}
            color={S.clay[2]}
          />
        </group>
      ))}
      {tracked && (
        <>
          <ClayBlock
            size={[0.055, 0.6, 0.035]}
            position={[0.05, 0.03, 0.16]}
            rotation={[0, 0, -0.35]}
            color={S.paper}
            radius={0.02}
          />
          <ClayBlock size={[0.27, 0.26, 0.16]} position={[0.21, -0.22, 0.18]} color={S.clay[1]} />
          <ClayBlock
            size={[0.07, 0.07, 0.025]}
            position={[0.21, -0.17, 0.275]}
            color={S.accent}
            radius={0.02}
          />
          <mesh position={[0, -0.81, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.42, 0.035, 8, 36]} />
            <Clay color={S.accent} />
          </mesh>
          <ClayBlock size={[0.13, 0.06, 0.14]} position={[0, -0.81, 0.41]} color={S.paper} />
        </>
      )}
    </group>
  );
}

export function CustomerSegment(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock
        size={[3.15, 0.09, 2.05]}
        position={[0, -1.35, 0.1]}
        color={S.clay[0]}
        radius={0.2}
      />
      <group position={[0.68, -0.71, 0.45]} scale={0.76}>
        <Customer />
      </group>
      <group position={[0.1, -0.71, -0.45]} scale={0.76}>
        <Customer />
      </group>
    </group>
  );
}

function MarketStall(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[1.3, 0.7, 0.7]} position={[0, -0.88, 0]} color={S.clay[1]} />
      <ClayBlock size={[1.44, 0.12, 0.86]} position={[0, -0.49, 0]} color={S.clay[2]} />
      {[-0.58, 0.58].map((x) => (
        <ClayBlock
          key={x}
          size={[0.08, 1.9, 0.08]}
          position={[x, -0.25, -0.27]}
          color={S.clay[2]}
        />
      ))}
      <ClayBlock
        size={[1.6, 0.14, 1.05]}
        position={[0, 0.76, -0.05]}
        rotation={[0.08, 0, 0]}
        color={S.clay[0]}
      />
      {[-0.55, 0, 0.55].map((x) => (
        <ClayBlock
          key={x}
          size={[0.24, 0.16, 1.06]}
          position={[x, 0.78, -0.05]}
          rotation={[0.08, 0, 0]}
          color={S.clay[1]}
        />
      ))}
      <ClayBlock size={[0.58, 0.13, 0.42]} position={[0, -0.35, 0.02]} color={S.clay[0]} />
      {[-0.17, 0.17].map((x) => (
        <mesh key={x} position={[x, -0.23, 0.05]}>
          <sphereGeometry args={[0.105, 12, 8]} />
          <Clay color={S.accent} />
        </mesh>
      ))}
    </group>
  );
}

/** Illustrative market context, not a population count or revenue graph. */
export function CustomerMarket(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock
        size={[6.4, 0.1, 3.35]}
        position={[0, -1.36, -0.15]}
        color={S.clay[1]}
        radius={0.2}
      />
      <group position={[-2.35, 0, -0.75]} rotation={[0, 0.18, 0]}>
        <MarketStall />
      </group>
      <group position={[2.35, 0, -0.75]} rotation={[0, -0.18, 0]}>
        <MarketStall />
      </group>
      <group position={[0, -0.2, -1.15]} scale={0.75}>
        <MarketStall />
      </group>
    </group>
  );
}

/** Same recognizable assembly for actual system, model and hypothetical futures. */
export function Conveyor({
  gate,
  parcelX = -0.22,
  model = false,
}: {
  gate: number;
  parcelX?: number;
  model?: boolean;
}): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[2.5, 0.18, 0.86]} position={[0, -0.23, 0]} color={S.clay[2]} />
      {[-0.9, 0.9].flatMap((x) =>
        [-0.28, 0.28].map((z) => (
          <ClayBlock
            key={`${x}-${z}`}
            size={[0.13, 0.7, 0.13]}
            position={[x, -0.65, z]}
            color={S.clay[1]}
          />
        )),
      )}
      {[-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].map((x) => (
        <mesh key={x} position={[x, -0.095, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.085, 0.085, 0.75, 12]} />
          <Clay color={S.clay[1]} />
        </mesh>
      ))}
      <ClayBlock
        size={[0.63, 0.88, 0.35]}
        position={[-0.87, 0.25, -0.47]}
        color={model ? S.clay[2] : S.clay[0]}
      />
      <ClayBlock size={[0.32, 0.2, 0.035]} position={[-0.87, 0.45, -0.28]} color={S.paper} />
      <mesh position={[-0.87, 0.1, -0.26]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.085, 0.085, 0.035, 16]} />
        <Clay color={S.accent} />
      </mesh>
      {[-0.46, 0.46].map((z) => (
        <ClayBlock key={z} size={[0.12, 1.18, 0.12]} position={[0.59, 0.43, z]} color={S.clay[0]} />
      ))}
      <ClayBlock size={[0.17, 0.12, 1.06]} position={[0.59, 1.03, 0]} color={S.clay[0]} />
      <ClayBlock
        size={[0.14, 0.43, 0.8]}
        position={[0.59, 0.19 + gate * 0.57, 0]}
        color={model ? S.accent : S.clay[1]}
      />
      {[-0.26, 0, 0.26].map((z) => (
        <ClayBlock
          key={z}
          size={[0.16, 0.035, 0.14]}
          position={[0.59, 0.19 + gate * 0.57, z]}
          color={S.clay[2]}
          radius={0.01}
        />
      ))}
      <group position={[parcelX, 0.12, 0]}>
        <ClayBlock size={[0.38, 0.34, 0.35]} color={S.clay[1]} />
        <ClayBlock size={[0.085, 0.355, 0.36]} color={S.paper} radius={0.015} />
      </group>
    </group>
  );
}

/** Solid route, not a light beam. Equal radii mean no implied likelihood. */
export function Correspondence({
  from,
  to,
  radius = 0.025,
}: {
  from: Point;
  to: Point;
  radius?: number;
}): React.ReactElement {
  const S = useStage();
  const delta = new Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const length = delta.length();
  const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize());
  return (
    <mesh
      position={[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]}
      quaternion={rotation}
    >
      <cylinderGeometry args={[radius, radius, Math.max(0.001, length), 10]} />
      <Clay color={S.clay[2]} />
    </mesh>
  );
}
