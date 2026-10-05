import type React from 'react';
import { CapitalDependencyView } from '../business/capital/DependencyLensParts';
import { OwnershipTray } from '../concepts/business-operations/models';
import { HybridStage } from '../diagrams/HybridStage';
import { reveal } from '../diagrams/motion';
import { DiagramText, DirectedConnector } from '../diagrams/primitives';
import { SemanticSymbol } from '../diagrams/symbols';
import { ClayBlock } from '../explanation-kit';
import { useSceneTime, useStage } from '../stage';
import type { PortfolioExposureScene as Scene } from './types';

export function PortfolioExposureScene({ scene }: { scene: Scene }): React.ReactElement {
  const S = useStage();
  const { t } = useSceneTime();
  const show = reveal(t, scene.actionAt),
    link = reveal(t, scene.responseAt);
  const driver = scene.preset === 'shared-driver';
  if (scene.dependencyLens)
    return <CapitalDependencyView scene={scene} lens={scene.dependencyLens} />;
  return (
    <HybridStage
      scene={scene}
      model={
        <>
          {scene.funds.map((fund, i) => (
            <group key={fund.id} position={[(i - 0.5) * 3.2, 0, 0]}>
              <OwnershipTray x={0} />
              <group scale={show}>
                <ClayBlock size={[0.7, 0.72, 0.65]} position={[0, 0.04, 0]} color={S.clay[1]} />
                <ClayBlock size={[0.78, 0.11, 0.73]} position={[0, 0.49, 0]} color={S.clay[0]} />
                <ClayBlock size={[0.2, 0.26, 0.04]} position={[0, -0.17, 0.35]} color={S.clay[2]} />
              </group>
            </group>
          ))}
          <ClayBlock
            size={[3.2 * link, 0.04, 0.065]}
            position={[0, 0.05, 0.35]}
            color={S.accent}
            radius={0.015}
          />
        </>
      }
      diagram={
        <>
          {scene.funds.map((fund, i) => {
            const x = i === 0 ? 225 : 727;
            const holdings = driver
              ? [scene.exposure]
              : scene.holdings
                  .filter((h) => h.fundId === fund.id)
                  .map((h) => h.holding)
                  .sort(
                    (a, b) =>
                      Number(b.id === scene.exposure.id) - Number(a.id === scene.exposure.id),
                  );
            return (
              <g key={fund.id} data-entity-id={fund.id}>
                <DiagramText x={x} y={26} size={28} columns={14} strong>
                  {fund.label}
                </DiagramText>
                {holdings.map((holding, j) => (
                  <g key={holding.id} opacity={show} data-entity-id={holding.id}>
                    <SemanticSymbol
                      symbolRole={driver ? 'task' : 'company'}
                      x={x - 180}
                      y={112 + j * 89}
                      size={36}
                    />
                    <DiagramText
                      x={x + 32}
                      y={112 + j * 89}
                      size={26}
                      columns={14}
                      strong={holding.id === scene.exposure.id}
                    >
                      {holding.label}
                    </DiagramText>
                  </g>
                ))}
              </g>
            );
          })}
          <DirectedConnector
            edgeRole="shared"
            from={{ x: 446, y: 112 }}
            to={{ x: 506, y: 112 }}
            progress={link}
          />
          <g opacity={link}>
            <DiagramText x={476} y={390} size={26} columns={34} strong>
              {driver
                ? `Common driver: ${scene.exposure.label}`
                : `Shared holding: ${scene.exposure.label}`}
            </DiagramText>
          </g>
          {t >= scene.checkAt && (
            <DiagramText x={476} y={469} size={26} columns={46}>
              Other exposure: not stated
            </DiagramText>
          )}
        </>
      }
    />
  );
}
