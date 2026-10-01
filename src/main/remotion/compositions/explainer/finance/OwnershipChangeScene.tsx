import type React from 'react';
import { FoldedDocument } from '../cognition/models';
import { HybridStage } from '../diagrams/HybridStage';
import { DiagramText, OwnershipStrip } from '../diagrams/primitives';
import { ClayBlock } from '../explanation-kit';
import { useSceneTime, useStage } from '../stage';
import { formatMoney, ownershipPose } from './poses';
import type { OwnershipChangeScene as Scene } from './types';

export function OwnershipChangeScene({ scene }: { scene: Scene }): React.ReactElement {
  const S = useStage();
  const { t } = useSceneTime();
  const pose = ownershipPose(t, scene);
  const after = t >= scene.responseAt;
  return (
    <HybridStage
      scene={scene}
      model={
        <>
          <ClayBlock size={[5.8, 0.14, 2.25]} position={[0, -1.25, 0]} color={S.clay[2]} />
          <group position={[-1.7, -0.2, 0]} rotation={[0, 0.12, 0]}>
            <FoldedDocument color={S.clay[0]} />
          </group>
          <group position={[1.4, -0.2 + (1 - pose.issuedReveal), 0]} scale={pose.issuedReveal}>
            <FoldedDocument color={S.clay[1]} />
          </group>
          <ClayBlock size={[1.55, 0.08, 1.22]} position={[-1.7, -1.12, 0]} color={S.accent} />
        </>
      }
      diagram={
        <>
          <OwnershipStrip
            x={56}
            y={95}
            width={(840 * scene.beforeTotal) / scene.afterTotal}
            total={scene.beforeTotal}
            retained={scene.shares}
            label={`${scene.holder.label}: before`}
          />
          {after && (
            <OwnershipStrip
              x={56}
              y={305}
              width={840}
              total={scene.afterTotal}
              retained={scene.shares}
              label={`${scene.holder.label}: after`}
            />
          )}
          <DiagramText
            x={880}
            y={67}
            size={38}
            anchor="end"
            strong
          >{`${scene.beforePercent}%`}</DiagramText>
          {t >= scene.checkAt && (
            <DiagramText
              x={880}
              y={277}
              size={38}
              anchor="end"
              strong
            >{`${scene.afterPercent}%`}</DiagramText>
          )}
          {t >= scene.checkAt && (
            <DiagramText x={476} y={450} size={28} columns={48}>
              {scene.valuation.state === 'unknown'
                ? 'Value not stated'
                : `Company value: ${formatMoney(scene.valuation.before)} → ${formatMoney(scene.valuation.after)}`}
            </DiagramText>
          )}
        </>
      }
    />
  );
}
