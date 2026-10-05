import type { CSSProperties, ReactElement } from 'react';
import { DiagramText } from '../../diagrams/primitives';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import type {
  ExpansionKitColors,
  ExpansionKitPlacement,
  ExpansionKitPose,
  ExpansionKitState,
} from '../scene-types';
import { EXPANSION_LIMITS, type ExpansionBasis, type ExpansionRational } from '../value-types';

export type PopulationCount =
  | { readonly state: 'known'; readonly value: ExpansionRational }
  | { readonly state: 'unknown' | 'missing' | 'disputed'; readonly qualifier: string };

/** IDs and membership come from validated source records, not generated people or labels. */
export interface PopulationMemberMark {
  readonly id: string;
  readonly membership: readonly string[];
  readonly state: ExpansionKitState;
  readonly represents: PopulationCount;
}
export interface PopulationAssetProps {
  readonly pose: ExpansionKitPose;
  readonly state: ExpansionKitState;
  readonly colors: ExpansionKitColors;
  /** SVG placement is in pixels; clay placement is in stage units. Both remain authored. */
  readonly placement: ExpansionKitPlacement;
}
export interface PopulationMarkProps extends PopulationAssetProps {
  readonly member: PopulationMemberMark;
}
export interface SamplingApertureProps extends PopulationAssetProps {
  /** Authored window, not a selection algorithm. The parent grounds membership in source. */
  readonly window: 'all' | 'first-half' | 'second-half';
  readonly membership: string;
}
export interface PopulationData {
  readonly marks: readonly PopulationMemberMark[];
  readonly representedPopulation: PopulationCount;
  /** Reference population, never substituted with the number of displayed marks. */
  readonly sourceDenominator: PopulationCount;
  readonly basis: ExpansionBasis;
  readonly aggregation:
    | { readonly kind: 'literal' }
    | { readonly kind: 'aggregate'; readonly qualifier: string };
}
export interface PopulationTrayProps extends PopulationAssetProps, PopulationData {
  readonly aperture: Pick<SamplingApertureProps, 'window' | 'membership'>;
}
export interface PopulationLegendProps extends PopulationAssetProps, PopulationData {}

const boundedText = (text: string, maximum = 96): string => {
  if (!text.trim() || text.length > maximum) throw new Error('Population text out of bounds');
  return text.replace(/\s+/g, ' ').trim();
};
const progress = (value: number): number => {
  if (!Number.isFinite(value)) throw new Error('Population pose must be finite');
  return Math.max(0, Math.min(1, value));
};
function validatePose(pose: ExpansionKitPose): void {
  for (const value of [pose.reveal, pose.action, pose.response, pose.check, pose.resolve])
    progress(value);
}
function countValue(count: PopulationCount): number | undefined {
  if (count.state !== 'known') {
    boundedText(count.qualifier);
    return undefined;
  }
  const { numerator, denominator } = count.value;
  // Population counts are exact integral rationals; fractional weights need a different kit.
  if (
    !Number.isSafeInteger(numerator) ||
    numerator < 0 ||
    numerator > EXPANSION_LIMITS.rationalComponent ||
    denominator !== 1
  )
    throw new Error('Population count must be a nonnegative exact integer');
  return numerator;
}
function countLabel(count: PopulationCount): string {
  const value = countValue(count);
  return value === undefined && count.state !== 'known'
    ? `${count.state}: ${boundedText(count.qualifier)}`
    : String(value);
}
function validateMember(member: PopulationMemberMark, state: ExpansionKitState): void {
  boundedText(member.id);
  if (member.state !== state) throw new Error('Mark state must match its source record');
  if (member.membership.length > 8 || new Set(member.membership).size !== member.membership.length)
    throw new Error('Population membership out of bounds');
  member.membership.forEach((id) => {
    boundedText(id);
  });
  const count = countValue(member.represents);
  if (count === 0) throw new Error('A zero count cannot create a population mark');
  if (
    count === undefined &&
    member.state !== (member.represents.state === 'disputed' ? 'disputed' : 'unknown')
  )
    throw new Error('Unmeasured groups must remain visibly qualified');
}
export function validatePopulation(data: PopulationData): void {
  if (data.marks.length > EXPANSION_LIMITS.populationMarks)
    throw new Error('At most 100 population marks');
  if (new Set(data.marks.map((mark) => mark.id)).size !== data.marks.length)
    throw new Error('Population IDs must be unique');
  if (data.basis.unit !== 'count') throw new Error('Population basis must be count');
  boundedText(data.basis.population, EXPANSION_LIMITS.population);
  boundedText(data.basis.period, EXPANSION_LIMITS.period);
  const total = countValue(data.representedPopulation);
  const denominator = countValue(data.sourceDenominator);
  if (total !== undefined && denominator !== undefined && total > denominator)
    throw new Error('Represented population exceeds its reference denominator');
  if (
    data.basis.denominator &&
    (data.sourceDenominator.state !== 'known' ||
      data.basis.denominator.numerator !== data.sourceDenominator.value.numerator ||
      data.basis.denominator.denominator !== data.sourceDenominator.value.denominator)
  )
    throw new Error('Basis and source denominator disagree');
  let sum = 0;
  let qualified = false;
  for (const member of data.marks) {
    validateMember(member, member.state);
    const value = countValue(member.represents);
    if (value === undefined) qualified = true;
    else sum += value;
    if (data.aggregation.kind === 'literal' && value !== 1)
      throw new Error('Literal marks must each represent one source member');
  }
  if (data.aggregation.kind === 'aggregate') boundedText(data.aggregation.qualifier);
  if (data.aggregation.kind === 'literal' && total !== data.marks.length)
    throw new Error('Nonliteral counts require an explicit aggregation legend');
  if (
    total !== undefined &&
    (sum > total || (!qualified && sum !== total) || (total === 0 && data.marks.length > 0))
  )
    throw new Error('Marks do not account for the represented population');
}

