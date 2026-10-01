import { describe, expect, it } from 'vitest';
import fixtures from '../../../../scripts/explainer-stills/fixtures/technology-request-routing.json';
import { makeParseContext, type Rec } from './kind-spec';
import { REQUEST_ROUTING_SPEC } from './kinds-request-routing';

const fields = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;

/** Edited assertions retain readable phase spacing, with actual word indices/timestamps. */
function example(index: number, edit: (parts: string[]) => void = () => {}) {
  const fixture = fixtures[index];
  const parts = fixture.sourceText.split(/(?<=\.)\s+/);
  edit(parts);
  const starts = [
    fixture.scene.setupAt,
    fixture.scene.actionAt,
    fixture.scene.responseAt,
    fixture.scene.checkAt,
    fixture.scene.resolveAt,
    fixture.durationSec,
  ];
  const raw: Rec = { ...fixture.raw };
  let count = 0;
  const words = parts.flatMap((part, phase) => {
    const tokens = part.split(/\s+/);
    raw[fields[phase]] = count;
    count += tokens.length;
    const step = (starts[phase + 1] - starts[phase] - 0.05) / tokens.length;
    return tokens.map((text, i) => ({
      text,
      start: starts[phase] + i * step,
      end: starts[phase] + (i + 0.9) * step,
    }));
  });
  const ctx = makeParseContext(words, {
    startWord: 0,
    endWord: words.length - 1,
    startTime: 0,
    endTime: fixture.durationSec,
  });
  return { raw, ctx, words };
}

function reject(index: number, edit: (parts: string[]) => void, patch: Rec = {}) {
  const { raw, ctx } = example(index, edit);
  expect(REQUEST_ROUTING_SPEC.parse({ ...raw, ...patch }, ctx)).toBeNull();
  expect(ctx.issues.length).toBeGreaterThan(0);
}

