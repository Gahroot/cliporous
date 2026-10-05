import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusinessExplanationIdentityLink } from '../../../shared/business-explanation-source';
import {
  compactBusinessSourceChoices,
  expandBusinessSourceChoices,
} from '../../../shared/business-source-choices';
import { longformSceneId, longformSourceFingerprint } from '../../../shared/longform-scenes';
import { BUSINESS_RECIPES } from '../../remotion/compositions/explainer/business/catalog';
import { businessSourceFixture } from '../../remotion/compositions/explainer/business/source-fixtures';
import { parseLongformSceneSpec } from '../explainer-scenes';
import { validateSceneFirstLongformPlan } from '../longform-scene-contract';
import { generateSceneFirstLongformPlan } from '../longform-scenes';
import { partitionLongformSections } from '../longform-sections';
import { parseBusinessExplanationSource } from './business-adapters';
import { compileStoryboardSpec } from './compiler';
import { boardFixture, savedBoardFixture } from './fixtures';
import { planStoryboardSection } from './planner';

const { generateContent, generateBoardContent } = vi.hoisted(() => ({
  generateContent: vi.fn<(request: { contents: string }) => Promise<{ text: string }>>(),
  generateBoardContent: vi.fn<(request: { contents: string }) => Promise<{ text: string }>>(),
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: (request: { contents: string }) =>
        request.contents.startsWith('STORYBOARD_PROPOSAL_V2')
          ? generateBoardContent(request)
          : generateContent(request),
    };
  },
  ThinkingLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
}));

function fixture(id: 'OP-17' | 'OP-01', mode: 'diagram' | 'hybrid') {
  const source = businessSourceFixture(id, mode);
  if (!source) throw new Error('Missing authored source');
  const compact = compactBusinessSourceChoices(source.raw);
  if (!compact.ok) throw new Error(compact.message);
  const last = source.words.at(-1);
  if (!last) throw new Error('Missing source words');
  // Same reading-hold extension as business-board-save; native facts/beats remain intact.
  const words = [
    ...source.words,
    { text: 'Context', start: last.end + 12, end: last.end + 12.3 },
  ].map((word) => ({ ...word, start: word.start + 17, end: word.end + 17 }));
  const explanation = {
    sourceVersion: 2,
    recipe: id,
    sourceChoices: compact.choices,
    identityLinks: [] as BusinessExplanationIdentityLink[],
  };
  const parsed = parseBusinessExplanationSource(explanation, words, { clipStart: 0, clipEnd: 120 });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
  const identity = parsed.value.identities[0];
  if (!identity) throw new Error('Missing concrete identity');
  explanation.identityLinks.push({
    localId: identity.identity.id,
    sharedId: 'source-business',
    role: identity.roles[0],
    startWord: identity.identity.source.fromWord,
    endWord: identity.identity.source.toWord,
  });
  const title = { text: words[0].text, startWord: 0, endWord: 0 };
  const spec = {
    kind: 'storyboard',
    specVersion: 2,
    startWord: 0,
    endWord: words.length - 1,
    subject: title,
    panels: [
      {
        kind: 'explanation',
        id: 'business',
        startWord: 0,
        endWord: words.length - 1,
        revealWord: 0,
        moveWord: 0,
        title,
        explanation,
      },
    ],
  };
  const options = {
    apiKey: 'offline-fixture',
    words,
    duration: 120,
    section: partitionLongformSections(words)[0],
    style: 'ink' as const,
  };
  return { source, words, spec, options, native: parsed.value };
}

beforeEach(() => {
  generateContent.mockReset();
  generateContent.mockResolvedValue({ text: '{"scenes":[]}' });
  generateBoardContent.mockReset();
});

