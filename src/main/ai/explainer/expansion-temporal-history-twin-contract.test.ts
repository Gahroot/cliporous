import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONCEPT_FIXTURE_PADDING } from '../../remotion/compositions/explainer/concepts/fixture-words';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import type { ExpansionHistoryTwinScene } from '../../remotion/compositions/explainer/expansion/temporal/history-twin-types';
import type { ExpansionEvidenceSpan } from '../../remotion/compositions/explainer/expansion/value-types';
import { expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionAlignedStateComparison,
  parseExpansionHysteresis,
} from './expansion-temporal-history-twin-contract';
import { isRec, makeParseContext, type PlannerWord, type Rec, type SceneWindow } from './kind-spec';

type Edit = { path: (string | number)[]; value?: unknown; remove?: boolean };
type Negative = { name: string; edits: Edit[]; clauses?: Record<string, string> };
type RawSource = { id: '47' | '48'; clauses: string[]; proposal: Rec; negatives: Negative[] };
type Fixture = RawSource & {
  words: PlannerWord[];
  window: SceneWindow;
  sourceText: string;
  spans: ExpansionEvidenceSpan[];
};
const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/temporal/history-twin.source.json',
    'utf8',
  ),
) as {
  version: number;
  pack: string;
  negativeFormat: string;
  timing: {
    durationSec: number;
    clauseStarts: number[];
    interClausePauseSec: number;
    leadInSec: number;
    tailSec: number;
  };
  stories: RawSource[];
  paraphrases: RawSource[];
};
const WORDS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
const MODES = ['diagram', 'hybrid'] as const;
function rec(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Expected an actual source object');
  return value;
}
function rows(value: unknown): Rec[] {
  if (!Array.isArray(value) || !value.every(isRec))
    throw new Error('Expected actual source records');
  return value;
}
/** Test-only hydration. Text and proposal facts are authored in JSON, never filled by a parser. */
function speech(clauses: readonly string[], starts = packet.timing.clauseStarts) {
  const spoken = expansionFixtureSpeech(clauses, packet.timing.durationSec);
  if (starts.length !== clauses.length)
    throw new Error('Every clause needs an explicit authored start');
  for (const [i, span] of spoken.spans.entries()) {
    const start = starts[i];
    const end =
      i === clauses.length - 1
        ? packet.timing.durationSec - packet.timing.tailSec
        : starts[i + 1] - packet.timing.interClausePauseSec;
    const count = span.toWord - span.fromWord + 1;
    if (!(end > start)) throw new Error('Authored clause pause cannot eat its speech');
    for (let j = 0; j < count; j++) {
      spoken.words[span.fromWord + j].start = Number(
        (start + (j * (end - start)) / count).toFixed(9),
      );
      spoken.words[span.fromWord + j].end = Number(
        (start + ((j + 1) * (end - start)) / count).toFixed(9),
      );
    }
  }
  return { ...spoken, spans: spoken.spans.map((s) => ({ ...s })) };
}
function hydrate(raw: RawSource): Fixture {
  return { ...structuredClone(raw), ...speech(raw.clauses) };
}
const fixtures = [...packet.stories, ...packet.paraphrases].map(hydrate);
function canonical(id: '47' | '48'): Fixture {
  const f = fixtures.find((s) => s.id === id);
  if (!f) throw new Error(`Missing canonical ${id}`);
  return structuredClone(f);
}
function parse(f: Fixture, proposal = f.proposal) {
  const ctx = makeParseContext(f.words, f.window);
  const scene =
    f.id === '47'
      ? parseExpansionHysteresis(proposal, ctx)
      : parseExpansionAlignedStateComparison(proposal, ctx);
  return { scene, ctx };
}
function positive(f: Fixture): ExpansionHistoryTwinScene {
  const result = parse(f);
  expect(result.ctx.issues).toEqual([]);
  expect(result.scene).not.toBeNull();
  if (!result.scene) throw new Error(`Rejected actual positive ${f.id}`);
  return result.scene;
}
function parity(f: Fixture): ExpansionHistoryTwinScene {
  const before = structuredClone(f);
  const scene = positive(f);
  for (const visualMode of MODES) {
    const r = parse(f, { ...f.proposal, visualMode });
    expect(r.ctx.issues).toEqual([]);
    expect(r.scene).toEqual({ ...scene, visualMode });
  }
  expect(parse(f, structuredClone(f.proposal)).scene).toEqual(scene);
  expect(f).toEqual(before);
  return scene;
}
function reject(f: Fixture): void {
  for (const visualMode of MODES) expect(parse(f, { ...f.proposal, visualMode }).scene).toBeNull();
}
function pick(raw: Rec, fields: readonly string[]): Rec {
  return Object.fromEntries(fields.filter((k) => raw[k] !== undefined).map((k) => [k, raw[k]]));
}
/** Independent full expectation for all four persisted, nonnumeric source packets. */
function exact(f: Fixture, scene: ExpansionHistoryTwinScene) {
  const p = f.proposal;
  const entities = rows(p.entities).map((e, i) => ({
    id: expansionEntityId(f.id, i),
    label: e.label,
    evidence: e.evidence,
  }));
  function id(label: unknown): string {
    const entity = entities.find((e) => e.label === label);
    if (!entity) throw new Error('Expected a declared source label');
    return entity.id;
  }
  const statusFields = ['state', 'condition', 'qualification', 'evidence'];
  const expected: Rec = {
    ...pick(p, [
      'kind',
      'preset',
      'template',
      'visualMode',
      'evidence',
      'label',
      'subject',
      'outcome',
      'scope',
      'period',
    ]),
    storyId: f.id,
    entities,
    actorId: id(p.actor),
  };
  for (const [i, field] of WORDS.entries()) {
    const index = p[field];
    if (typeof index !== 'number') throw new Error('Expected an actual word-index beat');
    expected[TIMES[i]] = i === 0 ? f.window.startTime + 0.3 : f.words[index].start;
  }
  const result = rec(p.result);
  if (f.id === '47') {
    const history = rows(p.history).map((h, i) => ({
      id: `expansion-47-history-${i}`,
      actorId: id(h.actor),
      dataTime: h.dataTime,
      retained: true,
      ...pick(h, statusFields),
      ...(h.value === undefined ? {} : { valueId: id(h.value) }),
    }));
    Object.assign(expected, {
      stateIds: (p.states as string[]).map(id),
      thresholds: [],
      history,
      rules: rows(p.rules).map((r) => ({
        id: `expansion-47-rule-${r.role}`,
        role: r.role,
        actorId: id(r.actor),
        fromId: id(r.from),
        toId: id(r.to),
        ...pick(r, statusFields),
      })),
      result: {
        actorId: id(result.actor),
        claim: result.claim,
        retainedHistoryIds: history.map((h) => h.id),
        ...pick(result, statusFields),
        ...(result.value === undefined ? {} : { valueId: id(result.value) }),
      },
    });
  } else {
    const a = rec(p.alignment);
    const snapshots = rows(p.snapshots).map((s, i) => ({
      id: `expansion-48-snapshot-${i}`,
      actorId: id(s.actor),
      viewId: id(s.view),
      ...pick(s, ['claim', 'dataTime', 'controls', 'value', ...statusFields]),
    }));
    Object.assign(expected, {
      viewIds: (p.views as string[]).map(id),
      snapshots,
      quantities: [],
      alignment: {
        actorId: id(a.actor),
        viewIds: [id(a.left), id(a.right)],
        retainsSourceControls: true,
        evidence: a.evidence,
      },
      result: {
        actorId: id(result.actor),
        claim: result.claim,
        snapshotIds: snapshots.map((s) => s.id),
        ...pick(result, [...statusFields, 'result']),
      },
    });
  }
  expect(scene).toEqual(expected);
}
/** Reindex only complete clause references and animation word indices after authored text edits. */
function rewrite(
  f: Fixture,
  clauses: string[],
  change: (p: Rec, spans: ExpansionEvidenceSpan[]) => void = () => {},
  starts = packet.timing.clauseStarts,
  mapping = [0, 1, 2, 3, 4],
): Fixture {
  const next = speech(clauses, starts);
  function remap(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(remap);
    if (!isRec(value)) return value;
    if (Object.keys(value).length === 2 && 'fromWord' in value && 'toWord' in value) {
      const oldIndex = f.spans.findIndex(
        (s) => s.fromWord === value.fromWord && s.toWord === value.toWord,
      );
      const span = next.spans[mapping[oldIndex]];
      if (!span) throw new Error('Only complete clause evidence can be reauthored');
      return { ...span };
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v)]));
  }
  const proposal = rec(remap(f.proposal));
  for (const [i, field] of WORDS.entries()) proposal[field] = next.spans[mapping[i]].fromWord;
  proposal.startWord = 0;
  proposal.endWord = next.window.endWord;
  change(proposal, next.spans);
  return { ...f, clauses, ...next, proposal };
}
/** Same explicit edit format as story41, including complete clause replacements. */
function negative(f: Fixture, n: Negative): Fixture {
  const clauses = f.clauses.map((c, i) => n.clauses?.[String(i)] ?? c);
  const next = n.clauses ? rewrite(f, clauses) : structuredClone(f);
  for (const edit of n.edits) {
    let owner: unknown = next.proposal;
    for (const key of edit.path.slice(0, -1)) {
      if (!isRec(owner) && !Array.isArray(owner)) throw new Error('Explicit edit parent missing');
      owner = (owner as Record<string | number, unknown>)[key];
    }
    if (!isRec(owner) && !Array.isArray(owner)) throw new Error('Explicit edit owner missing');
    const key = edit.path.at(-1);
    if (key === undefined) throw new Error('Explicit nonempty path required');
    const target = owner as Record<string | number, unknown>;
    if (edit.remove) delete target[key];
    else target[key] = structuredClone(edit.value);
  }
  return next;
}
function exactQuantity(
  actor: string,
  claim: string,
  population: string,
  period: string,
  evidence: ExpansionEvidenceSpan,
  value = 3,
): Rec {
  return {
    actor,
    claim,
    state: 'known',
    basis: { unit: 'second', population, period },
    amount: { kind: 'rational', value: { numerator: value, denominator: 1 } },
    evidence,
  };
}
function quantities47(): Fixture {
  const f = canonical('47');
  return rewrite(
    f,
    [
      f.clauses[0],
      'If duration exceeds enter threshold, Fan enters On from Off for chamber during shift A.',
      'Fan enter threshold is 3 seconds during shift A for chamber.',
      'If duration falls below leave threshold, Fan leaves On for Off for chamber during shift A.',
      'Fan leave threshold is unknown seconds during shift A for chamber.',
      f.clauses[3],
      f.clauses[4],
    ],
    (p, spans) => {
      const rules = rows(p.rules);
      rules[0].condition = 'If duration exceeds enter threshold';
      rules[0].threshold = 'enter threshold';
      rules[1].condition = 'If duration falls below leave threshold';
      rules[1].threshold = 'leave threshold';
      p.thresholds = [
        {
          role: 'enter',
          quantity: exactQuantity('Fan', 'enter threshold', 'chamber', 'shift A', spans[2]),
        },
        {
          role: 'leave',
          quantity: {
            actor: 'Fan',
            claim: 'leave threshold',
            state: 'unknown',
            qualifier: 'unknown',
            basis: { unit: 'second', population: 'chamber', period: 'shift A' },
            evidence: spans[4],
          },
        },
      ];
    },
    [0.25, 1.8, 3, 4.3, 5.5, 7, 9.2],
    [0, 1, 3, 5, 6],
  );
}
function quantities48(): Fixture {
  const f = canonical('48');
  return rewrite(
    f,
    [
      f.clauses[0],
      f.clauses[1].replace('locked valve', 'wait limit'),
      'Pump wait limit is 3 seconds during run A for bench.',
      f.clauses[2].replace('locked valve', 'wait limit'),
      'Pump wait limit is missing seconds during run A for bench.',
      f.clauses[3],
      f.clauses[4],
    ],
    (p, spans) => {
      for (const s of rows(p.snapshots)) s.controls = ['wait limit'];
      p.quantities = [
        {
          view: 'Reference',
          quantity: exactQuantity('Pump', 'wait limit', 'bench', 'run A', spans[2]),
        },
        {
          view: 'Model',
          quantity: {
            actor: 'Pump',
            claim: 'wait limit',
            state: 'missing',
            qualifier: 'missing',
            basis: { unit: 'second', population: 'bench', period: 'run A' },
            evidence: spans[4],
          },
        },
      ];
    },
    [0.25, 1.8, 3, 4.3, 5.5, 7, 9.2],
    [0, 1, 3, 5, 6],
  );
}

