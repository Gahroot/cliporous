import { describe, expect, it } from 'vitest';
import {
  ORGANIZATION_RESOURCE_FIXTURES,
  ORGANIZATION_SOURCE_FIXTURES,
  ORGANIZATION_SOURCE_NEGATIVES,
} from '../../remotion/compositions/explainer/business/organization/fixtures';
import { isRec, makeParseContext } from './kind-spec';
import { ORGANIZATION_MAP_SPEC, SYSTEM_RECONCILIATION_SPEC } from './kinds-business-organization';

describe('local concrete organization specs', () => {
  it.each(
    ORGANIZATION_RESOURCE_FIXTURES,
  )('$fixture.id $name traverses the real KindSpec without rewriting its source payload', ({
    fixture,
  }) => {
    const before = structuredClone(fixture.raw);
    const ctx = makeParseContext(fixture.words, fixture.window);
    const spec =
      fixture.raw.kind === 'organization-map' ? ORGANIZATION_MAP_SPEC : SYSTEM_RECONCILIATION_SPEC;
    const scene = spec.parse(fixture.raw, ctx);
    if (!scene) throw new Error(ctx.issues.join('; '));
    expect(ctx.issues).toEqual([]);
    expect(fixture.raw).toEqual(before);
    expect(scene.preset).toBe(fixture.raw.preset);
    const cues =
      scene.kind === 'organization-map'
        ? ORGANIZATION_MAP_SPEC.cues(scene)
        : SYSTEM_RECONCILIATION_SPEC.cues(scene);
    expect(cues.map((cue) => cue.at)).toEqual([
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
    ]);
  });
  it.each(
    ORGANIZATION_SOURCE_FIXTURES,
  )('$id schema is the actual accepted source payload and exposes concrete parser/cues', (fixture) => {
    const spec =
      fixture.raw.kind === 'organization-map' ? ORGANIZATION_MAP_SPEC : SYSTEM_RECONCILIATION_SPEC;
    const entry = spec.schema.split('\n').find((line) => line.startsWith(`${fixture.id}: `));
    if (!entry) throw new Error('Missing real schema example');
    const example: unknown = JSON.parse(entry.slice(entry.indexOf(': ') + 2));
    if (!isRec(example)) throw new Error('Schema must be a concrete JSON object');
    expect(example).toEqual(
      Object.fromEntries(
        Object.entries(fixture.raw).filter(
          ([key]) => !['startWord', 'endWord', 'layout'].includes(key),
        ),
      ),
    );
    const ctx = makeParseContext(fixture.words, fixture.window);
    const scene = spec.parse(
      {
        ...example,
        startWord: fixture.raw.startWord,
        endWord: fixture.raw.endWord,
        layout: fixture.raw.layout,
      },
      ctx,
    );
    expect(ctx.issues).toEqual([]);
    if (!scene) throw new Error('Schema example must parse');
    const cues =
      scene.kind === 'organization-map'
        ? ORGANIZATION_MAP_SPEC.cues(scene)
        : SYSTEM_RECONCILIATION_SPEC.cues(scene);
    expect(cues.map((cue) => cue.at)).toEqual([
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
    ]);
    expect(
      cues.every(
        (cue) =>
          ['flip', 'slide', 'tick'].includes(cue.kind) &&
          Number.isFinite(cue.gain) &&
          (cue.gain ?? 0) <= 0.25,
      ),
    ).toBe(true);
    expect(
      spec.triggers.some((trigger) =>
        trigger.test(fixture.words.map((word) => word.text).join(' ')),
      ),
    ).toBe(true);
    expect(spec.durationSec).toEqual([5, 12]);
    expect(['framework', 'process']).toContain(spec.family);
    expect(spec.limits).toContain('OP31 diagram only');
    expect(spec.avoid).toBeTruthy();
  });
  it.each(ORGANIZATION_SOURCE_NEGATIVES)('$recipeId local parser rejects $name', ({ fixture }) => {
    const ctx = makeParseContext(fixture.words, fixture.window);
    const spec =
      fixture.raw.kind === 'organization-map' ? ORGANIZATION_MAP_SPEC : SYSTEM_RECONCILIATION_SPEC;
    expect(spec.parse(fixture.raw, ctx)).toBeNull();
    expect(ctx.issues.length).toBeGreaterThan(0);
  });
  it.each([
    'We use a hammer every day.',
    'The worker adopted new software.',
    'They can decide what to do.',
    'We monitored cloud latency.',
    'The database merge completed successfully.',
  ])('specific triggers avoid false friend: %s', (text) => {
    expect(
      [...ORGANIZATION_MAP_SPEC.triggers, ...SYSTEM_RECONCILIATION_SPEC.triggers].some((trigger) =>
        trigger.test(text),
      ),
    ).toBe(false);
  });
});
