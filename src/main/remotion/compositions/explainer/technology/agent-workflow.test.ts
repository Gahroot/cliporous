import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AGENT_WORKFLOW_DESK, agentWorkflowPose, agentWorkflowTiming } from './agent-workflow';
import type { AgentWorkflowScene } from './types';

const fixtures: {
  name: string;
  durationSec: number;
  scene: AgentWorkflowScene;
  samples: { name: string; frame: number }[];
}[] = JSON.parse(
  readFileSync('scripts/explainer-stills/fixtures/technology-agent-workflow.json', 'utf8'),
);

function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(numbers);
  return [];
}

describe('agentWorkflowPose', () => {
  for (const { name, scene, durationSec, samples } of fixtures) {
    describe(name, () => {
      it('is finite, bounded and identity-preserving at every frame and shuffled/repeated seeks', () => {
        const frozen = Object.freeze({ ...scene });
        const frames = Array.from({ length: durationSec * 30 }, (_, frame) => frame);
        const chronological = frames.map((frame) => agentWorkflowPose(frozen, frame / 30));
        for (const frame of [
          ...frames.filter((f) => f % 2 === 1).reverse(),
          ...frames.filter((f) => f % 2 === 0),
          ...frames.reverse(),
        ]) {
          const pose = agentWorkflowPose(frozen, frame / 30);
          expect(pose).toEqual(chronological[frame]);
          expect(numbers(pose).every(Number.isFinite)).toBe(true);
          expect(pose.task.x).toBeGreaterThanOrEqual(64);
          expect(pose.task.x + AGENT_WORKFLOW_DESK.ticketWidth).toBeLessThanOrEqual(1016);
          expect(pose.task.y).toBeGreaterThanOrEqual(200);
          expect(pose.task.y + 181).toBeLessThanOrEqual(790);
          expect(Math.abs(pose.toolOffset)).toBeLessThanOrEqual(8);
          expect(pose.gateOpen).toBeGreaterThanOrEqual(0);
          expect(pose.gateOpen).toBeLessThanOrEqual(1);
          expect(pose.subject).toBe(scene.subject);
          expect(pose.verified).toBe(frame / 30 >= scene.checkAt);
          expect(pose.completed).toBe(frame / 30 >= scene.resolveAt);
          if (frame / 30 < scene.checkAt) expect(pose.gateOpen).toBe(0);
          if (frame / 30 < scene.resolveAt) expect(pose.outcomeOpacity).toBe(0);
        }
      });

      it('is position-continuous around all beats and authored contacts', () => {
        const timing = agentWorkflowTiming(scene);
        const times = [
          scene.setupAt,
          scene.actionAt,
          scene.responseAt,
          scene.checkAt,
          scene.resolveAt,
          ...Object.values(timing),
        ];
        for (const at of times) {
          const before = agentWorkflowPose(scene, at - 0.000001);
          const on = agentWorkflowPose(scene, at);
          const after = agentWorkflowPose(scene, at + 0.000001);
          expect(Math.hypot(before.task.x - on.task.x, before.task.y - on.task.y)).toBeLessThan(
            0.01,
          );
          expect(Math.hypot(after.task.x - on.task.x, after.task.y - on.task.y)).toBeLessThan(0.01);
          expect(numbers(on).every(Number.isFinite)).toBe(true);
        }
        expect(agentWorkflowPose(scene, scene.setupAt).task).toEqual(AGENT_WORKFLOW_DESK.agent);
        expect(agentWorkflowPose(scene, scene.actionAt).task).toEqual(AGENT_WORKFLOW_DESK.tool);
        expect(agentWorkflowPose(scene, scene.checkAt).task).toEqual(AGENT_WORKFLOW_DESK.check);
        expect(agentWorkflowPose(scene, timing.releaseAt).gateOpen).toBe(1);
        expect(agentWorkflowPose(scene, timing.releaseAt).task).toEqual(AGENT_WORKFLOW_DESK.check);
        expect(agentWorkflowPose(scene, scene.resolveAt).task).toEqual(AGENT_WORKFLOW_DESK.agent);
      });

      it('has an exactly static final hold from resolveAt, including fixture samples', () => {
        expect(durationSec - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
        const final = agentWorkflowPose(scene, scene.resolveAt);
        for (let frame = Math.ceil(scene.resolveAt * 30); frame <= durationSec * 30 + 60; frame++) {
          expect(agentWorkflowPose(scene, frame / 30)).toEqual(final);
        }
        for (const sample of samples.filter((sample) => sample.name.startsWith('final-hold'))) {
          expect(agentWorkflowPose(scene, sample.frame / 30)).toEqual(final);
        }
        expect(final).toMatchObject({
          completed: true,
          verified: true,
          outcomeOpacity: 1,
          toolOffset: 0,
          gateOpen: 1,
        });
      });

      it('does not certify a conditional source in any frame', () => {
        const conditional = { ...scene, condition: 'If access is available' };
        for (let frame = 0; frame < durationSec * 30; frame++) {
          const pose = agentWorkflowPose(conditional, frame / 30);
          expect(pose).toMatchObject({
            conditional: true,
            completed: false,
            verified: false,
            approvalGranted: false,
          });
          expect(pose.toolStatus).not.toBe('passed');
          expect(pose.checkStatus).not.toBe('passed');
        }
      });

      it('stays seekable with nonzero absolute times and invalid seek inputs', () => {
        const shift = 20;
        const shifted = {
          ...scene,
          setupAt: scene.setupAt + shift,
          actionAt: scene.actionAt + shift,
          responseAt: scene.responseAt + shift,
          checkAt: scene.checkAt + shift,
          resolveAt: scene.resolveAt + shift,
        };
        for (const t of [0, scene.actionAt, scene.checkAt, scene.resolveAt, durationSec]) {
          const a = agentWorkflowPose(shifted, t + shift);
          const b = agentWorkflowPose(scene, t);
          expect(a.task.x).toBeCloseTo(b.task.x, 8);
          expect(a.task.y).toBeCloseTo(b.task.y, 8);
          expect(a.phase).toBe(b.phase);
        }
        for (const t of [Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, -20]) {
          expect(numbers(agentWorkflowPose(scene, t)).every(Number.isFinite)).toBe(true);
        }
      });
    });
  }

  it('stops the failed tool, holds the same task, then recontacts before a result exists', () => {
    const scene = fixtures.find((value) => value.scene.preset === 'tool-retry')?.scene;
    if (!scene) throw new Error('Missing retry fixture');
    const timing = agentWorkflowTiming(scene);
    expect(timing.retryAt - scene.responseAt).toBeGreaterThanOrEqual(0.3);
    for (let time = scene.responseAt; time < timing.retryAt; time += 1 / 30) {
      expect(agentWorkflowPose(scene, time)).toMatchObject({
        phase: 'stopped',
        task: AGENT_WORKFLOW_DESK.tool,
        toolStatus: 'blocked',
        gateOpen: 0,
        resultVisible: false,
        verified: false,
        completed: false,
      });
    }
    expect(agentWorkflowPose(scene, timing.retryTurnAt).task).toEqual(AGENT_WORKFLOW_DESK.retry);
    expect(agentWorkflowPose(scene, timing.retryContactAt).task).toEqual(AGENT_WORKFLOW_DESK.tool);
    expect(agentWorkflowPose(scene, timing.resultAt - 0.001).resultVisible).toBe(false);
    expect(agentWorkflowPose(scene, timing.resultAt).resultVisible).toBe(true);
  });

  it('does not treat requested approval as approval given', () => {
    const scene = fixtures.find((value) => value.scene.preset === 'approval-gate')?.scene;
    if (!scene) throw new Error('Missing approval fixture');
    for (let time = scene.responseAt; time < scene.checkAt; time += 1 / 30) {
      expect(agentWorkflowPose(scene, time)).toMatchObject({
        approvalRequested: true,
        approvalGranted: false,
        gateOpen: 0,
        completed: false,
        checkStatus: 'waiting',
      });
    }
    expect(agentWorkflowPose(scene, scene.checkAt)).toMatchObject({
      approvalGranted: true,
      gateOpen: 0,
      completed: false,
    });
    expect(agentWorkflowPose(scene, scene.resolveAt)).toMatchObject({
      approvalGranted: true,
      completed: true,
    });
  });
});
