import type React from 'react';
import { FoldedDocument } from '../../cognition/models';
import { DiagramText } from '../../diagrams/primitives';
import { ClayBlock } from '../../explanation-kit';
import { useStage } from '../../stage';
import { BusinessAssetParts } from '../assets/parts';
import { economicsFacts } from './identities';
import { economicsAssembly, sampleEconomics } from './poses';
import { economicsActivePage } from './presentation';
import { ECONOMICS_READING_LAYOUT as R } from './readability';
import { type EconomicsScene, economicsRecipeId } from './types';

export interface EconomicsPartsProps {
  scene: EconomicsScene;
  seconds: number;
}
/** Complete fixed-font facts. No universal 'per' formatter: cohort and metric stay literal. */
export function EconomicsDiagramParts({ scene, seconds }: EconomicsPartsProps): React.ReactElement {
  const S = useStage(),
    pose = sampleEconomics(scene, seconds),
    page = economicsActivePage(scene, seconds);
  return (
    <g data-business-recipe={economicsRecipeId(scene)} data-page={page.index} opacity={pose.setup}>
      <title>{`${scene.subject}; ${scene.condition ?? 'No condition stated'}; ${scene.outcome}`}</title>
      {pose.decompositions.map((group, groupIndex) => {
        const width = (R.railWidth - 2 * R.margin) / pose.decompositions.length;
        let offset = 0;
        return (
          <g key={group.id} data-conserved-total={group.id}>
            <rect
              x={R.margin + groupIndex * width}
              y={3}
              width={width - 4}
              height={8}
              fill={S.cardBorder}
              opacity={group.originWeight}
            />
            {group.parts.map((part, index) => {
              const x = R.margin + groupIndex * width + offset;
              const w = (width - 4) * part.visualWeight;
              offset += w;
              return (
                <rect
                  key={part.id}
                  data-conserved-part={part.id}
                  x={x}
                  y={3}
                  width={w}
                  height={8}
                  fill={S.clay[index % S.clay.length]}
                />
              );
            })}
          </g>
        );
      })}
      {page.cards.map((layout) => {
        const fact = economicsFacts(scene).find((entry) => entry.id === layout.card.id);
        const peerId = layout.card.id.split(':')[0];
        const alternative = pose.alternatives.find((entry) => entry.id === peerId);
        const snapshot = pose.snapshots.find((entry) => entry.id === peerId);
        return (
          <g
            key={layout.card.id}
            data-fact-id={layout.card.id}
            data-identity-id={fact?.identityId}
            data-source-state={fact?.fact.state}
          >
            <rect
              x={layout.x}
              y={layout.y}
              width={layout.width}
              height={layout.height}
              rx={12}
              fill={S.cardRaised}
              stroke={S.cardBorder}
              strokeWidth={2}
            />
            {(alternative || snapshot) && (
              <rect
                x={layout.x + 2}
                y={layout.y + 2}
                width={layout.width - 4}
                height={layout.height - 4}
                rx={10}
                fill="none"
                stroke={S.accent}
                strokeWidth={3}
                opacity={alternative ? alternative.opacity : snapshot?.focused ? 1 : 0.25}
              />
            )}
            <DiagramText
              x={layout.x + R.padding}
              y={layout.titleY}
              size={R.titleSize}
              columns={R.titleColumns}
              anchor="start"
              strong
            >
              {layout.card.title}
            </DiagramText>
            {layout.card.lines.map((line, index) => {
              const lineY = layout.lineY[index];
              return (
                <DiagramText
                  key={`${layout.card.id}:line:${lineY}`}
                  x={layout.x + R.padding}
                  y={lineY}
                  size={R.bodySize}
                  columns={R.columns}
                  anchor="start"
                >
                  {line}
                </DiagramText>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
/** One source-gated authored carrier; additional objects are records, never invented staff or money. */
export function EconomicsModelParts({ scene, seconds }: EconomicsPartsProps): React.ReactElement {
  const S = useStage(),
    pose = sampleEconomics(scene, seconds),
    instance = economicsAssembly(scene, pose);
  if (!instance) return <group name="economics-no-carrier" />;
  const facts = economicsFacts(scene);
  return (
    <group
      name={`economics:${scene.business.id}`}
      userData={{ sourceIdentityId: scene.business.id }}
    >
      <group
        name="source-carrier"
        scale={instance.assembly.asset === 'A-02' ? 0.42 : 0.62}
        position={[0, -0.3, instance.assembly.asset === 'A-02' ? -0.6 : -0.3]}
        userData={{ illustrative: true, occupancyEncoded: false, approvalEncoded: false }}
      >
        <BusinessAssetParts instance={instance} />
      </group>
      {facts.map((entry, index) => {
        const part = pose.decompositions
          .flatMap((group) => group.parts)
          .find((p) => p.id === entry.id);
        const snapshot = pose.snapshots.find((p) => entry.id.startsWith(`${p.id}:`));
        const alternative = pose.alternatives.find(
          (p) => entry.id === p.id || entry.id.startsWith(`${p.id}:`),
        );
        const x = ((index % 4) - 1.5) * 1.18;
        const spread = part ? pose.action : 1;
        return (
          <group
            key={entry.id}
            name={`fact:${entry.id}`}
            position={[x * spread, 1.08 - Math.floor(index / 4) * 0.65, 0.9]}
            scale={0.3}
            visible={!snapshot || snapshot.visible}
            userData={{
              factId: entry.id,
              sourceIdentityId: entry.identityId,
              label: entry.label,
              fact: entry.fact,
            }}
          >
            <group scale={snapshot?.focused ? 1.08 : 1}>
              <FoldedDocument color={S.clay[index % S.clay.length]} />
            </group>
            {part && (
              <group visible={part.visualWeight > 0}>
                <ClayBlock
                  size={[Math.max(0.001, 1.2 * part.visualWeight), 0.065, 0.04]}
                  position={[-0.6 + 0.6 * part.visualWeight, -0.4, 0.1]}
                  color={S.accent}
                  radius={0.01}
                />
              </group>
            )}
            {alternative && (
              <ClayBlock
                size={[1.3, 0.055, 0.04]}
                position={[0, -0.6 + alternative.baseline, 0.1]}
                opacity={alternative.opacity}
                color={S.accent}
                radius={0.01}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}
