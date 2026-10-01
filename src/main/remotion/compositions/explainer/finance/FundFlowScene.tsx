import type React from 'react';
import { Banknote, OwnershipTray } from '../concepts/business-operations/models';
import { HybridStage } from '../diagrams/HybridStage';
import { FLOW_POINTS } from '../diagrams/layout';
import { DiagramNode, DirectedConnector } from '../diagrams/primitives';
import { ClayBlock } from '../explanation-kit';
import { Occupant } from '../spatial/parts';
import { useSceneTime, useStage } from '../stage';
import { formatMoney, fundFlowPose } from './poses';
import type { FundFlowScene as Scene } from './types';

export function FundFlowScene({ scene }: { scene: Scene }): React.ReactElement {
  const S = useStage();
  const { t } = useSceneTime();
  const pose = fundFlowPose(t, scene);
  const distribution = scene.preset === 'proceeds-distribution';
  const diagram = (
    <>
      {scene.sources.map((actor, i) => {
        const point = FLOW_POINTS.sources[i];
        const amount = scene.contributions[i].amount;
        return (
          <g key={actor.id}>
            <DirectedConnector
              from={{ x: point.x + 85, y: point.y - 25 }}
              to={{ x: 396, y: 145 }}
              progress={pose.contributed}
            />
            <DiagramNode
              entity={{ ...actor, role: distribution ? 'company' : 'investor' }}
              point={point}
              detail={amount.state === 'measured' ? formatMoney(amount.money) : undefined}
            />
          </g>
        );
      })}
      <DiagramNode
        entity={{ ...scene.account, role: 'account' }}
        point={FLOW_POINTS.account}
        detail={
          scene.retained && t >= scene.checkAt
            ? `Retained ${formatMoney(scene.retained)}`
            : undefined
        }
      />
      {scene.targets.map((actor, i) => {
        const point = FLOW_POINTS.targets[i];
        const amount = scene.deployments[i].amount;
        return (
          <g key={actor.id}>
            <DirectedConnector
              from={{ x: 556, y: 145 }}
              to={{ x: point.x - 85, y: point.y - 25 }}
              progress={pose.deployed}
            />
            <DiagramNode
              entity={{ ...actor, role: distribution ? 'investor' : 'company' }}
              point={point}
              opacity={t >= scene.responseAt ? 1 : 0.45}
              detail={
                t >= scene.responseAt && amount.state === 'measured'
                  ? formatMoney(amount.money)
                  : undefined
              }
            />
          </g>
        );
      })}
    </>
  );
  const model = (
    <>
      <OwnershipTray x={0} />
      {scene.sources.map((actor, i) => (
        <group key={actor.id} position={[-2.5, -0.8, (i - 0.5) * 1.8]}>
          {distribution ? (
            <ClayBlock size={[0.85, 1.2, 0.75]} color={S.clay[1]} />
          ) : (
            <group scale={2.4}>
              <Occupant variant={i === 1} />
            </group>
          )}
          {t >= scene.actionAt && t < scene.responseAt && (
            <group position={[2.5 * pose.contributed, 0.65, 0]} scale={0.7}>
              <Banknote />
            </group>
          )}
        </group>
      ))}
      {scene.targets.map((actor, i) => (
        <group key={actor.id} position={[2.5, -0.8, (i - 0.5) * 1.8]}>
          {distribution ? (
            <group scale={2.4}>
              <Occupant variant={i === 1} />
            </group>
          ) : (
            <>
              <ClayBlock size={[1, 1.15, 0.9]} color={S.clay[0]} />
              <ClayBlock size={[1.15, 0.12, 1.06]} position={[0, 0.68, 0]} color={S.clay[1]} />
              <ClayBlock size={[0.28, 0.42, 0.04]} position={[0, -0.25, 0.48]} color={S.clay[2]} />
            </>
          )}
          {t >= scene.responseAt && (
            <group position={[-2.5 * (1 - pose.deployed), 0.65, 0]} scale={0.7}>
              <Banknote />
            </group>
          )}
        </group>
      ))}
    </>
  );
  return <HybridStage scene={scene} model={model} diagram={diagram} />;
}
