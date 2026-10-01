import type React from 'react';
import { DeskTool, FoldedDocument, WorkDesk } from '../../cognition/models';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { Occupant } from '../../spatial/parts';
import { shade, useStage } from '../../stage';

/** A taped shipping parcel, not an anonymous quantity cube. */
export function SaleParcel(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[0.68, 0.55, 0.55]} color={S.clay[1]} />
      <ClayBlock size={[0.13, 0.56, 0.56]} color={S.accent} radius={0.015} />
      <ClayBlock
        size={[0.22, 0.16, 0.02]}
        position={[0.17, 0, 0.29]}
        color={S.paper}
        radius={0.01}
      />
    </group>
  );
}

/** Single banknote represents a labelled amount, never an unstated coin count. */
export function Banknote({ fee = false }: { fee?: boolean }): React.ReactElement {
  const S = useStage();
  return (
    <group rotation={[-0.22, 0, 0]}>
      <ClayBlock size={[0.84, 0.38, 0.075]} color={fee ? S.clay[2] : S.clay[0]} radius={0.035} />
      <mesh position={[0, 0, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.11, 0.11, 0.022, 20]} />
        <Clay color={S.text} />
      </mesh>
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[0.09, 0.2, 0.022]}
          position={[side * 0.3, 0, 0.05]}
          color={S.paper}
          radius={0.015}
        />
      ))}
    </group>
  );
}

export function OwnershipTray({ x }: { x: number }): React.ReactElement {
  const S = useStage();
  return (
    <group position={[x, -0.42, 0.15]}>
      <ClayBlock size={[1.28, 0.1, 0.96]} color={S.cardRaised} />
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[0.07, 0.17, 0.96]}
          position={[side * 0.6, 0.1, 0]}
          color={S.clay[2]}
          radius={0.02}
        />
      ))}
    </group>
  );
}

/** Same existing miniature people, with shop counter vs shopping bag role silhouettes. */
export function MarketParticipant({ buyer }: { buyer: boolean }): React.ReactElement {
  const S = useStage();
  return (
    <group position={[buyer ? 2.2 : -2.2, -0.65, -0.85]}>
      <group scale={2.2}>
        <Occupant variant={buyer} />
      </group>
      {buyer ? (
        <group position={[0.45, 0.4, 0.2]}>
          <ClayBlock size={[0.35, 0.43, 0.22]} color={S.clay[1]} />
          <mesh position={[0, 0.27, 0]}>
            <torusGeometry args={[0.105, 0.025, 8, 20, Math.PI]} />
            <Clay color={S.text} />
          </mesh>
        </group>
      ) : (
        <group position={[0, 0.38, 0.3]}>
          <ClayBlock size={[1.35, 0.53, 0.5]} color={S.clay[2]} />
          <ClayBlock size={[1.48, 0.09, 0.6]} position={[0, 0.3, 0]} color={S.cardRaised} />
          <ClayBlock
            size={[0.35, 0.18, 0.25]}
            position={[-0.43, 0.43, 0]}
            color={shade(S.text, -0.3)}
          />
        </group>
      )}
    </group>
  );
}

/** Capacity tickets have clock/slot silhouettes; their count is the exact source count. */
export function CapacityTicket({ slot = false }: { slot?: boolean }): React.ReactElement {
  const S = useStage();
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <cylinderGeometry args={[0.18, 0.18, 0.075, 20]} />
        <Clay color={S.clay[0]} />
      </mesh>
      <group rotation={[Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
        <ClayBlock
          size={[0.025, 0.12, 0.02]}
          position={[0, 0.045, 0]}
          color={S.text}
          radius={0.005}
        />
        <ClayBlock
          size={[slot ? 0.025 : 0.09, 0.025, 0.02]}
          position={[slot ? 0.07 : 0.035, 0, 0]}
          color={S.text}
          radius={0.005}
        />
      </group>
    </group>
  );
}

export function ProjectWorkbench({ second }: { second: boolean }): React.ReactElement {
  const S = useStage();
  return (
    <group position={[second ? 2 : -2, -0.25, 0]}>
      <WorkDesk width={1.85} depth={1.9} />
      <group position={[-0.46, 0.57, -0.65]} scale={0.58}>
        <FoldedDocument color={second ? S.clay[2] : S.accent} mark={second ? 'lines' : 'plan'} />
      </group>
      <group position={[0.45, 0.25, -0.62]} scale={0.7}>
        <DeskTool variant={second ? 'hammer' : 'draft'} color={S.clay[2]} />
      </group>
    </group>
  );
}

/** An open accounting envelope: a visible empty interior is break-even, not growth. */
export function RemainderEnvelope({
  shortfall = false,
}: {
  shortfall?: boolean;
}): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[1.12, 0.48, 0.09]} color={S.paper} />
      <ClayBlock
        size={[1.12, 0.25, 0.07]}
        position={[0, -0.12, 0.16]}
        color={shortfall ? S.clay[2] : S.clay[1]}
      />
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[0.08, 0.46, 0.24]}
          position={[side * 0.53, 0, 0.06]}
          color={S.paper}
          radius={0.015}
        />
      ))}
    </group>
  );
}

export function ExchangeLane({ payment = false }: { payment?: boolean }): React.ReactElement {
  const S = useStage();
  return (
    <group position={[0, -0.48, payment ? 1.15 : 0.12]} rotation={[0, payment ? Math.PI : 0, 0]}>
      <ClayBlock size={[2.65, 0.035, 0.055]} color={S.muted} radius={0.01} />
      <mesh position={[1.35, 0.03, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.1, 0.25, 3]} />
        <Clay color={S.muted} />
      </mesh>
    </group>
  );
}
