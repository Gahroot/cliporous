import type React from 'react';
import { FoldedDocument } from '../../cognition/models';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { useStage } from '../../stage';

/** Head, jacket, arms, shoes and hat: an identifiable person, not a population bar. */
export function PopulationPerson({
  identity,
  request = false,
}: {
  identity: number;
  request?: boolean;
}): React.ReactElement {
  const S = useStage();
  const color = S.clay[identity % 3] ?? S.accent;
  return (
    <group>
      <mesh position={[0, 0.79, 0]}>
        <sphereGeometry args={[0.16, 16, 12]} />
        <Clay color={S.clay[1]} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <cylinderGeometry args={[0.17, 0.18, identity % 2 ? 0.11 : 0.05, identity % 2 ? 6 : 16]} />
        <Clay color={color} />
      </mesh>
      <mesh position={[0, 0.49, 0]}>
        <capsuleGeometry args={[0.17, 0.26, 4, 12]} />
        <Clay color={color} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <ClayBlock
            size={[0.12, 0.36, 0.13]}
            position={[side * 0.23, 0.47, 0.02]}
            rotation={[0, 0, side * 0.14]}
            color={color}
          />
          <ClayBlock size={[0.12, 0.3, 0.14]} position={[side * 0.09, 0.17, 0]} color={S.muted} />
          <ClayBlock
            size={[0.14, 0.08, 0.23]}
            position={[side * 0.09, 0.035, 0.045]}
            color={S.text}
          />
        </group>
      ))}
      <mesh position={[0, 0.52, 0.185]} rotation={[Math.PI / 2, 0, identity * 0.45]}>
        <cylinderGeometry args={[0.065, 0.065, 0.025, 3 + (identity % 4)]} />
        <Clay color={S.text} />
      </mesh>
      {request && (
        <group position={[-0.22, 0.48, 0.23]} scale={0.22}>
          <FoldedDocument color={color} />
        </group>
      )}
    </group>
  );
}

/** A handled mug, or a sealed parcel with tape and shipping slip for other named products. */
export function PopulationProduct({
  identity,
  mug,
}: {
  identity: number;
  mug: boolean;
}): React.ReactElement {
  const S = useStage();
  const color = S.clay[identity % 3] ?? S.accent;
  if (mug)
    return (
      <group>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.13, 0.115, 0.24, 20]} />
          <Clay color={color} />
        </mesh>
        <mesh position={[0, 0.245, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.114, 0.018, 8, 20]} />
          <Clay color={S.cardRaised} />
        </mesh>
        <mesh position={[0, 0.244, 0]}>
          <cylinderGeometry args={[0.095, 0.095, 0.006, 20]} />
          <Clay color={S.muted} />
        </mesh>
        <mesh position={[0.15, 0.14, 0]}>
          <torusGeometry args={[0.075, 0.026, 8, 16]} />
          <Clay color={color} />
        </mesh>
        <ClayBlock
          size={[0.07, 0.09, 0.015]}
          position={[0, 0.13, 0.125]}
          color={S.text}
          radius={0.01}
        />
      </group>
    );
  return (
    <group>
      <ClayBlock size={[0.32, 0.25, 0.25]} position={[0, 0.125, 0]} color={color} radius={0.025} />
      <ClayBlock
        size={[0.07, 0.26, 0.262]}
        position={[0, 0.13, 0]}
        color={S.paper}
        radius={0.006}
      />
      <ClayBlock
        size={[0.12, 0.07, 0.015]}
        position={[0.075, 0.12, 0.13]}
        color={S.paper}
        radius={0.005}
      />
      <ClayBlock
        size={[0.07, 0.014, 0.018]}
        position={[0.075, 0.13, 0.14]}
        color={S.paperText}
        radius={0.004}
      />
    </group>
  );
}

/** Two open levels, uprights, back rail and persistent empty slots after dispatch. */
export function ProductShelf(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      {[-0.9, -0.16].map((y) => (
        <ClayBlock
          key={y}
          size={[1.9, 0.12, 0.68]}
          position={[-1.5, y, -0.55]}
          color={S.cardRaised}
        />
      ))}
      {[-2.5, -0.5].map((x) => (
        <ClayBlock key={x} size={[0.12, 1.65, 0.68]} position={[x, -0.49, -0.55]} color={S.muted} />
      ))}
      <ClayBlock size={[1.9, 0.12, 0.1]} position={[-1.5, 0.27, -0.85]} color={S.muted} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <ClayBlock
          key={i}
          size={[0.3, 0.015, 0.02]}
          position={[-2.05 + (i % 3) * 0.55, -0.83 + Math.floor(i / 3) * 0.74, -0.26]}
          color={S.accent}
          radius={0.003}
        />
      ))}
    </group>
  );
}

export function CohortLane({
  x,
  width,
  outline = false,
}: {
  x: number;
  width: number;
  outline?: boolean;
}): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[width, 0.05, 1.9]} position={[x, -1.2, 0]} color={S.card} />
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[width, 0.035, 0.045]}
          position={[x, -1.16, side * 0.91]}
          color={outline ? S.muted : S.accent}
          radius={0.01}
        />
      ))}
    </group>
  );
}
