import type { ReactElement } from 'react';
import { ClayBlock } from '../../explanation-kit';
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

export type RequirementResult = 'pass' | 'fail' | 'unknown' | 'not-stated';
export interface RequirementRecord {
  readonly id: string;
  readonly label: string;
  readonly result: RequirementResult;
  readonly priority?: string;
}
export interface ConstraintCandidateProps extends KitAssetProps {
  readonly id: string;
  readonly label: string;
  readonly requirements: readonly RequirementRecord[];
}
export interface RequirementGateProps extends KitAssetProps {
  readonly requirement: RequirementRecord;
}
export interface RetainedChoiceProps extends KitAssetProps {
  readonly id: string;
  readonly label: string;
  readonly disposition: 'eligible' | 'ineligible' | 'unresolved';
}

/** Passing stated requirements is eligibility, never an invented universal winner. */
export function candidateDisposition(
  requirements: readonly RequirementRecord[],
): RetainedChoiceProps['disposition'] {
  if (requirements.length < 1 || requirements.length > 8)
    throw new RangeError('A candidate needs one to eight stated requirements');
  const seen = new Set<string>();
  for (const requirement of requirements) {
    if (
      !requirement.id ||
      seen.has(requirement.id) ||
      !requirement.label ||
      requirement.label.length > 28 ||
      !['pass', 'fail', 'unknown', 'not-stated'].includes(requirement.result) ||
      (requirement.priority !== undefined && requirement.priority.length > 28)
    )
      throw new RangeError(
        'Requirements need unique identities, bounded labels and explicit results',
      );
    seen.add(requirement.id);
  }
  if (requirements.some((requirement) => requirement.result === 'fail')) return 'ineligible';
  if (requirements.some((requirement) => requirement.result !== 'pass')) return 'unresolved';
  return 'eligible';
}
function candidateLabel(id: string, label: string): void {
  if (!id || id.length > 96 || !label.trim() || label.length > 28)
    throw new RangeError('Choice requires a stable identity and bounded source label');
}
function resultGlyph(result: RequirementResult): string {
  return result === 'pass' ? '✓' : result === 'fail' ? '×' : result === 'unknown' ? '?' : '…';
}
export function ConstraintCandidateSvg(props: ConstraintCandidateProps): ReactElement {
  candidateLabel(props.id, props.label);
  const disposition = candidateDisposition(props.requirements);
  const slide = disposition === 'ineligible' ? kitUnit(props.pose.response) * 24 : 0;
  return (
    <g
      transform={`${kitTransform(props)} translate(0 ${slide})`}
      opacity={kitOpacity(props)}
      data-candidate-id={props.id}
      data-disposition={disposition}
    >
      <path
        d="M0 12L12 0H168L180 12V120H0Z"
        fill={props.colors.surface}
        stroke={props.colors.text}
        strokeWidth={2}
      />
      <KitText text={props.label} colors={props.colors} x={12} y={25} />
      {props.requirements.map((requirement, index) => (
        <g
          key={requirement.id}
          data-requirement-id={requirement.id}
          data-result={requirement.result}
          transform={`translate(${14 + (index % 4) * 42} ${48 + Math.floor(index / 4) * 22})`}
        >
          <rect
            width={28}
            height={18}
            fill="none"
            stroke={props.colors.text}
            strokeDasharray={
              requirement.result === 'unknown' || requirement.result === 'not-stated'
                ? '3 2'
                : undefined
            }
          />
          <KitText text={resultGlyph(requirement.result)} colors={props.colors} x={8} y={14} />
        </g>
      ))}
      <KitText text={disposition} colors={props.colors} x={12} y={106} />
      {disposition === 'ineligible' && (
        <path d="M8 112L172 8" stroke={props.colors.text} strokeWidth={3} />
      )}
    </g>
  );
}
export function ConstraintCandidateClay(props: ConstraintCandidateProps): ReactElement {
  candidateLabel(props.id, props.label);
  const disposition = candidateDisposition(props.requirements);
  const rejected = disposition === 'ineligible';
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ candidateId: props.id, disposition }}
    >
      <ClayBlock
        size={[1.2, 0.78, 0.12]}
        color={props.colors.surface}
        opacity={kitOpacity(props)}
      />
      {props.requirements.map((requirement, index) => (
        <ClayBlock
          key={requirement.id}
          size={[0.16, 0.1, 0.025]}
          position={[-0.4 + (index % 4) * 0.26, 0.1 - Math.floor(index / 4) * 0.2, 0.08]}
          color={requirement.result === 'pass' ? props.colors.accent : props.colors.muted}
          opacity={kitOpacity(props)}
        />
      ))}
      <ClayBlock
        size={[0.85, 0.055, 0.025]}
        position={[0, -0.27, 0.08]}
        color={kitColor(props)}
        opacity={kitOpacity(props)}
      />
      {rejected && (
        <ClayBlock
          size={[1.05, 0.05, 0.03]}
          rotation={[0, 0, Math.PI / 6]}
          position={[0, 0, 0.1]}
          color={props.colors.text}
          opacity={kitOpacity(props)}
        />
      )}
    </group>
  );
}
export function RequirementGateSvg(props: RequirementGateProps): ReactElement {
  candidateDisposition([props.requirement]);
  const open = props.requirement.result === 'pass' ? kitUnit(props.pose.action) : 0;
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-requirement-id={props.requirement.id}
      data-result={props.requirement.result}
    >
      <path
        d="M0 110V0H180V110M-8 110H188"
        fill="none"
        stroke={props.colors.text}
        strokeWidth={5}
      />
      <rect
        x={6}
        y={12 - open * 65}
        width={168}
        height={50}
        fill={props.colors.surface}
        stroke={kitColor(props)}
        strokeWidth={4}
        strokeDasharray={
          props.requirement.result === 'unknown' || props.requirement.result === 'not-stated'
            ? '5 4'
            : undefined
        }
      />
      <KitText text={props.requirement.label} colors={props.colors} x={14} y={32 - open * 65} />
      <KitText
        text={`${resultGlyph(props.requirement.result)} ${props.requirement.result}`}
        colors={props.colors}
        x={14}
        y={52 - open * 65}
      />
      {props.requirement.priority && (
        <KitText text={props.requirement.priority} colors={props.colors} x={8} y={132} />
      )}
    </g>
  );
}
export function RequirementGateClay(props: RequirementGateProps): ReactElement {
  candidateDisposition([props.requirement]);
  const open = props.requirement.result === 'pass' ? kitUnit(props.pose.action) : 0;
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ requirementId: props.requirement.id, result: props.requirement.result }}
    >
      <ClayBlock size={[0.12, 1.2, 0.2]} position={[-0.62, 0, 0]} color={props.colors.muted} />
      <ClayBlock size={[0.12, 1.2, 0.2]} position={[0.62, 0, 0]} color={props.colors.muted} />
      <ClayBlock size={[1.36, 0.12, 0.2]} position={[0, 0.6, 0]} color={props.colors.muted} />
      <ClayBlock
        size={[1.1, 0.36, 0.1]}
        position={[0, 0.1 + open * 0.45, 0]}
        color={props.colors.surface}
        opacity={kitOpacity(props)}
      />
      <ClayBlock size={[1.4, 0.1, 0.5]} position={[0, -0.64, 0]} color={kitColor(props)} />
    </group>
  );
}
export function RetainedChoiceSvg(props: RetainedChoiceProps): ReactElement {
  candidateLabel(props.id, props.label);
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-choice-id={props.id}
      data-disposition={props.disposition}
    >
      <path
        d="M0 0V58H180V0M0 42H180"
        fill={props.colors.surface}
        stroke={props.colors.text}
        strokeWidth={3}
        strokeDasharray={props.disposition === 'unresolved' ? '5 4' : undefined}
      />
      <KitText text={props.label} colors={props.colors} x={12} y={24} />
      <KitText text={props.disposition} colors={props.colors} x={12} y={53} />
      {props.disposition === 'ineligible' && (
        <path d="M8 8L172 50M8 50L172 8" stroke={props.colors.text} strokeWidth={3} />
      )}
    </g>
  );
}
export function RetainedChoiceClay(props: RetainedChoiceProps): ReactElement {
  candidateLabel(props.id, props.label);
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ choiceId: props.id, disposition: props.disposition }}
    >
      <ClayBlock size={[1.2, 0.08, 0.65]} position={[0, -0.15, 0]} color={props.colors.surface} />
      <ClayBlock size={[0.08, 0.3, 0.65]} position={[-0.6, 0, 0]} color={props.colors.muted} />
      <ClayBlock size={[0.08, 0.3, 0.65]} position={[0.6, 0, 0]} color={props.colors.muted} />
      <ClayBlock
        size={[0.75, 0.06, 0.42]}
        position={[0, -0.05, 0]}
        color={kitColor(props)}
        opacity={kitOpacity(props)}
      />
    </group>
  );
}

/** Hosts include groups/text/tspans; meshes include retained/excluded hidden solids. */
export const CONSTRAINT_ASSET_BUDGETS = {
  candidate: { meshes: 11, svgElements: 39 },
  requirement: { meshes: 5, svgElements: 9 },
  retained: { meshes: 4, svgElements: 7 },
} as const;
