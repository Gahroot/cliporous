import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import { SCENE_CUE_KINDS } from '../../remotion/compositions/explainer/types';
import type { ExpansionSourceFixture } from './expansion-fixture-words';
import { parseExpansionGeometry } from './expansion-geometry-contract';
import {
  temporalSourceFixtures as materializeAuthoredSources,
  type TemporalFixtureSeed,
} from './expansion-temporal-fixtures';
import { makeParseContext } from './kind-spec';
import { EXPANSION_GEOMETRY_SPECS } from './kinds-expansion-geometry';

const sourceFiles = [
  { stories: ['57', '58'], file: 'geometry/section-unfold.source.json' },
  { stories: ['59', '60'], file: 'geometry/fit-scale.source.json' },
  { stories: ['61', '62'], file: 'geometry/visibility-access.source.json' },
  { stories: ['63', '64'], file: 'geometry/regions-dimensions.source.json' },
];
const fixtures: ExpansionSourceFixture[] = sourceFiles.flatMap(({ file, stories }) => {
  const packet = JSON.parse(
    readFileSync(`scripts/explainer-stills/fixtures/expansion/${file}`, 'utf8'),
  ) as {
    version: number;
    pack: string;
    stories: TemporalFixtureSeed[];
    paraphrases?: TemporalFixtureSeed[];
  };
  if (packet.version !== 1 || packet.pack !== 'geometry')
    throw new Error('Malformed authored geometry source packet');
  if ([...new Set(packet.stories.map(({ id }) => id))].join(',') !== stories.join(','))
    throw new Error('Authored geometry packet disagrees with its source index');
  return materializeAuthoredSources([...packet.stories, ...(packet.paraphrases ?? [])]);
});

describe('local geometry contracts and preset definitions, not runtime registration', () => {
  it('source index names exactly the executed raw packets', () => {
    expect(
      JSON.parse(
        readFileSync('scripts/explainer-stills/fixtures/expansion/geometry.source.json', 'utf8'),
      ),
    ).toEqual({ version: 1, pack: 'geometry', sourceFiles });
  });
  it('covers every frozen geometry route without new numerical derivations', () => {
    const ids = [...new Set(fixtures.map(({ id }) => id))].sort();
    expect(ids).toEqual(['57', '58', '59', '60', '61', '62', '63', '64']);
    expect(EXPANSION_GEOMETRY_SPECS.map(({ storyId }) => storyId)).toEqual(ids);
    for (const id of ids) {
      expect(fixtures.filter((fixture) => fixture.id === id).length).toBeGreaterThanOrEqual(2);
      expect(
        fixtures
          .filter((fixture) => fixture.id === id)
          .reduce((sum, fixture) => sum + fixture.negatives.length, 0),
      ).toBeGreaterThan(0);
    }
    for (const spec of EXPANSION_GEOMETRY_SPECS) {
      const entry = expansionStory(spec.storyId);
      expect([spec.kind, spec.preset]).toEqual([entry.kind, entry.preset]);
      expect(entry.allowedDerivations).toEqual(
        spec.storyId === '64' ? ['dimensional-scaling'] : [],
      );
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
    it(`${fixture.id}/raw-case-${index}: direct and local routes preserve both-mode facts and cues`, () => {
      const spec = EXPANSION_GEOMETRY_SPECS.find(({ storyId }) => storyId === fixture.id);
      if (!spec) throw new Error('Missing authored geometry preset');
      const ctx = makeParseContext(fixture.words, fixture.window);
      const scene = parseExpansionGeometry(fixture.proposal, ctx);
      expect(ctx.issues).toEqual([]);
      if (!scene) throw new Error('Missing actual parsed geometry scene');
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        const direct = makeParseContext(fixture.words, fixture.window);
        expect(spec.parse({ ...fixture.proposal, visualMode }, direct)).toEqual({
          ...scene,
          visualMode,
        });
        expect(direct.issues).toEqual([]);
        const local = makeParseContext(fixture.words, fixture.window);
        expect(parseExpansionGeometry({ ...fixture.proposal, visualMode }, local)).toEqual({
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
    it(`${fixture.id}/raw-case-${index}: every supplied negative fails closed with diagnostics`, () => {
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
            parseExpansionGeometry({ ...negative.proposal, visualMode }, ctx),
            negative.name,
          ).toBeNull();
          expect(ctx.issues.length, negative.name).toBeGreaterThan(0);
        }
      }
    });
  }
  it('does not fall back to legacy spatial or representation presets', () => {
    const fixture = fixtures[0];
    if (!fixture) throw new Error('Missing real geometry fixture');
    for (const patch of [
      { preset: undefined },
      { preset: 57 },
      { preset: 'unknown' },
      { kind: 'statement' },
      { kind: 'geometry-projection', preset: 'coordinates' },
      { kind: 'floorplan-fit', preset: 'packing' },
      { kind: 'property-access', preset: 'software-scope' },
    ]) {
      const ctx = makeParseContext(fixture.words, fixture.window);
      expect(parseExpansionGeometry({ ...fixture.proposal, ...patch }, ctx)).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    }
  });
});
