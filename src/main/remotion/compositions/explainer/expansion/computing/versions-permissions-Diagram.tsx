import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  type VersionsPermissionsPose,
  versionsPermissionsRuns,
} from './versions-permissions-poses';
import type { ExpansionVersionsPermissionsScene } from './versions-permissions-types';

/** Source records and access lanes stay planar in both modes. No state implies authority. */
export function VersionsPermissionsDiagram({
  scene,
  pose,
}: {
  scene: ExpansionVersionsPermissionsScene;
  pose: VersionsPermissionsPose;
}): ReactElement {
  const S = useStage(),
    page = pose.pages[pose.page],
    fact = page.fact;
  const name = (id: string) => scene.entities.find((e) => e.id === id)?.label ?? id;
  const text = (value: string, x: number, y: number, key?: string) => (
    <text key={key} x={x} y={y} fontFamily={UI_FONT} fontSize={22} fill={S.text}>
      {value}
    </text>
  );
  const record = (id: string, x: number, title: string) => (
    <g data-entity-id={id}>
      <rect x={x} y={66} width={180} height={210} rx={12} fill={S.card} stroke={S.muted} />
      {text(title, x + 12, 98)}
      {versionsPermissionsRuns(name(id), id, 7).map((line, i) => (
        <g key={line.id}>{text(line.text, x + 12, 136 + i * 28)}</g>
      ))}
    </g>
  );
  return (
    <g data-versions-permissions-page={pose.page} data-source-id={page.id}>
      {text(fact ? `Source ${fact.operation ?? fact.role}` : 'Source context', 24, 38)}
      {fact && (
        <g data-fact-id={fact.id} data-state={fact.status.state} data-role={fact.role}>
          {record(fact.replicaId ?? fact.actorId, 24, fact.replicaId ? 'Replica' : 'Actor')}
          {record(
            fact.otherReplicaId ?? fact.resourceId,
            260,
            fact.otherReplicaId ? 'Replica' : 'Resource',
          )}
          <path
            d={scene.storyId === '69' ? 'M204 250H260' : 'M204 250H260m-8 -6l8 6l-8 6'}
            fill="none"
            stroke={S.accent}
            strokeDasharray={fact.status.state === 'known' ? undefined : '4 4'}
          />
          {text(fact.result, 24, 320)}
          {text(fact.status.state, 24, 354)}
          {fact.version &&
            versionsPermissionsRuns(fact.version, `${fact.id}:version`, 18).map((line, i) =>
              text(line.text, 24, 390 + i * 28, line.id),
            )}
        </g>
      )}
      <rect x={484} y={8} width={460} height={462} rx={12} fill={S.card} stroke={S.accent} />
      {page.lines.map((line, i) => (
        <g key={page.lineIds[i]} data-line-id={page.lineIds[i]}>
          {text(line, 500, 66 + i * 28)}
        </g>
      ))}
      {text(`Source lens ${pose.page + 1}/${pose.pages.length}`, 500, 454)}
    </g>
  );
}
