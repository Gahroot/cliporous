import { cloneElement, type ReactElement, type SVGProps } from 'react';
import { DiagramText } from '../../diagrams/primitives';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import type {
  ExpansionKitColors,
  ExpansionKitPlacement,
  ExpansionKitPose,
  ExpansionKitState,
} from '../scene-types';
import { EXPANSION_LIMITS } from '../value-types';

/** Asset coordinates are authored by packs, not accepted from source/model payloads. */
export interface KitAssetProps extends ExpansionKitPlacement {
  readonly pose: ExpansionKitPose;
  readonly state: ExpansionKitState;
  readonly colors: ExpansionKitColors;
}
export interface KitBudget {
  readonly meshes: number;
  /** All SVG hosts, including groups, text and tspans; excludes the caller's SVG root. */
  readonly svgElements: number;
}
export type KitPoint = readonly [number, number, number];

export function kitUnit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
export function boundedKitItems<T extends { readonly id: string }>(
  items: readonly T[],
  cap: number,
): readonly T[] {
  if (items.length > cap) throw new Error(`Asset capacity exceeded (${cap})`);
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id || item.id.length > 96 || ids.has(item.id))
      throw new Error('Assets require unique, retained source identities');
    ids.add(item.id);
  }
  return items;
}
export function kitPoint(position: KitPoint): [number, number, number] {
  if (position.some((v) => !Number.isFinite(v) || Math.abs(v) > 10000))
    throw new Error('Asset placement must be a finite authored tuple');
  return [position[0], position[1], position[2]];
}
export function kitScale(scale = 1): number {
  if (!Number.isFinite(scale) || scale <= 0 || scale > 8)
    throw new Error('Asset scale must be authored and bounded');
  return scale;
}
export function kitTransform(props: ExpansionKitPlacement): string {
  const [x, y] = kitPoint(props.position);
  return `translate(${x} ${y}) scale(${kitScale(props.scale)})`;
}
export function kitOpacity(props: KitAssetProps): number {
  return kitUnit(props.pose.reveal) * (props.state === 'excluded' ? 0.45 : 1);
}
export function kitColor(props: KitAssetProps): string {
  return props.state === 'active' ? props.colors.accent : props.colors.muted;
}

/** Reuse diagram typography, overriding its palette with the explicit asset palette. */
export function KitText({
  text,
  colors,
  x = 0,
  y = 0,
  size = 12,
}: {
  readonly text: string;
  readonly colors: ExpansionKitColors;
  readonly x?: number;
  readonly y?: number;
  readonly size?: number;
}): ReactElement {
  if (text.length > 96) throw new Error('Asset text exceeds the source-label/qualifier bound');
  const element = DiagramText({
    x,
    y,
    children: text,
    columns: 96,
    size,
    anchor: 'start',
  }) as ReactElement<SVGProps<SVGTextElement>>;
  return cloneElement(element, { fill: colors.text });
}

export interface ComputingRecord {
  readonly id: string;
  readonly label: string;
  readonly kind: 'packet' | 'version' | 'effect';
  /** Source strings are retained verbatim; an attempt never manufactures an effect. */
  readonly version?: string;
  readonly attemptId?: string;
  readonly effectId?: string;
  readonly qualifier?: string;
  readonly state: ExpansionKitState;
  readonly position: KitPoint;
}
export interface ComputingActor {
  readonly id: string;
  readonly label: string;
  readonly kind: 'server' | 'cache' | 'buffer' | 'replica';
  readonly version?: string;
  readonly qualifier?: string;
  readonly state: ExpansionKitState;
  readonly position: KitPoint;
}
export interface ComputingRelation {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly role: 'attempt' | 'effect' | 'replica' | 'loss';
  /** Endpoints are authored, never computed from a numerical source fact. */
  readonly from: KitPoint;
  readonly to: KitPoint;
  readonly qualifier?: string;
  readonly state: ExpansionKitState;
}
export interface ComputingKitProps extends KitAssetProps {
  readonly actors: readonly ComputingActor[];
  readonly records: readonly ComputingRecord[];
  readonly relations: readonly ComputingRelation[];
}
export interface ComputingRecordProps extends KitAssetProps {
  readonly record: ComputingRecord;
}
export interface ComputingActorProps extends KitAssetProps {
  readonly actor: ComputingActor;
}

function recordQualifier(record: ComputingRecord): string {
  return record.qualifier ?? (record.state === 'unknown' ? 'Outcome unknown' : record.state);
}

