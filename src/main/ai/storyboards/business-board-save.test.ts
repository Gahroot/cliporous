import { describe, expect, it } from 'vitest';
import {
  compactBusinessSourceChoices,
  expandBusinessSourceChoices,
} from '../../../shared/business-source-choices';
import { longformSceneId, longformSourceFingerprint } from '../../../shared/longform-scenes';
import { BUILTIN_PALETTES } from '../../../shared/palettes';
import { businessSourceFixture } from '../../remotion/compositions/explainer/business/source-fixtures';
import { buildLongformSceneTimeline } from '../../render/longform-scene-timeline';
import {
  buildLongformStoryboardProps,
  mapStoryboardTimes,
} from '../../render/longform-storyboard-props';
import { validateSceneFirstLongformPlan } from '../longform-scene-contract';
import { compileStoryboardSpec } from './compiler';
import { boardFixture, savedBoardFixture } from './fixtures';

function fixture(offset = 17) {
  const source = businessSourceFixture('OP-01', 'diagram');
  if (!source) throw new Error('Missing OP-01 source');
  const compact = compactBusinessSourceChoices(source.raw);
  if (!compact.ok) throw new Error(compact.message);
  const last = source.words.at(-1);
  if (!last) throw new Error('Missing source words');
  // Extend only the board reading hold, never the native explanation window.
  const words = [
    ...source.words,
    { text: 'Context', start: last.end + 12, end: last.end + 12.3 },
  ].map((word) => ({ ...word, start: word.start + offset, end: word.end + offset }));
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
        explanation: {
          sourceVersion: 2,
          recipe: source.id,
          sourceChoices: compact.choices,
          identityLinks: [],
        },
      },
    ],
  };
  const duration = 120;
  const compiled = compileStoryboardSpec(spec, words, { clipStart: 0, clipEnd: duration });
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  const plan = savedBoardFixture({ words, duration, spec: compiled.value.sourceSpec });
  plan.parserVersion = 3;
  return { source, words, spec, duration, compiled: compiled.value, plan };
}

