import { describe, expect, it, vi } from 'vitest';
import { planExplainerEditPlan } from '../explainer-scenes';
import type { PlannerGenerator } from './planner-generation';

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      throw new Error('Paid boundary');
    }
  },
  ThinkingLevel: {},
}));
const words = Array.from({ length: 40 }, (_, i) => ({
  text:
    ({ 8: 'manual', 9: 'review', 12: 'automated', 13: 'review' } as Record<number, string>)[i] ??
    `word${i}`,
  start: i * 0.5,
  end: i * 0.5 + 0.4,
}));
const bounds = { minStart: 2, maxEnd: 20 };
const metadata = { provider: 'offline' as const, model: 'fixture', configId: 'test', latencyMs: 0 };
const scene = {
  kind: 'versus',
  startWord: 8,
  endWord: 16,
  left: { label: 'Manual review', word: 8 },
  right: { label: 'Automated review', word: 12 },
  layout: 'stack',
};

describe('semantic outline realization', () => {
  it('uses bounded recent motif metadata only for the semantic profile', async () => {
    const recentUse = [
      {
        clipHash: 'a'.repeat(64),
        order: 1,
        choices: [
          {
            signature: { kind: 'hero' as const, prop: 'briefcase' as const, tone: 'up' as const },
            count: 2,
          },
        ],
      },
    ];
    const prompts: string[] = [];
    const generator: PlannerGenerator = async ({ phase, prompt }) => {
      prompts.push(prompt);
      return { text: phase === 'outline' ? '{"ideas":[]}' : '{"scenes":[]}', metadata };
    };
    await planExplainerEditPlan('', words, bounds, {
      profile: 'semantic-variety-codex-v1',
      generator,
      recentUse,
    });
    expect(prompts[0]).toContain('briefcase');
    expect(prompts[0]).toContain('Recent animation usage');
    expect(prompts[0]).not.toContain('a'.repeat(64));
    prompts.length = 0;
    await planExplainerEditPlan('', words, bounds, {
      profile: 'content-led-codex-v1',
      generator,
      recentUse,
    });
    expect(prompts[0]).not.toContain('Recent animation usage');
  });
  it('uses a source-indexed outline before bounded schemas and real admission', async () => {
    const generate = vi.fn<PlannerGenerator>(async ({ phase, prompt }) => {
      if (phase === 'outline') {
        expect(prompt).not.toContain('- statement:');
        return {
          text: JSON.stringify({
            ideas: [
              {
                startWord: 8,
                endWord: 16,
                goal: 'Compare manual and automated review',
                kinds: ['versus'],
              },
            ],
          }),
          metadata,
        };
      }
      expect(prompt).toContain('Source-indexed explanatory goals');
      expect(prompt).toContain('Compare manual and automated review');
      expect(prompt).not.toContain('- "statement":');
      expect(prompt).not.toContain('Optional full-screen emphasis');
      return { text: JSON.stringify({ scenes: [scene] }), metadata };
    });
    const result = await planExplainerEditPlan('', words, bounds, {
      profile: 'semantic-variety-codex-v1',
      generator: generate,
      review: false,
    });
    expect(generate.mock.calls.map(([request]) => request.phase)).toEqual(['outline', 'draft']);
    expect(result.ok && result.value.scenes).toHaveLength(1);
    expect(result.ok && result.value.scenes[0]?.scene.kind).toBe('versus');
    expect(
      result.ok &&
        result.value.diagnostics.events.filter(
          (event) => event.action === 'offered' && event.kind === 'statement',
        ),
    ).toEqual([]);
  });
  it('drops redundant statement outline choices without proposing realization schemas', async () => {
    const generate = vi.fn<PlannerGenerator>(async ({ prompt }) => {
      expect(prompt).not.toContain('- statement:');
      return {
        text: JSON.stringify({
          ideas: [{ startWord: 8, endWord: 16, goal: 'Repeat the speech', kinds: ['statement'] }],
        }),
        metadata,
      };
    });
    const result = await planExplainerEditPlan('', words, bounds, {
      profile: 'semantic-variety-codex-v1',
      generator: generate,
    });
    expect(result.ok && result.value.scenes).toEqual([]);
    expect(generate.mock.calls.map(([request]) => request.phase)).toEqual(['outline']);
    expect(result.ok && result.value.diagnostics.events).toContainEqual(
      expect.objectContaining({
        stage: 'outline',
        action: 'rejected',
        reason: 'short-form-redundant-text',
        kind: 'statement',
      }),
    );
  });
  it('allows an intentional empty outline with no extra realization request', async () => {
    const generate = vi.fn<PlannerGenerator>(async () => ({ text: '{"ideas":[]}', metadata }));
    const result = await planExplainerEditPlan('', words, bounds, {
      profile: 'semantic-variety-codex-v1',
      generator: generate,
    });
    expect(result.ok && result.value.scenes).toEqual([]);
    expect(generate.mock.calls.map(([request]) => request.phase)).toEqual(['outline']);
  });
  it('invalid outlines use only the same injected content-led transport and label fallback', async () => {
    const generate = vi.fn<PlannerGenerator>(async ({ phase }) => ({
      text:
        phase === 'outline' ? '{"ideas":[{"startWord":999}]}' : JSON.stringify({ scenes: [scene] }),
      metadata,
    }));
    const result = await planExplainerEditPlan('', words, bounds, {
      profile: 'semantic-variety-codex-v1',
      generator: generate,
      review: false,
    });
    expect(result.ok && result.value.scenes).toHaveLength(1);
    expect(result.ok && result.value.diagnostics.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'outline',
          action: 'fallback',
          reason: 'invalid-outline-content-led',
        }),
      ]),
    );
    expect(generate.mock.calls.map(([request]) => request.phase)).toEqual(['outline', 'draft']);
  });
});
