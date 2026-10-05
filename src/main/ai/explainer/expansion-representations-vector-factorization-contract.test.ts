import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXPANSION_FACTORIZATION_OPERATIONS,
  type ExpansionVectorFactorizationScene,
} from '../../remotion/compositions/explainer/expansion/representations/vector-factorization-types';
import type { ExpansionQuantity } from '../../remotion/compositions/explainer/expansion/value-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionFactorization,
  parseExpansionVectorBasis,
} from './expansion-representations-vector-factorization-contract';
import { type TemporalFixtureSeed, temporalSourceFixtures } from './expansion-temporal-fixtures';
import { isRec, makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/representations/vector-factorization.source.json',
    'utf8',
  ),
) as {
  version: number;
  pack: string;
  negativeFormat: string;
  stories: TemporalFixtureSeed[];
  paraphrases: TemporalFixtureSeed[];
};
const fixtures = temporalSourceFixtures([...packet.stories, ...packet.paraphrases]);
const MODES = ['diagram', 'hybrid'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
const WORDS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
function rec(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Actual fixture object required');
  return value;
}
function records(value: unknown): Rec[] {
  if (!Array.isArray(value) || !value.every(isRec))
    throw new Error('Actual fixture records required');
  return value;
}
function run(f: ExpansionSourceFixture, proposal = f.proposal) {
  const ctx = makeParseContext(f.words, f.window);
  const scene =
    f.id === '55'
      ? parseExpansionVectorBasis(proposal, ctx)
      : parseExpansionFactorization(proposal, ctx);
  return { ctx, scene };
}
function positive(f: ExpansionSourceFixture): ExpansionVectorFactorizationScene {
  const before = structuredClone(f);
  const result = run(f);
  expect(result.ctx.issues).toEqual([]);
  expect(result.scene).not.toBeNull();
  if (!result.scene) throw new Error(`Actual positive ${f.id} rejected`);
  for (const visualMode of MODES) {
    const r = run(f, { ...f.proposal, visualMode });
    expect(r.ctx.issues).toEqual([]);
    expect(r.scene).toEqual({ ...result.scene, visualMode });
  }
  expect(run(f, structuredClone(f.proposal)).scene).toEqual(result.scene);
  expect(f).toEqual(before);
  return result.scene;
}
function reject(f: ExpansionSourceFixture, proposal = f.proposal): void {
  for (const visualMode of MODES) {
    // Preserve an explicitly malformed mode; overriding it would repair the negative.
    const inputMode =
      proposal.visualMode === 'diagram' || proposal.visualMode === 'hybrid'
        ? visualMode
        : proposal.visualMode;
    const { scene, ctx } = run(f, { ...proposal, visualMode: inputMode });
    expect(scene).toBeNull();
    expect(ctx.issues.length).toBeGreaterThan(0);
  }
}
function base(id: '55' | '56'): ExpansionSourceFixture {
  const f = fixtures.find((f) => f.id === id);
  if (!f) throw new Error('Missing canonical source');
  return structuredClone(f);
}
function rawQuantities(p: Rec): Rec[] {
  return p.kind === 'linear-algebra'
    ? [rec(p.vector), ...records(p.basis)].flatMap((v) =>
        records(v.components).map((c) => rec(c.quantity)),
      )
    : records(p.operands).map((o) => rec(o.quantity));
}
function quantities(scene: ExpansionVectorFactorizationScene): ExpansionQuantity[] {
  return scene.storyId === '55'
    ? [scene.vector, ...scene.basis].flatMap((v) => v.components.map((c) => c.quantity))
    : scene.operands.map((o) => o.quantity);
}
function retained(f: ExpansionSourceFixture, scene: ExpansionVectorFactorizationScene): void {
  expect(scene.entities).toEqual(
    records(f.proposal.entities).map((e, i) => ({ ...e, id: `expansion-${f.id}-entity-${i}` })),
  );
  expect(scene.actorId).toBe(`expansion-${f.id}-entity-0`);
  expect([scene.scope, scene.period]).toEqual([f.proposal.scope, f.proposal.period]);
  for (const [i, field] of WORDS.entries()) {
    const index = f.proposal[field];
    if (typeof index !== 'number') throw new Error('Explicit beat index required');
    expect(scene[TIMES[i]]).toBe(i === 0 ? f.window.startTime + 0.3 : f.words[index].start);
  }
  const raws = rawQuantities(f.proposal),
    qs = quantities(scene);
  expect(qs).toHaveLength(raws.length);
  for (const [i, q] of qs.entries()) {
    const raw = raws[i];
    expect({
      ...q,
      ...('amount' in q ? { amount: { ...q.amount, notation: undefined } } : {}),
    }).toEqual({
      ...raw,
      ...('amount' in raw ? { amount: { ...rec(raw.amount), notation: undefined } } : {}),
    });
  }
  if (scene.storyId === '55') {
    expect(scene.frame).toBe(f.proposal.frame);
    const vs = [scene.vector, ...scene.basis],
      rvs = [rec(f.proposal.vector), ...records(f.proposal.basis)];
    for (const [i, v] of vs.entries()) {
      expect(v.id).toBe(`expansion-55-vector-${i}`);
      expect(v.entityId).toBe(scene.entities.find((e) => e.label === rvs[i].label)?.id);
      expect(v.components.map((c) => [c.id, c.axis, c.direction])).toEqual(
        records(rvs[i].components).map((c, j) => [
          `expansion-55-component-${i}-${j}`,
          c.axis,
          c.direction,
        ]),
      );
    }
    expect(scene.correspondence).toEqual({
      actorId: scene.actorId,
      frame: scene.frame,
      vectorId: scene.vector.id,
      basisIds: scene.basis.map((v) => v.id),
      evidence: rec(f.proposal.correspondence).evidence,
    });
    expect(scene.result).toEqual({
      state: 'supplied',
      actorId: scene.actorId,
      claim: 'component display',
      evidence: rec(f.proposal.result).evidence,
    });
    expect(scene).not.toHaveProperty('coefficients');
    expect(scene.result).not.toHaveProperty('norm');
  } else {
    expect(scene.symbol).toBe(f.proposal.symbol);
    expect(scene.operands.map((o) => [o.id, o.role])).toEqual(
      records(f.proposal.operands).map((o, i) => [`expansion-56-operand-${i}`, o.role]),
    );
    expect(scene.request).toEqual({
      actorId: scene.actorId,
      operation: 'factorization',
      evidence: rec(f.proposal.request).evidence,
    });
    expect(scene.result.state).toBe('derived');
    if (scene.result.state !== 'derived') throw new Error('Complete exact identity expected');
    expect(scene.result.operation).toBe('factorization');
    expect(scene.result.identity).toBe('verified');
    expect(scene.result.sourceState).toBe('known');
    expect(scene.result.operandIds).toEqual(scene.operands.map((o) => o.id));
    expect(scene.result.operands).toEqual(raws.map((q) => rec(q.amount).value));
    expect(scene.result.basis).toEqual(raws[0].basis);
    expect(scene.result.evidence).toEqual([
      ...raws.map((q) => q.evidence),
      rec(f.proposal.request).evidence,
      rec(f.proposal.result).evidence,
    ]);
    expect(scene.result.factors).toEqual(
      scene.template === 'common-factor'
        ? {
            template: 'common-factor',
            outerFactor: { numerator: 2, denominator: 1 },
            linear: {
              coefficient: { numerator: 3, denominator: 1 },
              constant: { numerator: 4, denominator: 1 },
            },
          }
        : {
            template: 'integer-difference-of-squares',
            left: {
              coefficient: { numerator: 3, denominator: 1 },
              constant: { numerator: -4, denominator: 1 },
            },
            right: {
              coefficient: { numerator: 3, denominator: 1 },
              constant: { numerator: 4, denominator: 1 },
            },
          },
    );
  }
}
/** Author additional source variants through the shared adapter, not by generating facts in parsers. */
function authored(
  f: ExpansionSourceFixture,
  clauses: Record<string, string>,
  edits: { path: (string | number)[]; value?: unknown; remove?: boolean }[],
): ExpansionSourceFixture {
  const [source] = temporalSourceFixtures([
    { ...f, negatives: [{ name: 'explicit authored source variant', clauses, edits }] },
  ]);
  const n = source.negatives[0];
  return {
    ...source,
    sourceText: n.sourceText ?? source.sourceText,
    words: n.words ?? source.words,
    window: n.window ?? source.window,
    proposal: n.proposal,
    negatives: [],
  };
}

describe('step14 supplied vector bases and authored exact factorization', () => {
  it('persists complete version1 positives and existing negative materialization schema', () => {
    expect([packet.version, packet.pack, packet.negativeFormat]).toEqual([
      1,
      'representations',
      'explicit-path-edits-and-complete-clause-replacements',
    ]);
    expect(fixtures.map((f) => [f.id, f.negatives.length])).toEqual([
      ['55', 24],
      ['56', 26],
      ['55', 4],
      ['56', 4],
    ]);
    expect(EXPANSION_FACTORIZATION_OPERATIONS).toEqual(['factorization']);
    for (const f of fixtures) {
      expect(f.sourceText).toBe(f.words.map((w) => w.text).join(' '));
      expect(f.window.endWord).toBe(f.words.length - 1);
      expect(f.words[0].start).toBeGreaterThanOrEqual(f.window.startTime + 0.25);
      expect(f.words.at(-1)?.end).toBeLessThanOrEqual(f.window.endTime - 0.35);
      const starts = f.words.flatMap((_, i) =>
        i === 0 || /[.!?;]$/.test(f.words[i - 1].text) ? [i] : [],
      );
      expect(new Set(WORDS.map((w) => f.proposal[w])).size).toBe(5);
      for (const w of WORDS) expect(starts).toContain(f.proposal[w]);
    }
  });
  for (const [i, f] of fixtures.entries()) {
    it(`${f.id}/${i}: exact supplied facts, source, state, identity and both-mode parity`, () =>
      retained(f, positive(f)));
    it(`${f.id}/${i}: source-time translation changes only animation seconds, never rational/domain facts`, () => {
      const scene = positive(f),
        offset = 31;
      const shifted = {
        ...f,
        window: {
          ...f.window,
          startTime: f.window.startTime + offset,
          endTime: f.window.endTime + offset,
        },
        words: f.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset })),
      };
      const expected = { ...scene };
      for (const field of TIMES) expected[field] += offset;
      expect(positive(shifted)).toEqual(expected);
    });
    for (const n of f.negatives)
      it(`${f.id}/${i}: rejects ${n.name} BOTH modes with review diagnostics`, () =>
        reject({
          ...f,
          words: n.words ?? f.words,
          window: n.window ?? f.window,
          sourceText: n.sourceText ?? f.sourceText,
          proposal: n.proposal,
        }));
  }
  for (const id of ['55', '56'] as const) {
    const failures: [string, (f: ExpansionSourceFixture) => void][] = [
      [
        'short window',
        (f) => {
          f.window.endTime = 4.999;
        },
      ],
      [
        'long window',
        (f) => {
          f.window.endTime = 12.001;
        },
      ],
      [
        'nonfinite window',
        (f) => {
          f.window.endTime = Infinity;
        },
      ],
      [
        'nonfinite word',
        (f) => {
          f.words[2].end = NaN;
        },
      ],
      [
        'zero interval',
        (f) => {
          f.words[2].end = f.words[2].start;
        },
      ],
      [
        'negative interval',
        (f) => {
          f.words[2].end = f.words[2].start - 0.01;
        },
      ],
      [
        'overlap beyond 1e-7',
        (f) => {
          f.words[2].start = f.words[1].end - 2e-7;
        },
      ],
      [
        'outside window',
        (f) => {
          f.words[0].start = -0.01;
        },
      ],
      [
        'lead padding erased',
        (f) => {
          f.words[0].start = 0.249;
        },
      ],
      [
        'tail padding erased',
        (f) => {
          f.words[f.words.length - 1].end = 9.651;
        },
      ],
      [
        'foreign evidence',
        (f) => {
          rawQuantities(f.proposal)[0].evidence = { fromWord: 0, toWord: 0 };
        },
      ],
      [
        'fractional start index',
        (f) => {
          f.window.startWord = 0.5;
        },
      ],
      [
        'blanket invented condition',
        (f) => {
          f.proposal.condition = 'if input is stable';
        },
      ],
      [
        'URL',
        (f) => {
          f.proposal.url = 'https://example.invalid';
        },
      ],
      [
        'files',
        (f) => {
          f.proposal.file = '/tmp/arbitrary';
        },
      ],
      [
        'mesh',
        (f) => {
          f.proposal.mesh = 'sphere';
        },
      ],
      [
        'camera',
        (f) => {
          f.proposal.camera = [0, 0, 1];
        },
      ],
      [
        'treatment',
        (f) => {
          f.proposal.treatment = 'glow';
        },
      ],
      [
        'function',
        (f) => {
          f.proposal.evaluate = () => 2;
        },
      ],
      [
        'caller ID',
        (f) => {
          records(f.proposal.entities)[0].id = 'caller';
        },
      ],
    ];
    for (const [name, mutate] of failures)
      it(`${id}: rejects ${name} in BOTH modes with diagnostics`, () => {
        const f = base(id);
        mutate(f);
        reject(f);
      });
    for (let i = 1; i < 5; i++)
      it(`${id}: strict >=1s gap ${i}, not shared epsilon`, () => {
        const f = base(id),
          at = Number(f.proposal[WORDS[i]]),
          previous = i === 1 ? 0.3 : f.words[Number(f.proposal[WORDS[i - 1]])].start;
        f.words[at].start = previous + 1 - 2e-7;
        // Retain positive source intervals when advancing the beat clause.
        const delta = f.words[at].start - base(id).words[at].start;
        for (let j = at + 1; j < f.words.length && !/[.!?;]$/.test(f.words[j - 1].text); j++) {
          f.words[j].start += delta;
          f.words[j].end += delta;
        }
        f.words[at].end += delta;
        reject(f);
      });
    it(`${id}: strict >=.8s final hold`, () => {
      const f = base(id),
        at = Number(f.proposal.resolveWord),
        delta = 9.2000002 - f.words[at].start;
      for (let i = at; i < f.words.length; i++) {
        f.words[i].start += delta;
        f.words[i].end += delta;
      }
      reject(f);
    });
    it(`${id}: nonoverlap tolerance 1e-7 does not alter supplied facts`, () => {
      const f = base(id);
      f.words[2].start = f.words[1].end - 5e-8;
      positive(f);
    });
  }
  it('55 spatial teaching template retains all twelve explicitly supplied components without deriving coefficients', () => {
    const f = base('55'),
      axes = ['x', 'y', 'z'],
      names = ['V', 'E', 'F', 'G'];
    const values = [
      [2, -3, 4],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const directions = values.map((row) =>
      row.map((value) => (value < 0 ? 'negative' : value > 0 ? 'positive' : 'zero')),
    );
    const clauses = [
      'Ada Board presents V with basis E, F and G in frame for lab during lesson.',
      ...values.flatMap((row, i) =>
        row.map(
          (value, j) =>
            `Ada ${names[i]} ${axes[j]} ${directions[i][j]} component is ${value} ratio during lesson for lab with denominator 1.`,
        ),
      ),
      'Ada maps V, E, F and G to frame for lab during lesson.',
      'Ada component display preserves supplied components for lab during lesson.',
    ];
    const speech = expansionFixtureSpeech(clauses, 12);
    const starts = [0.25, 1.5, 1.95, 2.4, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 8.5, 10];
    for (const [i, span] of speech.spans.entries()) {
      const count = span.toWord - span.fromWord + 1,
        end = i === 14 ? 11.65 : starts[i + 1] - 0.05;
      for (let j = 0; j < count; j++) {
        speech.words[span.fromWord + j].start = Number(
          (starts[i] + ((end - starts[i]) * j) / count).toFixed(9),
        );
        speech.words[span.fromWord + j].end = Number(
          (starts[i] + ((end - starts[i]) * (j + 1)) / count).toFixed(9),
        );
      }
    }
    const q = rawQuantities(f.proposal)[0];
    const vectors = values.map((row, i) => ({
      label: names[i],
      components: row.map((value, j) => ({
        axis: axes[j],
        direction: directions[i][j],
        quantity: {
          ...structuredClone(q),
          claim: `${names[i]} ${axes[j]} ${directions[i][j]} component`,
          amount: { kind: 'rational', value: { numerator: value, denominator: 1 } },
          evidence: speech.spans[1 + i * 3 + j],
        },
      })),
    }));
    const proposal = {
      ...f.proposal,
      template: 'spatial-components',
      axes,
      endWord: speech.window.endWord,
      entities: ['Ada', ...names].map((label) => ({ label, evidence: speech.spans[0] })),
      vector: vectors[0],
      basis: vectors.slice(1),
      setupWord: 0,
      actionWord: speech.spans[1].fromWord,
      responseWord: speech.spans[4].fromWord,
      checkWord: speech.spans[13].fromWord,
      resolveWord: speech.spans[14].fromWord,
      correspondence: {
        actor: 'Ada',
        frame: 'frame',
        vector: 'V',
        basis: names.slice(1),
        evidence: speech.spans[13],
      },
      result: { actor: 'Ada', claim: 'component display', evidence: speech.spans[14] },
    };
    const source = { ...f, ...speech, proposal },
      scene = positive(source);
    retained(source, scene);
    expect(quantities(scene)).toHaveLength(12);
  });
  it('55 unknown component remains absent, not zero or derived coefficients', () => {
    const f = fixtures[2],
      scene = positive(f);
    expect(scene.storyId).toBe('55');
    if (scene.storyId !== '55') throw new Error('Expected vector');
    expect(scene.vector.components[1].quantity.state).toBe('unknown');
    expect(scene.vector.components[1].quantity).not.toHaveProperty('amount');
    expect(scene.vector.components[0].quantity).toMatchObject({
      state: 'known',
      amount: { value: { numerator: -1, denominator: 2 }, notation: '-0.5' },
    });
  });
  for (const state of ['unknown', 'missing', 'disputed'] as const)
    it(`56 ${state} operand retains its source and never yields factors`, () => {
      const f = base('56'),
        q = rawQuantities(f.proposal)[2],
        raw = state === 'disputed' ? 'disputed between 2 and 3' : state;
      const edits: { path: (string | number)[]; value?: unknown; remove?: boolean }[] = [
        { path: ['operands', 2, 'quantity', 'state'], value: state },
        { path: ['operands', 2, 'quantity', 'qualifier'], value: state },
        { path: ['operands', 2, 'quantity', 'amount'], remove: true },
        { path: ['result', 'state'], value: state },
        { path: ['result', 'qualifier'], value: state },
        { path: ['outcome'], value: `remains ${state}` },
      ];
      if (state === 'disputed')
        edits.push({
          path: ['operands', 2, 'quantity', 'alternatives'],
          value: [
            { kind: 'rational', value: { numerator: 2, denominator: 1 } },
            { kind: 'rational', value: { numerator: 3, denominator: 1 } },
          ],
        });
      const revised = authored(
        f,
        {
          '3': `Ada common factor is ${raw} ratio during lesson for lab with denominator 1.`,
          '7': `Ada factorization remains ${state} for lab during lesson.`,
        },
        edits,
      );
      const scene = positive(revised);
      expect(scene.storyId).toBe('56');
      if (scene.storyId !== '56') throw new Error('Expected factors');
      expect(scene.result.state).toBe(state);
      expect(scene.result).not.toHaveProperty('factors');
      expect(scene.result).not.toHaveProperty('operands');
      expect(scene.operands[2].quantity).toMatchObject({
        actor: q.actor,
        claim: q.claim,
        state,
        qualifier: state,
        basis: q.basis,
      });
      if (state === 'disputed') expect(scene.operands[2].quantity).toHaveProperty('alternatives');
      else expect(scene.operands[2].quantity).not.toHaveProperty('amount');
      reject({
        ...revised,
        proposal: {
          ...revised.proposal,
          outcome: 'worked factorization',
          result: { actor: 'Ada', state: 'known', evidence: rec(revised.proposal.result).evidence },
        },
      });
    });
  for (const state of ['simulated', 'illustrative', 'conditional'] as const)
    it(`56 ${state} worked calculation retains source qualification and conditions`, () => {
      const f = base('56'),
        qualifier = state === 'simulated' ? 'simulation' : 'teaching example',
        condition = 'if input is stable';
      const clauses: Record<string, string> = {},
        texts = f.sourceText.match(/[^.]+\./g)?.map((s) => s.trim());
      if (!texts) throw new Error('Complete clauses');
      const edits: { path: (string | number)[]; value?: unknown; remove?: boolean }[] = [
        { path: ['result', 'state'], value: state },
      ];
      if (state === 'conditional') {
        edits.push(
          { path: ['condition'], value: condition },
          { path: ['result', 'condition'], value: condition },
        );
        for (const [i, text] of texts.entries()) clauses[String(i)] = `If input is stable, ${text}`;
      } else {
        edits.push(
          { path: ['evidence'], value: 'illustrative' },
          { path: ['result', 'qualifier'], value: qualifier },
        );
        for (let i = 1; i <= 5; i++) clauses[String(i)] = `In this ${qualifier}, ${texts[i]}`;
        clauses['7'] = `In this ${qualifier}, ${texts[7]}`;
      }
      for (let i = 0; i < 5; i++) {
        edits.push({ path: ['operands', i, 'quantity', 'state'], value: state });
        edits.push({
          path: ['operands', i, 'quantity', state === 'conditional' ? 'condition' : 'qualifier'],
          value: state === 'conditional' ? condition : qualifier,
        });
      }
      const revised = authored(f, clauses, edits),
        scene = positive(revised);
      if (scene.storyId !== '56' || scene.result.state !== 'derived')
        throw new Error('Explicit worked result');
      expect(scene.result.sourceState).toBe(state);
      expect(scene.result[state === 'conditional' ? 'condition' : 'qualifier']).toBe(
        state === 'conditional' ? condition : qualifier,
      );
      reject({
        ...revised,
        proposal: {
          ...revised.proposal,
          result: { actor: 'Ada', state: 'known', evidence: rec(revised.proposal.result).evidence },
        },
      });
    });
  it('56 verifies bounded rational common factors without rounding', () => {
    const f = base('56');
    const revised = authored(
      f,
      {
        '1': 'Ada linear coefficient is 1.5 ratio during lesson for lab with denominator 1.',
        '2': 'Ada constant term is 2 ratio during lesson for lab with denominator 1.',
        '3': 'Ada common factor is 0.5 ratio during lesson for lab with denominator 1.',
      },
      [
        {
          path: ['operands', 0, 'quantity', 'amount', 'value'],
          value: { numerator: 3, denominator: 2 },
        },
        {
          path: ['operands', 1, 'quantity', 'amount', 'value'],
          value: { numerator: 2, denominator: 1 },
        },
        {
          path: ['operands', 2, 'quantity', 'amount', 'value'],
          value: { numerator: 1, denominator: 2 },
        },
      ],
    );
    const scene = positive(revised);
    if (scene.storyId !== '56' || scene.result.state !== 'derived')
      throw new Error('Expected exact derived factorization');
    expect(scene.result.factors).toMatchObject({ outerFactor: { numerator: 1, denominator: 2 } });
  });
  it('56 zero common factor cannot serve as a factorization identity', () => {
    const revised = authored(
      base('56'),
      {
        '1': 'Ada linear coefficient is 0 ratio during lesson for lab with denominator 1.',
        '2': 'Ada constant term is 0 ratio during lesson for lab with denominator 1.',
        '3': 'Ada common factor is 0 ratio during lesson for lab with denominator 1.',
      },
      [0, 1, 2].map((i) => ({
        path: ['operands', i, 'quantity', 'amount', 'value', 'numerator'],
        value: 0,
      })),
    );
    reject(revised);
  });
});
