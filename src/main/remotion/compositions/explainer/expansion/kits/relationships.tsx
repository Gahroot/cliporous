import type { ReactElement } from 'react';
import { Quaternion, Vector3 } from 'three';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import {
  boundedKitItems,
  type KitAssetProps,
  type KitPoint,
  KitText,
  kitColor,
  kitOpacity,
  kitPoint,
  kitScale,
  kitTransform,
  kitUnit,
} from './computing';

export interface RelationshipEntity {
  readonly id: string;
  readonly label: string;
  readonly role: 'member' | 'owner' | 'approver' | 'resource' | 'candidate' | 'replica' | 'source';
}
export interface RelationshipEntityProps extends KitAssetProps {
  readonly entity: RelationshipEntity;
}
export interface RelationshipContainerProps extends KitAssetProps {
  readonly id: string;
  readonly label: string;
  readonly members: readonly RelationshipEntity[];
  readonly completeness: 'complete' | 'partial' | 'unknown';
}
export interface ApprovalStationProps extends KitAssetProps {
  readonly id: string;
  readonly ownerLabel: string;
  readonly approverLabel: string;
  readonly authorization: 'granted' | 'denied' | 'pending' | 'unknown' | 'not-stated';
}
export type RelationshipRole =
  | 'dependency'
  | 'membership'
  | 'approval'
  | 'transfer'
  | 'control'
  | 'eligibility'
  | 'correspondence';
