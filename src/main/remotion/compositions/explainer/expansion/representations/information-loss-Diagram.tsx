import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  INFORMATION_LOSS_DETAIL,
  type InformationLossPose,
  informationLossAmount,
  informationLossRuns,
} from './information-loss-poses';
import type { ExpansionInformationLossScene } from './information-loss-types';

/** Complete paged source facts remain planar and identical in both visual modes. */
export function InformationLossDiagram({
  scene,
  pose,
}: {
  scene: ExpansionInformationLossScene;
  pose: InformationLossPose;
}): ReactElement {
  const S = useStage(),
    page = pose.pages[pose.page];
  const relation = scene.relations.find((r) => r.id === page.relationId);
  const quantity = scene.quantities.find((v) => v.id === page.id)?.quantity;
  const amounts = quantity
    ? 'amount' in quantity
      ? [quantity.amount]
      : quantity.state === 'disputed'
        ? quantity.alternatives
        : []
    : [];
  const amountLines = amounts.flatMap((amount) =>
    informationLossRuns(
      informationLossAmount(amount),
      `${page.id}:amount:${informationLossAmount(amount)}`,
    ),
  );
  const text = (value: string, x: number, y: number) => (
    <text x={x} y={y} fontFamily={UI_FONT} fontSize={22} fill={S.text}>
      {value}
    </text>
  );
  return (
    <g data-information-loss-page={pose.page} data-source-id={page.id}>
      {text('Supplied information', 24, 38)}
      {page.recordIds.map((id, column) => {
        const record = scene.records.find((r) => r.id === id);
        if (!record) return null;
        const x = 24 + column * 236;
        return (
          <g key={id} data-record-id={id} data-state={record.state}>
            <rect x={x} y={66} width={180} height={210} rx={12} fill={S.card} stroke={S.muted} />
            {text(record.stage === 'input' ? 'Input' : 'Output', x + 12, 98)}
            {informationLossRuns(record.label, `${id}:label`, 7).map((line, row) => (
              <g key={line.id}>{text(line.text, x + 12, 136 + row * 28)}</g>
            ))}
          </g>
        );
      })}
      {relation && (
        <g
          data-relation-id={relation.id}
          data-relation-type={relation.type}
          data-state={relation.state}
        >
          <path
            d="M204 250H260m-8 -6l8 6l-8 6"
            fill="none"
            stroke={S.accent}
            strokeDasharray={
              relation.state === 'known' && relation.type !== 'omitted' ? undefined : '4 4'
            }
          />
          {text(relation.type, 24, 320)}
          {text(relation.state, 24, 354)}
        </g>
      )}
      {quantity && (
        <g data-quantity-id={page.id} data-quantity-state={quantity.state}>
          {text(`Exact quantity: ${quantity.state}`, 24, 306)}
          {amountLines.map((line, row) => (
            <g key={line.id}>{text(line.text, 24, 338 + row * 28)}</g>
          ))}
        </g>
      )}
      <rect x={484} y={8} width={460} height={462} rx={12} fill={S.card} stroke={S.accent} />
      {page.lines.map((line, i) => (
        <g key={page.lineIds[i]} data-line-id={page.lineIds[i]}>
          {text(
            line,
            INFORMATION_LOSS_DETAIL.x,
            INFORMATION_LOSS_DETAIL.y + i * INFORMATION_LOSS_DETAIL.leading,
          )}
        </g>
      ))}
      {text(`Source lens ${pose.page + 1}/${pose.pages.length}`, 500, 454)}
    </g>
  );
}
