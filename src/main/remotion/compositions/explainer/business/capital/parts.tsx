import type React from 'react';
import { useStage } from '../../stage';
import { CommitmentFolio, EconomicRightsLayers, MaturityLadder } from '../assets/funds';
import { DataCenterRack } from '../assets/infrastructure';
import { capitalAssembly, sampleCapital } from './poses';
import { type CapitalCardLayout, capitalActivePage, CAPITAL_READING as R } from './presentation';
import { type CapitalScene, capitalIdentities } from './types';

/** A-11's three literal calendars are reading slots, not three invented obligations/dates. */
export function capitalVisibleLayouts(scene: CapitalScene, seconds: number): CapitalCardLayout[] {
  return capitalActivePage(scene, seconds).cards;
}

/** Stage-free SVG, reusable by a board. Exactly the measured bundled Inter rail sizes. */
export function CapitalDiagramParts({
  scene,
  seconds,
}: {
  scene: CapitalScene;
  seconds: number;
}): React.ReactElement {
  const S = useStage();
  const pose = sampleCapital(scene, seconds),
    layouts = capitalVisibleLayouts(scene, seconds);
  return (
    <g
      data-capital-preset={scene.preset}
      data-treatment={pose.treatment}
      data-semantic-ids={pose.entityIds.join(' ')}
      fontFamily="Inter"
    >
      {layouts.map((layout) => (
        <g
          key={layout.card.id}
          data-fact-id={layout.card.id}
          transform={`translate(${layout.x} ${layout.y})`}
        >
          <rect
            width={layout.width}
            height={layout.height}
            rx={16}
            fill={S.card}
            stroke={S.accent}
            strokeWidth={2 + (pose.treatment === 'M-03' ? pose.focus : 0)}
          />
          {layout.titleLines.map((text, row) => {
            const y = R.padding + R.titleSize + row * R.titleSize * R.lineHeight;
            return (
              <text
                key={`${layout.card.id}:title-y-${y}`}
                x={R.padding}
                y={y}
                fontSize={R.titleSize}
                fontWeight={650}
                fill={S.text}
              >
                {text}
              </text>
            );
          })}
          {layout.bodyLines.map((line) => (
            <text
              key={`${line.id}:y-${line.y}`}
              data-line-id={line.id}
              x={R.padding}
              y={line.y - layout.y}
              fontSize={R.bodySize}
              fontWeight={500}
              fill={S.text}
            >
              {line.text}
            </text>
          ))}
        </g>
      ))}
    </g>
  );
}

/** Stage-free native authored solids. No Canvas, arrows, payment, fill or liquidity animation. */
export function CapitalModelParts({
  scene,
  seconds,
}: {
  scene: CapitalScene;
  seconds: number;
}): React.ReactElement | null {
  if (scene.visualMode === 'diagram') return null;
  if (!scene.modelSource) throw new Error('CAPITAL model requires its source-owned native meaning');
  const pose = sampleCapital(scene, seconds);
  const slots =
    scene.preset === 'financing-versus-capacity' || scene.preset === 'obligations-and-maturity'
      ? [
          ...scene.obligations.map((o) => ({ id: o.identity.id, dateLabel: o.maturity })),
          ...Array.from({ length: 3 - scene.obligations.length }, () => null),
        ]
      : [];
  return (
    <group
      name="capital-source-assembly"
      userData={{ treatment: pose.treatment, entityIds: pose.entityIds }}
    >
      {capitalIdentities(scene).map((identity) => (
        <group
          key={identity.id}
          name={`entity:${identity.id}`}
          userData={{
            capitalEntityId: identity.id,
            fullLabel: identity.label,
            source: identity.source,
          }}
        />
      ))}
      {capitalAssembly(scene).map((part) => (
        <group
          key={part.id}
          name={`asset:${part.id}`}
          position={part.position}
          scale={part.scale}
          userData={{
            businessAssetId: part.asset,
            subjectId: scene.company.id,
            source: scene.modelSource,
            meaning:
              part.asset === 'A-12'
                ? 'inspection only; asset / ownership / economic claim records remain distinct'
                : part.asset === 'A-09'
                  ? 'commitment document; no contributed cash'
                  : part.asset === 'A-11'
                    ? 'three authored reading slots, unassigned slots are not maturities'
                    : 'physical rack; fixed trays are not source capacity or telemetry',
            ...(part.asset === 'A-11' ? { sourceSlots: slots } : {}),
            ...(part.asset === 'A-13' && scene.preset === 'financing-versus-capacity'
              ? {
                  assetId: scene.asset.id,
                  installed: scene.installed,
                  commissioned: scene.commissioned,
                }
              : {}),
          }}
        >
          {part.asset === 'A-09' ? (
            <CommitmentFolio open={pose.folioOpen} contributed={pose.contributed} />
          ) : part.asset === 'A-12' ? (
            <EconomicRightsLayers separation={pose.separation} />
          ) : part.asset === 'A-11' ? (
            <MaturityLadder focus={pose.maturityFocus} />
          ) : (
            <DataCenterRack activity={pose.rackActivity} />
          )}
        </group>
      ))}
    </group>
  );
}
