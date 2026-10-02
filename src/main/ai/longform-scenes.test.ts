import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  LongformGenerationRequest,
  SceneFirstLongformPlan,
} from '../../shared/longform-scenes';
import { sceneFirstPlanProblem } from '../../shared/longform-scenes';
import type { StoryboardSourceSpec } from '../../shared/storyboards';
import { collectSceneTimes } from '../remotion/compositions/explainer/types';
import { LONGFORM_PLANNER_PROFILE } from './explainer/planner-profiles';
import {
  type PlannerWord,
  parseLongformSceneSpec,
  planExplainerEditPlan,
} from './explainer-scenes';
import { validateSceneFirstLongformPlan } from './longform-scene-contract';
import { generateSceneFirstLongformPlan } from './longform-scenes';
import { partitionLongformSections } from './longform-sections';
import { compileStoryboardSpec } from './storyboards/compiler';

// Only the paid SDK boundary is replaced. Transport/retries, prompts, review, kind
// parsers, coordinator, scheduler and saved-plan validator are production code.
const { generateContent, generateBoardContent } = vi.hoisted(() => ({
  generateBoardContent:
    vi.fn<
      (request: {
        contents: string;
        config?: { abortSignal?: AbortSignal };
      }) => Promise<{ text: string }>
    >(),
  generateContent:
    vi.fn<
      (request: {
        contents: string;
        config?: { abortSignal?: AbortSignal };
      }) => Promise<{ text: string }>
    >(),
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: (request: { contents: string; config?: { abortSignal?: AbortSignal } }) =>
        request.contents.startsWith('STORYBOARD_PROPOSAL_V1')
          ? generateBoardContent(request)
          : generateContent(request),
    };
  },
  ThinkingLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
}));

