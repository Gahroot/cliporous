import { describe, expect, it } from 'vitest';
import { isLongformSourceSpec, sceneFirstPlanProblem } from './longform-scenes';
import {
  normalizeStoryboardStyle,
  STORYBOARD_LIMITS,
  STORYBOARD_MODEL_ACTIONS,
  STORYBOARD_MODELS,
} from './storyboards';

const envelope = (parserVersion: number): Record<string, unknown> => ({
  mode: 'scene-first',
  schemaVersion: 2,
  parserVersion,
  sourceFingerprint: 'lf1-0000000000000000',
  sourceDuration: 12,
  blocks: [],
  phrases: [],
  scenes: [],
  sections: [],
  reasoning: '',
  generatedAt: 1,
});

describe('storyboard version and budget boundary', () => {
  it('retains parser-1 meaning and requires explicit valid parser-2 style', () => {
    expect(sceneFirstPlanProblem(envelope(1))).toBeNull();
    expect(sceneFirstPlanProblem(envelope(2))).toContain('style');
    for (const style of ['ink', 'polish']) {
      expect(sceneFirstPlanProblem({ ...envelope(2), storyboardStyle: style })).toBeNull();
    }
    expect(sceneFirstPlanProblem({ ...envelope(2), storyboardStyle: 'editorial' })).toContain(
      'style',
    );
    expect(sceneFirstPlanProblem(envelope(3))).toContain('Unsupported');
  });
  it('normalizes settings only, not saved plans', () => {
    expect(normalizeStoryboardStyle(undefined)).toBe('polish');
    expect(normalizeStoryboardStyle('ink')).toBe('ink');
    expect(normalizeStoryboardStyle('dark')).toBe('polish');
  });
  it('bounds the vocabulary and retains JSON input limits', () => {
    expect(STORYBOARD_LIMITS.maxPanels).toBe(5);
    expect(STORYBOARD_LIMITS.maxElements).toBe(48);
    expect(STORYBOARD_LIMITS.maxProps).toBe(6);
    expect(STORYBOARD_MODELS).toHaveLength(7);
    for (const model of STORYBOARD_MODELS)
      expect(STORYBOARD_MODEL_ACTIONS[model]).toContain('reveal');
    expect(isLongformSourceSpec({ x: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isLongformSourceSpec({ x: 'a'.repeat(32_769) })).toBe(false);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(isLongformSourceSpec(cycle)).toBe(false);
  });
  it('does not permit a board in a historical plan or an alternate speaker layout', () => {
    const scene = {
      id: 'scene-storyboard-0-9',
      kind: 'storyboard',
      startWord: 0,
      endWord: 9,
      startTime: 0,
      endTime: 10,
      sectionId: 's',
      presentation: 'full-frame',
      label: 'A definition',
      purpose: '',
      sourceSpec: { kind: 'storyboard', startWord: 0, endWord: 9 },
    };
    expect(sceneFirstPlanProblem({ ...envelope(1), scenes: [scene] })).toContain('Parser-1');
    expect(
      sceneFirstPlanProblem({
        ...envelope(2),
        storyboardStyle: 'ink',
        scenes: [{ ...scene, presentation: 'speaker-side' }],
      }),
    ).toContain('full-frame');
  });
});
