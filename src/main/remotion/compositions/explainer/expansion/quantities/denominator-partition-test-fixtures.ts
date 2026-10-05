import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionDenominator,
  parseExpansionPartition,
} from '../../../../../ai/explainer/expansion-quantities-denominator-partition-contract';
import { parseExpansionQuantity } from '../../../../../ai/explainer/expansion-quantity-contract';
import {
  makeParseContext,
  type PlannerWord,
  type Rec,
  type SceneWindow,
} from '../../../../../ai/explainer/kind-spec';
import type {
  ExpansionDenominatorPartitionScene,
  ExpansionDenominatorScene,
  ExpansionPartitionScene,
} from './denominator-partition-types';

const packet = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../../../scripts/explainer-stills/fixtures/expansion/quantities/denominator-partition.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { version: number; pack: string; stories: ExpansionSourceFixture[] };
function requiredFixture(id: '19' | '20'): ExpansionSourceFixture {
  const story = packet.stories.find((entry) => entry.id === id);
  if (!story) throw new Error('Both approved quantity source stories are required');
  return story;
}
const denominator = requiredFixture('19');
const partition = requiredFixture('20');
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
function parse(id: '19' | '20', proposal: Rec, words: readonly PlannerWord[], window: SceneWindow) {
  const ctx = makeParseContext(words, window);
  const scene =
    id === '19' ? parseExpansionDenominator(proposal, ctx) : parseExpansionPartition(proposal, ctx);
  return { scene, ctx };
}
function clauses(story: ExpansionSourceFixture): string[] {
  return story.sourceText.split(/(?<=\.)\s+(?=[A-Z])/u);
}
function paraphrase(story: ExpansionSourceFixture, source: readonly string[]) {
  const speech = expansionFixtureSpeech(source, 10),
    old = expansionFixtureSpeech(clauses(story), 10);
  function rebase(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(rebase);
    if (value && typeof value === 'object') {
      const record = value as Rec;
      if (Object.keys(record).length === 2 && 'fromWord' in record && 'toWord' in record) {
        const index = old.spans.findIndex(
          (span) => span.fromWord === record.fromWord && span.toWord === record.toWord,
        );
        if (index < 0) throw new Error('Source evidence must remain a complete authored clause');
        return { ...speech.spans[index] };
      }
      return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, rebase(entry)]));
    }
    return value;
  }
  const proposal = rebase(story.proposal) as Rec;
  proposal.startWord = speech.window.startWord;
  proposal.endWord = speech.window.endWord;
  const phaseIndices = story.id === '19' ? [0, 1, 2, 3, 5] : [0, 1, 2, 3, 4];
  BEATS.forEach((field, index) => {
    proposal[field] = speech.spans[phaseIndices[index]].fromWord;
  });
  return { ...speech, proposal };
}
function positive19(
  proposal: Rec,
  words: readonly PlannerWord[],
  window: SceneWindow,
): ExpansionDenominatorScene {
  const result = parse('19', proposal, words, window);
  expect(result.ctx.issues).toEqual([]);
  expect(result.scene).not.toBeNull();
  expect(result.scene?.kind).toBe('quantity-comparison');
  expect(parse('19', { ...proposal, visualMode: 'hybrid' }, words, window).scene).toEqual({
    ...result.scene,
    visualMode: 'hybrid',
  });
  if (!result.scene || result.scene.storyId !== '19')
    throw new Error('Expected real denominator scene');
  return result.scene;
}
function positive20(
  proposal: Rec,
  words: readonly PlannerWord[],
  window: SceneWindow,
): ExpansionPartitionScene {
  const result = parse('20', proposal, words, window);
  expect(result.ctx.issues).toEqual([]);
  expect(result.scene).not.toBeNull();
  expect(result.scene?.kind).toBe('composition-view');
  expect(parse('20', { ...proposal, visualMode: 'hybrid' }, words, window).scene).toEqual({
    ...result.scene,
    visualMode: 'hybrid',
  });
  if (!result.scene || result.scene.storyId !== '20')
    throw new Error('Expected real partition scene');
  return result.scene;
}
function rows(proposal: Rec) {
  return proposal.comparisons as { entity: string; actor: string; amount: Rec; reference: Rec }[];
}
function parts(proposal: Rec) {
  return proposal.parts as { entity: string; role: string; quantity: Rec; membership: Rec }[];
}
function rationalAmount(numerator: number) {
  return { kind: 'rational', value: { numerator, denominator: 1 } };
}
function money(minorUnits: number) {
  return { kind: 'money', value: { minorUnits, currency: 'USD' } };
}
function qualify(quantity: Rec, state: string) {
  quantity.state = state;
  quantity.qualifier = state;
  delete quantity.amount;
}
function orderedPercentChange(unit = 'count') {
  const source = clauses(denominator);
  source[0] = `Ada's sales comparison orders Alpha during March before Beta during April.`;
  for (const index of [1, 2, 3, 4])
    source[index] = source[index].replace('count during', `${unit} during`);
  source[3] = source[3].replace('March', 'April');
  source[4] = source[4].replace('March', 'April');
  const next = paraphrase(denominator, source);
  for (const row of rows(next.proposal))
    for (const quantity of [row.amount, row.reference]) (quantity.basis as Rec).unit = unit;
  for (const quantity of [rows(next.proposal)[1].amount, rows(next.proposal)[1].reference])
    (quantity.basis as Rec).period = 'April';
  next.proposal.ordering = { from: 'Alpha', to: 'Beta', evidence: next.spans[0] };
  next.proposal.derive = [{ operation: 'percent-change', from: 'Alpha', to: 'Beta' }];
  return next;
}

