import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import {
  parseExpansionBatchStream,
  parseExpansionCacheFreshness,
} from './expansion-computing-cache-stream-contract';
import type { ExpansionSourceFixture } from './expansion-fixture-words';
import { type TemporalFixtureSeed, temporalSourceFixtures } from './expansion-temporal-fixtures';
import { makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/computing/cache-stream.source.json',
    'utf8',
  ),
) as { version: number; pack: string; stories: TemporalFixtureSeed[] };
const fixtures = temporalSourceFixtures(packet.stories);
const modes = ['diagram', 'hybrid'] as const;
const phases = ['setup', 'action', 'response', 'check', 'resolve'] as const;
function parse(f: ExpansionSourceFixture, mode: string, raw: Rec = f.proposal) {
  const ctx = makeParseContext(f.words, f.window);
  const proposal = {
    ...raw,
    visualMode: raw.visualMode === 'diagram' || raw.visualMode === 'hybrid' ? mode : raw.visualMode,
  };
  return {
    scene: (f.id === '65' ? parseExpansionCacheFreshness : parseExpansionBatchStream)(
      proposal,
      ctx,
    ),
    issues: ctx.issues,
  };
}
function rewrite(
  f: ExpansionSourceFixture,
  clauses: string[],
  proposal: Rec,
): ExpansionSourceFixture {
  return temporalSourceFixtures([
    {
      ...f,
      proposal,
      negatives: [],
      paraphrases: [
        { name: 'explicit source variant', clauses, outcome: String(proposal.outcome) },
      ],
    },
  ])[1];
}
function facts(raw: Rec): Rec[] {
  return [...(raw.records as Rec[]), ...(raw.relations as Rec[])];
}
function predicate(fact: Rec, value: string): string {
  return `${fact.actor} reports ${(fact.targets as string[]).join(' and ')} ${fact.role} as ${value} at ${fact.scope} during ${fact.period}.`;
}
function variant(f: ExpansionSourceFixture, index: number, state: string): ExpansionSourceFixture {
  const raw = structuredClone(f.proposal),
    rows = facts(raw),
    clauses = f.sourceText.split(/(?<=[.!?])\s+/);
  delete raw.condition;
  rows.forEach((row, i) => {
    if (row.state === 'conditional') {
      row.state = 'known';
      delete row.condition;
      clauses[i + 1] = predicate(row, String(row.value));
    }
  });
  const row = rows[index],
    value = typeof row.value === 'string' ? row.value : 'pending';
  delete row.condition;
  delete row.qualifier;
  delete row.value;
  row.state = state;
  if (['missing', 'unknown', 'disputed'].includes(state)) {
    row.qualifier = state;
    clauses[index + 1] = predicate(row, state);
    if (index === 3) raw.outcome = state;
  } else {
    row.value = value;
    clauses[index + 1] = predicate(row, value);
    if (index === 3) raw.outcome = value;
    if (state === 'conditional') {
      raw.condition = 'if approved';
      row.condition = raw.condition;
      clauses[index + 1] = `If approved, ${clauses[index + 1]}`;
    }
    if (state === 'simulated' || state === 'illustrative') {
      raw.evidence = 'illustrative';
      row.qualifier = state === 'simulated' ? 'simulation' : 'teaching example';
      clauses[index + 1] = `In this ${row.qualifier}, ${clauses[index + 1]}`;
    }
  }
  return rewrite(f, clauses, raw);
}
describe('STEP16 source-only cache freshness and batch/stream', () => {
  it('complete version1 computing raw schemas and no frozen derivations', () => {
    expect(packet.version).toBe(1);
    expect(packet.pack).toBe('computing');
    expect(fixtures).toHaveLength(4);
    for (const seed of packet.stories) {
      expect(seed.words.length).toBeGreaterThan(0);
      expect(seed.window).toBeDefined();
      expect(seed.proposal).toBeDefined();
      expect(expansionStory(seed.id).allowedDerivations).toEqual([]);
    }
  });
  for (const f of fixtures.filter((entry) => entry.negatives.length)) {
    for (const index of [0, 1, 2, 3])
      for (const state of [
        'known',
        'unknown',
        'missing',
        'disputed',
        'conditional',
        'simulated',
        'illustrative',
      ]) {
        const v = variant(f, index, state);
        for (const mode of modes)
          it(`${f.id} preserves ${index}/${state} ${mode} with identity and rebase parity`, () => {
            const { scene, issues } = parse(v, mode);
            expect(scene, issues.join('; ')).not.toBeNull();
            expect(issues).toEqual([]);
            if (!scene) return;
            expect([...scene.records, ...scene.relations][index].qualification.state).toBe(state);
            expect({ ...scene, visualMode: 'hybrid' }).toEqual(parse(v, 'hybrid').scene);
            const shifted = parse(
              {
                ...v,
                words: v.words.map((w) => ({ ...w, start: w.start + 20, end: w.end + 20 })),
                window: { ...v.window, startTime: 20, endTime: 30 },
              },
              mode,
            ).scene;
            expect(shifted).not.toBeNull();
            expect(shifted?.records).toEqual(scene.records);
            expect(shifted?.relations).toEqual(scene.relations);
            if (shifted)
              for (const p of phases) expect(shifted[`${p}At`]).toBeCloseTo(scene[`${p}At`] + 20);
          });
      }
    for (const mode of modes) {
      for (const [field, cap] of [
        ['entities', 9],
        ['records', 13],
        ['relations', 17],
      ] as const)
        it(`${f.id} rejects ${field} overflow ${mode}`, () => {
          const raw = structuredClone(f.proposal);
          raw[field] = Array.from({ length: cap }, () => structuredClone((raw[field] as Rec[])[0]));
          const result = parse(f, mode, raw);
          expect(result.scene).toBeNull();
          expect(result.issues.length).toBeGreaterThan(0);
        });
      for (const value of [NaN, Infinity, -1, 0.2])
        it(`${f.id} rejects invalid word time ${value} ${mode}`, () => {
          const words = structuredClone(f.words);
          words[1].start = value;
          const result = parse({ ...f, words }, mode);
          expect(result.scene).toBeNull();
          expect(result.issues.length).toBeGreaterThan(0);
        });
      it(`${f.id} rejects shortened beat/hold intervals ${mode}`, () => {
        const bad = temporalSourceFixtures([
          {
            ...f,
            negatives: [
              {
                name: 'short gap',
                intervals: [
                  [0.25, 0.6],
                  [0.7, 1.1],
                  [4.25, 5.75],
                  [6.25, 7.75],
                  [9.3, 9.65],
                ],
                edits: [],
              },
            ],
          },
        ])[0].negatives[0];
        const result = parse({ ...f, words: bad.words ?? f.words }, mode, bad.proposal);
        expect(result.scene).toBeNull();
        expect(result.issues.length).toBeGreaterThan(0);
      });
    }
  }
  const batch = fixtures.find((f) => f.id === '66');
  if (!batch) throw new Error('Missing batch source');
  const streamRaw = structuredClone(batch.proposal),
    streamClauses = batch.sourceText.split(/(?<=[.!?])\s+/),
    streamFacts = facts(streamRaw);
  streamFacts[1].value = 'individually';
  streamFacts[2].value = 'per-item';
  streamClauses[2] = predicate(streamFacts[1], 'individually');
  streamClauses[3] = predicate(streamFacts[2], 'per-item');
  const stream = rewrite(batch, streamClauses, streamRaw);
  for (const mode of modes)
    it(`explicit per-item stream ${mode}`, () => {
      const result = parse(stream, mode);
      expect(result.scene, result.issues.join('; ')).not.toBeNull();
      expect(result.issues).toEqual([]);
      expect(result.scene?.records[2].qualification).toEqual({ state: 'known', value: 'per-item' });
    });
  for (const [index, f] of fixtures.entries()) {
    for (const mode of modes) {
      it(`${f.id}/${index} accepts complete positive ${mode}`, () => {
        const { scene, issues } = parse(f, mode);
        expect(scene, issues.join('; ')).not.toBeNull();
        expect(issues).toEqual([]);
        if (!scene) return;
        expect(f.sourceText).toBe(f.words.map((w) => w.text).join(' '));
        expect(f.words[0].start).toBe(f.window.startTime + 0.25);
        expect(f.words.at(-1)?.end).toBe(f.window.endTime - 0.35);
        expect(new Set(Object.values(scene.sourceSpans).map((s) => s.fromWord)).size).toBe(5);
        phases.forEach((p, i) => {
          if (i) expect(scene[`${p}At`] - scene[`${phases[i - 1]}At`]).toBeGreaterThanOrEqual(1);
        });
        expect(f.window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
        for (const fact of [...scene.records, ...scene.relations])
          expect(Object.keys(fact).some((k) => k === 'at' || k.endsWith('At'))).toBe(false);
      });
      for (const negative of f.negatives)
        it(`${f.id}/${index} rejects ${negative.name} ${mode} with diagnostics`, () => {
          const result = parse(
            {
              ...f,
              sourceText: negative.sourceText ?? f.sourceText,
              words: negative.words ?? f.words,
              window: negative.window ?? f.window,
            },
            mode,
            negative.proposal,
          );
          expect(result.scene).toBeNull();
          expect(result.issues.length).toBeGreaterThan(0);
        });
    }
    it(`${f.id}/${index} modes and animation-only time rebase preserve facts`, () => {
      const a = parse(f, 'diagram').scene,
        b = parse(f, 'hybrid').scene;
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect({ ...a, visualMode: 'hybrid' }).toEqual(b);
      const shifted = parse(
        {
          ...f,
          words: f.words.map((w) => ({ ...w, start: w.start + 20, end: w.end + 20 })),
          window: {
            ...f.window,
            startTime: f.window.startTime + 20,
            endTime: f.window.endTime + 20,
          },
        },
        'diagram',
      ).scene;
      expect(shifted).not.toBeNull();
      if (!a || !shifted) return;
      expect(shifted.records).toEqual(a.records);
      expect(shifted.relations).toEqual(a.relations);
      expect(shifted.entities).toEqual(a.entities);
      expect(shifted.sourceSpans).toEqual(a.sourceSpans);
      for (const p of phases) expect(shifted[`${p}At`]).toBeCloseTo(a[`${p}At`] + 20);
    });
  }
});
