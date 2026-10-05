import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONCEPT_FIXTURE_PADDING } from '../../remotion/compositions/explainer/concepts/fixture-words';
import {
  EXPANSION_TOPOLOGY_TEMPLATES,
  type ExpansionSetsTopologyScene,
} from '../../remotion/compositions/explainer/expansion/relationships/sets-topology-types';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import { isDerivationAllowed } from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  EXPANSION_DERIVATIONS,
  type ExpansionEvidenceSpan,
} from '../../remotion/compositions/explainer/expansion/value-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionSetOperations,
  parseExpansionTopology,
} from './expansion-relationships-sets-topology-contract';
import { isRec, makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/relationships/sets-topology.source.json',
    'utf8',
  ),
) as {
  version: number;
  pack: string;
  timing: {
    durationSec: number;
    clauseStarts: number[];
    interClausePauseSec: number;
    leadInSec: number;
    tailSec: number;
  };
  stories: ExpansionSourceFixture[];
  paraphrases: ExpansionSourceFixture[];
};
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
const modes = ['diagram', 'hybrid'] as const;
const allSources = [...packet.stories, ...packet.paraphrases];
function object(raw: unknown): Rec {
  if (!isRec(raw)) throw new Error('Actual raw source object required');
  return raw;
}
function rows(raw: unknown): Rec[] {
  if (!Array.isArray(raw) || !raw.every(isRec)) throw new Error('Actual raw source rows required');
  return raw;
}
function fixture(id: '39' | '40'): ExpansionSourceFixture {
  const f = packet.stories.find((s) => s.id === id);
  if (!f) throw new Error(`Missing canonical source ${id}`);
  return f;
}
function parse(f: ExpansionSourceFixture, p = f.proposal) {
  const ctx = makeParseContext(f.words, f.window);
  const scene =
    f.id === '39' ? parseExpansionSetOperations(p, ctx) : parseExpansionTopology(p, ctx);
  return { scene, ctx };
}
function positive(f: ExpansionSourceFixture): ExpansionSetsTopologyScene {
  const r = parse(f);
  expect(r.ctx.issues).toEqual([]);
  expect(r.scene).not.toBeNull();
  if (!r.scene) throw new Error(`Rejected actual positive ${f.id}`);
  return r.scene;
}
function parity(f: ExpansionSourceFixture): ExpansionSetsTopologyScene {
  const before = structuredClone(f),
    scene = positive(f);
  for (const visualMode of modes) {
    const r = parse(f, { ...f.proposal, visualMode });
    expect(r.ctx.issues).toEqual([]);
    expect(r.scene).toEqual({ ...scene, visualMode });
  }
  expect(parse(f).scene).toEqual(scene);
  expect(parse(f, structuredClone(f.proposal)).scene).toEqual(scene);
  expect(parse(f, { ...f.proposal, layout: 'stack-flipped' }).scene).toEqual(scene);
  expect(f).toEqual(before);
  return scene;
}
function text(f: ExpansionSourceFixture, span: ExpansionEvidenceSpan): string {
  return f.words
    .slice(span.fromWord, span.toWord + 1)
    .map((w) => w.text)
    .join(' ');
}
function source(f: ExpansionSourceFixture) {
  const spans: ExpansionEvidenceSpan[] = [];
  let start = 0;
  for (const [i, w] of f.words.entries()) {
    if (/[.!?;][”"’')\]]*$/.test(w.text)) {
      spans.push({ fromWord: start, toWord: i });
      start = i + 1;
    }
  }
  if (start !== f.words.length) throw new Error('Complete source clauses required');
  return { spans, clauses: spans.map((s) => text(f, s)) };
}
/** Use the shared production-padded speech helper, with explicit authored clause pauses. */
function authoredSpeech(clauses: readonly string[]) {
  const speech = expansionFixtureSpeech(clauses, packet.timing.durationSec);
  const words = speech.words.map((w) => ({ ...w }));
  for (const [i, span] of speech.spans.entries()) {
    const start = packet.timing.clauseStarts[i];
    const end =
      i === speech.spans.length - 1
        ? packet.timing.durationSec - packet.timing.tailSec
        : packet.timing.clauseStarts[i + 1] - packet.timing.interClausePauseSec;
    const count = span.toWord - span.fromWord + 1;
    for (let j = 0; j < count; j++) {
      words[span.fromWord + j].start = Number((start + (j * (end - start)) / count).toFixed(9));
      words[span.fromWord + j].end = Number((start + ((j + 1) * (end - start)) / count).toFixed(9));
    }
  }
  return { ...speech, words };
}
function rewrite(
  f: ExpansionSourceFixture,
  clauses: readonly string[],
  change: (p: Rec) => void = () => {},
): ExpansionSourceFixture {
  const old = source(f),
    speech = authoredSpeech(clauses);
  function remap(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(remap);
    if (!isRec(v)) return v;
    if (Object.keys(v).length === 2 && 'fromWord' in v && 'toWord' in v) {
      const i = old.spans.findIndex((s) => s.fromWord === v.fromWord && s.toWord === v.toWord);
      if (!speech.spans[i]) throw new Error('Full source span required');
      return { ...speech.spans[i] };
    }
    return Object.fromEntries(Object.entries(v).map(([k, value]) => [k, remap(value)]));
  }
  const p = object(remap(f.proposal));
  for (const [i, beat] of BEATS.entries()) p[beat] = speech.spans[i].fromWord;
  p.startWord = 0;
  p.endWord = speech.window.endWord;
  change(p);
  return { ...f, ...speech, proposal: p };
}
function facts(r: Rec, fields: readonly string[]): Rec {
  return Object.fromEntries(fields.filter((k) => r[k] !== undefined).map((k) => [k, r[k]]));
}
function exact(f: ExpansionSourceFixture, scene: ExpansionSetsTopologyScene) {
  const p = f.proposal;
  const entities = rows(p.entities).map((e, i) => ({
    id: expansionEntityId(f.id, i),
    label: e.label,
    evidence: e.evidence,
  }));
  function id(raw: unknown): string {
    const e = entities.find((v) => v.label === raw);
    if (!e) throw new Error('Declared entity required');
    return e.id;
  }
  const expected: Rec = {
    ...facts(p, [
      'visualMode',
      'evidence',
      'label',
      'subject',
      'outcome',
      'condition',
      'scope',
      'period',
      'template',
    ]),
    storyId: f.id,
    kind: p.kind,
    preset: p.preset,
    entities,
  };
  for (const [i, beat] of BEATS.entries()) {
    const index = p[beat];
    if (typeof index !== 'number') throw new Error('Actual word beat required');
    expected[TIMES[i]] = i === 0 ? f.window.startTime + 0.3 : f.words[index].start;
  }
  if (scene.storyId === '39') {
    const o = object(p.operation),
      s = object(p.selection);
    Object.assign(expected, {
      memberIds: (p.members as string[]).map(id),
      setIds: (p.sets as string[]).map(id),
      memberships: rows(p.memberships).map((r, i) => ({
        id: `expansion-39-membership-${i}`,
        memberId: id(r.member),
        setId: id(r.set),
        ...facts(r, ['state', 'membership', 'qualification', 'condition', 'evidence']),
      })),
      operation: { kind: o.kind, leftId: id(o.left), rightId: id(o.right), evidence: o.evidence },
      selection:
        s.state === 'complete'
          ? { state: 'complete', memberIds: (s.members as string[]).map(id), evidence: s.evidence }
          : { state: 'unresolved', qualification: s.qualification, evidence: s.evidence },
    });
  } else {
    const failure = object(p.failure),
      result = object(p.result);
    const edgeIndex = rows(p.edges).findIndex(
      (e) => e.from === failure.from && e.to === failure.to && e.role === failure.role,
    );
    Object.assign(expected, {
      edges: rows(p.edges).map((r, i) => ({
        id: `expansion-40-edge-${i}`,
        fromId: id(r.from),
        toId: id(r.to),
        ...facts(r, ['role', 'state', 'status', 'qualification', 'condition', 'evidence']),
      })),
      failure: {
        id: 'expansion-40-failure-0',
        edgeId: `expansion-40-edge-${edgeIndex}`,
        state: 'conditional',
        condition: failure.condition,
        effect: failure.effect,
        evidence: failure.evidence,
      },
      result: {
        actorId: id(result.actor),
        ...facts(result, ['claim', 'state', 'result', 'qualification', 'condition', 'evidence']),
      },
    });
  }
  expect(scene).toEqual(expected);
}

describe('step12 supplied set operations and frozen authored topology', () => {
  it('persists two canonical positives, independent paraphrases and explicit raw negative packets', () => {
    expect([packet.version, packet.pack]).toEqual([1, 'relationships']);
    expect(packet.stories.map((f) => [f.id, f.negatives.length])).toEqual([
      ['39', 78],
      ['40', 87],
    ]);
    expect(packet.paraphrases.map((f) => [f.id, f.negatives.length])).toEqual([
      ['39', 7],
      ['40', 5],
    ]);
    expect(packet.timing.durationSec).toBe(12);
    expect(packet.timing.leadInSec).toBe(CONCEPT_FIXTURE_PADDING.leadInSec);
    expect(packet.timing.tailSec).toBe(CONCEPT_FIXTURE_PADDING.tailSec);
    for (const f of allSources) {
      const s = source(f),
        authored = authoredSpeech(s.clauses);
      expect(s.clauses).toHaveLength(5);
      expect(f.sourceText).toBe(f.words.map((w) => w.text).join(' '));
      expect(f.words).toEqual(authored.words);
      expect(f.window).toEqual(authored.window);
      expect(f.words[0].start).toBe(0.25);
      expect(f.words.at(-1)?.end).toBe(11.65);
      expect(new Set(f.negatives.map((n) => n.name)).size).toBe(f.negatives.length);
      for (let i = 0; i < 4; i++) {
        const pause = f.words[s.spans[i + 1].fromWord].start - f.words[s.spans[i].toWord].end;
        expect(pause).toBeCloseTo(0.2, 9);
      }
    }
    expect(packet.paraphrases.map((f) => f.sourceText)).not.toEqual(
      packet.stories.map((f) => f.sourceText),
    );
  });
  for (const [index, f] of allSources.entries()) {
    it(`${f.id}/${index}: both modes preserve every supplied fact, source span, ID, condition and beat time`, () => {
      const scene = parity(f);
      exact(f, scene);
      for (let i = 1; i < TIMES.length; i++)
        expect(scene[TIMES[i]] - scene[TIMES[i - 1]]).toBeGreaterThanOrEqual(1);
      expect(f.window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
      for (const field of [
        'derived',
        'count',
        'winner',
        'connectivity',
        'resilience',
        'coordinates',
        'camera',
      ])
        expect(scene).not.toHaveProperty(field);
    });
    it(`${f.id}/${index}: absolute source-time translation moves only beat times, not identities or facts`, () => {
      const offset = 17.25,
        original = positive(f);
      const shifted = {
        ...f,
        words: f.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset })),
        window: {
          ...f.window,
          startTime: f.window.startTime + offset,
          endTime: f.window.endTime + offset,
        },
      };
      const scene = parity(shifted);
      expect(scene).toEqual({
        ...original,
        ...Object.fromEntries(TIMES.map((t) => [t, original[t] + offset])),
      });
      exact(shifted, scene);
    });
    for (const n of f.negatives) {
      for (const mode of modes) {
        it(`${f.id}/${index}: rejects ${n.name} (${mode})`, () => {
          const p = structuredClone(n.proposal);
          if (p.visualMode === 'diagram' || p.visualMode === 'hybrid') p.visualMode = mode;
          const local = {
            ...f,
            words: n.words ?? f.words,
            window: n.window ?? f.window,
            sourceText: n.sourceText ?? f.sourceText,
          };
          expect(local.words.map((w) => w.text).join(' ')).toBe(local.sourceText);
          const r = parse(local, p);
          expect(r.scene, `${f.id}/${n.name}/${mode}`).toBeNull();
          expect(r.ctx.issues.length).toBeGreaterThan(0);
          expect(r.ctx.issues.length).toBeLessThanOrEqual(4);
        });
      }
    }
  }
  it('neither catalog route authorizes any shared quantity derivation', () => {
    for (const id of ['39', '40'] as const)
      for (const operation of EXPANSION_DERIVATIONS)
        expect(isDerivationAllowed(id, operation)).toBe(false);
  });
  it('unknown membership stays an explicit record, not excluded, and unresolved selection has no computed members', () => {
    const f = fixture('39'),
      scene = parity(f);
    if (scene.storyId !== '39') throw new Error('Set scene required');
    expect(scene.memberships[3]).toEqual({
      id: 'expansion-39-membership-3',
      memberId: 'expansion-39-entity-1',
      setId: 'expansion-39-entity-3',
      state: 'unknown',
      qualification: 'unknown',
      evidence: object(rows(f.proposal.memberships)[3]).evidence,
    });
    expect(scene.memberships[3]).not.toHaveProperty('membership');
    expect(scene.selection).toEqual({
      state: 'unresolved',
      qualification: 'unresolved',
      evidence: object(f.proposal.selection).evidence,
    });
    expect(scene.selection).not.toHaveProperty('memberIds');
  });
  it('sparse omitted membership is not auto-populated or treated as excluded even with a known selectable member', () => {
    const f = fixture('39'),
      cs = source(f).clauses;
    cs[2] = 'Ben belongs to Drivers for crews in May.';
    const local = rewrite(f, cs, (p) => rows(p.memberships).pop()),
      scene = parity(local);
    exact(local, scene);
    if (scene.storyId !== '39') throw new Error('Set scene required');
    expect(scene.memberships).toHaveLength(3);
    expect(
      scene.memberships.some(
        (m) => m.memberId === 'expansion-39-entity-1' && m.setId === 'expansion-39-entity-3',
      ),
    ).toBe(false);
    expect(scene.selection.state).toBe('unresolved');
  });
  for (const state of ['unknown', 'missing', 'disputed'] as const) {
    it(`39 retains source-${state} membership without false exclusion`, () => {
      const f = fixture('39'),
        cs = source(f).clauses;
      cs[2] = cs[2].replace('unknown', state);
      const local = rewrite(f, cs, (p) =>
          Object.assign(rows(p.memberships)[3], { state, qualification: state }),
        ),
        scene = parity(local);
      exact(local, scene);
      if (scene.storyId !== '39') throw new Error('Set scene required');
      expect(scene.memberships[3].state).toBe(state);
      expect(scene.memberships[3]).not.toHaveProperty('membership');
      expect(scene.selection.state).toBe('unresolved');
    });
  }
  for (const operation of ['intersection', 'union', 'exclusion'] as const) {
    it(`39 validates an explicitly supplied complete ${operation}, without emitting a derived result`, () => {
      const f = fixture('39'),
        cs = source(f).clauses;
      const phrase =
        operation === 'exclusion'
          ? 'exclusion of Drivers minus Medics'
          : `${operation} of Drivers and Medics`;
      const members =
        operation === 'intersection' ? ['Ada'] : operation === 'union' ? ['Ada', 'Ben'] : ['Ben'];
      const labels = members.join(' and ');
      cs[2] = 'Ben belongs to Drivers and Ben does not belong to Medics for crews in May.';
      cs[3] = `Roster requests the ${phrase} for crews in May.`;
      cs[4] = `The ${phrase} contains only ${labels} for crews in May.`;
      const local = rewrite(f, cs, (p) => {
          const r = rows(p.memberships)[3];
          r.state = 'known';
          r.membership = 'excluded';
          delete r.qualification;
          object(p.operation).kind = operation;
          p.selection = { state: 'complete', members, evidence: object(p.selection).evidence };
          p.outcome = 'contains only';
        }),
        scene = parity(local);
      exact(local, scene);
      if (scene.storyId !== '39') throw new Error('Set scene required');
      expect(scene.selection).toEqual({
        state: 'complete',
        memberIds: members.map((m) =>
          m === 'Ada' ? 'expansion-39-entity-0' : 'expansion-39-entity-1',
        ),
        evidence: object(local.proposal.selection).evidence,
      });
      expect(scene.selection).not.toHaveProperty('derived');
    });
  }
  it('39 retains conditional membership on the source clause without making selection complete', () => {
    const f = fixture('39'),
      cs = source(f).clauses;
    cs[1] = `If a permit arrives, ${cs[1]}`;
    const local = rewrite(f, cs, (p) => {
        p.condition = 'If a permit arrives';
        for (const r of rows(p.memberships).slice(0, 2))
          Object.assign(r, { state: 'conditional', condition: p.condition });
      }),
      scene = parity(local);
    exact(local, scene);
    if (scene.storyId !== '39') throw new Error('Set scene required');
    expect(scene.memberships[0]).toMatchObject({
      state: 'conditional',
      condition: 'If a permit arrives',
    });
    expect(scene.selection.state).toBe('unresolved');
  });
  for (const state of ['illustrative', 'simulated'] as const) {
    it(`39 preserves ${state} membership as qualified, not observed`, () => {
      const f = fixture('39'),
        cs = source(f).clauses,
        qualification = state === 'illustrative' ? 'teaching example' : 'simulation';
      cs[1] = `In this ${qualification}, Ada belongs to Drivers and in this ${qualification}, Ada belongs to Medics for crews in May.`;
      const local = rewrite(f, cs, (p) => {
          p.evidence = 'illustrative';
          for (const r of rows(p.memberships).slice(0, 2))
            Object.assign(r, { state, qualification });
        }),
        scene = parity(local);
      exact(local, scene);
      if (scene.storyId !== '39') throw new Error('Set scene required');
      expect(scene.memberships[0].state).toBe(state);
      expect(scene.selection.state).toBe('unresolved');
    });
  }
  it('40 preserves current known edges, explicit unknown edge, conditional failure and unresolved source outcome separately', () => {
    const f = fixture('40'),
      scene = parity(f);
    if (scene.storyId !== '40') throw new Error('Topology scene required');
    expect(scene.edges.map((e) => [e.state, e.status])).toEqual([
      ['known', 'present'],
      ['known', 'present'],
      ['unknown', undefined],
    ]);
    expect(scene.failure).toEqual({
      id: 'expansion-40-failure-0',
      edgeId: 'expansion-40-edge-1',
      state: 'conditional',
      condition: 'If the gate closes',
      effect: 'failed',
      evidence: object(f.proposal.failure).evidence,
    });
    expect(scene.result.state).toBe('unknown');
    expect(scene.result).not.toHaveProperty('result');
    expect(scene.edges[1].status).toBe('present');
  });
  for (const state of [
    'absent',
    'failed',
    'unknown',
    'missing',
    'disputed',
    'illustrative',
    'simulated',
  ] as const) {
    it(`40 preserves source-${state} edge without converting it into a missing/failed/connected result`, () => {
      const f = fixture('40'),
        cs = source(f).clauses;
      const qualification = state === 'illustrative' ? 'teaching example' : 'simulation';
      const teaching = state === 'illustrative' || state === 'simulated';
      cs[2] = teaching
        ? `In this ${qualification}, Hub transfers to Store for orders in May.`
        : `Transfer from Hub to Store is ${state} for orders in May.`;
      const local = rewrite(f, cs, (p) => {
          const r = rows(p.edges)[2];
          delete r.qualification;
          delete r.status;
          if (state === 'absent' || state === 'failed')
            Object.assign(r, { state: 'known', status: state });
          else if (teaching) {
            Object.assign(r, { state, qualification, status: 'present' });
            p.evidence = 'illustrative';
          } else Object.assign(r, { state, qualification: state });
        }),
        scene = parity(local);
      exact(local, scene);
      if (scene.storyId !== '40') throw new Error('Topology scene required');
      expect(scene.result.state).toBe('unknown');
      expect(scene.result).not.toHaveProperty('result');
      expect(scene.failure.state).toBe('conditional');
    });
  }
  for (const effect of ['failed', 'absent', 'unknown', 'missing', 'disputed'] as const) {
    it(`40 keeps conditional ${effect} scenario distinct from current edge facts`, () => {
      const f = fixture('40'),
        cs = source(f).clauses;
      cs[3] = `If the gate closes, transfer from Mill to Hub is ${effect} for orders in May.`;
      const local = rewrite(f, cs, (p) => (object(p.failure).effect = effect)),
        scene = parity(local);
      exact(local, scene);
      if (scene.storyId !== '40') throw new Error('Topology scene required');
      expect(scene.failure).toMatchObject({
        state: 'conditional',
        condition: 'If the gate closes',
        effect,
      });
      expect(scene.edges[1]).toMatchObject({ state: 'known', status: 'present' });
      expect(scene.result.state).toBe('unknown');
    });
  }
  for (const value of [
    'continues',
    'stops',
    'unchanged',
    'missing',
    'disputed',
    'illustrative',
    'simulated',
  ] as const) {
    it(`40 retains the explicitly stated ${value} outcome only, not an inferred network result`, () => {
      const f = fixture('40'),
        cs = source(f).clauses;
      const teaching = value === 'illustrative' || value === 'simulated';
      const qualification = value === 'illustrative' ? 'teaching example' : 'simulation';
      const predicate = teaching
        ? 'continues'
        : value === 'unchanged' || value === 'missing' || value === 'disputed'
          ? `remains ${value}`
          : value;
      cs[4] = `${teaching ? `In this ${qualification}, ` : ''}Store delivery ${predicate} for orders in May.`;
      const local = rewrite(f, cs, (p) => {
          const r = object(p.result);
          delete r.qualification;
          p.outcome = `delivery ${predicate}`;
          if (value === 'missing' || value === 'disputed')
            Object.assign(r, { state: value, qualification: value });
          else if (teaching) {
            Object.assign(r, { state: value, qualification, result: 'continues' });
            p.evidence = 'illustrative';
          } else Object.assign(r, { state: 'known', result: value });
        }),
        scene = parity(local);
      exact(local, scene);
      if (scene.storyId !== '40') throw new Error('Topology scene required');
      expect(scene.failure.state).toBe('conditional');
      expect(scene.edges[1].status).toBe('present');
    });
  }
  it('40 supports the authored ring without inventing unsupplied connectivity or a resilience winner', () => {
    const f = fixture('40'),
      cs = source(f).clauses;
    cs[2] = 'Hub transfers to Store and Store transfers to Dock for orders in May.';
    const local = rewrite(f, cs, (p) => {
        p.template = 'ring';
        const edges = rows(p.edges),
          r = edges[2];
        r.state = 'known';
        r.status = 'present';
        delete r.qualification;
        edges.push({
          from: 'Store',
          to: 'Dock',
          role: 'transfer',
          state: 'known',
          status: 'present',
          evidence: r.evidence,
        });
      }),
      scene = parity(local);
    exact(local, scene);
    if (scene.storyId !== '40') throw new Error('Topology scene required');
    expect(scene.edges).toHaveLength(4);
    expect(scene.result.state).toBe('unknown');
  });
  it('40 distinguishes membership from dependency with the same authored diamond and identities', () => {
    const f = packet.paraphrases[1],
      cs = source(f).clauses;
    cs[1] = cs[1].replaceAll('depends on', 'is a member of');
    cs[2] = cs[2].replaceAll('depends on', 'is a member of');
    cs[3] = cs[3].replace('dependency of Review on Archive', 'membership of Review in Archive');
    const local = rewrite(f, cs, (p) => {
        for (const r of rows(p.edges)) r.role = 'membership';
        object(p.failure).role = 'membership';
      }),
      scene = parity(local);
    exact(local, scene);
    if (scene.storyId !== '40') throw new Error('Topology scene required');
    expect(scene.edges.every((e) => e.role === 'membership')).toBe(true);
    expect(scene.entities.map((e) => e.id)).toEqual(positive(f).entities.map((e) => e.id));
  });
  it('authored topology data is deeply frozen and never caller geometry', () => {
    expect(Object.keys(EXPANSION_TOPOLOGY_TEMPLATES)).toEqual(['chain', 'ring', 'diamond']);
    expect(Object.isFrozen(EXPANSION_TOPOLOGY_TEMPLATES)).toBe(true);
    for (const template of Object.values(EXPANSION_TOPOLOGY_TEMPLATES)) {
      expect(Object.isFrozen(template)).toBe(true);
      expect(template.nodes).toBe(4);
      expect(Object.isFrozen(template.links)).toBe(true);
      for (const pair of template.links) expect(Object.isFrozen(pair)).toBe(true);
    }
  });
});
