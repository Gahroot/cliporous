import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionProjectionMatrixScene } from '../../remotion/compositions/explainer/expansion/representations/projection-matrix-types';
import type { ExpansionSourceFixture } from './expansion-fixture-words';
import {
  parseExpansionCoordinateProjection,
  parseExpansionMatrixProduct,
} from './expansion-representations-projection-matrix-contract';
import { type TemporalFixtureSeed, temporalSourceFixtures } from './expansion-temporal-fixtures';
import { isRec, makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/representations/projection-matrix.source.json',
    'utf8',
  ),
) as { version: number; pack: string; stories: TemporalFixtureSeed[] };
const fixtures = temporalSourceFixtures(packet.stories);
const modes = ['diagram', 'hybrid'] as const;
const phases = ['setup', 'action', 'response', 'check', 'resolve'] as const;
function rec(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Expected raw record');
  return value;
}
function rows(value: unknown): Rec[] {
  if (!Array.isArray(value)) throw new Error('Expected raw records');
  return value.map(rec);
}
function fixture(id: '53' | '54'): ExpansionSourceFixture {
  const f = fixtures.find((entry) => entry.id === id);
  if (!f) throw new Error(`Missing ${id}`);
  return f;
}
function parse(f: ExpansionSourceFixture, mode: (typeof modes)[number], raw = f.proposal) {
  const ctx = makeParseContext(f.words, f.window);
  const proposal = {
    ...raw,
    visualMode: modes.some((value) => value === raw.visualMode) ? mode : raw.visualMode,
  };
  const scene =
    f.id === '53'
      ? parseExpansionCoordinateProjection(proposal, ctx)
      : parseExpansionMatrixProduct(proposal, ctx);
  return { scene, issues: ctx.issues };
}
function accept(
  f: ExpansionSourceFixture,
  mode: (typeof modes)[number],
): ExpansionProjectionMatrixScene {
  const { scene, issues } = parse(f, mode);
  expect(scene, issues.join('; ')).not.toBeNull();
  expect(issues).toEqual([]);
  if (!scene) throw new Error(issues.join('; '));
  return scene;
}
function clauses(f: ExpansionSourceFixture): string[] {
  return f.sourceText.match(/[^.!?]+(?:\.(?!\d)|[!?])/g)?.map((text) => text.trim()) ?? [];
}
function rewrite(
  f: ExpansionSourceFixture,
  texts: readonly string[],
  proposal = f.proposal,
): ExpansionSourceFixture {
  const result = temporalSourceFixtures([
    {
      ...f,
      proposal,
      negatives: [],
      paraphrases: [
        { name: 'authored test variant', clauses: texts, outcome: String(proposal.outcome) },
      ],
    },
  ])[1];
  if (!result) throw new Error('Missing hydrated variant');
  return result;
}
function parity(f: ExpansionSourceFixture) {
  const a = accept(f, 'diagram'),
    b = accept(f, 'hybrid');
  expect(b).toEqual({ ...a, visualMode: 'hybrid' });
  expect(accept(f, 'diagram')).toEqual(a);
  const offset = 4,
    shifted = {
      ...f,
      words: f.words.map((word) => ({
        ...word,
        start: word.start + offset,
        end: word.end + offset,
      })),
      window: {
        ...f.window,
        startTime: f.window.startTime + offset,
        endTime: f.window.endTime + offset,
      },
    };
  const shiftedScene = accept(shifted, 'diagram');
  expect(shiftedScene).toEqual({
    ...a,
    ...Object.fromEntries(phases.map((phase) => [`${phase}At`, a[`${phase}At`] + offset])),
  });
  const ids = [
    ...a.entities,
    ...a.records,
    ...a.relations,
    ...(a.storyId === '53' ? a.frames : []),
  ].map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.every((id) => id.startsWith(`expansion-${a.storyId}-entity-`))).toBe(true);
}
function timing(f: ExpansionSourceFixture) {
  expect(f.sourceText).toBe(f.words.map((word) => word.text).join(' '));
  expect(f.words[0].start).toBe(f.window.startTime + 0.25);
  expect(f.words.at(-1)?.end).toBe(f.window.endTime - 0.35);
  f.words.forEach((word, i) => {
    expect(Number.isFinite(word.start) && Number.isFinite(word.end)).toBe(true);
    expect(word.end).toBeGreaterThan(word.start);
    expect(word.start).toBeGreaterThanOrEqual(f.window.startTime);
    expect(word.end).toBeLessThanOrEqual(f.window.endTime);
    if (i) expect(word.start).toBeGreaterThanOrEqual(f.words[i - 1].end - 1e-7);
  });
  const scene = accept(f, 'diagram');
  expect(new Set(Object.values(scene.sourceSpans).map((span) => span.fromWord)).size).toBe(5);
  phases.forEach((phase, i) => {
    expect(scene.sourceSpans[phase].fromWord).toBe(f.proposal[`${phase}Word`]);
    if (i) expect(scene[`${phase}At`] - scene[`${phases[i - 1]}At`]).toBeGreaterThanOrEqual(1);
  });
  expect(scene.resolveAt).toBeLessThanOrEqual(f.window.endTime - 0.8);
  expect(f.words.some((word, i) => i && word.start - f.words[i - 1].end > 0.5)).toBe(true);
}
function reject(name: string, f: ExpansionSourceFixture, mutation: (raw: Rec) => void) {
  for (const mode of modes)
    it(`${f.id} rejects ${name} (${mode}) with review diagnostics`, () => {
      const raw = structuredClone(f.proposal);
      mutation(raw);
      const result = parse(f, mode, raw);
      expect(result.scene).toBeNull();
      expect(result.issues.length).toBeGreaterThan(0);
    });
}
function matrixVariant(
  left: readonly (readonly number[])[],
  right: readonly (readonly number[])[],
): ExpansionSourceFixture {
  const f = fixture('54'),
    raw = structuredClone(f.proposal),
    matrices = rows(raw.records),
    texts = clauses(f);
  for (const [i, values] of [left, right].entries()) {
    const matrix = matrices[i];
    matrix.rows = values.map((_, r) => `${i === 0 ? 'R' : 'K'}${r + 1}`);
    matrix.columns = values[0].map((_, c) => `${i === 0 ? 'K' : 'C'}${c + 1}`);
    matrix.values = values.map((row) => row.map((numerator) => ({ numerator, denominator: 1 })));
    texts[i + 1] =
      `Aster ${matrix.label} weights matrix has rows ${(matrix.rows as string[]).join(' and ')} and columns ${(matrix.columns as string[]).join(' and ')} with values ${values.flat().join(', ')} ratio during May among samples with denominator 2.`;
  }
  return rewrite(f, texts, raw);
}

