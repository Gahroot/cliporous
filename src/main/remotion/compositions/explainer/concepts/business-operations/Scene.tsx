import type React from 'react';
import { ClayBlock, ExplanationStage } from '../../explanation-kit';
import { useSceneTime, useStage } from '../../stage';
import { TechText } from '../../technology/primitives';
import { AllocationView } from './AllocationView';
import { EconomicsView } from './EconomicsView';
import { Banknote, ExchangeLane, MarketParticipant, OwnershipTray, SaleParcel } from './models';
import { marketExchangeLabels, marketExchangePose, marketExchangeStatus } from './poses';
import type { BusinessOperationsScene, MarketExchangeScene } from './types';

function MarketView({ scene }: { scene: MarketExchangeScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = marketExchangePose(scene, t);
  const paid = scene.payment;
  const labels = marketExchangeLabels(scene, t);
  return (
    <>
      <ExplanationStage scene={scene} labels={labels}>
        <ClayBlock size={[7.1, 0.15, 3.2]} position={[0, -0.78, 0.1]} color={S.card} />
        <MarketParticipant buyer={false} />
        <MarketParticipant buyer />
        <OwnershipTray x={-2.2} />
        <OwnershipTray x={2.2} />
        {!pose.unmatched && (
          <>
            <ExchangeLane />
            <ExchangeLane payment />
          </>
        )}
        <group position={pose.product}>
          <SaleParcel />
        </group>
        {paid && !pose.showSplit && (
          <group position={pose.payment}>
            <Banknote />
          </group>
        )}
        {pose.showSplit && (
          <>
            <group position={pose.sellerPayment}>
              <Banknote />
            </group>
            <group position={pose.platformFee}>
              <Banknote fee />
            </group>
          </>
        )}
        {scene.platform && (
          <group position={[0, -0.22, -0.9]}>
            <ClayBlock size={[0.8, 0.95, 0.4]} color={S.clay[2]} />
            <ClayBlock size={[0.62, 0.35, 0.04]} position={[0, 0.18, 0.22]} color={S.paper} />
            <ClayBlock
              size={[0.4, 0.06, 0.04]}
              position={[0, -0.16, 0.22]}
              color={S.text}
              radius={0.01}
            />
          </group>
        )}
        {pose.unmatched && (
          <group position={[0, -0.2, 0.5]}>
            {[-0.24, 0.24].map((x) => (
              <ClayBlock key={x} size={[0.12, 0.72, 0.12]} position={[x, 0, 0]} color={S.muted} />
            ))}
          </group>
        )}
      </ExplanationStage>
      <TechText x={120} y={210} width={840} size={30} align="center">
        {pose.unmatched
          ? 'No match · no payment'
          : `${scene.product} → buyer · ${paid?.amount} ${paid?.unit} → ${scene.platform ? 'platform' : 'seller'}`}
      </TechText>
      <TechText x={100} y={716} width={880} size={26} align="center">
        {marketExchangeStatus(scene, t)}
      </TechText>
    </>
  );
}

export function BusinessOperationsSceneView({
  scene,
}: {
  scene: BusinessOperationsScene;
}): React.ReactElement {
  switch (scene.kind) {
    case 'market-exchange':
      return <MarketView scene={scene} />;
    case 'resource-allocation':
      return <AllocationView scene={scene} />;
    case 'unit-economics':
      return <EconomicsView scene={scene} />;
  }
}
