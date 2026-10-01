import type React from 'react';
import { ClayBlock } from '../explanation-kit';
import { Clay } from '../hero-kit';
import { useStage } from '../stage';

export const MICHIGAN_CENTRAL_MASSING = {
  baseWidth: 5.8,
  baseHeight: 0.85,
  towerWidth: 3.3,
  towerHeight: 2.6,
} as const;

export function MichiganCentral(): React.ReactElement {
  const S = useStage();
  const m = MICHIGAN_CENTRAL_MASSING;
  return (
    <group position={[0, -1.25, 0]}>
      <ClayBlock size={[6.15, 0.16, 2.15]} color={S.clay[2]} />
      <ClayBlock
        size={[m.baseWidth, m.baseHeight, 1.8]}
        position={[0, 0.48, 0]}
        color={S.clay[0]}
      />
      <ClayBlock size={[6, 0.14, 1.95]} position={[0, 0.94, 0]} color={S.clay[2]} />
      <ClayBlock
        size={[m.towerWidth, m.towerHeight, 1.08]}
        position={[0, 2.26, -0.24]}
        color={S.clay[0]}
      />
      <ClayBlock size={[3.52, 0.16, 1.27]} position={[0, 3.63, -0.24]} color={S.clay[2]} />
      {[-2.35, -1.57, -0.79, 0, 0.79, 1.57, 2.35].map((x) => (
        <group key={x}>
          <ClayBlock
            size={[0.38, 0.52, 0.08]}
            position={[x, 0.39, 0.93]}
            color={S.clay[1]}
            radius={0.12}
          />
          <mesh position={[x - 0.28, 0.47, 1]}>
            <cylinderGeometry args={[0.055, 0.065, 0.7, 12]} />
            <Clay color={S.clay[0]} />
          </mesh>
        </group>
      ))}
      {[-1.22, -0.61, 0, 0.61, 1.22].map((x) => (
        <ClayBlock
          key={x}
          size={[0.23, 2.26, 0.04]}
          position={[x, 2.27, 0.32]}
          color={S.clay[1]}
          radius={0.015}
        />
      ))}
      {[1.55, 2.15, 2.75, 3.35].map((y) => (
        <ClayBlock
          key={y}
          size={[3.32, 0.06, 0.07]}
          position={[0, y, 0.36]}
          color={S.clay[0]}
          radius={0.015}
        />
      ))}
    </group>
  );
}

export function MichiganCentral2D(): React.ReactElement {
  const S = useStage();
  return (
    <g fill={S.paper} stroke={S.text} strokeWidth={4}>
      <path d="M82 364H870V450H82ZM250 45H702V364H250Z" />
      <path d="M235 40H717V62H235ZM66 353H886V375H66Z" fill={S.accent} />
      {[302, 388, 474, 560, 646].map((x) => (
        <rect key={x} x={x - 16} y={86} width={32} height={247} rx={3} fill={S.cardRaised} />
      ))}
      {[144, 254, 364, 474, 584, 694, 804].map((x) => (
        <path key={x} d={`M${x - 27} 448v-40a27 27 0 0 1 54 0v40Z`} fill={S.cardRaised} />
      ))}
      {[139, 200, 261, 322].map((y) => (
        <path key={y} d={`M252 ${y}H700`} />
      ))}
      <path d="M58 461H894" strokeWidth={10} />
    </g>
  );
}
