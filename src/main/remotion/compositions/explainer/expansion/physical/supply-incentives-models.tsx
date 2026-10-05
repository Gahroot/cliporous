import type {} from '@react-three/fiber';
import type { ReactElement } from 'react';
import { Banknote, MarketParticipant, SaleParcel } from '../../concepts/business-operations/models';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import { InfrastructureCarrierClay, InfrastructureStageClay } from '../kits/infrastructure';
import type { ExpansionKitColors, ExpansionKitState } from '../scene-types';
import { type SupplyIncentivesPose, supplyIncentivesActiveRecord } from './supply-incentives-poses';
import type { ExpansionSupplyIncentivesScene } from './supply-incentives-types';

export const SUPPLY_INCENTIVES_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function supplyIncentivesModelPlacement(
  column: number,
  wide?: { width: number; height: number },
): { position: [number, number, number]; scale: number } {
  const width = wide?.width ?? 1080,
    height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * meet) / 2 + (184 + column * 236) * meet : 64 + 184 + column * 236;
  const y = wide ? (height - 478 * meet) / 2 + 420 * meet : 262 + 420;
  const units = worldUnitsPerPixel(SUPPLY_INCENTIVES_CAMERA, height);
  return { position: [(x - width / 2) * units, (height / 2 - y) * units, 0], scale: units * meet };
}
/** Carriers are single semantic glyphs, NOT counts, measured stock or an inferred balance.
 * Hidden geometry remains authored and is included in the composed budget proofs.
 * A replacement assertion never changes the inventory tray's content or creates stock.
 */
export function SupplyIncentivesModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionSupplyIncentivesScene;
  pose: SupplyIncentivesPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage(),
    r = supplyIncentivesActiveRecord(scene, pose);
  const placement = supplyIncentivesModelPlacement(0, wide?.model);
  const state: ExpansionKitState =
    r.state === 'unknown' || r.state === 'missing'
      ? 'unknown'
      : r.state === 'disputed'
        ? 'disputed'
        : 'retained';
  const props = {
    pose: { ...pose, reveal: 1 },
    colors,
    state,
    position: [0, 0, 0] as const,
    scale: 1,
  };
  const name = (id: string) => scene.entities.find((e) => e.id === id)?.label ?? id;
  const content =
    r.state === 'unknown' || r.state === 'missing'
      ? ({ kind: r.state, qualifier: r.value } as const)
      : ({ kind: 'known', exact: r.value } as const);
  const provenance = { kind: 'source', qualifier: r.qualifier ?? r.condition ?? r.state } as const;
  return (
    <group
      position={placement.position}
      scale={placement.scale}
      userData={{
        sourceId: r.id,
        actorId: r.actorId,
        targetId: r.targetId,
        role: r.role,
        state: r.state,
      }}
    >
      <group scale={28}>
        {scene.storyId === '73' ? (
          <>
            <InfrastructureStageClay
              {...props}
              position={[-2, 0, 0]}
              stage={{
                id: r.actorId,
                label: name(r.actorId),
                kind: r.role === 'inventory' ? 'inventory-tray' : 'supply-module',
                position: [0, 0, 0],
                state,
                content,
                provenance,
              }}
            />
            <InfrastructureStageClay
              {...props}
              position={[2, 0, 0]}
              stage={{
                id: r.targetId,
                label: name(r.targetId),
                kind: r.role === 'replacement' ? 'inventory-tray' : 'supply-module',
                position: [0, 0, 0],
                state,
                content,
                provenance,
              }}
            />
            <ClayBlock size={[2.6, 0.08, 0.18]} position={[0, -0.48, 0]} color={colors.muted} />
            <group
              name={
                r.role === 'transfer' || r.role === 'replacement'
                  ? 'shipment-source-visible'
                  : 'shipment-source-hidden'
              }
              visible={r.role === 'transfer' || r.role === 'replacement'}
              userData={{ sourceId: r.id, semantic: 'source shipment; no computed replenishment' }}
            >
              <InfrastructureCarrierClay
                {...props}
                position={[pose.travel, 0, 0]}
                carrier={{
                  id: r.id,
                  label: name(r.actorId),
                  kind: 'supply-parcel',
                  position: [0, 0, 0],
                  state,
                  content,
                  provenance,
                }}
              />
            </group>
          </>
        ) : (
          <>
            <group userData={{ actorId: r.actorId }}>
              <MarketParticipant buyer={false} />
            </group>
            <group userData={{ actorId: r.targetId }}>
              <MarketParticipant buyer={true} />
            </group>
            <ClayBlock size={[2.6, 0.08, 0.18]} position={[0, -0.48, 0]} color={colors.muted} />
            <group
              position={[pose.travel, 0, 0]}
              name={r.role === 'payment' ? 'payment-source-visible' : 'payment-source-hidden'}
              visible={r.role === 'payment'}
              userData={{ sourceId: r.id, semantic: 'source payment' }}
            >
              <Banknote />
            </group>
            <group
              position={[0, 0, 0]}
              name={r.role === 'benefit' ? 'benefit-source-visible' : 'benefit-source-hidden'}
              visible={r.role === 'benefit'}
              userData={{ sourceId: r.id, semantic: 'source benefit; not profit' }}
            >
              <SaleParcel />
            </group>
            <group
              position={[0, 0, 0]}
              name={
                r.role === 'external-effect'
                  ? 'external-effect-source-visible'
                  : 'external-effect-source-hidden'
              }
              visible={r.role === 'external-effect'}
              userData={{
                sourceId: r.id,
                semantic: 'explicit reported effect; no inferred sign or magnitude',
              }}
            >
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.52, 0.06, 8, 24]} />
                <Clay color={colors.accent} />
              </mesh>
              <ClayBlock size={[0.7, 0.08, 0.08]} color={colors.accent} />
            </group>
          </>
        )}
      </group>
    </group>
  );
}
