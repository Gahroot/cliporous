import { readFileSync } from 'node:fs';
import {
  parseExpansionFrontierRoute,
  parseExpansionLocalGlobal,
} from '../../../../../ai/explainer/expansion-decisions-search-landscape-contract';
import { expansionFixtureSpeech } from '../../../../../ai/explainer/expansion-fixture-words';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { isRec, makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionSearchLandscapeScene } from './search-landscape-types';

export const searchPacket = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/decisions/search-landscape.source.json',
    'utf8',
  ),
) as { stories: TemporalFixtureSeed[] };
export const searchRawFixtures = temporalSourceFixtures(searchPacket.stories);
export function parseSearch(
  seed: TemporalFixtureSeed,
  mode: 'diagram' | 'hybrid' = 'diagram',
): ExpansionSearchLandscapeScene {
  const ctx = makeParseContext(seed.words, seed.window);
  const raw = { ...seed.proposal, visualMode: mode };
  const scene =
    seed.id === '29' ? parseExpansionFrontierRoute(raw, ctx) : parseExpansionLocalGlobal(raw, ctx);
  if (!scene || ctx.issues.length) throw new Error(JSON.stringify(ctx.issues));
  return scene;
}
const condition =
  'if the regional archive retains the original complete attribution during the recent review cycle';
