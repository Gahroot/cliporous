import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import { SCENE_CUE_KINDS } from '../../remotion/compositions/explainer/types';
import type { ExpansionSourceFixture } from './expansion-fixture-words';
import { parseExpansionRepresentations } from './expansion-representations-contract';
import {
  temporalSourceFixtures as materializeAuthoredSources,
  type TemporalFixtureSeed,
} from './expansion-temporal-fixtures';
import { makeParseContext } from './kind-spec';
import { EXPANSION_REPRESENTATIONS_SPECS } from './kinds-expansion-representations';

const sourceFiles = [
  { stories: ['49', '50'], file: 'representations/units-equivalence.source.json' },
  { stories: ['51', '52'], file: 'representations/information-loss.source.json' },
  { stories: ['53', '54'], file: 'representations/projection-matrix.source.json' },
  { stories: ['55', '56'], file: 'representations/vector-factorization.source.json' },
];
// Reuse the existing test-only authored patch materializer, never a production fact generator.
const fixtures: ExpansionSourceFixture[] = sourceFiles.flatMap(({ file, stories }) => {
  const packet = JSON.parse(
    readFileSync(`scripts/explainer-stills/fixtures/expansion/${file}`, 'utf8'),
  ) as {
    version: number;
    pack: string;
    stories: TemporalFixtureSeed[];
    paraphrases?: TemporalFixtureSeed[];
  };
  if (packet.version !== 1 || packet.pack !== 'representations')
    throw new Error('Malformed authored representations source packet');
  if ([...new Set(packet.stories.map(({ id }) => id))].join(',') !== stories.join(','))
    throw new Error('Authored representations packet disagrees with its source index');
  return materializeAuthoredSources([...packet.stories, ...(packet.paraphrases ?? [])]);
});
const derivations = new Map([
  ['49', ['unit-conversion']],
  ['50', ['ratio']],
  ['51', []],
  ['52', []],
  ['53', []],
  ['54', ['matrix-product']],
  ['55', []],
  ['56', ['factorization']],
]);

describe('local representations contracts and preset definitions, not runtime registration', () => {
  it('source index names exactly the executed raw packets', () => {
    expect(
      JSON.parse(
        readFileSync(
          'scripts/explainer-stills/fixtures/expansion/representations.source.json',
          'utf8',
        ),
      ),
    ).toEqual({ version: 1, pack: 'representations', sourceFiles });
  });
  it('covers every frozen route and only its exact derivation whitelist', () => {
    const ids = [...new Set(fixtures.map(({ id }) => id))].sort();
    expect(ids).toEqual(['49', '50', '51', '52', '53', '54', '55', '56']);
    expect(EXPANSION_REPRESENTATIONS_SPECS.map(({ storyId }) => storyId)).toEqual(ids);
    for (const id of ids) {
      expect(fixtures.filter((fixture) => fixture.id === id).length).toBeGreaterThanOrEqual(2);
      expect(
        fixtures
          .filter((fixture) => fixture.id === id)
          .reduce((sum, fixture) => sum + fixture.negatives.length, 0),
      ).toBeGreaterThan(0);
    }
    for (const spec of EXPANSION_REPRESENTATIONS_SPECS) {
      const entry = expansionStory(spec.storyId);
      expect([spec.kind, spec.preset]).toEqual([entry.kind, entry.preset]);
      expect(entry.allowedDerivations).toEqual(derivations.get(spec.storyId));
      expect(spec.describe).toBe(entry.purpose);
      expect(spec.schema).toContain('setupWord');
      expect(spec.schema).toContain('diagram|hybrid');
      expect(spec.schema).toContain('evidence');
      expect(spec.limits).toContain('No invented');
      expect(spec.layouts).toEqual(['stack', 'stack-flipped']);
      expect(spec.durationSec).toEqual([5, 12]);
      expect(spec.triggers.length).toBeGreaterThan(0);
      expect(spec.avoid).toBeTruthy();
    }
  });
  for (const [index, fixture] of fixtures.entries()) {
    it(`${fixture.id}/raw-case-${index}: direct and local routes preserve both-mode facts and source cues`, () => {
      const spec = EXPANSION_REPRESENTATIONS_SPECS.find(({ storyId }) => storyId === fixture.id);
      if (!spec) throw new Error('Missing authored representations preset');
      const ctx = makeParseContext(fixture.words, fixture.window);
      const scene = parseExpansionRepresentations(fixture.proposal, ctx);
      expect(ctx.issues).toEqual([]);
      if (!scene) throw new Error('Missing actual parsed representations scene');
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        const direct = makeParseContext(fixture.words, fixture.window);
        expect(spec.parse({ ...fixture.proposal, visualMode }, direct)).toEqual({
          ...scene,
          visualMode,
        });
        expect(direct.issues).toEqual([]);
        const local = makeParseContext(fixture.words, fixture.window);
        expect(parseExpansionRepresentations({ ...fixture.proposal, visualMode }, local)).toEqual({
          ...scene,
          visualMode,
        });
        expect(local.issues).toEqual([]);
      }
      expect(spec.cues(scene).map(({ at }) => at)).toEqual([
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
      ]);
      for (const cue of spec.cues(scene)) {
        expect(SCENE_CUE_KINDS).toContain(cue.kind);
        expect(cue.at).toBeGreaterThanOrEqual(fixture.window.startTime);
        expect(cue.at).toBeLessThanOrEqual(fixture.window.endTime - 0.8);
        expect(cue.gain).toBeGreaterThan(0);
        expect(cue.gain).toBeLessThanOrEqual(1);
      }
    });
    it(`${fixture.id}/raw-case-${index}: every supplied negative fails closed with review diagnostics`, () => {
      for (const negative of fixture.negatives) {
        const suppliedMode = negative.proposal.visualMode;
        const modes =
          suppliedMode === 'diagram' || suppliedMode === 'hybrid'
            ? ['diagram', 'hybrid']
            : [suppliedMode];
        for (const visualMode of modes) {
          const ctx = makeParseContext(
            negative.words ?? fixture.words,
            negative.window ?? fixture.window,
          );
          expect(
            parseExpansionRepresentations({ ...negative.proposal, visualMode }, ctx),
            negative.name,
          ).toBeNull();
          expect(ctx.issues.length, negative.name).toBeGreaterThan(0);
        }
      }
    });
  }
  it('does not fall back to legacy equations or substitute another preset', () => {
    const fixture = fixtures[0];
    if (!fixture) throw new Error('Missing real fixture');
    for (const patch of [
      { preset: undefined },
      { preset: 49 },
      { preset: 'unknown' },
      { kind: 'statement' },
      { kind: 'equation', preset: 'unit-conversion' },
      { kind: 'geometry-projection', preset: 'matrix-product' },
    ]) {
      const ctx = makeParseContext(fixture.words, fixture.window);
      expect(parseExpansionRepresentations({ ...fixture.proposal, ...patch }, ctx)).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    }
  });
});
