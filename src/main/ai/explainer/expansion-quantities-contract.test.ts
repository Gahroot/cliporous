import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import { SCENE_CUE_KINDS } from '../../remotion/compositions/explainer/types';
import type { ExpansionSourceFixture } from './expansion-fixture-words';
import { parseExpansionQuantities } from './expansion-quantities-contract';
import { makeParseContext } from './kind-spec';
import { EXPANSION_QUANTITIES_SPECS } from './kinds-expansion-quantities';

const sourceFiles = [
  { stories: ['17', '18'], file: 'quantities/distribution.source.json' },
  { stories: ['19', '20'], file: 'quantities/denominator-partition.source.json' },
  { stories: ['21', '22'], file: 'quantities/ranking-calendar.source.json' },
  { stories: ['23', '24'], file: 'quantities/deviation-multiples.source.json' },
];
const fixtures: ExpansionSourceFixture[] = sourceFiles.flatMap(({ file }) => {
  const packet = JSON.parse(
    readFileSync(`scripts/explainer-stills/fixtures/expansion/${file}`, 'utf8'),
  ) as { version: number; pack: string; stories: ExpansionSourceFixture[] };
  if (packet.version !== 1 || packet.pack !== 'quantities')
    throw new Error('Malformed authored quantities source packet');
  return packet.stories;
});

describe('local quantities aggregate and actual preset definitions (not runtime registration)', () => {
  it('source index references exactly the executed raw packets', () => {
    expect(
      JSON.parse(
        readFileSync('scripts/explainer-stills/fixtures/expansion/quantities.source.json', 'utf8'),
      ),
    ).toEqual({ version: 1, pack: 'quantities', sourceFiles });
  });
  it('has all eight catalog routes with source-only schemas and unchanged bounded metadata', () => {
    expect(fixtures.map(({ id }) => id)).toEqual(['17', '18', '19', '20', '21', '22', '23', '24']);
    expect(EXPANSION_QUANTITIES_SPECS.map(({ storyId }) => storyId)).toEqual(
      fixtures.map(({ id }) => id),
    );
    for (const spec of EXPANSION_QUANTITIES_SPECS) {
      const entry = expansionStory(spec.storyId);
      expect([spec.kind, spec.preset]).toEqual([entry.kind, entry.preset]);
      expect(spec.describe).toBe(entry.purpose);
      expect(spec.schema).toContain('setupWord');
      expect(spec.schema).toContain('diagram|hybrid');
      expect(spec.schema).toContain('evidence');
      expect(spec.limits).toContain('No winner');
      expect(spec.limits).toContain(
        `Derivations: ${entry.allowedDerivations.length ? entry.allowedDerivations.join('|') : 'none'}`,
      );
      expect(spec.layouts).toEqual(['stack', 'stack-flipped']);
      expect(spec.durationSec).toEqual([5, 12]);
      expect(spec.triggers.length).toBeGreaterThan(0);
      expect(spec.avoid).toBeTruthy();
    }
  });
  for (const fixture of fixtures) {
    it(`${fixture.id}: direct/local parsers agree on facts and identities, both modes and exact source cues`, () => {
      const spec = EXPANSION_QUANTITIES_SPECS.find(({ storyId }) => storyId === fixture.id);
      if (!spec) throw new Error('Missing actual quantities preset');
      const ctx = makeParseContext(fixture.words, fixture.window);
      const scene = parseExpansionQuantities(fixture.proposal, ctx);
      expect(ctx.issues).toEqual([]);
      if (!scene) throw new Error('Missing actual parsed quantities story');
      const direct = makeParseContext(fixture.words, fixture.window);
      expect(spec.parse(fixture.proposal, direct)).toEqual(scene);
      expect(direct.issues).toEqual([]);
      const hybrid = makeParseContext(fixture.words, fixture.window);
      expect(
        parseExpansionQuantities({ ...fixture.proposal, visualMode: 'hybrid' }, hybrid),
      ).toEqual({ ...scene, visualMode: 'hybrid' });
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
  }
  it('rejects missing, malformed, unregistered and legacy-looking routes without generic fallback', () => {
    const fixture = fixtures[0];
    for (const patch of [
      { preset: undefined },
      { preset: 42 },
      { preset: 'unknown' },
      { kind: 'chart' },
      { kind: 'ranking', preset: 'histogram' },
    ]) {
      const ctx = makeParseContext(fixture.words, fixture.window);
      expect(parseExpansionQuantities({ ...fixture.proposal, ...patch }, ctx)).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    }
  });
});
