import type { BusinessIdentity } from '../types';
import type { BusinessWorkScene } from './types';

/** Semantic identities are derived from concrete facts, never a model-selected graph. */
export function workIdentities(scene: BusinessWorkScene): BusinessIdentity[] {
  let entries: BusinessIdentity[];
  if (scene.kind === 'task-map') {
    entries = [...scene.actors, ...scene.tasks];
    if (scene.preset === 'task-split') entries.unshift(scene.job);
  } else if (scene.kind === 'coordination-map') {
    entries =
      scene.preset === 'supervised-fanout'
        ? [scene.supervisor, ...scene.delegates, ...scene.tasks]
        : [...scene.actors, ...scene.tasks];
    if (scene.preset === 'approval-load') entries.push(scene.queue.identity);
  } else if (scene.preset === 'redeployment') {
    entries = [scene.worker, ...scene.beforeTasks, ...scene.afterTasks];
  } else {
    entries = [
      scene.preset === 'expertise-transfer' ? scene.expert : scene.owner,
      scene.recorder,
      scene.receiver,
      scene.approver,
      scene.task,
      scene.record,
      scene.playbook.identity,
    ];
  }
  return entries.filter(
    (entry, index) => entries.findIndex((other) => other.id === entry.id) === index,
  );
}
