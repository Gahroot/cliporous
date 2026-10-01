import { contactOffset, phaseProgress, type TechnologyPoint, travelPoint } from './motion';
import type { AgentWorkflowScene, TechnologyStatus } from './types';

/** One desk, three working zones. These coordinates never come from model JSON. */
export const AGENT_WORKFLOW_DESK = {
  agent: { x: 136, y: 415 },
  tool: { x: 698, y: 348 },
  retry: { x: 550, y: 348 },
  check: { x: 698, y: 600 },
  return: { x: 136, y: 600 },
  ticketWidth: 244,
} as const;

/** The extra retry contacts subdivide response→check; they are not new model beats. */
export function agentWorkflowTiming(scene: AgentWorkflowScene) {
  const responseSpan = scene.checkAt - scene.responseAt;
  return {
    retryAt: scene.responseAt + responseSpan * 0.32,
    retryTurnAt: scene.responseAt + responseSpan * 0.45,
    retryContactAt: scene.responseAt + responseSpan * 0.58,
    resultAt:
      scene.preset === 'tool-retry' ? scene.responseAt + responseSpan * 0.72 : scene.responseAt,
    releaseAt: scene.checkAt + (scene.resolveAt - scene.checkAt) * 0.3,
    returnAt: scene.checkAt + (scene.resolveAt - scene.checkAt) * 0.72,
  };
}

export interface AgentWorkflowPose {
  task: TechnologyPoint;
  subject: string;
  phase:
    | 'setup'
    | 'call'
    | 'stopped'
    | 'retry'
    | 'result'
    | 'approval-requested'
    | 'checked'
    | 'resolved';
  toolStatus: TechnologyStatus;
  checkStatus: TechnologyStatus;
  toolOffset: number;
  gateOpen: number;
  resultVisible: boolean;
  approvalRequested: boolean;
  approvalGranted: boolean;
  verified: boolean;
  completed: boolean;
  conditional: boolean;
  outcomeOpacity: number;
}

/** Pure, bounded and frame-seekable. No state, frame clock, randomness or idle motion. */
export function agentWorkflowPose(
  scene: AgentWorkflowScene,
  timeSeconds: number,
): AgentWorkflowPose {
  const t = Number.isFinite(timeSeconds) ? Math.min(timeSeconds, scene.resolveAt) : scene.setupAt;
  const D = AGENT_WORKFLOW_DESK;
  const timing = agentWorkflowTiming(scene);
  const retry = scene.preset === 'tool-retry';
  const approval = scene.preset === 'approval-gate';
  const conditional = Boolean(scene.condition);
  const stopped = retry && t >= scene.responseAt && t < timing.retryAt;
  const retrying = retry && t >= timing.retryAt && t < timing.resultAt;
  const checked = t >= scene.checkAt;
  const resolved = t >= scene.resolveAt;
  const resultVisible = t >= timing.resultAt;
  let task: TechnologyPoint = travelPoint(t, scene.setupAt, scene.actionAt, D.agent, D.tool);

  if (retry && t >= timing.retryAt && t < timing.retryContactAt) {
    task =
      t < timing.retryTurnAt
        ? travelPoint(t, timing.retryAt, timing.retryTurnAt, D.tool, D.retry)
        : travelPoint(t, timing.retryTurnAt, timing.retryContactAt, D.retry, D.tool);
  } else if (t >= timing.resultAt) {
    task = travelPoint(t, timing.resultAt, scene.checkAt, D.tool, D.check);
  }
  if (t >= timing.releaseAt) {
    task =
      t < timing.returnAt
        ? travelPoint(t, timing.releaseAt, timing.returnAt, D.check, D.return)
        : travelPoint(t, timing.returnAt, scene.resolveAt, D.return, D.agent);
  }

  const phase: AgentWorkflowPose['phase'] = resolved
    ? 'resolved'
    : checked
      ? 'checked'
      : stopped
        ? 'stopped'
        : retrying
          ? 'retry'
          : resultVisible
            ? approval
              ? 'approval-requested'
              : 'result'
            : t >= scene.actionAt
              ? 'call'
              : 'setup';
  return {
    task,
    subject: scene.subject,
    phase,
    toolStatus: stopped
      ? 'blocked'
      : checked && !conditional
        ? 'passed'
        : t >= scene.actionAt
          ? 'active'
          : 'waiting',
    checkStatus: checked ? (conditional ? 'active' : 'passed') : 'waiting',
    toolOffset:
      contactOffset(t, scene.actionAt, 4) +
      (retry ? contactOffset(t, timing.retryContactAt, 4) : 0),
    gateOpen: phaseProgress(t, scene.checkAt, timing.releaseAt),
    resultVisible,
    approvalRequested: approval && t >= scene.responseAt,
    approvalGranted: approval && checked && !conditional,
    verified: checked && !conditional,
    completed: resolved && !conditional,
    conditional,
    outcomeOpacity: resolved ? 1 : 0,
  };
}
