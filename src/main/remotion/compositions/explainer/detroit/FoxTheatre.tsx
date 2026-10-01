import type React from 'react';
import { ClayBlock } from '../explanation-kit';
import { Clay } from '../hero-kit';
import { useStage } from '../stage';

/** Exterior massing only; independently authored marquee, no venue logo or promotional art. */
export function FoxTheatre(): React.ReactElement {
  const S = useStage();
  return (
    <group position={[0, -1.22, 0]}>
      <ClayBlock size={[4.55, 0.16, 2.25]} color={S.clay[2]} />
      <ClayBlock size={[3.95, 3.3, 1.2]} position={[0, 1.75, -0.35]} color={S.clay[0]} />
      <ClayBlock size={[4.16, 0.2, 1.42]} position={[0, 3.48, -0.35]} color={S.clay[2]} />
      {[-1.52, -0.76, 0, 0.76, 1.52].map((x) => (
        <group key={x}>
          <ClayBlock
            size={[0.31, 1.96, 0.065]}
            position={[x, 2.14, 0.285]}
            color={S.clay[1]}
            radius={0.06}
          />
          <ClayBlock
            size={[0.17, 2.14, 0.15]}
            position={[x - 0.27, 2.14, 0.31]}
            color={S.clay[2]}
          />
          <ClayBlock size={[0.4, 0.7, 0.1]} position={[x, 0.49, 0.34]} color={S.clay[1]} />
        </group>
      ))}
      <ClayBlock size={[3.35, 0.24, 1.08]} position={[0, 1.02, 0.76]} color={S.clay[1]} />
      <ClayBlock size={[3.45, 0.09, 1.18]} position={[0, 1.17, 0.76]} color={S.clay[0]} />
      <ClayBlock size={[0.49, 1.48, 0.35]} position={[-1.98, 2.25, 0.55]} color={S.clay[1]} />
      {/* Geometric F / O / X are authored block lettering, not a copied sign outline. */}
      <group position={[-1.98, 2.62, 0.74]}>
        <ClayBlock
          size={[0.045, 0.3, 0.03]}
          position={[-0.11, 0, 0]}
          color={S.clay[0]}
          radius={0.01}
        />
        <ClayBlock
          size={[0.22, 0.045, 0.03]}
          position={[0, 0.13, 0]}
          color={S.clay[0]}
          radius={0.01}
        />
        <ClayBlock
          size={[0.17, 0.045, 0.03]}
          position={[-0.02, 0.015, 0]}
          color={S.clay[0]}
          radius={0.01}
        />
        <mesh position={[0, -0.39, 0]}>
          <torusGeometry args={[0.115, 0.027, 8, 20]} />
          <Clay color={S.clay[0]} />
        </mesh>
        <ClayBlock
          size={[0.045, 0.31, 0.03]}
          position={[0, -0.77, 0]}
          rotation={[0, 0, 0.55]}
          color={S.clay[0]}
          radius={0.01}
        />
        <ClayBlock
          size={[0.045, 0.31, 0.03]}
          position={[0, -0.77, 0]}
          rotation={[0, 0, -0.55]}
          color={S.clay[0]}
          radius={0.01}
        />
      </group>
    </group>
  );
}

export function FoxTheatre2D(): React.ReactElement {
  const S = useStage();
  return (
    <g stroke={S.text} strokeWidth={4} fill={S.paper}>
      <path d="M180 54H778V448H180ZM167 40H791V65H167Z" />
      {[233, 350, 467, 584, 701].map((x) => (
        <g key={x}>
          <rect x={x} y={100} width={33} height={221} rx={10} fill={S.cardRaised} />
          <rect x={x - 11} y={368} width={56} height={76} rx={3} fill={S.cardRaised} />
        </g>
      ))}
      <path d="M208 333H751l35 42H173Z" fill={S.accent} />
      <rect x={126} y={93} width={82} height={224} rx={6} fill={S.card} />
      <text
        x={167}
        y={158}
        textAnchor="middle"
        fill={S.text}
        stroke="none"
        fontFamily={S.font}
        fontSize={49}
        fontWeight={800}
      >
        <tspan x={167}>F</tspan>
        <tspan x={167} dy={62}>
          O
        </tspan>
        <tspan x={167} dy={62}>
          X
        </tspan>
      </text>
      <path d="M134 461H812" strokeWidth={10} />
    </g>
  );
}
