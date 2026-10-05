import {
  type BusinessClock,
  businessPhases,
  type HandshakeState,
  type NamedMotion,
  sampleConstraintFocus,
  sampleHandshake,
  sampleProvenance,
  sampleTaskSplit,
} from '../motion';
import { workIdentities } from './identities';
import type { BusinessWorkScene, WorkActionState } from './types';

export interface WorkScenePose {
  setup: number;
  action: number;
  response: number;
  check: number;
  tasks: NamedMotion[];
  transfers: { id: string; state: HandshakeState; approach: number; accepted: number }[];
  focus: { id: string; focus: number; opacity: number }[];
  provenance: { id: string; opacity: number; linkProgress: number }[];
}
function gate(state: WorkActionState): HandshakeState {
  return state === 'observed' ? 'approved' : state === 'denied' ? 'denied' : 'pending';
}

/** Only observed source actions cross acceptance. Configuration/conditions are not completion. */
export function sampleWorkScene(scene: BusinessWorkScene, seconds: number): WorkScenePose {
  const clock: BusinessClock = { frame: seconds * 30, fps: 30, beats: scene };
  const phases = businessPhases(clock);
  const taskIds =
    scene.kind === 'work-redesign'
      ? scene.preset === 'redeployment'
        ? [...scene.beforeTasks, ...scene.afterTasks].map((task) => task.id)
        : [scene.task.id]
      : scene.tasks.map((task) => task.id);
  const tasks = sampleTaskSplit(clock, [...new Set(taskIds)]);
  const transfers: WorkScenePose['transfers'] = [];
  let focusedId = '';
  const provenanceIds: string[] = [];
  if (scene.kind === 'task-map' && scene.preset === 'capability-boundary') {
    focusedId =
      scene.capabilities.find((capability) => capability.state !== 'tested')?.taskId ?? '';
  }
  if (scene.kind === 'coordination-map') {
    if (scene.preset === 'cross-function' || scene.preset === 'handoff-load') {
      for (const handoff of scene.handoffs) {
        transfers.push({
          id: `${handoff.fromActorId}:${handoff.toActorId}:${handoff.taskId}`,
          ...sampleHandshake(clock, gate(handoff.state)),
        });
      }
    } else if (scene.preset === 'supervised-fanout' || scene.preset === 'approval-load') {
      for (const review of scene.reviews) {
        transfers.push({
          id: `${review.performerId}:${review.reviewerId}:${review.taskId}`,
          ...sampleHandshake(clock, gate(review.state)),
        });
      }
      focusedId =
        scene.preset === 'supervised-fanout' ? scene.supervisor.id : scene.queue.reviewerId;
    } else {
      // Emphasize the next stated constraint without claiming the earlier one was cleared.
      focusedId =
        scene.after.state === 'constrained' && phases.response === 1
          ? scene.after.actorId
          : scene.before.actorId;
    }
  }
  if (scene.kind === 'work-redesign') {
    if (scene.preset === 'redeployment') {
      focusedId = scene.worker.id;
    } else {
      provenanceIds.push(scene.record.id, scene.playbook.identity.id, scene.task.id);
      transfers.push({ id: scene.record.id, ...sampleHandshake(clock, gate(scene.capture.state)) });
      transfers.push({
        id: scene.playbook.identity.id,
        ...sampleHandshake(
          clock,
          scene.approval.state === 'approved'
            ? 'approved'
            : scene.approval.state === 'denied'
              ? 'denied'
              : 'pending',
        ),
      });
      transfers.push({ id: scene.task.id, ...sampleHandshake(clock, gate(scene.use.state)) });
      focusedId = scene.receiver.id;
    }
  }
  return {
    setup: phases.setup,
    action: phases.action,
    response: phases.response,
    check: phases.check,
    tasks,
    transfers,
    focus: sampleConstraintFocus(
      clock,
      workIdentities(scene).map((entity) => entity.id),
      focusedId,
    ),
    provenance: sampleProvenance(clock, provenanceIds),
  };
}
