import type React from 'react';
import { useStage } from '../../stage';
import { marketsKey, marketsRecipeId, sampleMarkets } from './poses';
import { MARKETS_RAIL, marketsLines, marketsPages } from './presentation';
import type { MarketsScene } from './types';

export interface MarketsPartsProps {
  scene: MarketsScene;
  seconds: number;
}

/** Stage-free SVG in the existing 952x478 body. No shrinking, ellipsis or hidden fact rows. */
export function MarketsDiagramParts({ scene, seconds }: MarketsPartsProps): React.ReactElement {
  const S = useStage();
  const pose = sampleMarkets(scene, seconds);
  const pages = marketsPages(scene);
  const page = pages[pose.page];
  let line = 0;
  return (
    <g
      data-business-recipe={marketsRecipeId(scene)}
      data-page={pose.page}
      opacity={pose.diagram.setup}
    >
      <title>{`${scene.subject}; ${scene.condition ?? 'No condition stated'}`}</title>
      {/* Source-identity inspection rail, not count/area/performance or a transaction graph. */}
      <g data-inspection-rail="source-identities">
        {pose.identities.map((identity, index) => {
          const alternative = pose.alternatives.find((a) => a.id === identity.id);
          const lensUnit =
            scene.kind === 'market-dependency' &&
            scene.preset === 'complementary-specialists' &&
            scene.specialists.some((s) => s.identity.id === identity.id);
          const x = lensUnit ? 476 + identity.x * 150 : 80 + index * 106;
          return (
            <g key={identity.key} data-identity-id={identity.key} transform={`translate(${x} 24)`}>
              <rect
                x={-20}
                y={0}
                width={40 * identity.area}
                height={28}
                rx={4}
                fill={S.cardRaised}
                stroke={S.cardBorder}
                strokeWidth={2}
                opacity={alternative?.opacity ?? pose.diagram.setup}
              />
              {alternative && (
                <path
                  d="M-28 38H28"
                  stroke={S.text}
                  strokeWidth={2}
                  data-baseline={identity.baseline}
                />
              )}
            </g>
          );
        })}
        {pose.matches.map((match, index) => (
          <g
            key={match.id}
            data-match-id={match.id}
            data-state={match.state}
            data-acceptance-state={match.acceptanceState}
          >
            <path
              d={`M${350 + index * 180} 68h${match.matching * 64}`}
              stroke={S.accent}
              strokeWidth={4}
            />
            <path
              d={`M${424 + index * 180} ${58 - match.acceptance.accepted * 12}v20`}
              stroke={S.text}
              strokeWidth={4}
            />
          </g>
        ))}
        {pose.migration && (
          <g data-migration-state={pose.migration.state}>
            <path d={`M350 68h${pose.migration.gate * 170}`} stroke={S.accent} strokeWidth={4} />
            <path d={`M525 ${54 - pose.migration.gate * 16}v26`} stroke={S.text} strokeWidth={4} />
          </g>
        )}
        {pose.procurement && (
          <g
            data-authority-state={pose.procurement.authorityState}
            data-acceptance-state={pose.procurement.acceptanceState}
          >
            <path
              d={`M380 ${60 - pose.procurement.authority.accepted * 16}v24`}
              stroke={S.text}
              strokeWidth={4}
            />
            <path
              d={`M440 ${60 - pose.procurement.acceptance.accepted * 16}v24`}
              stroke={S.cardBorder}
              strokeWidth={4}
            />
            {pose.procurement.payment.state === 'paid' && (
              <circle
                data-settlement-state="paid"
                cx={500 + pose.procurement.settlement * 80}
                cy={68}
                r={8}
                fill={S.accent}
                opacity={pose.procurement.settlement}
              />
            )}
          </g>
        )}
      </g>
      <g fontFamily={S.font} fontSize={MARKETS_RAIL.fontSize} fill={S.text}>
        <text x={24} y={108}>{`Source detail ${pose.page + 1} / ${pages.length}`}</text>
        {page.rows.map((row) => {
          const first = line;
          const heading = marketsLines(`${row.label} · ${row.state}`);
          const body = marketsLines(row.text);
          line += heading.length + body.length;
          const focus = pose.constraints.find((c) => c.id === row.id)?.focus ?? 0;
          return (
            <g key={row.id} data-fact-id={marketsKey(scene, 'fact', row.id)} data-state={row.state}>
              <path
                d={`M10 ${126 + first * MARKETS_RAIL.lineHeight}v${(heading.length + body.length) * MARKETS_RAIL.lineHeight}`}
                stroke={S.cardBorder}
                strokeWidth={2 + 4 * focus}
              />
              {[...heading, ...body].map((text, index) => {
                const lineY = 140 + (first + index) * MARKETS_RAIL.lineHeight;
                return (
                  <text
                    key={`${row.id}:line:${lineY}`}
                    x={24}
                    y={lineY}
                    fontWeight={index < heading.length ? 700 : 500}
                  >
                    {text}
                  </text>
                );
              })}
            </g>
          );
        })}
      </g>
    </g>
  );
}
