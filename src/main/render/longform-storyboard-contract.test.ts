import { describe, expect, it } from 'vitest';
import {
  longformSceneId,
  longformSourceFingerprint,
  type SceneFirstLongformPlan,
} from '../../shared/longform-scenes';
import { BUILTIN_PALETTES } from '../../shared/palettes';
import { storyboardDefinitionFixture } from '../../shared/storyboard-fixtures';
import { validateSceneFirstLongformPlan } from '../ai/longform-scene-contract';
import { compileStoryboardSpec } from '../ai/storyboards/compiler';
import { buildLongformSceneTimeline } from './longform-scene-timeline';
import { buildLongformStoryboardProps } from './longform-storyboard-props';

function savedBoard(): {
  fixture: ReturnType<typeof storyboardDefinitionFixture>;
  plan: SceneFirstLongformPlan;
} {
  const fixture = storyboardDefinitionFixture();
  const compiled = compileStoryboardSpec(JSON.parse(JSON.stringify(fixture.spec)), fixture.words, {
    clipStart: 0,
    clipEnd: fixture.duration,
  });
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  const spec = compiled.value.sourceSpec;
  return {
    fixture,
    plan: {
      mode: 'scene-first',
      schemaVersion: 2,
      parserVersion: 2,
      storyboardStyle: 'ink',
      sourceFingerprint: longformSourceFingerprint(fixture.words, fixture.duration),
      sourceDuration: fixture.duration,
      blocks: [],
      phrases: [],
      generatedAt: 1,
      reasoning: 'Authored offline fixture',
      sections: [
        {
          id: 'definition',
          startWord: 0,
          endWord: fixture.words.length - 1,
          startTime: 0,
          endTime: fixture.duration,
          status: 'planned',
          diagnostics: [],
        },
      ],
      scenes: [
        {
          id: longformSceneId('storyboard', spec.startWord, spec.endWord),
          kind: 'storyboard',
          sourceSpec: JSON.parse(JSON.stringify(spec)),
          startWord: spec.startWord,
          endWord: spec.endWord,
          startTime: compiled.value.startTime,
          endTime: compiled.value.endTime,
          label: 'A storyboard',
          purpose: 'Explain the source definition',
          sectionId: 'definition',
          presentation: 'full-frame',
        },
      ],
    },
  };
}

