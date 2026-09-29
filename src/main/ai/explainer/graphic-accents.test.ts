import { describe, expect, it } from 'vitest';
import { ICON_PROPS } from '../../remotion/compositions/explainer/hero-props/icon-shapes';
import { ANNOTATION_KINDS } from '../../remotion/compositions/explainer/types';
import { parseExplainerPlan, toSceneRelative } from '../explainer-scenes';

const words = Array.from({ length: 24 }, (_, i) => ({
  text: `word${i}`,
  start: 10 + i * 0.5,
  end: 10.4 + i * 0.5,
}));
const base = {
  kind: 'hero',
  startWord: 0,
  endWord: 10,
  prop: 'shield',
  label: 'Protect privacy',
  word: 1,
};
function parse(extra: Record<string, unknown>): ReturnType<typeof parseExplainerPlan> {
  return parseExplainerPlan({ scenes: [{ ...base, ...extra }] }, words, {
    minStart: 10,
    maxEnd: 22,
  });
}

describe('planner graphic boundaries', () => {
  it.each(ICON_PROPS)('accepts the curated %s prop', (prop) => {
    expect(parse({ prop })[0]?.scene).toMatchObject({ kind: 'hero', prop });
  });
  it.each(ANNOTATION_KINDS)('keeps %s word-timed and rebases its time', (kind) => {
    const scene = parse({ annotation: { kind, word: 5 } })[0];
    expect(scene?.scene.annotation).toEqual({ kind, at: 12.5 });
    if (!scene) throw new Error('expected a parsed scene');
    expect(toSceneRelative(scene.scene, scene.startTime).annotation).toEqual({ kind, at: 2.5 });
  });
  it.each([
    { kind: 'script', word: 5 },
    { kind: 'circle', word: 90 },
    { kind: 'circle', word: 1 }, // label has not appeared yet
    { kind: 'box', word: -1 },
    { kind: 'box', word: 3.5 },
  ])('drops invalid/early annotation %j without losing the scene', (annotation) => {
    const plan = parse({ annotation });
    expect(plan).toHaveLength(1);
    expect(plan[0]?.scene.annotation).toBeUndefined();
  });
  it('lets a valid later stamp take priority over a second decoration', () => {
    expect(
      parse({ laterStamp: { text: 'YES', word: 7 }, annotation: { kind: 'circle', word: 5 } })[0]
        ?.scene,
    ).toMatchObject({ overlayStamp: { word: 'YES', at: 13.5 } });
    expect(
      parse({ laterStamp: { text: 'YES', word: 7 }, annotation: { kind: 'circle', word: 5 } })[0]
        ?.scene.annotation,
    ).toBeUndefined();
  });
  it('limits reactions in annotated scenes and rejects arbitrary assets', () => {
    expect(
      parse({
        annotation: { kind: 'circle', word: 5 },
        reactions: [5, 6, 7].map((word) => ({ word, strength: 'pulse' })),
      })[0]?.scene.pulses,
    ).toHaveLength(1);
    expect(parse({ prop: 'https://example.com/icon.svg' })).toHaveLength(0);
  });
  it('does not let automatically generated emphasis bypass the decoration budget', () => {
    const plan = parseExplainerPlan(
      { scenes: [{ ...base, annotation: { kind: 'circle', word: 5 } }] },
      words,
      { minStart: 10, maxEnd: 22 },
      { emphasisTimes: [11.2, 14.2] },
    );
    expect(plan[0]?.scene.pulses).toHaveLength(1);
  });
  it('removes adjacent annotations without dropping the underlying scene', () => {
    const plan = parseExplainerPlan(
      {
        scenes: [
          { ...base, endWord: 6, annotation: { kind: 'circle', word: 4 } },
          {
            kind: 'statement',
            startWord: 12,
            endWord: 18,
            words: [
              { text: 'Stay', word: 12 },
              { text: 'safe', word: 14 },
            ],
            accentIndex: 1,
            annotation: { kind: 'underline', word: 16 },
          },
        ],
      },
      words,
      { minStart: 10, maxEnd: 30 },
    );
    expect(plan).toHaveLength(2);
    expect(plan[0]?.scene.annotation).toBeDefined();
    expect(plan[1]?.scene.annotation).toBeUndefined();
  });
  it('does not attach annotations to an unsupported scene', () => {
    const plan = parse({
      kind: 'stamp',
      icon: 'Check',
      word: 'YES',
      stampWord: 3,
      annotation: { kind: 'circle', word: 5 },
    });
    expect(plan).toHaveLength(1);
    expect(plan[0]?.scene.annotation).toBeUndefined();
  });
});
