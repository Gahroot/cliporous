import type React from 'react';
import { DiagramText } from '../diagrams/primitives';
import { useStage } from '../stage';
import type { HandshakeState, PriorityTier } from './motion';
import type { BusinessEvidence } from './types';

const EVIDENCE_LABELS = {
  'source-stated': 'Source-stated',
  illustrative: 'Illustrative',
  unknown: 'Unknown',
  scenario: 'Scenario',
} as const;

/** Reserve the lower diagram rail for a text (not color-only) evidence distinction. */
export function BusinessEvidenceNote({
  evidence,
}: {
  evidence: BusinessEvidence;
}): React.ReactElement {
  return (
    <g data-evidence-state={evidence.state}>
      <desc>{evidence.label}</desc>
      <DiagramText x={40} y={410} size={26} columns={50} anchor="start">
        {`${EVIDENCE_LABELS[evidence.state]}: ${evidence.label}`}
      </DiagramText>
    </g>
  );
}

/** The acceptance segment never lights for pending/denied authority. Geometry is authored. */
export function AuthorityHandshakeRail({
  label,
  state,
  approach,
  accepted,
}: {
  label: string;
  state: HandshakeState;
  approach: number;
  accepted: number;
}): React.ReactElement {
  const S = useStage();
  const p = Math.max(0, Math.min(1, approach));
  const gate = state === 'approved' ? Math.max(0, Math.min(1, accepted)) : 0;
  return (
    <g data-authority-state={state}>
      <path d="M100 230H852" stroke={S.cardBorder} strokeWidth={8} fill="none" />
      <path d={`M100 230H${100 + p * 330}`} stroke={S.text} strokeWidth={8} fill="none" />
      <path d="M476 190V270" stroke={S.text} strokeWidth={6} />
      <path d={`M522 230H${522 + gate * 330}`} stroke={S.accent} strokeWidth={8} fill="none" />
      <DiagramText x={476} y={310} size={30} columns={28}>
        {`${label}: ${state}`}
      </DiagramText>
    </g>
  );
}

/** Known fills are explicit source ratios; unknown tiers stay unfilled and labelled. */
export function PriorityTrayMark({
  tier,
  index,
  label,
  fill,
  opacity,
}: {
  tier: PriorityTier;
  index: 0 | 1 | 2 | 3;
  label: string;
  fill: number;
  opacity: number;
}): React.ReactElement {
  const S = useStage();
  const x = 40 + index * 226;
  const known = tier.amount !== null && tier.ceiling !== null;
  return (
    <g opacity={opacity} data-tier-id={tier.id}>
      <rect
        x={x}
        y={130}
        width={192}
        height={78}
        rx={8}
        fill={S.cardRaised}
        stroke={S.text}
        strokeWidth={3}
      />
      {known && (
        <rect
          x={x + 4}
          y={134}
          width={184 * Math.max(0, Math.min(1, fill))}
          height={70}
          rx={4}
          fill={S.accent}
        />
      )}
      <DiagramText x={x + 96} y={260} size={28} columns={11} strong>
        {label}
      </DiagramText>
      {!known && (
        <DiagramText x={x + 96} y={344} size={26} columns={11}>
          Not stated
        </DiagramText>
      )}
    </g>
  );
}

/** Plan/observation differ by stroke and explicit text, not just palette color. */
export function ObservationMark({
  label,
  observed,
  opacity,
}: {
  label: string;
  observed: boolean;
  opacity: number;
}): React.ReactElement {
  const S = useStage();
  const y = observed ? 272 : 100;
  return (
    <g opacity={opacity} data-observation-state={observed ? 'observed' : 'planned'}>
      <path
        d={`M40 ${y}H912`}
        stroke={S.text}
        strokeWidth={4}
        strokeDasharray={observed ? undefined : '10 8'}
      />
      <DiagramText x={40} y={y - 28} size={28} columns={44} anchor="start">
        {`${observed ? 'Observed' : 'Planned'}: ${label}`}
      </DiagramText>
    </g>
  );
}
