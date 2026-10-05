import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { UI_FONT } from '../../stage';
import { EvidenceDocumentSvg } from '../kits/evidence';
import { precisionPlotLayout } from '../kits/plots';
import { populationGridPosition, SamplingApertureSvg } from '../kits/population';
import type { ExpansionKitColors, ExpansionKitPose } from '../scene-types';
import {
  BASE_UPDATE_LEDGER,
  baseUpdateFocus,
  baseUpdatePageIndex,
  baseUpdatePages,
  PROBABILITY_SOURCE_FONT,
} from './base-update-poses';
import type { ProbabilityBaseUpdateScene } from './base-update-types';

export interface BaseUpdateViewProps {
  scene: ProbabilityBaseUpdateScene;
  pose: ExpansionKitPose;
  colors: ExpansionKitColors;
  t: number;
}
function Line({
  text,
  x,
  y,
  colors,
}: {
  text: string;
  x: number;
  y: number;
  colors: ExpansionKitColors;
}): ReactElement {
  return (
    <text x={x} y={y} fontFamily={UI_FONT} fontSize={PROBABILITY_SOURCE_FONT} fill={colors.text}>
      {text}
    </text>
  );
}
/** One source detail page, with retained identity/context and no compressed or hidden ledger. */
export function BaseUpdateFacts({ scene, pose, colors, t }: BaseUpdateViewProps): ReactElement {
  const page = baseUpdateFocus(t, scene);
  const pageIndex = baseUpdatePageIndex(t, scene);
  return (
    <g
      data-story-id={scene.storyId}
      data-probability-ledger=""
      data-record-id={page.recordId}
      data-actor-id={page.actorId}
      data-population-id={page.populationId}
      data-page={pageIndex}
      opacity={pose.reveal}
    >
      <rect {...BASE_UPDATE_LEDGER} fill={colors.surface} stroke={colors.muted} />
      {page.context.map((text, i) => (
        <Line key={i} text={text} x={276} y={40 + i * 28} colors={colors} />
      ))}
      <g data-source-detail="">
        {page.lines.map((text, i) => (
          <Line key={i} text={text} x={276} y={108 + i * 28} colors={colors} />
        ))}
      </g>
      <Line
        text={`Page ${pageIndex + 1} / ${baseUpdatePages(scene).length}`}
        x={276}
        y={438}
        colors={colors}
      />
      {['Aggregate', '100 schematic', 'marks, not', 'individual', 'memberships'].map((text, i) => (
        <Line key={text} text={text} x={8} y={322 + i * 28} colors={colors} />
      ))}
    </g>
  );
}
/** Kit document typography is replaced by the readable source focus panel, not miniature facts. */
function documentGeometry(node: ReactNode): ReactNode {
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  // Only this hook-free local evidence kit is traversed; no Canvas or component context is fabricated.
  const props = node.props;
  if (typeof node.type === 'function')
    return documentGeometry((node.type as (value: typeof props) => ReactNode)(props));
  if (node.type === 'text') return null;
  return cloneElement(node, {}, Children.map(node.props.children, documentGeometry));
}
export function BaseUpdateDiagram({ scene, pose, colors }: BaseUpdateViewProps): ReactElement {
  const rates = scene.records.filter((r) => r.quantity.basis.unit !== 'count');
  return (
    <g data-probability-visual="">
      <g opacity={pose.reveal} data-aggregation={scene.display.aggregation}>
        <rect
          x={12}
          y={16}
          width={232}
          height={232}
          rx={12}
          fill={colors.surface}
          stroke={colors.text}
        />
        {Array.from({ length: 100 }, (_, i) => (
          <circle
            key={`schematic-${populationGridPosition(i).join(':')}`}
            cx={24 + (i % 10) * 23}
            cy={28 + Math.floor(i / 10) * 23}
            r={4}
            fill={colors.muted}
          />
        ))}
      </g>
      {scene.storyId === '09' ? (
        <SamplingApertureSvg
          pose={pose}
          colors={colors}
          state="active"
          placement={{ position: [128, 132, 0], scale: 0.44 }}
          window="all"
          membership={scene.selectionId}
        />
      ) : (
        documentGeometry(
          EvidenceDocumentSvg({
            id: scene.evidenceId,
            label: 'Evidence',
            source: 'Source-qualified',
            pose: { ...pose, reveal: pose.action },
            colors,
            state: 'retained',
            placement: { position: [206, 220, 0], scale: 0.45 },
          }),
        )
      )}
      {/* Precision-kit projection only; exact notation, basis and qualifiers appear at 22px on source pages. */}
      {rates.map((r, i) => {
        const [row] = precisionPlotLayout({
          position: [0, 0, 0],
          pose,
          colors,
          state: 'retained',
          records: [{ id: r.id, label: r.quantity.actor, quantity: r.quantity }],
          basis: r.quantity.basis,
          domain: [
            { numerator: 0, denominator: 1 },
            { numerator: r.quantity.basis.unit === 'percent' ? 100 : 1, denominator: 1 },
          ],
        });
        return (
          <g
            key={r.id}
            data-record-id={r.id}
            data-value-state={r.quantity.state}
            opacity={pose.reveal}
          >
            <path d={`M8 ${260 + i * 12}h232`} stroke={colors.muted} />
            {row.positions.length ? (
              row.positions.map((y, j) => (
                <rect
                  key={j}
                  x={8}
                  y={256 + i * 12 + j * 3}
                  width={((160 - y) / 160) * 232 * pose.action}
                  height={3}
                  fill={colors.accent}
                />
              ))
            ) : (
              <path
                d={`M8 ${256 + i * 12}h12v6H8Z`}
                fill="none"
                stroke={colors.text}
                strokeDasharray="3 2"
              />
            )}
          </g>
        );
      })}
    </g>
  );
}
