import type React from 'react';
import { FoldedDocument } from '../../cognition/models';
import { ClayBlock, ExplanationStage } from '../../explanation-kit';
import { useSceneTime, useStage } from '../../stage';
import { TechText } from '../../technology/primitives';
import { Banknote, RemainderEnvelope, SaleParcel } from './models';
import { unitEconomicsPose } from './poses';
import type { UnitEconomicsScene } from './types';

/** Invoices separate from one sale, with amount-scaled rails and an empty/unfunded result. */
export function EconomicsView({ scene }: { scene: UnitEconomicsScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = unitEconomicsPose(scene, t);
  const equation = `${scene.revenue} − ${pose.totalCost} = ${scene.remainder} ${scene.unit}`;
  return (
    <>
      <ExplanationStage
        scene={scene}
        labels={[
          pose.showComparison
            ? equation
            : `Revenue ${scene.revenue} ${scene.unit} · stated costs only`,
        ]}
      >
        <ClayBlock size={[7, 0.14, 3.1]} position={[0, -0.76, 0.1]} color={S.card} />
        <group position={[-2.7, 0.08, -0.75]}>
          <SaleParcel />
        </group>
        {pose.split < 1 && (
          <group position={[-1.6, 0.2, -0.45]} scale={1 - pose.split}>
            <Banknote />
          </group>
        )}
        {pose.costs.map((cost, index) => (
          <group key={cost.id} position={cost.position} scale={pose.split * 0.8}>
            <FoldedDocument color={S.clay[index % 3] ?? S.accent} />
          </group>
        ))}
        <group position={[2.45, 0, -0.8]}>
          <RemainderEnvelope shortfall={pose.shortfall > 0} />
          {pose.showComparison && pose.retained > 0 && (
            <group position={[0, 0.24, 0.06]} scale={0.7}>
              <Banknote />
            </group>
          )}
          {pose.showComparison && pose.shortfall > 0 && (
            <ClayBlock
              size={[0.75, 0.07, 0.08]}
              position={[0, 0.16, 0.23]}
              color={S.negative}
              radius={0.02}
            />
          )}
        </group>
        {/* Common source-derived scale; shortfall stays aggregate, never assigned to an unstated creditor. */}
        <ClayBlock
          size={[4.55, 0.07, 0.12]}
          position={[0, -0.37, 1.05]}
          color={S.muted}
          radius={0.015}
        />
        <ClayBlock
          size={[pose.revenueWidth, 0.17, 0.16]}
          position={[-2.2 + pose.revenueWidth / 2, -0.23, 1.05]}
          color={S.accent}
          radius={0.02}
        />
        {pose.showComparison && pose.costWidth > 0 && (
          <ClayBlock
            size={[pose.costWidth, 0.09, 0.12]}
            position={[-2.2 + pose.costWidth / 2, -0.41, 1.3]}
            color={S.clay[2]}
            radius={0.015}
          />
        )}
        {pose.showComparison && pose.remainderWidth > 0 && (
          <ClayBlock
            size={[pose.remainderWidth, 0.06, 0.09]}
            position={[
              -2.2 + Math.min(pose.costWidth, pose.revenueWidth) + pose.remainderWidth / 2,
              -0.12,
              1.3,
            ]}
            color={pose.shortfall > 0 ? S.negative : S.clay[1]}
            radius={0.015}
          />
        )}
      </ExplanationStage>
      <TechText x={120} y={205} width={840} size={30} align="center">
        {scene.saleUnit} · {scene.revenue} {scene.unit} revenue · stated costs only
      </TechText>
      {pose.split > 0 &&
        scene.costs.map((cost, index) => (
          <TechText
            key={cost.id}
            x={85 + (index * 910) / scene.costs.length}
            y={686}
            width={910 / scene.costs.length - 20}
            size={25}
            align="center"
          >
            {cost.label}: {cost.amount} {scene.unit}
          </TechText>
        ))}
      {pose.showComparison && (
        <TechText x={120} y={743} width={840} size={26} align="center">
          {pose.status === 'break-even'
            ? 'Break-even · no remainder'
            : `${pose.status === 'shortfall' ? 'Unfunded cost' : 'Remainder after stated costs'}: ${Math.abs(scene.remainder)} ${scene.unit}`}
        </TechText>
      )}
    </>
  );
}