describe('step13 local source hysteresis and aligned state comparison', () => {
  it('persists bounded raw version1 canonical and independent paraphrase packets with existing explicit edits', () => {
    expect([packet.version, packet.pack, packet.negativeFormat]).toEqual([
      1,
      'temporal',
      'explicit-path-edits-and-complete-clause-replacements',
    ]);
    expect(packet.stories.map((s) => [s.id, s.negatives.length])).toEqual([
      ['47', 23],
      ['48', 25],
    ]);
    expect(packet.paraphrases.map((s) => [s.id, s.negatives.length])).toEqual([
      ['47', 2],
      ['48', 2],
    ]);
    expect(packet.timing.leadInSec).toBe(CONCEPT_FIXTURE_PADDING.leadInSec);
    expect(packet.timing.tailSec).toBe(CONCEPT_FIXTURE_PADDING.tailSec);
    for (const f of fixtures) {
      expect(f.clauses).toHaveLength(5);
      expect(f.sourceText).toBe(f.clauses.join(' '));
      expect(f.proposal.endWord).toBe(f.words.length - 1);
      expect(WORDS.map((w) => f.proposal[w])).toEqual(f.spans.map((s) => s.fromWord));
      expect(f.words[0].start).toBe(0.25);
      expect(f.words.at(-1)?.end).toBe(11.65);
      for (let i = 1; i < f.spans.length; i++)
        expect(f.words[f.spans[i].fromWord].start - f.words[f.spans[i - 1].toWord].end).toBeCloseTo(
          0.2,
          9,
        );
      expect(new Set(f.negatives.map((n) => n.name)).size).toBe(f.negatives.length);
    }
    expect(fixtures[0].sourceText).not.toBe(fixtures[2].sourceText);
    expect(fixtures[1].sourceText).not.toBe(fixtures[3].sourceText);
  });
  for (const [i, f] of fixtures.entries()) {
    it(`${f.id}/${i}: exact both-mode fact, ID, source, qualification, history and beat parity`, () => {
      const scene = parity(f);
      exact(f, scene);
      for (let j = 1; j < TIMES.length; j++)
        expect(scene[TIMES[j]] - scene[TIMES[j - 1]]).toBeGreaterThanOrEqual(1);
      expect(f.window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
      expect(scene).not.toHaveProperty('derived');
      expect(scene).not.toHaveProperty('winner');
      expect(scene.result).not.toHaveProperty('amount');
    });
    it(`${f.id}/${i}: time translation changes only animation beats, never domain times or facts`, () => {
      const scene = positive(f);
      const offset = 17.25;
      const moved = {
        ...f,
        words: f.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset })),
        window: { ...f.window, startTime: offset, endTime: f.window.endTime + offset },
      };
      const shifted = parity(moved);
      const expected = { ...scene };
      for (const field of TIMES) expected[field] += offset;
      expect(shifted).toEqual(expected);
    });
    for (const n of f.negatives)
      it(`${f.id}/${i}: rejects raw ${n.name} in both modes`, () => {
        const bad = negative(f, n);
        // Wrong mode is itself the invalid fact; do not overwrite it with a valid mode.
        if (n.edits.some((e) => e.path[0] === 'visualMode')) expect(parse(bad).scene).toBeNull();
        else reject(bad);
      });
  }
  for (const id of ['47', '48'] as const) {
    for (const [name, mutate] of [
      [
        'window below five seconds',
        (f: Fixture) => {
          f.window.endTime = 4.99;
        },
      ],
      [
        'window above twelve seconds',
        (f: Fixture) => {
          f.window.endTime = 12.01;
        },
      ],
      [
        'nonfinite window',
        (f: Fixture) => {
          f.window.endTime = Infinity;
        },
      ],
      [
        'nonfinite nonbeat word',
        (f: Fixture) => {
          f.words[5].end = NaN;
        },
      ],
      [
        'nonfinite start',
        (f: Fixture) => {
          f.words[4].start = -Infinity;
        },
      ],
      [
        'zero word interval',
        (f: Fixture) => {
          f.words[4].end = f.words[4].start;
        },
      ],
      [
        'negative word interval',
        (f: Fixture) => {
          f.words[4].end = f.words[4].start - 0.1;
        },
      ],
      [
        'word overlap beyond tolerance',
        (f: Fixture) => {
          f.words[4].start = f.words[3].end - 2e-7;
        },
      ],
      [
        'speech outside window',
        (f: Fixture) => {
          f.words[0].start = -0.01;
        },
      ],
      [
        'lead in erased',
        (f: Fixture) => {
          f.words[0].start = 0.249999;
        },
      ],
      [
        'tail erased',
        (f: Fixture) => {
          f.words[f.words.length - 1].end = 11.650001;
        },
      ],
      [
        'fractional window index',
        (f: Fixture) => {
          f.window.startWord = 0.5;
        },
      ],
      [
        'scene cuts source clause',
        (f: Fixture) => {
          f.window.startWord = 1;
          f.proposal.startWord = 1;
        },
      ],
      [
        'foreign source span',
        (f: Fixture) => {
          rec(f.proposal.result).evidence = { ...f.spans[0] };
        },
      ],
      [
        'trimmed source span',
        (f: Fixture) => {
          rec(f.proposal.result).evidence = {
            fromWord: f.spans[4].fromWord + 1,
            toWord: f.spans[4].toWord,
          };
        },
      ],
      [
        'source URL',
        (f: Fixture) => {
          f.words[5].text = 'https://example.com';
        },
      ],
      [
        'unbounded label',
        (f: Fixture) => {
          f.proposal.label = 'a'.repeat(49);
        },
      ],
      [
        'invented blanket condition',
        (f: Fixture) => {
          f.proposal.condition = 'If demand is high';
        },
      ],
      [
        'coordinates',
        (f: Fixture) => {
          f.proposal.coordinates = [0, 1];
        },
      ],
      [
        'file directive',
        (f: Fixture) => {
          f.proposal.file = '/tmp/external';
        },
      ],
      [
        'function directive',
        (f: Fixture) => {
          f.proposal.evaluate = () => 0;
        },
      ],
      [
        'template function',
        (f: Fixture) => {
          f.proposal.template = () => 'same-subject-pair';
        },
      ],
    ] as const)
      it(`${id}: rejects ${name}`, () => {
        const f = canonical(id);
        mutate(f);
        reject(f);
      });
    for (let gap = 1; gap <= 4; gap++)
      it(`${id}: rejects compressed gap ${gap}, even inside shared beat epsilon`, () => {
        const starts = [...packet.timing.clauseStarts];
        starts[gap] = (gap === 1 ? 0.3 : starts[gap - 1]) + 1 - 2e-7;
        reject(rewrite(canonical(id), canonical(id).clauses, () => {}, starts));
      });
    it(`${id}: rejects final hold below .8s, even inside shared beat epsilon`, () => {
      reject(
        rewrite(canonical(id), canonical(id).clauses, () => {}, [0.25, 2.4, 4.65, 6.9, 11.2000002]),
      );
    });
    it(`${id}: admits only nonoverlap tolerance up to 1e-7`, () => {
      const f = canonical(id);
      f.words[4].start = f.words[3].end - 5e-8;
      parity(f);
    });
    for (const [index, change] of [
      [1, (text: string) => text.replace(String(canonical(id).proposal.actor), 'Other actor')],
      [
        1,
        (text: string) =>
          text.replace('for chamber', 'for other chamber').replace('for bench', 'for other bench'),
      ],
      [2, (text: string) => text.replace('shift A', 'shift B').replace('run A', 'run B')],
      [
        3,
        (text: string) =>
          text
            .replace('records Off', 'never records Off')
            .replace('aligns Reference', 'does not align Reference'),
      ],
      [4, (text: string) => text.replace('remains unknown', 'may remain unknown')],
    ] as const)
      it(`${id}: rejects actor/scope/period/negation/modal source substitution at clause ${index}`, () => {
        const f = canonical(id);
        const clauses = [...f.clauses];
        clauses[index] = change(clauses[index]);
        reject(rewrite(f, clauses));
      });
  }
  for (const [id, make] of [
    ['47', quantities47],
    ['48', quantities48],
  ] as const) {
    it(`${id}: exact supplied seconds and absent operands remain facts, not derived animation times or zero`, () => {
      const f = make();
      const scene = parity(f);
      const supplied = scene.storyId === '47' ? scene.thresholds : scene.quantities;
      expect(supplied).toHaveLength(2);
      expect(supplied[0].quantity).toMatchObject({
        actor: f.proposal.actor,
        state: 'known',
        basis: { unit: 'second', population: f.proposal.scope, period: f.proposal.period },
        amount: { kind: 'rational', value: { numerator: 3, denominator: 1 }, notation: '3' },
      });
      expect(supplied[1].quantity.state).toBe(id === '47' ? 'unknown' : 'missing');
      expect(supplied[1].quantity).not.toHaveProperty('amount');
      expect(scene.result.state).toBe('unknown');
      const offset = 40;
      const moved = {
        ...f,
        words: f.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset })),
        window: { ...f.window, startTime: offset, endTime: f.window.endTime + offset },
      };
      const shifted = parity(moved);
      const expected = { ...scene };
      for (const field of TIMES) expected[field] += offset;
      expect(shifted).toEqual(expected);
    });
    for (const [name, edit] of [
      ['actor', { path: ['actor'], value: 'Other actor' }],
      ['claim', { path: ['claim'], value: 'different claim' }],
      ['population', { path: ['basis', 'population'], value: 'other scope' }],
      ['period', { path: ['basis', 'period'], value: 'other period' }],
      ['unit', { path: ['basis', 'unit'], value: 'hours' }],
      ['unknown unit', { path: ['basis', 'unit'], value: 'telemetry' }],
      ['new value', { path: ['amount', 'value', 'numerator'], value: 4 }],
      ['unit kind', { path: ['amount', 'kind'], value: 'money' }],
      ['denominator', { path: ['basis', 'denominator'], value: { numerator: 0, denominator: 1 } }],
      ['caller ID', { path: ['id'], value: 'external-control' }],
      ['derived value', { path: ['derived'], value: { result: 3 } }],
    ] as const)
      it(`${id}: rejects exact quantity ${name} mismatch`, () => {
        const f = make();
        const field = id === '47' ? 'thresholds' : 'quantities';
        reject(
          negative(f, { name, edits: [{ ...edit, path: [field, 0, 'quantity', ...edit.path] }] }),
        );
      });
    it(`${id}: cannot silently omit a supplied unknown numeric clause`, () => {
      const f = make();
      const field = id === '47' ? 'thresholds' : 'quantities';
      rows(f.proposal[field]).pop();
      reject(f);
    });
    it(`${id}: absent quantity is not a zero operand`, () => {
      const f = make();
      const field = id === '47' ? 'thresholds' : 'quantities';
      rec(rows(f.proposal[field])[1].quantity).amount = {
        kind: 'rational',
        value: { numerator: 0, denominator: 1 },
      };
      reject(f);
    });
  }
  it('47 retains multiple known and unknown history records rather than overwriting the earlier record', () => {
    const f = canonical('47');
    const many = rewrite(
      f,
      [
        f.clauses[0],
        f.clauses[1],
        f.clauses[2],
        f.clauses[3],
        'Fan history at sample B remains unknown and is retained for chamber during shift A.',
        f.clauses[4].replace('sample A history', 'sample A and sample B history'),
      ],
      (p, spans) => {
        rows(p.history).push({
          actor: 'Fan',
          dataTime: 'sample B',
          state: 'unknown',
          qualification: 'unknown',
          evidence: spans[4],
        });
      },
      [0.25, 2.2, 4.4, 6.6, 7.8, 9.2],
      [0, 1, 2, 3, 5],
    );
    const scene = parity(many);
    if (scene.storyId !== '47') throw new Error('Expected local47');
    expect(scene.history.map((h) => [h.dataTime, h.state, h.retained])).toEqual([
      ['sample A', 'known', true],
      ['sample B', 'unknown', true],
    ]);
    expect(scene.result.retainedHistoryIds).toEqual(scene.history.map((h) => h.id));
    const erased = structuredClone(many);
    rows(erased.proposal.history).pop();
    reject(erased);
  });
  it('47 accepts a separately source-stated current state without evaluating enter/leave rules', () => {
    const f = canonical('47');
    const supplied = rewrite(
      f,
      [...f.clauses.slice(0, 4), f.clauses[4].replace('remains unknown', 'is On')],
      (p) => {
        p.outcome = 'is On';
        p.result = {
          actor: 'Fan',
          claim: 'current state',
          state: 'known',
          value: 'On',
          evidence: rec(p.result).evidence,
        };
      },
    );
    const scene = parity(supplied);
    if (scene.storyId !== '47') throw new Error('Expected local47');
    expect(scene.history[0]).toMatchObject({ valueId: scene.stateIds[0] });
    expect(scene.result).toMatchObject({ state: 'known', valueId: scene.stateIds[1] });
  });
  it('48 admits only an expressly supplied qualified comparison, never an inferred state difference', () => {
    const f = canonical('48');
    const supplied = rewrite(
      f,
      [
        ...f.clauses.slice(0, 4),
        'In this simulation, Pump state comparison is different and retains qualified states for bench during run A.',
      ],
      (p) => {
        p.outcome = 'is different';
        p.result = {
          actor: 'Pump',
          claim: 'state comparison',
          state: 'simulated',
          qualification: 'simulation',
          result: 'different',
          evidence: rec(p.result).evidence,
        };
      },
    );
    const scene = parity(supplied);
    expect(scene.result).toMatchObject({
      state: 'simulated',
      qualification: 'simulation',
      result: 'different',
    });
    const promoted = rewrite(
      supplied,
      [
        ...supplied.clauses.slice(0, 4),
        'Pump state comparison is different and retains qualified states for bench during run A.',
      ],
      (p) => {
        rec(p.result).state = 'known';
        delete rec(p.result).qualification;
      },
    );
    reject(promoted);
  });
});
