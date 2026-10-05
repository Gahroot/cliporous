import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXPANSION_DIMENSIONAL_OPERATIONS,
  type ExpansionRegionsDimensionsScene,
} from '../../remotion/compositions/explainer/expansion/geometry/regions-dimensions-types';
import type { ExpansionSourceFixture } from './expansion-fixture-words';
import {
  parseExpansionDimensionalScaling,
  parseExpansionRegionOverlap,
} from './expansion-geometry-regions-dimensions-contract';
import { type TemporalFixtureSeed, temporalSourceFixtures } from './expansion-temporal-fixtures';
import { isRec, makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/geometry/regions-dimensions.source.json',
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
function rec(v: unknown): Rec {
  if (!isRec(v)) throw new Error('Actual raw source object required');
  return v;
}
function records(v: unknown): Rec[] {
  if (!Array.isArray(v) || !v.every(isRec)) throw new Error('Actual raw records required');
  return v;
}
function base(id: '63' | '64'): ExpansionSourceFixture {
  const f = fixtures.find((f) => f.id === id);
  if (!f) throw new Error('Missing source');
  return structuredClone(f);
}
function run(f: ExpansionSourceFixture, p = f.proposal) {
  const ctx = makeParseContext(f.words, f.window);
  return {
    ctx,
    scene:
      f.id === '63'
        ? parseExpansionRegionOverlap(p, ctx)
        : parseExpansionDimensionalScaling(p, ctx),
  };
}
function positive(f: ExpansionSourceFixture): ExpansionRegionsDimensionsScene {
  const before = structuredClone(f),
    { ctx, scene } = run(f);
  expect(ctx.issues).toEqual([]);
  expect(scene).not.toBeNull();
  if (!scene) throw new Error('Actual positive rejected');
  for (const visualMode of MODES) {
    const r = run(f, { ...f.proposal, visualMode });
    expect(r.ctx.issues).toEqual([]);
    expect(r.scene).toEqual({ ...scene, visualMode });
  }
  expect(run(f, structuredClone(f.proposal)).scene).toEqual(scene);
  expect(f).toEqual(before);
  return scene;
}
function reject(f: ExpansionSourceFixture): void {
  for (const visualMode of MODES) {
    const inputMode =
      f.proposal.visualMode === 'diagram' || f.proposal.visualMode === 'hybrid'
        ? visualMode
        : f.proposal.visualMode;
    const r = run(f, { ...f.proposal, visualMode: inputMode });
    expect(r.scene).toBeNull();
    expect(r.ctx.issues.length).toBeGreaterThan(0);
  }
}
type Edit = { path: (string | number)[]; value?: unknown; remove?: boolean };
function authored(
  f: ExpansionSourceFixture,
  clauses: Record<string, string>,
  edits: Edit[],
): ExpansionSourceFixture {
  const [s] = temporalSourceFixtures([
    { ...f, negatives: [{ name: 'explicit authored source variant', clauses, edits }] },
  ]);
  const n = s.negatives[0];
  return {
    ...s,
    sourceText: n.sourceText ?? s.sourceText,
    words: n.words ?? s.words,
    window: n.window ?? s.window,
    proposal: n.proposal,
    negatives: [],
  };
}
function statusFields(r: Rec): Rec {
  return Object.fromEntries(
    ['state', 'value', 'qualifier', 'condition']
      .filter((k) => r[k] !== undefined)
      .map((k) => [k, r[k]]),
  );
}
function exact(f: ExpansionSourceFixture, s: ExpansionRegionsDimensionsScene): void {
  expect(s.entities).toEqual(
    records(f.proposal.entities).map((e, i) => ({ ...e, id: `expansion-${f.id}-entity-${i}` })),
  );
  expect(s.actorId).toBe(`expansion-${f.id}-entity-0`);
  expect([s.scope, s.period]).toEqual([f.proposal.scope, f.proposal.period]);
  for (const [i, w] of WORDS.entries())
    expect(s[TIMES[i]]).toBe(
      i === 0 ? f.window.startTime + 0.3 : f.words[Number(f.proposal[w])].start,
    );
  const id = (label: unknown) => s.entities.find((e) => e.label === label)?.id;
  if (s.storyId === '63') {
    expect(s.regionIds).toEqual((f.proposal.regions as string[]).map(id));
    expect(s.memberId).toBe(id(f.proposal.member));
    const m = rec(f.proposal.membership),
      r = rec(f.proposal.restriction),
      o = rec(f.proposal.overlap);
    expect(s.membership).toEqual({
      id: 'expansion-63-membership',
      actorId: s.actorId,
      memberId: s.memberId,
      regionId: id(m.region),
      evidence: m.evidence,
      ...statusFields(m),
    });
    expect(s.restriction).toEqual({
      id: 'expansion-63-restriction',
      actorId: s.actorId,
      regionId: id(r.region),
      evidence: r.evidence,
      ...statusFields(r),
    });
    expect(s.overlap).toEqual({
      id: 'expansion-63-overlap',
      actorId: s.actorId,
      leftId: id(o.left),
      rightId: id(o.right),
      evidence: o.evidence,
      ...statusFields(o),
    });
    expect(s.result).toEqual({
      state: 'supplied',
      actorId: s.actorId,
      claim: 'region summary',
      evidence: rec(f.proposal.result).evidence,
    });
    expect(s.result).not.toHaveProperty('rights');
    expect(s.result).not.toHaveProperty('area');
    expect(s).not.toHaveProperty('coordinates');
  } else {
    const a = rec(f.proposal.scale),
      b = rec(f.proposal.original);
    expect(s.scale.id).toBe('expansion-64-scale');
    expect(s.original.id).toBe('expansion-64-original');
    for (const [q, r] of [
      [s.scale.quantity, a],
      [s.original.quantity, b],
    ] as const)
      expect({
        ...q,
        ...('amount' in q ? { amount: { ...q.amount, notation: undefined } } : {}),
      }).toEqual({
        ...r,
        ...('amount' in r ? { amount: { ...rec(r.amount), notation: undefined } } : {}),
      });
    expect(s.request).toEqual({
      actorId: s.actorId,
      operation: 'dimensional-scaling',
      evidence: rec(f.proposal.request).evidence,
    });
    expect(s.result.state).toBe('derived');
    if (s.result.state !== 'derived') throw new Error('Complete supplied operands expected');
    expect(s.result).toEqual({
      state: 'derived',
      operation: 'dimensional-scaling',
      sourceState: 'known',
      exponent: s.template === 'square-area' ? 2 : 3,
      operandIds: [s.scale.id, s.original.id],
      operands: [rec(a.amount).value, rec(b.amount).value],
      result: { numerator: s.template === 'square-area' ? 12 : 1, denominator: 1 },
      basis: b.basis,
      evidence: [
        a.evidence,
        b.evidence,
        rec(f.proposal.request).evidence,
        rec(f.proposal.result).evidence,
      ],
    });
  }
}

describe('STEP15 explicit region facts and exact authored dimensional scaling', () => {
  it('persists complete version1 raw positives and all56 existing-format negatives', () => {
    expect([packet.version, packet.pack, packet.negativeFormat]).toEqual([
      1,
      'geometry',
      'explicit-path-edits-and-complete-clause-replacements',
    ]);
    expect(fixtures.map((f) => [f.id, f.negatives.length])).toEqual([
      ['63', 24],
      ['64', 26],
      ['63', 3],
      ['64', 3],
    ]);
    expect(EXPANSION_DIMENSIONAL_OPERATIONS).toEqual(['dimensional-scaling']);
    for (const f of fixtures) {
      expect(f.sourceText).toBe(f.words.map((w) => w.text).join(' '));
      expect(f.window.endWord).toBe(f.words.length - 1);
      expect(new Set(WORDS.map((w) => f.proposal[w])).size).toBe(5);
    }
  });
  for (const [i, f] of fixtures.entries()) {
    it(`${f.id}/${i} complete source facts, IDs, states and BOTH mode parity`, () =>
      exact(f, positive(f)));
    it(`${f.id}/${i} animation offset never rebases region/domain quantities`, () => {
      const s = positive(f),
        offset = 31,
        shift = {
          ...f,
          window: {
            ...f.window,
            startTime: f.window.startTime + offset,
            endTime: f.window.endTime + offset,
          },
          words: f.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset })),
        },
        expected = { ...s };
      for (const field of TIMES) expected[field] += offset;
      expect(positive(shift)).toEqual(expected);
    });
    for (const n of f.negatives)
      it(`${f.id}/${i} rejects ${n.name} BOTH modes with diagnostics`, () =>
        reject({
          ...f,
          proposal: n.proposal,
          words: n.words ?? f.words,
          window: n.window ?? f.window,
          sourceText: n.sourceText ?? f.sourceText,
        }));
  }
  for (const id of ['63', '64'] as const) {
    const negatives: [string, (f: ExpansionSourceFixture) => void][] = [
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
          f.window.startTime = NaN;
        },
      ],
      [
        'nonfinite word',
        (f) => {
          f.words[2].end = Infinity;
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
        'overlap beyond1e-7',
        (f) => {
          f.words[2].start = f.words[1].end - 2e-7;
        },
      ],
      [
        'lead padding',
        (f) => {
          f.words[0].start = 0.249;
        },
      ],
      [
        'tail padding',
        (f) => {
          f.words[f.words.length - 1].end = 9.651;
        },
      ],
      [
        'outside window',
        (f) => {
          f.words[0].start = -0.1;
        },
      ],
      [
        'fractional window index',
        (f) => {
          f.window.endWord = 0.5;
        },
      ],
      [
        'raw SVG',
        (f) => {
          f.proposal.svg = '<svg/>';
        },
      ],
      [
        'raw HTML',
        (f) => {
          f.proposal.html = '<div/>';
        },
      ],
      [
        'camera',
        (f) => {
          f.proposal.camera = [1, 2, 3];
        },
      ],
      [
        'mesh',
        (f) => {
          f.proposal.mesh = 'custom';
        },
      ],
      [
        'URL',
        (f) => {
          f.proposal.url = 'https://example.invalid';
        },
      ],
      [
        'file',
        (f) => {
          f.proposal.file = '/tmp/map';
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
        'record extras',
        (f) => {
          f.proposal.records = Array.from({ length: 13 }, () => ({}));
        },
      ],
      [
        'relation extras',
        (f) => {
          f.proposal.relations = Array.from({ length: 17 }, () => ({}));
        },
      ],
    ];
    for (const [name, mutate] of negatives)
      it(`${id} rejects ${name} BOTH modes with diagnostics`, () => {
        const f = base(id);
        mutate(f);
        reject(f);
      });
    for (let i = 1; i < 5; i++)
      it(`${id} strict one-second gap${i}`, () => {
        const f = base(id),
          at = Number(f.proposal[WORDS[i]]),
          prev = i === 1 ? 0.3 : f.words[Number(f.proposal[WORDS[i - 1]])].start,
          delta = prev + 1 - 2e-7 - f.words[at].start;
        for (let j = at; j < f.words.length; j++) {
          if (j > at && /[.!?;]$/.test(f.words[j - 1].text)) break;
          f.words[j].start += delta;
          f.words[j].end += delta;
        }
        reject(f);
      });
    it(`${id} strict .8 final hold`, () => {
      const f = base(id),
        at = Number(f.proposal.resolveWord),
        start = 9.2000002,
        count = f.words.length - at;
      // Keep the complete clause positive/nonoverlapping and inside source padding:
      // this must fail the final-hold guard, not an unrelated tail/interval guard.
      for (let j = 0; j < count; j++) {
        f.words[at + j].start = Number((start + ((9.65 - start) * j) / count).toFixed(9));
        f.words[at + j].end = Number((start + ((9.65 - start) * (j + 1)) / count).toFixed(9));
      }
      reject(f);
      expect(run(f).ctx.issues.some((issue) => issue.includes('final hold'))).toBe(true);
    });
    it(`${id} permits only1e-7 interval tolerance without altering facts`, () => {
      const f = base(id);
      f.words[2].start = f.words[1].end - 5e-8;
      positive(f);
    });
  }
  it('63 overlap never adds membership in the other region or grants permission', () => {
    const s = positive(base('63'));
    if (s.storyId !== '63') throw new Error('Region');
    expect(s.membership.regionId).toBe(s.regionIds[0]);
    expect(s.restriction.regionId).toBe(s.regionIds[1]);
    expect(s.overlap).toMatchObject({ state: 'known', value: 'overlap' });
    expect(Object.keys(s.result).sort()).toEqual(['actorId', 'claim', 'evidence', 'state']);
  });
  for (const state of ['unknown', 'missing', 'disputed'] as const) {
    it(`63 ${state} region assertions never become inside/access/overlap`, () => {
      const f = base('63'),
        edits: Edit[] = [];
      for (const field of ['membership', 'restriction', 'overlap'])
        edits.push(
          { path: [field, 'state'], value: state },
          { path: [field, 'qualifier'], value: state },
          { path: [field, 'value'], remove: true },
        );
      const revised = authored(
          f,
          {
            '1': `Ada membership for Member in Inner remains ${state} for lab during lesson.`,
            '2': `Ada restriction for Outer remains ${state} for lab during lesson.`,
            '3': `Ada overlap for Inner and Outer remains ${state} for lab during lesson.`,
          },
          edits,
        ),
        s = positive(revised);
      if (s.storyId !== '63') throw new Error('Region');
      for (const fact of [s.membership, s.restriction, s.overlap]) {
        expect(fact.state).toBe(state);
        expect(fact).not.toHaveProperty('value');
      }
      const p = structuredClone(revised);
      rec(p.proposal.membership).value = 0;
      reject(p);
    });
    it(`64 ${state} operands preserve source and produce no numerical output`, () => {
      const f = base('64'),
        q = rec(f.proposal.scale),
        word = state === 'disputed' ? 'disputed between 2 and 3' : state;
      const edits: Edit[] = [
        { path: ['scale', 'state'], value: state },
        { path: ['scale', 'qualifier'], value: state },
        { path: ['scale', 'amount'], remove: true },
        { path: ['result', 'state'], value: state },
        { path: ['result', 'qualifier'], value: state },
        { path: ['outcome'], value: `remains ${state}` },
      ];
      if (state === 'disputed')
        edits.push({
          path: ['scale', 'alternatives'],
          value: [
            { kind: 'rational', value: { numerator: 2, denominator: 1 } },
            { kind: 'rational', value: { numerator: 3, denominator: 1 } },
          ],
        });
      const revised = authored(
          f,
          {
            '1': `Ada scale factor is ${word} ratio during lesson for lab with denominator 1.`,
            '4': `Ada scaling remains ${state} for lab during lesson.`,
          },
          edits,
        ),
        s = positive(revised);
      if (s.storyId !== '64') throw new Error('Scaling');
      expect(s.scale.quantity).toMatchObject({
        state,
        actor: q.actor,
        claim: q.claim,
        basis: q.basis,
        qualifier: state,
      });
      expect(s.result.state).toBe(state);
      expect(s.result).not.toHaveProperty('result');
      expect(s.result).not.toHaveProperty('operands');
      if (state === 'disputed') expect(s.scale.quantity).toHaveProperty('alternatives');
      const p = structuredClone(revised);
      p.proposal.result = {
        actor: 'Ada',
        state: 'known',
        evidence: rec(revised.proposal.result).evidence,
      };
      p.proposal.outcome = 'worked scaling';
      reject(p);
    });
  }
  for (const id of ['63', '64'] as const)
    for (const state of ['simulated', 'illustrative', 'conditional'] as const)
      it(`${id} preserves explicit ${state} source controls and qualifiers`, () => {
        const f = base(id),
          qualifier = state === 'simulated' ? 'simulation' : 'teaching example',
          condition = 'if scale is uniform',
          clauses: Record<string, string> = {},
          texts = f.sourceText.match(/[^.]+\./g)?.map((s) => s.trim());
        if (!texts) throw new Error('Complete source');
        const fields =
          id === '63' ? ['membership', 'restriction', 'overlap'] : ['scale', 'original'];
        const edits: Edit[] = [];
        if (state === 'conditional') {
          edits.push({ path: ['condition'], value: condition });
          for (const [i, text] of texts.entries())
            clauses[String(i)] = `If scale is uniform, ${text}`;
        } else {
          edits.push({ path: ['evidence'], value: 'illustrative' });
          for (const i of id === '63' ? [1, 2, 3] : [1, 2, 4])
            clauses[String(i)] = `In this ${qualifier}, ${texts[i]}`;
        }
        for (const field of fields)
          edits.push(
            { path: [field, 'state'], value: state },
            {
              path: [field, state === 'conditional' ? 'condition' : 'qualifier'],
              value: state === 'conditional' ? condition : qualifier,
            },
          );
        if (id === '64')
          edits.push(
            { path: ['result', 'state'], value: state },
            {
              path: ['result', state === 'conditional' ? 'condition' : 'qualifier'],
              value: state === 'conditional' ? condition : qualifier,
            },
          );
        const revised = authored(f, clauses, edits),
          s = positive(revised);
        if (s.storyId === '63') {
          for (const fact of [s.membership, s.restriction, s.overlap])
            expect(fact.state).toBe(state);
        } else {
          if (s.result.state !== 'derived') throw new Error('Worked scaling');
          expect(s.result.sourceState).toBe(state);
          expect(s.result[state === 'conditional' ? 'condition' : 'qualifier']).toBe(
            state === 'conditional' ? condition : qualifier,
          );
        }
        const bad = structuredClone(revised);
        if (id === '64')
          bad.proposal.result = {
            actor: 'Ada',
            state: 'known',
            evidence: rec(revised.proposal.result).evidence,
          };
        else {
          rec(bad.proposal.membership).state = 'known';
          delete rec(bad.proposal.membership).qualifier;
          delete rec(bad.proposal.membership).condition;
        }
        reject(bad);
      });
  for (const unit of ['metre', 'centimetre', 'millimetre'])
    it(`64 exact linear scaling with compatible ${unit} retains its unit, not invented area`, () => {
      const revised = authored(
        base('64'),
        {
          '0': 'Ada Board scales a line length for lab during lesson.',
          '2': `Ada original length is 3 ${unit} during lesson for lab.`,
          '3': 'Ada requests a worked line scaling using scale factor and original length for lab during lesson.',
        },
        [
          { path: ['template'], value: 'line-length' },
          { path: ['original', 'claim'], value: 'original length' },
          { path: ['original', 'basis', 'unit'], value: unit },
        ],
      );
      const s = positive(revised);
      if (s.storyId !== '64' || s.result.state !== 'derived') throw new Error('Derived linear');
      expect(s.result).toMatchObject({
        exponent: 1,
        result: { numerator: 6, denominator: 1 },
        basis: { unit },
      });
    });
  for (const slot of ['scale', 'original'] as const)
    it(`64 explicit supplied zero ${slot} is zero, not unknown`, () => {
      const clauses: Record<string, string> =
        slot === 'scale'
          ? { '1': 'Ada scale factor is 0 ratio during lesson for lab with denominator 1.' }
          : { '2': 'Ada original area is 0 square-metre during lesson for lab.' };
      const s = positive(
        authored(base('64'), clauses, [{ path: [slot, 'amount', 'value', 'numerator'], value: 0 }]),
      );
      if (s.storyId !== '64' || s.result.state !== 'derived') throw new Error('Known zero');
      expect(s.result.result).toEqual({ numerator: 0, denominator: 1 });
    });
  it('64 exact arithmetic overflow rejects source-valid bounded operands instead of rounding', () => {
    const revised = authored(
      base('64'),
      { '1': 'Ada scale factor is 1000000000 ratio during lesson for lab with denominator 1.' },
      [{ path: ['scale', 'amount', 'value', 'numerator'], value: 1000000000 }],
    );
    reject(revised);
  });
  it('64 source-valid negative physical quantity is rejected without inventing absolute value', () => {
    const revised = authored(
      base('64'),
      { '2': 'Ada original area is -3 square-metre during lesson for lab.' },
      [{ path: ['original', 'amount', 'value', 'numerator'], value: -3 }],
    );
    reject(revised);
  });
});
