import { readFileSync } from 'node:fs';
import {
  parseExpansionDecisionTree,
  parseExpansionWeightedCriteria,
} from '../../../../../ai/explainer/expansion-decisions-priority-tree-contract';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionDecisionState, ExpansionPriorityTreeScene } from './priority-tree-types';

export const priorityTreeColors = {
  surface: '#f6ecd9',
  text: '#23100c',
  accent: '#9f75ff',
  muted: '#81706a',
};
export const priorityTreePacket = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/decisions/priority-tree.source.json',
    'utf8',
  ),
) as { stories: TemporalFixtureSeed[] };
export function parsePriorityTree(
  fixture: Pick<ExpansionSourceFixture, 'id' | 'words' | 'window' | 'proposal'>,
  mode: 'diagram' | 'hybrid' = 'diagram',
): ExpansionPriorityTreeScene {
  const ctx = makeParseContext(fixture.words, fixture.window);
  const raw = { ...fixture.proposal, visualMode: mode };
  const scene =
    fixture.id === '27'
      ? parseExpansionWeightedCriteria(raw, ctx)
      : parseExpansionDecisionTree(raw, ctx);
  if (!scene || ctx.issues.length) throw new Error(JSON.stringify(ctx.issues));
  return scene;
}
const name = (prefix: string) => prefix.padEnd(28, 'W');
const text = (state: ExpansionDecisionState) =>
  (state === 'known' ? '' : `${state === 'conditional' ? 'may' : state} `).padEnd(96, 'W');
const qualifier = (state: ExpansionDecisionState) =>
  state === 'known' ? {} : { qualifier: state === 'conditional' ? 'may' : state };
