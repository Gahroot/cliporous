import type React from 'react';
import { FoldedDocument, PaperTray } from '../../cognition/models';
import { Banknote, OwnershipTray } from '../../concepts/business-operations/models';
import { ProvenanceLink } from '../../concepts/information/models';
import { Correspondence } from '../../concepts/perspective/assemblies';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { useStage } from '../../stage';

// Defensive pose bounds only, not validation of source amounts or evidence.
function unit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/** A-09: a commitment record stays a document, with a separate, source-chosen cash tray. */
export function CommitmentFolio({
  open,
  contributed,
}: {
  open: number;
  contributed: boolean;
}): React.ReactElement {
  const S = useStage();
  return (
    <group name="commitment-folio">
      <ClayBlock size={[1.2, 1.5, 0.08]} position={[0, 0, -0.12]} color={S.clay[0]} />
      <ClayBlock size={[1.12, 1.42, 0.12]} position={[0.015, 0, -0.015]} color={S.paper} />
      <ClayBlock size={[0.14, 1.56, 0.3]} position={[-0.6, 0, 0]} color={S.clay[2]} />
      <group name="commitment-record" position={[0.03, 0, 0.055]} scale={0.85}>
        <FoldedDocument color={S.clay[0]} />
      </group>
      {/* Fixed hardcover rotates about its spine; the record never becomes money. */}
      <group position={[-0.6, 0, 0.11]} rotation={[0, -Math.PI * 0.85 * unit(open), 0]}>
        <ClayBlock size={[1.2, 1.5, 0.08]} position={[0.6, 0, 0]} color={S.clay[0]} />
        <ClayBlock
          size={[0.55, 0.38, 0.028]}
          position={[0.62, 0.3, 0.055]}
          color={S.paper}
          radius={0.025}
        />
        {[0.36, 0.26].map((width, index) => (
          <ClayBlock
            key={width}
            size={[width, 0.025, 0.018]}
            position={[0.62, 0.35 - index * 0.1, 0.077]}
            color={S.paperText}
            radius={0.006}
          />
        ))}
      </group>
      <group name="contribution-tray" position={[1.25, 0, 0.3]}>
        <OwnershipTray x={0} />
      </group>
      {contributed && (
        <group name="contributed-cash" position={[1.25, -0.12, 0.45]} scale={0.7}>
          <Banknote />
        </group>
      )}
    </group>
  );
}

/**
 * A-10: four fixed priority trays. Fills are already-validated exact source ratios;
 * no fee, hurdle, payout amount or later-tier eligibility is inferred here.
 */
export function DistributionTierTrays({
  fills,
}: {
  fills: readonly [number, number, number, number];
}): React.ReactElement {
  const S = useStage();
  return (
    <group name="distribution-tier-trays">
      {[0, 1, 2, 3].map((index) => {
        const fill = unit(fills[index]);
        return (
          <group
            key={index}
            name={`tier-${index}`}
            position={[(index - 1.5) * 1.3, 0.45 + (3 - index) * 0.4, 0]}
          >
            <PaperTray width={1.12} depth={0.85} />
            {/* Kept mounted even at zero; a continuous span introduces no invented coin count. */}
            <group
              name={`tier-fill-${index}`}
              position={[-0.43, -1.055, 0]}
              scale={[fill, 1, 1]}
              visible={fill > 0}
            >
              <ClayBlock
                size={[0.86, 0.12, 0.64]}
                position={[0.43, 0, 0]}
                color={S.accent}
                radius={0.025}
              />
            </group>
          </group>
        );
      })}
    </group>
  );
}

/** Lightweight bound calendar leaf; date labels belong to the source-valid pack. */
function MaturityCalendar({ focused }: { focused: boolean }): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock
        size={[0.84, 0.74, 0.055]}
        position={[0, -0.045, 0]}
        color={S.paper}
        radius={0.02}
      />
      <ClayBlock
        size={[0.92, 0.16, 0.13]}
        position={[0, 0.39, 0]}
        color={focused ? S.accent : S.clay[0]}
        radius={0.025}
      />
      <ClayBlock
        size={[0.46, 0.26, 0.025]}
        position={[0, -0.05, 0.0475]}
        color={S.card}
        radius={0.02}
      />
      {[-0.24, 0.24].map((x) => (
        <mesh key={x} position={[x, 0.43, 0.015]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.077, 0.018, 6, 16]} />
          <Clay color={S.clay[2]} />
        </mesh>
      ))}
    </group>
  );
}

/** A-11: three dated reading slots, not a return graph or a prediction of liquidity. */
export function MaturityLadder({ focus }: { focus: 0 | 1 | 2 }): React.ReactElement {
  const S = useStage();
  return (
    <group name="maturity-ladder">
      <ClayBlock size={[1.92, 0.14, 1.92]} position={[0, -1, 0.02]} color={S.clay[2]} />
      {[-0.76, 0.76].map((x) => (
        <Correspondence key={x} from={[x, -0.93, 0.64]} to={[x, 0.6, -0.56]} radius={0.036} />
      ))}
      {[0, 1, 2].map((index) => {
        const y = -0.78 + index * 0.65;
        const z = 0.5 - index * 0.5;
        return (
          <group key={index} name={`maturity-slot-${index}`}>
            <ClayBlock size={[1.7, 0.11, 0.68]} position={[0, y, z]} color={S.clay[1]} />
            <group position={[0, y + 0.48, z - 0.05]}>
              <MaturityCalendar focused={index === focus} />
            </group>
          </group>
        );
      })}
    </group>
  );
}

/**
 * A-12: asset folio, ownership record and economic-claim record stay distinct.
 * Separation is inspection, not transfer, payment, marketability or liquidity.
 */
export function EconomicRightsLayers({ separation }: { separation: number }): React.ReactElement {
  const S = useStage();
  const spread = unit(separation);
  return (
    <group name="economic-rights-layers">
      <group name="asset-folio">
        <ClayBlock size={[1.65, 0.09, 1.45]} position={[0, -0.64, 0]} color={S.clay[0]} />
        <ClayBlock size={[1.5, 0.18, 1.31]} position={[0, -0.505, 0]} color={S.paper} />
        <ClayBlock size={[1.65, 0.09, 1.45]} position={[0, -0.37, 0]} color={S.clay[0]} />
        <ClayBlock size={[0.12, 0.3, 1.45]} position={[-0.78, -0.505, 0]} color={S.clay[2]} />
        <ClayBlock
          size={[0.56, 0.022, 0.36]}
          position={[0.15, -0.314, 0]}
          color={S.paper}
          radius={0.025}
        />
      </group>
      {[0, 1].map((index) => {
        const y = index === 0 ? -0.2 + 0.6 * spread : 1.1 * spread;
        const color = S.clay[index + 1];
        const x = index === 0 ? -0.68 : 0.68;
        return (
          <group key={index} name={index === 0 ? 'ownership-record' : 'economic-claim-record'}>
            <ClayBlock size={[1.5, 0.065, 1.45]} position={[0, y, 0]} color={S.card} />
            <group position={[0, y + 0.065, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={1.05}>
              <FoldedDocument color={color} />
            </group>
            {/* Physical association only: no arrow or cash carrier promises a liquid claim. */}
            <ProvenanceLink from={[x, -0.3, 0.65]} to={[x, y, 0.65]} color={color} />
          </group>
        );
      })}
    </group>
  );
}