/** A folded, striped packet retains identity, version, attempts and effects separately. */
export function ComputingRecordSvg(props: ComputingRecordProps): ReactElement {
  const { record, colors } = props;
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-record-id={record.id}
      data-version={record.version}
      data-attempt-id={record.attemptId}
      data-effect-id={record.effectId}
      data-state={props.state}
    >
      <path d="M0 0H150L172 22V130H0Z" fill={colors.surface} stroke={colors.text} strokeWidth={2} />
      <path d="M150 0V22H172M12 14V114" fill="none" stroke={kitColor(props)} strokeWidth={5} />
      <path d="M24 39H158" stroke={colors.muted} />
      <KitText text={record.label} colors={colors} x={24} y={26} />
      <KitText text={`Version: ${record.version ?? 'not stated'}`} colors={colors} x={24} y={55} />
      <KitText
        text={`Attempt: ${record.attemptId ?? 'not stated'}`}
        colors={colors}
        x={24}
        y={73}
      />
      <KitText text={`Effect: ${record.effectId ?? 'not stated'}`} colors={colors} x={24} y={91} />
      <KitText text={recordQualifier(record)} colors={colors} x={24} y={111} />
      <KitText text={props.state} colors={colors} x={24} y={127} size={10} />
    </g>
  );
}

/** Tactile packet card; every precise field belongs to the planar companion above. */
export function ComputingRecordClay(props: ComputingRecordProps): ReactElement {
  const opacity = kitOpacity(props);
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{
        recordId: props.record.id,
        version: props.record.version,
        attemptId: props.record.attemptId,
        effectId: props.record.effectId,
        state: props.state,
      }}
    >
      <ClayBlock size={[0.78, 0.52, 0.07]} color={props.colors.surface} opacity={opacity} />
      <ClayBlock
        size={[0.06, 0.4, 0.025]}
        position={[-0.29, 0, 0.05]}
        color={kitColor(props)}
        opacity={opacity}
      />
      <ClayBlock
        size={[0.14, 0.12, 0.025]}
        position={[0.27, 0.18, 0.05]}
        color={props.colors.muted}
        opacity={opacity}
      />
    </group>
  );
}

/** Ports and shelves distinguish a server/replica from a slotted cache or buffer. */
export function ComputingActorSvg(props: ComputingActorProps): ReactElement {
  const { actor, colors } = props;
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-actor-id={actor.id}
      data-kind={actor.kind}
      data-state={props.state}
      data-version={actor.version}
    >
      <rect
        width={180}
        height={126}
        rx={8}
        fill={colors.surface}
        stroke={colors.text}
        strokeWidth={3}
      />
      <path
        d={
          actor.kind === 'buffer' || actor.kind === 'cache'
            ? 'M12 90H168M45 46V90M90 46V90M135 46V90'
            : 'M12 48H168M12 76H168M12 104H168'
        }
        fill="none"
        stroke={colors.muted}
        strokeWidth={4}
      />
      <circle cx={154} cy={20} r={6} fill={kitColor(props)} />
      <KitText text={actor.label} colors={colors} x={12} y={24} />
      <KitText text={actor.kind} colors={colors} x={12} y={145} />
      <KitText text={`Version: ${actor.version ?? 'not stated'}`} colors={colors} x={12} y={163} />
      <KitText text={actor.qualifier ?? props.state} colors={colors} x={12} y={181} />
      <KitText text={props.state} colors={colors} x={12} y={199} size={10} />
    </g>
  );
}

export function ComputingActorClay(props: ComputingActorProps): ReactElement {
  const { actor, colors } = props;
  const opacity = kitOpacity(props);
  const tray = actor.kind === 'cache' || actor.kind === 'buffer';
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ actorId: actor.id, kind: actor.kind, state: props.state, version: actor.version }}
    >
      <ClayBlock
        size={tray ? [1.5, 0.12, 0.8] : [1.2, 1.4, 0.7]}
        color={colors.surface}
        opacity={opacity}
      />
      {tray ? (
        <>
          <ClayBlock
            size={[1.5, 0.32, 0.08]}
            position={[0, 0.17, -0.36]}
            color={colors.muted}
            opacity={opacity}
          />
          {([-0.7, -0.24, 0.24, 0.7] as const).map((x) => (
            <ClayBlock
              key={x}
              size={[0.06, 0.32, 0.8]}
              position={[x, 0.17, 0]}
              color={colors.muted}
              opacity={opacity}
            />
          ))}
        </>
      ) : (
        <>
          {([-0.43, 0, 0.43] as const).map((y) => (
            <ClayBlock
              key={y}
              size={[0.9, 0.055, 0.035]}
              position={[0, y, 0.37]}
              color={colors.muted}
              opacity={opacity}
            />
          ))}
          <mesh position={[0.38, 0.55, 0.38]}>
            <sphereGeometry args={[0.055, 12, 8]} />
            <Clay color={kitColor(props)} opacity={opacity} />
          </mesh>
        </>
      )}
    </group>
  );
}

