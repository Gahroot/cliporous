import type React from 'react';
import { ClayBlock } from '../explanation-kit';
import { Clay } from '../hero-kit';
import { useStage } from '../stage';

export function GuardianBuilding(): React.ReactElement {
  const S = useStage();
  return (
    <group position={[0, -1.25, 0]}>
      <ClayBlock size={[3.25, 0.16, 2]} color={S.clay[2]} />
      <ClayBlock size={[2.8, 2.7, 1.15]} position={[0, 1.43, 0]} color={S.clay[0]} />
      <ClayBlock size={[1.94, 0.48, 1.02]} position={[0, 3.02, 0]} color={S.clay[0]} />
      <ClayBlock size={[1.32, 0.4, 0.91]} position={[0, 3.43, 0]} color={S.clay[1]} />
      <ClayBlock size={[0.7, 0.3, 0.7]} position={[0, 3.75, 0]} color={S.clay[2]} />
      <ClayBlock
        size={[0.64, 0.85, 0.12]}
        position={[-0.53, 0.52, 0.62]}
        color={S.clay[1]}
        radius={0.19}
      />
      {[-1.14, -0.76, -0.38, 0, 0.38, 0.76, 1.14].map((x) => (
        <ClayBlock
          key={x}
          size={[0.12, 1.96, 0.07]}
          position={[x, 1.75, 0.59]}
          color={S.clay[2]}
          radius={0.015}
        />
      ))}
      <ClayBlock size={[0.43, 3.14, 0.55]} position={[1.3, 1.65, 0.09]} color={S.clay[1]} />
    </group>
  );
}

export function GuardianBuilding2D(): React.ReactElement {
  const S = useStage();
  return (
    <g fill={S.paper} stroke={S.text} strokeWidth={4}>
      <path d="M304 447V134h58V86h57V43h106v43h57v48h58v313Z" />
      <path d="M419 43h106v43H419Z" fill={S.accent} />
      {[340, 383, 426, 469, 512, 555, 598].map((x) => (
        <path key={x} d={`M${x} 160v215`} strokeWidth={10} />
      ))}
      <path d="M385 447v-41a35 35 0 0 1 70 0v41Z" fill={S.accent} />
      <path d="M617 447V134h38v313M268 460H686" />
    </g>
  );
}

export function PenobscotBuilding(): React.ReactElement {
  const S = useStage();
  return (
    <group position={[0, -1.25, 0]}>
      <ClayBlock size={[3.1, 0.16, 1.85]} color={S.clay[2]} />
      {[
        { w: 2.6, h: 2.1, y: 1.13 },
        { w: 2.05, h: 0.45, y: 2.4 },
        { w: 1.48, h: 0.43, y: 2.84 },
        { w: 0.9, h: 0.4, y: 3.25 },
        { w: 0.48, h: 0.32, y: 3.59 },
      ].map((tier) => (
        <ClayBlock
          key={tier.y}
          size={[tier.w, tier.h, tier.w * 0.56]}
          position={[0, tier.y, 0]}
          color={S.clay[0]}
        />
      ))}
      <mesh position={[0, 4.06, 0]}>
        <cylinderGeometry args={[0.035, 0.065, 0.68, 12]} />
        <Clay color={S.clay[2]} />
      </mesh>
      <mesh position={[0, 4.41, 0]}>
        <sphereGeometry args={[0.105, 16, 10]} />
        <Clay color={S.clay[1]} />
      </mesh>
      {[-0.97, -0.49, 0, 0.49, 0.97].map((x) => (
        <ClayBlock
          key={x}
          size={[0.12, 1.78, 0.035]}
          position={[x, 1.14, 0.75]}
          color={S.clay[2]}
          radius={0.01}
        />
      ))}
    </group>
  );
}

export function PenobscotBuilding2D(): React.ReactElement {
  const S = useStage();
  return (
    <g fill={S.paper} stroke={S.text} strokeWidth={4}>
      <path d="M310 450V238h39v-51h42v-50h43V93h84v44h43v50h42v51h39v212Z" />
      {[350, 412, 474, 536, 598].map((x) => (
        <path key={x} d={`M${x} 266v160`} strokeWidth={12} />
      ))}
      <path d="M476 93V32" strokeWidth={7} />
      <circle cx={476} cy={24} r={12} fill={S.accent} />
      <path d="M280 462H672" />
    </g>
  );
}

