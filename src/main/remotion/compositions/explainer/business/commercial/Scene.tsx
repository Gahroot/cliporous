import type React from 'react';
import { FoldedDocument, PaperTray, WorkDesk } from '../../cognition/models';
import { HybridStage } from '../../diagrams/HybridStage';
import { DiagramText } from '../../diagrams/primitives';
import { Clay } from '../../hero-kit';
import { Occupant } from '../../spatial/parts';
import { useSceneTime, useStage } from '../../stage';
import {
  BranchPod,
  ServiceStation,
  CommercialStorefront as StorefrontCutaway,
} from '../assets/retail';
import { sampleCommercial } from './poses';
import { commercialRecipeId, commercialTable, layoutCommercialTable } from './presentation';
import type { CommercialScene } from './types';

interface PartsProps {
  scene: CommercialScene;
  seconds: number;
}

/** Stage-free factual SVG. Natural line heights and font sizes come from the validated rails. */
export function CommercialDiagramParts({ scene, seconds }: PartsProps): React.ReactElement {
  const S = useStage();
  const pose = sampleCommercial(scene, seconds);
  const table = commercialTable(scene);
  const layout = layoutCommercialTable(table);
  return (
    <g data-business-recipe={commercialRecipeId(scene)} opacity={pose.setup}>
      <title>{`${scene.subject}; ${scene.condition ?? 'No condition stated'}; ${scene.outcome}`}</title>
      {table.headings.map((heading, index) => (
        <DiagramText
          key={heading}
          x={28 + index * layout.cellWidth}
          y={28}
          size={22}
          columns={22}
          anchor="start"
          strong
        >
          {heading}
        </DiagramText>
      ))}
      {table.rows.map((row, index) => {
        const local = pose.localUnits.find((unit) => unit.id === row.id);
        const y = layout.rowY[index];
        return (
          <g key={row.id} data-relationship-id={row.id}>
            <path
              d={`M20 ${y - 12}H932`}
              stroke={S.cardBorder}
              strokeWidth={2 + (local ? pose.localLens : 0)}
            />
            {row.cells.map((cell, column) => (
              <DiagramText
                key={`${row.id}:${table.headings[column]}`}
                x={28 + column * layout.cellWidth}
                y={y + 12}
                size={layout.fontSize}
                columns={layout.columns}
                anchor="start"
              >
                {cell}
              </DiagramText>
            ))}
          </g>
        );
      })}
      {table.notes.map((note, index) => (
        <DiagramText
          key={note}
          x={28}
          y={layout.noteY[index]}
          size={22}
          columns={40}
          anchor="start"
        >
          {note}
        </DiagramText>
      ))}
    </g>
  );
}

/** Authored horizontal contact rail. Broken rails retain unresolved/negative source states. */
function CarrierLink({
  left,
  right,
  y,
  z,
  state,
  opacity = 1,
}: {
  left: number;
  right: number;
  y: number;
  z: number;
  state: string;
  opacity?: number;
}): React.ReactElement {
  const S = useStage();
  const connected = ['source-stated', 'observed', 'dependent', 'compatible'].includes(state);
  const width = Math.abs(right - left);
  const center = (left + right) / 2;
  // A broken rail never acquires a missing middle section because a beat has elapsed.
  const pieces = connected
    ? [{ id: 'connected', x: center, length: width }]
    : [
        { id: 'left', x: center - width * 0.35, length: width * 0.25 },
        { id: 'right', x: center + width * 0.35, length: width * 0.25 },
      ];
  return (
    <group userData={{ sourceState: state, connected }}>
      {pieces.map((piece) => (
        <mesh key={piece.id} position={[piece.x, y, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.025, 0.025, Math.max(0.001, piece.length), 8]} />
          <Clay color={S.cardBorder} opacity={opacity} />
        </mesh>
      ))}
    </group>
  );
}

