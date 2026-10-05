import type { ReactElement } from 'react';
import { DiagramText } from '../../diagrams/primitives';
import { useStage } from '../../stage';
import { ClaimPlaqueSvg, EvidenceDocumentSvg } from '../kits/evidence';
import type { ExpansionKitColors } from '../scene-types';
import { TRACE_DETAIL, tracePose } from './trace-poses';
import type { ReasoningTraceScene } from './trace-types';

/** Fixed-size detail lenses, never a compact ledger. Every record/relation stays mounted under its stable ID. */
export function TraceDiagram({
  scene,
  t,
}: {
  scene: ReasoningTraceScene;
  t: number;
}): ReactElement {
  const S = useStage();
  const colors: ExpansionKitColors = {
    surface: S.card,
    text: S.text,
    accent: S.accent,
    muted: S.muted,
  };
  const pose = tracePose(scene, t);
  const label = (id: string): string => {
    const entity = scene.entities.find((entry) => entry.id === id);
    if (!entity) throw new Error('Validated trace lost an entity identity');
    return entity.label;
  };
  return (
    <g data-trace-story={scene.storyId}>
      {pose.entities.map((entity) => {
        const record = scene.records.find((entry) => entry.entityId === entity.id);
        const props = {
          id: entity.id,
          pose: entity.pose,
          state: entity.state,
          colors,
          placement: { position: [entity.x, entity.y, 0] as const, scale: 0.17 },
        };
        return (
          <g
            key={entity.id}
            data-entity-id={entity.id}
            data-source-id={record && record.role !== 'claim' ? record.sourceId : undefined}
            opacity={pose.setup}
          >
            {/* Hybrid's actual clay icon occupies this same projected anchor; labels never crossfade away. */}
            {scene.visualMode === 'diagram' &&
              (entity.kind === 'document' || entity.kind === 'excerpt' ? (
                <EvidenceDocumentSvg {...props} label="" source="" />
              ) : (
                <ClaimPlaqueSvg {...props} claim="" />
              ))}
            <DiagramText x={entity.x} y={entity.y + 30} size={22} columns={9} strong>
              {label(entity.id)}
            </DiagramText>
          </g>
        );
      })}
      <rect {...TRACE_DETAIL} rx={12} fill={S.card} stroke={S.cardBorder} />
      {pose.pages.map((page, index) => {
        const active = pose.page === index;
        const record = page.kind === 'record' ? scene.records[page.index] : undefined;
        const relation = page.kind === 'relation' ? scene.relations[page.index] : undefined;
        return (
          <g
            key={page.id}
            data-page-id={page.id}
            data-page-index={index}
            data-active={active ? 'true' : 'false'}
            opacity={active ? pose.setup : 0}
          >
            {record && (
              <g
                data-record-id={record.entityId}
                data-source-id={record.role !== 'claim' ? record.sourceId : undefined}
              >
                <DiagramText
                  x={476}
                  y={312}
                  size={24}
                  columns={38}
                  strong
                >{`${record.role}: ${label(record.entityId)}`}</DiagramText>
                <DiagramText x={476} y={368} size={24} columns={34}>
                  {record.content}
                </DiagramText>
                {record.role !== 'claim' && (
                  <DiagramText
                    x={476}
                    y={459}
                    size={22}
                    columns={38}
                  >{`Source: ${label(record.sourceId)}`}</DiagramText>
                )}
              </g>
            )}
            {relation && (
              <g
                data-from-id={relation.fromId}
                data-to-id={relation.toId}
                data-role={relation.role}
              >
                <DiagramText x={238} y={310} size={22} columns={18} strong>
                  {label(relation.fromId)}
                </DiagramText>
                <DiagramText x={714} y={310} size={22} columns={18} strong>
                  {label(relation.toId)}
                </DiagramText>
                <path
                  d="M440 318L512 318M500 308L512 318L500 328"
                  stroke={S.accent}
                  strokeWidth={3}
                  fill="none"
                  strokeDasharray={relation.role === 'provenance' ? '5 5' : undefined}
                />
                <DiagramText x={476} y={354} size={24} columns={38} strong>
                  {relation.role}
                </DiagramText>
                {relation.condition && (
                  <DiagramText x={476} y={392} size={22} columns={38}>
                    {relation.condition}
                  </DiagramText>
                )}
              </g>
            )}
            {page.kind === 'resolve' && (
              <>
                <DiagramText x={476} y={336} size={26} columns={30} strong>
                  {scene.storyId === '01'
                    ? 'Citation: provenance, not proof'
                    : `${scene.state}: no adjudication`}
                </DiagramText>
                <DiagramText x={476} y={416} size={24} columns={34}>
                  {scene.storyId === '01'
                    ? 'Documents → excerpt → claim'
                    : 'Opposed statements retain their sources'}
                </DiagramText>
              </>
            )}
            {page.kind !== 'resolve' && (
              <DiagramText x={912} y={470} size={22} columns={3}>
                {String(index + 1)}
              </DiagramText>
            )}
          </g>
        );
      })}
    </g>
  );
}