const CABLE_X = [-3.3, -2, -1.6, -1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2, 1.6, 2, 3.3] as const;
export function bridgeCableHeight(x: number): number {
  return Math.abs(x) <= 2 ? 1.05 + 1.7 * (x / 2) ** 2 : 2.75 - (Math.abs(x) - 2) * 1.65;
}
function BridgeCable({ from, to, z }: { from: number; to: number; z: number }): React.ReactElement {
  const S = useStage();
  const a = bridgeCableHeight(from),
    b = bridgeCableHeight(to);
  return (
    <mesh
      position={[(from + to) / 2, (a + b) / 2, z]}
      rotation={[0, 0, -Math.atan2(to - from, b - a)]}
    >
      <cylinderGeometry args={[0.034, 0.034, Math.hypot(to - from, b - a), 8]} />
      <Clay color={S.clay[1]} />
    </mesh>
  );
}
export function AmbassadorBridge(): React.ReactElement {
  const S = useStage();
  return (
    <group position={[0, -1.25, 0]}>
      <ClayBlock size={[7, 0.08, 2.7]} color={S.accent2} />
      <ClayBlock size={[6.8, 0.16, 0.82]} position={[0, 0.63, 0]} color={S.clay[0]} />
      {[-2, 2].map((x) => (
        <group key={x}>
          {[-0.46, 0.46].map((z) => (
            <ClayBlock key={z} size={[0.19, 2.8, 0.19]} position={[x, 1.42, z]} color={S.clay[1]} />
          ))}
          {[1.7, 2.65].map((y) => (
            <ClayBlock key={y} size={[0.22, 0.17, 1.12]} position={[x, y, 0]} color={S.clay[1]} />
          ))}
        </group>
      ))}
      {[-0.43, 0.43].map((z) => (
        <group key={z}>
          {CABLE_X.slice(1).map((x, i) => (
            <BridgeCable key={x} from={CABLE_X[i]} to={x} z={z} />
          ))}
          {CABLE_X.slice(2, -2).map((x) => (
            <mesh key={x} position={[x, (bridgeCableHeight(x) + 0.7) / 2, z]}>
              <cylinderGeometry args={[0.019, 0.019, bridgeCableHeight(x) - 0.7, 6]} />
              <Clay color={S.clay[1]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
export function AmbassadorBridge2D(): React.ReactElement {
  const S = useStage();
  return (
    <g fill="none" stroke={S.text} strokeWidth={5}>
      <path d="M30 379H922" strokeWidth={16} />
      <path d="M230 436V69h22v367M700 436V69h22v367" strokeWidth={9} />
      <path d="M30 360 241 91Q476 492 711 91L922 360" />
      {[298, 358, 418, 478, 538, 598, 658].map((x) => {
        const t = (x - 241) / 470;
        const y = 91 + 802 * t * (1 - t);
        return <path key={x} d={`M${x} ${y}V371`} strokeWidth={3} />;
      })}
      <path d="M30 450H922" stroke={S.accent2} strokeWidth={12} />
    </g>
  );
}

export function EasternMarket(): React.ReactElement {
  const S = useStage();
  return (
    <group position={[0, -1.24, 0]}>
      <ClayBlock size={[6.4, 0.15, 3.1]} color={S.clay[2]} />
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[5.4, 0.12, 1.52]}
          position={[0, 1.75, side * 0.7]}
          rotation={[side * 0.31, 0, 0]}
          color={S.clay[0]}
        />
      ))}
      {[-2.35, -0.8, 0.8, 2.35].map((x) => (
        <group key={x}>
          {[-0.94, 0.94].map((z) => (
            <ClayBlock
              key={z}
              size={[0.13, 1.65, 0.13]}
              position={[x, 0.85, z]}
              color={S.clay[1]}
            />
          ))}
        </group>
      ))}
      {[-1.75, 0, 1.75].map((x) => (
        <group key={x}>
          <ClayBlock size={[1.24, 0.46, 0.78]} position={[x, 0.35, 0.65]} color={S.clay[0]} />
          <ClayBlock size={[1.33, 0.09, 0.9]} position={[x, 0.63, 0.65]} color={S.clay[1]} />
          <ClayBlock size={[0.64, 0.14, 0.4]} position={[x, 0.75, 0.65]} color={S.clay[2]} />
        </group>
      ))}
    </group>
  );
}
export function EasternMarket2D(): React.ReactElement {
  const S = useStage();
  return (
    <g stroke={S.text} strokeWidth={4} fill={S.paper}>
      <path d="M80 174 476 48 872 174v44H80Z" fill={S.accent} />
      {[114, 355, 596, 837].map((x) => (
        <rect key={x} x={x} y={218} width={16} height={228} />
      ))}
      {[172, 409, 646].map((x) => (
        <g key={x}>
          <rect x={x} y={329} width={155} height={114} rx={5} />
          <path d={`M${x - 9} 317h173v23H${x - 9}Z`} fill={S.cardRaised} />
          <rect x={x + 43} y={287} width={70} height={28} rx={4} fill={S.accent} />
        </g>
      ))}
      <path d="M54 456H898" strokeWidth={9} />
    </g>
  );
}
