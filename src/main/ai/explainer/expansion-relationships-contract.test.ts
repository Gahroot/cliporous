import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import { SCENE_CUE_KINDS } from '../../remotion/compositions/explainer/types';
import type { ExpansionSourceFixture } from './expansion-fixture-words';
import { parseExpansionRelationships } from './expansion-relationships-contract';
import { makeParseContext } from './kind-spec';
import { EXPANSION_RELATIONSHIPS_SPECS } from './kinds-expansion-relationships';

const sourceFiles = [
  { stories: ['33', '34'], file: 'relationships/taxonomy-rights.source.json' },
  { stories: ['35', '36'], file: 'relationships/approval-dependency.source.json' },
  { stories: ['37', '38'], file: 'relationships/matrix-matching.source.json' },
  { stories: ['39', '40'], file: 'relationships/sets-topology.source.json' },
];
const fixtures: ExpansionSourceFixture[] = sourceFiles.flatMap(({ file, stories }) => {
  const packet = JSON.parse(
    readFileSync(`scripts/explainer-stills/fixtures/expansion/${file}`, 'utf8'),
  ) as { version: number; pack: string; stories: ExpansionSourceFixture[] };
  if (packet.version !== 1 || packet.pack !== 'relationships')
    throw new Error('Malformed authored relationships source packet');
  if ([...new Set(packet.stories.map(({ id }) => id))].join(',') !== stories.join(','))
    throw new Error('Authored relationships packet disagrees with the source index');
  return packet.stories;
});
function requiredFixture(id: string): ExpansionSourceFixture {
  const fixture = fixtures.find((entry) => entry.id === id);
  if (!fixture) throw new Error(`Missing authored relationships fixture ${id}`);
  return fixture;
}

describe('local relationships aggregate and preset definitions (not runtime registration)', () => {
  it('source index references exactly the executed raw packets', () => {
    expect(
      JSON.parse(
        readFileSync(
          'scripts/explainer-stills/fixtures/expansion/relationships.source.json',
          'utf8',
        ),
      ),
    ).toEqual({ version: 1, pack: 'relationships', sourceFiles });
  });
  it('has all eight catalog routes with source-only schemas and bounded metadata', () => {
    const storyIds = [...new Set(fixtures.map(({ id }) => id))].sort();
    expect(storyIds).toEqual(['33', '34', '35', '36', '37', '38', '39', '40']);
    expect(EXPANSION_RELATIONSHIPS_SPECS.map(({ storyId }) => storyId)).toEqual(storyIds);
    for (const id of storyIds)
      expect(
        fixtures
          .filter((fixture) => fixture.id === id)
          .reduce((count, fixture) => count + fixture.negatives.length, 0),
      ).toBeGreaterThan(0);
    for (const spec of EXPANSION_RELATIONSHIPS_SPECS) {
      const entry = expansionStory(spec.storyId);
      expect([spec.kind, spec.preset]).toEqual([entry.kind, entry.preset]);
      expect(spec.describe).toBe(entry.purpose);
      expect(spec.schema).toContain('setupWord');
      expect(spec.schema).toContain('diagram|hybrid');
      expect(spec.schema).toContain('evidence');
      expect(spec.limits).toContain('No invented');
      expect(spec.limits).toContain('Derivations: none');
      expect(entry.allowedDerivations).toEqual([]);
      expect(spec.layouts).toEqual(['stack', 'stack-flipped']);
      expect(spec.durationSec).toEqual([5, 12]);
      expect(spec.triggers.length).toBeGreaterThan(0);
      expect(spec.avoid).toBeTruthy();
    }
  });
  for (const [caseIndex, fixture] of fixtures.entries()) {
    it(`${fixture.id}/raw-case-${caseIndex}: local/direct parsers preserve facts, identities, both modes and source cues`, () => {
      const spec = EXPANSION_RELATIONSHIPS_SPECS.find(({ storyId }) => storyId === fixture.id);
      if (!spec) throw new Error('Missing actual relationships preset');
      const ctx = makeParseContext(fixture.words, fixture.window);
      const scene = parseExpansionRelationships(fixture.proposal, ctx);
      expect(ctx.issues).toEqual([]);
      if (!scene) throw new Error('Missing actual parsed relationships story');
      const direct = makeParseContext(fixture.words, fixture.window);
      expect(spec.parse(fixture.proposal, direct)).toEqual(scene);
      expect(direct.issues).toEqual([]);
      const hybrid = makeParseContext(fixture.words, fixture.window);
      expect(
        parseExpansionRelationships({ ...fixture.proposal, visualMode: 'hybrid' }, hybrid),
      ).toEqual({
        ...scene,
        visualMode: 'hybrid',
      });
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
        expect(parseExpansionRelationships(negative.proposal, ctx), negative.name).toBeNull();
        expect(ctx.issues.length, negative.name).toBeGreaterThan(0);
      }
    });
  }
  it('rejects missing, malformed, unregistered and mismatched routes without legacy fallback', () => {
    const fixture = requiredFixture('33');
    for (const patch of [
      { preset: undefined },
      { preset: 42 },
      { preset: 'unknown' },
      { kind: 'statement' },
      { kind: 'ownership-change', preset: 'taxonomy' },
      { kind: 'relation-structure', preset: 'dual-rights' },
    ]) {
      const ctx = makeParseContext(fixture.words, fixture.window);
      expect(parseExpansionRelationships({ ...fixture.proposal, ...patch }, ctx)).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    }
  });
});