describe('request-routing source/branch contract', () => {
  it.each(fixtures)('actually parses fixture $name and its timed metadata', (fixture) => {
    const { fps, stepFrames, durationFrames } = fixture.wordTiming;
    const words = fixture.sourceText.split(/\s+/).map((text, index) => ({
      text,
      start: (index * stepFrames) / fps,
      end: (index * stepFrames + durationFrames) / fps,
    }));
    const ctx = makeParseContext(words, {
      startWord: fixture.raw.startWord,
      endWord: fixture.raw.endWord,
      startTime: 0,
      endTime: fixture.durationSec,
    });
    const scene = REQUEST_ROUTING_SPEC.parse(fixture.raw, ctx);
    expect(scene, ctx.issues.join('; ')).toEqual(fixture.scene);
    expect(words.length - 1).toBe(fixture.raw.endWord);
    expect(fixture.name).toBe(`request-routing-${fixture.scene.preset}`);
    expect(fixture.durationSec).toBeGreaterThanOrEqual(5);
    expect(fixture.durationSec).toBeLessThanOrEqual(12);
    expect(fixture.durationSec - fixture.scene.resolveAt).toBeGreaterThanOrEqual(0.8);
    expect(fixture.cases).toEqual([
      { name: 'vertical-stack', layout: 'stack', aspect: '9:16' },
      { name: 'landscape-over', layout: 'over', aspect: '16:9' },
    ]);
    expect(fixture.covers).toContainEqual({ category: 'kind', id: 'request-routing' });
    expect(fixture.covers).toContainEqual({
      category: 'technology',
      id: `request-routing/${fixture.scene.preset}`,
    });
    for (const sample of fixture.samples)
      expect(sample.frame).toBeLessThan(fixture.durationSec * fps);
    if (!scene) throw new Error('fixture did not parse');
    const cues = REQUEST_ROUTING_SPEC.cues(scene);
    expect(cues).toHaveLength(2);
    expect(
      cues.every(
        (cue) => cue.at >= scene.actionAt && cue.at <= scene.resolveAt && (cue.gain ?? 1) <= 0.3,
      ),
    ).toBe(true);
  });

  it.each([
    [0, 1, 'fresh matching', 'stale matching'],
    [0, 1, 'fresh matching', 'fresh unrelated'],
    [0, 1, 'for profile request', 'for another request'],
    [0, 1, 'finds', 'does not find'],
    [0, 1, '.', ', but the cache is expired.'],
    [0, 2, 'Cache returns', 'Backend returns'],
    [0, 3, 'bypasses', 'does not bypass'],
    [0, 3, '.', ', but backend returns a response.'],
    [1, 1, 'no response', 'a response'],
    [1, 2, 'returns', 'never returns'],
    [1, 2, 'for profile request', 'for another request'],
    [1, 3, 'Only after', 'Before'],
    [1, 3, 'stores', 'does not store'],
    [2, 0, 'primary service', 'another service'],
    [2, 2, 'available backup service', 'backup service'],
    [2, 2, 'available backup service', 'unavailable backup service'],
    [2, 2, 'times out', 'does not time out'],
    [2, 2, 'goes to the available', 'hopes to use the available'],
    [2, 3, 'returns a response', 'fails to return a response'],
    [2, 3, 'returns', 'might return'],
    [2, 3, 'Backup service', 'Unrelated service'],
    [2, 3, 'for profile request', 'for another request'],
    [2, 4, 'receives', 'never receives'],
  ] as const)('rejects unsupported branch %j / phase %j / %s → %s', (index, phase, from, to) => {
    reject(index, (parts) => {
      parts[phase] = parts[phase].replace(from, to);
    });
  });

  it.each([
    'Profile request goes to the available backup service; primary service times out on profile request.',
    'Profile request goes to the available backup service, then primary service times out on profile request.',
    'Backup service is available and profile request goes to backup service and then primary service times out on profile request.',
  ])('rejects fallback routing before its timeout: %s', (response) => {
    reject(2, (parts) => {
      parts[2] = response;
    });
  });

  it('accepts an explicitly available fallback only after the timeout', () => {
    const { raw, ctx } = example(2, (parts) => {
      parts[2] =
        'Backup service is available and primary service times out on profile request and then profile request goes to backup service.';
    });
    expect(REQUEST_ROUTING_SPEC.parse(raw, ctx), ctx.issues.join('; ')).not.toBeNull();
  });

  it('rejects noun coincidence rather than inferring action', () => {
    reject(0, (parts) => {
      parts[0] = 'Profile request discusses the cache.';
    });
    reject(2, (parts) => {
      parts[3] = 'Backup service documents how a response returns for profile request.';
    });
  });

  it('keeps negation local: a prior failed call does not negate a subsequent supported request', () => {
    const { raw, ctx } = example(0, (parts) => {
      parts[0] = `Prior call failed; ${parts[0]}`;
    });
    raw.setupWord = 3;
    expect(REQUEST_ROUTING_SPEC.parse(raw, ctx), ctx.issues.join('; ')).not.toBeNull();
    // The primary timeout is itself a failure, but the alternate really responds.
    const fallback = example(2);
    expect(REQUEST_ROUTING_SPEC.parse(fallback.raw, fallback.ctx)).not.toBeNull();
  });

  it('preserves the exact complete condition, never promotes a conditional to observed success', () => {
    const condition = 'If the cache is fresh';
    const build = () =>
      example(0, (parts) => {
        parts[0] = `${condition}, ${parts[0]}`;
      });
    for (const patch of [
      {},
      { condition: 'If the cache' },
      { condition: 'if the cache is fresh' },
    ]) {
      const { raw, ctx } = build();
      expect(REQUEST_ROUTING_SPEC.parse({ ...raw, ...patch }, ctx)).toBeNull();
    }
    const { raw, ctx } = build();
    expect(REQUEST_ROUTING_SPEC.parse({ ...raw, condition }, ctx)).toMatchObject({ condition });
  });

  it.each([
    { label: 'Invented routing' },
    { subject: 'other request' },
    { outcome: '99% faster' },
    { serviceLabel: 'unrelated service' },
    { label: 'x'.repeat(33) },
    { serviceLabel: 'x'.repeat(23) },
    { preset: 'automatic' },
    { preset: 'cache-miss' },
    { fallbackLabel: 'backend' },
    { setupWord: -1 },
    { actionWord: 0 },
    { actionWord: 1 },
    { responseWord: 6 },
    { responseWord: Number.NaN },
    { checkWord: 2.5 },
    { resolveWord: 999 },
    { condition: 'If it works' },
  ])('rejects invalid raw %j', (patch) => {
    reject(0, () => {}, patch);
  });

  it('requires a distinct source-backed fallback label', () => {
    for (const fallbackLabel of [undefined, 'invented backup', 'Primary service'])
      reject(2, () => {}, { fallbackLabel });
  });

  it('rejects nonfinite, reversed, compressed and out-of-window timing and missing final hold', () => {
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.4, 99]) {
      const { raw, ctx, words } = example(0);
      const changed = words.map((word, i) =>
        i === raw.responseWord ? { ...word, start: invalid } : word,
      );
      expect(REQUEST_ROUTING_SPEC.parse(raw, makeParseContext(changed, ctx.win))).toBeNull();
    }
    for (const endTime of [4, 13, 6.9, Number.NaN]) {
      const { raw, ctx, words } = example(0);
      expect(
        REQUEST_ROUTING_SPEC.parse(raw, makeParseContext(words, { ...ctx.win, endTime })),
      ).toBeNull();
    }
  });

  it('preserves nonzero absolute timestamps', () => {
    const { raw, ctx, words } = example(1);
    const shifted = words.map((word) => ({ ...word, start: word.start + 20, end: word.end + 20 }));
    const result = REQUEST_ROUTING_SPEC.parse(
      raw,
      makeParseContext(shifted, { ...ctx.win, startTime: 20, endTime: 32 }),
    );
    expect(result).toMatchObject({
      actionAt: fixtures[1].scene.actionAt + 20,
      resolveAt: fixtures[1].scene.resolveAt + 20,
    });
  });
});
