import type { ReactElement, ReactNode } from 'react';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { UI_FONT } from '../../stage';
import type {
  ExpansionKitColors,
  ExpansionKitPlacement,
  ExpansionKitPose,
  ExpansionKitState,
} from '../scene-types';

/** Authored placements only. Precision text stays in the SVG companion in hybrid mode. */
export interface EvidenceAssetProps {
  readonly id: string;
  readonly pose: ExpansionKitPose;
  readonly state: ExpansionKitState;
  readonly colors: ExpansionKitColors;
  readonly placement: ExpansionKitPlacement;
}
export interface EvidenceDocumentProps extends EvidenceAssetProps {
  readonly label: string;
  readonly source: string;
}
export interface ClaimPlaqueProps extends EvidenceAssetProps {
  readonly claim: string;
}
export interface ScopeTabProps extends EvidenceAssetProps {
  readonly scope: string;
  readonly version: string;
}
export type EvidenceLinkRole = 'support' | 'rebuttal' | 'provenance';
export interface EvidenceLinkProps extends EvidenceAssetProps {
  readonly role: EvidenceLinkRole;
  /** Local authored SVG points; clay uses the same points divided by 120. */
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
}
export interface MissingEvidenceSlotProps extends EvidenceAssetProps {
  readonly label: string;
}

const finite = (value: number, low: number, high: number): number =>
  Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : low;
const unit = (value: number): number => finite(value, 0, 1);
const label = (value: string, cap = 22): string => {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= cap ? clean : `${clean.slice(0, cap - 1)}…`;
};
const STATE_TEXT: Record<ExpansionKitState, string> = {
  retained: 'Retained',
  active: 'Active',
  excluded: 'Excluded',
  unknown: 'Unknown',
  disputed: 'Disputed',
};
const STATE_PATH: Record<ExpansionKitState, string> = {
  retained: 'M-7 0l5 5 9-11',
  active: 'M0-7 7 0 0 7-7 0Z',
  excluded: 'M-6-6 6 6M6-6-6 6',
  unknown: 'M-5-4a5 5 0 0 1 10 0c0 4-5 3-5 7M0 6v1',
  disputed: 'M-6-5v10M6-5v10',
};
function Text({
  children,
  y,
  colors,
  size = 13,
}: {
  children: string;
  y: number;
  colors: ExpansionKitColors;
  size?: number;
}): ReactElement {
  const value = label(children);
  return (
    <text
      x={0}
      y={y}
      fill={colors.text}
      fontFamily={UI_FONT}
      fontSize={size}
      textLength={Math.min(128, value.length * size * 0.65)}
      lengthAdjust="spacingAndGlyphs"
      fontWeight={550}
      textAnchor="middle"
    >
      {value}
    </text>
  );
}
function StateSvg({ state, colors }: Pick<EvidenceAssetProps, 'state' | 'colors'>): ReactElement {
  return (
    <g transform="translate(-30 0)" data-state={state}>
      <path
        d={STATE_PATH[state]}
        fill={state === 'active' ? colors.accent : 'none'}
        stroke={colors.text}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <text x={13} y={4} fill={colors.text} fontFamily={UI_FONT} fontSize={10}>
        {STATE_TEXT[state]}
      </text>
    </g>
  );
}
function StateClay({ state, colors }: Pick<EvidenceAssetProps, 'state' | 'colors'>): ReactElement {
  // Unknown has a hooked question mark plus a separate dot, never an elimination cross.
  const bars: readonly (readonly [number, number, number])[] =
    state === 'unknown'
      ? [
          [-0.06, 0.1, 0.7],
          [0.04, 0.13, -0.5],
          [0.09, 0.03, 0.4],
          [0, -0.04, 0.7],
        ]
      : state === 'excluded'
        ? [
            [0, 0, 0.78],
            [0, 0, -0.78],
          ]
        : state === 'retained'
          ? [
              [-0.06, -0.02, -0.7],
              [0.045, 0.015, 0.6],
            ]
          : state === 'disputed'
            ? [
                [-0.07, 0, 0],
                [0.07, 0, 0],
              ]
            : [];
  return (
    <group name={STATE_TEXT[state]}>
      {bars.map(([x, y, rotation], index) => (
        <ClayBlock
          key={index}
          size={[0.035, 0.2, 0.035]}
          position={[x, y, 0]}
          rotation={[0, 0, rotation]}
          color={colors.text}
          radius={0.01}
        />
      ))}
      {state === 'unknown' && (
        <mesh position={[0, -0.2, 0]}>
          <sphereGeometry args={[0.035, 8, 6]} />
          <Clay color={colors.text} />
        </mesh>
      )}
      {state === 'active' && (
        <mesh rotation={[Math.PI / 2, 0, Math.PI / 4]}>
          <cylinderGeometry args={[0.14, 0.14, 0.04, 4]} />
          <Clay color={colors.accent} />
        </mesh>
      )}
    </group>
  );
}
function SvgRoot({
  props,
  children,
}: {
  props: EvidenceAssetProps;
  children: ReactNode;
}): ReactElement {
  const { placement, pose } = props;
  const x = finite(placement.position[0], -4096, 4096);
  const y = finite(placement.position[1], -4096, 4096);
  return (
    <g
      data-evidence-id={props.id}
      data-state={props.state}
      opacity={unit(pose.reveal)}
      transform={`translate(${x} ${y}) scale(${finite(placement.scale ?? 1, 0.01, 8)})`}
    >
      {children}
    </g>
  );
}
function ClayRoot({
  props,
  children,
}: {
  props: EvidenceAssetProps;
  children: ReactNode;
}): ReactElement {
  const { placement, pose } = props;
  return (
    <group
      name={props.id}
      visible={unit(pose.reveal) > 0}
      position={[
        finite(placement.position[0], -32, 32),
        finite(placement.position[1], -32, 32),
        finite(placement.position[2], -32, 32),
      ]}
      scale={finite(placement.scale ?? 1, 0.01, 8) * (0.85 + 0.15 * unit(pose.reveal))}
    >
      {children}
    </group>
  );
}

