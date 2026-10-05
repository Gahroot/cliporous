import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Stage3D } from '../Stage3D';
import { DiagramChrome, DiagramStage } from './DiagramStage';
import { HybridStage } from './HybridStage';
import { diagramPose } from './motion';
import type { DiagramStory } from './types';

const clock = vi.hoisted(() => ({
  time: vi.fn(() => ({ t: 0, frame: 0 })),
  wide: vi.fn((): unknown => null),
}));
vi.mock('../stage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../stage')>();
  return { ...actual, useSceneTime: clock.time, useWideStage: clock.wide };
});

function story(visualMode: 'diagram' | 'hybrid'): DiagramStory {
  return {
    visualMode,
    label: 'Distinct source facts',
    subject: 'Acme',
    outcome: 'Payment remains pending',
    evidence: 'source-stated',
    setupAt: 0,
    actionAt: 1,
    responseAt: 2,
    checkAt: 3,
    resolveAt: 4,
  };
}
interface NodeProps {
  children?: React.ReactNode;
  text?: string;
  opacity?: number;
  scene?: DiagramStory;
  settledOutcome?: boolean;
}
function elements(node: React.ReactNode): React.ReactElement<NodeProps>[] {
  const output: React.ReactElement<NodeProps>[] = [];
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<NodeProps>(child)) return;
    output.push(child);
    output.push(...elements(child.props.children));
  });
  return output;
}
function outcomeOpacity(scene: DiagramStory, settledOutcome: boolean): number | undefined {
  return elements(DiagramChrome({ scene, settledOutcome })).find(
    (node) => node.props.text === scene.outcome,
  )?.props.opacity;
}

beforeEach(() => {
  clock.time.mockReset();
  clock.time.mockReturnValue({ t: 0, frame: 0 });
  clock.wide.mockReset();
  clock.wide.mockReturnValue(null);
});

describe('opt-in source-timed outcome hold with historical default intact', () => {
  it.each([
    'diagram',
    'hybrid',
  ] as const)('%s is invisible before resolve and fully settled throughout the final hold', (mode) => {
    const scene = story(mode),
      before = structuredClone(scene);
    for (const wide of [null, {}]) {
      clock.wide.mockReturnValue(wide);
      for (const t of [0, 3, 3.999, 4, 4.01, 4.4, 4.8, 8, 3.999, 4]) {
        clock.time.mockReturnValue({ t, frame: t * 30 });
        expect(outcomeOpacity(scene, true)).toBe(t >= scene.resolveAt ? 1 : 0);
        expect(scene).toEqual(before);
      }
    }
  });

  it('preserves historical frame-driven outcome opacity unless explicitly opted in', () => {
    const scene = story('diagram');
    for (const wide of [null, {}]) {
      clock.wide.mockReturnValue(wide);
      for (const t of [0, 3.999, 4, 4.05, 4.4, 4.8, 8]) {
        clock.time.mockReturnValue({ t, frame: t * 30 });
        const expected = diagramPose(t, scene).resolve;
        expect(outcomeOpacity(scene, false)).toBe(expected);
        expect(
          elements(DiagramChrome({ scene })).find((node) => node.props.text === scene.outcome)
            ?.props.opacity,
        ).toBe(expected);
      }
    }
  });

  it.each([
    'diagram',
    'hybrid',
  ] as const)('%s passes the hold to its actual chrome without changing facts or adding stages', (mode) => {
    const scene = story(mode);
    const tree = HybridStage({
      scene,
      settledOutcome: true,
      diagram: React.createElement('g'),
      model: React.createElement('group'),
    });
    const nodes = elements(tree);
    if (mode === 'diagram') {
      const stage = nodes.find((node) => node.type === DiagramStage);
      expect(stage?.props.scene).toBe(scene);
      expect(stage?.props.settledOutcome).toBe(true);
      expect(nodes.filter((node) => node.type === Stage3D)).toHaveLength(0);
      const chrome = elements(
        DiagramStage({ scene, settledOutcome: true, children: React.createElement('g') }),
      ).find((node) => node.type === DiagramChrome);
      expect(chrome?.props.scene).toBe(scene);
      expect(chrome?.props.settledOutcome).toBe(true);
    } else {
      const chrome = nodes.find((node) => node.type === DiagramChrome);
      expect(chrome?.props.scene).toBe(scene);
      expect(chrome?.props.settledOutcome).toBe(true);
      expect(nodes.filter((node) => node.type === Stage3D)).toHaveLength(1);
    }
    const old = elements(
      HybridStage({
        scene,
        diagram: React.createElement('g'),
        model: React.createElement('group'),
      }),
    );
    const container = old.find(
      (node) => node.type === (mode === 'diagram' ? DiagramStage : DiagramChrome),
    );
    expect(container?.props.settledOutcome).toBe(false);
    expect(container?.props.scene).toBe(scene);
  });
});