/** Stage-free clay assemblies. Inspection changes poses, never source facts or occupancy. */
export function CommercialModelParts({ scene, seconds }: PartsProps): React.ReactElement {
  const S = useStage();
  const pose = sampleCommercial(scene, seconds);
  if (scene.kind === 'business-replication')
    return (
      <group
        name={`identity:${scene.business.id}`}
        userData={{ sourceIdentityId: scene.business.id }}
      >
        <group
          name={`identity:${scene.standard.id}`}
          position={[0, 1.3, -0.7]}
          scale={0.45}
          userData={{ sourceIdentityId: scene.standard.id }}
        >
          <FoldedDocument color={S.clay[0]} />
        </group>
        {scene.units.map((unit) => {
          const local = pose.localUnits.find((entry) => entry.id === unit.identity.id);
          const x = (local?.x ?? 0) * 4.6;
          return (
            <group key={unit.identity.id}>
              <group
                name={`identity:${unit.identity.id}`}
                position={[x, 0, 0]}
                scale={0.7 * (local?.scale ?? 1)}
                userData={{
                  sourceIdentityId: unit.identity.id,
                  standardId: scene.standard.id,
                  standardUse: unit.standardUse,
                  localDifference: unit.localDifference,
                }}
              >
                <BranchPod open={pose.inspection} />
                <group
                  name={`context:${unit.identity.id}`}
                  position={[0.45, 0.55, 0.9]}
                  scale={0.45}
                  userData={{
                    sourceState: unit.localDifference.state,
                    label: unit.localDifference.label,
                  }}
                >
                  <FoldedDocument color={S.clay[2]} />
                </group>
              </group>
              <group
                name={`standard-use:${unit.identity.id}`}
                userData={{
                  standardId: scene.standard.id,
                  unitId: unit.identity.id,
                  sourceState: unit.standardUse.state,
                }}
              >
                <CarrierLink left={0} right={x} y={0.8} z={-0.7} state={unit.standardUse.state} />
              </group>
            </group>
          );
        })}
      </group>
    );
  if (scene.preset === 'back-office')
    return (
      <group
        name={`identity:${scene.business.id}`}
        userData={{ sourceIdentityId: scene.business.id }}
      >
        <group position={[-0.8, 0, -0.15]} scale={0.85}>
          <StorefrontCutaway open={pose.inspection} />
        </group>
        <group
          name={`identity:${scene.service.id}`}
          position={[-0.55, 0.3, 1.05]}
          scale={0.4}
          userData={{ sourceIdentityId: scene.service.id }}
        >
          <FoldedDocument color={S.clay[0]} />
        </group>
        {scene.tasks.map((entry, index) => {
          const document = pose.documents.find((item) => item.id === entry.task.id);
          const z = (index - (scene.tasks.length - 1) / 2) * 0.34;
          const x = 1.8 + (document?.x ?? 0) * 0.12;
          return (
            <group key={entry.task.id}>
              <group
                name={`identity:${entry.task.id}`}
                position={[x, 0.55 + (document?.y ?? 0) * 0.1, z]}
                scale={0.4 * (document?.scale ?? 1)}
                userData={{
                  sourceIdentityId: entry.task.id,
                  serviceId: scene.service.id,
                  sourceState: entry.state,
                }}
              >
                <FoldedDocument color={S.clay[index % S.clay.length]} />
              </group>
              <CarrierLink left={0.65} right={x} y={0.18} z={z} state={entry.state} />
            </group>
          );
        })}
      </group>
    );
  if (scene.preset === 'service-slots')
    return (
      <group
        name={`identity:${scene.business.id}`}
        userData={{ sourceIdentityId: scene.business.id }}
      >
        <group
          name={`identity:${scene.service.id}`}
          position={[0, 0, -0.45]}
          scale={0.8}
          userData={{ sourceIdentityId: scene.service.id }}
        >
          <ServiceStation occupied={false} />
        </group>
        {(['reserved', 'used', 'available'] as const).map((role, index) => {
          const quantity = scene[role];
          return (
            <group
              key={role}
              name={`quantity:${role}`}
              position={[(index - 1) * 1.65, 0.4, 0.9]}
              scale={0.4}
              userData={{
                subjectId: scene.business.id,
                serviceId: scene.service.id,
                role,
                quantity,
              }}
            >
              {/* One fact document, never count-shaped decorative slots or derived occupancy. */}
              {quantity ? (
                <FoldedDocument color={S.clay[index % S.clay.length]} />
              ) : (
                <PaperTray width={0.9} depth={0.8} />
              )}
            </group>
          );
        })}
      </group>
    );
  if (scene.preset === 'service-lifecycle') {
    const stages = (['lead', 'booking', 'delivery'] as const).map((role) => ({
      role,
      ...scene[role],
    }));
    const artifacts = stages.filter(
      (stage, index) =>
        stages.findIndex((other) => other.identity.id === stage.identity.id) === index,
    );
    return (
      <group
        name={`identity:${scene.business.id}`}
        userData={{ sourceIdentityId: scene.business.id }}
      >
        <group position={[-1.5, 0, -0.25]} scale={0.7}>
          <WorkDesk width={1.8} depth={1.3} />
        </group>
        <group
          name={`identity:${scene.service.id}`}
          position={[1.45, 0, -0.4]}
          scale={0.65}
          userData={{ sourceIdentityId: scene.service.id }}
        >
          <ServiceStation occupied={false} />
        </group>
        {artifacts.map((artifact) => {
          const index = stages.findIndex((stage) => stage.role === artifact.role);
          const stagePose =
            artifact.role === 'booking'
              ? pose.booking
              : artifact.role === 'delivery'
                ? pose.delivery
                : null;
          const x =
            -1.8 +
            index * 1.45 +
            (stagePose?.approach ?? 0) * 0.15 +
            (stagePose?.accepted ?? 0) * 0.25;
          return (
            <group
              key={artifact.identity.id}
              name={`identity:${artifact.identity.id}`}
              position={[x, 0.55, 0.6]}
              scale={0.4}
              userData={{
                sourceIdentityId: artifact.identity.id,
                stages: stages
                  .filter((stage) => stage.identity.id === artifact.identity.id)
                  .map((stage) => ({ role: stage.role, state: stage.state })),
              }}
            >
              <FoldedDocument color={S.clay[index % S.clay.length]} />
            </group>
          );
        })}
        {stages.map((stage, index) => (
          <group
            key={stage.role}
            name={`stage:${stage.role}`}
            userData={{ artifactId: stage.identity.id, sourceState: stage.state }}
          >
            <CarrierLink
              left={-1.95 + index * 1.45}
              right={-1.2 + index * 1.45}
              y={0.2}
              z={0.6}
              state={stage.state}
            />
          </group>
        ))}
      </group>
    );
  }
  if (scene.preset === 'owner-dependency')
    return (
      <group
        name={`identity:${scene.business.id}`}
        userData={{ sourceIdentityId: scene.business.id }}
      >
        <group position={[-1.25, 0, -0.2]} scale={0.65}>
          <StorefrontCutaway open={pose.inspection} />
        </group>
        <group
          name={`identity:${scene.founder.id}`}
          position={[0.85, -0.7, 0.3]}
          scale={2.3}
          userData={{ sourceIdentityId: scene.founder.id }}
        >
          <Occupant />
        </group>
        <group
          name={`identity:${scene.task.id}`}
          position={[2.2, 0.45, 0.45]}
          scale={0.4}
          userData={{ sourceIdentityId: scene.task.id }}
        >
          <FoldedDocument color={S.clay[2]} />
        </group>
        <group
          name="founder-dependency"
          userData={{
            founderId: scene.founder.id,
            taskId: scene.task.id,
            sourceState: scene.dependency.state,
            removed: scene.dependency.state === 'removed',
          }}
        >
          <CarrierLink
            left={0.85}
            right={2.2}
            y={0.18}
            z={0.45}
            state={scene.dependency.state}
            opacity={1 - pose.dependencyRemoval}
          />
        </group>
      </group>
    );
  const moduleX = (id: string): number => {
    const index = scene.modules.findIndex((module) => module.id === id);
    return (
      (index - (scene.modules.length - 1) / 2) *
      Math.min(0.9, 4.4 / Math.max(1, scene.modules.length - 1))
    );
  };
  return (
    <group
      name={`identity:${scene.business.id}`}
      userData={{ sourceIdentityId: scene.business.id }}
    >
      <group
        name={`identity:${scene.service.id}`}
        position={[0, 0, -0.65]}
        scale={0.65}
        userData={{ sourceIdentityId: scene.service.id }}
      >
        <ServiceStation occupied={false} />
      </group>
      {scene.modules.map((module, index) => {
        const document = pose.documents.find((entry) => entry.id === module.id);
        return (
          <group
            key={module.id}
            name={`identity:${module.id}`}
            position={[moduleX(module.id), 0.5 + (document?.y ?? 0) * 0.1, 0.65]}
            scale={0.4 * (document?.scale ?? 1)}
            userData={{ sourceIdentityId: module.id, serviceId: scene.service.id }}
          >
            <FoldedDocument color={S.clay[index % S.clay.length]} />
          </group>
        );
      })}
      {scene.compatibility.map((entry, index) => (
        <group
          key={`${entry.leftModuleId}:${entry.rightModuleId}`}
          name={`compatibility:${entry.leftModuleId}:${entry.rightModuleId}`}
          userData={{
            sourceState: entry.state,
            leftModuleId: entry.leftModuleId,
            rightModuleId: entry.rightModuleId,
          }}
        >
          <CarrierLink
            left={moduleX(entry.leftModuleId)}
            right={moduleX(entry.rightModuleId)}
            y={0.18}
            z={0.75 + index * 0.04}
            state={entry.state}
          />
        </group>
      ))}
      {scene.repeatedOffering && (
        <group
          name="repeated-offering"
          position={[0, 0.5, -0.1]}
          scale={0.4}
          userData={{ sourceState: scene.repeatedOffering.state }}
        >
          <FoldedDocument color={S.clay[0]} />
        </group>
      )}
    </group>
  );
}

/** The existing wrapper owns the sole possible WebGL stage and the persistent story rails. */
export function CommercialSceneView({ scene }: { scene: CommercialScene }): React.ReactElement {
  const { t } = useSceneTime();
  return (
    <HybridStage
      scene={scene}
      settledOutcome
      model={<CommercialModelParts scene={scene} seconds={t} />}
      diagram={<CommercialDiagramParts scene={scene} seconds={t} />}
    />
  );
}
