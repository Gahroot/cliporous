import { describe, expect, it, vi } from 'vitest';
import {
  MAX_SCENE_PROPOSALS,
  parseExplainerPlan,
  parsePlanWithDiagnostics,
  planExplainerScenes,
  sceneListStatus,
} from '../explainer-scenes';
import type { PlannerGenerator } from './planner-generation';
import { EVALUATION_PROFILES, type PlannerProfileId } from './planner-profiles';
import type { PlanningEvent } from './planning-diagnostics';
import { applyVarietyRules, type VarietyScene } from './variety';

const paid = vi.hoisted(() => ({ construct: vi.fn(), call: vi.fn() }));
const normalLog = vi.hoisted(() => vi.fn());
vi.mock('../../logger', () => ({ log: normalLog }));
vi.mock('@google/genai', () => ({ GoogleGenAI: paid.construct, ThinkingLevel: {} }));
vi.mock('../gemini-client', () => ({
  MODELS: { BALANCED: ['test-gemini'] },
  callGeminiWithRetry: paid.call,
}));

const words = Array.from({ length: 100 }, (_, i) => ({
  text: `TRANSCRIPT_Q7X_${i}`,
  start: i * 0.5,
  end: i * 0.5 + 0.4,
}));
const bounds = { minStart: 0, maxEnd: 100 };
const stamp = (startWord: number) => ({
  kind: 'stamp',
  startWord,
  endWord: startWord + 8,
  word: 'LABEL_Q7X',
  stampWord: startWord + 2,
});
const metadata = {
  provider: 'offline' as const,
  model: 'MODEL_Q7X',
  configId: 'CONFIG_Q7X',
  latencyMs: 0,
};

async function diagnosedPlan() {
  const events: PlanningEvent[] = [];
  const generator: PlannerGenerator = vi.fn(async ({ phase }) => ({
    text: JSON.stringify(
      phase === 'draft'
        ? {
            scenes: [
              stamp(6),
              stamp(26),
              { kind: 'KIND_Q7X' },
              { kind: 'hero', prop: 'PROP_Q7X', label: 'LABEL_Q7X', startWord: 50, endWord: 58 },
            ],
            commentary: 'RAW_JSON_Q7X',
          }
        : { scenes: [] },
    ),
    metadata,
  }));
  const result = await planExplainerScenes('', words, bounds, {
    profile: 'baseline-policy-codex-v1',
    generator,
    onDiagnostic: (event) => events.push(event),
  });
  return { events, result, generator };
}

