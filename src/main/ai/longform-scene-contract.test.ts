import { describe, expect, it } from 'vitest';
import {
  longformSceneId,
  longformSourceFingerprint,
  type SceneFirstLongformPlan,
} from '../../shared/longform-scenes';
import { parseLongformSceneSpec } from './explainer-scenes';
import { validateSceneFirstLongformPlan } from './longform-scene-contract';

function fixture(): {
  plan: SceneFirstLongformPlan;
  words: { text: string; start: number; end: number }[];
  duration: number;
} {
  const words = Array.from({ length: 30 }, (_, index) => ({
    text: index === 6 ? 'battery' : `word${index}`,
    start: index * 0.5,
    end: index * 0.5 + 0.4,
  }));
  const duration = 15;
  const spec = {
    kind: 'hero',
    prop: 'battery',
    label: 'battery',
    startWord: 4,
    endWord: 20,
    word: 6,
    layout: 'takeover',
  };
  const parsed = parseLongformSceneSpec(spec, words, { clipStart: 0, clipEnd: duration });
  if (!parsed) throw new Error('Grounded test fixture must parse through the real scene contract.');
  return {
    words,
    duration,
    plan: {
      schemaVersion: 2,
      mode: 'scene-first',
      parserVersion: 1,
      sourceFingerprint: longformSourceFingerprint(words, duration),
      sourceDuration: duration,
      blocks: [],
      phrases: [],
      cards: [],
      reasoning: 'Offline fixture',
      generatedAt: 1,
      sections: [
        {
          id: 'section-0',
          startWord: 0,
          endWord: 29,
          startTime: 0,
          endTime: duration,
          status: 'planned',
          diagnostics: [],
        },
      ],
      scenes: [
        {
          id: longformSceneId('hero', 4, 20),
          kind: 'hero',
          startWord: 4,
          endWord: 20,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          sectionId: 'section-0',
          presentation: 'full-frame',
          sourceSpec: spec,
          label: 'battery',
          purpose: 'Show the spoken battery example.',
        },
      ],
    },
  };
}

describe('saved scene plan trust boundary', () => {
  it.each([
    'selective',
    'balanced',
    'continuous',
  ] as const)('accepts additive %s metadata without changing approved windows', (editCadence) => {
    const { plan, words, duration } = fixture();
    plan.editCadence = editCadence;
    const result = validateSceneFirstLongformPlan(plan, words, duration);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.plan.scenes).toEqual(plan.scenes);
  });
  it('rejects unknown applied cadence rather than silently defaulting', () => {
    const { plan, words, duration } = fixture();
    Reflect.set(plan, 'editCadence', 'unknown');
    expect(validateSceneFirstLongformPlan(plan, words, duration).ok).toBe(false);
  });
  it('reconstructs a serialized approved story without shortening its full window', () => {
    const { plan, words, duration } = fixture();
    const result = validateSceneFirstLongformPlan(
      JSON.parse(JSON.stringify(plan)),
      words,
      duration,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const scene = result.value.scenes[0];
    expect(scene.kind).toBe('explainer');
    if (scene.kind !== 'explainer') throw new Error('Expected ordinary parser-1 scene');
    expect(scene.planned.endTime).toBe(plan.scenes[0]?.endTime);
    expect(scene.planned.scene.kind).toBe('hero');
    expect(scene.planned.endTime - scene.planned.startTime).toBeGreaterThan(3.5);
  });

  it('rejects metadata whose source evidence does not match the authoritative specification', () => {
    const { plan, words, duration } = fixture();
    plan.scenes[0].startWord = 5;
    expect(validateSceneFirstLongformPlan(plan, words, duration).ok).toBe(false);
  });

  it.each([
    'source',
    'timing',
    'kind',
    'version',
    'duplicate',
    'section',
  ] as const)('fails closed for changed %s', (change) => {
    const { plan, words, duration } = fixture();
    if (change === 'source') words[6].text = 'changed';
    if (change === 'timing') plan.scenes[0].endTime += 0.2;
    if (change === 'kind') plan.scenes[0].sourceSpec.kind = 'unknown-scene';
    if (change === 'version') Reflect.set(plan, 'parserVersion', 99);
    if (change === 'duplicate') plan.scenes.push({ ...plan.scenes[0] });
    if (change === 'section') plan.scenes[0].sectionId = 'missing';
    expect(validateSceneFirstLongformPlan(plan, words, duration).ok).toBe(false);
  });

  it('validates omitted payloads but never schedules them for rendering', () => {
    const { plan, words, duration } = fixture();
    plan.scenes[0].omitted = true;
    const result = validateSceneFirstLongformPlan(plan, words, duration);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.scenes).toEqual([]);
    plan.scenes[0].sourceSpec.kind = 'unknown-scene';
    expect(validateSceneFirstLongformPlan(plan, words, duration).ok).toBe(false);
  });
});