/** A folded source sheet, not a claim or a verdict. Local SVG bounds: 160 × 152. */
export function EvidenceDocumentSvg(props: EvidenceDocumentProps): ReactElement {
  const { colors } = props;
  return (
    <SvgRoot props={props}>
      <path
        d="M-72-72H43L72-43V72H-72Z"
        fill={colors.surface}
        stroke={colors.text}
        strokeWidth={2}
      />
      <path d="M43-72v29h29" fill="none" stroke={colors.muted} strokeWidth={2} />
      <path d="M-58 20H48M-58 30H30" stroke={colors.muted} strokeWidth={2} />
      <Text y={-26} colors={colors}>
        {props.label}
      </Text>
      <Text y={0} colors={colors} size={11}>
        {props.source}
      </Text>
      <g transform="translate(0 53)">
        <StateSvg {...props} />
      </g>
    </SvgRoot>
  );
}
export function EvidenceDocumentClay(props: EvidenceDocumentProps): ReactElement {
  const { colors, pose } = props;
  return (
    <ClayRoot props={props}>
      <group rotation={[0, -0.12 * unit(pose.action), 0]}>
        <ClayBlock size={[0.98, 0.96, 0.055]} position={[0, -0.15, 0]} color={colors.surface} />
        <ClayBlock size={[0.73, 0.3, 0.055]} position={[-0.125, 0.47, 0]} color={colors.surface} />
        <mesh position={[0.27, 0.47, 0.02]} rotation={[Math.PI / 2, 0, Math.PI / 6]}>
          <cylinderGeometry args={[0.21, 0.21, 0.045, 3]} />
          <Clay color={colors.muted} />
        </mesh>
        <ClayBlock
          size={[0.055, 0.85, 0.025]}
          position={[-0.39, -0.03, 0.04]}
          color={colors.accent}
        />
        {[0.23, 0.04, -0.15].map((y) => (
          <ClayBlock
            key={y}
            size={[0.5, 0.035, 0.025]}
            position={[0.015, y, 0.045]}
            color={colors.text}
          />
        ))}
        <group position={[0, -0.43, 0.07]} scale={0.65}>
          <StateClay {...props} />
        </group>
      </group>
    </ClayRoot>
  );
}

/** Quotation notches and two feet distinguish the assertion plaque from its sources. */
export function ClaimPlaqueSvg(props: ClaimPlaqueProps): ReactElement {
  return (
    <SvgRoot props={props}>
      <rect
        x={-88}
        y={-43}
        width={176}
        height={86}
        rx={6}
        fill={props.colors.surface}
        stroke={props.colors.text}
        strokeWidth={2}
      />
      <path d="M-72-29h6v8h-6Zm12 0h6v8h-6Z" fill={props.colors.accent} />
      <Text y={0} colors={props.colors}>
        {props.claim}
      </Text>
      <g transform="translate(0 25)">
        <StateSvg {...props} />
      </g>
    </SvgRoot>
  );
}
export function ClaimPlaqueClay(props: ClaimPlaqueProps): ReactElement {
  const { colors } = props;
  return (
    <ClayRoot props={props}>
      <ClayBlock size={[1.55, 0.7, 0.12]} color={colors.surface} />
      {[-0.5, 0.5].map((x) => (
        <ClayBlock key={x} size={[0.2, 0.16, 0.45]} position={[x, -0.43, 0]} color={colors.muted} />
      ))}
      {[-0.57, -0.42].map((x) => (
        <ClayBlock
          key={x}
          size={[0.08, 0.14, 0.045]}
          position={[x, 0.18, 0.09]}
          color={colors.accent}
        />
      ))}
      <group position={[0.35, 0, 0.09]} scale={0.8}>
        <StateClay {...props} />
      </group>
    </ClayRoot>
  );
}