function source(count = 540): PlannerWord[] {
  return Array.from({ length: count }, (_, i) => ({
    text: `word${i}${i % 20 === 19 ? '.' : ''}`,
    start: i * 0.5,
    end: i * 0.5 + 0.4,
  }));
}
function request(count = 540): LongformGenerationRequest {
  return {
    apiKey: 'offline-fixture',
    words: source(count),
    videoDuration: count * 0.5,
    requestId: 'test-request',
  };
}
function owner(prompt: string): number {
  const match = /This section owns startWord (\d+)\.\./.exec(prompt);
  if (!match) throw new Error('Missing global section ownership in prompt');
  return Number(match[1]);
}
function hero(startWord: number, endWord = startWord + 18): Record<string, unknown> {
  return {
    kind: 'hero',
    prop: 'battery',
    label: `word${startWord}`,
    startWord,
    endWord,
    word: startWord + 2,
    layout: 'takeover',
    presentation: 'full-frame',
  };
}
function response(scenes: Record<string, unknown>[]) {
  return { text: JSON.stringify({ scenes }) };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function verifyReconstruction(plan: SceneFirstLongformPlan, input: LongformGenerationRequest) {
  expect(sceneFirstPlanProblem(plan)).toBeNull();
  expect(validateSceneFirstLongformPlan(plan, input.words, input.videoDuration).ok).toBe(true);
  for (const saved of plan.scenes) {
    if (saved.kind === 'storyboard') {
      const board = compileStoryboardSpec(saved.sourceSpec, input.words, {
        clipStart: 0,
        clipEnd: input.videoDuration,
      });
      expect(board.ok && board.value.startTime).toBe(saved.startTime);
      expect(board.ok && board.value.endTime).toBe(saved.endTime);
      continue;
    }
    const parsed = parseLongformSceneSpec(saved.sourceSpec, input.words, {
      clipStart: 0,
      clipEnd: input.videoDuration,
    });
    expect(parsed?.startTime).toBe(saved.startTime);
    expect(parsed?.endTime).toBe(saved.endTime);
    expect(parsed?.scene.kind).toBe(saved.kind);
  }
}

beforeEach(() => {
  generateBoardContent.mockReset();
  generateBoardContent.mockResolvedValue({ text: JSON.stringify({ board: null }) });
  generateContent.mockReset();
  generateContent.mockImplementation(async ({ contents }) => response([hero(owner(contents) + 4)]));
});

describe('scene-first long-form coordinator at the model boundary', () => {
  it('stores reviewed raw GLOBAL indices, extras and full windows, never cooked scenes or legacy fillers', async () => {
    const input = request();
    generateContent.mockImplementation(async ({ contents }) => {
      const start =
        owner(contents) + (contents.includes('A first draft plan was produced:') ? 6 : 4);
      return response([
        { ...hero(start), laterStamp: { text: 'ENERGY', word: start + 12 }, dimWord: start + 14 },
      ]);
    });
    const plan = await generateSceneFirstLongformPlan(input);
    expect(plan.scenes.map((scene) => scene.startWord)).toEqual([6, 186, 366]);
    expect(plan.sections.map((section) => section.status)).toEqual([
      'planned',
      'planned',
      'planned',
    ]);
    expect(plan.blocks).toEqual([]);
    expect(plan.phrases).toEqual([]);
    expect(plan.cards).toEqual([]);
    expect(generateContent).toHaveBeenCalledTimes(6); // three ordinary drafts + reviews
    expect(generateBoardContent).toHaveBeenCalledTimes(3); // exactly one explicit null per section
    expect(plan.parserVersion).toBe(2);
    expect(plan.storyboardStyle).toBe('polish');
    for (const scene of plan.scenes) {
      expect(scene.sourceSpec).toEqual({
        ...hero(scene.startWord),
        laterStamp: { text: 'ENERGY', word: scene.startWord + 12 },
        dimWord: scene.startWord + 14,
      });
      expect(scene.sourceSpec).not.toHaveProperty('scene');
      expect(scene.sourceSpec).not.toHaveProperty('at');
      expect(scene.endTime - scene.startTime).toBeGreaterThan(3.5);
      const parsed = parseLongformSceneSpec(scene.sourceSpec, input.words, {
        minStart: 0,
        maxEnd: input.videoDuration,
      });
      expect(parsed?.scene).toHaveProperty('overlayStamp');
      expect(parsed?.scene).toHaveProperty('dimAt');
      expect(parsed?.cues.length).toBeGreaterThan(0);
    }
    const lastPrompt =
      generateContent.mock.calls.find(([call]) => owner(call.contents) === 360)?.[0].contents ?? '';
    expect(lastPrompt).toContain('360:word360');
    expect(lastPrompt).not.toContain('0:word0 ');
    expect(lastPrompt).toContain('Recent families:');
    verifyReconstruction(plan, input);
  });

  it('lets a boundary story finish in context and schedules whole windows without inward cuts', async () => {
    const input = request(360);
    const [first] = partitionLongformSections(input.words);
    generateContent.mockImplementation(async ({ contents }) =>
      response([hero(owner(contents) === 0 ? first.endWord - 6 : 184)]),
    );
    const plan = await generateSceneFirstLongformPlan(input);
    expect(plan.scenes).toHaveLength(1);
    expect(plan.scenes[0].endWord).toBeGreaterThan(first.endWord);
    expect(plan.scenes[0].endTime).toBeGreaterThan(first.endTime);
    expect(plan.sections[1].status).toBe('empty');
    expect(
      plan.sections[1].diagnostics.some((message) => message.startsWith('schedule-rejected:')),
    ).toBe(true);
    verifyReconstruction(plan, input);
  });

  it('caps concurrent sections at two and makes output/history independent of completion order', async () => {
    const input = request(720);
    const gates = [deferred(), deferred()];
    let active = 0;
    let maximum = 0;
    generateContent.mockImplementation(async ({ contents }) => {
      active++;
      maximum = Math.max(maximum, active);
      const start = owner(contents);
      if (start < 360 && !contents.includes('A first draft plan was produced:'))
        await gates[start / 180].promise;
      active--;
      return response([hero(start + 4)]);
    });
    const progress = vi.fn();
    const pending = generateSceneFirstLongformPlan({ ...input, onProgress: progress });
    await vi.waitFor(() => expect(generateContent).toHaveBeenCalledTimes(2));
    gates[1].resolve();
    await vi.waitFor(() => expect(generateContent).toHaveBeenCalledTimes(3));
    expect(progress).not.toHaveBeenCalled();
    expect(generateContent.mock.calls.every(([call]) => owner(call.contents) < 360)).toBe(true);
    gates[0].resolve();
    const first = await pending;
    expect(maximum).toBe(2);
    expect(progress.mock.calls.map(([event]) => event.sectionId)).toEqual(
      first.sections.map((section) => section.id),
    );
    expect(progress.mock.calls.map(([event]) => event.window)).toEqual([1, 2, 3, 4]);
    expect(
      progress.mock.calls.every(
        ([event]) => event.requestId === input.requestId && event.total === 4,
      ),
    ).toBe(true);
    const second = await generateSceneFirstLongformPlan(input);
    expect(first.scenes).toEqual(second.scenes);
    verifyReconstruction(first, input);
  });

  it('reports genuine empty versus malformed/invalid/provider-failed sections and returns a usable partial plan', async () => {
    const input = request(900);
    generateContent.mockImplementation(async ({ contents }) => {
      switch (owner(contents)) {
        case 0:
          return response([]);
        case 180:
          return { text: 'not JSON' };
        case 360:
          return response([{ kind: 'not-a-kind', startWord: 364, endWord: 382 }]);
        case 540:
          throw Object.assign(new Error('private-provider-detail'), { status: 400 });
        default:
          return response([hero(724)]);
      }
    });
    const plan = await generateSceneFirstLongformPlan(input);
    expect(plan.sections.map((section) => section.status)).toEqual([
      'empty',
      'failed',
      'failed',
      'failed',
      'planned',
    ]);
    expect(JSON.stringify(plan)).not.toContain('private-provider-detail');
    expect(plan.scenes.map((scene) => scene.startWord)).toEqual([724]);
    verifyReconstruction(plan, input);
  });

  it.each([
    ['unknown-kind', 'not-a-kind'],
    ['invalid-core', 'hero'],
  ])('the root planner rejects an all-%s response rather than returning successful empty specs', async (reason, kind) => {
    const input = request(180);
    const diagnostic = vi.fn();
    generateContent.mockResolvedValue(response([{ kind, startWord: 4, endWord: 22 }]));
    const result = await planExplainerEditPlan(
      input.apiKey,
      input.words,
      { minStart: 0, maxEnd: input.videoDuration },
      {
        profile: LONGFORM_PLANNER_PROFILE,
        onDiagnostic: diagnostic,
      },
    );
    expect(result).toEqual({
      ok: false,
      error: 'Long-form section returned no valid scene specifications',
    });
    expect(generateContent).toHaveBeenCalledTimes(2); // both draft and review reject the actual model payload
    expect(diagnostic.mock.calls.map(([event]) => event)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: 'draft', action: 'rejected', reason }),
        expect.objectContaining({ phase: 'review', action: 'rejected', reason }),
        expect.objectContaining({ action: 'rejected', reason: 'no-usable-scenes' }),
      ]),
    );
    // This fail-closed result is opt-in; the legacy/default planner contract is unchanged.
    const baseline = await planExplainerEditPlan(
      input.apiKey,
      input.words,
      { minStart: 0, maxEnd: input.videoDuration },
      {
        profile: 'baseline-policy-codex-v1',
        review: false,
      },
    );
    expect(baseline.ok && baseline.value.scenes).toEqual([]);
  });

  it('the root planner accepts an intentional empty model list without rejection diagnostics', async () => {
    const input = request(180);
    generateContent.mockResolvedValue(response([]));
    const result = await planExplainerEditPlan(
      input.apiKey,
      input.words,
      { minStart: 0, maxEnd: input.videoDuration },
      {
        profile: LONGFORM_PLANNER_PROFILE,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.scenes).toEqual([]);
    expect(result.value.sourceSpecs).toEqual([]);
    expect(result.value.diagnostics.events.some((event) => event.action === 'rejected')).toBe(
      false,
    );
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('retains prior scenes for all-rejected sections while honoring a genuinely empty sibling section', async () => {
    const input = request(540);
    const previousPlan = await generateSceneFirstLongformPlan(input);
    const untouched = structuredClone(previousPlan);
    const progress = vi.fn();
    generateContent.mockImplementation(async ({ contents }) => {
      const start = owner(contents);
      return response(
        start === 360
          ? []
          : [
              {
                kind: start === 0 ? 'not-a-kind' : 'hero',
                startWord: start + 4,
                endWord: start + 22,
              },
            ],
      );
    });
    const result = await generateSceneFirstLongformPlan({
      ...input,
      previousPlan,
      onProgress: progress,
    });
    expect(result.sections.map((section) => section.status)).toEqual(['failed', 'failed', 'empty']);
    expect(progress.mock.calls.map(([event]) => event.outcome)).toEqual([
      'failed',
      'failed',
      'empty',
    ]);
    expect(result.sections[0].diagnostics).toContain('draft:unknown-kind:0');
    expect(result.sections[1].diagnostics).toContain('draft:invalid-core:0');
    for (const section of result.sections.slice(0, 2))
      expect(section.diagnostics).toContain('draft:no-usable-scenes');
    expect(result.scenes).toEqual(previousPlan.scenes.slice(0, 2));
    expect(previousPlan).toEqual(untouched);
    verifyReconstruction(result, input);
    await expect(
      generateSceneFirstLongformPlan({
        ...input,
        previousPlan,
        sectionIds: previousPlan.sections.slice(0, 2).map((section) => section.id),
      }),
    ).rejects.toThrow('Every attempted long-form section failed');
    expect(previousPlan).toEqual(untouched);
  });

  it('fails closed when every attempted section fails; an explicit all-empty result is successful', async () => {
    generateContent.mockResolvedValue({ text: '{}' });
    await expect(generateSceneFirstLongformPlan(request(360))).rejects.toThrow('Every attempted');
    generateContent.mockResolvedValue(response([]));
    const input = request(360);
    const empty = await generateSceneFirstLongformPlan(input);
    expect(empty.scenes).toEqual([]);
    expect(empty.sections.every((section) => section.status === 'empty')).toBe(true);
    verifyReconstruction(empty, input);
  });

  it('retries only selected sections, preserves omitted/user presentation decisions, and rejects competing windows', async () => {
    const input = request(540);
    const prior = await generateSceneFirstLongformPlan(input);
    prior.scenes[0].presentation = 'speaker-pip';
    prior.scenes[1].omitted = true;
    const untouched = structuredClone(prior);
    generateContent.mockClear();
    generateContent.mockImplementation(async ({ contents }) =>
      response([hero(owner(contents)), hero(owner(contents) + 30)]),
    );
    const next = await generateSceneFirstLongformPlan({
      ...input,
      previousPlan: prior,
      sectionIds: [prior.sections[0].id],
      preservedSceneIds: [prior.scenes[0].id],
    });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls.every(([call]) => owner(call.contents) === 0)).toBe(true);
    expect(generateBoardContent.mock.calls.at(-1)?.[0].contents).toContain('startWord 0..');
    for (const scene of prior.scenes) expect(next.scenes).toContainEqual(scene);
    expect(next.scenes.some((scene) => scene.startWord === 0)).toBe(false);
    expect(next.scenes.some((scene) => scene.startWord === 30)).toBe(true);
    expect(next.sections.slice(1)).toEqual(prior.sections.slice(1));
    expect(prior).toEqual(untouched);
    verifyReconstruction(next, input);
  });

  it('does not erase old scenes on a partial retry failure or replace the previous plan on total retry failure', async () => {
    const input = request(540);
    const prior = await generateSceneFirstLongformPlan(input);
    const untouched = structuredClone(prior);
    generateContent.mockImplementation(async ({ contents }) =>
      owner(contents) === 180 ? { text: 'broken' } : response([]),
    );
    const next = await generateSceneFirstLongformPlan({
      ...input,
      previousPlan: prior,
      sectionIds: prior.sections.slice(0, 2).map((section) => section.id),
    });
    expect(next.sections.map((section) => section.status)).toEqual(['empty', 'failed', 'planned']);
    expect(next.scenes).toEqual(prior.scenes.slice(1));
    await expect(
      generateSceneFirstLongformPlan({
        ...input,
        previousPlan: prior,
        sectionIds: [prior.sections[1].id],
      }),
    ).rejects.toThrow('Every attempted');
    expect(prior).toEqual(untouched);
    verifyReconstruction(next, input);
  });

  it('rejects stale preservation/unknown section ids before model calls; empty retry is a no-op', async () => {
    const input = request(180);
    const prior = await generateSceneFirstLongformPlan(input);
    generateContent.mockClear();
    const changed = {
      ...input,
      words: input.words.map((word, i) => (i === 0 ? { ...word, text: 'changed' } : word)),
    };
    await expect(
      generateSceneFirstLongformPlan({ ...changed, previousPlan: prior }),
    ).rejects.toThrow('different source');
    await expect(
      generateSceneFirstLongformPlan({ ...input, previousPlan: prior, sectionIds: ['unknown'] }),
    ).rejects.toThrow('Unknown planning section');
    await expect(
      generateSceneFirstLongformPlan({
        ...input,
        previousPlan: prior,
        preservedSceneIds: ['unknown'],
      }),
    ).rejects.toThrow('Unknown preserved');
    const next = await generateSceneFirstLongformPlan({
      ...input,
      previousPlan: prior,
      sectionIds: [],
    });
    expect(next.scenes).toEqual(prior.scenes);
    expect(next.sections).toEqual(prior.sections);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('cancels in-flight generation, launches no later batch and returns no partial plan', async () => {
    const controller = new AbortController();
    const progress = vi.fn();
    generateContent.mockImplementation(
      ({ config }) =>
        new Promise((_, reject) => {
          expect(config?.abortSignal).toBe(controller.signal);
          config?.abortSignal?.addEventListener('abort', () => reject(controller.signal.reason), {
            once: true,
          });
        }),
    );
    const pending = generateSceneFirstLongformPlan({
      ...request(),
      signal: controller.signal,
      onProgress: progress,
    });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(generateContent).toHaveBeenCalledTimes(2));
    controller.abort();
    await rejected;
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(progress).not.toHaveBeenCalled();
    await expect(
      generateSceneFirstLongformPlan({ ...request(), signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('rejects context-only starts and repairs invalid draft payloads via the real review pass', async () => {
    const input = request(360);
    generateContent.mockImplementation(async ({ contents }) => {
      if (owner(contents) === 0) return response([]);
      return response([hero(contents.includes('A first draft plan was produced:') ? 184 : 174)]);
    });
    const plan = await generateSceneFirstLongformPlan(input);
    expect(plan.scenes.map((scene) => scene.startWord)).toEqual([184]);
    expect(
      generateContent.mock.calls.some(([call]) =>
        call.contents.includes('Scene must start in its owned section'),
      ),
    ).toBe(true);
    verifyReconstruction(plan, input);
  });
});

describe('storyboards in real scene-first regeneration', () => {
  function boardInput() {
    const input = request(360);
    'A storyboard keeps related ideas on one canvas while the camera moves between panels'
      .split(' ')
      .forEach((text, i) => {
        input.words[i + 4].text = text;
      });
    const spec: StoryboardSourceSpec = {
      kind: 'storyboard',
      specVersion: 1,
      startWord: 4,
      endWord: 28,
      subject: { text: 'storyboard', startWord: 5, endWord: 5 },
      panels: [
        {
          id: 'definition',
          kind: 'statement',
          startWord: 4,
          endWord: 28,
          title: { text: 'A storyboard', startWord: 4, endWord: 5 },
          body: { text: 'keeps related ideas on one canvas', startWord: 6, endWord: 11 },
          revealWord: 4,
          moveWord: 4,
        },
      ],
    };
    generateContent.mockImplementation(async ({ contents }) =>
      response([
        { ...hero(owner(contents) + 4), ...(owner(contents) === 0 ? { label: 'storyboard' } : {}) },
      ]),
    );
    generateBoardContent.mockImplementation(async ({ contents }) => ({
      text: JSON.stringify({ board: owner(contents) === 0 ? spec : null }),
    }));
    return input;
  }
  it('records full replacements, saves raw source, recompiles, and preserves IDs/style across section regeneration', async () => {
    const input = boardInput();
    const first = await generateSceneFirstLongformPlan({ ...input, storyboardStyle: 'ink' });
    expect(first.scenes.map((s) => s.kind)).toEqual(['storyboard', 'hero']);
    expect(first.sections[0].diagnostics.some((d) => d.startsWith('storyboard-replaced:'))).toBe(
      true,
    );
    const next = await generateSceneFirstLongformPlan({
      ...input,
      previousPlan: first,
      sectionIds: [first.sections[0].id],
    });
    expect(next.scenes).toEqual(first.scenes);
    expect(next.storyboardStyle).toBe('ink');
    expect(next.scenes[0].sourceSpec).not.toHaveProperty('shots');
    verifyReconstruction(JSON.parse(JSON.stringify(next)), input);
  });
  it('preserves pinned and omitted boards without mutating the previous plan', async () => {
    const input = boardInput();
    const prior = await generateSceneFirstLongformPlan(input);
    for (const omitted of [false, true]) {
      const previousPlan = structuredClone(prior);
      previousPlan.scenes[0].omitted = omitted;
      const untouched = structuredClone(previousPlan);
      const result = await generateSceneFirstLongformPlan({
        ...input,
        previousPlan,
        sectionIds: [prior.sections[0].id],
        preservedSceneIds: omitted ? [] : [prior.scenes[0].id],
      });
      expect(result.scenes).toEqual(previousPlan.scenes);
      expect(previousPlan).toEqual(untouched);
      verifyReconstruction(result, input);
    }
  });
  it('retains a valid ordinary alternative on board failure, and preserves history when all planning fails', async () => {
    const input = boardInput();
    const prior = await generateSceneFirstLongformPlan(input);
    const untouched = structuredClone(prior);
    generateBoardContent.mockResolvedValue({ text: 'broken' });
    const fresh = await generateSceneFirstLongformPlan(input);
    expect(fresh.scenes.map((s) => s.kind)).toEqual(['hero', 'hero']);
    expect(fresh.sections[0].diagnostics).toContain('storyboard-generation-failed');
    const regenerated = await generateSceneFirstLongformPlan({
      ...input,
      previousPlan: prior,
      sectionIds: [prior.sections[0].id],
    });
    expect(regenerated.scenes.map((scene) => scene.kind)).toEqual(['hero', 'hero']);
    expect(regenerated.sections[0].diagnostics).toContain('storyboard-generation-failed');
    expect(regenerated.sections[0].status).toBe('planned');
    verifyReconstruction(regenerated, input);
    generateContent.mockResolvedValue({ text: 'broken ordinary response' });
    await expect(
      generateSceneFirstLongformPlan({
        ...input,
        previousPlan: prior,
        sectionIds: [prior.sections[0].id],
      }),
    ).rejects.toThrow('Every attempted');
    expect(prior).toEqual(untouched);
    verifyReconstruction(prior, input);
  });
  it('propagates cancellation during a board proposal without repairs or a replacement plan', async () => {
    const input = boardInput();
    const prior = await generateSceneFirstLongformPlan(input);
    const controller = new AbortController();
    generateBoardContent.mockClear();
    generateBoardContent.mockImplementation(() => new Promise(() => {}));
    const pending = generateSceneFirstLongformPlan({
      ...input,
      previousPlan: prior,
      sectionIds: [prior.sections[0].id],
      signal: controller.signal,
    });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(generateBoardContent).toHaveBeenCalledTimes(1));
    controller.abort();
    await rejected;
    expect(generateBoardContent).toHaveBeenCalledTimes(1);
    verifyReconstruction(prior, input);
  });
  it('keeps ordinary AND board requests together within two active sections', async () => {
    const gates = [deferred(), deferred()];
    let active = 0;
    let maximum = 0;
    const handler = async (contents: string, board: boolean) => {
      active++;
      maximum = Math.max(maximum, active);
      if (board && owner(contents) < 360) await gates[owner(contents) / 180].promise;
      else await Promise.resolve();
      active--;
      return board ? { text: '{"board":null}' } : response([hero(owner(contents) + 4)]);
    };
    generateContent.mockImplementation(({ contents }) => handler(contents, false));
    generateBoardContent.mockImplementation(({ contents }) => handler(contents, true));
    const pending = generateSceneFirstLongformPlan(request(540));
    await vi.waitFor(() => expect(generateBoardContent).toHaveBeenCalledTimes(2));
    expect(active).toBe(2);
    expect(generateContent.mock.calls.every(([c]) => owner(c.contents) < 360)).toBe(true);
    gates[1].resolve();
    gates[0].resolve();
    await pending;
    expect(maximum).toBe(2);
    expect(generateBoardContent).toHaveBeenCalledTimes(3);
  });
});

describe('long-form parser preserves grounded five-beat stories', () => {
  const [fixture] = JSON.parse(
    readFileSync(
      new URL(
        '../../../scripts/explainer-stills/fixtures/technology-context-window.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as { sourceText: string; wordStepSec: number; raw: Record<string, unknown> }[];
  const prefix = source(360);
  const story = fixture.sourceText.split(/\s+/).map((text, i) => ({
    text,
    start: 180 + i * fixture.wordStepSec,
    end: 180 + (i + 0.9) * fixture.wordStepSec,
  }));
  const words = [...prefix, ...story];
  const raw = Object.fromEntries(
    Object.entries(fixture.raw).map(([key, value]) => [
      key,
      key.endsWith('Word') && typeof value === 'number' ? value + prefix.length : value,
    ]),
  );

  it('reconstructs exact global setup/action/response/check/resolve times without a takeover cap', async () => {
    const input = { apiKey: 'offline', words, videoDuration: 195 };
    generateContent.mockImplementation(async ({ contents }) =>
      response(
        owner(contents) === 360 ? [{ ...raw, layout: 'takeover', presentation: 'full-frame' }] : [],
      ),
    );
    const plan = await generateSceneFirstLongformPlan(input);
    expect(plan.scenes).toHaveLength(1);
    verifyReconstruction(plan, input);
    const parsed = parseLongformSceneSpec(plan.scenes[0].sourceSpec, words, {
      clipStart: 0,
      clipEnd: 195,
    });
    expect(parsed?.endTime).toBeGreaterThan(189);
    expect(parsed && collectSceneTimes(parsed.scene)).toEqual([180.05, 181.5, 183.3, 185.4, 187.5]);
  });

  it('rejects invented outcomes, clipped stories and overlong windows without weakening source grounding', () => {
    expect(
      parseLongformSceneSpec({ ...raw, outcome: 'All details are permanently deleted' }, words, {
        clipStart: 0,
        clipEnd: 195,
      }),
    ).toBeNull();
    expect(parseLongformSceneSpec(raw, words, { clipStart: 181, clipEnd: 195 })).toBeNull();
    expect(parseLongformSceneSpec(raw, words, { clipStart: 0, clipEnd: 187.7 })).toBeNull();
    expect(parseLongformSceneSpec(hero(0, 40), prefix, { clipStart: 0, clipEnd: 180 })).toBeNull();
  });
});
