import type React from 'react';
import { FoldedDocument } from '../../cognition/models';
import { Clay } from '../../hero-kit';
import { useStage } from '../../stage';
import { ApprovalRail, PermissionCard } from '../assets/authority';
import { ProviderConnectorPanel } from '../assets/infrastructure';
import { CommercialStorefront, ServiceStation } from '../assets/retail';
import type { MarketsPartsProps } from './MarketsDiagramParts';
import { marketsAssets, marketsKey, sampleMarkets } from './poses';
import { marketsIdentities, marketsRows } from './presentation';

/** Stage-free recognizable assemblies; no private canvas, inferred operator, purchase or cash. */
export function MarketsModelParts({
  scene,
  seconds,
}: MarketsPartsProps): React.ReactElement | null {
  const S = useStage();
  if (scene.kind === 'market-dependency' && scene.preset === 'stated-participation-benefit')
    return null;
  const pose = sampleMarkets(scene, seconds);
  const assets = marketsAssets(scene);
  const sourceIdentities = marketsIdentities(scene);
  return (
    <group
      name={marketsKey(scene, 'assembly', 'source')}
      userData={{ facts: marketsRows(scene), condition: scene.condition ?? null }}
    >
      {sourceIdentities.map((identity, index) => {
        const local = pose.identities.find((i) => i.id === identity.id);
        const asset = assets.find((a) => a.id === identity.id);
        const isSpecialist =
          scene.kind === 'market-dependency' &&
          scene.preset === 'complementary-specialists' &&
          scene.specialists.some((s) => s.identity.id === identity.id);
        const alternative = pose.alternatives.find((a) => a.id === identity.id);
        // Fixed equal-baseline alternatives; scale never encodes a winner or source quantity.
        const x = isSpecialist
          ? (local?.x ?? 0)
          : asset
            ? (assets.indexOf(asset) - (assets.length - 1) / 2) * 2.4
            : (local?.x ?? 0);
        return (
          <group
            key={identity.id}
            name={marketsKey(scene, 'identity', identity.id)}
            position={[x, asset ? 0 : 1.1, asset ? -0.3 : 0.9]}
            scale={asset ? (isSpecialist ? 0.65 * (local?.scale ?? 1) : 0.7) : 0.32}
            userData={{
              sourceIdentityId: identity.id,
              label: identity.label,
              source: identity.source,
              asset: asset?.asset ?? null,
              illustrativeArchitecture: asset !== undefined,
              baseline: alternative?.baseline ?? null,
              area: alternative?.area ?? null,
            }}
          >
            {asset?.asset === 'A-01' ? (
              <CommercialStorefront open={pose.inspection} />
            ) : asset?.asset === 'A-02' ? (
              <ServiceStation occupied={false} />
            ) : asset?.asset === 'A-16' ? (
              <ProviderConnectorPanel
                connected={
                  scene.kind === 'market-dependency' &&
                  (scene.preset === 'migration-constraints'
                    ? scene.migration.state === 'completed' &&
                      scene.constraints.every((c) => c.state === 'satisfied')
                    : scene.preset === 'supplier-distribution-boundaries' &&
                      scene.distribution.state === 'source-stated')
                }
                progress={pose.migration?.gate ?? pose.inspection}
              />
            ) : asset?.asset === 'A-05' && scene.kind === 'procurement-commitment' ? (
              <group
                userData={{
                  delegateId: scene.roles.delegate.actorId,
                  sourceState: scene.authority.state,
                  sourceRole: scene.roles.delegate.text,
                }}
              >
                <PermissionCard
                  state={
                    scene.authority.state === 'granted'
                      ? 'allowed'
                      : scene.authority.state === 'denied'
                        ? 'denied'
                        : 'unknown'
                  }
                  focus={pose.inspection}
                />
              </group>
            ) : asset?.asset === 'A-06' && scene.kind === 'procurement-commitment' ? (
              <group
                userData={{
                  approverId: scene.roles.approver.actorId,
                  sourceState: scene.authority.state,
                  sourceRole: scene.roles.approver.text,
                }}
              >
                <ApprovalRail accepted={pose.procurement?.authority.accepted ?? 0} />
              </group>
            ) : (
              <FoldedDocument color={S.clay[index % S.clay.length]} />
            )}
          </group>
        );
      })}
      {pose.matches.map((match, index) => (
        <group
          key={match.id}
          name={match.id}
          position={[0, 0.4, 1.3 + index * 0.12]}
          userData={{
            leftId: match.leftId,
            rightId: match.rightId,
            sourceState: match.state,
            acceptanceState: match.acceptanceState,
          }}
        >
          {/* Literal separated matching documents; joining requires matching, not participation. */}
          <group position={[-0.65 + match.matching * 0.35, 0, 0]} scale={0.25}>
            <FoldedDocument color={S.clay[0]} />
          </group>
          <group position={[0.65 - match.matching * 0.35, 0, 0]} scale={0.25}>
            <FoldedDocument color={S.clay[1]} />
          </group>
        </group>
      ))}
      {scene.kind === 'procurement-commitment' &&
        scene.payment.state === 'paid' &&
        scene.payment.amount !== null && (
          <group
            name={marketsKey(scene, 'settlement', scene.payment.identity.id)}
            position={[-0.65 + (pose.procurement?.settlement ?? 0) * 1.3, 0.1, 1.4]}
            userData={{
              sourceState: 'paid',
              amount: scene.payment.amount,
              basis: scene.payment.basis,
              requesterId: scene.roles.requester.actorId,
              payeeId: scene.roles.payee.actorId,
            }}
          >
            <mesh visible={(pose.procurement?.settlement ?? 0) > 0} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.16, 0.16, 0.055, 20]} />
              <Clay color={S.accent} />
            </mesh>
          </group>
        )}
    </group>
  );
}