/** Unknown/loss relations are dashed, not reinterpreted as successful deliveries. */
export function ComputingRelationSvg(
  props: KitAssetProps & { readonly relation: ComputingRelation },
): ReactElement {
  const { relation, colors } = props;
  const [x1, y1] = kitPoint(relation.from);
  const [x2, y2] = kitPoint(relation.to);
  const progress = kitUnit(props.pose.action);
  const uncertain =
    props.state === 'unknown' || props.state === 'disputed' || relation.role === 'loss';
  return (
    <g
      data-relation-id={relation.id}
      data-role={relation.role}
      data-state={props.state}
      opacity={kitOpacity(props)}
    >
      <path
        d={`M${x1} ${y1}L${x2} ${y2}`}
        fill="none"
        stroke={colors.muted}
        strokeWidth={3}
        strokeDasharray={uncertain ? '5 5' : undefined}
      />
      <path
        d={`M${x1} ${y1}L${x1 + (x2 - x1) * progress} ${y1 + (y2 - y1) * progress}`}
        fill="none"
        stroke={kitColor(props)}
        strokeWidth={3}
        strokeDasharray={uncertain ? '5 5' : undefined}
      />
      <KitText text={relation.role} colors={colors} x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 16} />
      <KitText
        text={relation.qualifier ?? props.state}
        colors={colors}
        x={(x1 + x2) / 2}
        y={(y1 + y2) / 2}
      />
    </g>
  );
}

export function validateComputingKit(props: ComputingKitProps): void {
  const actors = boundedKitItems(props.actors, EXPANSION_LIMITS.actors);
  const records = boundedKitItems(props.records, EXPANSION_LIMITS.records);
  boundedKitItems(props.relations, EXPANSION_LIMITS.relations);
  boundedKitItems([...actors, ...records], EXPANSION_LIMITS.actors + EXPANSION_LIMITS.records);
  const ids = new Set([...actors, ...records].map((item) => item.id));
  for (const relation of props.relations) {
    if (!ids.has(relation.fromId) || !ids.has(relation.toId))
      throw new Error('Computing relation endpoints must retain known identities');
  }
}
export function ComputingKitSvg(props: ComputingKitProps): ReactElement {
  validateComputingKit(props);
  return (
    <g transform={kitTransform(props)} data-kit="computing">
      {props.relations.map((relation) => (
        <ComputingRelationSvg
          key={relation.id}
          {...props}
          state={relation.state}
          relation={relation}
        />
      ))}
      {props.actors.map((actor) => (
        <ComputingActorSvg
          key={actor.id}
          {...props}
          position={actor.position}
          state={actor.state}
          actor={actor}
        />
      ))}
      {props.records.map((record) => (
        <ComputingRecordSvg
          key={record.id}
          {...props}
          position={record.position}
          state={record.state}
          record={record}
        />
      ))}
    </g>
  );
}
export function ComputingKitClay(props: ComputingKitProps): ReactElement {
  validateComputingKit(props);
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ kit: 'computing' }}
    >
      {props.actors.map((actor) => (
        <ComputingActorClay
          key={actor.id}
          {...props}
          position={actor.position}
          state={actor.state}
          actor={actor}
        />
      ))}
      {props.records.map((record) => (
        <ComputingRecordClay
          key={record.id}
          {...props}
          position={record.position}
          state={record.state}
          record={record}
        />
      ))}
    </group>
  );
}

/** Includes opacity-zero parts and every mesh inside the reused ClayBlock. */
export const COMPUTING_ASSET_BUDGETS = {
  record: { meshes: 3, svgElements: 16 },
  server: { meshes: 5, svgElements: 14 },
  replica: { meshes: 5, svgElements: 14 },
  cache: { meshes: 6, svgElements: 14 },
  buffer: { meshes: 6, svgElements: 14 },
  relation: { meshes: 0, svgElements: 7 },
} as const satisfies Record<string, KitBudget>;
export const COMPUTING_KIT_CEILING = { meshes: 84, svgElements: 417 } as const;
export function computingKitBudget(props: ComputingKitProps): KitBudget {
  validateComputingKit(props);
  return {
    meshes:
      props.actors.reduce((n, a) => n + COMPUTING_ASSET_BUDGETS[a.kind].meshes, 0) +
      props.records.length * 3,
    svgElements:
      1 + props.actors.length * 14 + props.records.length * 16 + props.relations.length * 7,
  };
}
