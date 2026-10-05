import { readFileSync } from 'node:fs';
import { expansionFixtureSpeech } from '../../../../../ai/explainer/expansion-fixture-words';
import type { TemporalFixtureSeed } from '../../../../../ai/explainer/expansion-temporal-fixtures';
import {
  parseExpansionCriticalPath,
  parseExpansionParallelLanes,
} from '../../../../../ai/explainer/expansion-temporal-lanes-critical-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionLanesCriticalScene } from './lanes-critical-types';

export const lanesCriticalPacket = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/temporal/lanes-critical.source.json',
    'utf8',
  ),
) as { stories: TemporalFixtureSeed[] };
export const lanesCriticalStates = [
  'known',
  'unknown',
  'missing',
  'conditional',
  'disputed',
  'illustrative',
  'simulated',
] as const;
export function parseLanesCritical(
  seed: TemporalFixtureSeed,
  visualMode: 'diagram' | 'hybrid' = 'diagram',
): ExpansionLanesCriticalScene {
  const ctx = makeParseContext(seed.words, seed.window);
  const raw = { ...seed.proposal, visualMode };
  const scene =
    seed.id === '41' ? parseExpansionParallelLanes(raw, ctx) : parseExpansionCriticalPath(raw, ctx);
  if (!scene || ctx.issues.length) throw new Error(JSON.stringify(ctx.issues));
  return scene;
}
/** Real maximum: seven tasks plus actor; sixteen links; maximal source label/context lengths. */
export function lanesCriticalStressSeed(
  id: '41' | '42',
  state: (typeof lanesCriticalStates)[number] = 'known',
  unit = 'hour',
  zero = false,
): TemporalFixtureSeed {
  const actor = 'A'.repeat(28),
    scope = 'G'.repeat(40),
    period = 'P'.repeat(32);
  const labels = Array.from({ length: 7 }, (_, i) => `${i}${'W'.repeat(27)}`);
  const names = (values: readonly string[]): string =>
    values.length < 2
      ? (values[0] ?? 'none')
      : `${values.slice(0, -1).join(', ')}${values.length > 2 ? ',' : ''} and ${values[values.length - 1]}`;
  const clauses: string[] = [],
    phases: number[] = [],
    records: { raw: Rec; clause: number }[] = [];
  const add = (text: string, phase: number): number => {
    phases.push(phase);
    clauses.push(`${text}.`);
    return clauses.length - 1;
  };
  const setup = add(
    `${actor} lists ${names(labels)} as ${id === '42' ? 'all ' : ''}tasks for ${scope} during ${period}`,
    0,
  );
  const suffix = `for ${scope} during ${period}`,
    condition = `if ${'C'.repeat(93)}`;
  const tasks: Rec[] = [];
  const amount = { kind: 'rational', value: { numerator: zero ? 0 : 1, denominator: 2 } };
  for (const [i, label] of labels.entries()) {
    const selected = id === '42' ? 'known' : state;
    const qualifier =
      selected === 'illustrative' || selected === 'simulated'
        ? `${selected} ${'X'.repeat(95 - selected.length)}`
        : selected;
    const value =
      selected === 'unknown' || selected === 'missing'
        ? selected
        : selected === 'disputed'
          ? 'disputed between 1/2 and 3/4'
          : zero
            ? '0'
            : '1/2';
    const text = `${actor} ${label} duration is ${value} ${unit}s during ${period} for ${scope}`;
    const n = add(
      `${selected === 'illustrative' || selected === 'simulated' ? `In this ${qualifier}, ` : ''}${text}${selected === 'conditional' ? `, ${condition}` : ''}`,
      id === '42' || i === 0 ? 1 : 2,
    );
    const duration: Rec = {
      actor,
      claim: `${label} duration`,
      basis: { unit, population: scope, period },
      state: selected,
      ...(selected === 'unknown' || selected === 'missing'
        ? { qualifier }
        : selected === 'disputed'
          ? {
              qualifier,
              alternatives: [amount, { kind: 'rational', value: { numerator: 3, denominator: 4 } }],
            }
          : {
              amount,
              ...(selected === 'conditional'
                ? { condition }
                : selected === 'known'
                  ? {}
                  : { qualifier }),
            }),
    };
    records.push({ raw: duration, clause: n });
    tasks.push({ task: label, duration });
  }
  const relations: Rec[] = [];
  if (id === '42') {
    // Complete acyclic prerequisite lists with exactly sixteen supplied edges.
    for (const [i, task] of tasks.entries()) {
      const prerequisites = labels.slice(0, i === 6 ? 1 : i);
      const raw: Rec = {
        actor,
        claim: 'prerequisites',
        scope,
        period,
        state: 'known',
        prerequisites,
      };
      records.push({
        raw,
        clause: add(
          `${actor} states ${labels[i]} prerequisites are ${names(prerequisites)} ${suffix}`,
          2,
        ),
      });
      task.prerequisites = raw;
    }
  } else {
    const pairs = labels
      .flatMap((from, i) => labels.slice(i + 1).map((to) => ({ from, to })))
      .slice(0, 16);
    for (const [i, pair] of pairs.entries()) {
      const type = i % 2 ? 'before' : 'concurrent';
      const rs = ['known', 'conditional', 'unknown', 'missing', 'disputed'][i % 5];
      // Missing durations require explicitly asserted concurrency for every task.
      const relationState = type === 'concurrent' ? 'conditional' : rs;
      const asserted = relationState === 'known' || relationState === 'conditional';
      const claim = asserted
        ? type === 'concurrent'
          ? 'runs concurrently with'
          : 'runs before'
        : 'order';
      const raw: Rec = {
        actor,
        claim,
        scope,
        period,
        type,
        ...pair,
        state: relationState,
        ...(relationState === 'conditional' ? { condition } : {}),
      };
      const body = asserted
        ? `${pair.from} ${claim} ${pair.to}`
        : `${claim} from ${pair.from} to ${pair.to} is ${relationState}`;
      records.push({
        raw,
        clause: add(
          `${actor} states ${body} ${suffix}${relationState === 'conditional' ? `, ${condition}` : ''}`,
          3,
        ),
      });
      relations.push(raw);
    }
  }
  const basis: Rec = {
    actor,
    claim: 'schedule basis',
    scope,
    period,
    state: 'known',
    origin: 'project start',
    policy: 'earliest-start',
    resourceModel: 'independent',
  };
  if (id === '42')
    records.push({
      raw: basis,
      clause: add(
        `${actor} states schedule basis is earliest starts from project start with independent resources ${suffix}`,
        3,
      ),
    });
  const result: Rec = {
    actor,
    claim: id === '42' ? 'critical path calculation' : 'task result',
    scope,
    period,
    state: id === '42' ? 'requested' : 'conditional',
    ...(id === '42' ? { operation: 'critical-path' } : { condition }),
  };
  records.push({
    raw: result,
    clause: add(
      id === '42'
        ? `${actor} requests critical path calculation ${suffix}`
        : `${actor} reports task result is conditional ${suffix}, ${condition}`,
      4,
    ),
  });
  const speech = expansionFixtureSpeech(clauses, 10.5);
  const starts = [0.25, 2, 4, 6, 8];
  for (let phase = 0; phase < 5; phase++) {
    const indices = phases.flatMap((p, i) => (p === phase ? [i] : []));
    const end = phase === 4 ? 10.15 : starts[phase + 1] - 0.4;
    const count = indices.reduce(
      (n, i) => n + speech.spans[i].toWord - speech.spans[i].fromWord + 1,
      0,
    );
    let at = 0;
    for (const i of indices)
      for (let w = speech.spans[i].fromWord; w <= speech.spans[i].toWord; w++) {
        speech.words[w].start = starts[phase] + ((end - starts[phase]) * at) / count;
        speech.words[w].end = starts[phase] + ((end - starts[phase]) * ++at) / count;
      }
  }
  for (const record of records) record.raw.evidence = speech.spans[record.clause];
  const beats = Object.fromEntries(
    ['setup', 'action', 'response', 'check', 'resolve'].map((beat, phase) => [
      `${beat}Word`,
      speech.spans[phases.indexOf(phase)].fromWord,
    ]),
  );
  return {
    id,
    ...speech,
    proposal: {
      kind: 'temporal-structure',
      preset: id === '41' ? 'parallel-lanes' : 'critical-path',
      visualMode: 'diagram',
      template: id === '41' ? 'task-lanes' : 'dependency-schedule',
      label: 'tasks',
      subject: actor,
      actor,
      scope,
      period,
      outcome: id === '42' ? 'critical path calculation' : 'conditional',
      evidence: 'source-stated',
      entities: [actor, ...labels].map((label) => ({ label, evidence: speech.spans[setup] })),
      tasks,
      ...(id === '42' ? { basis } : { relations }),
      result,
      ...beats,
    },
  };
}
export function lanesCriticalCases(): ExpansionLanesCriticalScene[] {
  return [
    ...lanesCriticalPacket.stories.map((seed) => parseLanesCritical(seed)),
    ...lanesCriticalStates.map((state) => parseLanesCritical(lanesCriticalStressSeed('41', state))),
    ...['second', 'minute', 'hour', 'day'].map((unit) =>
      parseLanesCritical(lanesCriticalStressSeed('42', 'known', unit)),
    ),
    parseLanesCritical(lanesCriticalStressSeed('42', 'known', 'hour', true)),
  ];
}
