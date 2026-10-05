import type React from 'react';
import { useStage } from '../../stage';
import { PermissionCard } from '../assets/authority';
import { ProviderConnectorPanel } from '../assets/infrastructure';
import { BranchPod, OperatingDesk } from '../assets/retail';
import type { BusinessIdentity } from '../types';
import type { OrganizationPose } from './poses';
import {
  type OrganizationRow,
  organizationRowLines,
  ORGANIZATION_TABLE as TABLE,
} from './presentation';
import type { OrganizationScene } from './types';

export interface OrganizationPartsProps {
  scene: OrganizationScene;
  pose: OrganizationPose;
}
/** Literal validated identities, not display-label-derived or randomly generated keys. */
export function organizationSemanticIds(scene: OrganizationScene): readonly string[] {
  let identities: readonly BusinessIdentity[];
  switch (scene.preset) {
    case 'federated-units':
      identities = [...scene.units, ...scene.tasks];
      break;
    case 'decision-rights':
      identities = [
        ...scene.units.map((unit) => unit.identity),
        ...scene.rights.map((right) => right.decision),
      ];
      break;
    case 'rollout-rings':
      identities = [scene.rollout.identity, ...scene.rings.map((ring) => ring.unit)];
      break;
    case 'legacy-boundaries':
      identities = [scene.legacy, scene.replacement, scene.interface];
      break;
    case 'stated-chargeback':
      identities = [scene.payer, scene.service, ...scene.units];
      break;
    case 'declared-tool-boundaries':
      identities = [
        ...scene.units,
        ...scene.workers.map((worker) => worker.identity),
        ...scene.tools.map((tool) => tool.identity),
      ];
      break;
    case 'merge-identities':
      identities = [
        scene.owner,
        ...scene.systems.map((system) => system.identity),
        ...scene.records.map((record) => record.identity),
      ];
      break;
  }
  return [scene.organization.id, ...identities.map((identity) => identity.id)];
}
function emphasis(row: OrganizationRow, pose: OrganizationPose): number {
  switch (pose.preset) {
    case 'federated-units':
      return pose.lens.lens;
    case 'decision-rights':
      return pose.rights.find((right) => row.id.endsWith(`:${right.id}`))?.handshake.accepted ?? 0;
    case 'rollout-rings':
      return pose.snapshots.find((snapshot) => row.id === `ring:${snapshot.id}`)?.focused ? 1 : 0;
    case 'legacy-boundaries':
      return row.id === 'boundary' ? (pose.focus.find((focus) => focus.focus > 0)?.focus ?? 0) : 0;
    case 'declared-tool-boundaries':
      return pose.focus.find((focus) => row.id === `tool:${focus.id}`)?.focus ?? 0;
    case 'merge-identities':
      return pose.provenance.find((source) => row.id === `record:${source.id}`)?.linkProgress ?? 0;
    case 'stated-chargeback':
      return (
        pose.conserved.parts.find(
          (part) => row.id === `allocation:${part.id}` || row.id === part.id,
        )?.visualWeight ?? 0
      );
  }
}
/** Complete fixed-font fact pages; animation touches only the inspection marks, never the words. */
export function OrganizationDiagramParts({
  scene,
  pose,
}: OrganizationPartsProps): React.ReactElement {
  const S = useStage();
  const page = pose.presentation.pages[pose.pageIndex];
  let top = TABLE.rowTop;
  return (
    <g
      fontFamily={S.font}
      fontSize={TABLE.font}
      fill={S.text}
      opacity={pose.opacity}
      data-organization-id={scene.organization.id}
      data-semantic-ids={organizationSemanticIds(scene).join(' ')}
      data-page={pose.pageIndex}
    >
      <text x={24} y={24} fontWeight={650}>
        {pose.presentation.title}
      </text>
      {pose.presentation.columns.map((column, index) => (
        <text key={column} x={TABLE.x[index]} y={57} fontSize={20} fill={S.muted}>
          {column}
        </text>
      ))}
      {page.rows.map((row, index) => {
        const y = top,
          height = page.heights[index];
        top += height;
        const progress = emphasis(row, pose);
        const record =
          scene.preset === 'merge-identities'
            ? scene.records.find((item) => row.id === `record:${item.identity.id}`)
            : undefined;
        return (
          <g
            key={row.id}
            data-fact-id={row.id}
            data-state={row.state}
            data-source-id={record?.sourceId}
          >
            <rect
              x={12}
              y={y}
              width={TABLE.width - 24}
              height={height - 4}
              rx={10}
              fill={S.cardRaised}
              stroke={S.muted}
              strokeOpacity={0.25}
            />
            <rect
              x={12}
              y={y + 8}
              width={3}
              height={height - 20}
              fill={S.accent}
              opacity={0.15 + 0.6 * progress}
            />
            {organizationRowLines(row).map((lines, column) => (
              <text key={TABLE.x[column]} x={TABLE.x[column]} y={y + 26}>
                {lines.map((line, lineIndex) => (
                  <tspan
                    key={lines.slice(0, lineIndex + 1).join('\n')}
                    x={TABLE.x[column]}
                    dy={lineIndex === 0 ? 0 : TABLE.lineHeight}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
            ))}
            <rect
              x={TABLE.x[1]}
              y={y + height - 8}
              width={380 * progress}
              height={2}
              fill={S.accent}
              opacity={0.35}
            />
          </g>
        );
      })}
      <text
        x={TABLE.width - 24}
        y={TABLE.height - 12}
        textAnchor="end"
        fontSize={20}
        fill={S.muted}
      >{`Page ${pose.pageIndex + 1} / ${pose.presentation.pages.length}`}</text>
    </g>
  );
}
function pods(units: readonly BusinessIdentity[], pose: OrganizationPose): React.ReactElement {
  return (
    <group>
      {units.map((unit, index) => {
        const lens =
          pose.preset === 'federated-units'
            ? pose.lens.units.find((entry) => entry.id === unit.id)
            : undefined;
        const snapshot =
          pose.preset === 'rollout-rings'
            ? pose.snapshots.find((entry) => entry.id === unit.id)
            : undefined;
        const x = lens
          ? lens.x * 0.85
          : (index - (units.length - 1) / 2) * Math.min(1.35, 4.2 / Math.max(1, units.length - 1));
        return (
          <group
            key={unit.id}
            name={`unit:${unit.id}`}
            userData={{ unitId: unit.id, date: snapshot?.date, state: snapshot?.state }}
            position={[x, -0.15, -0.45]}
            scale={0.48}
            visible={snapshot?.visible ?? true}
          >
            <BranchPod open={pose.inspection} />
          </group>
        );
      })}
    </group>
  );
}
/** Real source-role-bound authored assemblies, reusable without a stage or a render callback. */
function OrganizationModels({ scene, pose }: OrganizationPartsProps): React.ReactElement | null {
  if (scene.preset === 'declared-tool-boundaries' || scene.visualMode === 'diagram') return null;
  if (scene.preset !== pose.preset)
    throw new Error('Organization pose must retain its source recipe');
  if (scene.preset === 'federated-units') return pods(scene.units, pose);
  if (scene.preset === 'rollout-rings')
    return pods(
      scene.rings.map((ring) => ring.unit),
      pose,
    );
  if (scene.preset === 'stated-chargeback') return pods(scene.units, pose);
  if (scene.preset === 'decision-rights' && pose.preset === 'decision-rights')
    return (
      <group>
        {pods(
          scene.units.map((unit) => unit.identity),
          pose,
        )}
        {pose.rights.map((right, index) => (
          <group
            key={right.id}
            name={`right:${right.id}`}
            userData={{ decisionId: right.id, unitId: right.unitId, permission: right.permission }}
            position={[
              (index - (pose.rights.length - 1) / 2) * 0.95,
              0.4,
              0.65 + 0.2 * right.handshake.approach,
            ]}
            scale={0.5}
          >
            <PermissionCard state={right.cardState} focus={right.handshake.accepted} />
          </group>
        ))}
      </group>
    );
  if (scene.preset === 'legacy-boundaries' && pose.preset === 'legacy-boundaries')
    return (
      <group
        name={`legacy-interface:${scene.interface.id}`}
        userData={{
          legacySystemId: scene.legacy.id,
          replacementSystemId: scene.replacement.id,
          interfaceId: scene.interface.id,
          boundaryState: scene.boundary.state,
        }}
        scale={0.75}
      >
        <ProviderConnectorPanel
          connected={false}
          progress={pose.focus.find((focus) => focus.id === scene.interface.id)?.focus ?? 0}
        />
      </group>
    );
  if (scene.preset === 'merge-identities' && pose.preset === 'merge-identities')
    return (
      <group
        name={`responsible-owner:${scene.owner.id}`}
        userData={{
          responsibleOwnerId: scene.owner.id,
          sourceIds: scene.records.map((record) => record.sourceId),
          recordIds: scene.records.map((record) => record.identity.id),
        }}
        scale={0.85}
        rotation={[0, 0.08 * (pose.provenance[0]?.linkProgress ?? 0), 0]}
      >
        <OperatingDesk pending />
      </group>
    );
  return null;
}

export function OrganizationModelParts(props: OrganizationPartsProps): React.ReactElement | null {
  if (props.scene.visualMode === 'diagram') return null;
  return (
    <group
      name={`organization:${props.scene.organization.id}`}
      userData={{
        semanticIds: organizationSemanticIds(props.scene),
        sourceFacts: props.pose.presentation.rows,
        literalSourceIds:
          props.scene.preset === 'merge-identities'
            ? props.scene.records.map((record) => record.sourceId)
            : [],
      }}
    >
      <OrganizationModels {...props} />
    </group>
  );
}