describe('planning diagnostics integration', () => {
  it('reports the baseline policy removal without changing empty-review fallback', async () => {
    const { events, result, generator } = await diagnosedPlan();
    expect(result.ok && result.value).toHaveLength(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        stage: 'policy',
        action: 'removed',
        reason: 'baseline-kind-repeat',
        phase: 'draft',
        kind: 'stamp',
        index: 1,
      }),
    );
    for (const phase of ['draft', 'review']) {
      expect(events).toContainEqual(
        expect.objectContaining({ stage: 'offer', reason: 'shortlist-kind', phase }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({ stage: 'offer', reason: 'shortlist-prop', phase }),
      );
    }
    expect(events).toContainEqual(
      expect.objectContaining({ stage: 'review', action: 'fallback', reason: 'review-empty' }),
    );
    expect(generator).toHaveBeenCalledTimes(2);
    expect(paid.construct).not.toHaveBeenCalled();
    expect(paid.call).not.toHaveBeenCalled();
  });

  it('never includes raw prompt, labels, JSON, unknown identifiers or model strings', async () => {
    const { events } = await diagnosedPlan();
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify({ events, logs: normalLog.mock.calls })).not.toMatch(
      /TRANSCRIPT_Q7X|LABEL_Q7X|RAW_JSON_Q7X|KIND_Q7X|PROP_Q7X|MODEL_Q7X|CONFIG_Q7X/,
    );
    expect(events).toContainEqual(
      expect.objectContaining({ stage: 'validation', action: 'rejected', reason: 'unknown-kind' }),
    );
  });

  it.each([
    { raw: null, status: 'malformed', reason: 'scene-list-malformed' },
    { raw: {}, status: 'malformed', reason: 'scene-list-malformed' },
    { raw: { scenes: 'RAW_JSON_Q7X' }, status: 'malformed', reason: 'scene-list-malformed' },
    { raw: { scenes: [] }, status: 'empty', reason: 'scene-list-empty' },
    { raw: { scenes: [null] }, status: 'populated', reason: 'scene-not-object' },
  ])('distinguishes list status $status ($reason)', ({ raw, status, reason }) => {
    const events: PlanningEvent[] = [];
    expect(sceneListStatus(raw)).toBe(status);
    expect(
      parseExplainerPlan(raw, words, bounds, { onDiagnostic: (event) => events.push(event) }),
    ).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ stage: 'validation', reason }));
  });

  it('accounts for nonobjects and invalid windows/cores without leaking rejection prose', () => {
    const events: PlanningEvent[] = [];
    const raw = {
      scenes: [
        null,
        [],
        42,
        'RAW_JSON_Q7X',
        { ...stamp(6), endWord: -1 },
        { kind: 'hero', startWord: 6, endWord: 14, prop: 'PROP_Q7X' },
      ],
    };
    const result = parsePlanWithDiagnostics(raw, words, bounds, {
      onDiagnostic: (event) => events.push(event),
    });
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(2);
    expect(events.filter((event) => event.action === 'proposed')).toHaveLength(6);
    expect(events.filter((event) => event.reason === 'scene-not-object')).toHaveLength(4);
    expect(events).toContainEqual(expect.objectContaining({ reason: 'invalid-window', index: 4 }));
    expect(events).toContainEqual(expect.objectContaining({ reason: 'invalid-core', index: 5 }));
    expect(JSON.stringify(events)).not.toMatch(/Q7X/);
  });

  it('bounds processing to 256 proposals and reports overflow without reading it', () => {
    const events: PlanningEvent[] = [];
    const scenes: unknown[] = Array.from({ length: MAX_SCENE_PROPOSALS }, () => null);
    Object.defineProperty(scenes, MAX_SCENE_PROPOSALS, {
      get: () => {
        throw new Error('overflow was accessed');
      },
    });
    expect(
      parseExplainerPlan({ scenes }, words, bounds, {
        onDiagnostic: (event) => events.push(event),
      }),
    ).toEqual([]);
    expect(events.filter((event) => event.action === 'proposed')).toHaveLength(256);
    expect(events).toContainEqual(
      expect.objectContaining({
        stage: 'proposal',
        action: 'removed',
        reason: 'proposal-limit',
        count: 1,
      }),
    );
  });

  it('reports optional omissions and layout/transition repairs while retaining the core', () => {
    const events: PlanningEvent[] = [];
    const result = parsePlanWithDiagnostics(
      {
        scenes: [
          {
            ...stamp(6),
            layout: 'LAYOUT_Q7X',
            transition: 'TRANSITION_Q7X',
            laterStamp: 'EXTRA_Q7X',
            annotation: { kind: 'ANNOTATION_Q7X', word: 10 },
            dimWord: -1,
            reactions: [null],
          },
        ],
      },
      words,
      bounds,
      { onDiagnostic: (event) => events.push(event) },
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.omitted).toHaveLength(1);
    for (const reason of [
      'optional-fields-omitted',
      'optional-stamp-omitted',
      'optional-annotation-omitted',
      'optional-dim-omitted',
      'optional-reactions-omitted',
      'invalid-layout',
      'invalid-transition',
      'valid-scene',
    ])
      expect(events).toContainEqual(
        expect.objectContaining({ stage: 'validation', reason, index: 0 }),
      );
    expect(JSON.stringify(events)).not.toMatch(/Q7X/);
  });

  it('reports chain timing and orphan repairs with original proposal indices', () => {
    const events: PlanningEvent[] = [];
    const result = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'hero',
            prop: 'battery',
            label: 'LABEL_Q7X',
            word: 17,
            startWord: 17,
            endWord: 25,
            continues: true,
            layout: 'stack',
          },
          { ...stamp(6), continues: true, layout: 'stack' },
        ],
      },
      words,
      bounds,
      { onDiagnostic: (event) => events.push(event) },
    );
    expect(result).toHaveLength(2);
    expect(result[1].startTime).toBe(result[0].endTime);
    expect(result[1].chained).toBe(true);
    expect(events).toContainEqual(
      expect.objectContaining({ reason: 'chain-timing-snapped', index: 0 }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ reason: 'chain-without-predecessor', index: 1 }),
    );
    expect(result[0]).not.toHaveProperty('proposalIndex');
  });

  it.each([
    ['{}', 'review-malformed'],
    ['not JSON', 'review-unparseable-json'],
    ['{"scenes":[]}', 'review-empty'],
    ['{"scenes":[null]}', 'review-no-usable-scenes'],
  ])('keeps baseline draft for unusable review %s with its precise fallback reason', async (text, reason) => {
    const events: PlanningEvent[] = [];
    const result = await planExplainerScenes('', words, bounds, {
      profile: 'baseline-policy-codex-v1',
      generator: async ({ phase }) => ({
        text: phase === 'draft' ? JSON.stringify({ scenes: [stamp(6)] }) : text,
        metadata,
      }),
      onDiagnostic: (event) => events.push(event),
    });
    expect(result.ok && result.value).toHaveLength(1);
    expect(events).toContainEqual(
      expect.objectContaining({ stage: 'review', action: 'fallback', phase: 'review', reason }),
    );
    expect(events.some((event) => event.stage === 'validation' && event.phase === 'review')).toBe(
      true,
    );
  });

  it('observes accepted review proposals separately from the draft', async () => {
    const events: PlanningEvent[] = [];
    const result = await planExplainerScenes('', words, bounds, {
      generator: async ({ phase }) => ({
        text: JSON.stringify({ scenes: [stamp(phase === 'draft' ? 6 : 26)] }),
        metadata,
      }),
      onDiagnostic: (event) => events.push(event),
    });
    expect(result.ok && result.value[0].startTime).toBe(12.75);
    expect(events).toContainEqual(
      expect.objectContaining({ stage: 'proposal', action: 'proposed', phase: 'review' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ stage: 'validation', action: 'accepted', phase: 'review' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ stage: 'review', reason: 'review-selected' }),
    );
  });

  it('fails closed on unknown profiles before any request, even for a short transcript', async () => {
    const events: PlanningEvent[] = [];
    const generator = vi.fn();
    const profile = 'PROFILE_Q7X' as PlannerProfileId;
    for (const input of [words, []])
      expect(
        await planExplainerScenes('', input, bounds, {
          generator,
          profile,
          onDiagnostic: (event) => events.push(event),
        }),
      ).toEqual({ ok: false, error: 'Unknown planner profile' });
    expect(parseExplainerPlan({ scenes: [stamp(6)] }, words, bounds, { profile })).toEqual([]);
    expect(generator).not.toHaveBeenCalled();
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.reason === 'unknown-profile')).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/Q7X/);
  });

  it.each(EVALUATION_PROFILES)('resolves known profile $id', async ({ id: profile }) => {
    expect(
      await planExplainerScenes('', words, bounds, {
        profile,
        generator: async () => ({ text: '{"scenes":[]}', metadata }),
      }),
    ).toEqual({ ok: true, value: [] });
  });

  it('does not fall back to a draft or paid transport after an injected review failure', async () => {
    const events: PlanningEvent[] = [];
    const result = await planExplainerScenes('', words, bounds, {
      generator: async ({ phase }) => {
        if (phase === 'review') throw new Error('MODEL_Q7X');
        return { text: JSON.stringify({ scenes: [stamp(6)] }), metadata };
      },
      onDiagnostic: (event) => events.push(event),
    });
    expect(result).toEqual({ ok: false, error: 'MODEL_Q7X' });
    expect(events).toContainEqual(
      expect.objectContaining({
        stage: 'review',
        action: 'rejected',
        reason: 'review-generation-failed',
      }),
    );
    expect(JSON.stringify(events)).not.toMatch(/Q7X/);
    expect(paid.construct).not.toHaveBeenCalled();
    expect(paid.call).not.toHaveBeenCalled();
  });
});