describe('STEP14 source-bound projection and exact matrix-product', () => {
  it('has the frozen routes and derivation whitelist', () => {
    expect(packet.version).toBe(1);
    expect(packet.pack).toBe('representations');
    expect(expansionStory('53').allowedDerivations).toEqual([]);
    expect(expansionStory('54').allowedDerivations).toEqual(['matrix-product']);
    expect(fixtures).toHaveLength(4);
  });
  for (const [index, f] of fixtures.entries()) {
    for (const mode of modes)
      it(`${f.id} fixture ${index} accepts ${mode}`, () => {
        accept(f, mode);
        timing(f);
      });
    it(`${f.id} fixture ${index} full fact/state/source/identity/time parity`, () => parity(f));
    for (const n of f.negatives)
      for (const mode of modes)
        it(`${f.id} ${n.name} rejects ${mode} with review diagnostics`, () => {
          const result = parse(
            { ...f, words: n.words ?? f.words, window: n.window ?? f.window },
            mode,
            n.proposal,
          );
          expect(result.scene).toBeNull();
          expect(result.issues.length).toBeGreaterThan(0);
        });
  }
  for (const id of ['53', '54'] as const) {
    const f = fixture(id);
    for (const [field, cap] of [
      ['entities', 8],
      ['records', 12],
      ['relations', 16],
    ] as const)
      reject(`${field} cap`, f, (raw) => {
        raw[field] = Array.from({ length: cap + 1 }, () => structuredClone(rows(raw[field])[0]));
      });
    for (const field of [
      'svg',
      'html',
      'url',
      'file',
      'function',
      'coordinates',
      'camera',
      'mesh',
      'id',
      'treatment',
      'valueAt',
      'products',
    ])
      reject(`extra ${field}`, f, (raw) => {
        raw[field] = 'untrusted';
      });
    reject('same clause beats', f, (raw) => {
      raw.responseWord = raw.actionWord;
    });
    reject('invented resolve', f, (raw) => {
      raw.outcome = 'winning result';
    });
    for (const mode of modes)
      it(`${id} rejects invalid word/window/beat timing ${mode}`, () => {
        for (const patch of [
          { start: Number.NaN },
          { end: Number.POSITIVE_INFINITY },
          { end: f.words[1].start },
          { start: f.words[0].end - 1e-6 },
          { start: -1 },
          { end: 13 },
        ]) {
          const words = f.words.map((word) => ({ ...word }));
          words[1] = { ...words[1], ...patch };
          expect(parse({ ...f, words }, mode).scene).toBeNull();
        }
        for (const endTime of [4.99, 12.01, Number.NaN])
          expect(parse({ ...f, window: { ...f.window, endTime } }, mode).scene).toBeNull();
        const words = f.words.map((word) => ({ ...word }));
        const action = Number(f.proposal.actionWord);
        words[action].start = 1.29;
        words[action].end = 1.3;
        expect(parse({ ...f, words }, mode).scene).toBeNull();
        const final = Number(f.proposal.resolveWord),
          late = f.words.map((word, i) =>
            i >= final ? { ...word, start: word.start + 1, end: word.end + 1 } : word,
          );
        expect(parse({ ...f, words: late }, mode).scene).toBeNull();
      });
  }
  for (const mode of modes) {
    it(`53 preserves supplied unequal signed coordinates, not a projection result (${mode})`, () => {
      const scene = accept(fixture('53'), mode);
      expect(scene.storyId).toBe('53');
      if (scene.storyId !== '53') return;
      expect(
        scene.records.map((record) =>
          'amount' in record.quantity ? record.quantity.amount : null,
        ),
      ).toEqual([
        { kind: 'rational', value: { numerator: -2, denominator: 1 }, notation: '-2' },
        { kind: 'rational', value: { numerator: 7, denominator: 1 }, notation: '7' },
      ]);
      expect(JSON.stringify(scene)).not.toMatch(
        /"(?:derived|result|operation|camera|mesh|position)"/,
      );
    });
    it(`54 period-first denominator stays separate from signed cell captures (${mode})`, () => {
      const f = fixtures.find((entry) => entry.id === '54' && entry !== fixture('54'));
      if (!f) throw new Error('Missing period-first fixture');
      const scene = accept(f, mode);
      if (scene.storyId !== '54') throw new Error('Wrong route');
      expect(
        scene.records[0].cells.map((cell) =>
          'amount' in cell.quantity ? cell.quantity.amount : null,
        ),
      ).toEqual([
        { kind: 'rational', value: { numerator: 1, denominator: 2 }, notation: '1/2' },
        { kind: 'rational', value: { numerator: -2, denominator: 1 }, notation: '-2' },
      ]);
      expect(scene.records[0].basis.denominator).toEqual({ numerator: 2, denominator: 1 });
      expect(scene.products[0].cells[0].result).toEqual({ numerator: -4, denominator: 1 });
    });
    it(`54 retains exact term operands, identities, basis and evidence (${mode})`, () => {
      const scene = accept(fixture('54'), mode);
      if (scene.storyId !== '54') throw new Error('Wrong route');
      const p = scene.products[0];
      expect(p.state).toBe('derived');
      expect(p.cells[0].terms.map((term) => term.product)).toEqual([
        { numerator: 2, denominator: 1 },
        { numerator: -6, denominator: 1 },
      ]);
      expect(p.cells[0].result).toEqual({ numerator: -4, denominator: 1 });
      expect(p.cells[0].state).toBe('derived');
      expect(p.cells[0].basis).toEqual(scene.records[0].basis);
      expect(p.cells[0].evidence).toEqual([
        scene.records[0].evidence,
        scene.records[1].evidence,
        scene.relations[0].evidence,
      ]);
      expect(p.cells[0].terms[0].leftCellId).toBe(scene.records[0].cells[0].id);
    });
    for (const state of ['unknown', 'missing', 'disputed'] as const)
      it(`54 ${state} operand is unavailable, not zero (${mode})`, () => {
        const f = fixture('54'),
          raw = structuredClone(f.proposal),
          matrix = rows(raw.records)[0],
          texts = clauses(f);
        delete matrix.values;
        matrix.state = state;
        matrix.qualifier = state;
        texts[1] = `Aster Left weights matrix has rows R and columns K1 and K2 with values ${state} ratio during May among samples with denominator 2.`;
        const scene = accept(rewrite(f, texts, raw), mode);
        if (scene.storyId !== '54') throw new Error('Wrong route');
        expect(scene.records[0].cells).toEqual([]);
        expect(scene.records[0].state).toBe(state);
        expect(scene.products[0]).toMatchObject({
          state: 'unavailable',
          reason: 'unresolved-operands',
          cells: [],
        });
      });
    for (const state of ['illustrative', 'simulated', 'conditional'] as const)
      it(`54 preserves ${state} calculation qualification (${mode})`, () => {
        const f = fixture('54'),
          raw = structuredClone(f.proposal),
          request = rows(raw.relations)[0],
          texts = clauses(f);
        request.state = state;
        if (state === 'conditional') {
          raw.condition = 'if the operands apply';
          request.condition = raw.condition;
          texts[3] = `If the operands apply, ${texts[3]}`;
        } else {
          raw.evidence = 'illustrative';
          request.qualifier = state === 'illustrative' ? 'teaching example' : 'simulation';
          texts[3] = `In this ${request.qualifier}, ${texts[3]}`;
        }
        const v = rewrite(f, texts, raw),
          scene = accept(v, mode);
        if (scene.storyId !== '54') throw new Error('Wrong route');
        expect(scene.products[0].qualification.state).toBe(state);
        expect(scene.products[0].cells[0].result).toEqual({ numerator: -4, denominator: 1 });
        parity(v);
      });
    it(`54 complete 4x4 matrix preserves 16 distinct cells and four exact terms (${mode})`, () => {
      const identity = Array.from({ length: 4 }, (_, r) =>
          Array.from({ length: 4 }, (_, c) => Number(r === c)),
        ),
        values = [
          [1, -2, 3, 0],
          [4, 5, 6, 7],
          [8, 9, 10, 11],
          [-12, 13, 14, 15],
        ],
        v = matrixVariant(identity, values),
        scene = accept(v, mode);
      if (scene.storyId !== '54') throw new Error('Wrong route');
      expect(scene.products[0].cells).toHaveLength(16);
      expect(new Set(scene.products[0].cells.map((cell) => cell.id)).size).toBe(16);
      expect(scene.products[0].cells.map((cell) => cell.result.numerator)).toEqual(values.flat());
      expect(scene.products[0].cells.every((cell) => cell.terms.length === 4)).toBe(true);
      parity(v);
    });
    it(`54 supplied zero is an actual zero product (${mode})`, () => {
      const scene = accept(matrixVariant([[0]], [[3]]), mode);
      if (scene.storyId !== '54') throw new Error('Wrong route');
      expect(scene.products[0].cells[0].result).toEqual({ numerator: 0, denominator: 1 });
    });
    for (const [name, left, right] of [
      ['term overflow', [[1000000000]], [[2]]],
      ['sum overflow', [[1000000000, 1000000000]], [[1], [1]]],
    ] as const)
      it(`54 rejects ${name} (${mode})`, () => {
        const result = parse(matrixVariant(left, right), mode);
        expect(result.scene).toBeNull();
        expect(result.issues.join(' ')).toContain('overflow');
      });
  }
  for (const dimension of ['rows', 'columns'] as const)
    reject(`matrix ${dimension} >4`, fixture('54'), (raw) => {
      rows(raw.records)[0][dimension] = ['A', 'B', 'C', 'D', 'E'];
    });
  reject('frame cap', fixture('53'), (raw) => {
    raw.frames = Array.from({ length: 9 }, () => structuredClone(rows(raw.frames)[0]));
  });
});
