import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionIncentiveExternality,
  parseExpansionSupplyChain,
} from './expansion-physical-supply-incentives-contract';
import { type TemporalFixtureSeed, temporalSourceFixtures } from './expansion-temporal-fixtures';
import { makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/expansion/physical/supply-incentives.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { version: number; pack: string; stories: TemporalFixtureSeed[] };
const fixtures = temporalSourceFixtures(packet.stories);
const modes = ['diagram', 'hybrid'] as const;
function parse(f: ExpansionSourceFixture) {
  const ctx = makeParseContext(f.words, f.window);
  return {
    ctx,
    scene: (f.id === '73' ? parseExpansionSupplyChain : parseExpansionIncentiveExternality)(
      f.proposal,
      ctx,
    ),
  };
}
function positive(f: ExpansionSourceFixture) {
  const before = structuredClone(f);
  const results = modes.map((visualMode) =>
    parse({ ...f, proposal: { ...f.proposal, visualMode } }),
  );
  for (const r of results) {
    expect(r.ctx.issues).toEqual([]);
    expect(r.scene).not.toBeNull();
  }
  expect(results[1].scene).toEqual({ ...results[0].scene, visualMode: 'hybrid' });
  expect(f).toEqual(before);
  return results[0].scene;
}
function negative(f: ExpansionSourceFixture) {
  for (const visualMode of modes) {
    const proposal = {
      ...f.proposal,
      visualMode: modes.includes(f.proposal.visualMode as (typeof modes)[number])
        ? visualMode
        : f.proposal.visualMode,
    };
    const r = parse({ ...f, proposal });
    expect(r.scene).toBeNull();
    expect(r.ctx.issues.length).toBeGreaterThan(0);
    expect(r.ctx.issues.length).toBeLessThanOrEqual(4);
  }
}
describe('STEP17 source-only supply/incentives', () => {
  it('rejects array-shaped modes', () => {
    for (const f of fixtures)
      negative({ ...f, proposal: { ...f.proposal, visualMode: ['diagram'] } });
  });
  it('preserves a separately stated exact quantity without deriving any effect', () => {
    for (const f of fixtures) {
      const proposal = structuredClone(f.proposal);
      const texts = f.sourceText.split(/(?<=[.;])\s+/);
      texts.splice(
        4,
        0,
        `${String((proposal.entities as Rec[])[0].label)} output is 2 count during Today among Trial.`,
      );
      const speech = expansionFixtureSpeech(texts, 10);
      const phases = ['setup', 'action', 'response', 'check', 'resolve'];
      const records = proposal.records as Rec[];
      for (const [i, phase] of phases.entries()) {
        const span = speech.spans[i === 4 ? 5 : i];
        proposal[`${phase}Word`] = span.fromWord;
        records[i].evidence = span;
      }
      for (const [i, entity] of (proposal.entities as Rec[]).entries()) {
        const original = (f.proposal.entities as Rec[])[i].evidence as Rec;
        const index = (f.proposal.records as Rec[]).findIndex(
          (r) => (r.evidence as Rec).fromWord === original.fromWord,
        );
        entity.evidence = records[index].evidence;
      }
      for (const [i, relation] of (proposal.relations as Rec[]).entries())
        relation.evidence = records[i].evidence;
      const quantity = {
        actor: (proposal.entities as Rec[])[0].label,
        claim: 'output',
        state: 'known',
        basis: { unit: 'count', period: 'Today', population: 'Trial' },
        amount: { kind: 'rational', value: { numerator: 2, denominator: 1 } },
        evidence: speech.spans[4],
      };
      proposal.quantities = [quantity];
      const scene = positive({ ...f, ...speech, proposal });
      expect(scene?.quantities).toEqual([
        { ...quantity, amount: { ...quantity.amount, notation: '2' } },
      ]);
      expect(scene?.records[4].value).toBe((f.proposal.records as Rec[])[4].value);
      const shifted = positive({
        ...f,
        ...speech,
        proposal,
        words: speech.words.map((w) => ({ ...w, start: w.start + 20, end: w.end + 20 })),
        window: { ...speech.window, startTime: 20, endTime: 30 },
      });
      expect(shifted?.quantities).toEqual(scene?.quantities);
      for (const state of [
        'unknown',
        'missing',
        'disputed',
        'conditional',
        'simulated',
        'illustrative',
      ]) {
        const changed = structuredClone(proposal);
        const q = (changed.quantities as Rec[])[0];
        q.state = state;
        const clauses = [...texts];
        const actor = String(quantity.actor);
        if (state === 'unknown' || state === 'missing') {
          delete q.amount;
          q.qualifier = state;
          clauses[4] = `${actor} output is ${state} count during Today among Trial.`;
        } else if (state === 'disputed') {
          delete q.amount;
          q.alternatives = [
            quantity.amount,
            { kind: 'rational', value: { numerator: 3, denominator: 1 } },
          ];
          q.qualifier = state;
          clauses[4] = `${actor} output is disputed between 2 and 3 count during Today among Trial.`;
        } else if (state === 'conditional') {
          q.condition = 'if reviewed';
          clauses[4] = `${actor} output is 2 count during Today among Trial if reviewed.`;
        } else {
          q.qualifier = `${state} example`;
          clauses[4] = `In this ${state} example, ${actor} output is 2 count during Today among Trial.`;
        }
        const qualifiedSpeech = expansionFixtureSpeech(clauses, 10);
        for (const [i, phase] of phases.entries()) {
          const span = qualifiedSpeech.spans[i === 4 ? 5 : i];
          changed[`${phase}Word`] = span.fromWord;
          (changed.records as Rec[])[i].evidence = span;
          (changed.relations as Rec[])[i].evidence = span;
        }
        for (const [i, e] of (changed.entities as Rec[]).entries()) {
          const old = (f.proposal.entities as Rec[])[i].evidence as Rec;
          const index = (f.proposal.records as Rec[]).findIndex(
            (r) => (r.evidence as Rec).fromWord === old.fromWord,
          );
          e.evidence = (changed.records as Rec[])[index].evidence;
        }
        q.evidence = qualifiedSpeech.spans[4];
        const qualified = positive({ ...f, ...qualifiedSpeech, proposal: changed });
        expect(qualified?.quantities[0].state).toBe(state);
        const promoted = structuredClone(changed);
        const fact = (promoted.quantities as Rec[])[0];
        fact.state = 'known';
        fact.amount = quantity.amount;
        delete fact.condition;
        delete fact.qualifier;
        delete fact.alternatives;
        negative({ ...f, ...qualifiedSpeech, proposal: promoted });
      }
      for (const mutate of [
        (q: Rec) => {
          q.actor = (proposal.entities as Rec[])[1].label;
        },
        (q: Rec) => {
          (q.basis as Rec).unit = 'kilogram';
        },
        (q: Rec) => {
          (q.basis as Rec).period = 'Tomorrow';
        },
        (q: Rec) => {
          (q.basis as Rec).population = 'Other';
        },
        (q: Rec) => {
          (q.basis as Rec).denominator = { numerator: 3, denominator: 1 };
        },
        (q: Rec) => {
          ((q.amount as Rec).value as Rec).numerator = 3;
        },
        (q: Rec) => {
          q.state = 'conditional';
        },
        (q: Rec) => {
          q.operation = 'difference';
        },
      ]) {
        const changed = structuredClone(proposal);
        mutate((changed.quantities as Rec[])[0]);
        negative({ ...f, ...speech, proposal: changed });
      }
      for (const amount of [0, -2, 0.5]) {
        const changed = structuredClone(proposal);
        ((changed.quantities as Rec[])[0].amount as Rec).value = {
          numerator: amount === 0.5 ? 1 : amount,
          denominator: amount === 0.5 ? 2 : 1,
        };
        negative({ ...f, ...speech, proposal: changed });
      }
    }
  });
  it('version1 physical complete positives and independent paraphrases', () => {
    expect(packet.version).toBe(1);
    expect(packet.pack).toBe('physical');
    expect(fixtures).toHaveLength(4);
    for (const f of fixtures) {
      expect(f.sourceText).toBe(f.words.map((w) => w.text).join(' '));
      const scene = positive(f);
      expect(scene?.records).toHaveLength(5);
      expect(scene?.entities.map((e) => e.id)).toEqual([
        `expansion-${f.id}-entity-0`,
        `expansion-${f.id}-entity-1`,
        `expansion-${f.id}-entity-2`,
      ]);
      expect(scene?.records.map((r) => r.id)).toEqual(
        Array.from({ length: 5 }, (_, i) => `expansion-${f.id}-record-${i}`),
      );
    }
  });
  for (const [index, f] of fixtures.entries()) {
    it(`source/domain/ID/animation rebase parity ${index}`, () => {
      const scene = positive(f);
      const shifted = positive({
        ...f,
        words: f.words.map((w) => ({ ...w, start: w.start + 20, end: w.end + 20 })),
        window: { ...f.window, startTime: 20, endTime: 30 },
      });
      if (!scene || !shifted) throw new Error('Expected scene');
      const keys = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
      expect(shifted).toEqual({
        ...scene,
        ...Object.fromEntries(keys.map((k) => [k, scene[k] + 20])),
      });
      expect(shifted.records).toEqual(scene.records);
      expect(shifted.quantities).toEqual(scene.quantities);
    });
    for (const n of f.negatives)
      it(`${f.id} ${n.name} both modes`, () =>
        negative({
          ...f,
          ...n,
          words: n.words ?? f.words,
          window: n.window ?? f.window,
          proposal: n.proposal,
        }));
  }
  for (const f of fixtures) {
    for (const state of [
      'unknown',
      'missing',
      'disputed',
      'conditional',
      'simulated',
      'illustrative',
    ]) {
      it(`${f.id} ${state} survives without promotion in both modes`, () => {
        const value = structuredClone(f);
        const records = value.proposal.records as Rec[];
        const texts = value.sourceText.split(/(?<=[.;])\s+/);
        const record = records[2];
        record.state = state;
        texts[2] = texts[2].replace('with stated state', `with ${state} state`);
        if (state === 'conditional') {
          record.condition = 'if reviewed';
          texts[2] = texts[2].replace(/\.$/, ' if reviewed.');
        }
        if (state === 'simulated' || state === 'illustrative') {
          record.qualifier = 'this example';
          texts[2] = `In this example, ${texts[2]}`;
        }
        const speech = expansionFixtureSpeech(texts, 10);
        const phases = ['setup', 'action', 'response', 'check', 'resolve'];
        for (const [i, span] of speech.spans.entries()) {
          const original = f.proposal.records as Rec[];
          const old = original[i].evidence as { fromWord: number; toWord: number };
          const start = f.words[old.fromWord].start,
            end = f.words[old.toWord].end;
          const count = span.toWord - span.fromWord + 1;
          for (let j = 0; j < count; j++) {
            speech.words[span.fromWord + j].start = start + ((end - start) * j) / count;
            speech.words[span.fromWord + j].end = start + ((end - start) * (j + 1)) / count;
          }
          records[i].evidence = span;
          value.proposal[`${phases[i]}Word`] = span.fromWord;
        }
        for (const [i, e] of (value.proposal.entities as Rec[]).entries()) {
          const original = (f.proposal.entities as Rec[])[i].evidence as Rec;
          const index = (f.proposal.records as Rec[]).findIndex(
            (r) => (r.evidence as Rec).fromWord === original.fromWord,
          );
          e.evidence = speech.spans[index];
        }
        for (const [i, r] of (value.proposal.relations as Rec[]).entries())
          r.evidence = speech.spans[i];
        const scene = positive({ ...value, ...speech });
        expect(scene?.records[2].state).toBe(state);
        expect(scene?.relations[2].state).toBe(state);
        if (state === 'conditional') expect(scene?.relations[2].condition).toBe('if reviewed');
        const promoted = structuredClone(value.proposal);
        (promoted.records as Rec[])[2].state = 'stated';
        negative({ ...value, ...speech, proposal: promoted });
        if (state === 'conditional') expect(scene?.records[2].condition).toBe('if reviewed');
      });
    }
  }
});
