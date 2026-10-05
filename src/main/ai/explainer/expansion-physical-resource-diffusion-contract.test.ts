import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ExpansionSourceFixture } from './expansion-fixture-words';
import {
  parseExpansionDiffusionFilter,
  parseExpansionSharedResource,
} from './expansion-physical-resource-diffusion-contract';
import { type TemporalFixtureSeed, temporalSourceFixtures } from './expansion-temporal-fixtures';
import { makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/physical/resource-diffusion.source.json',
    'utf8',
  ),
) as { version: number; pack: string; stories: TemporalFixtureSeed[] };
const fixtures = temporalSourceFixtures(packet.stories);
function parse(f: ExpansionSourceFixture, raw: Rec = f.proposal) {
  const ctx = makeParseContext(f.words, f.window);
  const scene = (f.id === '75' ? parseExpansionSharedResource : parseExpansionDiffusionFilter)(
    raw,
    ctx,
  );
  return { scene, issues: ctx.issues };
}
describe('STEP17 shared resource and qualitative diffusion only', () => {
  it('reads version1 physical raw packets and independent paraphrases', () => {
    expect(packet.version).toBe(1);
    expect(packet.pack).toBe('physical');
    expect(fixtures).toHaveLength(4);
  });
  for (const [index, f] of fixtures.entries()) {
    it(`${f.id}/${index}: identical facts, source, qualifications and stable IDs in both modes`, () => {
      const before = structuredClone(f);
      const reference = parse(f);
      expect(reference.issues).toEqual([]);
      expect(reference.scene).not.toBeNull();
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        const r = parse(f, { ...f.proposal, visualMode });
        expect(r.issues).toEqual([]);
        expect(r.scene).toEqual({ ...reference.scene, visualMode });
        expect(r.scene?.entities.map((e) => e.id)).toEqual(
          r.scene?.entities.map((_, i) => `expansion-${f.id}-entity-${i}`),
        );
        expect(r.scene?.records.map((r) => r.id)).toEqual(
          r.scene?.records.map((_, i) => `expansion-${f.id}-record-${i}`),
        );
        expect(r.scene?.records[0].quantity).toMatchObject({
          actor: f.id === '75' ? 'Pool' : 'Dye',
          claim: f.id === '75' ? 'limit' : 'inventory',
          basis: {
            period: 'June',
            population: 'batch',
            denominator: { numerator: 10, denominator: 1 },
          },
        });
      }
      expect(f).toEqual(before);
      expect(parse(f)).toEqual(reference);
    });
    it(`${f.id}/${index}: domain quantities and relations survive animation rebasing`, () => {
      const reference = parse(f).scene;
      expect(reference).not.toBeNull();
      if (!reference) throw new Error('Missing scene');
      const shifted = {
        ...f,
        words: f.words.map((w) => ({ ...w, start: w.start + 20, end: w.end + 20 })),
        window: { ...f.window, startTime: f.window.startTime + 20, endTime: f.window.endTime + 20 },
      };
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        const expected = { ...reference, visualMode };
        for (const field of ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const)
          expected[field] += 20;
        const r = parse(shifted, { ...shifted.proposal, visualMode });
        expect(r.issues).toEqual([]);
        expect(r.scene).toEqual(expected);
        expect(JSON.stringify(r.scene?.records)).not.toMatch(/"(?:at|\w+At)":/);
        expect(JSON.stringify(r.scene?.relations)).not.toMatch(/"(?:at|\w+At)":/);
      }
    });
    for (const n of f.negatives) {
      it(`${f.id}/${index}: rejects ${n.name} with diagnostics in both modes`, () => {
        for (const mode of ['diagram', 'hybrid'] as const) {
          const r = parse(
            { ...f, words: n.words ?? f.words, window: n.window ?? f.window },
            {
              ...n.proposal,
              visualMode:
                n.proposal.visualMode === 'diagram' || n.proposal.visualMode === 'hybrid'
                  ? mode
                  : n.proposal.visualMode,
            },
          );
          expect(r.scene).toBeNull();
          expect(r.issues.length).toBeGreaterThan(0);
        }
      });
    }
    it(`${f.id}/${index}: strict string fields and finite positive word/window intervals`, () => {
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        for (const field of [
          'transition',
          'kind',
          'preset',
          'visualMode',
          'template',
          'period',
          'population',
        ] as const) {
          const r = parse(f, {
            ...f.proposal,
            visualMode,
            [field]: [field === 'transition' ? 'fade' : f.proposal[field]],
          });
          expect(r.scene).toBeNull();
          expect(r.issues.length).toBeGreaterThan(0);
        }
        for (const invalid of [NaN, Infinity, -Infinity]) {
          for (const field of ['start', 'end'] as const) {
            const words = f.words.map((w, i) => (i === 1 ? { ...w, [field]: invalid } : w));
            const r = parse({ ...f, words }, { ...f.proposal, visualMode });
            expect(r.scene).toBeNull();
            expect(r.issues.length).toBeGreaterThan(0);
          }
        }
        for (const endTime of [4.9, 12.1, NaN, Infinity]) {
          const r = parse(
            { ...f, window: { ...f.window, endTime } },
            { ...f.proposal, visualMode },
          );
          expect(r.scene).toBeNull();
          expect(r.issues.length).toBeGreaterThan(0);
        }
      }
    });
  }
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
      it(`${seed.id}: supplied inventory/request ${state} is distinct from known zero in both modes`, () => {
        const edits: { path: (string | number)[]; value?: unknown; remove?: boolean }[] = [];
        const clauses: Record<string, string> = {};
        const entries =
          seed.id === '75'
            ? ([
                ['Pool', 'limit', 1],
                ['Ada', 'Pool request', 2],
              ] as const)
            : ([['Dye', 'inventory', 1]] as const);
        for (const [i, [actor, claim, clause]] of entries.entries()) {
          const root = ['records', i, 'quantity'];
          for (const field of ['amount', 'alternatives', 'qualifier', 'condition'])
            edits.push({ path: [...root, field], remove: true });
          edits.push({ path: [...root, 'state'], value: state });
          let value = '3';
          if (state === 'unknown' || state === 'missing') {
            value = state;
            edits.push({ path: [...root, 'qualifier'], value: state });
          } else if (state === 'disputed') {
            value = 'disputed between 3 and 4';
            edits.push({ path: [...root, 'qualifier'], value: state });
            edits.push({
              path: [...root, 'alternatives'],
              value: [3, 4].map((numerator) => ({
                kind: 'rational',
                value: { numerator, denominator: 1 },
              })),
            });
          } else {
            edits.push({
              path: [...root, 'amount'],
              value: { kind: 'rational', value: { numerator: 3, denominator: 1 } },
            });
          }
          const teaching = state === 'illustrative' || state === 'simulated';
          if (teaching) edits.push({ path: [...root, 'qualifier'], value: state });
          if (state === 'conditional')
            edits.push({ path: [...root, 'condition'], value: 'if audited' });
          clauses[String(clause)] =
            `${teaching ? `In this ${state}, ` : ''}${actor} ${claim} is ${value} ${seed.id === '75' ? 'count' : 'gram'} during June among batch with denominator 10${state === 'conditional' ? ' if audited' : ''}.`;
        }
        if (state === 'simulated' || state === 'illustrative')
          edits.push({ path: ['evidence'], value: 'illustrative' });
        const base = temporalSourceFixtures([
          { ...seed, paraphrases: [], negatives: [{ name: state, clauses, edits }] },
        ])[0];
        const n = base.negatives[0];
        const f = {
          ...base,
          words: n.words ?? base.words,
          window: n.window ?? base.window,
          proposal: n.proposal,
        };
        const reference = parse(f);
        expect(reference.issues).toEqual([]);
        expect(reference.scene).not.toBeNull();
        for (const visualMode of ['diagram', 'hybrid'] as const) {
          const r = parse(f, { ...f.proposal, visualMode });
          expect(r.issues).toEqual([]);
          expect(r.scene).toEqual({ ...reference.scene, visualMode });
          for (const record of r.scene?.records ?? []) {
            expect(record.quantity.state).toBe(state);
            if (state === 'unknown' || state === 'missing')
              expect('amount' in record.quantity).toBe(false);
            if ('amount' in record.quantity)
              expect(record.quantity.amount).toEqual({
                kind: 'rational',
                value: { numerator: 3, denominator: 1 },
                notation: '3',
              });
            if (record.quantity.state === 'conditional')
              expect(record.quantity.condition).toBe('if audited');
            if ('qualifier' in record.quantity) expect(record.quantity.qualifier).toBe(state);
            if (record.quantity.state === 'disputed')
              expect(record.quantity.alternatives.map((a) => a.notation)).toEqual(['3', '4']);
          }
          if (state !== 'known') {
            const promoted = structuredClone(f.proposal);
            ((promoted.records as Rec[])[0].quantity as Rec).state = 'known';
            const rejected = parse(f, { ...promoted, visualMode });
            expect(rejected.scene).toBeNull();
            expect(rejected.issues.length).toBeGreaterThan(0);
          }
        }
      });
    }
  }
});
