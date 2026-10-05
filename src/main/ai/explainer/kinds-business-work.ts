import { WORK_SOURCE_FIXTURES } from '../../remotion/compositions/explainer/business/work/fixtures';
import type {
  CoordinationMapScene,
  TaskMapScene,
  WorkRedesignScene,
} from '../../remotion/compositions/explainer/business/work/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import { parseCoordinationMap, parseTaskMap, parseWorkRedesign } from './business-work-contract';
import type { KindSpec } from './kind-spec';

export { parseCoordinationMap, parseTaskMap, parseWorkRedesign } from './business-work-contract';

/** Root kind/body integration is deliberately deferred; no assertion to the current Scene union. */
type WorkMetadata = Pick<
  KindSpec,
  'describe' | 'schema' | 'limits' | 'layouts' | 'durationSec' | 'family' | 'triggers' | 'avoid'
>;
export type TaskMapSpec = WorkMetadata & {
  kind: 'task-map';
  parse: typeof parseTaskMap;
  cues: typeof taskMapCues;
};
export type CoordinationMapSpec = WorkMetadata & {
  kind: 'coordination-map';
  parse: typeof parseCoordinationMap;
  cues: typeof coordinationMapCues;
};
export type WorkRedesignSpec = WorkMetadata & {
  kind: 'work-redesign';
  parse: typeof parseWorkRedesign;
  cues: typeof workRedesignCues;
};

function sourceExamples(
  kind: TaskMapScene['kind'] | CoordinationMapScene['kind'] | WorkRedesignScene['kind'],
): string {
  return WORK_SOURCE_FIXTURES.filter((fixture) => fixture.raw.kind === kind)
    .map((fixture) => {
      const raw = Object.fromEntries(
        Object.entries(fixture.raw).filter(
          ([key]) => key !== 'startWord' && key !== 'endWord' && key !== 'layout',
        ),
      );
      return `${fixture.id}: ${JSON.stringify(raw)}`;
    })
    .join('\n');
}
const COMMON_LIMITS =
  'Use the offered source-word indices for all five beats setupWord/actionWord/responseWord/checkWord/resolveWord and every source.fromWord/toWord. Final reading hold >=0.8s; 5–12s scene. labels <=28 chars; phase/outcome <=40. <=8 unique semantic identities, <=4 task identities, <=12 supported relationships, <=2 native holds (global ceiling remains4). Fixed-font natural table height <=478px: split source, never shrink text or omit facts. All nested fields are strict. diagram/hybrid only as frozen by recipe. No geometry, styles, assets, URLs, code, stamps or emphasis. Keep conditional, pending, denied and unknown states; configured is not observed. Unknown quantities use value:null and basis:null unless a basis is actually stated; observed/configured quantities require subjectId/population/unit/period/denominator/source. Compare only explicitly comparable observed quantities. Source dates and versions must be quoted, never invented.';

/** Neutral authored SFX at the source beats, never success/approval stamps. */
export function taskMapCues(scene: TaskMapScene): SceneCue[] {
  return [
    { kind: 'flip', at: scene.setupAt, gain: 0.16 },
    { kind: 'slide', at: scene.actionAt, gain: 0.22 },
    { kind: 'tick', at: scene.responseAt, gain: 0.18 },
    { kind: 'tick', at: scene.checkAt, gain: 0.16 },
    { kind: 'tick', at: scene.resolveAt, gain: 0.14 },
  ];
}
export function coordinationMapCues(scene: CoordinationMapScene): SceneCue[] {
  return [
    { kind: 'flip', at: scene.setupAt, gain: 0.16 },
    { kind: 'slide', at: scene.actionAt, gain: 0.22 },
    { kind: 'tick', at: scene.responseAt, gain: 0.18 },
    { kind: 'tick', at: scene.checkAt, gain: 0.16 },
    { kind: 'tick', at: scene.resolveAt, gain: 0.14 },
  ];
}
export function workRedesignCues(scene: WorkRedesignScene): SceneCue[] {
  return [
    { kind: 'flip', at: scene.setupAt, gain: 0.16 },
    { kind: 'slide', at: scene.actionAt, gain: 0.22 },
    { kind: 'tick', at: scene.responseAt, gain: 0.18 },
    { kind: 'tick', at: scene.checkAt, gain: 0.16 },
    { kind: 'tick', at: scene.resolveAt, gain: 0.14 },
  ];
}

