import type React from 'react';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { useStage } from '../../stage';

/** Package, ceramic die, sixteen leads and a notched identity badge — not a generic cube. */
export function TrackedChip(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[0.62, 0.62, 0.16]} color={S.clay[2]} radius={0.07} />
      <ClayBlock size={[0.4, 0.4, 0.07]} position={[0, 0, 0.1]} color={S.accent} />
      {[-0.23, -0.08, 0.08, 0.23].flatMap((v) =>
        [-1, 1].flatMap((side) => [
          <ClayBlock
            key={`h-${v}-${side}`}
            size={[0.15, 0.05, 0.06]}
            position={[side * 0.37, v, 0]}
            color={S.clay[1]}
            radius={0.02}
          />,
          <ClayBlock
            key={`v-${v}-${side}`}
            size={[0.05, 0.15, 0.06]}
            position={[v, side * 0.37, 0]}
            color={S.clay[1]}
            radius={0.02}
          />,
        ]),
      )}
      <mesh position={[-0.2, 0.2, 0.1]}>
        <sphereGeometry args={[0.055, 12, 8]} />
        <Clay color={S.paper} />
      </mesh>
      <mesh position={[0, 0, -0.03]}>
        <torusGeometry args={[0.48, 0.025, 8, 40]} />
        <Clay color={S.accent} />
      </mesh>
    </group>
  );
}

export function ServerTray(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[1.88, 0.14, 1.32]} position={[0, -0.22, 0.33]} color={S.clay[1]} />
      <ClayBlock size={[1.65, 0.06, 1.12]} position={[0, -0.12, 0.33]} color={S.clay[2]} />
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[0.1, 0.42, 1.32]}
          position={[side * 0.87, -0.01, 0.33]}
          color={S.clay[0]}
        />
      ))}
      {[-0.55, 0.55].map((x) => (
        <group key={x} position={[x, 0.01, -0.07]}>
          <ClayBlock size={[0.34, 0.22, 0.5]} color={S.clay[0]} />
          {[-0.09, 0, 0.09].map((dx) => (
            <ClayBlock
              key={dx}
              size={[0.035, 0.025, 0.4]}
              position={[dx, 0.13, 0]}
              color={S.clay[2]}
              radius={0.01}
            />
          ))}
        </group>
      ))}
    </group>
  );
}

export function Rack({ openBay = false }: { openBay?: boolean }): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[2.36, 0.16, 1.4]} position={[0, -1.22, 0.24]} color={S.clay[2]} />
      <ClayBlock size={[2.36, 0.16, 1.4]} position={[0, 1.24, 0.24]} color={S.clay[0]} />
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[0.14, 2.45, 1.4]}
          position={[side * 1.1, 0.01, 0.24]}
          color={S.clay[0]}
        />
      ))}
      {(openBay ? [-0.86, -0.5, 0.63, 0.96] : [-0.86, -0.5, -0.14, 0.27, 0.63, 0.96]).map((y) => (
        <group key={y} position={[0, y, 0.2]}>
          <ClayBlock size={[1.95, 0.25, 1.2]} color={S.clay[1]} />
          <ClayBlock
            size={[0.8, 0.035, 0.035]}
            position={[-0.25, 0, 0.625]}
            color={S.clay[2]}
            radius={0.01}
          />
          <ClayBlock
            size={[0.12, 0.08, 0.04]}
            position={[0.73, 0, 0.625]}
            color={S.accent}
            radius={0.02}
          />
        </group>
      ))}
    </group>
  );
}

export function DataCenter(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[6.2, 0.12, 3.45]} position={[0, -1.34, -0.25]} color={S.clay[1]} />
      <ClayBlock size={[6.2, 2.7, 0.14]} position={[0, 0, -1.92]} color={S.clay[0]} />
      <ClayBlock size={[0.14, 1.8, 3.45]} position={[-3.03, -0.42, -0.25]} color={S.clay[0]} />
      <ClayBlock size={[6.2, 0.16, 0.5]} position={[0, 1.37, -1.78]} color={S.clay[2]} />
      {[-2.12, 2.12].map((x) => (
        <group key={x} position={[x, -0.39, -0.86]} scale={0.68}>
          <Rack />
        </group>
      ))}
      <ClayBlock size={[0.58, 1.15, 0.08]} position={[2.5, -0.7, -1.8]} color={S.clay[2]} />
      <ClayBlock size={[0.08, 0.16, 0.07]} position={[2.65, -0.7, -1.74]} color={S.clay[1]} />
    </group>
  );
}
