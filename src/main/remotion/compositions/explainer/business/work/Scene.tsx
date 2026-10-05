import type React from 'react';
import { FoldedDocument, WorkDesk } from '../../cognition/models';
import { OwnershipTray } from '../../concepts/business-operations/models';
import { TaskFolder } from '../../concepts/inference/models';
import { HybridStage } from '../../diagrams/HybridStage';
import { DiagramText } from '../../diagrams/primitives';
import { Occupant } from '../../spatial/parts';
import { useSceneTime, useStage } from '../../stage';
import { ApprovalRail, PlaybookBinder } from '../assets/authority';
import { OperatingDesk } from '../assets/retail';
import { sampleWorkScene, type WorkScenePose } from './poses';
import { layoutWorkTable, workTable } from './presentation';
import type { BusinessWorkScene } from './types';

/** No stage/canvas: reusable by the board's authored business adapter. */
export function WorkDiagramParts({
  scene,
  pose,
}: {
  scene: BusinessWorkScene;
  pose: WorkScenePose;
}): React.ReactElement {
  const S = useStage();
  const table = workTable(scene);
  const layout = layoutWorkTable(table);
  const width = layout.cellWidth;
  return (
    <g data-business-recipe={scene.recipeId} opacity={pose.setup}>
      {table.headings.map((heading, index) => (
        <DiagramText
          key={heading}
          x={28 + index * width}
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
        const transfer = pose.transfers.find((entry) => entry.id === row.id);
        const focus = Math.max(
          0,
          ...pose.focus
            .filter((entry) => row.focusIds?.includes(entry.id) ?? entry.id === row.id)
            .map((entry) => entry.focus),
        );
        const provenance = pose.provenance.find((entry) => entry.id === row.id)?.opacity ?? 1;
        const split = pose.tasks.find((entry) => entry.id === row.id);
        const y = layout.rowY[index];
        return (
          <g
            key={row.id}
            data-relationship-id={row.id}
            opacity={provenance}
            transform={`translate(${split ? split.x * (1 - pose.action) * 14 : 0} 0)`}
          >
            <path d={`M20 ${y - 12}H932`} stroke={S.cardBorder} strokeWidth={2 + focus * 2} />
            {row.cells.map((cell, column) => (
              <DiagramText
                key={`${row.id}:${table.headings[column]}`}
                x={28 + column * width}
                y={y + 12}
                size={layout.fontSize}
                columns={layout.columns}
                anchor="start"
              >
                {cell}
              </DiagramText>
            ))}
            {transfer && (
              <path
                d={`M${width * 2 - 15} ${y + 28}h${12 + transfer.approach * 20}`}
                stroke={S.text}
                strokeWidth={3}
                strokeDasharray={transfer.state === 'approved' ? undefined : '4 4'}
              />
            )}
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

/** Stable document IDs survive a split or a pending transfer; no frame grants authority. */
export function WorkModelParts({
  scene,
  pose,
}: {
  scene: BusinessWorkScene;
  pose: WorkScenePose;
}): React.ReactElement {
  const S = useStage();
  if (scene.kind === 'work-redesign' && scene.preset !== 'redeployment') {
    return (
      <group>
        <group
          name={`record:${scene.record.id}`}
          position={[-2.3, -0.1, 0]}
          scale={
            0.85 * (pose.provenance.find((entry) => entry.id === scene.record.id)?.opacity ?? 0)
          }
        >
          <FoldedDocument color={S.clay[0]} />
        </group>
        <group
          name={`playbook:${scene.playbook.identity.id}:${scene.playbook.version}`}
          scale={
            0.9 *
            (pose.provenance.find((entry) => entry.id === scene.playbook.identity.id)?.opacity ?? 0)
          }
        >
          <PlaybookBinder open={pose.action} revision={0} />
        </group>
        <group
          name={`task:${scene.task.id}`}
          position={[2.3, -0.1, 0]}
          scale={0.85 * (pose.provenance.find((entry) => entry.id === scene.task.id)?.opacity ?? 0)}
        >
          <FoldedDocument color={S.clay[2]} />
        </group>
      </group>
    );
  }
  if (scene.kind === 'work-redesign' && scene.preset === 'redeployment') {
    const observedAfter = scene.allocations.some(
      (entry) => entry.phase === 'after' && entry.state === 'observed',
    );
    return (
      <group>
        <group
          name={`worker:${scene.worker.id}`}
          userData={{ sourceIdentityId: scene.worker.id }}
          position={[-1.8 + (observedAfter ? 3.6 * pose.response : 0), -0.7, 0.75]}
          scale={2.5}
        >
          <Occupant />
        </group>
        {[...scene.beforeTasks, ...scene.afterTasks]
          .filter((task, index, all) => all.findIndex((entry) => entry.id === task.id) === index)
          .map((task) => {
            const before = scene.beforeTasks.some((entry) => entry.id === task.id);
            const list = before ? scene.beforeTasks : scene.afterTasks;
            const index = list.findIndex((entry) => entry.id === task.id);
            return (
              <group
                key={task.id}
                name={`task:${task.id}`}
                userData={{ sourceIdentityId: task.id }}
                position={[before ? -1.8 : 1.8, 0.4, (index - (list.length - 1) / 2) * 0.6 - 0.2]}
                scale={0.65}
              >
                <FoldedDocument color={S.clay[before ? 0 : 2]} />
              </group>
            );
          })}
        <WorkDesk width={5.3} depth={1.4} />
      </group>
    );
  }
  const approval = scene.kind === 'coordination-map' && scene.preset === 'approval-load';
  const pendingPaperwork =
    scene.holds.some((hold) => hold.state === 'pending') ||
    (approval && scene.queue.state === 'pending');
  const actors =
    scene.kind === 'coordination-map'
      ? scene.preset === 'supervised-fanout'
        ? [scene.supervisor, ...scene.delegates]
        : scene.actors
      : scene.actors;
  const actorX = (id: string): number => {
    const index = actors.findIndex((entry) => entry.id === id);
    return index < 0
      ? 0
      : (index - (actors.length - 1) / 2) * Math.min(1.25, 5.4 / Math.max(1, actors.length));
  };
  const routes =
    scene.kind === 'coordination-map'
      ? scene.preset === 'cross-function' || scene.preset === 'handoff-load'
        ? scene.handoffs.map((entry) => ({
            taskId: entry.taskId,
            from: entry.fromActorId,
            to: entry.toActorId,
            id: `${entry.fromActorId}:${entry.toActorId}:${entry.taskId}`,
          }))
        : scene.preset === 'supervised-fanout' || scene.preset === 'approval-load'
          ? scene.reviews.map((entry) => ({
              taskId: entry.taskId,
              from: entry.performerId,
              to: entry.reviewerId,
              id: `${entry.performerId}:${entry.reviewerId}:${entry.taskId}`,
            }))
          : []
      : [];
  return (
    <group>
      {scene.kind === 'task-map' && scene.preset === 'task-split' && (
        <group name={`job:${scene.job.id}`} position={[0, 0.45, -0.65]} scale={0.7}>
          <TaskFolder />
        </group>
      )}
      {scene.kind === 'coordination-map' &&
        actors.map((actor) => (
          <group
            key={actor.id}
            name={`inbox:${actor.id}`}
            userData={{ sourceIdentityId: actor.id }}
            position={[actorX(actor.id), 0, -0.65]}
            scale={0.45}
          >
            <OwnershipTray x={0} />
          </group>
        ))}
      {pendingPaperwork ? <OperatingDesk pending /> : <WorkDesk width={2.8} depth={1.4} />}
      {pose.tasks.map((task, index) => {
        // A single carrier per semantic task. The complete diagram retains all declared links.
        const route = routes.find((entry) => entry.taskId === task.id);
        const transfer = route ? pose.transfers.find((entry) => entry.id === route.id) : undefined;
        const x =
          route && transfer
            ? actorX(route.from) +
              (actorX(route.to) - actorX(route.from)) *
                (0.45 * transfer.approach + 0.55 * transfer.accepted)
            : task.x * 1.1;
        return (
          <group
            key={task.id}
            name={`task:${task.id}`}
            userData={{ sourceIdentityId: task.id }}
            position={[x, 0.55 + task.y * 0.28, route ? -0.3 : 0.4]}
            scale={0.6 * task.scale}
          >
            <FoldedDocument color={S.clay[index % S.clay.length]} />
          </group>
        );
      })}
      {approval && (
        <group
          name={`approval-queue:${scene.queue.identity.id}`}
          position={[0, -0.4, -1.35]}
          scale={0.85}
        >
          <ApprovalRail accepted={0} />
        </group>
      )}
    </group>
  );
}
export function BusinessWorkSceneView({ scene }: { scene: BusinessWorkScene }): React.ReactElement {
  const { t } = useSceneTime();
  const pose = sampleWorkScene(scene, t);
  return (
    <HybridStage
      scene={scene}
      settledOutcome
      model={<WorkModelParts scene={scene} pose={pose} />}
      diagram={<WorkDiagramParts scene={scene} pose={pose} />}
    />
  );
}
