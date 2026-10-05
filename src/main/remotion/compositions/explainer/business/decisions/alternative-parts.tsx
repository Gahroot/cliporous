import type React from 'react';
import type { PossibleFuturesScene } from '../../concepts/perspective/types';
import { useStage } from '../../stage';
import { BranchPod } from '../assets/retail';

import type { BusinessAlternativePose } from './alternative-poses';
import {
  businessAlternativeNativeLabels,
  businessAlternativeSemanticIds,
  BUSINESS_ALTERNATIVE_READING as R,
} from './alternative-presentation';
import type { BusinessAlternativesLens } from './alternative-types';

export interface BusinessAlternativePartsProps {
  scene: PossibleFuturesScene;
  lens: BusinessAlternativesLens;
  pose: BusinessAlternativePose;
}

/** Natural complete SVG pages: no ellipsis, adaptive fonts, area-coded capacity or random reveal. */
export function BusinessAlternativeDiagramParts({
  scene,
  lens,
  pose,
}: BusinessAlternativePartsProps): React.ReactElement {
  const S = useStage();
  return (
    <g
      data-business-recipe="OP-75"
      data-treatment="M-08"
      data-page-id={pose.page.id}
      data-semantic-ids={businessAlternativeSemanticIds(scene, lens).join(' ')}
      fontFamily={S.font}
    >
      <rect width={R.width} height={R.height} rx={18} fill={S.card} />
      <text
        x={R.padding}
        y={R.padding + R.titleFont}
        fill={S.text}
        fontSize={R.titleFont}
        fontWeight={700}
      >
        {pose.page.titleLines.map((line, slot) => (
          <tspan
            key={`page:${pose.page.id}:${line}`}
            x={R.padding}
            y={R.padding + R.titleFont + slot * R.titleLineHeight}
          >
            {line}
          </tspan>
        ))}
      </text>
      {pose.page.cards.map((card) => {
        const context = card.fact.kind === 'context' || card.fact.kind === 'uncertainty';
        const x = card.x + (context ? 0 : R.padding);
        const y = card.y + (context ? 0 : R.padding);
        return (
          <g
            key={card.fact.id}
            data-fact-id={card.fact.id}
            data-fact-kind={card.fact.kind}
            data-entity-ids={card.fact.entityIds.join(' ')}
            data-source-from={card.fact.source?.fromWord}
            data-source-to={card.fact.source?.toWord}
          >
            {!context && (
              <rect
                x={card.x}
                y={card.y}
                width={card.width}
                height={card.height}
                rx={10}
                fill={S.cardRaised}
                stroke={S.muted}
                strokeOpacity={0.2}
              />
            )}
            <text x={x} y={y + R.bodyFont} fontSize={R.bodyFont} fill={S.text}>
              {card.lines.map((line, slot) => (
                <tspan
                  key={line.id}
                  data-line-id={line.id}
                  x={x}
                  y={y + R.bodyFont + slot * R.lineHeight}
                >
                  {line.text}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** A-03 is a literal illustrative record, not an actual branch or manufactured result. No stage. */
export function BusinessAlternativeModelParts({
  scene,
  lens,
  pose,
}: BusinessAlternativePartsProps): React.ReactElement | null {
  if (lens.visualMode !== 'hybrid' || lens.native?.assembly !== 'A-03') return null;
  return (
    <group
      name="business-alternatives:records"
      userData={{
        semanticIds: businessAlternativeSemanticIds(scene, lens),
        sourceFacts: pose.facts,
        modelSource: { ...lens.native.source },
        meaning: 'Illustrative operating-unit records; not actual branches or achieved output',
      }}
    >
      {pose.records.map((record) => (
        <group
          key={record.id}
          name={`business-alternatives:A-03:${record.id}`}
          position={record.position}
          scale={record.scale}
          userData={{
            recordId: record.id,
            alternativeId: record.alternativeId,
            subjectId: record.subjectId,
            baselineId: record.baselineId,
            role: 'illustrative-operating-unit-record',
          }}
        >
          <BranchPod open={pose.open} />
        </group>
      ))}
    </group>
  );
}

/** Visible native qualifier rail is outside WebGL; all records use the same area and time. */
export function BusinessAlternativeNativeLabelParts({
  scene,
  lens,
  pose,
}: BusinessAlternativePartsProps): React.ReactElement {
  const S = useStage();
  const { header, records } = businessAlternativeNativeLabels(scene, lens);
  return (
    <g fontFamily={S.font} data-native-record-caption="OP-75" fill={S.text}>
      <text x={R.padding} y={R.padding + R.bodyFont} fontSize={R.bodyFont}>
        {header.map((line, slot) => (
          <tspan
            key={`native:context:${line}`}
            x={R.padding}
            y={R.padding + R.bodyFont + slot * R.lineHeight}
          >
            {line}
          </tspan>
        ))}
      </text>
      {records.map((record, slot) => {
        const { x, y, lines } = record;
        return (
          <g
            key={record.id}
            data-native-record-id={record.id}
            data-alternative-id={record.alternativeId}
            opacity={pose.records[slot].opacity}
          >
            <text x={x + R.padding} y={y + R.bodyFont} fontSize={R.bodyFont}>
              {lines.map((line, index) => (
                <tspan
                  key={`native:${record.id}:line:${line}`}
                  x={x + R.padding}
                  y={y + R.bodyFont + index * R.lineHeight}
                >
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </g>
  );
}
