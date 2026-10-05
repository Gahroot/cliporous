import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionApprovalDependencyScene } from '../../remotion/compositions/explainer/expansion/relationships/approval-dependency-types';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionApprovalHandoff,
  parseExpansionDependency,
} from './expansion-relationships-approval-dependency-contract';
import { makeParseContext, type PlannerWord, type Rec, type SceneWindow } from './kind-spec';

interface Fixture extends ExpansionSourceFixture {
  readonly name: string;
}
const packet = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/expansion/relationships/approval-dependency.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { version: number; pack: string; stories: Fixture[] };
const MODES = ['diagram', 'hybrid'] as const;
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
function fixture(id: '35' | '36', name = 'canonical'): Fixture {
  const value = packet.stories.find((s) => s.id === id && s.name === name);
  if (!value) throw new Error(`Missing ${id}/${name}`);
  return value;
}
function parse(id: '35' | '36', raw: Rec, words: readonly PlannerWord[], window: SceneWindow) {
  const ctx = makeParseContext(words, window);
  const scene: ExpansionApprovalDependencyScene | null =
    id === '35' ? parseExpansionApprovalHandoff(raw, ctx) : parseExpansionDependency(raw, ctx);
  return { scene, ctx };
}
function positive(f: Pick<Fixture, 'proposal' | 'words' | 'window'>, id: '35' | '36') {
  const diagram = parse(id, { ...f.proposal, visualMode: 'diagram' }, f.words, f.window);
  const hybrid = parse(id, { ...f.proposal, visualMode: 'hybrid' }, f.words, f.window);
  expect(diagram.ctx.issues).toEqual([]);
  expect(hybrid.ctx.issues).toEqual([]);
  expect(diagram.scene).not.toBeNull();
  expect(hybrid.scene).toEqual({ ...diagram.scene, visualMode: 'hybrid' });
  return diagram.scene as ExpansionApprovalDependencyScene;
}
function negative(f: Pick<Fixture, 'proposal' | 'words' | 'window'>, id: '35' | '36') {
  for (const mode of MODES) {
    const raw = { ...f.proposal, visualMode: mode };
    const result = parse(id, raw, f.words, f.window);
    expect(result.scene).toBeNull();
    expect(result.ctx.issues.length).toBeGreaterThan(0);
  }
}
function sourceClauses(f: Pick<Fixture, 'sourceText'>) {
  return f.sourceText.split(/(?<=[.!?;])\s+/u);
}
/** Authored replacement clauses rebase whole evidence; never truncate or relax beat timing. */
function reauthor(f: Fixture, clauses: readonly string[]) {
  const speech = expansionFixtureSpeech(clauses, 10);
  const previous = expansionFixtureSpeech(sourceClauses(f), 10);
  function rebase(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(rebase);
    if (value && typeof value === 'object') {
      const rec = value as Rec;
      if (Object.keys(rec).length === 2 && 'fromWord' in rec && 'toWord' in rec) {
        const index = previous.spans.findIndex(
          (s) => s.fromWord === rec.fromWord && s.toWord === rec.toWord,
        );
        if (index < 0) throw new Error('Reauthor only complete authored clauses');
        return { ...speech.spans[index] };
      }
      return Object.fromEntries(Object.entries(rec).map(([key, entry]) => [key, rebase(entry)]));
    }
    return value;
  }
  const proposal = rebase(f.proposal) as Rec;
  proposal.startWord = 0;
  proposal.endWord = speech.window.endWord;
  BEATS.forEach((field, i) => {
    proposal[field] = speech.spans[i === 4 ? clauses.length - 1 : i].fromWord;
  });
  return { ...speech, proposal };
}
function links(p: Rec, id: '35' | '36'): Rec[] {
  return p[id === '35' ? 'records' : 'relations'] as Rec[];
}

it('persists version-1 real raw positives, independent paraphrases and explicit negative proposals', () => {
  expect(packet.version).toBe(1);
  expect(packet.pack).toBe('relationships');
  expect(packet.stories).toHaveLength(8);
  for (const id of ['35', '36'] as const) {
    const canonical = fixture(id),
      independent = fixture(id, 'paraphrase');
    expect(independent.sourceText).not.toBe(canonical.sourceText);
    expect(independent.proposal.entities).not.toEqual(canonical.proposal.entities);
    expect(
      expansionEntry(canonical.proposal.kind, canonical.proposal.preset)?.allowedDerivations,
    ).toEqual([]);
  }
});

