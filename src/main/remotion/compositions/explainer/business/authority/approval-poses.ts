import { phaseProgress } from '../../technology/motion';
import type { AgentWorkflowScene } from '../../technology/types';

/** Presentation of the existing source-validated passing approval-gate contract. */
export interface ApprovalGateSample {
  subject: string;
  toolLabel: string;
  accepted: number;
  pending: boolean;
  called: boolean;
  returned: boolean;
  checked: boolean;
  completed: boolean;
}

export function sampleApprovalGate(
  scene: AgentWorkflowScene,
  seconds: number,
): ApprovalGateSample | null {
  const beats = [scene.setupAt, scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt];
  if (
    scene.preset !== 'approval-gate' ||
    !beats.every((at, index) => Number.isFinite(at) && (index === 0 || at > beats[index - 1]))
  )
    return null;
  const time = Number.isFinite(seconds)
    ? Math.max(scene.setupAt, Math.min(seconds, scene.resolveAt))
    : scene.setupAt;
  return {
    subject: scene.subject,
    toolLabel: scene.toolLabel,
    accepted: phaseProgress(time, scene.checkAt, scene.resolveAt),
    pending: time < scene.checkAt,
    called: time >= scene.actionAt,
    returned: time >= scene.responseAt,
    checked: time >= scene.checkAt,
    completed: time >= scene.resolveAt,
  };
}