/** New stress speech is test-only; every payload is accepted by the real source parser. */
function finish(
  id: '27' | '28',
  clauses: string[],
  raw: Rec,
  evidence: Map<string, number>,
): ExpansionSourceFixture {
  const speech = expansionFixtureSpeech(clauses, 12);
  const phases = [0, 1, 2, 3, clauses.length - 1, clauses.length];
  const times = [0.25, 1.4, 2.7, 4.0, 10.4, 11.65];
  for (let phase = 0; phase < 5; phase++) {
    const from = speech.spans[phases[phase]].fromWord;
    const to = phase === 4 ? speech.words.length : speech.spans[phases[phase + 1]].fromWord;
    for (let i = from; i < to; i++) {
      speech.words[i].start =
        times[phase] + ((times[phase + 1] - times[phase]) * (i - from)) / (to - from);
      speech.words[i].end =
        times[phase] + ((times[phase + 1] - times[phase]) * (i + 1 - from)) / (to - from);
    }
  }
  function bind(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(bind);
    if (!value || typeof value !== 'object') return value;
    const record = value as Rec;
    if (typeof record.clause === 'number') {
      const { clause, ...rest } = record;
      return {
        ...Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, bind(v)])),
        evidence: speech.spans[clause],
      };
    }
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, bind(v)]));
  }
  const proposal = bind(raw) as Rec;
  proposal.entities = [...evidence].map(([label, clause]) => ({
    label,
    evidence: speech.spans[clause],
  }));
  Object.assign(proposal, {
    startWord: 0,
    endWord: speech.words.length - 1,
    setupWord: speech.spans[0].fromWord,
    actionWord: speech.spans[1].fromWord,
    responseWord: speech.spans[2].fromWord,
    checkWord: speech.spans[3].fromWord,
    resolveWord: speech.spans[clauses.length - 1].fromWord,
  });
  return { id, ...speech, proposal, negatives: [] };
}
export function maximumPriorityFixture(
  qualitative = true,
  chosen = false,
  quantityState: ExpansionDecisionState = 'known',
  withScores = false,
  quantityUnit: 'ratio' | 'count' | 'percent' = 'ratio',
): ExpansionSourceFixture {
  const owner = name('Actor'),
    candidates = [name('PlanA'), name('PlanB')];
  const criteria = [name('Cost'), name('Speed'), name('Quality'), name('Reach')];
  const scope = 'priority regional scope population ledger'.slice(0, 40),
    period = 'P'.repeat(32);
  const condition = `if ${'C'.repeat(93)}`;
  const clauses = [
    `${owner}'s ${scope} ${qualitative ? `ranks ${criteria.join(' before ')}` : `lists criteria ${criteria.join(' and ')}`}.`,
  ];
  const evidence = new Map<string, number>([
    [owner, 0],
    ...criteria.map((c): [string, number] => [c, 0]),
  ]);
  const effects: Rec[] = [];
  const states: ExpansionDecisionState[] = [
    'known',
    'missing',
    'unknown',
    'disputed',
    'conditional',
    'simulated',
    'illustrative',
    'unknown',
  ];
  for (const [ci, candidate] of candidates.entries())
    for (const [ri, criterion] of criteria.entries()) {
      const state = chosen && ci === 0 ? 'known' : states[ci * 4 + ri];
      const clause = clauses.length;
      clauses.push(`${owner}'s candidate ${candidate} has ${criterion} effect "${text(state)}".`);
      evidence.set(candidate, clause);
      effects.push({
        actor: owner,
        candidate,
        criterion,
        text: text(state),
        state,
        ...qualifier(state),
        clause,
      });
    }
  let priorities: Rec | undefined;
  if (qualitative) {
    const clause = clauses.length;
    clauses.push(`${owner}'s ${scope} now ranks ${[...criteria].reverse().join(' before ')}.`);
    priorities = {
      before: { order: criteria, clause: 0 },
      after: { order: [...criteria].reverse(), clause },
    };
  }
  const weighted = criteria.map((entity, index) => {
    if (qualitative && (!withScores || index >= 2)) return { entity };
    const claim = `${entity} weight`,
      clause = clauses.length;
    const state = quantityState === 'conditional' && index > 0 ? 'known' : quantityState;
    const supplied =
      quantityUnit === 'count'
        ? { numerator: 1000000000, denominator: 1 }
        : quantityUnit === 'percent'
          ? { numerator: 100, denominator: 1 }
          : { numerator: 1, denominator: 3 };
    const notation = supplied.denominator === 1 ? `${supplied.numerator}` : '1/3';
    const value =
      state === 'unknown' || state === 'missing'
        ? state
        : state === 'disputed'
          ? 'disputed between 1/3 and 2/3'
          : notation;
    const prefix =
      state === 'simulated' || state === 'illustrative'
        ? `in this ${state}, `
        : state === 'conditional'
          ? `${condition}, `
          : '';
    clauses.push(
      `${prefix}${owner} ${claim} is ${value} ${quantityUnit} during ${period} for ${scope}.`,
    );
    const amount = { kind: 'rational', value: supplied };
    return {
      entity,
      weight: {
        actor: owner,
        claim,
        state,
        basis: { unit: quantityUnit, period, population: scope },
        ...(state === 'unknown' || state === 'missing'
          ? { qualifier: state }
          : state === 'disputed'
            ? {
                qualifier: 'disputed',
                alternatives: [
                  amount,
                  { kind: 'rational', value: { numerator: 2, denominator: 3 } },
                ],
              }
            : {
                amount,
                ...(state === 'conditional'
                  ? { condition }
                  : state === 'simulated' || state === 'illustrative'
                    ? { qualifier: state }
                    : {}),
              }),
        clause,
      },
    };
  });
  const scores = withScores
    ? candidates.map((candidate, index) => {
        const clause = clauses.length,
          qualifier = `${index ? 'illustrative' : 'simulated'} `.padEnd(96, 'W');
        clauses.push(
          `in this ${qualifier}, ${owner} ${candidate} score is -1/3 count during ${period} for ${scope} with denominator 999999937.`,
        );
        return {
          candidate,
          quantity: {
            actor: owner,
            claim: `${candidate} score`,
            state: index ? 'illustrative' : 'simulated',
            qualifier,
            basis: {
              unit: 'count',
              period,
              population: scope,
              denominator: { numerator: 999999937, denominator: 1 },
            },
            amount: { kind: 'rational', value: { numerator: -1, denominator: 3 } },
            clause,
          },
        };
      })
    : undefined;
  clauses.push(
    `${owner}'s choice ${chosen ? `is ${candidates[0]}` : 'remains unresolved for both candidates'}.`,
  );
  return finish(
    '27',
    clauses,
    {
      kind: 'constraint-choice',
      preset: 'weighted-criteria',
      visualMode: 'diagram',
      layout: 'stack',
      label: scope,
      subject: owner,
      outcome: chosen ? candidates[0] : 'unresolved',
      evidence: 'illustrative',
      owner,
      candidates,
      criteria: weighted,
      ...(priorities ? { priorities } : {}),
      ...(scores ? { scores } : {}),
      ...(quantityState === 'conditional' ? { condition } : {}),
      effects,
      resolution: chosen
        ? { state: 'source-chosen', choice: candidates[0] }
        : { state: 'unresolved' },
    },
    evidence,
  );
}
export function maximumTreeFixture(chosen = false, qualified = false): ExpansionSourceFixture {
  const owner = name('Actor'),
    labels = [
      'Root',
      'CheckOne',
      'CheckTwo',
      'OutcomeOne',
      'OutcomeTwo',
      'OutcomeThree',
      'OutcomeFour',
    ].map(name);
  const clauses: string[] = [],
    evidence = new Map<string, number>([[owner, 0]]),
    nodes: Rec[] = [],
    branches: Rec[] = [];
  for (const [i, entity] of labels.entries()) {
    const role = i < 3 ? 'condition' : 'outcome';
    const state: ExpansionDecisionState = qualified
      ? (
          [
            'known',
            'conditional',
            'missing',
            'known',
            'disputed',
            'simulated',
            'illustrative',
          ] as const
        )[i]
      : i === 6
        ? 'unknown'
        : i === 4
          ? 'disputed'
          : 'known';
    const clause = clauses.length;
    clauses.push(`${owner}'s decision tree defines ${role} ${entity} as "${text(state)}".`);
    evidence.set(entity, clause);
    nodes.push({
      entity,
      actor: owner,
      role,
      text: text(state),
      state,
      ...qualifier(state),
      clause,
    });
  }
  for (const [i, [from, to]] of [
    [0, 1],
    [0, 3],
    [1, 2],
    [1, 4],
    [2, 5],
    [2, 6],
  ].entries()) {
    const test = `test${i} `.padEnd(96, 'W'),
      clause = clauses.length;
    clauses.push(
      `${owner}'s condition ${labels[from]} routes to ${to < 3 ? 'condition' : 'outcome'} ${labels[to]} on branch "${test}".`,
    );
    branches.push({ from: labels[from], to: labels[to], test, clause });
  }
  clauses.push(`${owner}'s choice ${chosen ? `is ${labels[3]}` : 'remains unresolved'}.`);
  return finish(
    '28',
    clauses,
    {
      kind: 'conditional-choice',
      preset: 'decision-tree',
      visualMode: 'diagram',
      layout: 'stack',
      label: 'decision tree',
      subject: owner,
      outcome: chosen ? labels[3] : 'unresolved',
      evidence: qualified ? 'illustrative' : 'source-stated',
      owner,
      root: labels[0],
      nodes,
      branches,
      resolution: chosen ? { state: 'source-chosen', choice: labels[3] } : { state: 'unresolved' },
    },
    evidence,
  );
}
export function priorityTreeFixtures(): ExpansionSourceFixture[] {
  return [
    ...temporalSourceFixtures(priorityTreePacket.stories),
    maximumPriorityFixture(),
    maximumPriorityFixture(true, true),
    maximumTreeFixture(),
    maximumTreeFixture(true),
    maximumTreeFixture(false, true),
    maximumPriorityFixture(true, false, 'disputed', true),
    maximumPriorityFixture(false, false, 'known', false, 'count'),
    maximumPriorityFixture(false, false, 'known', false, 'percent'),
    ...(
      [
        'known',
        'missing',
        'unknown',
        'disputed',
        'simulated',
        'illustrative',
        'conditional',
      ] as const
    ).map((state) => maximumPriorityFixture(false, false, state)),
  ];
}