export function denominatorPartitionCases(): ExpansionDenominatorPartitionScene[] {
  const cases: ExpansionDenominatorPartitionScene[] = [
    positive19(denominator.proposal, denominator.words, denominator.window),
    positive20(partition.proposal, partition.words, partition.window),
  ];
  const ordered = orderedPercentChange();
  cases.push(positive19(ordered.proposal, ordered.words, ordered.window));
  for (const state of ['missing', 'unknown', 'disputed']) {
    const source = clauses(denominator);
    source[2] = source[2].replace(
      '100 count',
      state === 'disputed' ? 'disputed between 100 and 200 count' : `${state} count`,
    );
    const next = paraphrase(denominator, source);
    delete next.proposal.derive;
    const q = rows(next.proposal)[0].reference;
    qualify(q, state);
    if (state === 'disputed') q.alternatives = [rationalAmount(100), rationalAmount(200)];
    cases.push(positive19(next.proposal, next.words, next.window));
  }
  for (const [state, qualifier] of [
    ['illustrative', 'teaching example'],
    ['simulated', 'simulation'],
    ['conditional', 'If permits are granted'],
  ] as const) {
    const source = clauses(denominator);
    source[1] =
      state === 'conditional' ? `${qualifier}, ${source[1]}` : `In this ${qualifier}, ${source[1]}`;
    const next = paraphrase(denominator, source);
    delete next.proposal.derive;
    const q = rows(next.proposal)[0].amount;
    q.state = state;
    if (state === 'conditional') {
      q.condition = qualifier;
      next.proposal.condition = qualifier;
    } else {
      q.qualifier = qualifier;
      next.proposal.evidence = 'illustrative';
    }
    cases.push(positive19(next.proposal, next.words, next.window));
  }
  for (const state of ['missing', 'disputed', 'known', 'unknown-total']) {
    const source = clauses(partition);
    if (state === 'unknown-total') source[1] = source[1].replace('1000.00 USD', 'unknown USD');
    else
      source[4] = source[4].replace(
        'unknown USD',
        state === 'disputed'
          ? 'disputed between 0.00 and 300.00 USD'
          : state === 'known'
            ? '300.00 USD'
            : 'missing USD',
      );
    const next = paraphrase(partition, source);
    if (state === 'unknown-total') qualify(next.proposal.total as Rec, 'unknown');
    else {
      const q = parts(next.proposal)[2].quantity;
      next.proposal.outcome = state === 'known' ? '300.00' : state;
      qualify(q, state);
      if (state === 'disputed') q.alternatives = [money(0), money(30000)];
      if (state === 'known') {
        delete q.qualifier;
        q.amount = money(30000);
      }
    }
    cases.push(positive20(next.proposal, next.words, next.window));
  }
  // Actual parser maxima: six parts + distinct owner/whole exhaust eight entities.
  const labels = Array.from({ length: 6 }, (_, i) => `${i % 2 ? 'M' : 'W'}${'W'.repeat(26)}${i}`);
  const owner = 'A',
    whole = 'M'.repeat(24),
    actor = `${owner}'s ${whole}`;
  // A terminal WWW. is URL-like source text and correctly rejected by the frozen contract.
  const period = 'M'.repeat(32),
    population = `${'W'.repeat(39)}X`;
  const basis = { unit: 'count', period, population };
  const source = [
    `${actor} includes ${labels.slice(0, -1).join(', ')}, and ${labels[5]} as parts of ${whole}.`,
    `${actor} total is 1000000000 count during ${period} among ${population}.`,
    ...labels.map(
      (label, i) =>
        `${actor} ${label} part is ${i === 5 ? 'unknown' : '1'} count during ${period} among ${population}.`,
    ),
  ];
  const speech = expansionFixtureSpeech(source, 10);
  const proposal: Rec = {
    ...partition.proposal,
    subject: owner,
    label: whole,
    owner,
    whole,
    startWord: 0,
    endWord: speech.words.length - 1,
    setupWord: speech.spans[0].fromWord,
    actionWord: speech.spans[1].fromWord,
    responseWord: speech.spans[2].fromWord,
    checkWord: speech.spans[3].fromWord,
    resolveWord: speech.spans[7].fromWord,
    entities: [owner, whole, ...labels].map((label) => ({ label, evidence: speech.spans[0] })),
    total: {
      actor,
      claim: 'total',
      basis,
      evidence: speech.spans[1],
      state: 'known',
      amount: rationalAmount(1000000000),
    },
    parts: labels.map((entity, i) => ({
      entity,
      role: i === 5 ? 'remainder' : 'part',
      membership: speech.spans[0],
      quantity: {
        actor,
        claim: `${entity} part`,
        basis,
        evidence: speech.spans[i + 2],
        ...(i === 5
          ? { state: 'unknown', qualifier: 'unknown' }
          : { state: 'known', amount: rationalAmount(1) }),
      },
    })),
  };
  for (const q of [proposal.total as Rec, ...parts(proposal).map((p) => p.quantity)]) {
    const ctx = makeParseContext(speech.words, speech.window);
    expect(parseExpansionQuantity(q, ctx), JSON.stringify(q)).not.toBeNull();
  }
  cases.push(positive20(proposal, speech.words, speech.window));
  // Maximum rational components and wide W/M labels, source-bound rather than cast scenes.
  const replacements: [string, string][] = [
    ['Ada', 'W'.repeat(28)],
    ['sales', 'M'.repeat(28)],
    ['Alpha', `${'W'.repeat(27)}A`],
    ['Beta', `${'M'.repeat(27)}B`],
    ['March', period],
    ['district', population],
  ];
  const replace = (s: string) => replacements.reduce((s, [a, b]) => s.replaceAll(a, b), s);
  const bigSource = clauses(denominator).map(replace);
  for (const i of [1, 3])
    bigSource[i] = bigSource[i].replace(/(?:20|40) count/, '999999999/1000000000 count');
  for (const i of [2, 4])
    bigSource[i] = bigSource[i].replace(/(?:100|400) count/, '1000000000/999999999 count');
  const big = paraphrase(denominator, bigSource);
  const rename = (v: unknown): unknown =>
    typeof v === 'string'
      ? replace(v)
      : Array.isArray(v)
        ? v.map(rename)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, v]) => [k, rename(v)]))
          : v;
  big.proposal = rename(big.proposal) as Rec;
  delete big.proposal.derive;
  for (const r of rows(big.proposal)) {
    r.amount.amount = {
      kind: 'rational',
      value: { numerator: 999999999, denominator: 1000000000 },
    };
    r.reference.amount = {
      kind: 'rational',
      value: { numerator: 1000000000, denominator: 999999999 },
    };
  }
  cases.push(positive19(big.proposal, big.words, big.window));
  const denominatorSource = clauses(denominator).map((s, i) =>
    i >= 1 && i <= 4 ? s.replace('district.', 'district with denominator 1000000000.') : s,
  );
  const explicit = paraphrase(denominator, denominatorSource);
  delete explicit.proposal.derive;
  for (const r of rows(explicit.proposal))
    for (const q of [r.amount, r.reference])
      (q.basis as Rec).denominator = { numerator: 1000000000, denominator: 1 };
  cases.push(positive19(explicit.proposal, explicit.words, explicit.window));
  for (const state of ['conditional', 'illustrative', 'simulated'] as const) {
    const prefix =
      state === 'conditional'
        ? 'If permits are granted '
        : state === 'illustrative'
          ? 'teaching example '
          : 'simulation ';
    const qualification = `${prefix}${'W'.repeat(95 - prefix.length)}X`;
    expect(qualification).toHaveLength(96);
    const source = clauses(denominator);
    source[1] =
      state === 'conditional'
        ? `${qualification}, ${source[1]}`
        : `In this ${qualification}, ${source[1]}`;
    const next = paraphrase(denominator, source);
    delete next.proposal.derive;
    const q = rows(next.proposal)[0].amount;
    q.state = state;
    if (state === 'conditional') {
      q.condition = qualification;
      next.proposal.condition = qualification;
    } else {
      q.qualifier = qualification;
      next.proposal.evidence = 'illustrative';
    }
    cases.push(positive19(next.proposal, next.words, next.window));
  }
  const signedSource = clauses(denominator);
  const lexemes = ['-2.50', '100.00', '12.50', '400.00'];
  for (let i = 1; i <= 4; i++)
    signedSource[i] = signedSource[i].replace(/(?:20|100|40|400) count/, `${lexemes[i - 1]} USD`);
  const signed = paraphrase(denominator, signedSource);
  let i = 0;
  for (const r of rows(signed.proposal))
    for (const q of [r.amount, r.reference]) {
      (q.basis as Rec).unit = 'USD';
      q.amount = money([-250, 10000, 1250, 40000][i++]);
    }
  cases.push(positive19(signed.proposal, signed.words, signed.window));
  for (const zero of [false, true]) {
    const source = clauses(partition).map((s) => s.replaceAll('USD', 'count'));
    source[1] = source[1].replace('1000.00', zero ? '0' : '1/2');
    source[2] = source[2].replace('400.00', zero ? '0' : '1/4');
    source[3] = source[3].replace('300.00', zero ? '0' : '1/4');
    source[4] = source[4].replace('unknown', '0');
    const next = paraphrase(partition, source);
    next.proposal.outcome = '0';
    for (const [i, q] of [
      next.proposal.total as Rec,
      ...parts(next.proposal).map((p) => p.quantity),
    ].entries()) {
      (q.basis as Rec).unit = 'count';
      q.state = 'known';
      delete q.qualifier;
      q.amount = {
        kind: 'rational',
        value: {
          numerator: zero || i === 3 ? 0 : 1,
          denominator: zero || i === 3 ? 1 : i === 0 ? 2 : 4,
        },
      };
    }
    cases.push(positive20(next.proposal, next.words, next.window));
    const negative = structuredClone(next.proposal);
    (negative.total as Rec).amount = rationalAmount(-1);
    expect(parse('20', negative, next.words, next.window).scene).toBeNull();
  }
  return cases;
}

export { clauses, denominator, paraphrase, positive19, rationalAmount, rows };