/** Sorting source IDs, never labels/state/pose, gives both modes identical stable grid slots. */
export function populationSlots(
  marks: readonly PopulationMemberMark[],
): readonly PopulationMemberMark[] {
  if (marks.length > 100 || new Set(marks.map((mark) => mark.id)).size !== marks.length)
    throw new Error('Population slots require at most 100 unique IDs');
  return [...marks].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
export function populationGridPosition(index: number): readonly [number, number, number] {
  if (!Number.isInteger(index) || index < 0 || index >= 100)
    throw new Error('Population slot out of bounds');
  return [((index % 10) - 4.5) * 0.48, (4.5 - Math.floor(index / 10)) * 0.48, 0.04];
}
function svgPlacement(placement: ExpansionKitPlacement): string {
  return `translate(${placement.position[0]} ${placement.position[1]}) scale(${placement.scale ?? 1})`;
}
const statePaths: Record<ExpansionKitState, string> = {
  retained: 'M-9 0-2 7 10-8',
  active: 'M-8-4H8M-8 4H8',
  excluded: 'M-8-8 8 8M-8 8 8-8',
  unknown: 'M-7-7Q0-16 7-7Q10-2 0 3V6M0 10v2',
  disputed: 'M-7 5 0-8M0 8 7-5',
};
function markColor(state: ExpansionKitState, colors: ExpansionKitColors): string {
  return state === 'active' || state === 'disputed'
    ? colors.accent
    : state === 'retained'
      ? colors.text
      : colors.muted;
}
export function PopulationMarkSvg(props: PopulationMarkProps): ReactElement {
  const { member, state, colors, pose, placement } = props;
  validatePose(pose);
  validateMember(member, state);
  return (
    <g
      transform={svgPlacement(placement)}
      opacity={progress(pose.reveal)}
      data-member-id={member.id}
      data-membership={JSON.stringify(member.membership)}
      data-state={state}
    >
      <title>{`${member.id}: ${countLabel(member.represents)}; ${state}`}</title>
      <circle r={18} fill={colors.surface} stroke={markColor(state, colors)} strokeWidth={3} />
      <path
        d={statePaths[state]}
        fill="none"
        stroke={markColor(state, colors)}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </g>
  );
}

/** Two authored bars per badge, even at opacity zero; no uncounted/instanced objects. */
export function PopulationMarkClay(props: PopulationMarkProps): ReactElement {
  const { member, state, colors, pose, placement } = props;
  validatePose(pose);
  validateMember(member, state);
  const opacity = progress(pose.reveal);
  const color = markColor(state, colors);
  const angle =
    state === 'excluded'
      ? Math.PI / 4
      : state === 'retained'
        ? -Math.PI / 4
        : state === 'disputed'
          ? Math.PI / 3
          : 0;
  return (
    <group
      name={member.id}
      userData={{
        memberId: member.id,
        membership: member.membership,
        state,
        represents: member.represents,
      }}
      position={[...placement.position]}
      scale={placement.scale ?? 1}
    >
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.06, 16]} />
        <Clay color={colors.surface} opacity={opacity} />
      </mesh>
      <ClayBlock
        size={state === 'unknown' ? [0.025, 0.12, 0.025] : [0.18, 0.025, 0.025]}
        position={[-0.045, state === 'unknown' ? 0.03 : 0.025, 0.045]}
        rotation={[0, 0, angle]}
        color={color}
        opacity={opacity}
        radius={0.01}
      />
      <ClayBlock
        size={state === 'unknown' ? [0.025, 0.025, 0.025] : [0.18, 0.025, 0.025]}
        position={[state === 'unknown' ? -0.045 : 0.045, -0.045, 0.045]}
        rotation={[0, 0, state === 'retained' || state === 'excluded' ? -angle : angle]}
        color={color}
        opacity={opacity}
        radius={0.01}
      />
    </group>
  );
}
function apertureBounds(props: SamplingApertureProps): readonly [number, number] {
  boundedText(props.membership);
  return props.window === 'all' ? [0, 5] : props.window === 'first-half' ? [1.2, 2.5] : [-1.2, 2.5];
}
export function SamplingApertureSvg(props: SamplingApertureProps): ReactElement {
  validatePose(props.pose);
  const [center, height] = apertureBounds(props);
  const gap = 4 * (1 - progress(props.pose.action));
  return (
    <g
      transform={svgPlacement(props.placement)}
      opacity={progress(props.pose.reveal)}
      data-sample-membership={props.membership}
      data-state={props.state}
    >
      <path
        d={`M${-250 - gap} ${-center * 100 - height * 50 - gap}h${500 + 2 * gap}v${height * 100 + 2 * gap}h${-500 - 2 * gap}Z`}
        fill="none"
        stroke={markColor(props.state, props.colors)}
        strokeWidth={3 + progress(props.pose.check)}
        strokeDasharray={
          props.state === 'unknown' || props.state === 'disputed' ? '8 6' : undefined
        }
      />
    </g>
  );
}
export function SamplingApertureClay(props: SamplingApertureProps): ReactElement {
  validatePose(props.pose);
  const [center, height] = apertureBounds(props);
  const gap = 0.04 * (1 - progress(props.pose.action));
  const color = markColor(props.state, props.colors);
  const opacity = progress(props.pose.reveal);
  return (
    <group
      position={[...props.placement.position]}
      scale={props.placement.scale ?? 1}
      userData={{ membership: props.membership, state: props.state }}
    >
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          <ClayBlock
            size={[5 + 2 * gap, 0.035, 0.035]}
            position={[0, center + side * (height / 2 + gap), 0.16]}
            color={color}
            opacity={opacity}
          />
          <ClayBlock
            size={[0.035, height + 2 * gap, 0.035]}
            position={[side * (2.5 + gap), center, 0.16]}
            color={color}
            opacity={opacity}
          />
        </group>
      ))}
    </group>
  );
}

