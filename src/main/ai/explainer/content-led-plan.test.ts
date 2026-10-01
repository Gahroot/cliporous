import { describe, expect, it, vi } from 'vitest';
import { groupPlannedScenes } from '../../render/explainer-scenes';
import {
  buildExplainerPrompt,
  parseExplainerPlan,
  planExplainerEditPlan,
  planExplainerScenes,
} from '../explainer-scenes';

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      throw new Error('Paid boundary');
    }
  },
  ThinkingLevel: {},
}));
const words = Array.from({ length: 50 }, (_, i) => ({
  text: `word${i}`,
  start: i * 0.5,
  end: i * 0.5 + 0.4,
}));
const bounds = { minStart: 2, maxEnd: 18 };
const scenes = [
  { kind: 'stamp', startWord: 6, endWord: 12, stampWord: 8, word: 'test', layout: 'stack' },
  {
    kind: 'hero',
    startWord: 14,
    endWord: 20,
    word: 14,
    prop: 'battery',
    label: 'energy',
    continues: true,
    layout: 'stack',
  },
  {
    kind: 'statement',
    startWord: 22,
    endWord: 28,
    words: [{ text: 'review', word: 22 }],
    continues: true,
    layout: 'stack',
  },
];
const metadata = { provider: 'offline' as const, model: 'fixture', configId: 'test', latencyMs: 0 };

describe('content-led planner policy', () => {
  it('uses the verified short-form editing policy by default without enabling the semantic experiment', async () => {
    const plan = parseExplainerPlan({ scenes }, words, bounds);
    expect(plan).toHaveLength(3);
    expect(groupPlannedScenes(plan)).toHaveLength(1);
    const phases: string[] = [];
    const result = await planExplainerEditPlan('', words, bounds, {
      generator: async ({ phase }) => {
        phases.push(phase);
        return {
          text: JSON.stringify({ scenes: phase === 'draft' ? [scenes[0]] : [], quotes: [] }),
          metadata,
        };
      },
    });
    expect(result.ok && result.value.scenes).toEqual([]);
    expect(phases).toEqual(['draft', 'review']);
  });
  it('keeps long-form defaults on the existing policy', async () => {
    const raw = { scenes: scenes.map((scene) => ({ ...scene, layout: 'over' })) };
    expect(parseExplainerPlan(raw, words, bounds, { aspect: '16:9' })).toEqual(
      parseExplainerPlan(raw, words, bounds, {
        aspect: '16:9',
        profile: 'baseline-policy-codex-v1',
      }),
    );
    const result = await planExplainerEditPlan('', words, bounds, {
      aspect: '16:9',
      generator: async ({ phase }) => ({
        text: JSON.stringify({ scenes: phase === 'draft' ? raw.scenes : [] }),
        metadata,
      }),
    });
    expect(result.ok && result.value.scenes.length).toBeGreaterThan(0);
    expect(result.ok && result.value.quotes).toEqual([]);
  });
  it('keeps three consecutive useful animations on one stack stage', () => {
    const plan = parseExplainerPlan({ scenes }, words, bounds, { profile: 'content-led-codex-v1' });
    expect(plan).toHaveLength(3);
    expect(plan.map((p) => p.layout)).toEqual(['stack', 'stack', 'stack']);
    expect(groupPlannedScenes(plan)).toHaveLength(1);
  });
  it('explicit empty review can remove a draft, including optional quote selections', async () => {
    const result = await planExplainerEditPlan('', words, bounds, {
      profile: 'content-led-codex-v1',
      generator: async ({ phase }) => ({
        text: JSON.stringify({ scenes: phase === 'draft' ? [scenes[0]] : [], quotes: [] }),
        metadata,
      }),
    });
    expect(result.ok && result.value.scenes).toEqual([]);
    expect(result.ok && result.value.quotes).toEqual([]);
  });
  it.each([
    'not JSON',
    '{}',
    '{"scenes":[{"kind":"unsupported"}]}',
  ])('unusable review %s cannot erase a valid draft', async (review) => {
    const result = await planExplainerScenes('', words, bounds, {
      profile: 'content-led-codex-v1',
      generator: async ({ phase }) => ({
        text: phase === 'draft' ? JSON.stringify({ scenes: [scenes[0]] }) : review,
        metadata,
      }),
    });
    expect(result.ok && result.value).toHaveLength(1);
  });
  it('does not tell content-led planners to rotate layouts or leave mandatory gaps', () => {
    const prompt = buildExplainerPrompt(words, bounds, '9:16', undefined, 'content-led-codex-v1');
    expect(prompt).not.toContain('never the same scene type twice');
    expect(prompt).not.toContain('Cover at most about half');
    expect(prompt).not.toContain('Leave at least 1.5 s');
    expect(prompt).toContain('Keeping stack is not repeating an animation');
  });
});