export interface TypedRelationshipProps extends KitAssetProps {
  readonly id: string;
  readonly role: RelationshipRole;
  readonly from: KitPoint;
  readonly to: KitPoint;
  readonly condition?: string;
}
function validateEntity(entity: RelationshipEntity): void {
  if (
    !entity.id ||
    entity.id.length > 96 ||
    !entity.label.trim() ||
    entity.label.length > 28 ||
    !['member', 'owner', 'approver', 'resource', 'candidate', 'replica', 'source'].includes(
      entity.role,
    )
  )
    throw new RangeError(
      'Relationships require retained identities, bounded names and explicit roles',
    );
}
export function RelationshipEntitySvg(props: RelationshipEntityProps): ReactElement {
  validateEntity(props.entity);
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-entity-id={props.entity.id}
      data-role={props.entity.role}
    >
      <rect
        width={180}
        height={72}
        rx={8}
        fill={props.colors.surface}
        stroke={props.colors.text}
        strokeWidth={2}
        strokeDasharray={
          props.state === 'unknown' || props.state === 'disputed' ? '5 4' : undefined
        }
      />
      <path d="M10 8V64" stroke={kitColor(props)} strokeWidth={5} />
      <KitText text={props.entity.label} colors={props.colors} x={24} y={25} />
      <KitText text={`${props.entity.role}; ${props.state}`} colors={props.colors} x={24} y={50} />
      {props.state === 'excluded' && (
        <path d="M12 12L168 60M12 60L168 12" stroke={props.colors.text} strokeWidth={2} />
      )}
    </g>
  );
}
export function RelationshipEntityClay(props: RelationshipEntityProps): ReactElement {
  validateEntity(props.entity);
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ entityId: props.entity.id, role: props.entity.role, state: props.state }}
    >
      <ClayBlock
        size={[1.2, 0.48, 0.12]}
        color={props.colors.surface}
        opacity={kitOpacity(props)}
      />
      <ClayBlock size={[0.06, 0.36, 0.03]} position={[-0.45, 0, 0.08]} color={kitColor(props)} />
      <ClayBlock
        size={[0.74, 0.05, 0.03]}
        position={[0.02, -0.12, 0.08]}
        color={props.colors.muted}
      />
    </group>
  );
}
function validateContainer(props: RelationshipContainerProps): void {
  validateEntity({ id: props.id, label: props.label, role: 'resource' });
  boundedKitItems(props.members, 8).forEach(validateEntity);
  if (props.completeness === 'unknown' && props.members.length !== 0)
    throw new RangeError('Unknown membership must not fabricate named members');
}
export function RelationshipContainerSvg(props: RelationshipContainerProps): ReactElement {
  validateContainer(props);
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-container-id={props.id}
      data-completeness={props.completeness}
    >
      <path
        d="M0 24V0H240V24M0 34V170H240V34"
        fill={props.colors.surface}
        stroke={props.colors.text}
        strokeWidth={2}
        strokeDasharray={props.completeness === 'unknown' ? '5 4' : undefined}
      />
      <KitText text={props.label} colors={props.colors} x={12} y={20} />
      {props.members.map((member, index) => (
        <g
          key={member.id}
          data-member-id={member.id}
          transform={`translate(${12 + (index % 2) * 116} ${46 + Math.floor(index / 2) * 25})`}
        >
          <circle cx={4} cy={-4} r={3} fill={kitColor(props)} />
          <KitText text={member.label} colors={props.colors} x={14} y={0} size={10} />
        </g>
      ))}
      <KitText
        text={`Membership: ${props.completeness}`}
        colors={props.colors}
        x={12}
        y={157}
        size={10}
      />
    </g>
  );
}
export function RelationshipContainerClay(props: RelationshipContainerProps): ReactElement {
  validateContainer(props);
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ containerId: props.id, completeness: props.completeness }}
    >
      <ClayBlock size={[1.8, 0.08, 1.2]} position={[0, -0.18, 0]} color={props.colors.surface} />
      <ClayBlock size={[0.08, 0.35, 1.2]} position={[-0.9, 0, 0]} color={props.colors.muted} />
      <ClayBlock size={[0.08, 0.35, 1.2]} position={[0.9, 0, 0]} color={props.colors.muted} />
      <ClayBlock size={[1.8, 0.35, 0.08]} position={[0, 0, -0.6]} color={props.colors.muted} />
      {props.members.map((member, index) => (
        <ClayBlock
          key={member.id}
          size={[0.3, 0.06, 0.22]}
          position={[-0.6 + (index % 4) * 0.4, -0.09, -0.25 + Math.floor(index / 4) * 0.5]}
          color={kitColor(props)}
          opacity={kitOpacity(props)}
        />
      ))}
    </group>
  );
}
function validateApproval(props: ApprovalStationProps): void {
  validateEntity({ id: props.id, label: props.ownerLabel, role: 'owner' });
  validateEntity({ id: props.id, label: props.approverLabel, role: 'approver' });
  if (!['granted', 'denied', 'pending', 'unknown', 'not-stated'].includes(props.authorization))
    throw new RangeError('Authorization must retain its explicit source state');
}
export function ApprovalStationSvg(props: ApprovalStationProps): ReactElement {
  validateApproval(props);
  const opened = props.authorization === 'granted' ? kitUnit(props.pose.check) : 0;
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-approval-id={props.id}
      data-authorization={props.authorization}
    >
      <path
        d="M0 0H240V112H0Z"
        fill={props.colors.surface}
        stroke={props.colors.text}
        strokeWidth={2}
      />
      <path d="M20 68H220" stroke={props.colors.muted} strokeWidth={3} />
      <rect
        x={116}
        y={58 - opened * 32}
        width={8}
        height={40}
        fill={kitColor(props)}
        stroke={props.colors.text}
        strokeDasharray={
          props.authorization === 'unknown' || props.authorization === 'not-stated'
            ? '4 3'
            : undefined
        }
      />
      <KitText text={`Owner: ${props.ownerLabel}`} colors={props.colors} x={12} y={22} />
      <KitText text={`Approver: ${props.approverLabel}`} colors={props.colors} x={12} y={42} />
      <KitText text={props.authorization} colors={props.colors} x={12} y={103} />
    </g>
  );
}
export function ApprovalStationClay(props: ApprovalStationProps): ReactElement {
  validateApproval(props);
  const opened = props.authorization === 'granted' ? kitUnit(props.pose.check) : 0;
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ approvalId: props.id, authorization: props.authorization }}
    >
      <ClayBlock size={[1.8, 0.1, 0.85]} position={[0, -0.2, 0]} color={props.colors.surface} />
      <ClayBlock size={[0.3, 0.32, 0.3]} position={[-0.6, 0, 0]} color={props.colors.muted} />
      <ClayBlock size={[0.3, 0.32, 0.3]} position={[0.6, 0, 0]} color={props.colors.muted} />
      <ClayBlock
        size={[0.06, 0.64, 0.35]}
        position={[0, 0.18 + opened * 0.45, 0]}
        color={kitColor(props)}
      />
    </group>
  );
}
/** Typed direction is explicit; membership/correspondence are not payment or time arrows. */
export function relationshipSegment(props: TypedRelationshipProps): {
  readonly center: [number, number, number];
  readonly length: number;
  readonly rotation: [number, number, number, number];
  readonly directed: boolean;
} {
  kitPoint(props.from);
  kitPoint(props.to);
  if (
    !props.id ||
    ![
      'dependency',
      'membership',
      'approval',
      'transfer',
      'control',
      'eligibility',
      'correspondence',
    ].includes(props.role) ||
    (props.condition !== undefined && props.condition.length > 96)
  )
    throw new RangeError(
      'Typed relationships require an authored role and bounded source condition',
    );
  const difference = new Vector3(
    props.to[0] - props.from[0],
    props.to[1] - props.from[1],
    props.to[2] - props.from[2],
  );
  const length = difference.length();
  if (length === 0) throw new RangeError('Connector needs distinct authored endpoints');
  const rotation = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    difference.normalize(),
  );
  return {
    center: [
      (props.from[0] + props.to[0]) / 2,
      (props.from[1] + props.to[1]) / 2,
      (props.from[2] + props.to[2]) / 2,
    ],
    length,
    rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    directed: props.role !== 'membership' && props.role !== 'correspondence',
  };
}
export function TypedRelationshipSvg(props: TypedRelationshipProps): ReactElement {
  const segment = relationshipSegment(props);
  const angle =
    (Math.atan2(props.to[1] - props.from[1], props.to[0] - props.from[0]) * 180) / Math.PI;
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-relation-id={props.id}
      data-role={props.role}
    >
      <path
        d={`M${props.from[0]} ${props.from[1]}L${props.to[0]} ${props.to[1]}`}
        fill="none"
        stroke={props.colors.text}
        strokeWidth={3}
        strokeDasharray={
          props.state === 'unknown' || props.role === 'dependency' ? '5 4' : undefined
        }
      />
      {segment.directed && (
        <path
          d="M-10 -6L0 0L-10 6"
          transform={`translate(${props.to[0]} ${props.to[1]}) rotate(${angle})`}
          fill="none"
          stroke={props.colors.text}
          strokeWidth={3}
        />
      )}
      <KitText
        text={`${props.role}; ${props.state}`}
        colors={props.colors}
        x={segment.center[0]}
        y={segment.center[1] - 12}
      />
      {props.condition && (
        <KitText
          text={props.condition}
          colors={props.colors}
          x={segment.center[0]}
          y={segment.center[1] + 14}
        />
      )}
    </g>
  );
}
export function TypedRelationshipClay(props: TypedRelationshipProps): ReactElement {
  const segment = relationshipSegment(props);
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ relationId: props.id, role: props.role, state: props.state }}
    >
      <mesh position={segment.center} quaternion={segment.rotation}>
        <cylinderGeometry args={[0.022, 0.022, segment.length, 10]} />
        <Clay color={kitColor(props)} opacity={kitOpacity(props)} />
      </mesh>
      {segment.directed && (
        <mesh position={kitPoint(props.to)} quaternion={segment.rotation}>
          <coneGeometry args={[0.07, 0.14, 10]} />
          <Clay color={kitColor(props)} opacity={kitOpacity(props)} />
        </mesh>
      )}
    </group>
  );
}
export const RELATIONSHIP_ASSET_BUDGETS = {
  entity: { meshes: 3, svgElements: 8 },
  container: { meshes: 12, svgElements: 38 },
  approval: { meshes: 4, svgElements: 10 },
  relation: { meshes: 2, svgElements: 7 },
} as const;
