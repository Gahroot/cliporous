import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import {
  parseExpansionDirectionalField,
  parseExpansionEnergyBudget,
} from './expansion-physical-energy-field-contract';
import { type TemporalFixtureSeed, temporalSourceFixtures } from './expansion-temporal-fixtures';
import { makeParseContext } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/expansion/physical/energy-field.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const seeds: readonly TemporalFixtureSeed[] = packet.stories;
const fixtures = temporalSourceFixtures(seeds.map((seed) => ({ ...seed })));
type Fixture = (typeof fixtures)[number];
function parse(f: Fixture, proposal = f.proposal, offset = 0) {
  const ctx = makeParseContext(
    f.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset })),
    { ...f.window, startTime: f.window.startTime + offset, endTime: f.window.endTime + offset },
  );
  const scene =
    f.id === '79'
      ? parseExpansionEnergyBudget(proposal, ctx)
      : parseExpansionDirectionalField(proposal, ctx);
  return { scene, ctx };
}
it('has complete version1 physical sources, independent paraphrases and no approved derivations', () => {
  expect([packet.version, packet.pack]).toEqual([1, 'physical']);
  expect(fixtures).toHaveLength(17);
  for (const f of fixtures) {
    expect(expansionStory(f.id).allowedDerivations).toEqual([]);
    expect(f.words[0].start).toBe(0.25);
    expect(f.window.endTime - f.words[f.words.length - 1].end).toBeCloseTo(0.35, 9);
  }
});
it('covers all seven source loss states and six non-measured teaching parameter states', () => {
  for (const seed of seeds) {
    const examples = temporalSourceFixtures(
      (seed.examples ?? []).map((example) => ({
        ...example,
        negatives: [],
        paraphrases: [],
        examples: [],
      })),
    );
    const expected = ['unknown', 'missing', 'disputed', 'conditional', 'simulated', 'illustrative'];
    if (seed.id === '79') expected.unshift('known');
    const states: string[] = [];
    for (const f of examples) {
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        const result = parse(f, { ...f.proposal, visualMode });
        expect(result.ctx.issues).toEqual([]);
        expect(result.scene).not.toBeNull();
        if (!result.scene) throw new Error('source state scene required');
        const index = f.id === '79' ? 2 : 1;
        const raw = f.proposal.records as { quantity: Record<string, unknown> }[];
        const q = result.scene.records[index].quantity;
        expect(q).toMatchObject(raw[index].quantity);
        if (visualMode === 'diagram') states.push(q.state);
        if ('amount' in q) expect(q.amount.notation).toBe('+20.50');
        if (q.state === 'disputed')
          expect(q.alternatives.map((a) => a.notation)).toEqual(['20.50', '21.25']);
        if (q.state === 'missing' || q.state === 'unknown') {
          expect(q).not.toHaveProperty('amount');
          expect(q).not.toHaveProperty('alternatives');
        }
        const source = f.words
          .slice(q.evidence.fromWord, q.evidence.toWord + 1)
          .map((w) => w.text)
          .join(' ');
        expect(f.sourceText).toContain(source);
        expect(Object.values(result.scene.sourceSpans).join(' ')).toBe(f.sourceText);
        expect(source).toContain(q.actor);
        expect(source).toContain(q.claim);
        expect(result.scene.records).toHaveLength(f.id === '79' ? 3 : 2);
        expect(result.scene).not.toHaveProperty('derived');
        expect(result.scene).not.toHaveProperty('efficiency');
        expect(result.scene).not.toHaveProperty('balance');
        expect(result.scene).not.toHaveProperty('permission');
        expect(q).not.toHaveProperty('result');
        expect(q).not.toHaveProperty('at');
        expect(q.basis).not.toHaveProperty('periodAt');
      }
    }
    expect(states.sort()).toEqual(expected.sort());
  }
});
it('rejects state promotion, changed conditions and fabricated derivations on source-positive states', () => {
  for (const seed of seeds) {
    const examples = temporalSourceFixtures(
      (seed.examples ?? []).map((example) => ({
        ...example,
        negatives: [],
        paraphrases: [],
        examples: [],
      })),
    );
    for (const f of examples) {
      const index = f.id === '79' ? 2 : 1;
      const raw = f.proposal.records as { quantity: Record<string, unknown> }[];
      const q = raw[index].quantity;
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        const records = raw.map((record, i) =>
          i === index
            ? { quantity: { ...record.quantity, state: q.state === 'known' ? 'unknown' : 'known' } }
            : { ...record },
        );
        const promoted = parse(f, { ...f.proposal, records, visualMode });
        expect(promoted.scene).toBeNull();
        expect(promoted.ctx.issues.length).toBeGreaterThan(0);
        if (q.state === 'conditional') {
          const changed = raw.map((record, i) =>
            i === index
              ? { quantity: { ...record.quantity, condition: 'if disabled' } }
              : { ...record },
          );
          const result = parse(f, { ...f.proposal, records: changed, visualMode });
          expect(result.scene).toBeNull();
          expect(result.ctx.issues.length).toBeGreaterThan(0);
        }
        for (const field of ['loss', 'balance', 'efficiency', 'permission', 'derived']) {
          const result = parse(f, { ...f.proposal, [field]: 0, visualMode });
          expect(result.scene).toBeNull();
          expect(result.ctx.issues.length).toBeGreaterThan(0);
        }
      }
    }
  }
});
for (const f of fixtures) {
  it(`${f.id}: identical retained facts in both modes and source-time rebasing`, () => {
    const before = structuredClone(f);
    const a = parse(f, { ...f.proposal, visualMode: 'diagram' }),
      b = parse(f, { ...f.proposal, visualMode: 'hybrid' });
    expect(a.ctx.issues).toEqual([]);
    expect(a.scene).not.toBeNull();
    expect(b.ctx.issues).toEqual([]);
    expect(b.scene).toEqual({ ...a.scene, visualMode: 'hybrid' });
    expect(f).toEqual(before);
    const shifted = parse(f, f.proposal, 20).scene;
    expect(shifted).not.toBeNull();
    if (!a.scene || !shifted) throw new Error('scene required');
    expect(shifted.records).toEqual(a.scene.records);
    expect(shifted.relations).toEqual(a.scene.relations);
    expect(shifted.sourceSpans).toEqual(a.scene.sourceSpans);
    for (const phase of ['setup', 'action', 'response', 'check', 'resolve'] as const)
      expect(shifted[`${phase}At`]).toBeCloseTo(a.scene[`${phase}At`] + 20, 9);
    expect(a.scene.records.map((r) => r.id)).toEqual(
      a.scene.records.map((_, i) => `expansion-${f.id}-record-${i}`),
    );
    if (a.scene.storyId === '80')
      expect([a.scene.domain, shifted.storyId === '80' && shifted.domain]).toEqual([
        'teaching-plane',
        'teaching-plane',
      ]);
  });
  for (const n of f.negatives)
    for (const mode of ['diagram', 'hybrid'])
      it(`${f.id}/${mode}: rejects ${n.name} with diagnostics`, () => {
        const r = parse(
          { ...f, words: n.words ?? f.words, window: n.window ?? f.window },
          { ...n.proposal, visualMode: n.proposal.visualMode === 'invalid' ? 'invalid' : mode },
        );
        expect(r.scene).toBeNull();
        expect(r.ctx.issues.length).toBeGreaterThan(0);
      });
}