function validated(input: ReturnType<typeof fixture>, plan = input.plan) {
  const result = validateSceneFirstLongformPlan(plan, input.words, input.duration);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

// Independent assertions on each native numeric leaf: clocks move; facts and indices do not.
function assertNativeShift(before: unknown, after: unknown, shift: number, key = ''): void {
  if (typeof before === 'number') {
    if (key === 'at' || key.endsWith('At')) expect(after).toBeCloseTo(before + shift, 10);
    else expect(after).toBe(before);
  } else if (Array.isArray(before)) {
    expect(Array.isArray(after)).toBe(true);
    const next = after as unknown[];
    expect(next).toHaveLength(before.length);
    before.forEach((value, index) => {
      assertNativeShift(value, next[index], shift);
    });
  } else if (before && typeof before === 'object') {
    const next = after as Record<string, unknown>;
    expect(Object.keys(next)).toEqual(Object.keys(before));
    for (const [name, value] of Object.entries(before))
      assertNativeShift(value, next[name], shift, name);
  } else expect(after).toEqual(before);
}

describe('real business storyboard persistence and source-clock mapping', () => {
  it('roundtrips parser3/spec2 approved timing, facts, Ink/Polish and palette through real validation', () => {
    const input = fixture();
    const original = JSON.stringify(input);
    expect(input.plan.sourceFingerprint).toBe(longformSourceFingerprint(input.words, 120));
    expect(input.plan.scenes[0].id).toBe(longformSceneId('storyboard', 0, input.words.length - 1));
    const panel = input.compiled.board.businessPanels?.[0];
    expect(panel?.scene.kind).toBe('task-map');
    expect(
      input.compiled.board.elements.some(
        (element) => element.kind === 'text' && element.text.includes('Outcome:'),
      ),
    ).toBe(true);
    const restoredChoices = expandBusinessSourceChoices(
      input.spec.panels[0].explanation.sourceChoices,
    );
    expect(restoredChoices.ok && restoredChoices.choices).toEqual(input.source.raw);
    for (const style of ['ink', 'polish'] as const) {
      const saved = { ...input.plan, storyboardStyle: style };
      const serialized = JSON.stringify({ plan: saved, palette: BUILTIN_PALETTES[0] });
      const restored = JSON.parse(serialized);
      const result = validated(input, restored.plan);
      const scene = result.scenes[0];
      if (scene.kind !== 'storyboard') throw new Error('Expected storyboard');
      expect(scene.board).toEqual(input.compiled.board);
      expect(scene.placement.startTime).toBe(input.compiled.startTime);
      expect(scene.placement.endTime).toBe(input.compiled.endTime);
      expect(scene.placement.sourceSpec).toEqual(input.spec);
      const segment = buildLongformSceneTimeline(result.plan, result.scenes).segments.find(
        (entry) => entry.kind === 'scene',
      );
      if (!segment || segment.kind !== 'scene') throw new Error('Missing board segment');
      const props = buildLongformStoryboardProps(
        segment,
        restored.plan.storyboardStyle,
        restored.palette,
      );
      expect(props.style).toBe(style);
      expect(props.palette).toEqual(BUILTIN_PALETTES[0]);
      expect(JSON.stringify(restored)).toBe(serialized);
    }
    expect(JSON.stringify(input)).toBe(original);
  });

  it('shifts native beats exactly once for preview/export without changing facts, links or word indices', () => {
    const input = fixture();
    const native = fixture(0).compiled.board.businessPanels?.[0];
    const absolute = input.compiled.board.businessPanels?.[0];
    if (!native || !absolute) throw new Error('Missing business panel');
    assertNativeShift(native.scene, absolute.scene, 17);
    const before = JSON.stringify(input);
    const mapped = mapStoryboardTimes(input.compiled.board, (time) => time - 7);
    const local = mapped.businessPanels?.[0];
    if (!local) throw new Error('Missing mapped panel');
    assertNativeShift(absolute.scene, local.scene, -7);
    expect(local.startAt).toBe(absolute.startAt - 7);
    expect(local.endAt).toBe(absolute.endAt - 7);
    expect(local.identityLinks).toEqual(absolute.identityLinks);
    const result = validated(input);
    const segment = buildLongformSceneTimeline(result.plan, result.scenes).segments.find(
      (entry) => entry.kind === 'scene',
    );
    if (!segment || segment.kind !== 'scene') throw new Error('Missing segment');
    const props = buildLongformStoryboardProps(segment, 'ink', BUILTIN_PALETTES[0]);
    const exported = props.spec.businessPanels?.[0];
    if (!exported) throw new Error('Missing export panel');
    assertNativeShift(absolute.scene, exported.scene, -segment.startTime);
    expect(exported.identityLinks).toEqual(absolute.identityLinks);
    expect(result.plan.scenes[0].sourceSpec).toEqual(input.spec);
    expect(absolute.endAt).toBeLessThan(input.compiled.endTime);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('refuses parser2/spec2 and cropped native windows without mutating saved source evidence', () => {
    const input = fixture();
    const oldParser = JSON.parse(JSON.stringify(input.plan));
    oldParser.parserVersion = 2;
    const stored = JSON.stringify(oldParser);
    expect(validateSceneFirstLongformPlan(oldParser, input.words, 120).ok).toBe(false);
    expect(JSON.stringify(oldParser)).toBe(stored);
    const cropped = structuredClone(input.spec);
    cropped.panels[0].startWord = 1;
    cropped.panels[0].revealWord = 1;
    cropped.panels[0].moveWord = 1;
    cropped.panels[0].title = { text: input.words[1].text, startWord: 1, endWord: 1 };
    const cropBefore = JSON.stringify(cropped);
    expect(compileStoryboardSpec(cropped, input.words, { clipStart: 0, clipEnd: 120 }).ok).toBe(
      false,
    );
    expect(JSON.stringify(cropped)).toBe(cropBefore);
    const savedCrop = structuredClone(input.plan);
    savedCrop.scenes[0].sourceSpec = cropped as (typeof savedCrop.scenes)[0]['sourceSpec'];
    const savedBefore = JSON.stringify(savedCrop);
    expect(validateSceneFirstLongformPlan(savedCrop, input.words, 120).ok).toBe(false);
    expect(JSON.stringify(savedCrop)).toBe(savedBefore);
    const historicalInput = boardFixture();
    const historical = savedBoardFixture(historicalInput);
    const historicalBefore = JSON.stringify(historical);
    expect(historical.parserVersion).toBe(2);
    expect(
      validateSceneFirstLongformPlan(historical, historicalInput.words, historicalInput.duration)
        .ok,
    ).toBe(true);
    expect(JSON.stringify(historical)).toBe(historicalBefore);
  });
});
