import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import { SCENE_CUE_KINDS } from '../../remotion/compositions/explainer/types';
import { parseExpansionPhysical } from './expansion-physical-contract';
import { type TemporalFixtureSeed, temporalSourceFixtures } from './expansion-temporal-fixtures';
import { makeParseContext } from './kind-spec';
import { EXPANSION_PHYSICAL_SPECS } from './kinds-expansion-physical';

const sourceFiles = [
  { stories: ['73', '74'], file: 'physical/supply-incentives.source.json' },
  { stories: ['75', '76'], file: 'physical/resource-diffusion.source.json' },
  { stories: ['77', '78'], file: 'physical/interference-cycle.source.json' },
  { stories: ['79', '80'], file: 'physical/energy-field.source.json' },
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
  if (packet.version !== 1 || packet.pack !== 'physical')
    throw new Error('Malformed authored physical packet');
  if ([...new Set(packet.stories.map(({ id }) => id))].join(',') !== stories.join(','))
    throw new Error('Physical packet disagrees with its authored index');
  return temporalSourceFixtures([...packet.stories, ...(packet.paraphrases ?? [])]);
});
describe('local physical contracts/presets, not runtime registration or simulation', () => {
  it('indexes exactly every executed complete-source packet', () => {
    expect(
      JSON.parse(
        readFileSync('scripts/explainer-stills/fixtures/expansion/physical.source.json', 'utf8'),
      ),
    ).toEqual({ version: 1, pack: 'physical', sourceFiles });
  });
  it('covers all frozen story routes and only the signal-sum derivation whitelist', () => {
    const ids = [...new Set(fixtures.map(({ id }) => id))].sort();
    expect(ids).toEqual(['73', '74', '75', '76', '77', '78', '79', '80']);
    expect(EXPANSION_PHYSICAL_SPECS.map(({ storyId }) => storyId)).toEqual(ids);
    for (const id of ids) {
      expect(fixtures.filter((f) => f.id === id).length).toBeGreaterThanOrEqual(2);
      expect(
        fixtures.filter((f) => f.id === id).reduce((sum, f) => sum + f.negatives.length, 0),
      ).toBeGreaterThan(0);
    }
    for (const spec of EXPANSION_PHYSICAL_SPECS) {
      const entry = expansionStory(spec.storyId);
      expect([spec.kind, spec.preset]).toEqual([entry.kind, entry.preset]);
      expect(entry.allowedDerivations).toEqual(spec.storyId === '77' ? ['signal-sum'] : []);
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
    it(`${fixture.id}/raw-case-${index}: local routes preserve both-mode facts and ordered source cues`, () => {
      const spec = EXPANSION_PHYSICAL_SPECS.find(({ storyId }) => storyId === fixture.id);
      if (!spec) throw new Error('Missing actual physical definition');
      const ctx = makeParseContext(fixture.words, fixture.window);
      const scene = parseExpansionPhysical(fixture.proposal, ctx);
      expect(ctx.issues).toEqual([]);
      if (!scene) throw new Error('Actual physical scene must parse');
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        const direct = makeParseContext(fixture.words, fixture.window);
        expect(spec.parse({ ...fixture.proposal, visualMode }, direct)).toEqual({
          ...scene,
          visualMode,
        });
        expect(direct.issues).toEqual([]);
        const local = makeParseContext(fixture.words, fixture.window);
        expect(parseExpansionPhysical({ ...fixture.proposal, visualMode }, local)).toEqual({
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
    it(`${fixture.id}/raw-case-${index}: every negative fails closed with review diagnostics`, () => {
      for (const negative of fixture.negatives) {
        const supplied = negative.proposal.visualMode;
        for (const visualMode of supplied === 'diagram' || supplied === 'hybrid'
          ? ['diagram', 'hybrid']
          : [supplied]) {
          const ctx = makeParseContext(
            negative.words ?? fixture.words,
            negative.window ?? fixture.window,
          );
          expect(
            parseExpansionPhysical({ ...negative.proposal, visualMode }, ctx),
            negative.name,
          ).toBeNull();
          expect(ctx.issues.length, negative.name).toBeGreaterThan(0);
        }
      }
    });
  }
  it('rejects unknown/missing/crossed presets without an old generic fallback', () => {
    const fixture = fixtures[0];
    if (!fixture) throw new Error('Missing actual source');
    for (const patch of [
      { preset: undefined },
      { preset: 79 },
      { preset: 'unknown' },
      { kind: 'statement' },
      { kind: 'material-process', preset: 'energy-budget' },
      { kind: 'field-map', preset: 'interference' },
      { kind: 'inventory-demand', preset: 'shared-resource' },
    ]) {
      const ctx = makeParseContext(fixture.words, fixture.window);
      expect(parseExpansionPhysical({ ...fixture.proposal, ...patch }, ctx)).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    }
  });
});
