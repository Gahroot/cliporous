import type React from 'react';
import { useStage } from '../stage';
import { labelLines } from './layout';
import { SemanticSymbol } from './symbols';
import type { DiagramEntity, DiagramPoint, EdgeRole, Measurement } from './types';

export function DiagramText({
  x,
  y,
  children,
  size = 34,
  columns = 24,
  anchor = 'middle',
  strong = false,
}: {
  x: number;
  y: number;
  children: string;
  size?: number;
  columns?: number;
  anchor?: 'start' | 'middle' | 'end';
  strong?: boolean;
}): React.ReactElement {
  const S = useStage();
  return (
    <text
      x={x}
      y={y}
      fill={S.text}
      fontFamily={S.font}
      fontSize={size}
      fontWeight={strong ? 750 : 550}
      textAnchor={anchor}
    >
      {labelLines(children, columns).map((line, i) => (
        <tspan key={`${i}-${line}`} x={x} dy={i === 0 ? 0 : size * 1.2}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function DiagramNode({
  entity,
  point,
  detail,
  opacity = 1,
}: {
  entity: DiagramEntity;
  point: DiagramPoint;
  detail?: string;
  opacity?: number;
}): React.ReactElement {
  return (
    <g opacity={opacity} data-entity-id={entity.id}>
      <SemanticSymbol symbolRole={entity.role} x={point.x} y={point.y - 25} size={48} />
      <DiagramText x={point.x} y={point.y + 37} size={30} columns={9} strong>
        {entity.label}
      </DiagramText>
      {detail && (
        <DiagramText
          x={point.x}
          y={point.y + 71 + (labelLines(entity.label, 9).length - 1) * 36}
          size={26}
          columns={18}
        >
          {detail}
        </DiagramText>
      )}
    </g>
  );
}

/** Paths are constructed from authored endpoints only. No user-controlled geometry. */
export function DirectedConnector({
  from,
  to,
  progress,
  edgeRole = 'payment',
  label,
}: {
  from: DiagramPoint;
  to: DiagramPoint;
  progress: number;
  edgeRole?: EdgeRole;
  label?: string;
}): React.ReactElement {
  const S = useStage();
  const p = Math.max(0, Math.min(1, progress));
  const x = from.x + (to.x - from.x) * p;
  const y = from.y + (to.y - from.y) * p;
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return (
    <g opacity={p > 0 ? 1 : 0}>
      <path
        d={`M${from.x} ${from.y}L${x} ${y}`}
        fill="none"
        stroke={S.text}
        strokeWidth={5}
        strokeDasharray={edgeRole === 'shared' ? '12 9' : undefined}
      />
      {edgeRole !== 'shared' && (
        <path
          d="M-16 -10 0 0-16 10"
          transform={`translate(${x} ${y}) rotate(${angle})`}
          fill="none"
          stroke={S.text}
          strokeWidth={5}
          strokeLinejoin="round"
        />
      )}
      {label && p === 1 && (
        <DiagramText x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 20} size={28} columns={16}>
          {label}
        </DiagramText>
      )}
    </g>
  );
}

export function OwnershipStrip({
  x,
  y,
  width,
  total,
  retained,
  label,
}: {
  x: number;
  y: number;
  width: number;
  total: number;
  retained: number;
  label: string;
}): React.ReactElement {
  const S = useStage();
  const fraction = total > 0 ? Math.max(0, Math.min(1, retained / total)) : 0;
  return (
    <g>
      <DiagramText x={x} y={y - 70} anchor="start" size={28} columns={24}>
        {label}
      </DiagramText>
      <rect
        x={x}
        y={y}
        width={width}
        height={56}
        rx={8}
        fill={S.cardRaised}
        stroke={S.text}
        strokeWidth={3}
      />
      <rect
        x={x}
        y={y}
        width={width * fraction}
        height={56}
        rx={8}
        fill={S.accent}
        stroke={S.text}
        strokeWidth={3}
      />
      <path d={`M${x + width * fraction} ${y - 7}v70`} stroke={S.text} strokeWidth={5} />
      <DiagramText
        x={x}
        y={y + 92}
        anchor="start"
        columns={44}
        strong
      >{`${retained} / ${total} shares`}</DiagramText>
    </g>
  );
}

export function MetricRail({
  x,
  y,
  width,
  metric,
  maximum,
  label,
  compact = false,
}: {
  x: number;
  y: number;
  width: number;
  metric: Measurement;
  maximum: number;
  label: string;
  compact?: boolean;
}): React.ReactElement {
  const S = useStage();
  const stated = metric.state === 'measured';
  return (
    <g>
      <DiagramText x={x} y={y} size={compact ? 26 : 32} anchor="start" columns={36}>
        {label}
      </DiagramText>
      {stated ? (
        <>
          <path d={`M${x} ${y + 30}h${width}`} stroke={S.cardBorder} strokeWidth={12} />
          <path
            d={`M${x} ${y + 30}h${maximum > 0 ? width * Math.max(0, Math.min(1, metric.value / maximum)) : 0}`}
            stroke={S.accent}
            strokeWidth={12}
          />
          <DiagramText
            x={compact ? x : x + width + 18}
            y={y + (compact ? 70 : 40)}
            anchor="start"
            size={30}
            columns={20}
          >{`${metric.value} ${metric.unit}`}</DiagramText>
        </>
      ) : (
        <DiagramText x={x} y={y + 48} size={32} anchor="start">
          {metric.state === 'unknown' ? 'Not stated' : 'Illustrative'}
        </DiagramText>
      )}
    </g>
  );
}

export function TimeLane({
  y,
  label,
  children,
}: {
  y: number;
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  const S = useStage();
  return (
    <g>
      <path d={`M40 ${y}H912`} stroke={S.text} strokeWidth={3} />
      <DiagramText x={40} y={y - 140} size={28} columns={26} anchor="start" strong>
        {label}
      </DiagramText>
      {children}
    </g>
  );
}