for (const f of packet.stories) {
  const id = f.id as '35' | '36';
  describe(`${id}/${f.name}`, () => {
    it('parses actual diagram and hybrid with complete fact/identity/qualifier/beat parity', () => {
      const before = structuredClone(f);
      const scene = positive(f, id);
      expect(scene.storyId).toBe(id);
      expect(f).toEqual(before);
      expect(scene.entities.map((e) => e.id)).toEqual(
        scene.entities.map((_, i) => expansionEntityId(id, i)),
      );
      expect(scene.entities.map((e) => e.label)).toEqual(
        (f.proposal.entities as Rec[]).map((e) => e.label),
      );
      const retained = scene.storyId === '35' ? scene.records : scene.relations;
      expect(
        retained.map((r) => [
          r.claim,
          r.scope,
          r.period,
          r.state,
          'condition' in r ? r.condition : undefined,
          r.evidence,
        ]),
      ).toEqual(
        links(f.proposal, id).map((r) => [
          r.claim,
          r.scope,
          r.period,
          r.state,
          r.condition,
          r.evidence,
        ]),
      );
      expect(retained.map((r) => r.id)).toEqual(
        retained.map((_, i) => `expansion-${id}-${id === '35' ? 'record' : 'relation'}-${i}`),
      );
      expect(scene.result.id).toBe(`expansion-${id}-result`);
      expect(scene.result.state).toBe((f.proposal.result as Rec).state);
      expect(scene.result.evidence).toEqual((f.proposal.result as Rec).evidence);
      expect(scene.values.map((v) => v.id)).toEqual(
        scene.values.map((_, i) => `expansion-${id}-value-${i}`),
      );
      const authored = expansionFixtureSpeech(sourceClauses(f), 10);
      expect(f.words).toEqual(authored.words);
      expect(f.window).toEqual(authored.window);
      expect(f.words[0].start - f.window.startTime).toBe(0.25);
      expect(f.window.endTime - f.words[f.words.length - 1].end).toBeCloseTo(0.35, 9);
      const at = TIMES.map((t) => scene[t]);
      for (let i = 1; i < at.length; i++)
        expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(1 - 1e-6);
      expect(f.window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
      TIMES.slice(1).forEach((time, i) => {
        expect(scene[time]).toBe(f.words[f.proposal[BEATS[i + 1]] as number].start);
      });
      expect(new Set(BEATS.map((b) => f.proposal[b])).size).toBe(5);
      for (let i = 1; i < f.words.length; i++) {
        expect(f.words[i].start).toBeGreaterThan(f.words[i - 1].start);
        expect(f.words[i].end).toBeGreaterThan(f.words[i - 1].end);
      }
      expect(positive(f, id)).toEqual(scene);
    });
    for (const bad of f.negatives) {
      for (const mode of MODES)
        it(`rejects ${bad.name} in ${mode}`, () => {
          // Preserve malformed visualMode rather than silently repairing that negative proposal.
          const raw = {
            ...bad.proposal,
            visualMode:
              bad.proposal.visualMode === 'diagram' || bad.proposal.visualMode === 'hybrid'
                ? mode
                : bad.proposal.visualMode,
          };
          const before = structuredClone(raw);
          const { scene, ctx } = parse(id, raw, bad.words ?? f.words, bad.window ?? f.window);
          expect(scene).toBeNull();
          expect(ctx.issues.length).toBeGreaterThan(0);
          expect(raw).toEqual(before);
        });
    }
  });
}

for (const state of [
  'allowed',
  'denied',
  'pending',
  'unknown',
  'missing',
  'disputed',
  'conditional',
] as const) {
  it(`retains explicitly supplied ${state} authorization without granting from roles or requests`, () => {
    const f = fixture('35'),
      clauses = sourceClauses(f);
    clauses[2] = clauses[2]
      .replace('pending', state)
      .replace(/\.$/, state === 'conditional' ? ' if safety clears.' : '.');
    const authored = reauthor(f, clauses);
    const records = links(authored.proposal, '35');
    records[1].state = state;
    if (state === 'conditional') records[1].condition = 'if safety clears';
    const scene = positive(authored, '35');
    if (scene.storyId !== '35') throw new Error('Expected approval story');
    expect(scene.records[1].state).toBe(state);
    expect(scene.roles.map((r) => r.type)).toEqual(['owner', 'approver']);
    expect(scene.records[0].state).toBe('known');
    expect(scene.records[2].state).toBe('known');
    expect(scene.result.state).toBe('unresolved');
    if (state === 'unknown') {
      records[1].state = 'denied';
      negative(authored, '35');
    }
  });
}

for (const state of ['unknown', 'missing', 'disputed'] as const) {
  it(`keeps ${state} dependency separate from known transfer/order`, () => {
    const f = fixture('36'),
      clauses = sourceClauses(f);
    clauses[1] = `Rowan reports dependency from Build to Design is ${state} for Harbor during May.`;
    const authored = reauthor(f, clauses),
      records = links(authored.proposal, '36');
    Object.assign(records[0], { claim: 'dependency', state });
    const scene = positive(authored, '36');
    if (scene.storyId !== '36') throw new Error('Expected dependency story');
    expect(scene.relations[0].state).toBe(state);
    expect(scene.relations.slice(1).map((r) => r.type)).toEqual(['transfer', 'order']);
    records[0].state = 'known';
    negative(authored, '36');
  });
}

it('rejects an explicitly sourced dependency cycle, but does not convert transfers into dependencies', () => {
  const f = fixture('36'),
    clauses = sourceClauses(f);
  clauses[2] = 'Rowan states Design depends on Build for Harbor during May.';
  const authored = reauthor(f, clauses),
    records = links(authored.proposal, '36');
  Object.assign(records[1], { type: 'dependency', claim: 'depends on' });
  negative(authored, '36');
  const valid = positive(f, '36');
  if (valid.storyId !== '36') throw new Error('Expected dependency story');
  expect(valid.relations.slice(0, 2).map((r) => [r.type, r.fromId, r.toId])).toEqual([
    ['dependency', valid.entities[2].id, valid.entities[1].id],
    ['transfer', valid.entities[1].id, valid.entities[2].id],
  ]);
});

for (const id of ['35', '36'] as const) {
  it(`${id}: quantities are source-supplied, not derived authority or schedule; quantity edits preserve parser IDs and beat semantics`, () => {
    const f = fixture(id, 'supplied-value'),
      scene = positive(f, id);
    const value = scene.values[0].quantity;
    expect(value.state).toBe('known');
    if (value.state !== 'known') throw new Error('Expected known supplied amount');
    expect(value.amount).toEqual({
      kind: 'rational',
      value: { numerator: id === '35' ? 3 : 2, denominator: 1 },
      notation: id === '35' ? '3' : '2',
    });
    const clauses = sourceClauses(f);
    clauses[4] = clauses[4].replace(
      id === '35' ? '3 count' : '2 hours',
      id === '35' ? '4 count' : '3 hours',
    );
    const authored = reauthor(f, clauses);
    const raw = (authored.proposal.values as Rec[])[0].quantity as Rec;
    ((raw.amount as Rec).value as Rec).numerator = id === '35' ? 4 : 3;
    const edited = positive(authored, id);
    expect(edited.entities).toEqual(scene.entities);
    expect(edited.values[0].id).toBe(scene.values[0].id);
    TIMES.forEach((time) => {
      expect(edited[time]).toBe(scene[time]);
    });
    expect(edited.result).toEqual(scene.result);
    if (scene.storyId === '35' && edited.storyId === '35')
      expect(edited.records).toEqual(scene.records);
    if (scene.storyId === '36' && edited.storyId === '36')
      expect(edited.relations).toEqual(scene.relations);
  });
  for (const state of [
    'unknown',
    'missing',
    'disputed',
    'conditional',
    'simulated',
    'illustrative',
  ] as const) {
    it(`${id}: retains ${state} quantity qualifier without converting it to measured zero`, () => {
      const f = fixture(id, 'supplied-value'),
        clauses = sourceClauses(f);
      const value = id === '35' ? '3 count' : '2 hours',
        unit = id === '35' ? 'count' : 'hours';
      if (state === 'unknown' || state === 'missing')
        clauses[4] = clauses[4].replace(value, `${state} ${unit}`);
      if (state === 'disputed')
        clauses[4] = clauses[4].replace(value, `disputed between 2 and 3 ${unit}`);
      if (state === 'conditional')
        clauses[4] = clauses[4].replace(/\.$/, ' if the report arrives.');
      if (state === 'simulated' || state === 'illustrative')
        clauses[4] = `In this ${state} example, ${clauses[4]}`;
      const authored = reauthor(f, clauses),
        raw = (authored.proposal.values as Rec[])[0].quantity as Rec;
      raw.state = state;
      if (state === 'conditional') raw.condition = 'if the report arrives';
      else
        raw.qualifier =
          state === 'simulated' || state === 'illustrative' ? `${state} example` : state;
      if (state === 'unknown' || state === 'missing' || state === 'disputed') delete raw.amount;
      if (state === 'disputed')
        raw.alternatives = [2, 3].map((numerator) => ({
          kind: 'rational',
          value: { numerator, denominator: 1 },
        }));
      const scene = positive(authored, id);
      expect(scene.values[0].quantity.state).toBe(state);
      expect('amount' in scene.values[0].quantity).toBe(
        state !== 'unknown' && state !== 'missing' && state !== 'disputed',
      );
      if (state !== 'conditional')
        expect('qualifier' in scene.values[0].quantity && scene.values[0].quantity.qualifier).toBe(
          raw.qualifier,
        );
    });
  }
  it(`${id}: rejects real function values without calling them and rejects non-finite/backward source times`, () => {
    const f = fixture(id),
      proposal = structuredClone(f.proposal),
      fn = () => {
        throw new Error('Untrusted function must not execute');
      };
    proposal.label = fn;
    negative({ ...f, proposal }, id);
    proposal.label = f.proposal.label;
    links(proposal, id)[0].state = fn;
    negative({ ...f, proposal }, id);
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const words = structuredClone(f.words);
      words[2].end = value;
      negative({ ...f, words }, id);
    }
    negative({ ...f, window: { ...f.window, endTime: 4.99 } }, id);
  });
}
