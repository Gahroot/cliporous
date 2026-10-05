import { labelLines } from '../../diagrams/layout';
import { workIdentities } from './identities';
import type { BusinessWorkScene, WorkMeasure } from './types';

export interface WorkRow {
  id: string;
  focusIds?: readonly string[];
  cells: readonly string[];
}
export interface WorkTable {
  headings: readonly string[];
  rows: readonly WorkRow[];
  notes: readonly string[];
}
function name(scene: BusinessWorkScene, id: string | null): string {
  return id === null
    ? 'No approval'
    : (workIdentities(scene).find((entry) => entry.id === id)?.label ?? 'Not stated');
}
function measure(scene: BusinessWorkScene, label: string, value: WorkMeasure): string {
  if (value.state === 'unknown') return `${label}: not stated`;
  const b = value.basis;
  return `${label} (${value.state}): ${value.value} ${b.unit}; ${name(scene, b.subjectId)}; ${b.population}; ${b.period}; denominator ${b.denominator ?? 'not stated'}`;
}
/** A factual projection of concrete contracts, not model-selected graph instructions. */
export function workTable(scene: BusinessWorkScene): WorkTable {
  const notes = scene.holds.map(
    (hold) => `${name(scene, hold.actorId)} / ${name(scene, hold.taskId)}: ${hold.state}`,
  );
  if (scene.kind === 'task-map') {
    if (scene.preset === 'capability-boundary')
      return {
        headings: ['Actor', 'Task', 'Capability'],
        rows: scene.capabilities.map((entry) => ({
          id: `${entry.actorId}:${entry.taskId}`,
          focusIds: [entry.actorId, entry.taskId],
          cells: [name(scene, entry.actorId), name(scene, entry.taskId), entry.state],
        })),
        notes,
      };
    if (scene.preset === 'task-split') notes.unshift(`Job: ${scene.job.label}`);
    return {
      headings: ['Task', 'Performer', 'Approver', 'Accountable'],
      rows: scene.ownership.map((entry) => ({
        id: entry.taskId,
        cells: [
          name(scene, entry.taskId),
          name(scene, entry.performerId),
          name(scene, entry.approverId),
          name(scene, entry.accountableOwnerId),
        ],
      })),
      notes,
    };
  }
  if (scene.kind === 'coordination-map') {
    if (scene.preset === 'cross-function' || scene.preset === 'handoff-load') {
      if (scene.preset === 'handoff-load')
        notes.unshift(measure(scene, 'Handoff load', scene.load));
      return {
        headings: ['Task', 'From', 'To', 'Handoff'],
        rows: scene.handoffs.map((entry) => ({
          id: `${entry.fromActorId}:${entry.toActorId}:${entry.taskId}`,
          focusIds: [entry.taskId, entry.fromActorId, entry.toActorId],
          cells: [
            name(scene, entry.taskId),
            name(scene, entry.fromActorId),
            name(scene, entry.toActorId),
            entry.state,
          ],
        })),
        notes,
      };
    }
    if (scene.preset === 'supervised-fanout' || scene.preset === 'approval-load') {
      notes.unshift(measure(scene, 'Review capacity', scene.reviewCapacity));
      if (scene.preset === 'approval-load')
        notes.unshift(
          `${scene.queue.identity.label}: ${scene.queue.state}`,
          measure(scene, 'Queue load', scene.load),
        );
      return {
        headings: ['Task', 'Performer', 'Reviewer', 'Review'],
        rows: scene.reviews.map((entry) => ({
          id: `${entry.performerId}:${entry.reviewerId}:${entry.taskId}`,
          focusIds: [entry.taskId, entry.performerId, entry.reviewerId],
          cells: [
            name(scene, entry.taskId),
            name(scene, entry.performerId),
            name(scene, entry.reviewerId),
            entry.state,
          ],
        })),
        notes,
      };
    }
    if (scene.comparison)
      notes.unshift(
        measure(scene, 'Before', scene.comparison.before),
        measure(scene, 'After', scene.comparison.after),
      );
    return {
      headings: ['Phase', 'Actor', 'Task', 'Constraint'],
      rows: [scene.before, scene.after].map((entry, index) => ({
        id: index === 0 ? 'before' : 'after',
        focusIds: [entry.actorId, entry.taskId],
        cells: [
          entry.phase.label,
          name(scene, entry.actorId),
          name(scene, entry.taskId),
          entry.state,
        ],
      })),
      notes,
    };
  }
  if (scene.preset === 'redeployment')
    return {
      headings: ['Worker', 'Task', 'Phase', 'Assignment'],
      rows: scene.allocations.map((entry) => ({
        id: `${entry.phase}:${entry.taskId}`,
        focusIds: [scene.worker.id, entry.taskId],
        cells: [
          scene.worker.label,
          name(scene, entry.taskId),
          entry.phase === 'before' ? scene.before.label : scene.after.label,
          entry.state,
        ],
      })),
      notes,
    };
  notes.unshift(
    `${scene.preset === 'expertise-transfer' ? 'Expert' : 'Owner'}: ${scene.preset === 'expertise-transfer' ? scene.expert.label : scene.owner.label}`,
    `Version: ${scene.playbook.version}`,
  );
  return {
    headings: ['Evidence path', 'Responsible actor', 'State'],
    rows: [
      {
        id: scene.record.id,
        cells: [scene.record.label, scene.recorder.label, scene.capture.state],
      },
      {
        id: scene.playbook.identity.id,
        cells: [scene.playbook.identity.label, scene.approver.label, scene.approval.state],
      },
      {
        id: scene.task.id,
        focusIds: [scene.task.id, scene.receiver.id],
        cells: [scene.task.label, scene.receiver.label, scene.use.state],
      },
    ],
    notes,
  };
}
export interface WorkTableLayout {
  cellWidth: number;
  columns: number;
  fontSize: number;
  rowY: readonly number[];
  rowHeights: readonly number[];
  noteY: readonly number[];
  height: number;
}
/** Fixed text size, natural line height. Reject/split excess content; never silently shrink it. */
export function layoutWorkTable(table: WorkTable): WorkTableLayout {
  const fontSize = table.headings.length === 4 ? 22 : 24;
  const columns = table.headings.length === 4 ? 9 : 12;
  const rowY: number[] = [];
  const rowHeights: number[] = [];
  const noteY: number[] = [];
  let height = 60;
  for (const row of table.rows) {
    rowY.push(height);
    const lines = Math.max(1, ...row.cells.map((cell) => labelLines(cell, columns).length));
    const rowHeight = lines * fontSize * 1.2 + 20;
    rowHeights.push(rowHeight);
    height += rowHeight;
  }
  height += 16;
  for (const note of table.notes) {
    noteY.push(height);
    height += labelLines(note, 40).length * 26.4 + 12;
  }
  return {
    cellWidth: 920 / table.headings.length,
    columns,
    fontSize,
    rowY,
    rowHeights,
    noteY,
    height,
  };
}
export function workPresentationFits(scene: BusinessWorkScene): boolean {
  return layoutWorkTable(workTable(scene)).height <= 478;
}
