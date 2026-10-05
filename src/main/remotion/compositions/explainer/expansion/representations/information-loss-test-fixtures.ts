import { readFileSync } from 'node:fs';

import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionAggregationLoss,
  parseExpansionCompressionLoss,
} from '../../../../../ai/explainer/expansion-representations-information-loss-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionInformationLossScene } from './information-loss-types';

export const informationLossPacket = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/representations/information-loss.source.json',
    'utf8',
  ),
) as { stories: (ExpansionSourceFixture & { paraphrases?: ExpansionSourceFixture[] })[] };
export function parseInformationLoss(f: ExpansionSourceFixture, proposal: Rec = f.proposal) {
  const ctx = makeParseContext(f.words, f.window);
  const scene =
    f.id === '51'
      ? parseExpansionAggregationLoss(proposal, ctx)
      : parseExpansionCompressionLoss(proposal, ctx);
  return { scene, issues: ctx.issues };
}
export function acceptedInformationLoss(
  f: ExpansionSourceFixture,
  mode: 'diagram' | 'hybrid' = 'diagram',
): ExpansionInformationLossScene {
  const result = parseInformationLoss(f, { ...f.proposal, visualMode: mode });
  if (!result.scene || result.issues?.length)
    throw new Error(`Positive rejected: ${JSON.stringify(result.issues)}`);
  return result.scene;
}
/** Complete authored clauses at parser caps, not unsafe casts of invented scene facts. */
export function maximumInformationLossFixture(
  id: '51' | '52',
  state: 'known' | 'conditional' | 'simulated' | 'unknown' | 'missing' | 'disputed' = 'known',
  cap: 'quantities' | 'relations' = 'quantities',
): ExpansionSourceFixture {
  const actor = 'W'.repeat(28),
    scope = 'MW'.repeat(20),
    period = 'M'.repeat(32);
  const inputs = Array.from(
    { length: cap === 'quantities' ? 2 : 6 },
    (_, i) => `${'W'.repeat(27)}${i}`,
  );
  const outputs = Array.from(
    { length: cap === 'quantities' ? 1 : 5 },
    (_, i) => `${'M'.repeat(27)}${i}`,
  );
  const details = Array.from({ length: 4 }, (_, i) => `${'W'.repeat(27)}${i}`);
  const title = 'MW'.repeat(24);
  const condition = `if ${'MW'.repeat(46)}M`,
    simulation = 'simulated run';
  const clauses = [`${title} identifies ${actor} for ${scope} during ${period}.`];
  const pending: { raw: Rec; index: number }[] = [];
  const absent = ['unknown', 'missing', 'disputed'].includes(state);
  const qual: Rec =
    state === 'conditional'
      ? { state, condition }
      : state === 'simulated'
        ? { state, qualifier: simulation }
        : state === 'known'
          ? { state }
          : { state, qualifier: state };
  const prefix = state === 'simulated' ? `In this ${simulation}, ` : '';
  const suffix = state === 'conditional' ? ` ${condition}` : '';
  const context = { actor, scope, period };
  function add(raw: Rec, body: string): Rec {
    pending.push({ raw, index: clauses.length });
    clauses.push(`${prefix}${body} for ${scope} during ${period}${suffix}.`);
    return raw;
  }
  const records = [...inputs, ...outputs].map((name, i) => {
    const stage = i < inputs.length ? 'input' : 'output';
    return add(
      { label: name, stage, details, ...context, ...qual },
      absent
        ? `${actor} reports ${name} ${stage} with ${details.slice(0, 3).join(', ')}, and ${details[3]} is ${state}`
        : `${actor} supplies ${name} ${stage} with ${details.slice(0, 3).join(', ')}, and ${details[3]}`,
    );
  });
  // Numerical claims are known, even when the record qualification is absent/disputed.
  const quantities = (cap === 'quantities' ? inputs : []).flatMap((record) =>
    details.map((detail, i) => {
      const amount =
        i % 2 === 0 ? { numerator: 0, denominator: 1 } : { numerator: 1, denominator: 1000000000 };
      const number = i % 2 === 0 ? '0' : '1/1000000000';
      const quantity: Rec = {
        actor,
        claim: `${record} ${detail}`,
        basis: { unit: 'byte', period, population: scope },
        state: 'known',
        amount: { kind: 'rational', value: amount },
      };
      // These clauses deliberately remain known, not silently requalified with the record.
      pending.push({ raw: quantity, index: clauses.length });
      clauses.push(
        `${actor} ${record} ${detail} is ${number} bytes during ${period} for ${scope}.`,
      );
      return { record, detail, quantity };
    }),
  );
  const bridge = id === '51' ? 'grouping' : 'correspondence';
  const relations: Rec[] = inputs.map((from, i) =>
    add(
      { type: bridge, from, to: outputs[i % outputs.length], ...context, ...qual },
      absent
        ? `${actor} reports ${from} ${bridge} into ${outputs[i % outputs.length]} is ${state}`
        : `${actor} ${id === '51' ? 'groups' : 'maps'} ${from} ${id === '51' ? 'into' : 'to'} ${outputs[i % outputs.length]}`,
    ),
  );
  const checkIndex = clauses.length;
  for (let i = 0; i < (cap === 'quantities' ? 4 : 10); i++) {
    const from = inputs[i % inputs.length],
      to = outputs[(i % inputs.length) % outputs.length],
      detail = details[Math.floor(i / inputs.length)];
    relations.push(
      add(
        { type: 'retained', from, to, detail, ...context, ...qual },
        absent
          ? `${actor} reports ${from} ${detail} retained in ${to} is ${state}`
          : `${actor} retains ${from} ${detail} in ${to}`,
      ),
    );
  }
  const resultState = state === 'missing' || state === 'disputed' ? 'known' : state;
  const behavior = resultState === 'unknown' ? 'unknown' : 'lossless';
  const resultQual = resultState === state ? qual : { state: 'known' };
  const result: Rec = { from: inputs[0], to: outputs[0], behavior, ...context, ...resultQual };
  pending.push({ raw: result, index: clauses.length });
  clauses.push(
    `${resultState === 'simulated' ? prefix : ''}${actor} reports transformation of ${inputs[0]} into ${outputs[0]} is ${behavior} for ${scope} during ${period}${resultState === 'conditional' ? suffix : ''}.`,
  );
  const speech = expansionFixtureSpeech(clauses, 12);
  const boundaries = [0, 1, 1 + inputs.length, checkIndex, clauses.length - 1, clauses.length];
  const starts = [0.25, 1.5, 4, 8, 10.6, 11.8];
  for (let phase = 0; phase < 5; phase++) {
    const first = boundaries[phase],
      last = boundaries[phase + 1];
    for (let clause = first; clause < last; clause++) {
      const span = speech.spans[clause],
        start =
          starts[phase] + ((clause - first) / (last - first)) * (starts[phase + 1] - starts[phase]);
      const duration = ((starts[phase + 1] - starts[phase]) / (last - first)) * 0.9;
      for (let word = span.fromWord; word <= span.toWord; word++)
        speech.words[word] = {
          ...speech.words[word],
          start: start + ((word - span.fromWord) / (span.toWord - span.fromWord + 1)) * duration,
          end: start + ((word - span.fromWord + 1) / (span.toWord - span.fromWord + 1)) * duration,
        };
    }
  }
  for (const entry of pending) entry.raw.evidence = speech.spans[entry.index];
  const proposal: Rec = {
    kind: 'information-transform',
    preset: id === '51' ? 'aggregation-loss' : 'compression-loss',
    template: id === '51' ? 'grouped-records' : 'paired-records',
    visualMode: 'diagram',
    evidence: state === 'simulated' ? 'illustrative' : 'source-stated',
    label: title,
    subject: actor,
    outcome: behavior,
    ...context,
    startWord: 0,
    endWord: speech.window.endWord,
    layout: 'stack',
    entities: [{ label: actor, evidence: speech.spans[0] }],
    setupWord: speech.spans[0].fromWord,
    actionWord: speech.spans[1].fromWord,
    responseWord: speech.spans[1 + inputs.length].fromWord,
    checkWord: speech.spans[checkIndex].fromWord,
    resolveWord: speech.spans[clauses.length - 1].fromWord,
    records,
    quantities,
    relations,
    result,
  };
  return { id, ...speech, proposal, negatives: [] };
}
export function informationLossCases(): ExpansionInformationLossScene[] {
  const fixtures = informationLossPacket.stories.flatMap((f) => [f, ...(f.paraphrases ?? [])]);
  for (const id of ['51', '52'] as const)
    for (const state of [
      'known',
      'conditional',
      'simulated',
      'unknown',
      'missing',
      'disputed',
    ] as const)
      for (const cap of ['quantities', 'relations'] as const)
        fixtures.push(maximumInformationLossFixture(id, state, cap));
  return fixtures.flatMap((f) =>
    ['diagram', 'hybrid'].map((mode) => acceptedInformationLoss(f, mode as 'diagram' | 'hybrid')),
  );
}
