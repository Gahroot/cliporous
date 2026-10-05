import type React from 'react';
import { FoldedDocument } from '../../cognition/models';
import { ProvenanceLink } from '../../concepts/information/models';
import { useStage } from '../../stage';
import { PlaybookBinder } from '../assets/authority';
import {
  CoolingLoop,
  DataCenterRack,
  PowerReadinessSubstation,
  ProviderConnectorPanel,
} from '../assets/infrastructure';
import {
  infrastructureAssets,
  infrastructureKey,
  infrastructureRecipeId,
  sampleInfrastructure,
} from './poses';
import {
  INFRASTRUCTURE_RAIL,
  infrastructureIdentities,
  infrastructureLines,
  infrastructurePages,
  infrastructureRows,
} from './presentation';
import type { InfrastructureScene } from './types';

export interface InfrastructurePartsProps {
  scene: InfrastructureScene;
  seconds: number;
}
/** Stage-free SVG on the existing body rectangle; complete fixed-font factual pages. */
export function InfrastructureDiagramParts({
  scene,
  seconds,
}: InfrastructurePartsProps): React.ReactElement {
  const S = useStage(),
    pose = sampleInfrastructure(scene, seconds),
    pages = infrastructurePages(scene),
    page = pages[pose.page];
  const latency = pose.latency;
  let line = 0,
    shareX = 24;
  return (
    <g
      data-business-recipe={infrastructureRecipeId(scene)}
      data-page={pose.page}
      opacity={pose.diagram.setup}
    >
      <title>{`${scene.subject}; ${scene.period}; ${scene.condition ?? 'No condition stated'}`}</title>
      <g data-inspection-rail={scene.preset}>
        {pose.shares.map((share) => {
          const x = shareX;
          shareX += share.weight * 500;
          return (
            <rect
              key={share.id}
              data-allocation={share.id}
              data-state={share.state}
              data-source-value={share.value ?? 'unknown'}
              x={x}
              y={24}
              width={share.weight * 500}
              height={24}
              fill={S.accent}
              stroke={S.cardBorder}
            />
          );
        })}
        {[
          'installed-used-reserved',
          'physical-readiness',
          'bounded-request-capacity',
          'resource-states',
        ].includes(scene.preset) && (
          <path
            data-declared-condition={pose.clamp.state}
            d={`M600 ${20 - pose.clamp.gate * 12}v34`}
            stroke={S.text}
            strokeWidth={4}
          />
        )}
        {pose.queue?.observed &&
          [pose.queue.queued, pose.queue.capacity].map((value, index) => (
            <rect
              key={index === 0 ? 'source-queue' : 'source-capacity'}
              data-queue={index === 0 ? 'queued' : 'capacity'}
              x={24}
              y={20 + index * 24}
              width={
                ((value ?? 0) / Math.max(1, pose.queue?.queued ?? 0, pose.queue?.capacity ?? 0)) *
                500
              }
              height={16}
              fill={index === 0 ? S.accent : S.cardBorder}
            />
          ))}
        {pose.transition && (
          <g data-transition-state={pose.transition.sourceState}>
            <path
              d={`M50 42h${pose.transition.motion.accepted * 450}`}
              stroke={S.accent}
              strokeWidth={4}
            />
            <path
              d={`M510 ${22 - pose.transition.motion.accepted * 14}v36`}
              stroke={S.text}
              strokeWidth={4}
            />
          </g>
        )}
        {pose.trace.map((trace, index) => (
          <g
            key={trace.id}
            data-provenance-id={infrastructureKey(scene, 'trace', trace.id)}
            opacity={trace.opacity}
          >
            <circle
              cx={30 + index * 100}
              cy={38}
              r={10}
              fill={S.cardRaised}
              stroke={S.cardBorder}
            />
            <path
              d={`M${45 + index * 100} 38h${trace.linkProgress * 68}`}
              stroke={S.accent}
              strokeWidth={3}
            />
          </g>
        ))}
        {pose.snapshots.map((snapshot, index) => (
          <g
            key={snapshot.id}
            data-snapshot={snapshot.id}
            data-source-date={snapshot.date}
            opacity={snapshot.visible ? 1 : 0}
          >
            <rect
              x={24 + index * 220}
              y={18}
              width={190}
              height={50}
              rx={6}
              fill={S.cardRaised}
              stroke={snapshot.focused ? S.accent : S.cardBorder}
              strokeWidth={2}
            />
            <text x={34 + index * 220} y={50} fontFamily={S.font} fontSize={24} fill={S.text}>
              {snapshot.date}
            </text>
          </g>
        ))}
        {latency && (
          <g data-latency-total={latency.total}>
            {latency.parts.map((part, index) => (
              <rect
                key={part.id}
                data-latency-stage={part.id}
                data-source-value={part.amount}
                x={
                  24 +
                  latency.parts.slice(0, index).reduce((sum, p) => sum + p.visualWeight * 650, 0)
                }
                y={24}
                width={part.visualWeight * 650}
                height={26}
                fill={S.clay[index % S.clay.length]}
                stroke={S.cardBorder}
              />
            ))}
          </g>
        )}
      </g>
      <g fontFamily={S.font} fontSize={INFRASTRUCTURE_RAIL.fontSize} fill={S.text}>
        <text x={24} y={108}>{`Source detail ${pose.page + 1} / ${pages.length}`}</text>
        {page.rows.map((row) => {
          const first = line,
            heading = infrastructureLines(`${row.label} · ${row.state}`),
            body = infrastructureLines(row.text);
          line += heading.length + body.length;
          const focus = pose.focus.find((f) => f.id === row.id)?.focus ?? 0;
          const lines = [...heading, ...body].map((text, offset) => ({
            text,
            y: 140 + (first + offset) * INFRASTRUCTURE_RAIL.lineHeight,
            isHeading: offset < heading.length,
          }));
          return (
            <g
              key={row.id}
              data-fact-id={infrastructureKey(scene, 'fact', row.id)}
              data-state={row.state}
            >
              <path
                d={`M10 ${126 + first * INFRASTRUCTURE_RAIL.lineHeight}v${(heading.length + body.length) * INFRASTRUCTURE_RAIL.lineHeight}`}
                stroke={S.cardBorder}
                strokeWidth={2 + 4 * focus}
              />
              {lines.map(({ text, y, isHeading }) => (
                <text key={`${row.id}:${y}`} x={24} y={y} fontWeight={isHeading ? 700 : 500}>
                  {text}
                </text>
              ))}
            </g>
          );
        })}
      </g>
    </g>
  );
}
/** Literal low-mesh authored resource assemblies; no private stage, operator or invented readiness. */
export function InfrastructureModelParts({
  scene,
  seconds,
}: InfrastructurePartsProps): React.ReactElement | null {
  const S = useStage();
  if (scene.visualMode === 'diagram' || scene.preset === 'evaluation-periods') return null;
  const assets = infrastructureAssets(scene);
  if (!assets.length) return null;
  const pose = sampleInfrastructure(scene, seconds),
    identities = infrastructureIdentities(scene);
  return (
    <group
      name={infrastructureKey(scene, 'assembly', 'source')}
      userData={{
        facts: infrastructureRows(scene),
        condition: scene.condition ?? null,
        period: scene.period,
        modelSource: scene.modelSource,
      }}
    >
      {identities.map((identity, index) => {
        const local = pose.identities[index],
          asset = assets.find((a) => a.id === identity.id);
        const item =
          scene.preset === 'evidence-and-missing-information'
            ? scene.items.find((i) => i.entry.identity.id === identity.id)
            : null;
        const entry =
          scene.preset === 'versioned-provenance'
            ? scene.entries.find((e) => e.identity.id === identity.id)
            : item?.entry;
        return (
          <group
            key={identity.id}
            name={infrastructureKey(scene, 'identity', identity.id)}
            position={local.position}
            scale={local.scale}
            userData={{
              sourceIdentityId: identity.id,
              source: identity.source,
              label: identity.label,
              asset: asset?.asset ?? null,
              illustrativeArchitecture: Boolean(asset),
              version: entry?.version ?? null,
              date: item?.date ?? null,
              state: item?.fact.state ?? 'source-named',
            }}
          >
            {asset?.asset === 'A-13' ? (
              <DataCenterRack activity={0} />
            ) : asset?.asset === 'A-14' ? (
              <PowerReadinessSubstation ready={pose.readiness?.power === true} />
            ) : asset?.asset === 'A-15' ? (
              <CoolingLoop
                active={
                  pose.readiness?.cooling === true ||
                  (scene.preset === 'resource-states' &&
                    scene.coolingReady.state === 'source-stated')
                }
              />
            ) : asset?.asset === 'A-16' ? (
              <ProviderConnectorPanel
                connected={pose.transition?.connected === true}
                progress={pose.transition?.motion.accepted ?? 0}
              />
            ) : asset?.asset === 'A-07' ? (
              <PlaybookBinder open={pose.response} />
            ) : (
              <FoldedDocument
                color={
                  item && item.fact.state !== 'source-stated'
                    ? S.clay[2]
                    : S.clay[index % S.clay.length]
                }
              />
            )}
          </group>
        );
      })}
      {scene.preset === 'versioned-provenance' &&
        scene.edges
          .filter((edge) => edge.state === 'source-stated')
          .map((edge) => {
            const from = pose.identities.find((identity) => identity.id === edge.fromId),
              to = pose.identities.find((identity) => identity.id === edge.toId),
              trace = pose.trace.find((p) => p.id === `${edge.fromId}:${edge.toId}`);
            return from && to ? (
              <group
                key={`${edge.fromId}:${edge.toId}`}
                name={infrastructureKey(scene, 'edge', `${edge.fromId}:${edge.toId}`)}
                userData={{ source: edge.source, state: edge.state }}
              >
                <ProvenanceLink
                  from={from.position}
                  to={to.position}
                  color={S.accent}
                  reveal={trace?.linkProgress ?? 0}
                />
              </group>
            ) : null;
          })}
    </group>
  );
}
