import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import { INFORMATION_VARIABLE_POINTS, type InformationPose } from './information-poses';
import type { ExpansionReasoningInformationScene } from './information-types';

/** Conservative one-em columns, with hard wrapping for unbroken source tokens. Never ellipsizes. */
export function informationLines(text: string, width: number, size: number): string[] {
  const columns = Math.max(1, Math.floor(width / size));
  return text.split('\n').flatMap((paragraph) => {
    const characters = Array.from(paragraph);
    if (!characters.length) return [''];
    return Array.from({ length: Math.ceil(characters.length / columns) }, (_, i) =>
      characters.slice(i * columns, (i + 1) * columns).join(''),
    );
  });
}

function PanelText({
  text,
  x,
  y,
  width,
  height,
  size = 20,
}: {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  size?: number;
}): ReactElement {
  const S = useStage();
  const lines = informationLines(text, width, size);
  return (
    <text
      x={x}
      y={y + size}
      fill={S.text}
      fontFamily={UI_FONT}
      fontSize={size}
      data-source-text={text}
      data-text-width={width}
      data-text-height={height}
      data-line-count={lines.length}
    >
      {lines.map((line, i) => (
        <tspan key={`${i}-${line}`} x={x} dy={i === 0 ? 0 : size * 1.1}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function InformationDiagram({
  scene,
  pose,
}: {
  scene: ExpansionReasoningInformationScene;
  pose: InformationPose;
}): ReactElement {
  const S = useStage();
  const entity = (id: string) => scene.entities.find((entry) => entry.id === id)?.label ?? id;
  if (scene.storyId === '05') {
    const ids = [scene.association.fromId, scene.association.toId, scene.factor.entityId];
    const point = (id: string) => INFORMATION_VARIABLE_POINTS[ids.indexOf(id)];
    const from = point(scene.association.fromId),
      to = point(scene.association.toId),
      factor = point(scene.factor.entityId);
    return (
      <g>
        <PanelText text={`Scope: ${scene.scope}`} x={16} y={0} width={920} height={44} />
        <g
          opacity={pose.action}
          data-role="association"
          data-from-id={scene.association.fromId}
          data-to-id={scene.association.toId}
        >
          <path
            d={`M${from.x + 170} ${from.y}H${to.x - 170}`}
            fill="none"
            stroke={S.accent}
            strokeWidth={3}
          />
          <PanelText text="Association" x={360} y={80} width={232} height={30} />
        </g>
        <g opacity={pose.response} data-role="factor" data-factor-id={scene.factor.entityId}>
          {scene.factor.affectsIds.map((id) => {
            const endpoint = point(id);
            return (
              <path
                key={id}
                data-from-id={scene.factor.entityId}
                data-to-id={id}
                d={`M${factor.x} ${factor.y - 48}L${endpoint.x} ${endpoint.y + 48}`}
                fill="none"
                stroke={S.muted}
                strokeWidth={3}
                strokeDasharray={scene.factor.certainty === 'possible' ? '7 5' : undefined}
              />
            );
          })}
          <PanelText
            text={`${scene.factor.certainty === 'possible' ? `${scene.factor.qualification} ` : ''}affects both endpoints${scene.factor.condition ? ` · ${scene.factor.condition}` : ''}`}
            x={20}
            y={322}
            width={912}
            height={80}
          />
        </g>
        {ids.map((id, i) => {
          const p = INFORMATION_VARIABLE_POINTS[i];
          return (
            <g
              key={id}
              data-entity-id={id}
              opacity={pose.entities.find((entry) => entry.id === id)?.reveal}
            >
              <rect
                x={p.x - 170}
                y={p.y - 48}
                width={340}
                height={96}
                rx={8}
                fill={S.card}
                stroke={S.muted}
              />
              <PanelText text={entity(id)} x={p.x - 160} y={p.y - 44} width={320} height={66} />
              <PanelText text={id} x={p.x - 168} y={p.y + 24} width={336} height={22} size={16} />
            </g>
          );
        })}
        <g opacity={pose.check} data-causal-status={scene.causalStatus.status}>
          <PanelText
            text={`Causal effect: ${entity(scene.causalStatus.fromId)} → ${entity(scene.causalStatus.toId)} · ${scene.causalStatus.qualification}`}
            x={20}
            y={405}
            width={912}
            height={72}
          />
        </g>
      </g>
    );
  }
  return (
    <g>
      <PanelText text={`Scope: ${scene.scope}`} x={8} y={0} width={936} height={44} />
      {/* Persistent IDs and actual states, never inferred outcomes. Detail pages retain all strings in the tree. */}
      {scene.records.map((record, i) => (
        <g
          key={record.id}
          opacity={pose.records[i].reveal}
          data-context-id={record.id}
          data-owner-id={record.ownerId}
          data-state={record.state}
        >
          <PanelText text={record.id} x={8} y={44 + i * 36} width={370} height={18} size={16} />
          <PanelText text={record.state} x={8} y={62 + i * 36} width={370} height={18} size={16} />
        </g>
      ))}
      {scene.records.map((record, i) => {
        const known = record.state === 'known';
        return (
          <g
            key={record.id}
            data-record-id={record.id}
            data-detail-active={pose.detailIndex === i}
            data-owner-id={record.ownerId}
            data-state={record.state}
            opacity={pose.detailIndex === i ? pose.records[i].reveal : 0}
          >
            {known ? (
              <path d="M390 44H916L944 72V352H390Z" fill={S.card} stroke={S.muted} />
            ) : (
              <rect
                x={390}
                y={44}
                width={554}
                height={308}
                fill="none"
                stroke={S.muted}
                strokeDasharray="6 5"
              />
            )}
            <PanelText
              text={`${record.id}\n${record.ownerId}`}
              x={400}
              y={48}
              width={534}
              height={36}
              size={16}
            />
            <PanelText
              text={`${entity(record.ownerId)}\n${record.topic}\n${record.state === 'known' ? record.content : record.qualification}`}
              x={400}
              y={92}
              width={534}
              height={252}
            />
          </g>
        );
      })}
      <g opacity={pose.check} data-focus-id={scene.focusRecordId}>
        <PanelText
          text={`${scene.focusRecordId}: ${scene.nonFalse.qualification}`}
          x={390}
          y={360}
          width={554}
          height={62}
          size={18}
        />
      </g>
      <g opacity={pose.resolve} data-resolution="unresolved">
        <PanelText
          text={`${scene.resolution.recordId}: unresolved`}
          x={390}
          y={428}
          width={554}
          height={50}
          size={18}
        />
      </g>
    </g>
  );
}
