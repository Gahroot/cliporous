import type React from 'react';
import { FoldedDocument, PaperTray } from '../../cognition/models';
import { ClayBlock, ExplanationStage } from '../../explanation-kit';
import { EXPLANATION_CAMERA } from '../../explanation-layout';
import { useSceneTime, useStage } from '../../stage';
import { Connector, TechText } from '../../technology/primitives';
import { projectToStage } from '../../three-helpers';
import { CohortLane, PopulationPerson, PopulationProduct, ProductShelf } from './models';
import {
  cohortPose,
  demandSlot,
  distributionPose,
  inventoryPose,
  memberX,
  type PopulationPoint,
} from './poses';
import type {
  BusinessPopulationsScene,
  CustomerCohortScene,
  InventoryDemandScene,
  PopulationDistributionScene,
} from './types';

function EvidenceRail({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <TechText x={90} y={214} width={900} size={28} align="center">
      {children}
    </TechText>
  );
}
function ActorLabel({
  position,
  identity,
  count,
  children,
}: {
  position: PopulationPoint;
  identity: number;
  count: number;
  children: React.ReactNode;
}): React.ReactElement {
  const point = projectToStage(EXPLANATION_CAMERA, position);
  // Fixed identity slots, not projected text: up to four rows for six originals + two newcomers.
  // Each row reserves three full name lines plus status, clear of the model and bottom rails.
  const left = identity % 2 === 0;
  const x = left ? 64 : 816;
  const y = 528 - Math.ceil(count / 2) * 56 + Math.floor(identity / 2) * 112;
  const edge = left ? x + 212 : x - 12;
  return (
    <>
      <Connector
        points={[{ x: edge, y: y + 22 }, { x: edge + (left ? 16 : -16), y: y + 22 }, point]}
      />
      <TechText x={x} y={y} width={200} size={22} align="center">
        {children}
      </TechText>
    </>
  );
}
function DistributionView({ scene }: { scene: PopulationDistributionScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = distributionPose(scene, t);
  const labels = scene.members.map(
    (member) =>
      `${member.label} · ${scene.mode === 'quantitative' ? `${member.amount} ${scene.unit}` : `${member.level === 'high' ? 'Many' : member.level === 'middle' ? 'Some' : 'Few'} ${scene.unit}`}`,
  );
  return (
    <>
      <ExplanationStage scene={scene} labels={labels}>
        {pose.members.map((member, i) => (
          <group key={member.id}>
            <group position={member.position}>
              <PopulationPerson identity={member.identity} />
            </group>
            <group position={[memberX(i, scene.members.length), 0.15, 0.1]}>
              <PaperTray width={1.12} depth={0.85} />
            </group>
          </group>
        ))}
        {pose.carriers.map((carrier) => (
          <group
            key={carrier.id}
            position={carrier.position}
            rotation={[carrier.rotation, 0, 0]}
            scale={0.52}
          >
            <FoldedDocument color={S.clay[carrier.identity % 3] ?? S.accent} />
          </group>
        ))}
        {pose.average.visible && (
          <group scale={[pose.average.reveal, 1, 1]}>
            <ClayBlock
              size={[scene.members.length === 4 ? 5 : 4.4, 0.035, 0.045]}
              position={[0, pose.average.y, 0.5]}
              color={S.accent}
              radius={0.01}
            />
            {[-1, 1].map((side) => (
              <ClayBlock
                key={side}
                size={[0.04, 0.18, 0.045]}
                position={[side * (scene.members.length === 4 ? 2.5 : 2.2), pose.average.y, 0.5]}
                color={S.accent}
                radius={0.01}
              />
            ))}
          </group>
        )}
      </ExplanationStage>
      <EvidenceRail>
        {scene.mode === 'qualitative'
          ? 'Illustrative spread · no numerical scale'
          : `${scene.populationSize} named members · source-stated ${scene.unit}`}
      </EvidenceRail>
      {pose.average.visible && (
        <TechText x={110} y={708} width={860} size={28} align="center">
          {scene.average === undefined
            ? 'Average alone hides the spread · illustrative'
            : `Stated average: ${scene.average} ${scene.unit} · outliers stay visible`}
        </TechText>
      )}
    </>
  );
}

function CohortView({ scene }: { scene: CustomerCohortScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = cohortPose(scene, t);
  const actorCount = pose.members.length + pose.arrivals.length;
  const labels = pose.separated
    ? ['Retained originals', 'Departed originals', 'New arrivals']
    : [`Originals · ${scene.startPeriod}`, `Later · ${scene.endPeriod}`, 'New ≠ retained'];
  return (
    <>
      <ExplanationStage scene={scene} labels={labels}>
        <CohortLane x={-0.85} width={2.15} />
        <CohortLane x={1.3} width={2.05} outline />
        <ClayBlock size={[1.55, 0.05, 0.5]} position={[0.05, -1.19, 1.05]} color={S.cardRaised} />
        {/* The period gate is fixed. People change lanes; the starting set is never replaced. */}
        <ClayBlock size={[0.07, 1.35, 0.07]} position={[-2.45, -0.52, -0.7]} color={S.muted} />
        <ClayBlock size={[0.75, 0.08, 0.07]} position={[-2.1, 0.12, -0.7]} color={S.muted} />
        {[...pose.members, ...pose.arrivals].map((actor) => (
          <group key={actor.id} position={actor.position}>
            <PopulationPerson identity={actor.identity} />
          </group>
        ))}
      </ExplanationStage>
      <EvidenceRail>
        {scene.startPeriod} → {scene.endPeriod} ·{' '}
        {scene.counts
          ? `${scene.counts.starting} originals; ${scene.counts.retained} retained; ${scene.counts.arrivals} new`
          : 'Named examples · not a retention rate'}
      </EvidenceRail>
      {pose.members.map((actor) => (
        <ActorLabel
          key={actor.id}
          position={actor.position}
          identity={actor.identity}
          count={actorCount}
        >
          {actor.label}
          <br />
          {pose.separated ? actor.status : 'original'}
        </ActorLabel>
      ))}
      {pose.arrivals.map((actor) => (
        <ActorLabel
          key={actor.id}
          position={actor.position}
          identity={actor.identity}
          count={actorCount}
        >
          {actor.label}
          <br />
          new
        </ActorLabel>
      ))}
    </>
  );
}

function InventoryView({ scene }: { scene: InventoryDemandScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = inventoryPose(scene, t);
  const labels = [scene.stockLabel, scene.productLabel, scene.demandLabel];
  return (
    <>
      <ExplanationStage scene={scene} labels={labels}>
        <ProductShelf />
        <ClayBlock size={[2.5, 0.06, 2]} position={[1.15, -1.24, -0.1]} color={S.card} />
        {pose.people.map((person) => (
          <group key={person.id} position={person.position}>
            <PopulationPerson identity={person.identity} request />
          </group>
        ))}
        {pose.products.map((product) => (
          <group key={product.id} position={product.position}>
            <PopulationProduct
              identity={product.identity}
              mug={/\b(?:mugs?|cups?)\b/i.test(scene.productLabel)}
            />
          </group>
        ))}
        {pose.checked &&
          pose.people
            .filter((person) => !person.fulfilled)
            .map((person, i) => (
              <group key={person.id} position={demandSlot(scene.stock.length + i)}>
                <ClayBlock size={[0.46, 0.025, 0.065]} position={[0, 0.02, 0.34]} color={S.muted} />
              </group>
            ))}
      </ExplanationStage>
      <EvidenceRail>
        {scene.quantities
          ? `${scene.quantities.stock} ${scene.productLabel} in stock · ${scene.quantities.demand} requested`
          : 'Illustrative stock and requests · not a numerical scale'}
      </EvidenceRail>
      {pose.checked && (
        <TechText x={100} y={710} width={880} size={28} align="center">
          {scene.quantities
            ? `${pose.matches} matched · ${pose.leftover} left on shelf · ${pose.unmet} unfilled`
            : scene.preset === 'surplus'
              ? 'Leftover products remain on the shelf'
              : scene.preset === 'shortage'
                ? 'Unfilled requests remain visible'
                : 'Each illustrated request meets its product'}
        </TechText>
      )}
    </>
  );
}

export function BusinessPopulationsSceneView({
  scene,
}: {
  scene: BusinessPopulationsScene;
}): React.ReactElement {
  switch (scene.kind) {
    case 'population-distribution':
      return <DistributionView scene={scene} />;
    case 'customer-cohort':
      return <CohortView scene={scene} />;
    case 'inventory-demand':
      return <InventoryView scene={scene} />;
  }
}
