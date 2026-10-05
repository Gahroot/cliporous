import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { UI_FONT, useStage } from '../../stage';
import { PlotBandSvg, precisionPlotLayout } from '../kits/plots';
import type { ExpansionKitColors } from '../scene-types';
import { compare, rationalPosition } from '../value-logic';
import {
  VARIATION_RANGE_FONT,
  type VariationRangePose,
  variationRangeDomain,
  variationRangeLines,
  variationRangeMagnitude,
  variationRangePages,
  variationRangeRecords,
} from './variation-range-poses';
import type { ExpansionProbabilityVariationRangeScene } from './variation-range-types';

export function VariationRangeText({
  text,
  x,
  y,
  width,
  height,
}: {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}): ReactElement {
  const S = useStage(),
    size = VARIATION_RANGE_FONT;
  const lines = variationRangeLines(text, width, size);
  if (lines.length * size * 1.1 > height)
    throw new RangeError('Essential source text needs another authored page');
  let offset = 0;
  const spans = lines.map((line) => {
    const first = offset === 0;
    offset += line.length;
    return (
      <tspan key={text.slice(0, offset)} x={x} dy={first ? 0 : size * 1.1}>
        {line}
      </tspan>
    );
  });
  return (
    <text
      x={x}
      y={y + size}
      fill={S.text}
      fontFamily={UI_FONT}
      fontSize={size}
      data-source-text={text}
      data-text-x={x}
      data-text-y={y}
      data-text-width={width}
      data-text-height={height}
      data-line-count={lines.length}
    >
      {spans}
    </text>
  );
}
export function VariationRangeDiagram({
  scene,
  pose,
}: {
  scene: ExpansionProbabilityVariationRangeScene;
  pose: VariationRangePose;
}): ReactElement {
  const S = useStage();
  const colors: ExpansionKitColors = {
    surface: S.card,
    text: S.text,
    accent: S.accent,
    muted: S.muted,
  };
  const records = variationRangeRecords(scene),
    domain = variationRangeDomain(scene),
    basis = records[0].quantity.basis;
  const basisText = `${basis.unit}; ${basis.population}; ${basis.period}${basis.denominator ? `; source denominator ${basis.denominator.numerator}/${basis.denominator.denominator}` : ''}`;
  const exact = (value: (typeof domain)[0]) => {
    for (const { quantity } of records) {
      const magnitude = variationRangeMagnitude(quantity);
      const equal = magnitude ? compare(magnitude, value) : undefined;
      if (equal?.ok && equal.value === 0 && 'amount' in quantity) return quantity.amount.notation;
    }
    return value.denominator === 1
      ? String(value.numerator)
      : `${value.numerator}/${value.denominator}`;
  };
  const layout = precisionPlotLayout({
    records,
    domain,
    basis,
    colors,
    state: 'retained',
    pose,
    position: [0, 0, 0],
  });
  const zero = rationalPosition({ numerator: 0, denominator: 1 }, ...domain);
  if (!zero.ok) throw new RangeError('Missing reference baseline');
  const lower = scene.storyId === '14' ? variationRangeMagnitude(scene.lower) : undefined;
  const upper = scene.storyId === '14' ? variationRangeMagnitude(scene.upper) : undefined;
  const band =
    scene.storyId === '14' && lower && upper
      ? PlotBandSvg({
          id: scene.actorId,
          lowerValue: lower,
          upperValue: upper,
          domain,
          meaning: scene.meaning.kind,
          colors,
          state: 'active',
          pose,
          position: [16, 212, 0],
          scale: 1.5,
        })
      : undefined;
  return (
    <g data-story-id={scene.storyId} data-role="source-values">
      <g opacity={pose.reveal}>
        <VariationRangeText text={basisText} x={16} y={0} width={920} height={100} />
        <VariationRangeText
          text={`Axis reference: ${exact(domain[0])} to ${exact(domain[1])}; not extra observations`}
          x={16}
          y={102}
          width={920}
          height={76}
        />
      </g>
      {scene.storyId === '13' ? (
        layout.map(({ record, positions }, index) => {
          const y = 184 + index * 12,
            baseline = 24 + zero.value * 880;
          const x = positions.length ? 24 + (1 - positions[0] / 160) * 880 : undefined;
          return (
            <g
              key={record.id}
              opacity={pose.records[index].reveal}
              data-record-id={record.id}
              data-entity-id={scene.samples[index].entityId}
              data-value-state={record.quantity.state}
            >
              <path d={`M24 ${y + 5}H904`} stroke={S.muted} />
              {x === undefined ? (
                <rect
                  x={24}
                  y={y}
                  width={8}
                  height={8}
                  fill="none"
                  stroke={S.text}
                  strokeDasharray="3 3"
                />
              ) : (
                <>
                  <rect
                    x={Math.min(x, baseline)}
                    y={y + 1}
                    width={Math.abs(x - baseline)}
                    height={8}
                    fill={S.card}
                    stroke={S.accent}
                  />
                  <circle cx={x} cy={y + 5} r={3} fill={S.accent} />
                </>
              )}
            </g>
          );
        })
      ) : (
        <g opacity={pose.response} data-actor-id={scene.actorId}>
          {/* Reuse validated kit paths/rect, replacing its generic rational text with complete 22px source-precision panels. Nothing is clipped. */}
          {band &&
            isValidElement<{ children?: ReactNode }>(band) &&
            cloneElement(
              band,
              {},
              Children.toArray(band.props.children).filter(
                (child) => isValidElement(child) && typeof child.type === 'string',
              ),
            )}
        </g>
      )}
      {variationRangePages(scene).map((page, index) => {
        const record = records[page.recordIndex];
        return (
          <g
            key={`${record.id}-${page.part}`}
            opacity={index === pose.detailIndex ? pose.records[page.recordIndex].reveal : 0}
            data-page-index={index}
            data-page-record-id={record.id}
            data-page-active={index === pose.detailIndex}
          >
            <VariationRangeText text={page.summary} x={16} y={276} width={920} height={76} />
            <VariationRangeText text={page.text} x={16} y={354} width={920} height={120} />
          </g>
        );
      })}
    </g>
  );
}