/** Scope/version are bounded source values, not geometry or animation-second inputs. */
export function ScopeTabSvg(props: ScopeTabProps): ReactElement {
  return (
    <SvgRoot props={props}>
      <path
        d="M-80-34h95l12 12h53v62H-80Z"
        fill={props.colors.surface}
        stroke={props.colors.text}
        strokeWidth={2}
      />
      <Text y={-13} colors={props.colors} size={11}>{`Scope: ${label(props.scope, 14)}`}</Text>
      <Text y={4} colors={props.colors} size={11}>{`Version: ${label(props.version, 12)}`}</Text>
      <g transform="translate(0 26)">
        <StateSvg {...props} />
      </g>
    </SvgRoot>
  );
}
export function ScopeTabClay(props: ScopeTabProps): ReactElement {
  return (
    <ClayRoot props={props}>
      <ClayBlock size={[1.3, 0.43, 0.07]} color={props.colors.surface} />
      <ClayBlock size={[0.65, 0.16, 0.07]} position={[-0.3, 0.27, 0]} color={props.colors.accent} />
      <ClayBlock
        size={[0.026, 0.32, 0.025]}
        position={[-0.1, 0, 0.05]}
        color={props.colors.muted}
      />
      <group position={[0.32, 0, 0.06]} scale={0.55}>
        <StateClay {...props} />
      </group>
    </ClayRoot>
  );
}

function linkGeometry(props: EvidenceLinkProps) {
  const x = finite(props.from[0], -240, 240);
  const y = finite(props.from[1], -240, 240);
  const tx = finite(props.to[0], -240, 240);
  const ty = finite(props.to[1], -240, 240);
  const progress = unit(props.pose.action);
  const dx = (tx - x) * progress;
  const dy = (ty - y) * progress;
  return {
    x,
    y,
    endX: x + dx,
    endY: y + dy,
    length: Math.hypot(dx, dy),
    angle: Math.atan2(dy, dx),
  };
}
const ROLE_TEXT: Record<EvidenceLinkRole, string> = {
  support: 'Support',
  rebuttal: 'Rebuttal',
  provenance: 'Provenance',
};
/** No generic arrow: support check, rebuttal stop-bar, provenance chain-ring/dashes. */
export function EvidenceLinkSvg(props: EvidenceLinkProps): ReactElement {
  const { x, y, endX, endY, angle } = linkGeometry(props);
  const terminal =
    props.role === 'support'
      ? 'M-7 0l5 5 10-12'
      : props.role === 'rebuttal'
        ? 'M0-10v20M-8 0H0'
        : 'M-7 0a7 7 0 1 0 14 0 7 7 0 1 0-14 0';
  return (
    <SvgRoot props={props}>
      <path
        d={`M${x} ${y}L${endX} ${endY}`}
        fill="none"
        stroke={props.colors.text}
        strokeWidth={3}
        strokeDasharray={props.role === 'provenance' ? '8 6' : undefined}
      />
      <path
        d={terminal}
        transform={`translate(${endX} ${endY}) rotate(${(angle * 180) / Math.PI})`}
        fill="none"
        stroke={props.colors.text}
        strokeWidth={3}
      />
      <circle
        cx={x}
        cy={y}
        r={5}
        fill={props.colors.surface}
        stroke={props.colors.text}
        strokeWidth={2}
      />
      <g transform={`translate(${(x + endX) / 2} ${(y + endY) / 2})`}>
        <Text y={-18} colors={props.colors} size={11}>
          {ROLE_TEXT[props.role]}
        </Text>
        <g transform="translate(0 22)">
          <StateSvg {...props} />
        </g>
      </g>
    </SvgRoot>
  );
}
function Rail({ length, colors }: { length: number; colors: ExpansionKitColors }): ReactElement {
  return (
    <mesh rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.018, 0.018, Math.max(0.001, length), 8]} />
      <Clay color={colors.text} />
    </mesh>
  );
}
export function EvidenceLinkClay(props: EvidenceLinkProps): ReactElement {
  const g = linkGeometry(props);
  const length = g.length / 120;
  const segments = props.role === 'provenance' ? 3 : 1;
  return (
    <ClayRoot props={props}>
      <group position={[g.x / 120, g.y / 120, 0]} rotation={[0, 0, g.angle]}>
        {Array.from({ length: segments }, (_, i) => (
          <group key={i} position={[((i + 0.5) * length) / segments, 0, 0]}>
            <Rail
              length={(length / segments) * (segments === 1 ? 1 : 0.65)}
              colors={props.colors}
            />
          </group>
        ))}
        <mesh>
          <sphereGeometry args={[0.04, 8, 6]} />
          <Clay color={props.colors.surface} />
        </mesh>
        <group position={[length, 0, 0]}>
          {props.role === 'provenance' ? (
            <mesh>
              <torusGeometry args={[0.075, 0.018, 6, 12]} />
              <Clay color={props.colors.text} />
            </mesh>
          ) : props.role === 'rebuttal' ? (
            <ClayBlock size={[0.035, 0.23, 0.035]} color={props.colors.text} />
          ) : (
            <group rotation={[0, 0, -0.2]}>
              <ClayBlock
                size={[0.035, 0.14, 0.035]}
                rotation={[0, 0, 0.7]}
                color={props.colors.text}
              />
              <ClayBlock
                size={[0.035, 0.22, 0.035]}
                position={[0.075, 0.04, 0]}
                rotation={[0, 0, -0.6]}
                color={props.colors.text}
              />
            </group>
          )}
        </group>
      </group>
      <group position={[(g.x + g.endX) / 240, (g.y + g.endY) / 240 - 0.26, 0]} scale={0.6}>
        <StateClay {...props} />
      </group>
    </ClayRoot>
  );
}

