import type React from 'react';
import { HybridStage } from '../../diagrams/HybridStage';
import type { PortfolioExposureScene } from '../../finance/types';
import { useSceneTime, useStage } from '../../stage';
import { EconomicRightsLayers } from '../assets/funds';
import { type CapitalDependencyPose, sampleCapitalDependency } from './dependency-poses';
import {
  capitalDependencyFacts,
  capitalDependencySemanticIds,
  CAPITAL_DEPENDENCY_READING as R,
} from './dependency-presentation';
import type { CapitalDependencyLens } from './dependency-types';

export interface CapitalDependencyPartsProps {
  scene: PortfolioExposureScene;
  lens: CapitalDependencyLens;
  pose: CapitalDependencyPose;
}

/** Complete natural SVG fact lines. M-03 focuses the driver, not authority or measured risk. */
export function CapitalDependencyDiagramParts({
  scene,
  lens,
  pose,
}: CapitalDependencyPartsProps): React.ReactElement {
  const S = useStage();
  const focus = pose.focus.find((entry) => entry.id === scene.exposure.id)?.focus ?? 0;
  return (
    <g
      data-business-recipe="OP-58"
      data-treatment="M-03"
      data-semantic-ids={capitalDependencySemanticIds(scene.funds, scene.exposure, lens).join(' ')}
      data-page-id={pose.page.id}
      fontFamily={S.font}
      opacity={pose.opacity}
    >
      <rect width={R.width} height={R.height} rx={18} fill={S.card} />
      <g data-entity-id={scene.exposure.id} data-role="common-driver">
        <rect
          x={8}
          y={R.x}
          width={6}
          height={pose.page.titleLines.length * R.titleLineHeight}
          rx={3}
          fill={S.accent}
          opacity={focus}
          data-motion-value={focus}
        />
        <text x={R.x} y={R.x + R.titleFont} fontSize={R.titleFont} fontWeight={700} fill={S.text}>
          {pose.page.titleLines.map((text, slot) => (
            <tspan
              key={`driver:${scene.exposure.id}:${text}`}
              x={R.x}
              y={R.x + R.titleFont + slot * R.titleLineHeight}
            >
              {text}
            </tspan>
          ))}
        </text>
      </g>
      {pose.page.facts.map(({ fact, lines, top, height }) => (
        <g
          key={fact.id}
          data-fact-id={fact.id}
          data-fact-kind={fact.kind}
          data-entity-ids={fact.entityIds.join(' ')}
          data-from-id={fact.fromId ?? undefined}
          data-to-id={fact.toId ?? undefined}
          data-source-from={fact.source?.fromWord}
          data-source-to={fact.source?.toWord}
        >
          <text x={R.x} y={top + R.bodyFont} fontSize={R.bodyFont} fill={S.text}>
            {lines.map((text, slot) => (
              <tspan key={`${fact.id}:${text}`} x={R.x} y={top + R.bodyFont + slot * R.lineHeight}>
                {text}
              </tspan>
            ))}
          </text>
          <path
            d={`M ${R.x} ${top + height - R.gap / 2} H ${R.x + R.rail}`}
            stroke={S.muted}
            strokeOpacity={0.2}
          />
        </g>
      ))}
    </g>
  );
}

/** Two independently supported A-12 record assemblies; no stage and no cash/claim inference. */
export function CapitalDependencyModelParts({
  scene,
  lens,
  pose,
}: CapitalDependencyPartsProps): React.ReactElement | null {
  if (scene.visualMode !== 'hybrid') return null;
  return (
    <group
      name="capital-dependency:records"
      userData={{
        semanticIds: capitalDependencySemanticIds(scene.funds, scene.exposure, lens),
        sourceFacts: capitalDependencyFacts(scene.funds, scene.exposure, lens),
        modelSource: { ...lens.modelSource },
        meaning: 'Inspection only; no money or rights movement',
      }}
    >
      {pose.records.map((record) => (
        <group
          key={record.fundId}
          name={`capital-dependency:A-12:${record.fundId}`}
          position={record.position}
          scale={record.scale}
          userData={{ fundId: record.fundId, firmId: record.firmId, role: 'separate-fund-records' }}
        >
          <EconomicRightsLayers separation={pose.separation} />
        </group>
      ))}
    </group>
  );
}

export function CapitalDependencyView({
  scene,
  lens,
}: {
  scene: PortfolioExposureScene;
  lens: CapitalDependencyLens;
}): React.ReactElement {
  const { t } = useSceneTime();
  const pose = sampleCapitalDependency(scene, lens, t);
  return (
    <HybridStage
      scene={scene}
      settledOutcome
      model={<CapitalDependencyModelParts scene={scene} lens={lens} pose={pose} />}
      diagram={<CapitalDependencyDiagramParts scene={scene} lens={lens} pose={pose} />}
    />
  );
}
