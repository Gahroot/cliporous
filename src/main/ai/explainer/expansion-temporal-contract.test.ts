import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import { SCENE_CUE_KINDS } from '../../remotion/compositions/explainer/types';
import type { ExpansionSourceFixture } from './expansion-fixture-words';
import { parseExpansionTemporal } from './expansion-temporal-contract';
import {
  type TemporalClauseFixtureSeed,
  type TemporalFixtureSeed,
  type TemporalFixtureTiming,
  temporalClauseFixture,
  temporalSourceFixtures,
} from './expansion-temporal-fixtures';
import { makeParseContext } from './kind-spec';
import { EXPANSION_TEMPORAL_SPECS } from './kinds-expansion-temporal';

const sourceFiles = [
  { stories: ['41', '42'], file: 'temporal/lanes-critical.source.json' },
  { stories: ['43', '44'], file: 'temporal/reversible-expiry.source.json' },
  { stories: ['45', '46'], file: 'temporal/delay-phase.source.json' },
  { stories: ['47', '48'], file: 'temporal/history-twin.source.json' },
];
const fixtures: ExpansionSourceFixture[] = sourceFiles.flatMap(({ file, stories }) => {
  const packet = JSON.parse(
    readFileSync(`scripts/explainer-stills/fixtures/expansion/${file}`, 'utf8'),
  ) as {
    version: number;
    pack: string;
    stories: (TemporalFixtureSeed | TemporalClauseFixtureSeed)[];
    paraphrases?: TemporalClauseFixtureSeed[];
    timing?: TemporalFixtureTiming;
  };
  if (packet.version !== 1 || packet.pack !== 'temporal')
    throw new Error('Malformed authored temporal source packet');
  if ([...new Set(packet.stories.map(({ id }) => id))].join(',') !== stories.join(','))
    throw new Error('Authored temporal packet disagrees with its source index');
  const seeds = [...packet.stories, ...(packet.paraphrases ?? [])].map((seed) => {
    if ('words' in seed) return seed;
    if (!packet.timing)
      throw new Error('Clause-only fixture needs an explicitly authored schedule');
    return temporalClauseFixture(seed, packet.timing);
  });
  return temporalSourceFixtures(seeds);
});
function requiredFixture(id: string): ExpansionSourceFixture {
  const fixture = fixtures.find((entry) => entry.id === id);
  if (!fixture) throw new Error(`Missing authored temporal fixture ${id}`);
  return fixture;
}

describe('local temporal aggregate and preset definitions (not runtime registration)', () => {
  it('source index references exactly the executed raw packets', () => {
    expect(
      JSON.parse(
        readFileSync('scripts/explainer-stills/fixtures/expansion/temporal.source.json', 'utf8'),
      ),
    ).toEqual({ version: 1, pack: 'temporal', sourceFiles });
  });
  it('has all eight catalog routes, with critical path as the only derivation whitelist', () => {
    const storyIds = [...new Set(fixtures.map(({ id }) => id))].sort();
    expect(storyIds).toEqual(['41', '42', '43', '44', '45', '46', '47', '48']);
    expect(EXPANSION_TEMPORAL_SPECS.map(({ storyId }) => storyId)).toEqual(storyIds);
    for (const id of storyIds)
      expect(
        fixtures
          .filter((fixture) => fixture.id === id)
          .reduce((count, fixture) => count + fixture.negatives.length, 0),
      ).toBeGreaterThan(0);
    for (const spec of EXPANSION_TEMPORAL_SPECS) {
      const entry = expansionStory(spec.storyId);
      expect([spec.kind, spec.preset]).toEqual([entry.kind, entry.preset]);
      expect(spec.describe).toBe(entry.purpose);
      expect(spec.schema).toContain('setupWord');
      expect(spec.schema).toContain('diagram|hybrid');
      expect(spec.schema).toContain('evidence');
      expect(spec.limits).toContain('No invented');
      expect(spec.limits).toContain(
        `Derivations: ${spec.storyId === '42' ? 'critical-path' : 'none'}`,
      );
      expect(entry.allowedDerivations).toEqual(spec.storyId === '42' ? ['critical-path'] : []);
      expect(spec.layouts).toEqual(['stack', 'stack-flipped']);
      expect(spec.durationSec).toEqual([5, 12]);
      expect(spec.triggers.length).toBeGreaterThan(0);
      expect(spec.avoid).toBeTruthy();
    }
  });
  for (const [caseIndex, fixture] of fixtures.entries()) {
    it(`${fixture.id}/raw-case-${caseIndex}: direct/local parser, both modes and source cues preserve semantics`, () => {
      const spec = EXPANSION_TEMPORAL_SPECS.find(({ storyId }) => storyId === fixture.id);
      if (!spec) throw new Error('Missing actual temporal preset');
      const ctx = makeParseContext(fixture.words, fixture.window);
      const scene = parseExpansionTemporal(fixture.proposal, ctx);
      expect(ctx.issues).toEqual([]);
      if (!scene) throw new Error('Missing actual parsed temporal story');
      const direct = makeParseContext(fixture.words, fixture.window);
      expect(spec.parse(fixture.proposal, direct)).toEqual(scene);
      expect(direct.issues).toEqual([]);
      const hybrid = makeParseContext(fixture.words, fixture.window);
      expect(parseExpansionTemporal({ ...fixture.proposal, visualMode: 'hybrid' }, hybrid)).toEqual(
        {
          ...scene,
          visualMode: 'hybrid',
        },
      );
      expect(hybrid.issues).toEqual([]);
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
    it(`${fixture.id}/raw-case-${caseIndex}: local routing executes every supplied negative without fallback`, () => {
      expect(Array.isArray(fixture.negatives)).toBe(true);
      for (const negative of fixture.negatives) {
        const ctx = makeParseContext(
          negative.words ?? fixture.words,
          negative.window ?? fixture.window,
        );
        expect(parseExpansionTemporal(negative.proposal, ctx), negative.name).toBeNull();
        expect(ctx.issues.length, negative.name).toBeGreaterThan(0);
      }
    });
  }
  it('rejects absent, malformed, unregistered and mismatched routes without legacy fallback', () => {
    const fixture = requiredFixture('41');
    for (const patch of [
      { preset: undefined },
      { preset: 42 },
      { preset: 'unknown' },
      { kind: 'statement' },
      { kind: 'digital-twin', preset: 'parallel-lanes' },
      { kind: 'temporal-structure', preset: 'aligned-state-comparison' },
    ]) {
      const ctx = makeParseContext(fixture.words, fixture.window);
      expect(parseExpansionTemporal({ ...fixture.proposal, ...patch }, ctx)).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    }
  });
});