export const TASK_MAP_SPEC: TaskMapSpec = {
  kind: 'task-map',
  family: 'framework',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe:
    'Source-stated tasks within a job, explicit performer/approver/accountability, or tested capability boundaries. Capability never means permission or completed work.',
  schema: sourceExamples('task-map'),
  limits: `${COMMON_LIMITS} OP-01 task-split: distinct job, actors, 2–3 tasks, splits and ownership for each task. OP-04 responsibility: actors, 1–3 tasks, ownership. Ownership requires performerId/approverId/accountableOwnerId and separate local role claims; null approver only for explicitly no approval. OP-02 capability-boundary is DIAGRAM ONLY: actors/tasks and 1–4 capabilities with actorId/taskId/state/source, optional source condition only for conditional. Capability state tested/unavailable/unknown/conditional cannot be inferred from permission or a performance verb. All presets accept up to2 explicitly sourced holds.`,
  triggers: [
    /\b(?:task split|task ownership|accountable owner|capability boundary)\b/i,
    /\b(?:performs?|performer)\b.{0,80}\b(?:approver|accountable|approves?)\b/i,
    /\b(?:tested|unavailable|unknown) capability\b/i,
  ],
  avoid:
    'Not a whole-job replacement, generic AI/business claim, permission grant, completion claim or layoff prediction.',
  parse: parseTaskMap,
  cues: taskMapCues,
};
export const COORDINATION_MAP_SPEC: CoordinationMapSpec = {
  kind: 'coordination-map',
  family: 'process',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe:
    'Named cross-function handoffs, supervised review fanout, explicitly based handoff/approval load, or source-stated before/after bottleneck constraints.',
  schema: sourceExamples('coordination-map'),
  limits: `${COMMON_LIMITS} OP-03 cross-function: actors/tasks, 1–4 handoffs naming fromActorId/toActorId/taskId/state/source. OP-07 supervised-fanout: supervisor/delegates/tasks, 1–4 reviews naming reviewerId/performerId/taskId/state/source, reviewCapacity. OP-08 handoff-load: actors/tasks/handoffs plus load for the named subject. OP-32 approval-load: actors/tasks, queue.identity/reviewerId/state/source, reviews, load and reviewCapacity. Queue identity must explicitly be an approval queue; the named reviewer source must explicitly approve or be approver for every queued task, not merely review it. OP-80 bottleneck-shift: actors/tasks, before/after actorId/taskId/state/phase.label/phase.source/source; comparison:null or before/after explicitly based observed measures and its source. Constraints include constrained/released/pending/denied/unknown/conditional. Review is not approval and handoff is not observed completion. No bottleneck releases merely because time passed.`,
  triggers: [
    /\b(?:handoffs?|review queue|approval load|review capacity|supervised fanout|bottleneck)\b/i,
    /\b(?:hands|reviews)\b.{0,80}\b(?:to|from)\b/i,
    /\bconstraint\b.{0,24}\bconstrained\b/i,
  ],
  avoid:
    'Not anonymous graph nodes, generic teamwork/AI, invented review capacity or unsupported throughput improvement.',
  parse: parseCoordinationMap,
  cues: coordinationMapCues,
};
export const WORK_REDESIGN_SPEC: WorkRedesignSpec = {
  kind: 'work-redesign',
  family: 'story',
  layouts: ['stack', 'stack-flipped', 'takeover', 'pip', 'over'],
  durationSec: [5, 12],
  describe:
    'Trace named expertise or owner knowledge into a recorded artifact, explicit revision approval and later use; or retain the same worker across source-stated task redeployment.',
  schema: sourceExamples('work-redesign'),
  limits: `${COMMON_LIMITS} OP-05 expertise-transfer: expert/expertiseSource, recorder/receiver/approver/task/record/playbook; OP-18 owner-playbook uses owner/ownerSource instead. playbook requires identity/version/source. capture needs recorderId/expertId/taskId/recordId/state/source. approval needs approverId/taskId/playbookId/version/state/source; approved requires separate ordered evidence after observed capture. use needs actorId/taskId/playbookId/version/state/source; observed use requires the exact explicitly approved revision after approval. Capturing expertise is not approval or model retraining. OP-06 redeployment: worker, beforeTasks/afterTasks, source-bound before/after phases, allocations with same actorId/taskId/phase/state/source; all displayed tasks have explicit allocations. Skills/automation cannot imply layoffs. Actor reuse across roles is permitted only with each role explicitly stated.`,
  triggers: [
    /\b(?:captures?|records?) (?:expertise|knowledge)\b/i,
    /\b(?:redeploy\w*|task allocation|playbook revision|owner playbook)\b/i,
    /\b(?:approves?|uses?)\b.{0,60}\b(?:playbook|revision)\b/i,
  ],
  avoid:
    'Not inferred job loss, approved playbook from mere recording, employee retraining or neural-network model training.',
  parse: parseWorkRedesign,
  cues: workRedesignCues,
};