describe('raw storyboard to approved production props', () => {
  it.each([
    'balanced',
    'continuous',
  ] as const)('exports multiple short-source boards only under applied %s budgets', (editCadence) => {
    const { fixture, plan } = savedBoard();
    const originalWords = fixture.words;
    const count = editCadence === 'balanced' ? 2 : 3;
    const words = Array.from({ length: count }, (_, i) =>
      originalWords.map((word) => ({
        ...word,
        start: word.start + i * 20,
        end: word.end + i * 20,
      })),
    ).flat();
    const duration = count * 20;
    plan.sections = [];
    plan.scenes = [];
    for (let i = 0; i < count; i++) {
      const offset = i * originalWords.length;
      const spec = {
        ...fixture.spec,
        startWord: offset,
        endWord: offset + originalWords.length - 1,
        subject: { text: 'storyboard', startWord: offset + 1, endWord: offset + 1 },
        panels: [
          {
            id: 'definition',
            kind: 'statement',
            startWord: offset,
            endWord: offset + originalWords.length - 1,
            title: { text: 'A storyboard', startWord: offset, endWord: offset + 1 },
            body: {
              text: 'keeps related ideas on one canvas',
              startWord: offset + 2,
              endWord: offset + 7,
            },
            revealWord: offset,
            moveWord: offset,
          },
        ],
      };
      const compiled = compileStoryboardSpec(spec, words, { clipStart: 0, clipEnd: duration });
      if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
      const sectionId = `section-${i}`;
      plan.sections.push({
        id: sectionId,
        startWord: spec.startWord,
        endWord: spec.endWord,
        startTime: i * 20,
        endTime: (i + 1) * 20,
        status: 'planned',
        diagnostics: [],
      });
      plan.scenes.push({
        id: longformSceneId('storyboard', spec.startWord, spec.endWord),
        kind: 'storyboard',
        sourceSpec: JSON.parse(JSON.stringify(compiled.value.sourceSpec)),
        startWord: spec.startWord,
        endWord: spec.endWord,
        startTime: compiled.value.startTime,
        endTime: compiled.value.endTime,
        label: 'A storyboard',
        purpose: 'Source definition',
        sectionId,
        presentation: 'full-frame',
      });
    }
    plan.sourceDuration = duration;
    plan.sourceFingerprint = longformSourceFingerprint(words, duration);
    plan.editCadence = editCadence;
    const validated = validateSceneFirstLongformPlan(plan, words, duration);
    if (!validated.ok) throw new Error(validated.error);
    expect(
      buildLongformSceneTimeline(plan, validated.value.scenes).segments.filter(
        (segment) => segment.kind === 'scene',
      ),
    ).toHaveLength(count);
    delete plan.editCadence;
    const legacy = validateSceneFirstLongformPlan(plan, words, duration);
    expect(legacy).toEqual({ ok: false, error: 'Storyboard count budget exceeded.' });
  });
  it.each([
    2, 3,
  ] as const)('reconstructs parser-%i saved raw JSON with exact bookends and both styles', (parserVersion) => {
    const { fixture, plan } = savedBoard();
    plan.parserVersion = parserVersion;
    const original = JSON.stringify(plan);
    const restored: unknown = JSON.parse(original);
    const compiled = validateSceneFirstLongformPlan(restored, fixture.words, fixture.duration);
    if (!compiled.ok) throw new Error(compiled.error);
    expect(compiled.value.scenes[0].kind).toBe('storyboard');
    const timeline = buildLongformSceneTimeline(compiled.value.plan, compiled.value.scenes);
    expect(timeline.totalFrames).toBe(270);
    expect(timeline.segments.map((segment) => segment.kind)).toEqual([
      'speaker',
      'scene',
      'speaker',
    ]);
    expect(
      timeline.segments.reduce((sum, segment) => sum + segment.endFrame - segment.startFrame, 0),
    ).toBe(270);
    const board = timeline.segments.find((segment) => segment.kind === 'scene');
    if (!board || board.kind !== 'scene') throw new Error('Missing board fixture');
    const ink = buildLongformStoryboardProps(board, 'ink', BUILTIN_PALETTES[0]);
    const polish = buildLongformStoryboardProps(board, 'polish', BUILTIN_PALETTES[0]);
    expect(ink.spec).toEqual(polish.spec);
    expect(ink.spec.boardIn.at).toBeGreaterThanOrEqual(0);
    expect(ink.spec.boardIn.at).toBeLessThan(1 / 30);
    expect(JSON.stringify(plan)).toBe(original);
    expect(validateSceneFirstLongformPlan(restored, fixture.words, fixture.duration)).toEqual(
      compiled,
    );
  });
  it('rejects a future parser without coercing or mutating its saved payload', () => {
    const { fixture, plan } = savedBoard();
    const restored: unknown = { ...JSON.parse(JSON.stringify(plan)), parserVersion: 4 };
    const original = JSON.stringify(restored);
    expect(validateSceneFirstLongformPlan(restored, fixture.words, fixture.duration).ok).toBe(
      false,
    );
    expect(JSON.stringify(restored)).toBe(original);
  });
  it.each([
    'timing',
    'identity',
    'source',
    'presentation',
    'version',
  ] as const)('rejects %s drift rather than trimming or upgrading an approved board', (change) => {
    const { fixture, plan } = savedBoard();
    if (change === 'timing') plan.scenes[0].startTime += 0.5;
    if (change === 'identity') plan.scenes[0].id = 'different';
    if (change === 'source') fixture.words[2].text = 'changes';
    if (change === 'presentation') plan.scenes[0].presentation = 'speaker-pip';
    if (change === 'version') plan.parserVersion = 1;
    expect(validateSceneFirstLongformPlan(plan, fixture.words, fixture.duration).ok).toBe(false);
  });
});
