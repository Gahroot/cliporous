import { describe, expect, it } from 'vitest';
import fixtures from '../../../../scripts/explainer-stills/fixtures/technology-software-release.json';
import { makeParseContext, type PlannerWord, type Rec } from './kind-spec';
import { SOFTWARE_RELEASE_SPEC } from './kinds-software-release';

const fields = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;

function example(
  preset: string,
  replacements: Partial<Record<number, string>> = {},
  overrides: Rec = {},
) {
  const fixture = fixtures.find((item) => item.scene.preset === preset);
  if (!fixture) throw new Error(`Missing fixture ${preset}`);
  const clauses = fixture.sourceText
    .split(/(?<=\.)\s+/)
    .map((clause, i) => replacements[i] ?? clause);
  const words: PlannerWord[] = [];
  const raw: Rec = { ...fixture.raw, label: 'patch', ...overrides };
  clauses.forEach((clause, phase) => {
    raw[fields[phase]] = words.length;
    const tokens = clause.split(/\s+/);
    tokens.forEach((text, index) => {
      const start = 0.4 + phase * 1.6 + (index * 1.3) / tokens.length;
      words.push({ text, start, end: start + 1 / tokens.length });
    });
  });
  raw.endWord = words.length - 1;
  const ctx = makeParseContext(words, {
    startWord: 0,
    endWord: words.length - 1,
    startTime: 0,
    endTime: 9.6,
  });
  return { raw, ctx, words };
}

function reject(
  preset: string,
  replacements: Partial<Record<number, string>>,
  overrides: Rec = {},
) {
  const { raw, ctx } = example(preset, replacements, overrides);
  expect(SOFTWARE_RELEASE_SPEC.parse(raw, ctx)).toBeNull();
  expect(ctx.issues.length).toBeGreaterThan(0);
}

