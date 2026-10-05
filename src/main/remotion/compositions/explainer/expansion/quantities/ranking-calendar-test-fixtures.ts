import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionCalendarSeasonality,
  parseExpansionRankChange,
} from '../../../../../ai/explainer/expansion-quantities-ranking-calendar-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionRankingCalendarScene } from './ranking-calendar-types';

export const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/quantities/ranking-calendar.source.json',
    'utf8',
  ),
) as { stories: ExpansionSourceFixture[] };
export function acceptedRankingCalendar(
  story: ExpansionSourceFixture,
): ExpansionRankingCalendarScene {
  const ctx = makeParseContext(story.words, story.window);
  const scene =
    story.id === '21'
      ? parseExpansionRankChange(story.proposal, ctx)
      : parseExpansionCalendarSeasonality(story.proposal, ctx);
  expect(ctx.issues).toEqual([]);
  if (!scene) throw new Error('Expected production parser acceptance');
  return scene;
}
const STATES = [
  'known',
  'known',
  'unknown',
  'missing',
  'disputed',
  'conditional',
  'simulated',
  'illustrative',
] as const;
/** Maximum actual parser records/labels, all states, tied/unranked and source precision. */
export function maximumRankingCalendar(id: '21' | '22', letter: 'W' | 'M'): ExpansionSourceFixture {
  const actors = Array.from({ length: id === '21' ? 6 : 8 }, (_, i) => `${letter.repeat(27)}${i}`);
  const claim = letter.repeat(48);
  const population = letter.repeat(40);
  const periods =
    id === '21'
      ? [`${letter.repeat(31)}A`, `${letter.repeat(31)}B`]
      : Array.from(
          { length: 12 },
          (_, i) => `9999-${String(Math.floor(i / 2) + 1).padStart(2, '0')}`,
        );
  const names = (values: string[]) =>
    values.length === 2
      ? values.join(' and ')
      : `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`;
  const clauses = [
    `${names(actors)}: ${id === '21' ? 'rank records' : 'calendar records'} for ${claim}, retaining the explicitly supplied source identities and the complete original measurement units population reference denominators and source precision without substituting numerical values for unavailable observations or inventing additional records.`,
  ];
  const sourceRecords: {
    actor: string;
    period: string;
    state: (typeof STATES)[number];
    clause: number;
    unranked?: number;
  }[] = [];
  for (let i = 0; i < 12; i++) {
    const actor = actors[i % actors.length];
    const period = id === '21' ? periods[Math.floor(i / 6)] : periods[i];
    const state = STATES[i % STATES.length];
    const metric = id === '21' ? `${claim} rank` : claim;
    const value = id === '21' ? '1000000000' : '1000000000/999999999';
    const body = `${actor} ${metric} is ${state === 'missing' || state === 'unknown' ? state : state === 'disputed' ? `disputed between ${value} and 1` : value} count during ${period} among ${population} with denominator 1000000000.`;
    const qualifier =
      state === 'simulated'
        ? `simulation ${letter.repeat(85)}`
        : `teaching example ${letter.repeat(79)}`;
    const clause = clauses.length;
    clauses.push(
      state === 'conditional'
        ? `If ${letter.repeat(93)}, ${body}`
        : state === 'simulated' || state === 'illustrative'
          ? `In this ${qualifier}, ${body}`
          : body,
    );
    const record = { actor, period, state, clause, unranked: undefined as number | undefined };
    if (id === '21' && state === 'unknown') {
      record.unranked = clauses.length;
      clauses.push(`${actor} is unranked for ${claim} in ${period} among ${population}.`);
    }
    sourceRecords.push(record);
  }
  const check = clauses.length;
  const relations: Rec[] = [];
  const identifiers = sourceRecords.map((r) => `${r.actor} ${claim} in ${r.period}`);
  if (id === '21')
    clauses.push(
      `The ${claim} ranks for ${names(actors)} are comparable from ${periods[0]} to ${periods[1]} on the same unit, population and denominator.`,
    );
  else
    for (let i = 0; i < 11; i++) {
      const same = periods[i] === periods[i + 1];
      relations.push({
        fromRecord: i,
        toRecord: i + 1,
        role: same ? 'same-period' : 'before',
        clause: clauses.length,
      });
      clauses.push(
        same
          ? `${identifiers[i]} shares a calendar period with ${identifiers[i + 1]}.`
          : `${identifiers[i]} precedes ${identifiers[i + 1]} in calendar order.`,
      );
    }
  const resolve = clauses.length;
  clauses.push(
    id === '21'
      ? `${claim} ranks for ${names(actors)} stay scoped to supplied states.`
      : `${names(identifiers)} remain limited to supplied calendar data.`,
  );
  const speech = expansionFixtureSpeech(clauses, 12);
  const records = sourceRecords.map((r, i) => {
    const amount = {
      kind: 'rational',
      value: { numerator: 1_000_000_000, denominator: id === '21' ? 1 : 999_999_999 },
    };
    const quantity: Rec = {
      actor: r.actor,
      claim: id === '21' ? `${claim} rank` : claim,
      state: r.state,
      basis: {
        unit: 'count',
        period: r.period,
        population,
        denominator: { numerator: 1_000_000_000, denominator: 1 },
      },
      evidence: speech.spans[r.clause],
    };
    if (r.state === 'unknown' || r.state === 'missing') quantity.qualifier = r.state;
    else if (r.state === 'disputed') {
      quantity.qualifier = 'disputed';
      quantity.alternatives = [
        amount,
        { kind: 'rational', value: { numerator: 1, denominator: 1 } },
      ];
    } else {
      quantity.amount = amount;
      if (r.state === 'conditional') quantity.condition = `If ${letter.repeat(93)}`;
      if (r.state === 'simulated' || r.state === 'illustrative')
        quantity.qualifier =
          r.state === 'simulated'
            ? `simulation ${letter.repeat(85)}`
            : `teaching example ${letter.repeat(79)}`;
    }
    return id === '21'
      ? {
          actor: r.actor,
          quantity,
          ...('amount' in quantity ? { rank: 1_000_000_000 } : {}),
          ...(r.unranked === undefined ? {} : { unrankedEvidence: speech.spans[r.unranked] }),
        }
      : {
          actor: r.actor,
          label: claim,
          calendar: { year: 9999, month: Math.floor(i / 2) + 1 },
          quantity,
        };
  });
  const proposal: Rec = {
    kind: id === '21' ? 'ranking' : 'temporal-pattern',
    preset: id === '21' ? 'rank-change' : 'calendar-seasonality',
    visualMode: 'diagram',
    layout: 'stack',
    label: id === '21' ? 'rank records' : 'calendar records',
    subject: actors[0],
    outcome:
      id === '21' ? 'stay scoped to supplied states' : 'remain limited to supplied calendar data',
    evidence: 'illustrative',
    condition: `If ${letter.repeat(93)}`,
    startWord: 0,
    endWord: speech.window.endWord,
    setupWord: 0,
    actionWord: speech.spans[sourceRecords[0].clause].fromWord,
    responseWord: speech.spans[sourceRecords[6].clause].fromWord,
    checkWord: speech.spans[check].fromWord,
    resolveWord: speech.spans[resolve].fromWord,
    entities: actors.map((label) => ({ label, evidence: speech.spans[0] })),
    result: { status: 'scoped', evidence: speech.spans[resolve] },
  };
  if (id === '21') {
    proposal.criterion = claim;
    proposal.states = periods.map((period, i) => ({
      period,
      records: records.slice(i * 6, i * 6 + 6),
    }));
    proposal.comparison = {
      fromPeriod: periods[0],
      toPeriod: periods[1],
      evidence: speech.spans[check],
    };
  } else {
    proposal.records = records;
    proposal.relations = relations.map(({ clause, ...r }) => ({
      ...r,
      evidence: speech.spans[Number(clause)],
    }));
  }
  return { id, ...speech, proposal, negatives: [] };
}
export function rankingCalendarCases(): ExpansionRankingCalendarScene[] {
  return [
    ...packet.stories,
    ...(['21', '22'] as const).flatMap((id) =>
      (['W', 'M'] as const).map((letter) => maximumRankingCalendar(id, letter)),
    ),
  ].map(acceptedRankingCalendar);
}
