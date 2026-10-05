import type { ReactElement } from 'react';
import { ClayBlock } from '../../explanation-kit';
import { compare, compatibleBasis, rational, rationalPosition } from '../value-logic';
import type {
  ExpansionAmount,
  ExpansionBasis,
  ExpansionDerivedValue,
  ExpansionQuantity,
  ExpansionRational,
} from '../value-types';
import {
  boundedKitItems,
  type KitAssetProps,
  KitText,
  kitColor,
  kitOpacity,
  kitPoint,
  kitScale,
  kitTransform,
  kitUnit,
} from './computing';

export interface PlotDatum {
  readonly id: string;
  readonly label: string;
  readonly quantity: ExpansionQuantity | ExpansionDerivedValue;
}
export interface PrecisionPlotProps extends KitAssetProps {
  readonly records: readonly PlotDatum[];
  readonly domain: readonly [ExpansionRational, ExpansionRational];
  readonly basis: ExpansionBasis;
}
export interface PlotBandProps extends KitAssetProps {
  readonly id: string;
  readonly lowerValue: ExpansionRational;
  readonly upperValue: ExpansionRational;
  readonly domain: readonly [ExpansionRational, ExpansionRational];
  readonly meaning: string;
}
export interface PartitionPart {
  readonly id: string;
  readonly label: string;
  /** A supplied or explicitly validated derived share, not an inferred remainder. */
  readonly share: ExpansionRational;
  readonly provenance: 'source' | 'derived';
}
export interface PartitionProps extends KitAssetProps {
  readonly parts: readonly PartitionPart[];
  readonly remainder: 'known-complete' | 'unknown' | 'missing';
  readonly basisLabel: string;
}
export interface RankedTrackProps extends KitAssetProps {
  readonly id: string;
  readonly label: string;
  readonly rank: number | 'unknown';
  readonly periodLabel: string;
}
function label(text: string, cap = 28): void {
  if (!text.trim() || text.length > cap)
    throw new RangeError('Plot labels need bounded source text');
}
function checkedValue(value: ExpansionRational): ExpansionRational {
  const result = rational(value.numerator, value.denominator);
  if (!result.ok || value.denominator <= 0) throw new RangeError('Invalid bounded plotted value');
  return result.value;
}
function amountValue(amount: ExpansionAmount): ExpansionRational {
  return amount.kind === 'rational'
    ? checkedValue(amount.value)
    : checkedValue({ numerator: amount.value.minorUnits, denominator: 100 });
}
function quantityValues(quantity: PlotDatum['quantity']): readonly ExpansionRational[] {
  if (quantity.state === 'derived') return [checkedValue(quantity.result)];
  if (quantity.state === 'missing' || quantity.state === 'unknown') return [];
  if (quantity.state === 'disputed') return quantity.alternatives.map(amountValue);
  return 'amount' in quantity ? [amountValue(quantity.amount)] : [];
}
function exact(value: ExpansionRational): string {
  return value.denominator === 1
    ? String(value.numerator)
    : `${value.numerator}/${value.denominator}`;
}
export function plottedValueText(quantity: PlotDatum['quantity']): string {
  if (quantity.state === 'derived') return `derived: ${exact(checkedValue(quantity.result))}`;
  if (quantity.state === 'missing' || quantity.state === 'unknown') return quantity.state;
  if (quantity.state === 'disputed')
    return `${quantity.alternatives.map((amount) => amount.notation ?? exact(amountValue(amount))).join(' / ')}; disputed`;
  if ('amount' in quantity) {
    const amount = quantity.amount;
    return `${amount.notation ?? exact(amountValue(amount))}${quantity.state === 'known' ? '' : `; ${quantity.state}`}`;
  }
  return quantity.state;
}
function quantityQualifier(quantity: PlotDatum['quantity']): string {
  if (quantity.state === 'conditional') return quantity.condition;
  if (quantity.state === 'known' || quantity.state === 'derived') return '';
  return quantity.qualifier;
}
/** Every bin uses the SAME fixed domain; missing values never get a zero-height value. */
export function precisionPlotLayout(props: PrecisionPlotProps): readonly {
  readonly record: PlotDatum;
  readonly x: number;
  readonly positions: readonly number[];
}[] {
  boundedKitItems(props.records, 12);
  label(props.basis.period, 32);
  label(props.basis.population, 40);
  const zero = rationalPosition({ numerator: 0, denominator: 1 }, props.domain[0], props.domain[1]);
  if (!zero.ok) throw new RangeError('Magnitude plots require an explicit signed zero baseline');
  return props.records.map((record, index) => {
    label(record.label);
    const basis = record.quantity.basis;
    if (!compatibleBasis(basis, props.basis))
      throw new RangeError('Plot comparison requires the same source unit, population and period');
    const positions = quantityValues(record.quantity).map((value) => {
      const projected = rationalPosition(value, props.domain[0], props.domain[1]);
      if (!projected.ok)
        throw new RangeError('Supplied plotted value is outside the complete fixed domain');
      return 160 * (1 - projected.value);
    });
    return { record, x: 28 + index * (240 / Math.max(1, props.records.length)), positions };
  });
}
export function PrecisionPlotSvg(props: PrecisionPlotProps): ReactElement {
  const rows = precisionPlotLayout(props);
  const zero = rationalPosition({ numerator: 0, denominator: 1 }, props.domain[0], props.domain[1]);
  if (!zero.ok) throw new RangeError('Magnitude plot needs a zero baseline');
  const baseline = 160 * (1 - zero.value);
  return (
    <g transform={kitTransform(props)} opacity={kitOpacity(props)} data-unit={props.basis.unit}>
      <path d="M18 0V160H280" fill="none" stroke={props.colors.text} strokeWidth={2} />
      <path d={`M18 ${baseline}H280`} stroke={props.colors.text} strokeWidth={2} />
      <KitText text={exact(props.domain[1])} colors={props.colors} x={0} y={0} size={10} />
      <KitText text={exact(props.domain[0])} colors={props.colors} x={0} y={160} size={10} />
      {rows.map(({ record, x, positions }, rowIndex) => (
        <g key={record.id} data-record-id={record.id} data-value-state={record.quantity.state}>
          {positions.length === 0 ? (
            <path
              d={`M${x - 4} ${baseline - 18}h12v24h-12Z`}
              fill="none"
              stroke={props.colors.text}
              strokeDasharray="4 3"
            />
          ) : (
            positions.map((y, index) =>
              y === baseline ? (
                <circle
                  key={`${record.id}-${index}`}
                  cx={x + index * 4}
                  cy={baseline}
                  r={3}
                  fill={props.colors.text}
                />
              ) : (
                <rect
                  key={`${record.id}-${index}`}
                  x={x + index * 4}
                  y={
                    y < baseline ? baseline - (baseline - y) * kitUnit(props.pose.action) : baseline
                  }
                  width={12}
                  height={Math.abs(y - baseline) * kitUnit(props.pose.action)}
                  fill={props.colors.surface}
                  stroke={kitColor(props)}
                  strokeDasharray={record.quantity.state === 'known' ? undefined : '4 3'}
                />
              ),
            )
          )}
          <KitText text={`#${rowIndex + 1}`} colors={props.colors} x={x - 4} y={184} size={10} />
          <KitText
            text={`#${rowIndex + 1} ${record.label}`}
            colors={props.colors}
            x={312}
            y={rowIndex * 68 + 12}
            size={10}
          />
          {record.quantity.state === 'disputed' ? (
            <>
              {record.quantity.alternatives.map((amount, index) => (
                <KitText
                  key={`${record.id}-value-${index}`}
                  text={amount.notation ?? exact(amountValue(amount))}
                  colors={props.colors}
                  x={312 + index * 256}
                  y={rowIndex * 68 + 28}
                  size={10}
                />
              ))}
              <KitText
                text="disputed"
                colors={props.colors}
                x={312}
                y={rowIndex * 68 + 44}
                size={10}
              />
            </>
          ) : (
            <KitText
              text={plottedValueText(record.quantity)}
              colors={props.colors}
              x={312}
              y={rowIndex * 68 + 28}
              size={10}
            />
          )}
          {quantityQualifier(record.quantity) && (
            <KitText
              text={quantityQualifier(record.quantity)}
              colors={props.colors}
              x={312}
              y={rowIndex * 68 + 60}
              size={10}
            />
          )}
        </g>
      ))}
      <KitText
        text={`${props.basis.unit}; ${props.basis.population}; ${props.basis.period}`}
        colors={props.colors}
        x={18}
        y={226}
        size={10}
      />
      {props.basis.denominator && (
        <KitText
          text={`reference: ${exact(props.basis.denominator)}`}
          colors={props.colors}
          x={18}
          y={242}
          size={10}
        />
      )}
    </g>
  );
}
/** A restrained chart instrument, not perspective-scaled numerical bars. */
export function PrecisionPlotClay(props: PrecisionPlotProps): ReactElement {
  precisionPlotLayout(props);
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ unit: props.basis.unit, recordIds: props.records.map((record) => record.id) }}
    >
      <ClayBlock size={[2.7, 1.6, 0.12]} color={props.colors.surface} opacity={kitOpacity(props)} />
      <ClayBlock size={[2.75, 0.12, 0.44]} position={[0, -0.84, 0]} color={props.colors.muted} />
      <ClayBlock size={[0.04, 1.3, 0.03]} position={[-1.12, 0, 0.08]} color={props.colors.text} />
      <ClayBlock size={[2.3, 0.04, 0.03]} position={[0, -0.62, 0.08]} color={props.colors.text} />
    </group>
  );
}
export function PlotBandSvg(props: PlotBandProps): ReactElement {
  label(props.meaning, 96);
  const lower = rationalPosition(props.lowerValue, props.domain[0], props.domain[1]);
  const upper = rationalPosition(props.upperValue, props.domain[0], props.domain[1]);
  const ordered = compare(props.lowerValue, props.upperValue);
  if (!props.id || !lower.ok || !upper.ok || !ordered.ok || ordered.value > 0)
    throw new RangeError('Qualified range requires ordered supplied endpoints');
  return (
    <g transform={kitTransform(props)} opacity={kitOpacity(props)} data-range-id={props.id}>
      <path d="M0 18H240" stroke={props.colors.text} />
      <rect
        x={lower.value * 240}
        y={8}
        width={(upper.value - lower.value) * 240}
        height={20}
        fill={props.colors.surface}
        stroke={kitColor(props)}
      />
      <path
        d={`M${lower.value * 240} 0V36M${upper.value * 240} 0V36`}
        stroke={props.colors.text}
        strokeWidth={2}
      />
      <KitText
        text={`${exact(props.lowerValue)} – ${exact(props.upperValue)}`}
        colors={props.colors}
        x={0}
        y={56}
      />
      <KitText text={props.meaning} colors={props.colors} x={0} y={76} />
    </g>
  );
}
export function partitionLayout(
  props: PartitionProps,
): readonly { readonly part: PartitionPart; readonly start: number; readonly width: number }[] {
  boundedKitItems(props.parts, 12);
  label(props.basisLabel, 40);
  let totalNumerator = 0n,
    totalDenominator = 1n;
  const layout = props.parts.map((part) => {
    label(part.label);
    checkedValue(part.share);
    const position = rationalPosition(
      part.share,
      { numerator: 0, denominator: 1 },
      { numerator: 1, denominator: 1 },
    );
    if (!position.ok || !['source', 'derived'].includes(part.provenance))
      throw new RangeError('Partition shares require explicit compatible whole references');
    const start = Number(totalNumerator) / Number(totalDenominator);
    totalNumerator =
      totalNumerator * BigInt(part.share.denominator) +
      BigInt(part.share.numerator) * totalDenominator;
    totalDenominator *= BigInt(part.share.denominator);
    if (totalNumerator > totalDenominator) throw new RangeError('Known parts exceed the whole');
    return { part, start: start * 240, width: position.value * 240 };
  });
  if (props.remainder === 'known-complete' && totalNumerator !== totalDenominator)
    throw new RangeError('Complete partitions must cover exactly the stated whole');
  return layout;
}
export function PartitionSvg(props: PartitionProps): ReactElement {
  const parts = partitionLayout(props);
  return (
    <g transform={kitTransform(props)} opacity={kitOpacity(props)} data-remainder={props.remainder}>
      {parts.map(({ part, start, width }, index) => (
        <g key={part.id} data-part-id={part.id} data-provenance={part.provenance}>
          <rect
            x={start}
            width={width}
            height={32}
            fill={props.colors.surface}
            stroke={index % 2 ? props.colors.text : props.colors.accent}
          />
          <KitText
            text={`${part.label}: ${exact(part.share)}${part.provenance === 'derived' ? ' (derived)' : ''}`}
            colors={props.colors}
            x={0}
            y={54 + index * 18}
            size={10}
          />
        </g>
      ))}
      {props.remainder !== 'known-complete' && (
        <g transform="translate(248 0)">
          <rect
            width={54}
            height={32}
            fill="none"
            stroke={props.colors.text}
            strokeDasharray="4 3"
          />
          <KitText text={props.remainder} colors={props.colors} x={0} y={48} size={10} />
        </g>
      )}
      <KitText
        text={props.basisLabel}
        colors={props.colors}
        x={0}
        y={80 + parts.length * 18}
        size={10}
      />
    </g>
  );
}
export function PartitionClay(props: PartitionProps): ReactElement {
  partitionLayout(props);
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ partIds: props.parts.map((part) => part.id), remainder: props.remainder }}
    >
      <ClayBlock size={[2.4, 0.1, 0.64]} color={props.colors.surface} />
      {props.parts.map((part, index) => (
        <ClayBlock
          key={part.id}
          size={[0.12, 0.05, 0.3]}
          position={[-1.04 + index * 0.18, 0.09, 0]}
          color={kitColor(props)}
        />
      ))}
    </group>
  );
}
export function RankedTrackSvg(props: RankedTrackProps): ReactElement {
  label(props.label);
  label(props.periodLabel, 32);
  if (
    !props.id ||
    (props.rank !== 'unknown' &&
      (!Number.isInteger(props.rank) || props.rank < 1 || props.rank > 8))
  )
    throw new RangeError('Rank must be a supplied bounded position, or unknown');
  const x = props.rank === 'unknown' ? 260 : (props.rank - 1) * 30;
  return (
    <g transform={kitTransform(props)} opacity={kitOpacity(props)} data-ranked-id={props.id}>
      <path d="M0 18H240" stroke={props.colors.text} strokeWidth={2} />
      <rect
        x={x}
        width={24}
        height={32}
        fill={props.colors.surface}
        stroke={kitColor(props)}
        strokeDasharray={props.rank === 'unknown' ? '4 3' : undefined}
      />
      <KitText text={props.label} colors={props.colors} x={0} y={56} />
      <KitText text={`${props.periodLabel}: ${props.rank}`} colors={props.colors} x={0} y={76} />
    </g>
  );
}
export const PLOT_ASSET_BUDGETS = {
  precision: { meshes: 4, svgElements: 191 },
  band: { meshes: 0, svgElements: 8 },
  partition: { meshes: 13, svgElements: 55 },
  ranked: { meshes: 0, svgElements: 7 },
} as const;