/** An empty outlined cradle is missing evidence, not a false claim or rejected option. */
export function MissingEvidenceSlotSvg(props: MissingEvidenceSlotProps): ReactElement {
  return (
    <SvgRoot props={props}>
      <rect
        x={-82}
        y={-49}
        width={164}
        height={98}
        rx={4}
        fill="none"
        stroke={props.colors.muted}
        strokeWidth={2}
        strokeDasharray="6 5"
      />
      <path d="M-76-28v-15h15M61 43h15V28" fill="none" stroke={props.colors.text} strokeWidth={3} />
      <Text y={-16} colors={props.colors}>
        {props.label}
      </Text>
      <Text y={4} colors={props.colors} size={11}>
        Missing (not false)
      </Text>
      <g transform="translate(0 29)">
        <StateSvg {...props} />
      </g>
    </SvgRoot>
  );
}
export function MissingEvidenceSlotClay(props: MissingEvidenceSlotProps): ReactElement {
  return (
    <ClayRoot props={props}>
      <ClayBlock size={[1.25, 0.06, 0.9]} position={[0, -0.23, 0]} color={props.colors.surface} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <ClayBlock
            size={[0.07, 0.18, 0.82]}
            position={[side * 0.58, -0.11, 0]}
            color={props.colors.muted}
          />
          <ClayBlock
            size={[0.7, 0.18, 0.07]}
            position={[0, -0.11, side * 0.4]}
            color={props.colors.muted}
          />
        </group>
      ))}
      <group position={[0, 0.15, -0.38]} scale={0.65}>
        <StateClay {...props} />
      </group>
    </ClayRoot>
  );
}

/** Source ceilings, not GPU/draw-call measurements. SVG includes ALL intrinsic <g>/text/path/etc.
 * StateClay worst case = four ClayBlocks + one dot = 5 meshes; StateSvg = g/path/text = 3.
 * Every reused ClayBlock contributes its actual one mesh. Hidden geometry is included.
 * No instancedMesh, skinnedMesh, primitive, Canvas, studio or in-clay precision labels.
 */
export const EVIDENCE_SOURCE_BUDGETS = {
  document: { meshes: 7 + 5, svgElements: 1 + 3 + 2 + 1 + 3 },
  claimPlaque: { meshes: 5 + 5, svgElements: 1 + 2 + 1 + 1 + 3 },
  scopeTab: { meshes: 3 + 5, svgElements: 1 + 1 + 2 + 1 + 3 },
  link: { meshes: 3 + 1 + 1 + 5, svgElements: 1 + 3 + 1 + 1 + 1 + 3 },
  missingSlot: { meshes: 5 + 5, svgElements: 1 + 2 + 2 + 1 + 3 },
} as const;
/** Caller-enforced envelope: 8 claim actors, 12 (document OR missing slot)+tab records, 16 links.
 * Excludes caller stage/caption/speaker geometry; SVG companions must remain mounted in hybrid.
 */
export const EVIDENCE_CAP_BUDGET = {
  actors: 8,
  records: 12,
  relations: 16,
  meshes: 8 * 10 + 12 * (12 + 8) + 16 * 10,
  svgElements: 8 * 8 + 12 * (10 + 8) + 16 * 10,
} as const;
