import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import { SCENE_CUE_KINDS } from '../../remotion/compositions/explainer/types';
import type { ExpansionSourceFixture } from './expansion-fixture-words';
import { parseExpansionReasoning } from './expansion-reasoning-contract';
import { makeParseContext } from './kind-spec';
import { EXPANSION_REASONING_SPECS } from './kinds-expansion-reasoning';

const fixtures: ExpansionSourceFixture[] = ['trace', 'argument', 'information', 'scope'].flatMap(
  (lane) => {
    const packet = JSON.parse(
      readFileSync(
        `scripts/explainer-stills/fixtures/expansion/reasoning/${lane}.source.json`,
        'utf8',
      ),
    ) as { version: number; pack: string; stories: ExpansionSourceFixture[] };
    if (packet.version !== 1 || packet.pack !== 'reasoning')
      throw new Error('Malformed authored source fixture packet');
    return packet.stories;
  },
);
describe('local reasoning aggregate and real preset definitions (not runtime registration)', () => {
  it('pack source index points only to the four executed raw fixture packets', () => {
    const index = JSON.parse(
      readFileSync('scripts/explainer-stills/fixtures/expansion/reasoning.source.json', 'utf8'),
    );
    expect(index).toEqual({
      version: 1,
      pack: 'reasoning',
      sourceFiles: [
        { stories: ['01', '02'], file: 'reasoning/trace.source.json' },
        { stories: ['03', '04'], file: 'reasoning/argument.source.json' },
        { stories: ['05', '06'], file: 'reasoning/information.source.json' },
        { stories: ['07', '08'], file: 'reasoning/scope.source.json' },
      ],
    });
  });
  it('has exactly eight frozen routes and complete source-only schema/metadata', () => {
    expect(fixtures.map((fixture) => fixture.id)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
    ]);
    expect(EXPANSION_REASONING_SPECS.map((spec) => spec.storyId)).toEqual(
      fixtures.map((fixture) => fixture.id),
    );
    for (const spec of EXPANSION_REASONING_SPECS) {
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
    it(`${fixture.id}: explicit local routing equals real preset parser with bounded cues and mode-only difference`, () => {
      const spec = EXPANSION_REASONING_SPECS.find((candidate) => candidate.storyId === fixture.id);
      if (!spec) throw new Error('Missing actual preset');
      const ctx = makeParseContext(fixture.words, fixture.window);
      const scene = parseExpansionReasoning(fixture.proposal, ctx);
      expect(ctx.issues).toEqual([]);
      if (!scene) throw new Error('Missing actual parsed story');
      const direct = makeParseContext(fixture.words, fixture.window);
      expect(spec.parse(fixture.proposal, direct)).toEqual(scene);
      expect(direct.issues).toEqual([]);
      const hybrid = makeParseContext(fixture.words, fixture.window);
      expect(
        parseExpansionReasoning({ ...fixture.proposal, visualMode: 'hybrid' }, hybrid),
      ).toEqual({ ...scene, visualMode: 'hybrid' });
      expect(hybrid.issues).toEqual([]);
      const cues = spec.cues(scene);
      expect(cues.map((cue) => cue.at)).toEqual([
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
      ]);
      for (const cue of cues) {
        expect(SCENE_CUE_KINDS).toContain(cue.kind);
        expect(cue.at).toBeGreaterThanOrEqual(fixture.window.startTime);
        expect(cue.at).toBeLessThanOrEqual(fixture.window.endTime - 0.8);
        expect(cue.gain).toBeGreaterThan(0);
        expect(cue.gain).toBeLessThanOrEqual(1);
      }
    });
  }
  it('fails closed on unknown, malformed and legacy-looking routes rather than generic fallback', () => {
    const fixture = fixtures[0];
    for (const patch of [
      { preset: undefined },
      { preset: 'unregistered' },
      { preset: 42 },
      { kind: 'statement' },
      { kind: 'argument-map', preset: 'trace-chain' },
    ]) {
      const ctx = makeParseContext(fixture.words, fixture.window);
      expect(parseExpansionReasoning({ ...fixture.proposal, ...patch }, ctx)).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    }
  });
});
