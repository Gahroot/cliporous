import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import { SCENE_CUE_KINDS } from '../../remotion/compositions/explainer/types';
import { parseExpansionDecisions } from './expansion-decisions-contract';
import type { ExpansionSourceFixture } from './expansion-fixture-words';
import { makeParseContext } from './kind-spec';
import { EXPANSION_DECISIONS_SPECS } from './kinds-expansion-decisions';

const sourceFiles = [
  { stories: ['25', '26'], file: 'decisions/sieve-frontier.source.json' },
  { stories: ['27', '28'], file: 'decisions/priority-tree.source.json' },
  { stories: ['29', '30'], file: 'decisions/search-landscape.source.json' },
  { stories: ['31', '32'], file: 'decisions/explore-evidence.source.json' },
];
const fixtures: ExpansionSourceFixture[] = sourceFiles.flatMap(({ file, stories }) => {
  const packet = JSON.parse(
    readFileSync(`scripts/explainer-stills/fixtures/expansion/${file}`, 'utf8'),
  ) as { version: number; pack: string; stories: ExpansionSourceFixture[] };
  if (packet.version !== 1 || packet.pack !== 'decisions')
    throw new Error('Malformed authored decisions source packet');
  if (packet.stories.map(({ id }) => id).join(',') !== stories.join(','))
    throw new Error('Authored decisions packet disagrees with the source index');
  return packet.stories;
});

function requiredFixture(id: string): ExpansionSourceFixture {
  const fixture = fixtures.find((entry) => entry.id === id);
  if (!fixture) throw new Error(`Missing authored decisions fixture ${id}`);
  return fixture;
}

describe('local decisions aggregate and preset definitions (not runtime registration)', () => {
  it('source index references exactly the executed raw packets', () => {
    expect(
      JSON.parse(
        readFileSync('scripts/explainer-stills/fixtures/expansion/decisions.source.json', 'utf8'),
      ),
    ).toEqual({ version: 1, pack: 'decisions', sourceFiles });
  });
  it('has all eight catalog routes with source-only schemas and bounded metadata', () => {
    expect(fixtures.map(({ id }) => id)).toEqual(['25', '26', '27', '28', '29', '30', '31', '32']);
    expect(EXPANSION_DECISIONS_SPECS.map(({ storyId }) => storyId)).toEqual(
      fixtures.map(({ id }) => id),
    );
    for (const spec of EXPANSION_DECISIONS_SPECS) {
      const entry = expansionStory(spec.storyId);
      expect([spec.kind, spec.preset]).toEqual([entry.kind, entry.preset]);
      expect(spec.describe).toBe(entry.purpose);
      expect(spec.schema).toContain('setupWord');
      expect(spec.schema).toContain('diagram|hybrid');
      expect(spec.schema).toContain('evidence');
      expect(spec.limits).toContain('No invented winner');
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
    it(`${fixture.id}: local/direct parsers preserve facts, identities, both modes and exact source cues`, () => {
      const spec = EXPANSION_DECISIONS_SPECS.find(({ storyId }) => storyId === fixture.id);
      if (!spec) throw new Error('Missing actual decisions preset');
      const ctx = makeParseContext(fixture.words, fixture.window);
      const scene = parseExpansionDecisions(fixture.proposal, ctx);
      expect(ctx.issues).toEqual([]);
      if (!scene) throw new Error('Missing actual parsed decisions story');
      const direct = makeParseContext(fixture.words, fixture.window);
      expect(spec.parse(fixture.proposal, direct)).toEqual(scene);
      expect(direct.issues).toEqual([]);
      const hybrid = makeParseContext(fixture.words, fixture.window);
      expect(
        parseExpansionDecisions({ ...fixture.proposal, visualMode: 'hybrid' }, hybrid),
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
    it(`${fixture.id}: local routing executes every explicit negative without fallback`, () => {
      expect(fixture.negatives.length).toBeGreaterThan(0);
      for (const negative of fixture.negatives) {
        const ctx = makeParseContext(
          negative.words ?? fixture.words,
          negative.window ?? fixture.window,
        );
        expect(parseExpansionDecisions(negative.proposal, ctx), negative.name).toBeNull();
        expect(ctx.issues.length, negative.name).toBeGreaterThan(0);
      }
    });
  }
  it('rejects two separated beat times that reuse the same source clause', () => {
    const fixture = requiredFixture('27');
    const actionWord = fixture.proposal.actionWord;
    if (typeof actionWord !== 'number') throw new Error('Authored action beat is required');
    const responseWord = actionWord + 6;
    expect(fixture.words[responseWord].start - fixture.words[actionWord].start).toBeGreaterThan(1);
    const ctx = makeParseContext(fixture.words, fixture.window);
    expect(parseExpansionDecisions({ ...fixture.proposal, responseWord }, ctx)).toBeNull();
    expect(ctx.issues.length).toBeGreaterThan(0);
  });
  it('rejects missing, malformed, unregistered and mismatched routes without legacy fallback', () => {
    const fixture = requiredFixture('25');
    for (const patch of [
      { preset: undefined },
      { preset: 42 },
      { preset: 'unknown' },
      { kind: 'statement' },
      { kind: 'conditional-choice', preset: 'sieve' },
      { kind: 'constraint-choice', preset: 'decision-tree' },
    ]) {
      const ctx = makeParseContext(fixture.words, fixture.window);
      expect(parseExpansionDecisions({ ...fixture.proposal, ...patch }, ctx)).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    }
  });
});
