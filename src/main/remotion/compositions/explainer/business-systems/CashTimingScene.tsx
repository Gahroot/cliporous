import type React from 'react';
import { FoldedDocument } from '../cognition/models';
import { Banknote, SaleParcel } from '../concepts/business-operations/models';
import { HybridStage } from '../diagrams/HybridStage';
import { DiagramText, DirectedConnector, TimeLane } from '../diagrams/primitives';
import { SemanticSymbol } from '../diagrams/symbols';
import { ClayBlock } from '../explanation-kit';
import { formatMoney } from '../finance/poses';
import { useSceneTime, useStage } from '../stage';
import { cashTimingPose } from './poses';
import type { CashTimingScene as Scene } from './types';

export function CashTimingScene({ scene }: { scene: Scene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const p = cashTimingPose(t, scene);
  return (
    <HybridStage
      scene={scene}
      model={
        <>
          <ClayBlock size={[5.8, 0.12, 2.6]} position={[0, -1.25, 0]} color={S.clay[2]} />
          <group position={[-1.2, 0, 0]}>
            <FoldedDocument color={S.clay[0]} />
          </group>
          {scene.preset === 'inventory-before-sales' && (
            <group position={[1.5, -0.5, -0.4]} scale={1.3}>
              <SaleParcel />
            </group>
          )}
          {t >= scene.actionAt && (
            <group position={[-0.4 + 2.5 * p.costPaid, -0.9, 1]}>
              <Banknote />
            </group>
          )}
        </>
      }
      diagram={
        <>
          <TimeLane y={160} label={scene.paidWhen}>
            <g opacity={p.costPaid}>
              <SemanticSymbol symbolRole="account" x={112} y={101} size={62} />
              <DirectedConnector
                from={{ x: 172, y: 109 }}
                to={{ x: 346, y: 109 }}
                progress={p.costPaid}
              />
              <DiagramText
                x={612}
                y={111}
                columns={30}
                strong
              >{`Cash out: ${formatMoney(scene.cashPaid)}`}</DiagramText>
            </g>
          </TimeLane>
          <TimeLane y={330} label={scene.receivedWhen}>
            <g opacity={p.laterInvoice}>
              <SemanticSymbol
                symbolRole={scene.preset === 'receivable-gap' ? 'invoice' : 'holding'}
                x={112}
                y={272}
                size={62}
              />
              <DiagramText x={545} y={270} columns={34}>
                {scene.sales
                  ? `Customer payment: ${formatMoney(scene.sales)}`
                  : 'Customer payment: not stated'}
              </DiagramText>
            </g>
          </TimeLane>
          <g opacity={p.comparison}>
            <DiagramText x={476} y={394} size={32} columns={42} strong>
              {scene.profitMinor !== null
                ? `Profit: ${formatMoney({ minorUnits: scene.profitMinor, currency: scene.totalCosts.currency })}`
                : 'Profit: not stated'}
            </DiagramText>
            <DiagramText x={476} y={454} size={28} columns={40}>
              Cash movement, not an ending balance
            </DiagramText>
          </g>
        </>
      }
    />
  );
}
