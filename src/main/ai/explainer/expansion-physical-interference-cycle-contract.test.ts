import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionSourceFixture } from './expansion-fixture-words';
import {
  parseExpansionInterference,
  parseExpansionMaterialStateCycle,
} from './expansion-physical-interference-cycle-contract';
import { type TemporalFixtureSeed, temporalSourceFixtures } from './expansion-temporal-fixtures';
import { makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/physical/interference-cycle.source.json',
    'utf8',
  ),
) as { version: number; pack: string; stories: TemporalFixtureSeed[] };
const fixtures = temporalSourceFixtures(packet.stories);
function parse(f: ExpansionSourceFixture, mode: string, raw: Rec = f.proposal) {
  const ctx = makeParseContext(f.words, f.window);
  const scene = (f.id === '77' ? parseExpansionInterference : parseExpansionMaterialStateCycle)(
    {
      ...raw,
      visualMode:
        raw.visualMode === 'diagram' || raw.visualMode === 'hybrid' ? mode : raw.visualMode,
    },
    ctx,
  );
  return { scene, issues: ctx.issues };
}
describe('STEP17 interference/state cycle source contract', () => {
  it('version1 physical raw source packet', () => {
    expect(packet.version).toBe(1);
    expect(packet.pack).toBe('physical');
    expect(fixtures.length).toBeGreaterThanOrEqual(4);
  });
  it('frozen signal-sum only, no state-cycle numeric derivation', () => {
    expect(expansionStory('77').allowedDerivations).toEqual(['signal-sum']);
    expect(expansionStory('78').allowedDerivations).toEqual([]);
  });
  for (const state of [
    'known',
    'unknown',
    'missing',
    'disputed',
    'conditional',
    'simulated',
    'illustrative',
  ])
    for (const mode of ['diagram', 'hybrid']) {
      it(`source parameter retains ${state} in ${mode}, no unknown-as-zero`, () => {
        const seed = structuredClone(packet.stories[0]);

        const raw = seed.proposal,
          wave = (raw.waves as Rec[])[0],
          q = wave.amplitude as Rec;
        q.state = state;
        let value = '1.00';
        if (state === 'unknown' || state === 'missing') {
          delete q.amount;
          q.qualifier = state;
          value = state;
        }
        if (state === 'disputed') {
          delete q.amount;
          q.qualifier = state;
          q.alternatives = [
            { kind: 'rational', value: { numerator: 1, denominator: 1 } },
            { kind: 'rational', value: { numerator: 2, denominator: 1 } },
          ];
          value = 'disputed between 1 and 2';
        }
        let clause = `Wave A amplitude is ${value} metre during trial among bench.`;
        if (state === 'conditional') {
          q.condition = 'if approved';
          raw.condition = 'if approved';
          clause = `If approved, ${clause}`;
        }
        if (state === 'simulated' || state === 'illustrative') {
          q.qualifier = state === 'simulated' ? 'simulation' : 'teaching example';
          raw.evidence = 'illustrative';
          clause = `In this ${q.qualifier}, ${clause}`;
        }
        const clauses = seed.sourceText.split(/(?<=[.!?])\s+/);
        clauses[1] = clause;
        const f = temporalSourceFixtures([
          {
            ...seed,
            negatives: [],
            examples: [],
            paraphrases: [
              { name: 'explicit status source', clauses, outcome: String(raw.outcome) },
            ],
          },
        ])[1];
        const scene = parse(f, mode).scene;
        expect(scene?.kind).toBe('signal-composition');
        if (scene?.kind !== 'signal-composition') return;
        expect(scene.waves[0].amplitude.state).toBe(state);
        if (state === 'known')
          expect(
            'amount' in scene.waves[0].amplitude && scene.waves[0].amplitude.amount.notation,
          ).toBe('1.00');
        if (state !== 'known') {
          const changed = structuredClone(f.proposal),
            amount = (changed.waves as Rec[])[0].amplitude as Rec;
          amount.state = 'known';
          amount.amount = { kind: 'rational', value: { numerator: 0, denominator: 1 } };
          delete amount.qualifier;
          delete amount.condition;
          delete amount.alternatives;
          const bad = parse(f, mode, changed);
          expect(bad.scene).toBeNull();
          expect(bad.issues.length).toBeGreaterThan(0);
        }
      });
    }
  for (const f of fixtures)
    for (const mode of ['diagram', 'hybrid']) {
      it(`${f.id} ${f.sourceText.slice(0, 24)} ${mode} accepts complete source and rejects mutations`, () => {
        const result = parse(f, mode);
        expect(result.issues).toEqual([]);
        expect(result.scene).not.toBeNull();
        for (const negative of f.negatives ?? []) {
          const bad = parse(
            { ...f, words: negative.words ?? f.words, window: negative.window ?? f.window },
            mode,
            negative.proposal,
          );
          expect(bad.scene, negative.name).toBeNull();
          expect(bad.issues.length, negative.name).toBeGreaterThan(0);
        }
      });
      it(`${f.id} ${f.sourceText.slice(0, 24)} mode-independent facts and source-time rebase`, () => {
        const a = parse(f, 'diagram').scene,
          b = parse(f, 'hybrid').scene;
        expect({ ...a, visualMode: 'diagram' }).toEqual({ ...b, visualMode: 'diagram' });
        const shifted = {
          ...f,
          words: f.words.map((w) => ({ ...w, start: w.start + 100, end: w.end + 100 })),
          window: {
            ...f.window,
            startTime: f.window.startTime + 100,
            endTime: f.window.endTime + 100,
          },
        };
        const c = parse(shifted, 'diagram').scene;
        expect(c).not.toBeNull();
        expect(c?.setupAt).toBeCloseTo((a?.setupAt ?? 0) + 100);
        expect(c?.records).toEqual(a?.records);
        expect(c?.relations).toEqual(a?.relations);
        if (a?.kind === 'signal-composition' && c?.kind === 'signal-composition')
          expect(c.waves).toEqual(a.waves);
      });
    }
});