describe('software release source contract', () => {
  it.each(fixtures)('parses actual indexed fixture $name in both declared layouts', (fixture) => {
    expect(fixture.words.map((word) => word.text).join(' ')).toBe(fixture.sourceText);
    expect(fixture.name).toBe(`software-release-${fixture.scene.preset}`);
    expect(fixture.covers).toContainEqual({ category: 'kind', id: 'software-release' });
    expect(fixture.covers).toContainEqual({
      category: 'technology',
      id: `software-release/${fixture.scene.preset}`,
    });
    expect(fixture.cases).toEqual([
      { name: 'vertical-stack', layout: 'stack', aspect: '9:16' },
      { name: 'landscape-over', layout: 'over', aspect: '16:9' },
    ]);
    for (const variant of fixture.cases) {
      const ctx = makeParseContext(fixture.words, {
        startWord: fixture.raw.startWord,
        endWord: fixture.raw.endWord,
        startTime: 0,
        endTime: fixture.durationSec,
      });
      const scene = SOFTWARE_RELEASE_SPEC.parse({ ...fixture.raw, layout: variant.layout }, ctx);
      expect(ctx.issues).toEqual([]);
      expect(scene).toEqual(fixture.scene);
      if (!scene) throw new Error('Fixture was rejected');
      const cues = SOFTWARE_RELEASE_SPEC.cues(scene);
      expect(cues).toHaveLength(3);
      expect(cues.every((cue) => cue.at >= scene.actionAt && cue.at <= scene.resolveAt)).toBe(true);
      expect(fixture.durationSec - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
      expect(
        fixture.samples.every(
          (sample) => sample.frame >= 0 && sample.frame < fixture.durationSec * 30,
        ),
      ).toBe(true);
    }
  });

  it.each([
    'The tests fail for the patch after running.',
    'The tests do not pass for the patch after running.',
    'The tests never pass for the patch after running.',
    'The tests might pass for the patch after running.',
    'The tests pass for another change after running.',
    'The tests run for the patch after running.',
    'The tests pass for the patch is merely proposed.',
  ])('rejects an unsupported passing result: %s', (text) => reject('fix-pass', { 2: text }));

  it.each([
    'The tests were not run on the patch before release.',
    'The tests are skipped on the patch before release.',
    'The tests run on a different patch before release.',
    'The tests might run on the patch before release.',
  ])('rejects absent or unrelated execution: %s', (text) => reject('fix-pass', { 1: text }));

  it.each([
    { 0: 'The patch mentions the bug in this example.' },
    { 0: 'The patch never fixes the bug in this example.' },
    { 3: 'The passing tests do not clear the patch for release.' },
    { 4: 'Only then the patch is not released after the passing check.' },
    { 4: 'The patch is released before the passing check.' },
  ])('requires the whole fix → pass → release relationship', (replacement) =>
    reject('fix-pass', replacement));

  it.each([
    { 2: 'A regression in the patch does not fail the tests.' },
    { 2: 'The regression and tests are mentioned for the patch.' },
    { 3: 'The failed tests do not block release of the patch.' },
    { 4: 'Rollback never restores the prior version v1.' },
    { 4: 'Rollback might restore the prior version v1.' },
    { 4: 'Rollback restores the prior version v2 instead of v1.' },
    { 4: 'Rollback restores the prior version v1 and the patch is released.' },
    { 4: 'Rollback restores the prior version v1.2 instead of v1.' },
    { 0: 'The patch replaces the current version v1 in this example.' },
  ])('rejects unsupported regression, blocking, prior or restoration', (replacement) =>
    reject('regression-rollback', replacement));

  it.each([
    undefined,
    '',
    'v2',
    'patch',
  ])('requires the exact distinct previousVersion %s', (previousVersion) =>
    reject('regression-rollback', {}, { previousVersion }));

  it.each([
    { 1: 'Unit tests and security checks run on the patch in sequence.' },
    { 1: 'Only Unit tests run on the patch in parallel.' },
    { 2: 'Unit tests fail for the patch after running.' },
    { 3: 'Security checks do not pass for the patch after running.' },
    { 3: 'Security checks fail for the patch after running.' },
    { 3: 'Security checks are not run on the patch.' },
    { 3: 'Unit tests pass for the patch after running.' },
    { 3: 'Security checks pass for another change after running.' },
    { 4: 'Only after one check passes and joins, the patch is released.' },
    { 4: 'Only after both checks pass, the patch is released.' },
    { 4: 'Before both checks pass and join, the patch is released.' },
  ])('rejects partial or unjoined parallel work', (replacement) =>
    reject('parallel-release', replacement));

  it('keeps an earlier failure local, not a global veto on the later pass', () => {
    const { raw, ctx, words } = example('fix-pass', {
      2: 'Earlier tests failed; the tests pass for the patch after running.',
    });
    raw.responseWord = words.findIndex(
      (word, i) => word.text === 'the' && words[i - 1]?.text === 'failed;',
    );
    expect(SOFTWARE_RELEASE_SPEC.parse(raw, ctx)).not.toBeNull();
  });

  it('retains the exact conditional source visibly rather than claiming an observed event', () => {
    const replacements = { 0: 'If the bug is reproducible, the patch fixes the bug.' };
    const { raw, ctx } = example('fix-pass', replacements, {
      condition: 'If the bug is reproducible',
    });
    expect(SOFTWARE_RELEASE_SPEC.parse(raw, ctx)?.condition).toBe('If the bug is reproducible');
    reject('fix-pass', replacements);
    reject('fix-pass', replacements, { condition: 'If the bug' });
    reject('fix-pass', {}, { condition: 'If the bug is reproducible' });
  });

  it.each([
    { preset: 'unknown' },
    { checkLabels: [] },
    { checkLabels: ['tests', 'tests'] },
    { checkLabels: ['invented checks'] },
    { subject: 'invented patch' },
    { label: 'x'.repeat(33) },
    { outcome: 'everything works' },
    { previousVersion: 'v1' },
  ])('rejects invalid family fields %j', (overrides) => reject('fix-pass', {}, overrides));

  it('accepts a fully stated dotted prior version without shortening its identity', () => {
    const replacements = {
      0: 'The patch replaces the prior version v1.2 in this example.',
      4: 'Rollback restores the prior version v1.2 instead of releasing the patch.',
    };
    const { raw, ctx } = example('regression-rollback', replacements, {
      previousVersion: 'v1.2',
      outcome: 'restores the prior version v1.2',
    });
    expect(SOFTWARE_RELEASE_SPEC.parse(raw, ctx)?.previousVersion).toBe('v1.2');
    reject('regression-rollback', replacements, {
      previousVersion: 'v1',
      outcome: 'restores the prior version v1',
    });
  });

  it('rejects duplicate parallel labels', () =>
    reject('parallel-release', {}, { checkLabels: ['Unit tests', 'Unit tests'] }));

  it.each([NaN, Infinity, -1, 0.5, 999, '8', null])('rejects invalid beat index %s', (value) => {
    const { raw, ctx } = example('fix-pass');
    raw.actionWord = value;
    expect(SOFTWARE_RELEASE_SPEC.parse(raw, ctx)).toBeNull();
  });

  it('rejects reversed indices and compressed beats', () => {
    const a = example('fix-pass');
    a.raw.checkWord = a.raw.responseWord;
    expect(SOFTWARE_RELEASE_SPEC.parse(a.raw, a.ctx)).toBeNull();
    const b = example('fix-pass');
    b.words.forEach((word) => {
      word.start *= 0.25;
      word.end *= 0.25;
    });
    expect(SOFTWARE_RELEASE_SPEC.parse(b.raw, b.ctx)).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity])('rejects nonfinite source times %s', (time) => {
    const { raw, ctx, words } = example('fix-pass');
    words[2].end = time;
    expect(SOFTWARE_RELEASE_SPEC.parse(raw, ctx)).toBeNull();
  });

  it.each([
    4.9,
    12.1,
    Infinity,
    7.5,
  ])('rejects invalid duration or insufficient final hold %s', (endTime) => {
    const { raw, words } = example('fix-pass');
    const ctx = makeParseContext(words, {
      startWord: 0,
      endWord: words.length - 1,
      startTime: 0,
      endTime,
    });
    expect(SOFTWARE_RELEASE_SPEC.parse(raw, ctx)).toBeNull();
  });

  it('preserves nonzero absolute beat times', () => {
    const fixture = fixtures[0];
    const words = fixture.words.map((word) => ({
      ...word,
      start: word.start + 20,
      end: word.end + 20,
    }));
    const ctx = makeParseContext(words, {
      startWord: 0,
      endWord: words.length - 1,
      startTime: 20,
      endTime: 30,
    });
    const scene = SOFTWARE_RELEASE_SPEC.parse(fixture.raw, ctx);
    expect(scene?.setupAt).toBe(20.4);
    expect(scene?.resolveAt).toBe(26.8);
  });
});