describe('business storyboard generation at the paid SDK boundary only', () => {
  it.each([
    ['OP-17', 'diagram'],
    ['OP-17', 'hybrid'],
    ['OP-01', 'diagram'],
  ] as const)('compiles provider source2 %s/%s without rewriting facts or clocks', async (id, mode) => {
    const input = fixture(id, mode);
    const before = JSON.stringify(input.spec);
    generateBoardContent.mockResolvedValue({ text: JSON.stringify({ board: input.spec }) });
    const result = await planStoryboardSection(input.options);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok || !result.value.board) throw new Error('Missing compiled board');
    expect(generateBoardContent).toHaveBeenCalledTimes(1);
    const prompt = generateBoardContent.mock.calls[0][0].contents;
    expect(prompt).toContain('STORYBOARD_PROPOSAL_V2');
    expect(prompt).toContain('sourceVersion:2');
    expect(prompt).toContain('ChoiceFromWord');
    expect(prompt).toContain(`"sourceVersion":2,"recipe":"${id}"`);
    expect(prompt).toContain('GLOBAL transcript word indices');
    for (const recipe of BUSINESS_RECIPES) {
      expect(prompt).toContain(
        JSON.stringify({
          recipe: recipe.id,
          kind: recipe.kind,
          preset: recipe.preset,
          modes: recipe.modes,
          objective: recipe.objective,
        }),
      );
    }
    expect(Buffer.byteLength(prompt)).toBeLessThanOrEqual(64_000);
    const direct = compileStoryboardSpec(input.spec, input.words, {
      clipStart: 0,
      clipEnd: 120,
      section: input.options.section,
      sourceId: input.options.section.id,
    });
    if (!direct.ok) throw new Error(JSON.stringify(direct.diagnostics));
    expect(result.value.board).toStrictEqual(direct.value);
    expect(result.value.board.sourceSpec).toStrictEqual(input.spec);
    const panel = result.value.board.board.businessPanels?.[0];
    expect(panel?.id).toBe('business');
    expect(panel?.scene).toStrictEqual(input.native.planned.scene);
    expect(panel?.identityLinks).toEqual(input.spec.panels[0].explanation.identityLinks);
    expect(panel?.identityLinks).toHaveLength(1);
    const expanded = expandBusinessSourceChoices(input.spec.panels[0].explanation.sourceChoices);
    expect(expanded.ok && expanded.choices).toStrictEqual(input.source.raw);
    const concrete = parseLongformSceneSpec(input.source.raw, input.words, {
      clipStart: 0,
      clipEnd: 120,
    });
    expect(concrete).toStrictEqual(input.native.planned);
    expect(panel?.startAt).toBe(concrete?.startTime);
    expect(panel?.endAt).toBe(concrete?.endTime);
    expect(JSON.stringify(input.spec)).toBe(before);
  });

  it.each([
    'actor',
    'source-actor',
    'geometry',
    'extra',
  ] as const)('rejects unsafe %s without semantic retry', async (reason) => {
    const input = fixture('OP-17', 'diagram');
    const raw = structuredClone(input.spec);
    if (reason === 'actor')
      raw.panels[0].explanation.identityLinks = [
        {
          localId: 'invented-actor',
          sharedId: 'invented',
          role: 'actor',
          startWord: 0,
          endWord: 0,
        },
      ];
    else if (reason === 'source-actor')
      Object.assign(raw.panels[0].explanation.sourceChoices, {
        businessChoiceLabel: 'Invented actor',
      });
    else if (reason === 'geometry')
      Object.assign(raw.panels[0].explanation.sourceChoices, { geometry: { x: 9 } });
    else Object.assign(raw.panels[0], { arbitraryExtra: 'unsupported' });
    generateBoardContent.mockResolvedValue({ text: JSON.stringify({ board: raw }) });
    const result = await planStoryboardSection(input.options);
    expect(result.ok).toBe(false);
    expect(generateBoardContent).toHaveBeenCalledTimes(1);
    expect(generateBoardContent.mock.calls[0][0].contents).not.toContain('SEMANTIC_REPAIR_ONCE');
  });

  it.each([
    'transcript',
    'whole-prompt',
  ] as const)('fails closed on giant %s before any provider call', async (size) => {
    const input = fixture('OP-01', 'diagram');
    const words = input.words.map((word, index) => ({
      ...word,
      text:
        size === 'transcript'
          ? 'business '.repeat(2_000)
          : index === 0
            ? 'x'.repeat(62_000)
            : word.text,
    }));
    if (size === 'whole-prompt') {
      const transcript = words.map((word, index) => `${index}:${word.text}`).join(' ');
      expect(Buffer.byteLength(transcript)).toBeLessThan(64_000);
    }
    const result = await planStoryboardSection({ ...input.options, words });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.diagnostics.some((issue) => issue.message.includes('budget'))).toBe(true);
    expect(generateBoardContent).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('generates parser3/spec2 through ordinary planning and preserves historical parser2/spec1 unchanged', async () => {
    const input = fixture('OP-17', 'hybrid');
    generateBoardContent.mockResolvedValue({ text: JSON.stringify({ board: input.spec }) });
    const plan = await generateSceneFirstLongformPlan({
      apiKey: 'offline-fixture',
      words: input.words,
      videoDuration: 120,
      requestId: 'business-generation',
      storyboardStyle: 'ink',
    });
    expect(generateContent).toHaveBeenCalled();
    expect(generateBoardContent).toHaveBeenCalledTimes(1);
    expect(plan.parserVersion).toBe(3);
    expect(plan.scenes).toHaveLength(1);
    expect(plan.scenes[0]).toMatchObject({
      kind: 'storyboard',
      id: longformSceneId('storyboard', 0, input.words.length - 1),
      sourceSpec: input.spec,
      sectionId: input.options.section.id,
      presentation: 'full-frame',
    });
    expect(plan.sourceFingerprint).toBe(longformSourceFingerprint(input.words, 120));
    const validated = validateSceneFirstLongformPlan(plan, input.words, 120);
    expect(validated.ok, JSON.stringify(validated)).toBe(true);
    if (!validated.ok) throw new Error(validated.error);
    const scene = validated.value.scenes[0];
    if (scene.kind !== 'storyboard') throw new Error('Missing reconstructed board');
    expect(scene.board.businessPanels?.[0].scene).toStrictEqual(input.native.planned.scene);

    const legacy = boardFixture();
    const previous = savedBoardFixture(legacy);
    const section = partitionLongformSections(legacy.words)[0];
    previous.sections = [
      {
        id: section.id,
        startWord: section.startWord,
        endWord: section.endWord,
        startTime: section.startTime,
        endTime: section.endTime,
        status: 'planned',
        diagnostics: [],
      },
    ];
    previous.scenes[0].sectionId = section.id;
    const before = JSON.stringify(previous);
    const calls = generateBoardContent.mock.calls.length + generateContent.mock.calls.length;
    const retained = await generateSceneFirstLongformPlan({
      apiKey: 'offline-fixture',
      words: legacy.words,
      videoDuration: legacy.duration,
      requestId: 'historical',
      previousPlan: previous,
      sectionIds: [],
    });
    expect(retained).toStrictEqual(previous);
    expect(retained).not.toBe(previous);
    expect(retained.parserVersion).toBe(2);
    expect(retained.scenes[0].sourceSpec).toMatchObject({ specVersion: 1 });
    expect(validateSceneFirstLongformPlan(retained, legacy.words, legacy.duration).ok).toBe(true);
    expect(JSON.stringify(previous)).toBe(before);
    expect(generateBoardContent.mock.calls.length + generateContent.mock.calls.length).toBe(calls);
  });
});
