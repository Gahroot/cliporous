import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import type { ExpansionExploreEvidenceScene } from '../../remotion/compositions/explainer/expansion/decisions/explore-evidence-types';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import { isDerivationAllowed } from '../../remotion/compositions/explainer/expansion/value-logic';
import type { ExpansionEvidenceSpan } from '../../remotion/compositions/explainer/expansion/value-types';
import {
  parseExpansionExploreExploit,
  parseExpansionSequentialEvidence,
} from './expansion-decisions-explore-evidence-contract';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import { isRec, makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/decisions/explore-evidence.source.json',
    'utf8',
  ),
) as { version: number; pack: string; stories: ExpansionSourceFixture[] };
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
function object(raw: unknown): Rec {
  if (!isRec(raw)) throw new Error('Actual source object required');
  return raw;
}
function rows(raw: unknown): Rec[] {
  if (!Array.isArray(raw) || !raw.every(isRec))
    throw new Error('Actual source object rows required');
  return raw;
}
function fixture(id: '31' | '32'): ExpansionSourceFixture {
  const f = packet.stories.find((s) => s.id === id);
  if (!f) throw new Error(`Missing source ${id}`);
  return f;
}
function parse(f: ExpansionSourceFixture, p = f.proposal) {
  const ctx = makeParseContext(f.words, f.window);
  const scene =
    f.id === '31' ? parseExpansionExploreExploit(p, ctx) : parseExpansionSequentialEvidence(p, ctx);
  return { scene, ctx };
}
function positive(f: ExpansionSourceFixture): ExpansionExploreEvidenceScene {
  const r = parse(f);
  expect(r.ctx.issues).toEqual([]);
  expect(r.scene).not.toBeNull();
  if (!r.scene) throw new Error(`Rejected actual positive ${f.id}`);
  return r.scene;
}
function parity(f: ExpansionSourceFixture): ExpansionExploreEvidenceScene {
  const before = structuredClone(f),
    scene = positive(f);
  for (const visualMode of ['diagram', 'hybrid'] as const) {
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
function text(f: ExpansionSourceFixture, span: ExpansionEvidenceSpan) {
  return f.words
    .slice(span.fromWord, span.toWord + 1)
    .map((w) => w.text)
    .join(' ');
}
function source(f: ExpansionSourceFixture) {
  const spans: ExpansionEvidenceSpan[] = [];
  let start = 0;
  for (const [i, w] of f.words.entries())
    if (/[.!?;][”"’')\]]*$/.test(w.text)) {
      spans.push({ fromWord: start, toWord: i });
      start = i + 1;
    }
  if (start !== f.words.length) throw new Error('Complete source clauses required');
  return { spans, clauses: spans.map((s) => text(f, s)) };
}
function rewrite(
  f: ExpansionSourceFixture,
  clauses: readonly string[],
  change: (p: Rec) => void = () => {},
): ExpansionSourceFixture {
  const old = source(f),
    speech = expansionFixtureSpeech(clauses, 10);
  function remap(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(remap);
    if (!isRec(value)) return value;
    if (Object.keys(value).length === 2 && 'fromWord' in value && 'toWord' in value) {
      const i = old.spans.findIndex(
        (s) => s.fromWord === value.fromWord && s.toWord === value.toWord,
      );
      if (!speech.spans[i]) throw new Error('Full owned source span required');
      return { ...speech.spans[i] };
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v)]));
  }
  const p = object(remap(f.proposal));
  for (const beat of BEATS) {
    const i = old.spans.findIndex((s) => s.fromWord === f.proposal[beat]);
    if (!speech.spans[i]) throw new Error('Real clause-start beat required');
    p[beat] = speech.spans[i].fromWord;
  }
  p.startWord = 0;
  p.endWord = speech.window.endWord;
  change(p);
  return { ...f, ...speech, proposal: p };
}
function rejected(f: ExpansionSourceFixture, p: Rec) {
  for (const visualMode of ['diagram', 'hybrid'] as const) {
    const r = parse(f, { ...p, visualMode });
    expect(r.scene).toBeNull();
    expect(r.ctx.issues.length).toBeGreaterThan(0);
    expect(r.ctx.issues.length).toBeLessThanOrEqual(4);
  }
}

