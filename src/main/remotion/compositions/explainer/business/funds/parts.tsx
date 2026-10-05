import type React from 'react';
import { useStage } from '../../stage';
import { ExceptionTrolley } from '../assets/authority';
import { CommitmentFolio, DistributionTierTrays, EconomicRightsLayers } from '../assets/funds';
import { businessLabelLines } from '../text-width';
import type { FundsPose } from './poses';
import {
  fundsResourceCounts,
  fundsRowLines,
  fundsRows,
  fundsSemanticIds,
  fundsTitle,
  FUNDS_TABLE as T,
} from './presentation';
import type { FundsScene } from './types';
export interface FundsPartsProps {
  scene: FundsScene;
  pose: FundsPose;
}
function treatment(scene: FundsScene): string {
  switch (scene.preset) {
    case 'capital-states':
    case 'stated-priority-tiers':
      return 'M-10';
    case 'subscriptions-and-close':
    case 'valuation-cash-distinction':
      return 'M-03';
    case 'gross-to-net':
      return 'M-02';
    case 'source-periods':
      return 'M-06';
    case 'retained-follow-on-capital':
    case 'periodic-repurchase':
      return 'M-12';
  }
}
function physicalNote(scene: FundsScene): string | null {
  if (scene.preset === 'stated-priority-tiers' && scene.tiers.length < 4)
    return `Physical slots ${Array.from({ length: 4 - scene.tiers.length }, (_, index) => index + scene.tiers.length + 1).join(', ')} unused (not source priorities).`;
  if (scene.preset === 'retained-follow-on-capital')
    return 'Allocation / remaining; slots 3–4 unused (not priorities).';
  if (scene.preset === 'valuation-cash-distinction')
    return 'Illustrative separation, not a liquidity or payment claim.';
  return null;
}
/** Stable physical line slots: keys use the semantic owner, rail and actual baseline. */
function positionedLines(
  lines: readonly string[],
  firstBaseline: number,
): { text: string; baseline: number }[] {
  const slots: { text: string; baseline: number }[] = [];
  let baseline = firstBaseline;
  for (const text of lines) {
    slots.push({ text, baseline });
    baseline += T.lineHeight;
  }
  return slots;
}
/** Complete natural SVG facts, reusable inside a shared board surface; no stage/canvas. */
export function FundsDiagramParts({ scene, pose }: FundsPartsProps): React.ReactElement {
  const S = useStage(),
    titles = businessLabelLines(fundsTitle(scene), T.width - 48, T.font),
    note = physicalNote(scene);
  let y = T.rowTop;
  return (
    <g
      data-funds-preset={scene.preset}
      data-treatment={treatment(scene)}
      data-semantic-ids={fundsSemanticIds(scene).join(' ')}
      fontFamily={S.font}
      fontSize={T.font}
      opacity={pose.opacity}
    >
      <rect width={T.width} height={T.height} rx={18} fill={S.card} />
      <text x={24} y={24} fill={S.text} fontWeight={700}>
        {positionedLines(titles, 24).map(({ text, baseline }) => (
          <tspan key={`fund-title:${scene.fund.id}:24:${baseline}`} x={24} y={baseline}>
            {text}
          </tspan>
        ))}
      </text>
      {pose.page.rows.map((row, index) => {
        const top = y,
          height = pose.page.heights[index];
        y += height;
        const focus = pose.focus.find((item) => item.id === row.id)?.focus;
        const priority = pose.priorities.find((item) => item.id === row.id)?.reveal;
        const snapshot = pose.snapshots.find((item) => item.id === row.id);
        const marker =
          focus ?? priority ?? (snapshot ? Number(snapshot.focused) : (pose.clamp?.progress ?? 0));
        const part = pose.conserved?.parts.find((item) => item.id === row.id);
        return (
          <g key={row.id} data-fact-id={row.id} data-state={row.state}>
            <rect
              x={8}
              y={top + 12}
              width={6}
              height={24}
              rx={3}
              fill={S.accent}
              opacity={marker}
              data-motion-value={marker}
            />
            <path d={`M 24 ${top + height} H 928`} stroke={S.muted} strokeOpacity={0.2} />
            {fundsRowLines(row).map((lines, column) => (
              <text key={T.x[column]} x={T.x[column]} y={top + 24} fill={S.text}>
                {positionedLines(lines, top + 24).map(({ text, baseline }) => (
                  <tspan key={`${row.id}:${T.x[column]}:${baseline}`} x={T.x[column]} y={baseline}>
                    {text}
                  </tspan>
                ))}
              </text>
            ))}
            {part && (
              <rect
                data-conserved-part={part.id}
                x={T.x[1]}
                y={top + height - 10}
                width={T.railWidths[1] * part.visualWeight}
                height={4}
                rx={2}
                fill={S.accent}
              />
            )}
          </g>
        );
      })}
      {note && (
        <text x={24} y={470} fill={S.muted} data-physical-slot-note="true">
          {note}
        </text>
      )}
    </g>
  );
}
function Models({ scene, pose }: FundsPartsProps): React.ReactElement | null {
  switch (scene.preset) {
    case 'capital-states':
    case 'subscriptions-and-close':
    case 'source-periods':
      return (
        <group name="funds:A-09">
          <CommitmentFolio {...pose.folio} />
        </group>
      );
    case 'stated-priority-tiers':
      return (
        <group name="funds:A-10">
          <DistributionTierTrays fills={pose.tierFills} />
        </group>
      );
    case 'retained-follow-on-capital':
      return (
        <group>
          <group name="funds:A-09" position={[-1.5, 0.2, 0]} scale={0.65}>
            <CommitmentFolio {...pose.folio} />
          </group>
          <group name="funds:A-10" position={[1.1, 0.05, 0]} scale={0.6}>
            <DistributionTierTrays fills={pose.tierFills} />
          </group>
        </group>
      );
    case 'periodic-repurchase':
      return (
        <group>
          <group name="funds:A-09" position={[-1.25, 0.2, 0]} scale={0.7}>
            <CommitmentFolio {...pose.folio} />
          </group>
          <group name="funds:A-08" position={[1.7, 0.1, 0]} scale={0.65}>
            <ExceptionTrolley pending={pose.trolleyPending} />
          </group>
        </group>
      );
    case 'valuation-cash-distinction':
      return (
        <group name="funds:A-12">
          <EconomicRightsLayers separation={pose.separation} />
        </group>
      );
    case 'gross-to-net':
      return null;
  }
}
/** Existing source-gated authored assets only, reusable inside a board's one studio. */
export function FundsModelParts(props: FundsPartsProps): React.ReactElement | null {
  if (
    props.scene.preset === 'gross-to-net' ||
    props.scene.visualMode !== 'hybrid' ||
    props.scene.carrierSource === null
  )
    return null;
  return (
    <group
      name={`funds:${props.scene.fund.id}`}
      userData={{
        semanticIds: fundsSemanticIds(props.scene),
        sourceFacts: fundsRows(props.scene),
        resourceCounts: fundsResourceCounts(props.scene),
      }}
    >
      <Models {...props} />
    </group>
  );
}
