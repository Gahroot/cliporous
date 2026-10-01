import { describe, expect, it } from 'vitest';
import { cameraRig, projectToStage } from '../three-helpers';
import { agentWorkflowCamera } from './agent-camera';
import { agentWorkflowPose, agentWorkflowTiming } from './agent-workflow';
import type { AgentWorkflowScene } from './types';

const scene: AgentWorkflowScene = {
  kind: 'agent-workflow',
  preset: 'tool-retry',
  label: 'report task',
  subject: 'report task',
  outcome: 'completes the report task',
  toolLabel: 'lookup tool',
  setupAt: 0.3,
  actionAt: 1.5,
  responseAt: 3,
  checkAt: 7.3,
  resolveAt: 9.3,
};

describe('agent 3D camera choreography', () => {
  it('moves only while the failed request is stopped or already returned', () => {
    const timing = agentWorkflowTiming(scene);
    expect(scene.responseAt + 0.6).toBeLessThan(timing.retryAt);
    expect(scene.resolveAt - 0.45).toBeGreaterThan(timing.returnAt);
    expect(agentWorkflowCamera(scene, 0)).toEqual(agentWorkflowCamera(scene, scene.responseAt));
    expect(agentWorkflowCamera(scene, scene.responseAt + 0.6)).not.toEqual(
      agentWorkflowCamera(scene, 0),
    );
    expect(agentWorkflowPose(scene, scene.responseAt + 0.3).phase).toBe('stopped');
  });

  it('is finite, deterministic on repeated/nonsequential seeks, and still throughout the final hold', () => {
    const frames = Array.from({ length: 345 }, (_, frame) => frame / 30);
    const poses = frames.map((time) => agentWorkflowCamera(scene, time));
    for (const time of [...frames].reverse()) {
      expect(agentWorkflowCamera(scene, time)).toEqual(poses[Math.round(time * 30)]);
      const sampled = agentWorkflowCamera(scene, time);
      expect(sampled.position.every(Number.isFinite)).toBe(true);
      if (time >= scene.resolveAt) {
        expect(sampled).toEqual(agentWorkflowCamera(scene, scene.resolveAt));
        expect(cameraRig(sampled, time, { driftDeg: 0, pushAmount: 0, bobAmount: 0 })).toEqual(
          cameraRig(sampled, scene.resolveAt, { driftDeg: 0, pushAmount: 0, bobAmount: 0 }),
        );
      }
    }
  });

  it('keeps the complete workbench inside the canvas during every camera move', () => {
    for (let frame = 0; frame < 345; frame++) {
      const camera = agentWorkflowCamera(scene, frame / 30);
      for (const x of [-3.425, 3.425]) {
        for (const y of [-1.155, -0.845]) {
          for (const z of [-1.68, 1.78]) {
            const point = projectToStage(camera, [x, y, z]);
            expect(point.x).toBeGreaterThanOrEqual(40);
            expect(point.x).toBeLessThanOrEqual(1040);
            expect(point.y).toBeGreaterThan(200);
            expect(point.y).toBeLessThan(790);
          }
        }
      }
    }
  });

  it('does not force camera moves into short scenes or other presets', () => {
    const short = { ...scene, responseAt: 2.5, checkAt: 3.5, resolveAt: 4.5 };
    const success = { ...scene, preset: 'tool-success' as const };
    for (const example of [short, success])
      expect(agentWorkflowCamera(example, 0)).toEqual(agentWorkflowCamera(example, 10));
  });

  it('preserves existing camera defaults while allowing an explicit static camera', () => {
    const base = { position: [1, 3, 8] as [number, number, number], fov: 38 };
    expect(cameraRig(base, 2, { driftDeg: 0, pushAmount: 0 }).position[1]).toBe(
      3 + Math.sin(0.9) * 0.08,
    );
    expect(cameraRig(base, 2, { driftDeg: 0, pushAmount: 0, bobAmount: 0 }).position[1]).toBe(3);
  });
});
