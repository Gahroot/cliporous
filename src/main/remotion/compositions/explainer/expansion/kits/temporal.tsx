import type { ReactElement } from 'react';
import { ClayBlock } from '../../explanation-kit';
import { compare, rationalPosition } from '../value-logic';
import type { ExpansionRational } from '../value-types';
import {
  type KitAssetProps,
  KitText,
  kitColor,
  kitOpacity,
  kitPoint,
  kitScale,
  kitTransform,
  kitUnit,
} from './computing';

export type TemporalInterval = {
  readonly id: string;
  readonly label: string;
} & (
  | {
      readonly kind: 'measured';
      readonly startValue: ExpansionRational;
      readonly endValue: ExpansionRational;
      readonly basis: string;
    }
  | { readonly kind: 'qualitative'; readonly qualifier: string }
);
export interface TemporalTaskProps extends KitAssetProps {
  readonly interval: TemporalInterval;
  readonly domain: readonly [ExpansionRational, ExpansionRational];
}
export interface DeadlineShutterProps extends KitAssetProps {
  readonly id: string;
  readonly deadlineLabel: string;
  readonly attemptLabel: string;
  readonly result: 'allowed' | 'expired' | 'unresolved';
}
export interface TemporalJoinProps extends KitAssetProps {
  readonly id: string;
  readonly label: string;
  readonly result: 'joined' | 'waiting' | 'unresolved';
}
export interface TemporalStateBadgeProps extends KitAssetProps {
  readonly id: string;
  readonly label: string;
  readonly history: 'retained' | 'not-stated';
}
function boundLabel(id: string, label: string): void {
  if (!id || id.length > 96 || !label.trim() || label.length > 28)
    throw new RangeError('Temporal assets require stable identities and bounded source labels');
}
/** Domain values are never rebased or shifted by the animation pose. */
export function projectTemporalInterval(
  interval: TemporalInterval,
  domain: readonly [ExpansionRational, ExpansionRational],
): {
  readonly x: number;
  readonly width: number;
  readonly schematic: boolean;
  readonly milestone: boolean;
} {
  boundLabel(interval.id, interval.label);
  if (interval.kind === 'qualitative') {
    if (!interval.qualifier.trim() || interval.qualifier.length > 96)
      throw new RangeError('Qualitative intervals need an explicit qualifier');
    return { x: 28, width: 144, schematic: true, milestone: false };
  }
  if (!interval.basis.trim() || interval.basis.length > 40)
    throw new RangeError('Measured intervals need a source basis');
  const start = rationalPosition(interval.startValue, domain[0], domain[1]);
  const end = rationalPosition(interval.endValue, domain[0], domain[1]);
  const ordered = compare(interval.startValue, interval.endValue);
  if (!start.ok || !end.ok || !ordered.ok || ordered.value > 0)
    throw new RangeError('Intervals must share an ordered complete represented domain');
  return {
    x: start.value * 200,
    width: (end.value - start.value) * 200,
    schematic: false,
    milestone: ordered.value === 0,
  };
}
export function TemporalTaskSvg(props: TemporalTaskProps): ReactElement {
  const projection = projectTemporalInterval(props.interval, props.domain);
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-task-id={props.interval.id}
      data-timing={props.interval.kind}
    >
      <KitText text={props.interval.label} colors={props.colors} x={0} y={-12} />
      <path d="M0 18H200" fill="none" stroke={props.colors.muted} strokeWidth={2} />
      {projection.width === 0 ? (
        <line
          x1={projection.x}
          x2={projection.x}
          y1={0}
          y2={28}
          stroke={props.colors.text}
          data-milestone={projection.milestone}
          data-below-resolution={!projection.milestone}
        />
      ) : (
        <rect
          x={projection.x}
          y={0}
          width={projection.width}
          height={28}
          fill={props.colors.surface}
          stroke={props.colors.text}
          strokeDasharray={projection.schematic ? '5 4' : undefined}
        />
      )}

      <rect
        x={projection.x}
        y={22}
        width={projection.width * kitUnit(props.pose.action)}
        height={6}
        fill={kitColor(props)}
      />
      <KitText
        text={
          props.interval.kind === 'qualitative' ? props.interval.qualifier : props.interval.basis
        }
        colors={props.colors}
        x={0}
        y={48}
      />
      {props.interval.kind === 'measured' && (
        <>
          <KitText
            text={`${props.interval.startValue.numerator}/${props.interval.startValue.denominator}`}
            colors={props.colors}
            x={projection.x}
            y={16}
            size={10}
          />
          <KitText
            text={`${props.interval.endValue.numerator}/${props.interval.endValue.denominator}`}
            colors={props.colors}
            x={projection.x + projection.width}
            y={16}
            size={10}
          />
        </>
      )}
    </g>
  );
}
export function TemporalTaskClay(props: TemporalTaskProps): ReactElement {
  const projection = projectTemporalInterval(props.interval, props.domain);
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ taskId: props.interval.id, timing: props.interval.kind }}
    >
      <ClayBlock size={[2, 0.08, 0.4]} position={[0, -0.12, 0]} color={props.colors.muted} />
      <ClayBlock
        size={[Math.max(0.01, projection.width / 100), 0.22, 0.36]}
        position={[-1 + projection.x / 100 + projection.width / 200, 0.02, 0]}
        color={props.colors.surface}
        opacity={kitOpacity(props)}
      />
      <ClayBlock
        size={[0.04, 0.32, 0.42]}
        position={[-1 + projection.x / 100, 0.02, 0]}
        color={kitColor(props)}
      />
    </group>
  );
}
export function DeadlineShutterSvg(props: DeadlineShutterProps): ReactElement {
  boundLabel(props.id, props.deadlineLabel);
  if (!props.attemptLabel.trim() || props.attemptLabel.length > 28)
    throw new RangeError('Deadline attempt requires a source label');
  const closed = props.result === 'expired' ? kitUnit(props.pose.response) : 0;
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-window-id={props.id}
      data-result={props.result}
    >
      <path
        d="M0 110V0H160V110M-12 110H172"
        fill="none"
        stroke={props.colors.text}
        strokeWidth={4}
      />
      <rect
        x={4}
        y={4}
        width={152}
        height={96 * closed}
        fill={props.colors.surface}
        stroke={kitColor(props)}
        strokeDasharray={props.result === 'unresolved' ? '5 4' : undefined}
      />
      <KitText text={props.deadlineLabel} colors={props.colors} x={8} y={25} />
      <KitText text={props.attemptLabel} colors={props.colors} x={8} y={54} />
      <KitText text={props.result} colors={props.colors} x={8} y={84} />
    </g>
  );
}
export function DeadlineShutterClay(props: DeadlineShutterProps): ReactElement {
  boundLabel(props.id, props.deadlineLabel);
  const closed = props.result === 'expired' ? kitUnit(props.pose.response) : 0;
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ windowId: props.id, result: props.result }}
    >
      <ClayBlock size={[0.1, 1.2, 0.3]} position={[-0.6, 0, 0]} color={props.colors.muted} />
      <ClayBlock size={[0.1, 1.2, 0.3]} position={[0.6, 0, 0]} color={props.colors.muted} />
      <ClayBlock size={[1.3, 0.1, 0.3]} position={[0, 0.6, 0]} color={props.colors.muted} />
      <ClayBlock
        size={[1.08, 1.08, 0.1]}
        position={[0, (1 - closed) * 1.05, 0]}
        color={props.colors.surface}
        opacity={kitOpacity(props)}
      />
    </group>
  );
}
export function TemporalJoinSvg(props: TemporalJoinProps): ReactElement {
  boundLabel(props.id, props.label);
  const completed = props.result === 'joined' ? kitUnit(props.pose.check) : 0;
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-join-id={props.id}
      data-result={props.result}
    >
      <path
        d="M0 0L70 30M0 60L70 30M70 30H150"
        fill="none"
        stroke={props.colors.text}
        strokeWidth={3}
        strokeDasharray={props.result === 'unresolved' ? '5 4' : undefined}
      />
      <path
        d={`M70 30H${70 + 80 * completed}`}
        fill="none"
        stroke={props.colors.accent}
        strokeWidth={5}
      />
      <circle cx={70} cy={30} r={8} fill={props.colors.surface} stroke={props.colors.text} />
      <KitText text={props.label} colors={props.colors} x={0} y={88} />
      <KitText text={props.result} colors={props.colors} x={0} y={106} />
    </g>
  );
}
export function TemporalJoinClay(props: TemporalJoinProps): ReactElement {
  boundLabel(props.id, props.label);
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ joinId: props.id, result: props.result }}
    >
      <ClayBlock
        size={[0.85, 0.06, 0.16]}
        position={[-0.3, 0.25, 0]}
        rotation={[0, 0, -0.55]}
        color={props.colors.muted}
      />
      <ClayBlock
        size={[0.85, 0.06, 0.16]}
        position={[-0.3, -0.25, 0]}
        rotation={[0, 0, 0.55]}
        color={props.colors.muted}
      />
      <ClayBlock
        size={[0.85, 0.06, 0.16]}
        position={[0.55, 0, 0]}
        color={props.result === 'joined' ? props.colors.accent : props.colors.muted}
      />
      <ClayBlock size={[0.22, 0.22, 0.22]} color={props.colors.surface} />
    </group>
  );
}
export function TemporalStateBadgeSvg(props: TemporalStateBadgeProps): ReactElement {
  boundLabel(props.id, props.label);
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-state-id={props.id}
      data-history={props.history}
    >
      <rect
        width={180}
        height={64}
        rx={8}
        fill={props.colors.surface}
        stroke={props.colors.text}
        strokeWidth={2}
        strokeDasharray={props.state === 'unknown' ? '5 4' : undefined}
      />
      {props.history === 'retained' && (
        <path d="M6 4H174V60H6Z" fill="none" stroke={kitColor(props)} strokeWidth={2} />
      )}
      <KitText text={props.label} colors={props.colors} x={14} y={25} />
      <KitText
        text={`${props.state}; history ${props.history}`}
        colors={props.colors}
        x={14}
        y={48}
        size={10}
      />
    </g>
  );
}
export function TemporalStateBadgeClay(props: TemporalStateBadgeProps): ReactElement {
  boundLabel(props.id, props.label);
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ stateId: props.id, history: props.history }}
    >
      <ClayBlock
        size={[1.2, 0.42, 0.12]}
        color={props.colors.surface}
        opacity={kitOpacity(props)}
      />
      <ClayBlock size={[0.85, 0.05, 0.03]} position={[0, -0.12, 0.08]} color={kitColor(props)} />
      {props.history === 'retained' && (
        <ClayBlock
          size={[1.05, 0.03, 0.03]}
          position={[0, 0.17, 0.08]}
          color={props.colors.accent}
        />
      )}
    </group>
  );
}
export const TEMPORAL_ASSET_BUDGETS = {
  task: { meshes: 3, svgElements: 12 },
  deadline: { meshes: 4, svgElements: 9 },
  join: { meshes: 4, svgElements: 8 },
  state: { meshes: 3, svgElements: 7 },
} as const;
