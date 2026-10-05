import { createElement, Fragment, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { AGENT_WORKFLOW_SPEC } from '../../../../../ai/explainer/kinds-agent-workflow';
import { AgentWorkflowScene as AgentWorkflowSceneView } from '../../AgentWorkflowScene';
import { HybridStage } from '../../diagrams/HybridStage';
import { ClayBlock } from '../../explanation-kit';
import { MechanismStage } from '../../mechanisms/MechanismStage';
import { deriveExplainerPalette } from '../../palette';
import { Stage3D } from '../../Stage3D';
import type { AgentWorkflowScene } from '../../technology/types';
import { ApprovalRail } from '../assets/authority';
import {
  ApprovalGateDiagramParts,
  ApprovalGateModelParts,
  sampleApprovalGate,
} from './ApprovalGateParts';

vi.mock('../../stage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../stage')>()),
  useStage: () => ({ ...deriveExplainerPalette(), font: 'Inter', duration: 12 }),
  useSceneTime: () => ({ t: 0, f: 0, fps: 30 }),
}));

/** Inline source clauses go through the unchanged production approval-gate parser. */
function parseSource(
  grant = 'Human approves the task.',
  completion = 'Agent completes the monthly report.',
  conditional = false,
) {
  const clauses = [
    `Agent receives the monthly report. Approval workflow.${conditional ? ' If the team agrees.' : ''}`,
    'Agent calls Report tool.',
    'Report tool returns a result. Agent checks the result. Result passes the check. Agent requests human approval.',
    grant,
    completion,
  ];
  const starts = [0.4, 2.4, 4.4, 7.7, 10.2];
  const indices: number[] = [];
  const words: { text: string; start: number; end: number }[] = [];
  clauses.forEach((clause, beat) => {
    indices.push(words.length);
    const tokens = clause.split(/\s+/u);
    tokens.forEach((text, offset) => {
      words.push({
        text,
        start: starts[beat] + (offset * 0.72) / tokens.length,
        end: starts[beat] + ((offset + 0.8) * 0.72) / tokens.length,
      });
    });
  });
  const ctx = makeParseContext(words, {
    startWord: 0,
    endWord: words.length - 1,
    startTime: 0,
    endTime: 11.7,
  });
  const scene = AGENT_WORKFLOW_SPEC.parse(
    {
      kind: 'agent-workflow',
      preset: 'approval-gate',
      label: 'Approval workflow',
      subject: 'monthly report',
      toolLabel: 'Report tool',
      outcome: 'completes the monthly report',
      ...(conditional ? { condition: 'If the team agrees' } : {}),
      setupWord: indices[0],
      actionWord: indices[1],
      responseWord: indices[2],
      checkWord: indices[3],
      resolveWord: indices[4],
    },
    ctx,
  );
  return { scene, issues: ctx.issues };
}
function sourceScene(): AgentWorkflowScene {
  const { scene, issues } = parseSource();
  if (!scene) throw new Error(`Rejected source approval: ${issues.join('; ')}`);
  return scene;
}
function svg(scene: AgentWorkflowScene, seconds: number): string {
  return renderToStaticMarkup(
    createElement('svg', null, createElement(ApprovalGateDiagramParts, { scene, seconds })),
  );
}
function countMeshes(node: ReactNode): number {
  if (Array.isArray(node)) return node.reduce((sum, child) => sum + countMeshes(child), 0);
  if (!isValidElement<Record<string, unknown>>(node)) return 0;
  if (node.type === 'primitive') throw new Error('Unaccounted primitive in approval model');
  // Count the authored rounded mesh without invoking React/R3F geometry lifecycle hooks.
  if (node.type === ClayBlock) return 1;
  if (typeof node.type === 'function')
    return countMeshes(Reflect.apply(node.type, null, [node.props]));
  return (node.type === 'mesh' ? 1 : 0) + countMeshes(node.props.children as ReactNode);
}
const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

function boundaries(node: ReactNode): number {
  if (Array.isArray(node)) return node.reduce((sum, child) => sum + boundaries(child), 0);
  if (!isValidElement<{ children?: ReactNode }>(node)) return 0;
  return (node.type === Stage3D ? 1 : 0) + boundaries(node.props.children);
}

