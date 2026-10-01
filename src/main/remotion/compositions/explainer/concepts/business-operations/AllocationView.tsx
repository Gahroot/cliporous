import type React from 'react';
import { ClayBlock, ExplanationStage } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { useSceneTime, useStage } from '../../stage';
import { TechText } from '../../technology/primitives';
import { CapacityTicket, ProjectWorkbench } from './models';
import { allocationSlot, resourceAllocationPose } from './poses';
import type { ResourceAllocationScene } from './types';

/** Two physical workbenches compete for the SAME bounded set of capacity tickets. */
export function AllocationView({ scene }: { scene: ResourceAllocationScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = resourceAllocationPose(scene, t);
  const labels = scene.projects.map(
    (project, index) => `${project.label} · ${pose.projects[index]?.assigned ?? 0} ${scene.unit}`,
  );
  return (
    <>
      <ExplanationStage scene={scene} labels={labels}>
        <ClayBlock size={[7, 0.15, 3]} position={[0, -1.35, 0]} color={S.card} />
        <ProjectWorkbench second={false} />
        <ProjectWorkbench second />
        {scene.preset === 'constrained-projects' && (
          <ClayBlock size={[1.3, 0.13, 1.2]} position={[0, -0.2, 0.4]} color={S.cardRaised} />
        )}
        {pose.showRequests &&
          scene.projects.flatMap((project) =>
            Array.from({ length: project.requested }, (_, index) => ({
              id: `${project.id}-request-${index}`,
              position: allocationSlot(project.id, index),
            })).map((slot) => (
              <mesh key={slot.id} position={slot.position} rotation={[-Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.2, 0.023, 6, 20]} />
                <Clay color={S.muted} />
              </mesh>
            )),
          )}
        {pose.tickets.map((ticket) => (
          <group key={ticket.id} position={ticket.position}>
            <CapacityTicket slot={scene.unit === 'slots'} />
          </group>
        ))}
      </ExplanationStage>
      <TechText x={120} y={210} width={840} size={30} align="center">
        {scene.subject}: {scene.total} {scene.unit} total · one ticket = one{' '}
        {scene.unit.replace(/s$/, '')}
      </TechText>
      {pose.showRequests && (
        <TechText x={100} y={716} width={880} size={26} align="center">
          {pose.showUnmet
            ? `Unmet: ${pose.projects.map((project) => `${project.unmet} ${scene.unit}`).join(' / ')}`
            : `Requested: ${scene.projects.map((project) => `${project.requested} ${scene.unit}`).join(' / ')}`}
        </TechText>
      )}
    </>
  );
}