export const quantityStates = [
  'known',
  'conditional',
  'illustrative',
  'simulated',
  'unknown',
  'missing',
  'disputed',
] as const;
/** Re-author full local clauses and rebind every raw span; stress inputs still pass the real parser. */
export function searchStressSeed(
  id: '29' | '30',
  state: (typeof quantityStates)[number],
  qualification: 'source' | 'illustrative' | 'simulated' = 'illustrative',
  nodeStatus = 'blocked',
  unresolved = false,
): TemporalFixtureSeed {
  const source = searchPacket.stories.find((s) => s.id === id);
  if (!source) throw new Error(`Missing source story ${id}`);
  const seed = structuredClone(source);
  const oldSpans: { fromWord: number; toWord: number }[] = [],
    clauses: string[] = [];
  let start = 0;
  seed.words.forEach((w, i) => {
    if (/[.!?;]$/.test(w.text)) {
      oldSpans.push({ fromWord: start, toWord: i });
      clauses.push(
        seed.words
          .slice(start, i + 1)
          .map((v) => v.text)
          .join(' '),
      );
      start = i + 1;
    }
  });
  const replacements = id === '29' ? ['Gate', 'Ridge', 'Marsh', 'Harbor'] : ['Hollow', 'Basin'];
  const names = replacements.map((name, i) =>
    `${name}${i}WWWWWWWWWWWWWWWWWWWWWW`.padEnd(28, 'W').slice(0, 28),
  );
  const replace = (s: string) => {
    let result = s.replaceAll('illustrative', qualification);
    replacements.forEach((name, i) => {
      result = result.replaceAll(name, names[i]);
    });
    return id === '30' ? result.replaceAll('effort', 'E'.repeat(28)) : result;
  };
  const changed = clauses.map(replace);
  if (id === '29') changed[3] = changed[3].replace('blocked', nodeStatus);
  if (unresolved) {
    const check = oldSpans.findIndex((s) => s.fromWord === seed.proposal.checkWord);
    const resolve = oldSpans.findIndex((s) => s.fromWord === seed.proposal.resolveWord);
    if (id === '29') {
      changed[check] =
        `No route from ${names[0]} to ${names[3]} is supplied on the ${qualification} grid.`;
      changed[resolve] =
        `The ${names[0]} to ${names[3]} route remains unresolved on the ${qualification} grid.`;
    } else {
      const well = (seed.proposal.wells as Rec[])[1].evidence as Rec;
      const index = oldSpans.findIndex((s) => s.fromWord === well.fromWord);
      changed[index] =
        `${names[1]} role remains unresolved on the ${qualification} ${'E'.repeat(28)} landscape.`;
      changed[check] =
        `No branch from ${names[0]} to ${names[1]} is supplied on the ${qualification} ${'E'.repeat(28)} landscape.`;
      changed[resolve] =
        `The distinction for ${names[0]} and ${names[1]} remains unresolved on the ${qualification} ${'E'.repeat(28)} landscape.`;
    }
  }
  const actor = names[0],
    claim = id === '29' ? `${names[1]} link cost` : `${'E'.repeat(28)} objective`;
  const period = 'P'.repeat(32),
    population = 'G'.repeat(40);
  const amount = { kind: 'rational', value: { numerator: 0, denominator: 1 } };
  const qualifier =
    state === 'illustrative' || state === 'simulated'
      ? `${state} ${'W'.repeat(96 - state.length - 1)}`
      : state;
  const value =
    state === 'unknown' || state === 'missing'
      ? state
      : state === 'disputed'
        ? 'disputed between 0 and 1/1000000000'
        : '0';
  let quantityClause = `${actor} ${claim} is ${value} count during ${period} among ${population} with denominator 1000000000`;
  if (state === 'conditional') quantityClause += ` ${condition}`;
  if (state === 'simulated' || state === 'illustrative')
    quantityClause = `in this ${qualifier}, ${quantityClause}`;
  // The extra quantitative clause lives in action, before the response source beat.
  const responseIndex = oldSpans.findIndex((s) => s.fromWord === seed.proposal.responseWord);
  changed.splice(responseIndex, 0, `${quantityClause}.`);
  const speech = expansionFixtureSpeech(changed, 12);
  const mapIndex = (i: number) => (i >= responseIndex ? i + 1 : i);
  const rebind = (v: unknown): unknown => {
    if (typeof v === 'string') return replace(v);
    if (Array.isArray(v)) return v.map(rebind);
    if (!isRec(v)) return v;
    if ('fromWord' in v && 'toWord' in v) {
      const i = oldSpans.findIndex((s) => s.fromWord === v.fromWord && s.toWord === v.toWord);
      if (i >= 0) return speech.spans[mapIndex(i)];
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rebind(x)]));
  };
  const proposal = rebind(seed.proposal) as Rec;
  for (const beat of ['setup', 'action', 'response', 'check', 'resolve']) {
    const i = oldSpans.findIndex((s) => s.fromWord === seed.proposal[`${beat}Word`]);
    proposal[`${beat}Word`] = speech.spans[mapIndex(i)].fromWord;
  }
  const boundaries = ['setup', 'action', 'response', 'check', 'resolve'].map((beat) =>
    Number(proposal[`${beat}Word`]),
  );
  boundaries.push(speech.words.length);
  const times = [0.25, 1.4, 5, 7.5, 10.4, 11.65];
  for (let phase = 0; phase < 5; phase++)
    for (let i = boundaries[phase]; i < boundaries[phase + 1]; i++) {
      const step = (times[phase + 1] - times[phase]) / (boundaries[phase + 1] - boundaries[phase]);
      speech.words[i].start = times[phase] + (i - boundaries[phase]) * step;
      speech.words[i].end = times[phase] + (i - boundaries[phase] + 1) * step;
    }
  proposal.endWord = speech.words.length - 1;
  proposal.qualification = qualification;
  if (id === '30') {
    proposal.label = names[0];
    proposal.outcome = `on the ${qualification} ${'E'.repeat(28)}`;
  }
  proposal.evidence = qualification === 'source' ? 'source-stated' : 'illustrative';
  const q: Rec = {
    actor,
    claim,
    basis: {
      unit: 'count',
      period,
      population,
      denominator: { numerator: 1000000000, denominator: 1 },
    },
    evidence: speech.spans[responseIndex],
    state,
  };
  if (state === 'disputed')
    q.alternatives = [
      amount,
      { kind: 'rational', value: { numerator: 1, denominator: 1000000000 } },
    ];
  else if (state !== 'unknown' && state !== 'missing') q.amount = amount;
  if (state === 'conditional') {
    q.condition = condition;
    proposal.condition = condition;
  } else if (state !== 'known') q.qualifier = qualifier;
  if (id === '29') {
    (proposal.links as Rec[])[0].cost = q;
    (proposal.nodes as Rec[])[2].status = nodeStatus;
  } else (proposal.wells as Rec[])[0].value = q;
  if (unresolved) {
    proposal.outcome =
      id === '29'
        ? `remains unresolved on the ${qualification} grid`
        : `remains unresolved on the ${qualification}`;
    (proposal.result as Rec).status = 'unresolved';
    if (id === '29') (proposal.route as Rec).nodes = [];
    else {
      (proposal.wells as Rec[])[1].role = 'unresolved';
      (proposal.branch as Rec).status = 'unresolved';
    }
  }
  return { ...seed, ...speech, proposal };
}
export function searchMaximumSeed(): TemporalFixtureSeed {
  const names = ['Start', 'Upper', 'Lower', 'Goal'].map((s) => s.padEnd(28, 'W'));
  const period = 'P'.repeat(32),
    population = 'G'.repeat(40);
  const clauses = [`The source grid route names ${names.join(', ')} on the source grid.`];
  const add = (s: string) => {
    clauses.push(`${s}.`);
    return clauses.length - 1;
  };
  const nodeClauses = names.map((name, i) =>
    add(`${name} is the open ${['start', 'upper', 'lower', 'goal'][i]} node on the source grid`),
  );
  const pairs = [
    [0, 1],
    [1, 3],
    [0, 2],
    [2, 3],
  ];
  const linkClauses = pairs.map(([a, b], i) =>
    add(
      `${names[a]} connects to ${names[b]} as an open link on the source grid${i === 3 ? ` ${condition}` : ''}`,
    ),
  );
  const numbers = [
    { numerator: 0, denominator: 1 },
    { numerator: 1000000000, denominator: 1 },
    { numerator: 1, denominator: 1000000000 },
    { numerator: 1000000000, denominator: 1 },
  ];
  const costClauses = pairs.map(([a, b], i) =>
    add(
      `${names[a]} ${names[b]} link cost is ${numbers[i].denominator === 1 ? numbers[i].numerator : '1/1000000000'} count during ${period} among ${population} with denominator 1000000000`,
    ),
  );
  const rule = add('Every used link on the source grid has its own supplied cost');
  const response = add(
    `The frontier contains ${names.slice(0, -1).join(', ')}, and ${names[3]} in that order on the source grid`,
  );
  const check = add(
    `The stated route runs ${names[0]} then ${names[1]} then ${names[3]} on the source grid`,
  );
  const total = add(
    `${names[0]} route cost is 1000000000 count during ${period} among ${population} with denominator 1000000000`,
  );
  const resolve = add(`The ${names[0]} to ${names[3]} route is supplied only for the source grid`);
  const speech = expansionFixtureSpeech(clauses, 12);
  const phaseClauses = [0, 1, response, check, resolve, clauses.length],
    times = [0.25, 1.4, 5, 7.5, 10.4, 11.65];
  for (let phase = 0; phase < 5; phase++) {
    const first = speech.spans[phaseClauses[phase]].fromWord,
      last = phase === 4 ? speech.words.length : speech.spans[phaseClauses[phase + 1]].fromWord;
    const step = (times[phase + 1] - times[phase]) / (last - first);
    for (let i = first; i < last; i++) {
      speech.words[i].start = times[phase] + (i - first) * step;
      speech.words[i].end = times[phase] + (i - first + 1) * step;
    }
  }
  const quantity = (
    actor: string,
    claim: string,
    value: { numerator: number; denominator: number },
    index: number,
  ) => ({
    actor,
    claim,
    state: 'known',
    amount: { kind: 'rational', value },
    basis: {
      unit: 'count',
      period,
      population,
      denominator: { numerator: 1000000000, denominator: 1 },
    },
    evidence: speech.spans[index],
  });
  return {
    id: '29',
    ...speech,
    proposal: {
      ...searchPacket.stories[0].proposal,
      label: names[0],
      subject: names[0],
      qualification: 'source',
      evidence: 'source-stated',
      condition,
      outcome: 'supplied only for the source grid',
      startWord: 0,
      endWord: speech.words.length - 1,
      ...Object.fromEntries(
        ['setup', 'action', 'response', 'check', 'resolve'].map((beat, i) => [
          `${beat}Word`,
          speech.spans[phaseClauses[i]].fromWord,
        ]),
      ),
      entities: names.map((label, i) => ({ label, evidence: speech.spans[nodeClauses[i]] })),
      nodes: names.map((node, i) => ({
        node,
        slot: ['start', 'upper', 'lower', 'goal'][i],
        status: 'open',
        evidence: speech.spans[nodeClauses[i]],
      })),
      links: pairs.map(([a, b], i) => ({
        from: names[a],
        to: names[b],
        status: 'open',
        evidence: speech.spans[linkClauses[i]],
        ...(i === 3 ? { condition } : {}),
        cost: quantity(names[a], `${names[b]} link cost`, numbers[i], costClauses[i]),
      })),
      goal: names[3],
      rule: { kind: 'supplied-cost', evidence: speech.spans[rule] },
      frontier: { nodes: names, evidence: speech.spans[response] },
      route: {
        nodes: [names[0], names[1], names[3]],
        evidence: speech.spans[check],
        cost: quantity(names[0], 'route cost', numbers[1], total),
      },
      result: { status: 'supplied', evidence: speech.spans[resolve] },
    },
  };
}
export function searchCases() {
  return [
    parseSearch(searchMaximumSeed()),
    ...searchRawFixtures.map((s) => parseSearch(s)),
    ...quantityStates.flatMap((state) => [
      parseSearch(searchStressSeed('29', state)),
      parseSearch(searchStressSeed('30', state)),
      parseSearch(searchStressSeed('29', state, 'simulated', 'unknown', true)),
      parseSearch(searchStressSeed('30', state, 'simulated', 'blocked', true)),
    ]),
  ];
}
