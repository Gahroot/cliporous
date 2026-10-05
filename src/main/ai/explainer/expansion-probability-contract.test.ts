import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import { SCENE_CUE_KINDS } from '../../remotion/compositions/explainer/types';
import type { ExpansionSourceFixture } from './expansion-fixture-words';
import { parseExpansionProbability } from './expansion-probability-contract';
import { makeParseContext } from './kind-spec';
import { EXPANSION_PROBABILITY_SPECS } from './kinds-expansion-probability';

const sourceFiles = [
  { stories: ['09', '10'], file: 'probability/base-update.source.json' },
  { stories: ['11', '12'], file: 'probability/conditioning-sampling.source.json' },
  { stories: ['13', '14'], file: 'probability/variation-range.source.json' },
  { stories: ['15', '16'], file: 'probability/risk-calibration.source.json' },
];
const fixtures: ExpansionSourceFixture[] = sourceFiles.flatMap(({ file }) => {
  const packet = JSON.parse(
    readFileSync(`scripts/explainer-stills/fixtures/expansion/${file}`, 'utf8'),
  ) as {
    version: number;
    pack: string;
    stories: ExpansionSourceFixture[];
  };
  if (packet.version !== 1 || packet.pack !== 'probability')
    throw new Error('Malformed authored probability source packet');
  return packet.stories;
});

describe('local probability aggregate and actual preset definitions (not runtime registration)', () => {
  it('source index references exactly the executed raw packets', () => {
    expect(
      JSON.parse(
        readFileSync('scripts/explainer-stills/fixtures/expansion/probability.source.json', 'utf8'),
      ),
    ).toEqual({ version: 1, pack: 'probability', sourceFiles });
  });
  it('has all eight frozen routes with source-only schemas and bounded metadata', () => {
    expect(fixtures.map(({ id }) => id)).toEqual(['09', '10', '11', '12', '13', '14', '15', '16']);
    expect(EXPANSION_PROBABILITY_SPECS.map(({ storyId }) => storyId)).toEqual(
      fixtures.map(({ id }) => id),
    );
    for (const spec of EXPANSION_PROBABILITY_SPECS) {
      const entry = expansionStory(spec.storyId);
      expect([spec.kind, spec.preset]).toEqual([entry.kind, entry.preset]);
      expect(spec.describe).toBe(entry.purpose);
      expect(spec.schema).toContain('setupWord');
      expect(spec.schema).toContain('diagram|hybrid');
      expect(spec.schema).toContain('evidence');
      expect(spec.limits).toContain('No winner');
      expect(spec.layouts).toEqual(['stack', 'stack-flipped']);
      expect(spec.durationSec).toEqual([5, 12]);
      expect(spec.triggers.length).toBeGreaterThan(0);
      expect(spec.avoid).toBeTruthy();
    }
  });
  for (const fixture of fixtures) {
    it(`${fixture.id}: direct and routed parsers agree with stable identities, facts and source beats in both modes`, () => {
      const spec = EXPANSION_PROBABILITY_SPECS.find(({ storyId }) => storyId === fixture.id);
      if (!spec) throw new Error('Missing actual probability preset');
      const ctx = makeParseContext(fixture.words, fixture.window);
      const scene = parseExpansionProbability(fixture.proposal, ctx);
      expect(ctx.issues).toEqual([]);
      if (!scene) throw new Error('Missing actual parsed probability story');
      const direct = makeParseContext(fixture.words, fixture.window);
      expect(spec.parse(fixture.proposal, direct)).toEqual(scene);
      expect(direct.issues).toEqual([]);
      const hybrid = makeParseContext(fixture.words, fixture.window);
      expect(
        parseExpansionProbability({ ...fixture.proposal, visualMode: 'hybrid' }, hybrid),
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
  it('rejects absent, malformed, unregistered and legacy-looking routes without fallback', () => {
    const fixture = fixtures[0];
    for (const patch of [
      { preset: undefined },
      { preset: 42 },
      { preset: 'unknown' },
      { kind: 'statement' },
      { kind: 'quadrant', preset: 'base-rate' },
    ]) {
      const ctx = makeParseContext(fixture.words, fixture.window);
      expect(parseExpansionProbability({ ...fixture.proposal, ...patch }, ctx)).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    }
  });
});
