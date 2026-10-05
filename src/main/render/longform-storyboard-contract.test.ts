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
