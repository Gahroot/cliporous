import type { LongformScenePlacement } from '../../../shared/longform-scenes';
import { STORYBOARD_LIMITS as L, type StoryboardDiagnostic } from '../../../shared/storyboards';

const firstFrame = (s: LongformScenePlacement) => Math.floor(s.startTime * 30 + 1e-6);
const lastFrame = (s: LongformScenePlacement) => Math.ceil(s.endTime * 30 - 1e-6);
export function storyboardWindowsOverlap(
  a: LongformScenePlacement,
  b: LongformScenePlacement,
): boolean {
  return firstFrame(a) < lastFrame(b) && firstFrame(b) < lastFrame(a);
}
const order = (a: LongformScenePlacement, b: LongformScenePlacement) =>
  a.startTime - b.startTime || a.id.localeCompare(b.id);
const durationSec = (s: LongformScenePlacement) => (lastFrame(s) - firstFrame(s)) / 30;

/** Also enforced at the saved-plan boundary, not just on model proposals. Omitted boards cost zero. */
export function storyboardPolicyProblem(
  scenes: readonly LongformScenePlacement[],
  duration: number,
): string | null {
  const boards = scenes.filter((s) => s.kind === 'storyboard' && !s.omitted).sort(order);
  if (boards.length > (duration <= L.longSourceSec ? 1 : L.maxBoards))
    return 'Storyboard count budget exceeded.';
  if (
    duration > L.longSourceSec &&
    boards.reduce((n, s) => n + durationSec(s), 0) > duration * L.maxCoverage + 1e-6
  )
    return 'Storyboard source coverage budget exceeded.';
  for (let i = 1; i < boards.length; i++) {
    if (firstFrame(boards[i]) - lastFrame(boards[i - 1]) < L.minSeparationSec * 30)
      return 'Storyboards require ten seconds of separation.';
  }
  return null;
}

export interface StoryboardArbitration {
  scenes: LongformScenePlacement[];
  diagnostics: StoryboardDiagnostic[];
  replacements: { boardId: string; sceneId: string; sectionId: string }[];
}

/** Source-order global arbitration, independent of model completion order.
 * Protected/omitted decisions win; never trim a full-window story to make room. */
export function arbitrateStoryboards(input: {
  ordinary: readonly LongformScenePlacement[];
  proposals: readonly LongformScenePlacement[];
  protectedScenes: readonly LongformScenePlacement[];
  duration: number;
}): StoryboardArbitration {
  let ordinary = [...input.ordinary];
  const accepted = [...input.protectedScenes];
  const diagnostics: StoryboardDiagnostic[] = [];
  const replacements: StoryboardArbitration['replacements'] = [];
  const reject = (s: LongformScenePlacement, message: string) =>
    diagnostics.push({ code: 'conflict', sourceId: s.id, message, repairable: false });
  const seen = new Set(accepted.map((s) => s.id));
  for (const board of [...input.proposals].sort(order)) {
    if (seen.has(board.id)) {
      reject(board, 'Duplicate or protected board identity.');
      continue;
    }
    seen.add(board.id);
    // Omitted input is a saved decision, never a candidate consuming the visual budget.
    if (board.omitted) {
      accepted.push(board);
      continue;
    }
    if (accepted.some((s) => storyboardWindowsOverlap(s, board))) {
      reject(board, 'Protected or previously accepted complete window wins.');
      continue;
    }
    const conflicts = ordinary.filter((s) => storyboardWindowsOverlap(s, board));
    if (
      conflicts.some(
        (s) => s.omitted || firstFrame(s) < firstFrame(board) || lastFrame(s) > lastFrame(board),
      )
    ) {
      reject(board, 'Partial overlap with a complete explanation; ordinary plan retained.');
      continue;
    }
    const problem = storyboardPolicyProblem([...accepted, board], input.duration);
    if (problem) {
      reject(board, problem);
      continue;
    }
    for (const scene of conflicts)
      replacements.push({ boardId: board.id, sceneId: scene.id, sectionId: scene.sectionId });
    const removed = new Set(conflicts.map((s) => s.id));
    ordinary = ordinary.filter((s) => !removed.has(s.id));
    accepted.push(board);
  }
  return { scenes: [...accepted, ...ordinary].sort(order), diagnostics, replacements };
}
