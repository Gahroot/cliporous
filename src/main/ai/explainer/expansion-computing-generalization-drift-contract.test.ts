import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ExpansionGeneralizationDriftScene } from '../../remotion/compositions/explainer/expansion/computing/generalization-drift-types';
import {
  parseExpansionHeldOutGeneralization,
  parseExpansionPopulationDrift,
} from './expansion-computing-generalization-drift-contract';
import type { ExpansionSourceFixture } from './expansion-fixture-words';
import { type TemporalFixtureSeed, temporalSourceFixtures } from './expansion-temporal-fixtures';
import { makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/computing/generalization-drift.source.json',
    'utf8',
  ),
) as { version: number; pack: string; stories: TemporalFixtureSeed[] };
const fixtures = temporalSourceFixtures(packet.stories);
const modes = ['diagram', 'hybrid'] as const;
function parse(f: ExpansionSourceFixture, proposal: Rec = f.proposal) {
  const ctx = makeParseContext(f.words, f.window);
  const scene = (
    f.id === '71' ? parseExpansionHeldOutGeneralization : parseExpansionPopulationDrift
  )(proposal, ctx);
  return { scene, issues: ctx.issues };
}
function positive(f: ExpansionSourceFixture): ExpansionGeneralizationDriftScene {
  const r = parse(f);
  expect(r.issues).toEqual([]);
  expect(r.scene).not.toBeNull();
  if (!r.scene) throw new Error(`Rejected ${f.id}`);
  return r.scene;
}
describe('STEP16 supplied generalization and drift only', () => {
  it('reads the real version1 computing packet with independent paraphrases', () => {
    expect(packet.version).toBe(1);
    expect(packet.pack).toBe('computing');
    expect(fixtures).toHaveLength(4);
  });
  for (const seed of packet.stories) {
    it(`${seed.id}: rejects nonfinite timing and authored-cap excesses`, () => {
      const canonical = temporalSourceFixtures([{ ...seed, paraphrases: [], negatives: [] }])[0];
      for (const invalid of [NaN, Infinity, -Infinity]) {
        for (const visualMode of modes) {
          for (const field of ['start', 'end'] as const) {
            const f = structuredClone(canonical);
            (f.words[1] as { start: number; end: number })[field] = invalid;
            const r = parse(f, { ...f.proposal, visualMode });
            expect(r.scene).toBeNull();
            expect(r.issues.length).toBeGreaterThan(0);
          }
        }
      }
      for (const [field, length] of [
        ['entities', 9],
        ['records', 13],
      ] as const) {
        const p = structuredClone(canonical.proposal);
        p[field] = Array.from({ length }, () => (p[field] as Rec[])[0]);
        for (const visualMode of modes) {
          const r = parse(canonical, { ...p, visualMode });
          expect(r.scene).toBeNull();
          expect(r.issues.length).toBeGreaterThan(0);
        }
      }
    });
  }
  // These are complete raw quantity assertions, materialized with the frozen source editor.
  // Both members keep their own dataset, model, metric, operating condition and basis.
  for (const seed of packet.stories) {
    for (const state of [
      'known',
      'unknown',
      'missing',
      'disputed',
      'conditional',
      'simulated',
      'illustrative',
    ] as const) {
      it(`${seed.id}: retains supplied ${state} results in both modes`, () => {
        const edits: { path: (string | number)[]; value?: unknown; remove?: boolean }[] = [];
        const clauses: Record<string, string> = {};
        const pair =
          seed.id === '71'
            ? [
                ['Train', 'daylight'],
                ['Hold', 'daylight'],
              ]
            : [
                ['Base', 'daylight'],
                ['New', 'night'],
              ];
        for (const [i, [dataset, operatingCondition]] of pair.entries()) {
          const root = ['records', i, 'result'];
          for (const field of ['amount', 'alternatives', 'qualifier', 'condition'])
            edits.push({ path: [...root, field], remove: true });
          edits.push({ path: [...root, 'state'], value: state });
          let value = '-2.50';
          if (state === 'unknown' || state === 'missing') {
            value = state;
            edits.push({ path: [...root, 'qualifier'], value: state });
          } else if (state === 'disputed') {
            value = 'disputed between -2.50 and 3.50';
            edits.push({ path: [...root, 'qualifier'], value: state });
            edits.push({
              path: [...root, 'alternatives'],
              value: [
                { kind: 'rational', value: { numerator: -5, denominator: 2 } },
                { kind: 'rational', value: { numerator: 7, denominator: 2 } },
              ],
            });
          } else {
            edits.push({
              path: [...root, 'amount'],
              value: { kind: 'rational', value: { numerator: -5, denominator: 2 } },
            });
          }
          const teaching = state === 'simulated' || state === 'illustrative';
          if (teaching) edits.push({ path: [...root, 'qualifier'], value: state });
          if (state === 'conditional')
            edits.push({ path: [...root, 'condition'], value: 'if audited' });
          clauses[String(i === 0 ? 2 : 4)] =
            `${teaching ? `In this ${state}, ` : ''}${dataset} Model error under ${operatingCondition} is ${value} percent during June among samples with denominator 100${state === 'conditional' ? ' if audited' : ''}.`;
        }
        if (state === 'simulated' || state === 'illustrative')
          edits.push({ path: ['evidence'], value: 'illustrative' });
        const materialized = temporalSourceFixtures([
          { ...seed, paraphrases: [], negatives: [{ name: state, clauses, edits }] },
        ])[0];
        const supplied = materialized.negatives[0];
        const f = {
          ...materialized,
          words: supplied.words ?? materialized.words,
          window: supplied.window ?? materialized.window,
          proposal: supplied.proposal,
        };
        const reference = positive(f);
        for (const visualMode of modes) {
          const r = parse(f, { ...f.proposal, visualMode });
          expect(r.issues).toEqual([]);
          expect(r.scene).toEqual({ ...reference, visualMode });
          for (const record of r.scene?.records ?? []) {
            expect(record.result.state).toBe(state);
            if (record.result.state === 'unknown' || record.result.state === 'missing')
              expect('amount' in record.result).toBe(false);
            if ('amount' in record.result)
              expect(record.result.amount).toEqual({
                kind: 'rational',
                value: { numerator: -5, denominator: 2 },
                notation: '-2.50',
              });
            if (record.result.state === 'conditional')
              expect(record.result.condition).toBe('if audited');
            if (record.result.state === 'simulated' || record.result.state === 'illustrative')
              expect(record.result.qualifier).toBe(state);
            if (record.result.state === 'disputed')
              expect(record.result.alternatives.map((a) => a.notation)).toEqual(['-2.50', '3.50']);
          }
        }
        // Each distinction fails closed if the supplied state alone is promoted to known.
        if (state !== 'known') {
          const promoted = structuredClone(f.proposal);
          (promoted.records as Rec[])[1].result = {
            ...((promoted.records as Rec[])[1].result as Rec),
            state: 'known',
          };
          for (const visualMode of modes) {
            const r = parse(f, { ...promoted, visualMode });
            expect(r.scene).toBeNull();
            expect(r.issues.length).toBeGreaterThan(0);
          }
        }
      });
    }
  }
  for (const [index, f] of fixtures.entries()) {
    it(`${f.id}/${index}: exact facts and generated identities are mode independent`, () => {
      const before = structuredClone(f);
      const scene = positive(f);
      for (const visualMode of modes) {
        const r = parse(f, { ...f.proposal, visualMode });
        expect(r.issues).toEqual([]);
        expect(r.scene).toEqual({ ...scene, visualMode });
      }
      expect(scene.entities.map((e) => e.id)).toEqual(
        [0, 1, 2].map((i) => `expansion-${f.id}-entity-${i}`),
      );
      expect(scene.records.map((r) => r.id)).toEqual(
        [0, 1].map((i) => `expansion-${f.id}-record-${i}`),
      );
      const rawRecords = f.proposal.records as Rec[];
      for (const [i, record] of scene.records.entries()) {
        const supplied = rawRecords[i];
        const result = structuredClone(supplied.result as Rec);
        if (result.state === 'known')
          result.amount = { ...(result.amount as Rec), notation: i === 0 ? '2.50' : '3.50' };
        expect(record).toEqual({
          id: `expansion-${f.id}-record-${i}`,
          datasetId: `expansion-${f.id}-entity-${i + 1}`,
          sample: supplied.sample,
          role: supplied.role,
          condition: supplied.condition,
          population: supplied.population,
          evidence: supplied.evidence,
          result,
        });
      }
      expect(scene.records.map((r) => r.result.basis.period)).toEqual([scene.period, scene.period]);
      expect(scene.records[1].result.state).toBe(f.id === '71' ? 'known' : 'unknown');
      if (scene.records[1].result.state === 'unknown')
        expect('amount' in scene.records[1].result).toBe(false);
      expect(f).toEqual(before);
      expect(parse(f).scene).toEqual(scene);
    });
    it(`${f.id}/${index}: domain facts are not animation time and survive source-time shifts`, () => {
      const original = positive(f);
      const shifted = {
        ...f,
        words: f.words.map((w) => ({ ...w, start: w.start + 20, end: w.end + 20 })),
        window: { ...f.window, startTime: f.window.startTime + 20, endTime: f.window.endTime + 20 },
      };
      for (const visualMode of modes) {
        const r = parse(shifted, { ...shifted.proposal, visualMode });
        expect(r.issues).toEqual([]);
        const expected = { ...original, visualMode };
        for (const field of ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const)
          expected[field] += 20;
        expect(r.scene).toEqual(expected);
        expect(JSON.stringify(r.scene?.records)).not.toMatch(/"(?:at|\w+At)":/);
      }
    });
    for (const negative of f.negatives) {
      it(`${f.id}/${index}: rejects ${negative.name} with review diagnostics in both modes`, () => {
        for (const visualMode of modes) {
          const r = parse(
            { ...f, words: negative.words ?? f.words, window: negative.window ?? f.window },
            {
              ...negative.proposal,
              visualMode:
                negative.proposal.visualMode === undefined ||
                negative.proposal.visualMode === 'diagram' ||
                negative.proposal.visualMode === 'hybrid'
                  ? visualMode
                  : negative.proposal.visualMode,
            },
          );
          expect(r.scene).toBeNull();
          expect(r.issues.length).toBeGreaterThan(0);
        }
      });
    }
  }
});
