import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import type { ExpansionLanesCriticalScene } from '../../remotion/compositions/explainer/expansion/temporal/lanes-critical-types';
import {
  add,
  compare,
  subtract,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import type { ExpansionRational } from '../../remotion/compositions/explainer/expansion/value-types';
import { expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionCriticalPath,
  parseExpansionParallelLanes,
} from './expansion-temporal-lanes-critical-contract';
import { makeParseContext, type PlannerWord, type Rec, type SceneWindow } from './kind-spec';

interface Edit {
  path: (string | number)[];
  value?: unknown;
  remove?: boolean;
}
interface Negative {
  name: string;
  edits: Edit[];
  clauses?: Record<string, string>;
  intervals?: [number, number][];
}
interface Fixture {
  id: '41' | '42';
  name: string;
  sourceText: string;
  words: PlannerWord[];
  window: SceneWindow;
  proposal: Rec;
  negatives: Negative[];
}
const packet = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/expansion/temporal/lanes-critical.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { version: number; pack: string; stories: Fixture[] };
const MODES = ['diagram', 'hybrid'] as const;
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
const rational = (numerator: number, denominator = 1): ExpansionRational => ({
  numerator,
  denominator,
});
const amount = (numerator: number, denominator = 1) => ({
  kind: 'rational',
  value: rational(numerator, denominator),
});
function fixture(id: '41' | '42', name = 'canonical'): Fixture {
  const f = packet.stories.find((s) => s.id === id && s.name === name);
  if (!f) throw new Error(`Missing ${id}/${name}`);
  return f;
}
function parse(f: Pick<Fixture, 'id' | 'proposal' | 'words' | 'window'>, mode: string) {
  const ctx = makeParseContext(f.words, f.window);
  const raw = { ...f.proposal, visualMode: mode };
  const scene =
    f.id === '41' ? parseExpansionParallelLanes(raw, ctx) : parseExpansionCriticalPath(raw, ctx);
  return { scene, ctx };
}
function positive(
  f: Pick<Fixture, 'id' | 'proposal' | 'words' | 'window'>,
): ExpansionLanesCriticalScene {
  const before = structuredClone(f);
  const diagram = parse(f, 'diagram'),
    hybrid = parse(f, 'hybrid');
  expect(diagram.ctx.issues).toEqual([]);
  expect(hybrid.ctx.issues).toEqual([]);
  expect(diagram.scene).not.toBeNull();
  expect(hybrid.scene).toEqual({ ...diagram.scene, visualMode: 'hybrid' });
  expect(f).toEqual(before);
  if (!diagram.scene) throw new Error('Expected a real scene');
  return diagram.scene;
}
function negative(f: Pick<Fixture, 'id' | 'proposal' | 'words' | 'window'>) {
  for (const mode of MODES) {
    const before = structuredClone(f);
    const result = parse(f, mode);
    expect(result.scene).toBeNull();
    expect(result.ctx.issues.length).toBeGreaterThan(0);
    expect(f).toEqual(before);
  }
}
function clauses(f: Pick<Fixture, 'sourceText'>): string[] {
  return f.sourceText.split(/(?<=[.!?;])\s+/u);
}
/** Test-authoring only: keep each entire clause and its honest speech/pause interval. */
function reauthor(
  f: Fixture,
  replacements: Record<string, string> = {},
  intervals?: [number, number][],
): Fixture {
  const original = expansionFixtureSpeech(clauses(f), f.window.endTime - f.window.startTime);
  const next = clauses(f).map((clause, i) => replacements[String(i)] ?? clause);
  const speech = expansionFixtureSpeech(next, f.window.endTime - f.window.startTime);
  const sourceIntervals =
    intervals ??
    original.spans.map(
      (s) => [f.words[s.fromWord].start, f.words[s.toWord].end] as [number, number],
    );
  for (const [i, span] of speech.spans.entries()) {
    const [start, end] = sourceIntervals[i];
    const count = span.toWord - span.fromWord + 1;
    for (let j = 0; j < count; j++) {
      speech.words[span.fromWord + j].start = +(start + ((end - start) * j) / count).toFixed(9);
      speech.words[span.fromWord + j].end = +(start + ((end - start) * (j + 1)) / count).toFixed(9);
    }
  }
  function rebase(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(rebase);
    if (value && typeof value === 'object') {
      const rec = value as Rec;
      if (Object.keys(rec).length === 2 && 'fromWord' in rec && 'toWord' in rec) {
        const i = original.spans.findIndex(
          (s) => s.fromWord === rec.fromWord && s.toWord === rec.toWord,
        );
        if (i < 0) throw new Error('Only full authored clauses may be rebased');
        return { ...speech.spans[i] };
      }
      return Object.fromEntries(Object.entries(rec).map(([key, entry]) => [key, rebase(entry)]));
    }
    return value;
  }
  const proposal = rebase(f.proposal) as Rec;
  proposal.endWord = speech.window.endWord;
  for (const field of BEATS) {
    const i = original.spans.findIndex((s) => s.fromWord === f.proposal[field]);
    if (i < 0) throw new Error('Beats must anchor complete clauses');
    proposal[field] = speech.spans[i].fromWord;
  }
  return {
    ...f,
    sourceText: speech.sourceText,
    words: speech.words,
    window: speech.window,
    proposal,
  };
}
function apply(f: Fixture, bad: Negative): Fixture {
  const authored = reauthor(f, bad.clauses, bad.intervals);
  for (const edit of bad.edits) {
    const top = edit.path[0];
    let target = (top === 'words' || top === 'window'
      ? authored
      : authored.proposal) as unknown as Rec;
    for (const key of edit.path.slice(0, -1)) {
      const value = target[key];
      if (!value || typeof value !== 'object')
        throw new Error(`Invalid explicit negative path: ${bad.name}`);
      target = value as Rec;
    }
    const key = edit.path[edit.path.length - 1];
    if (edit.remove) delete target[key];
    else target[key] = structuredClone(edit.value);
  }
  return authored;
}
function withoutBeats(scene: ExpansionLanesCriticalScene) {
  return Object.fromEntries(Object.entries(scene).filter(([key]) => !TIMES.some((t) => t === key)));
}
function equal(left: ExpansionRational, right: ExpansionRational) {
  expect(compare(left, right)).toEqual({ ok: true, value: 0 });
}

it('persists four independent real positives and 64 explicit source/schema/quantity negatives', () => {
  expect(packet.version).toBe(1);
  expect(packet.pack).toBe('temporal');
  expect(packet.stories).toHaveLength(4);
  expect(packet.stories.reduce((sum, f) => sum + f.negatives.length, 0)).toBe(64);
  for (const id of ['41', '42'] as const) {
    expect(fixture(id, 'paraphrase').sourceText).not.toBe(fixture(id).sourceText);
    expect(fixture(id, 'paraphrase').proposal.entities).not.toEqual(fixture(id).proposal.entities);
  }
});

for (const f of packet.stories) {
  describe(`${f.id}/${f.name}`, () => {
    it('preserves source facts, identities, status, domain values and all five beats in BOTH modes', () => {
      const scene = positive(f);
      expect(scene.storyId).toBe(f.id);
      expect(scene.entities.map((e) => e.id)).toEqual(
        scene.entities.map((_, i) => expansionEntityId(f.id, i)),
      );
      expect(scene.entities.map((e) => [e.label, e.evidence])).toEqual(
        (f.proposal.entities as Rec[]).map((e) => [e.label, e.evidence]),
      );
      expect(scene.tasks.map((t) => t.id)).toEqual(
        scene.tasks.map((_, i) => `expansion-${f.id}-task-${i}`),
      );
      expect(scene.relations.map((r) => r.id)).toEqual(
        scene.relations.map((_, i) => `expansion-${f.id}-relation-${i}`),
      );
      expect(scene.result.id).toBe(`expansion-${f.id}-result`);
      expect(scene.scope).toBe(f.proposal.scope);
      expect(scene.period).toBe(f.proposal.period);
      expect(scene.actorId).toBe(scene.entities[0].id);
      for (const [i, task] of scene.tasks.entries()) {
        const supplied = (f.proposal.tasks as Rec[])[i].duration as Rec | undefined;
        if (!supplied) expect(task.duration).toBeUndefined();
        else {
          expect(task.duration?.state).toBe(supplied.state);
          expect(task.duration?.evidence).toEqual(supplied.evidence);
          expect(task.duration?.basis).toEqual(supplied.basis);
          expect(task.duration?.actor).toBe(supplied.actor);
          expect(task.duration?.claim).toBe(supplied.claim);
          if (task.duration && 'amount' in task.duration) {
            expect(task.duration.amount).toMatchObject(supplied.amount as Rec);
            expect(task.duration.amount.notation).toBeTruthy();
          }
        }
      }
      expect(f.window.endTime - f.window.startTime).toBeGreaterThanOrEqual(5);
      expect(f.window.endTime - f.window.startTime).toBeLessThanOrEqual(12);
      expect(f.words[0].start - f.window.startTime).toBeCloseTo(0.25, 9);
      expect(f.window.endTime - f.words[f.words.length - 1].end).toBeCloseTo(0.35, 9);
      const source = expansionFixtureSpeech(clauses(f), f.window.endTime - f.window.startTime);
      expect(new Set(BEATS.map((b) => f.proposal[b])).size).toBe(5);
      for (const [i, field] of BEATS.entries()) {
        expect(source.spans.some((s) => s.fromWord === f.proposal[field])).toBe(true);
        if (i > 0) {
          expect(scene[TIMES[i]]).toBe(f.words[f.proposal[field] as number].start);
          expect(scene[TIMES[i]] - scene[TIMES[i - 1]]).toBeGreaterThanOrEqual(1 - 1e-6);
        }
      }
      expect(f.window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
      for (const [i, word] of f.words.entries()) {
        expect(Number.isFinite(word.start) && Number.isFinite(word.end)).toBe(true);
        expect(word.end).toBeGreaterThan(word.start);
        expect(word.start).toBeGreaterThanOrEqual(f.window.startTime);
        expect(word.end).toBeLessThanOrEqual(f.window.endTime);
        if (i) expect(word.start).toBeGreaterThanOrEqual(f.words[i - 1].end - 1e-7);
      }
      expect(positive(f)).toEqual(scene);
    });
    it('rebases only animation beats, NEVER represented duration/schedule facts', () => {
      const scene = positive(f);
      const shifted = {
        ...f,
        words: f.words.map((w) => ({ ...w, start: w.start + 123, end: w.end + 123 })),
        window: {
          ...f.window,
          startTime: f.window.startTime + 123,
          endTime: f.window.endTime + 123,
        },
      };
      const rebased = positive(shifted);
      expect(withoutBeats(rebased)).toEqual(withoutBeats(scene));
      for (const field of TIMES) expect(rebased[field]).toBeCloseTo(scene[field] + 123, 8);
    });
    for (const bad of f.negatives) {
      for (const mode of MODES)
        it(`rejects ${bad.name} in ${mode}`, () => {
          const changed = apply(f, bad);
          const proposedMode = changed.proposal.visualMode;
          const rawMode =
            proposedMode === 'diagram' || proposedMode === 'hybrid' ? mode : String(proposedMode);
          const before = structuredClone(changed);
          const result = parse(changed, rawMode);
          expect(result.scene).toBeNull();
          expect(result.ctx.issues.length).toBeGreaterThan(0);
          expect(changed).toEqual(before);
        });
    }
  });
}

it('lanes retain unknown/absent durations and conditional concurrency without fabricating order or schedule', () => {
  const scene = positive(fixture('41', 'paraphrase'));
  if (scene.storyId !== '41') throw new Error('Expected lanes');
  expect(scene.tasks[0].duration).toMatchObject({ state: 'unknown', qualifier: 'unknown' });
  expect(scene.tasks[0].duration).not.toHaveProperty('amount');
  expect(scene.tasks[1]).not.toHaveProperty('duration');
  expect(
    scene.relations.map((r) => [r.type, r.state, 'condition' in r ? r.condition : undefined]),
  ).toEqual([
    ['concurrent', 'conditional', 'If access opens'],
    ['before', 'missing', undefined],
  ]);
  expect(scene.result.state).toBe('unresolved');
  expect(scene.result).not.toHaveProperty('duration');
  expect(scene.result).not.toHaveProperty('schedule');
});
it('supplied lane durations alone imply neither concurrency, order nor zero starts', () => {
  const f = fixture('41');
  const authored = reauthor(f, {
    3: 'Rowan notes Design and Build remain separate tasks for Harbor during May.',
  });
  authored.proposal.relations = [];
  const scene = positive(authored);
  expect(scene.relations).toEqual([]);
  for (const task of scene.tasks) {
    expect(task).not.toHaveProperty('earliestStart');
    expect(task).not.toHaveProperty('earliestFinish');
  }
  expect(scene.result).not.toHaveProperty('schedule');
});
it('critical path computes exact serial domain hours and marks every schedule value derived', () => {
  const scene = positive(fixture('42'));
  if (scene.storyId !== '42') throw new Error('Expected critical path');
  expect(scene.result.duration).toEqual(rational(5));
  expect(scene.result.state).toBe('derived');
  expect(scene.result.operation).toBe('critical-path');
  expect(scene.result.basis).toEqual({ unit: 'hour', period: 'June', population: 'Orion' });
  expect(scene.result.scheduleBasis).toEqual(scene.basis);
  expect(scene.result.operands).toEqual(
    scene.tasks.map((t) => ({
      taskId: t.id,
      duration: t.duration,
      prerequisites: t.prerequisites,
    })),
  );
  expect(scene.result.schedule).toEqual([
    {
      taskId: scene.tasks[0].id,
      state: 'derived',
      earliestStart: rational(0),
      earliestFinish: rational(2),
      latestStart: rational(0),
      latestFinish: rational(2),
      slack: rational(0),
    },
    {
      taskId: scene.tasks[1].id,
      state: 'derived',
      earliestStart: rational(2),
      earliestFinish: rational(5),
      latestStart: rational(2),
      latestFinish: rational(5),
      slack: rational(0),
    },
  ]);
  expect(scene.result.criticalPathCount).toBe(1);
  expect(scene.result.pathMultiplicity).toBe('unique');
});
it('a complete explicit fork/join DAG preserves fractional operands and tied paths, not a fake unique winner', () => {
  const scene = positive(fixture('42', 'paraphrase'));
  if (scene.storyId !== '42') throw new Error('Expected critical path');
  expect(scene.result.duration).toEqual(rational(3, 4));
  expect(scene.result.criticalPathCount).toBe(2);
  expect(scene.result.pathMultiplicity).toBe('tied');
  expect(scene.result.criticalTaskIds).toEqual(scene.tasks.map((t) => t.id));
  expect(scene.result.criticalRelationIds).toEqual(scene.relations.map((r) => r.id));
  expect(scene.tasks.map((t) => t.duration.amount.notation)).toEqual(['1/2', '1/2', '1/4']);
  expect(scene.result.schedule.map((s) => s.earliestStart)).toEqual([
    rational(0),
    rational(0),
    rational(1, 2),
  ]);
  for (const [i, scheduled] of scene.result.schedule.entries()) {
    const task = scene.tasks[i];
    const finish = add(scheduled.earliestStart, task.duration.amount.value);
    expect(finish.ok).toBe(true);
    if (finish.ok) equal(finish.value, scheduled.earliestFinish);
    const slack = subtract(scheduled.latestStart, scheduled.earliestStart);
    expect(slack).toEqual({ ok: true, value: scheduled.slack });
    for (const prerequisite of task.prerequisites.prerequisiteIds) {
      const other = scene.result.schedule.find((s) => s.taskId === prerequisite);
      if (!other) throw new Error('Missing prerequisite schedule');
      const ordering = compare(other.earliestFinish, scheduled.earliestStart);
      expect(ordering.ok && ordering.value <= 0).toBe(true);
    }
  }
});
it('a shorter fork branch has exact positive slack; changing values keeps parser IDs stable', () => {
  const f = fixture('42', 'paraphrase');
  const changed = reauthor(f, {
    2: 'During July, Inez recorded Index duration of 1/4 hours among Cedar.',
  });
  ((changed.proposal.tasks as Rec[])[1].duration as Rec).amount = amount(1, 4);
  const original = positive(f),
    scene = positive(changed);
  if (scene.storyId !== '42') throw new Error('Expected critical path');
  expect(scene.entities).toEqual(original.entities);
  expect(scene.tasks.map((t) => t.id)).toEqual(original.tasks.map((t) => t.id));
  expect(scene.relations.map((r) => r.id)).toEqual(original.relations.map((r) => r.id));
  expect(scene.result.duration).toEqual(rational(3, 4));
  expect(scene.result.schedule[1].slack).toEqual(rational(1, 4));
  expect(scene.result.criticalTaskIds).toEqual([scene.tasks[0].id, scene.tasks[2].id]);
  expect(scene.result.criticalPathCount).toBe(1);
  for (const field of TIMES) expect(scene[field]).toBe(original[field]);
});
/** Dense, explicitly authored source pauses; no relaxed production beat/word constraints. */
function completeGraph(prerequisiteIndices: number[][]): Fixture {
  const labels = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta'];
  function list(values: string[]): string {
    if (values.length === 1) return values[0];
    if (values.length === 2) return values.join(' and ');
    return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
  }
  const text = [
    `Mira lists ${list(labels)} as all tasks for Orion during June.`,
    ...labels.map((label) => `Mira ${label} duration is 1 hours during June for Orion.`),
    ...labels.map(
      (label, i) =>
        `Mira states ${label} prerequisites are ${prerequisiteIndices[i].length ? list(prerequisiteIndices[i].map((j) => labels[j])) : 'none'} for Orion during June.`,
    ),
    'Mira states schedule basis is earliest starts from project start with independent resources for Orion during June.',
    'Mira requests critical path calculation for Orion during June.',
  ];
  const speech = expansionFixtureSpeech(text, 12);
  const intervals: [number, number][] = [
    [0.25, 1.29],
    ...labels.map((_, i) => [1.6 + i * 0.42, 1.94 + i * 0.42] as [number, number]),
    ...labels.map((_, i) => [5 + i * 0.45, 5.35 + i * 0.45] as [number, number]),
    [9.4, 10.505],
    [10.7, 11.65],
  ];
  for (const [i, span] of speech.spans.entries()) {
    const [start, end] = intervals[i],
      count = span.toWord - span.fromWord + 1;
    for (let j = 0; j < count; j++) {
      speech.words[span.fromWord + j].start = +(start + ((end - start) * j) / count).toFixed(9);
      speech.words[span.fromWord + j].end = +(start + ((end - start) * (j + 1)) / count).toFixed(9);
    }
  }
  const proposal = structuredClone(fixture('42').proposal);
  const fact = (claim: string, clauseIndex: number) => ({
    actor: 'Mira',
    claim,
    scope: 'Orion',
    period: 'June',
    evidence: speech.spans[clauseIndex],
  });
  proposal.entities = ['Mira', ...labels].map((label) => ({ label, evidence: speech.spans[0] }));
  proposal.tasks = labels.map((task, i) => ({
    task,
    duration: {
      actor: 'Mira',
      claim: `${task} duration`,
      basis: { unit: 'hour', period: 'June', population: 'Orion' },
      state: 'known',
      amount: amount(1),
      evidence: speech.spans[i + 1],
    },
    prerequisites: {
      ...fact('prerequisites', i + 8),
      state: 'known',
      prerequisites: prerequisiteIndices[i].map((j) => labels[j]),
    },
  }));
  proposal.basis = {
    ...fact('schedule basis', 15),
    state: 'known',
    origin: 'project start',
    policy: 'earliest-start',
    resourceModel: 'independent',
  };
  proposal.result = {
    ...fact('critical path calculation', 16),
    state: 'requested',
    operation: 'critical-path',
  };
  proposal.endWord = speech.window.endWord;
  [0, 1, 8, 15, 16].forEach((clauseIndex, i) => {
    proposal[BEATS[i]] = speech.spans[clauseIndex].fromWord;
  });
  return { ...fixture('42'), ...speech, proposal };
}
it('accepts the eight-entity/sixteen-edge complete DAG ceiling with exact noncritical slack', () => {
  const scene = positive(
    completeGraph([[], [0], [0, 1], [0, 1, 2], [0, 1, 2, 3], [0, 1, 2, 3, 4], [0]]),
  );
  if (scene.storyId !== '42') throw new Error('Expected critical path');
  expect(scene.entities).toHaveLength(8);
  expect(scene.relations).toHaveLength(16);
  expect(scene.result.duration).toEqual(rational(6));
  expect(scene.result.schedule.map((s) => s.earliestStart)).toEqual(
    [0, 1, 2, 3, 4, 5, 1].map((n) => rational(n)),
  );
  expect(scene.result.schedule[6].slack).toEqual(rational(4));
  expect(scene.result.criticalPathCount).toBe(1);
  expect(scene.result.criticalRelationIds).toHaveLength(5);
});
it('rejects more than sixteen explicitly supplied edges, not just caller-created edge fields', () => {
  const f = completeGraph([
    [],
    [0],
    [0, 1],
    [0, 1, 2],
    [0, 1, 2, 3],
    [0, 1, 2, 3, 4],
    [0, 1, 2, 3, 4, 5],
  ]);
  negative(f);
  for (const mode of MODES) expect(parse(f, mode).ctx.issues.join(' ')).toContain('sixteen');
});
it('reports the actual exact arithmetic overflow and cycle rejection on complete supplied operands', () => {
  const f = fixture('42');
  for (const [name, reason] of [
    ['schedule sum overflow', 'overflow'],
    ['explicit dependency cycle', 'acyclic'],
  ] as const) {
    const bad = f.negatives.find((n) => n.name === name);
    if (!bad) throw new Error('Missing explicit operand negative');
    for (const mode of MODES)
      expect(parse(apply(f, bad), mode).ctx.issues.join(' ')).toContain(reason);
  }
});

for (const f of packet.stories) {
  it(`${f.id}/${f.name} fails closed on missing beat, HTML/SVG/URL/file/coordinates/functions/caller results`, () => {
    for (const [field, value] of Object.entries({
      id: 'caller',
      html: '<b>x</b>',
      svg: '<svg/>',
      url: 'https://example.com',
      file: '/tmp/task',
      position: [0, 0],
      evaluate: 'x => x',
      schedule: [],
      treatment: 'time-loom',
    })) {
      negative({ ...f, proposal: { ...f.proposal, [field]: value } });
    }
    const proposal = structuredClone(f.proposal);
    delete proposal.actionWord;
    negative({ ...f, proposal });
  });
  it(`${f.id}/${f.name} rejects nonfinite, reversed, out-of-window, overlapping words and insufficient final hold`, () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      const words = structuredClone(f.words);
      words[0].start = value;
      negative({ ...f, words });
    }
    const words = structuredClone(f.words);
    words[0].end = words[0].start - 0.01;
    negative({ ...f, words });
    const outside = structuredClone(f.words);
    outside[0].start = -0.01;
    negative({ ...f, words: outside });
    const source = expansionFixtureSpeech(clauses(f), 12);
    const intervals = source.spans.map(
      (s) => [f.words[s.fromWord].start, f.words[s.toWord].end] as [number, number],
    );
    intervals[intervals.length - 1] = [11.3, 11.65];
    negative(reauthor(f, {}, intervals));
  });
}