describe('step11 actual exploration and sequential source evidence', () => {
  it('loads the persisted two-story packet and exact production-padded speech', () => {
    expect([packet.version, packet.pack]).toEqual([1, 'decisions']);
    expect(packet.stories.map((s) => s.id)).toEqual(['31', '32']);
    expect(packet.stories.map((s) => s.negatives.length)).toEqual([50, 51]);
    for (const f of packet.stories) {
      expect(f.sourceText).toBe(f.words.map((w) => w.text).join(' '));
      expect(f.words).toEqual(conceptFixtureWords(f.sourceText, 10));
      expect(expansionFixtureSpeech(source(f).clauses, 10).words).toEqual(f.words);
      expect(f.words[0].start).toBe(0.25);
      expect(f.words.at(-1)?.end).toBe(9.65);
      expect(f.window).toEqual({
        startWord: 0,
        endWord: f.words.length - 1,
        startTime: 0,
        endTime: 10,
      });
      expect(new Set(f.negatives.map((n) => n.name)).size).toBe(f.negatives.length);
    }
  });
  for (const f of packet.stories) {
    it(`${f.id}: both modes keep exact source facts, IDs, times and repeat deterministically`, () => {
      const scene = parity(f),
        s = source(f);
      expect(scene.period).toBe('March');
      expect(scene.scope).toBe('pilot users');
      expect(scene.entities).toEqual(
        rows(f.proposal.entities).map((e, i) => ({
          id: expansionEntityId(f.id, i),
          label: e.label,
          evidence: e.evidence,
        })),
      );
      for (const [i, beat] of BEATS.entries()) {
        const span = s.spans.find((v) => v.fromWord === f.proposal[beat]);
        if (!span) throw new Error('Complete beat clause required');
        expect(scene[TIMES[i]]).toBe(i === 0 ? 0.3 : f.words[span.fromWord].start);
        if (i > 0) expect(scene[TIMES[i]]).toBeGreaterThan(scene[TIMES[i - 1]]);
      }
      expect(10 - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
      for (const field of [
        'treatment',
        'best',
        'winner',
        'recommendation',
        'derived',
        'probabilities',
      ])
        expect(scene).not.toHaveProperty(field);
      expect(isDerivationAllowed(f.id, 'difference')).toBe(false);
      expect(isDerivationAllowed(f.id, 'pareto')).toBe(false);
    });
    for (const n of f.negatives)
      for (const mode of ['diagram', 'hybrid'] as const)
        it(`${f.id}: rejects ${n.name} (${mode}) with real diagnostics`, () => {
          const p = structuredClone(n.proposal);
          if (p.visualMode === 'diagram' || p.visualMode === 'hybrid') p.visualMode = mode;
          const local = {
            ...f,
            words: n.words ?? f.words,
            window: n.window ?? f.window,
            sourceText: n.sourceText ?? f.sourceText,
          };
          if (n.words) expect(local.words.map((w) => w.text).join(' ')).toBe(local.sourceText);
          const r = parse(local, p);
          expect(r.scene, `${f.id}/${n.name}/${mode}`).toBeNull();
          expect(r.ctx.issues.length).toBeGreaterThan(0);
          expect(r.ctx.issues.length).toBeLessThanOrEqual(4);
        });
  }
  it('retains source exploring/exploiting events and genuinely unknown reward, not a fabricated best option', () => {
    const f = fixture('31'),
      scene = parity(f);
    if (scene.storyId !== '31') throw new Error('Expected explore-exploit');
    expect(scene.events.map((e) => [e.id, e.optionId, e.behavior, e.state])).toEqual([
      ['expansion-31-event-0', 'expansion-31-entity-0', 'explore', 'known'],
      ['expansion-31-event-1', 'expansion-31-entity-1', 'exploit', 'known'],
    ]);
    expect(scene.events.map((e) => text(f, e.evidence))).toEqual(source(f).clauses.slice(1, 3));
    expect(scene.rewards[0]).toMatchObject({
      id: 'expansion-31-reward-0',
      optionId: 'expansion-31-entity-0',
      quantity: {
        actor: 'Alpha',
        claim: 'reward',
        state: 'unknown',
        qualifier: 'unknown',
        basis: {
          unit: 'count',
          period: 'March',
          population: 'pilot users',
          denominator: { numerator: 10, denominator: 1 },
        },
      },
    });
    expect(scene.rewards[0].quantity).not.toHaveProperty('amount');
    expect(scene.decision).toMatchObject({
      state: 'unresolved',
      retainedIds: ['expansion-31-entity-0', 'expansion-31-entity-1'],
      qualification: 'remain available while rewards are unknown',
    });
    expect(scene.decision).not.toHaveProperty('selectedId');
  });
  it('retains actual ordered test outcomes, unknown-not-false and both uneliminated options', () => {
    const f = fixture('32'),
      scene = parity(f);
    if (scene.storyId !== '32') throw new Error('Expected sequential evidence');
    expect(scene.tests.map((t) => [t.id, t.optionId, t.label, t.state, t.outcome])).toEqual([
      ['expansion-32-test-0', 'expansion-32-entity-0', 'inspection', 'known', 'passed'],
      ['expansion-32-test-1', 'expansion-32-entity-1', 'credit', 'unknown', undefined],
    ]);
    expect(scene.tests.map((t) => text(f, t.evidence))).toEqual(source(f).clauses.slice(1, 3));
    expect(scene.conclusion).toMatchObject({
      state: 'unresolved',
      retainedIds: ['expansion-32-entity-0', 'expansion-32-entity-1'],
      qualification: 'unknown information is not false',
    });
    expect(scene.tests[1]).not.toHaveProperty('outcome');
    expect(scene).not.toHaveProperty('selectedId');
    expect(scene).not.toHaveProperty('eliminated');
  });
  it('accepts an independent realistic policy/reward wording in both modes', () => {
    const f = rewrite(
      fixture('31'),
      [
        'Routing note reviews North route and South route during June among trial visits.',
        'During June among trial visits, the policy explores North route.',
        'South route is exploited during June among trial visits.',
        'During June, North route reported reward of unknown count among trial visits with denominator 10.',
        'North route and South route remain available while rewards are unknown during June among trial visits.',
      ],
      (p) => {
        Object.assign(p, {
          label: 'Routing note',
          subject: 'trial visits',
          scope: 'trial visits',
          period: 'June',
        });
        rows(p.entities)[0].label = 'North route';
        rows(p.entities)[1].label = 'South route';
        rows(p.events)[0].option = 'North route';
        rows(p.events)[1].option = 'South route';
        const reward = rows(p.rewards)[0];
        reward.option = 'North route';
        const q = object(reward.quantity);
        q.actor = 'North route';
        Object.assign(object(q.basis), { period: 'June', population: 'trial visits' });
      },
    );
    expect(parity(f)).toMatchObject({
      period: 'June',
      scope: 'trial visits',
      decision: { state: 'unresolved' },
    });
  });
  it('accepts an independent realistic test/relevance wording without resolving an unsupported branch', () => {
    const f = rewrite(
      fixture('32'),
      [
        'Permit review reviews Cedar and Maple during June among local applicants.',
        'Cedar inspection test records negative during June among local applicants.',
        'Maple credit test outcome remains unknown during June among local applicants.',
        'Inspection and credit tests collect evidence for Cedar and Maple during June among local applicants.',
        'During June among local applicants, Cedar and Maple remain available because unknown information is not false.',
      ],
      (p) => {
        Object.assign(p, {
          label: 'Permit review',
          subject: 'local applicants',
          scope: 'local applicants',
          period: 'June',
        });
        rows(p.entities)[0].label = 'Cedar';
        rows(p.entities)[1].label = 'Maple';
        rows(p.tests)[0].option = 'Cedar';
        rows(p.tests)[0].outcome = 'negative';
        rows(p.tests)[1].option = 'Maple';
      },
    );
    const scene = parity(f);
    if (scene.storyId !== '32') throw new Error('Expected tests');
    expect(scene.tests[0]).toMatchObject({ state: 'known', outcome: 'negative' });
    expect(scene.tests[1]).toMatchObject({ state: 'unknown' });
    expect(scene.conclusion.state).toBe('unresolved');
  });
  for (const state of [
    'known',
    'missing',
    'disputed',
    'conditional',
    'illustrative',
    'simulated',
  ] as const)
    it(`31 preserves explicitly source-${state} reward without fabricating a choice`, () => {
      const f = fixture('31'),
        c = source(f).clauses,
        qualifier = state === 'illustrative' ? 'teaching example' : 'simulation';
      const value =
        state === 'missing' ? 'missing' : state === 'disputed' ? 'disputed between 4 and 7' : '4';
      c[3] = `${state === 'illustrative' || state === 'simulated' ? `In this ${qualifier}, ` : ''}Alpha reward is ${value} count during March among pilot users with denominator 10${state === 'conditional' ? ' if visits continue' : ''}.`;
      const conclusion =
        state === 'missing'
          ? 'remain available while rewards are missing'
          : state === 'disputed'
            ? 'remain available while rewards are disputed'
            : 'remain available while evidence is gathered';
      c[4] = `Alpha and Beta ${conclusion} among pilot users during March.`;
      const variant = rewrite(f, c, (p) => {
        const q = object(rows(p.rewards)[0].quantity);
        q.state = state;
        delete q.qualifier;
        if (state === 'missing') q.qualifier = 'missing';
        else if (state === 'disputed') {
          q.qualifier = 'disputed';
          q.alternatives = [4, 7].map((n) => ({
            kind: 'rational',
            value: { numerator: n, denominator: 1 },
          }));
        } else q.amount = { kind: 'rational', value: { numerator: 4, denominator: 1 } };
        if (state === 'conditional') {
          q.condition = 'if visits continue';
          p.condition = 'if visits continue';
        }
        if (state === 'illustrative' || state === 'simulated') {
          q.qualifier = qualifier;
          p.evidence = 'illustrative';
        }
        p.outcome = conclusion;
        object(p.decision).qualification = conclusion;
      });
      const scene = parity(variant);
      if (scene.storyId !== '31') throw new Error('Expected rewards');
      expect(scene.rewards[0].quantity.state).toBe(state);
      expect(scene.decision.state).toBe('unresolved');
      expect(scene.decision).not.toHaveProperty('selectedId');
      if (state === 'missing' || state === 'disputed')
        expect(scene.rewards[0].quantity).not.toHaveProperty('amount');
      if (state === 'conditional') {
        expect(scene.rewards[0].quantity).toMatchObject({ condition: 'if visits continue' });
        const p = structuredClone(variant.proposal);
        delete p.condition;
        delete object(rows(p.rewards)[0].quantity).condition;
        rejected(variant, p);
      }
    });
  for (const state of [
    'known',
    'missing',
    'disputed',
    'conditional',
    'illustrative',
    'simulated',
  ] as const)
    it(`32 preserves source-${state} test status and unresolved retained options`, () => {
      const original = fixture('32'),
        c = source(original).clauses,
        qualifier = state === 'illustrative' ? 'teaching example' : 'simulation';
      c[2] =
        state === 'missing' || state === 'disputed'
          ? `Beta credit test outcome is ${state} among pilot users during March.`
          : `${state === 'illustrative' || state === 'simulated' ? `In this ${qualifier}, ` : ''}Beta credit test reports inconclusive among pilot users during March${state === 'conditional' ? ' if records arrive' : ''}.`;
      const q =
        state === 'missing' ? 'missing information is not false' : 'evidence gathering continues';
      c[4] = `Alpha and Beta remain under review ${state === 'missing' ? 'because' : 'while'} ${q} among pilot users during March.`;
      const f = rewrite(original, c, (p) => {
        const test = rows(p.tests)[1];
        test.state = state;
        delete test.qualification;
        if (state === 'missing' || state === 'disputed') test.qualification = state;
        else test.outcome = 'inconclusive';
        if (state === 'conditional') {
          test.condition = 'if records arrive';
          p.condition = 'if records arrive';
        }
        if (state === 'illustrative' || state === 'simulated') {
          test.qualification = qualifier;
          p.evidence = 'illustrative';
        }
        p.outcome = q;
        object(p.conclusion).qualification = q;
      });
      const scene = parity(f);
      if (scene.storyId !== '32') throw new Error('Expected tests');
      expect(scene.tests[1].state).toBe(state);
      expect(scene.conclusion.retainedIds).toEqual(scene.entities.map((e) => e.id));
      if (state === 'missing' || state === 'disputed')
        expect(scene.tests[1]).not.toHaveProperty('outcome');
      if (state === 'conditional') {
        expect(scene.tests[1]).toMatchObject({
          condition: 'if records arrive',
          outcome: 'inconclusive',
        });
        const p = structuredClone(f.proposal);
        delete p.condition;
        delete rows(p.tests)[1].condition;
        rejected(f, p);
      }
    });
  it('retains an explicitly conditional behavior event, not an observed fact', () => {
    const original = fixture('31'),
      c = source(original).clauses;
    c[1] = c[1].replace(/\.$/, ' if shifts change.');
    const f = rewrite(original, c, (p) => {
      p.condition = 'if shifts change';
      Object.assign(rows(p.events)[0], { state: 'conditional', condition: 'if shifts change' });
    });
    const scene = parity(f);
    if (scene.storyId !== '31') throw new Error('Expected exploration');
    expect(scene.events[0]).toMatchObject({ state: 'conditional', condition: 'if shifts change' });
    const p = structuredClone(f.proposal);
    delete rows(p.events)[0].condition;
    rejected(f, p);
  });
  it('retains only an expressly source-stated conditional selection, never inferring best from an unknown reward', () => {
    const original = fixture('31'),
      c = source(original).clauses;
    c[4] =
      'If reviews are completed, Beta is selected while Alpha and Beta remain available among pilot users during March.';
    const f = rewrite(original, c, (p) => {
      p.condition = 'If reviews are completed';
      p.outcome = 'is selected';
      Object.assign(object(p.decision), {
        state: 'conditional',
        option: 'Beta',
        condition: 'If reviews are completed',
        qualification: 'is selected',
      });
    });
    const scene = parity(f);
    if (scene.storyId !== '31') throw new Error('Expected decision');
    expect(scene.decision).toMatchObject({
      state: 'conditional',
      selectedId: 'expansion-31-entity-1',
      condition: 'If reviews are completed',
    });
    expect(scene.rewards[0].quantity.state).toBe('unknown');
    const p = structuredClone(f.proposal);
    delete object(p.decision).condition;
    delete p.condition;
    rejected(f, p);
  });
});