function v(
  startTime: number,
  endTime: number,
  kind: VarietyScene['kind'],
  extra: Partial<VarietyScene> = {},
): VarietyScene {
  return {
    startTime,
    endTime,
    kind,
    layout: 'stack',
    layouts: ['stack', 'over', 'takeover'],
    chained: false,
    ...extra,
  };
}

describe('every baseline variety removal and repair is observable', () => {
  const cases: { reason: string; action: 'removed' | 'repaired'; scenes: VarietyScene[] }[] = [
    { reason: 'overlap', action: 'removed', scenes: [v(0, 4, 'number'), v(3, 7, 'chart')] },
    { reason: 'baseline-gap', action: 'removed', scenes: [v(0, 4, 'number'), v(4.5, 8, 'chart')] },
    {
      reason: 'baseline-kind-repeat',
      action: 'removed',
      scenes: [v(0, 4, 'number'), v(8, 12, 'number')],
    },
    {
      reason: 'baseline-family-repeat',
      action: 'removed',
      scenes: [
        v(0, 4, 'versus', { family: 'compare' }),
        v(8, 12, 'myth-fact', { family: 'compare' }),
        v(16, 20, 'balance', { family: 'compare' }),
      ],
    },
    { reason: 'baseline-coverage', action: 'removed', scenes: [v(0, 60, 'chart')] },
    {
      reason: 'layout-not-allowed',
      action: 'repaired',
      scenes: [v(0, 4, 'chart', { layout: 'pip' })],
    },
    {
      reason: 'baseline-takeover-duration',
      action: 'repaired',
      scenes: [v(0, 4, 'chart', { layout: 'takeover' })],
    },
    {
      reason: 'baseline-takeover-frequency',
      action: 'repaired',
      scenes: [
        v(0, 3, 'number', { layout: 'takeover' }),
        v(8, 11, 'chart', { layout: 'takeover' }),
      ],
    },
    {
      reason: 'chain-layout-matched',
      action: 'repaired',
      scenes: [v(0, 4, 'number', { layout: 'over' }), v(4, 8, 'chart', { chained: true })],
    },
    {
      reason: 'chain-layout-incompatible',
      action: 'removed',
      scenes: [
        v(0, 4, 'number', { layout: 'over' }),
        v(4, 8, 'chart', { chained: true, layouts: ['stack'] }),
      ],
    },
    {
      reason: 'baseline-layout-repeat',
      action: 'repaired',
      scenes: [v(0, 4, 'number'), v(8, 12, 'chart')],
    },
    {
      reason: 'chain-without-predecessor',
      action: 'repaired',
      scenes: [v(0, 4, 'number', { chained: true })],
    },
    {
      reason: 'chain-gap',
      action: 'repaired',
      scenes: [v(0, 4, 'number'), v(8, 12, 'chart', { chained: true })],
    },
  ];
  it.each(cases)('$action: $reason', ({ scenes, reason, action }) => {
    const before = structuredClone(scenes);
    const events: PlanningEvent[] = [];
    expect(applyVarietyRules(scenes, bounds, (event) => events.push(event))).toEqual(
      applyVarietyRules(scenes, bounds),
    );
    expect(events).toContainEqual(expect.objectContaining({ stage: 'policy', action, reason }));
    expect(scenes).toEqual(before);
  });

  it('does not invent repairs for unchanged scenes', () => {
    const events: PlanningEvent[] = [];
    applyVarietyRules([v(0, 4, 'number')], bounds, (event) => events.push(event));
    expect(events).toEqual([]);
  });
});
