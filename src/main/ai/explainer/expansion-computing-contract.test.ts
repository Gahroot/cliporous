import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import { SCENE_CUE_KINDS } from '../../remotion/compositions/explainer/types';
import { parseExpansionComputing } from './expansion-computing-contract';
import {
  temporalSourceFixtures as materializeAuthoredSources,
  type TemporalFixtureSeed,
} from './expansion-temporal-fixtures';
import { makeParseContext } from './kind-spec';
import { EXPANSION_COMPUTING_SPECS } from './kinds-expansion-computing';

const sourceFiles = [
  { stories: ['65', '66'], file: 'computing/cache-stream.source.json' },
  { stories: ['67', '68'], file: 'computing/retry-product.source.json' },
  { stories: ['69', '70'], file: 'computing/versions-permissions.source.json' },
  { stories: ['71', '72'], file: 'computing/generalization-drift.source.json' },
];
const fixtures = sourceFiles.flatMap(({ stories, file }) => {
  const packet = JSON.parse(
    readFileSync(`scripts/explainer-stills/fixtures/expansion/${file}`, 'utf8'),
  ) as {
    version: number;
    pack: string;
    stories: TemporalFixtureSeed[];
    paraphrases?: TemporalFixtureSeed[];
  };
  if (packet.version !== 1 || packet.pack !== 'computing')
    throw new Error('Malformed authored computing packet');
  if ([...new Set(packet.stories.map(({ id }) => id))].join(',') !== stories.join(','))
    throw new Error('Computing packet disagrees with its authored source index');
  return materializeAuthoredSources([...packet.stories, ...(packet.paraphrases ?? [])]);
});

describe('local computing contracts/presets, not runtime registration', () => {
  it('index names exactly all executed raw packets', () => {
    expect(
      JSON.parse(
        readFileSync('scripts/explainer-stills/fixtures/expansion/computing.source.json', 'utf8'),
      ),
    ).toEqual({ version: 1, pack: 'computing', sourceFiles });
  });
  it('covers all frozen routes without adding numerical output derivations', () => {
    const ids = [...new Set(fixtures.map(({ id }) => id))].sort();
    expect(ids).toEqual(['65', '66', '67', '68', '69', '70', '71', '72']);
    expect(EXPANSION_COMPUTING_SPECS.map(({ storyId }) => storyId)).toEqual(ids);
    for (const id of ids) {
      expect(fixtures.filter((fixture) => fixture.id === id).length).toBeGreaterThanOrEqual(2);
      expect(
        fixtures
          .filter((fixture) => fixture.id === id)
          .reduce((sum, fixture) => sum + fixture.negatives.length, 0),
      ).toBeGreaterThan(0);
    }
    for (const spec of EXPANSION_COMPUTING_SPECS) {
      const entry = expansionStory(spec.storyId);
      expect([spec.kind, spec.preset]).toEqual([entry.kind, entry.preset]);
      expect(entry.allowedDerivations).toEqual([]);
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
      const spec = EXPANSION_COMPUTING_SPECS.find(({ storyId }) => storyId === fixture.id);
      if (!spec) throw new Error('Missing authored computing definition');
      const ctx = makeParseContext(fixture.words, fixture.window);
      const scene = parseExpansionComputing(fixture.proposal, ctx);
      expect(ctx.issues).toEqual([]);
      if (!scene) throw new Error('Actual computing scene must parse');
      expect([scene.kind, scene.preset]).toEqual([spec.kind, spec.preset]);
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        const direct = makeParseContext(fixture.words, fixture.window);
        expect(spec.parse({ ...fixture.proposal, visualMode }, direct)).toEqual({
          ...scene,
          visualMode,
        });
        expect(direct.issues).toEqual([]);
        const local = makeParseContext(fixture.words, fixture.window);
        expect(parseExpansionComputing({ ...fixture.proposal, visualMode }, local)).toEqual({
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
    it(`${fixture.id}/raw-case-${index}: all supplied negatives fail closed with diagnostics`, () => {
      for (const negative of fixture.negatives) {
        const suppliedMode = negative.proposal.visualMode;
        for (const visualMode of suppliedMode === 'diagram' || suppliedMode === 'hybrid'
          ? ['diagram', 'hybrid']
          : [suppliedMode]) {
          const ctx = makeParseContext(
            negative.words ?? fixture.words,
            negative.window ?? fixture.window,
          );
          expect(
            parseExpansionComputing({ ...negative.proposal, visualMode }, ctx),
            negative.name,
          ).toBeNull();
          expect(ctx.issues.length, negative.name).toBeGreaterThan(0);
        }
      }
    });
  }
  it('never substitutes legacy technology, workflow, property or cognition presets', () => {
    const fixture = fixtures[0];
    if (!fixture) throw new Error('Missing actual fixture');
    for (const patch of [
      { preset: undefined },
      { preset: 65 },
      { preset: 'unknown' },
      { kind: 'statement' },
      { kind: 'property-access', preset: 'reachability' },
      { kind: 'request-routing', preset: 'batch-stream' },
      { kind: 'model-training', preset: 'population-drift' },
    ]) {
      const ctx = makeParseContext(fixture.words, fixture.window);
      expect(parseExpansionComputing({ ...fixture.proposal, ...patch }, ctx)).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    }
  });
});