describe('OP-10 source-validated stage-free approval parts (CPU only)', () => {
  it('keeps the historical clay wrapper and uses zero/one stage only for explicit modes', () => {
    const scene = sourceScene();
    expect(AgentWorkflowSceneView({ scene }).type).toBe(MechanismStage);
    for (const visualMode of ['diagram', 'hybrid'] as const) {
      const view = AgentWorkflowSceneView({ scene: { ...scene, visualMode } });
      expect(view.type).toBe(HybridStage);
      if (!isValidElement<Parameters<typeof HybridStage>[0]>(view))
        throw new Error('missing approval stage');
      expect(view.props.scene.subject).toBe(scene.subject);
      expect(view.props.scene.condition).toBe(scene.condition);
      expect(boundaries(HybridStage(view.props))).toBe(visualMode === 'hybrid' ? 1 : 0);
    }
  });
  it('uses the existing five-beat parser and no finalState/completeAt DTO', () => {
    const result = parseSource();
    expect(result.issues).toEqual([]);
    expect(result.scene?.preset).toBe('approval-gate');
    expect(result.scene).not.toHaveProperty('finalState');
    expect(result.scene).not.toHaveProperty('completeAt');
  });
  it.each([
    'Agent requests human approval.',
    'Human denies the task.',
    'Tool approves the task.',
  ])('production contract rejects an absent human grant: %s', (grant) => {
    expect(parseSource(grant).scene).toBeNull();
  });
  it('production contract rejects proposed completion', () => {
    expect(
      parseSource('Human approves the task.', 'Agent might complete the monthly report.').scene,
    ).toBeNull();
  });
  it('keeps the handshake pending at the tool return and immediately before the source human grant', () => {
    const scene = sourceScene();
    for (const seconds of [
      -100,
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt - 0.0001,
      NaN,
      Infinity,
    ]) {
      expect(sampleApprovalGate(scene, seconds)).toMatchObject({
        subject: scene.subject,
        accepted: 0,
        pending: true,
        checked: false,
        completed: false,
      });
      const html = svg(scene, seconds);
      expect(html).toContain('Human approval');
      expect(html).toContain('Pending');
      expect(html).not.toContain('Approved');
      expect(html).not.toContain(escaped(scene.outcome));
      expect(html).not.toContain('data-entity="result"');
    }
  });
  it('starts accepted motion only at checkAt and reveals task success only at resolveAt', () => {
    const scene = sourceScene();
    expect(sampleApprovalGate(scene, scene.checkAt)).toMatchObject({
      accepted: 0,
      pending: false,
      checked: true,
      completed: false,
    });
    expect(sampleApprovalGate(scene, scene.checkAt + 0.001)?.accepted).toBeGreaterThan(0);
    const middle = (scene.checkAt + scene.resolveAt) / 2;
    expect(sampleApprovalGate(scene, middle)?.accepted).toBeCloseTo(0.5);
    expect(svg(scene, middle)).toContain('Approved');
    expect(svg(scene, middle)).not.toContain(escaped(scene.outcome));
    expect(sampleApprovalGate(scene, scene.resolveAt - 0.0001)?.completed).toBe(false);
    expect(sampleApprovalGate(scene, scene.resolveAt)).toMatchObject({
      accepted: 1,
      pending: false,
      completed: true,
    });
    expect(svg(scene, scene.resolveAt)).toContain('data-entity="result"');
    // Rendered label wrapping is checked as literal SVG text, not a data-only fixture.
    const html = svg(scene, scene.resolveAt);
    expect(html).toContain('completes the monthly');
    expect(html).toContain('report');
  });
  it('is seekable, bounded and identical through the whole final reading hold', () => {
    const scene = sourceScene();
    const seconds = [
      scene.resolveAt + 0.8,
      scene.checkAt - 0.01,
      scene.resolveAt,
      scene.responseAt,
      scene.checkAt,
      1e6,
    ];
    const poses = seconds.map((time) => sampleApprovalGate(scene, time));
    for (const index of [5, 0, 3, 1, 4, 2])
      expect(sampleApprovalGate(scene, seconds[index])).toEqual(poses[index]);
    expect(sampleApprovalGate(scene, scene.resolveAt + 0.8)).toEqual(
      sampleApprovalGate(scene, scene.resolveAt),
    );
    expect(svg(scene, 1e6)).toBe(svg(scene, scene.resolveAt));
    for (let seconds = scene.setupAt; seconds <= scene.resolveAt + 1; seconds += 1 / 30) {
      const pose = sampleApprovalGate(scene, seconds);
      expect(pose?.accepted).toBeGreaterThanOrEqual(0);
      expect(pose?.accepted).toBeLessThanOrEqual(1);
    }
  });
  it('renders only the source task/tool, generic roles and at most six entities/five edges', () => {
    const scene = sourceScene();
    const html = svg(scene, scene.resolveAt);
    expect(html).toContain(escaped(scene.subject));
    expect(html).toContain(escaped(scene.toolLabel));
    expect(html).toContain('Agent');
    expect(html).toContain('Human approval');
    expect(html).toContain('Result check');
    expect(html).toContain('Source-stated account');
    expect(html.match(/data-entity=/gu)).toHaveLength(6);
    expect(html.match(/data-edge=/gu)).toHaveLength(5);
    expect(html).toContain('font-family="Inter"');
    expect(html).not.toMatch(
      /<canvas|<iframe|foreignObject|<image|https?:|permission|capability|finalState/iu,
    );
  });
  it('keeps exact source conditions in diagram text, not the clay model', () => {
    const { scene, issues } = parseSource(
      'Human approves the task.',
      'Agent completes the monthly report.',
      true,
    );
    expect(issues).toEqual([]);
    if (!scene) throw new Error('Missing conditional source');
    const html = svg(scene, scene.checkAt);
    expect(html).toContain('Conditional source account');
    expect(html).toContain(escaped(scene.condition ?? ''));
    const model = ApprovalGateModelParts({ scene, seconds: scene.checkAt });
    expect(JSON.stringify(model)).not.toContain(scene.condition);
  });
  it('uses the literal A-06 carrier with retained identity, source check phase and <=180 authored meshes', () => {
    const scene = sourceScene();
    for (const seconds of [
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt - 0.001,
      scene.checkAt,
      (scene.checkAt + scene.resolveAt) / 2,
      scene.resolveAt,
      1e6,
    ]) {
      const model = ApprovalGateModelParts({ scene, seconds });
      if (!isValidElement<{ children: ReactNode; userData: Record<string, unknown> }>(model))
        throw new Error('Missing model parts');
      expect(model.type).toBe('group');
      expect(model.props.userData).toMatchObject({
        subject: scene.subject,
        toolLabel: scene.toolLabel,
      });
      const rail = model.props.children;
      if (!isValidElement<{ accepted: number }>(rail)) throw new Error('Missing task carrier');
      expect(rail.type).toBe(ApprovalRail);
      expect(rail.props.accepted).toBe(sampleApprovalGate(scene, seconds)?.accepted);
      if (seconds < scene.checkAt) expect(rail.props.accepted).toBe(0);
      const meshes = countMeshes(model);
      expect(meshes).toBeGreaterThan(0);
      expect(meshes).toBeLessThanOrEqual(180);
    }
  });
  it.each([
    'tool-success',
    'tool-retry',
  ] as const)('does not project other preset %s into approval', (preset) => {
    const scene = { ...sourceScene(), preset };
    expect(sampleApprovalGate(scene, 1e6)).toBeNull();
    expect(ApprovalGateModelParts({ scene, seconds: 1e6 })).toBeNull();
    expect(svg(scene, 1e6)).toBe('<svg></svg>');
  });
  it('fails closed for nonfinite or unordered source beats', () => {
    const scene = sourceScene();
    expect(sampleApprovalGate({ ...scene, checkAt: Infinity }, 1e6)).toBeNull();
    expect(sampleApprovalGate({ ...scene, resolveAt: scene.checkAt }, 1e6)).toBeNull();
    expect(sampleApprovalGate({ ...scene, responseAt: scene.checkAt + 1 }, 1e6)).toBeNull();
  });
});