/** Always planar, including the clay route. DiagramText supplies the project typography. */
export function PopulationLegendSvg(props: PopulationLegendProps): ReactElement {
  validatePose(props.pose);
  validatePopulation(props);
  const qualified = props.marks.some((mark) => mark.represents.state !== 'known');
  const lines = [
    `Population: ${countLabel(props.representedPopulation)}; reference denominator: ${countLabel(props.sourceDenominator)}`,
    `${props.marks.length} displayed ${props.aggregation.kind === 'literal' ? 'source members' : `aggregate groups; ${boundedText(props.aggregation.qualifier)}`}${qualified ? '; includes unmeasured groups' : ''}`,
    `${boundedText(props.basis.population, 40)} · ${boundedText(props.basis.period, 32)} · count`,
  ];
  return (
    <g
      data-population-legend=""
      data-state={props.state}
      transform={svgPlacement(props.placement)}
      opacity={progress(props.pose.reveal)}
      style={{ '--population-ink': props.colors.text } as CSSProperties}
    >
      <style>{'[data-population-legend] text { fill: var(--population-ink); }'}</style>
      {lines.map((line, index) => (
        <DiagramText key={index} x={-250} y={index * 30} size={20} columns={256} anchor="start">
          {line}
        </DiagramText>
      ))}
    </g>
  );
}
export function PopulationTraySvg(props: PopulationTrayProps): ReactElement {
  validatePose(props.pose);
  validatePopulation(props);
  return (
    <g
      transform={svgPlacement(props.placement)}
      data-population-count={countLabel(props.representedPopulation)}
    >
      <rect
        x={-254}
        y={-254}
        width={508}
        height={508}
        rx={12}
        fill={props.colors.surface}
        stroke={props.colors.muted}
        strokeWidth={2}
        opacity={progress(props.pose.reveal)}
      />
      {populationSlots(props.marks).map((member, index) => {
        const [x, y] = populationGridPosition(index);
        return (
          <PopulationMarkSvg
            key={member.id}
            {...props}
            member={member}
            state={member.state}
            placement={{ position: [x * 100, -y * 100, 0] }}
          />
        );
      })}
      <SamplingApertureSvg {...props} {...props.aperture} placement={{ position: [0, 0, 0] }} />
      <PopulationLegendSvg {...props} placement={{ position: [0, 300, 0] }} />
    </g>
  );
}
/** The parent MUST pair this clay asset with PopulationLegendSvg; labels are never perspective-scaled. */
export function PopulationTrayClay(props: PopulationTrayProps): ReactElement {
  validatePose(props.pose);
  validatePopulation(props);
  const opacity = progress(props.pose.reveal);
  return (
    <group
      position={[...props.placement.position]}
      scale={props.placement.scale ?? 1}
      userData={{
        representedPopulation: props.representedPopulation,
        sourceDenominator: props.sourceDenominator,
        displayedMarks: props.marks.length,
        aggregation: props.aggregation,
        basis: props.basis,
      }}
    >
      <ClayBlock
        size={[5.08, 5.08, 0.08]}
        position={[0, 0, -0.05]}
        color={props.colors.surface}
        opacity={opacity}
      />
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          <ClayBlock
            size={[5.08, 0.06, 0.1]}
            position={[0, side * 2.54, 0]}
            color={props.colors.muted}
            opacity={opacity}
          />
          <ClayBlock
            size={[0.06, 5.08, 0.1]}
            position={[side * 2.54, 0, 0]}
            color={props.colors.muted}
            opacity={opacity}
          />
        </group>
      ))}
      {populationSlots(props.marks).map((member, index) => (
        <PopulationMarkClay
          key={member.id}
          {...props}
          member={member}
          state={member.state}
          placement={{ position: populationGridPosition(index) }}
        />
      ))}
      <SamplingApertureClay {...props} {...props.aperture} placement={{ position: [0, 0, 0] }} />
    </group>
  );
}

/** Counts all mounted geometry, including opacity-zero marks, badges, rims and aperture. */
export function populationBudget(marks: number = EXPANSION_LIMITS.populationMarks) {
  if (!Number.isInteger(marks) || marks < 0 || marks > 100)
    throw new Error('Population budget out of bounds');
  return {
    markMeshes: 3,
    apertureMeshes: 4,
    trayMeshes: 5,
    clayMeshes: 5 + 3 * marks + 4,
    // SVG nodes include g/title/style/text/tspan, not just visible shapes. Each label is one line.
    svgElements: 2 + 4 * marks + 2 + 8,
    svgShapes: 1 + 2 * marks + 1,
    planarLegendElements: 8,
    webglStages: 0,
    instancedMeshes: 0,
    skinnedMeshes: 0,
    primitiveObjects: 0,
  } as const;
}
export const POPULATION_MAX_BUDGET = populationBudget();
