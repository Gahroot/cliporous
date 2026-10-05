import { describe, expect, it } from 'vitest';
import { isBusinessExplanationSourceEnvelope } from '../../../shared/business-explanation-source';
import { storyboardSourceInputBudget } from '../../../shared/storyboards';
import {
  type BusinessSourceFixture,
  businessSourceFixture,
  businessSourceFixtures,
} from '../../remotion/compositions/explainer/business/source-fixtures';
import { parseLongformSceneSpec } from '../explainer-scenes';
import { parseBusinessExplanationSource } from './business-adapters';

const sources = businessSourceFixtures();
const context = { clipStart: 0, clipEnd: 90, sourceId: 'adapter-test' };
function envelope(f: BusinessSourceFixture) {
  return {
    sourceVersion: 1,
    recipe: f.id,
    sourceChoices: structuredClone(f.raw),
    identityLinks: [],
  };
}
function fixture(id: `OP-${string}`, mode: 'diagram' | 'hybrid' = 'diagram') {
  const f = businessSourceFixture(id, mode);
  if (!f) throw Error('missing fixture');
  return f;
}
describe('business source reconstruction using real main parser', () => {
  it('executes the actual 80-recipe/152-mode index and reports unchanged envelope admission', () => {
    const counts = { recipes: new Set<string>(), modes: 0, admitted: 0, budget: 0 };
    for (const f of sources) {
      counts.recipes.add(f.id);
      counts.modes++;
      const input = envelope(f),
        result = parseBusinessExplanationSource(input, f.words, context);
      if (isBusinessExplanationSourceEnvelope(input)) {
        expect(result, `${f.fixtureId}: ${JSON.stringify(result)}`).toMatchObject({ ok: true });
        counts.admitted++;
      } else {
        expect(storyboardSourceInputBudget(input)).toBe(false);
        expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'budget' }] });
        counts.budget++;
      }
    }
    expect(counts.recipes.size).toBe(80);
    expect(counts.modes).toBe(152);
    console.info(
      `Business adapter actual source matrix: ${counts.admitted} admitted, ${counts.budget} budget-rejected of ${counts.modes} modes / ${counts.recipes.size} recipes`,
    );
  });
  it.each(
    sources,
  )('$fixtureId executes reconstruction without mutating input/transcript/context', (f) => {
    const input = envelope(f),
      before = structuredClone(input),
      words = structuredClone(f.words),
      ctx = structuredClone(context);
    const result = parseBusinessExplanationSource(input, f.words, context);
    expect(input).toEqual(before);
    expect(f.words).toEqual(words);
    expect(context).toEqual(ctx);
    if (result.ok) {
      const actual = parseLongformSceneSpec(f.raw, f.words, context);
      expect(result.value.planned).toEqual(actual);
      expect(result.value.source.sourceChoices).toEqual(f.raw);
      expect(result.value.recipe.id).toBe(f.id);
      expect(result.value.source.sourceChoices.startWord).toBe(f.raw.startWord);
      expect(result.value.source.sourceChoices.endWord).toBe(f.raw.endWord);
    } else expect(result.diagnostics[0].code).toBe('budget');
  });
  it.each([
    'geometry',
    'styles',
    'code',
    'url',
    'entryPoint',
    'scene',
    'setupAt',
    'resolveAt',
    'cues',
    'chained',
  ])('rejects arbitrary render entry/cooked field %s', (key) => {
    const f = fixture('OP-73'),
      input = envelope(f);
    input.sourceChoices[key] = key === 'url' ? 'https://example.com' : 1;
    expect(parseBusinessExplanationSource(input, f.words, context)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'unsupported' }],
    });
  });
  it.each([
    3,
    0,
    -1,
    1.1,
    '1',
    null,
  ])('rejects unsupported sourceVersion %s without conversion', (version) => {
    const f = fixture('OP-73'),
      input = { ...envelope(f), sourceVersion: version },
      before = structuredClone(input);
    expect(parseBusinessExplanationSource(input, f.words, context)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'version' }],
    });
    expect(input).toEqual(before);
  });
  it('rejects recipe/preset/kind/mode mismatches despite a shape-approved envelope', () => {
    const f = fixture('OP-73');
    for (const patch of [
      { kind: 'measurement-frame' },
      { preset: 'planned-observed' },
      { visualMode: 'webgl' },
      { visualMode: 'longform' },
    ]) {
      const input = envelope(f);
      Object.assign(input.sourceChoices, patch);
      expect(parseBusinessExplanationSource(input, f.words, context).ok).toBe(false);
    }
    const input = envelope(fixture('OP-71'));
    input.sourceChoices.visualMode = 'hybrid';
    expect(parseBusinessExplanationSource(input, fixture('OP-71').words, context)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'unsupported' }],
    });
    expect(
      parseBusinessExplanationSource({ ...envelope(f), recipe: 'OP-76' }, f.words, context).ok,
    ).toBe(false);
  });
  it('rejects clipped protected intervals and invalid/reordered beats', () => {
    const f = fixture('OP-73'),
      input = envelope(f);
    const lastWord = f.words.at(-1);
    if (!lastWord) throw new Error('Missing source fixture words');
    for (const ctx of [
      { ...context, clipStart: f.words[0].start },
      { ...context, clipEnd: lastWord.end },
      { ...context, section: { id: 'cut', startWord: 1, endWord: f.words.length - 1 } },
      { ...context, section: { id: 'cut', startWord: 0, endWord: f.words.length - 2 } },
    ])
      expect(parseBusinessExplanationSource(input, f.words, ctx).ok).toBe(false);
    for (const patch of [
      { setupWord: 99999 },
      { resolveWord: f.raw.checkWord },
      { checkWord: 2.1 },
      { responseWord: -1 },
    ]) {
      const altered = envelope(f);
      Object.assign(altered.sourceChoices, patch);
      expect(parseBusinessExplanationSource(altered, f.words, context).ok).toBe(false);
    }
  });
  it('rejects malformed/oversized/getter/cyclic payloads without evaluating getters', () => {
    const f = fixture('OP-73');
    let invoked = false;
    const getter = envelope(f);
    Object.defineProperty(getter, 'bad', {
      get() {
        invoked = true;
        throw Error('getter');
      },
      enumerable: true,
    });
    expect(parseBusinessExplanationSource(getter, f.words, context)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'budget' }],
    });
    expect(invoked).toBe(false);
    const cycle: Record<string, unknown> = envelope(f);
    cycle.extra = cycle;
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let i = 0; i < 12; i++) {
      const child = {};
      cursor.child = child;
      cursor = child;
    }
    for (const input of [
      null,
      [],
      cycle,
      { ...envelope(f), extra: deep },
      { ...envelope(f), extra: Array(2000).fill(0) },
      { ...envelope(f), extra: 'x'.repeat(25000) },
      { ...envelope(f), extra: NaN },
      { ...envelope(f), extra: new Date() },
    ])
      expect(parseBusinessExplanationSource(input, f.words, context).ok).toBe(false);
  });
});
