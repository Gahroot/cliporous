import { readFileSync } from 'node:fs';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionExpiry,
  parseExpansionReversible,
} from '../../../../../ai/explainer/expansion-temporal-reversible-expiry-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionReversibleExpiryScene } from './reversible-expiry-types';

export const reversibleExpiryPacket: {
  stories: (ExpansionSourceFixture & {
    paraphrases: ExpansionSourceFixture[];
    examples?: ExpansionSourceFixture[];
  })[];
} = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/temporal/reversible-expiry.source.json',
    'utf8',
  ),
);
export function parseReversibleExpiryFixture(
  seed: ExpansionSourceFixture,
): ExpansionReversibleExpiryScene {
  const ctx = makeParseContext(seed.words, seed.window);
  const scene =
    seed.id === '43'
      ? parseExpansionReversible(seed.proposal, ctx)
      : parseExpansionExpiry(seed.proposal, ctx);
  if (!scene) throw new Error(JSON.stringify(ctx.issues));
  return scene;
}
/** Real caps: 8 identities; 43 has 11 reports/16 transitions, 44 has 6 attempts/authorizations. */
export function reversibleExpiryStressSeed(
  story: '43' | '44',
  quantityState = 'known',
  validity = false,
  fractional = false,
  equivalentEndpointConditions = false,
): ExpansionSourceFixture {
  const actor = 'A'.repeat(28),
    resource = 'W'.repeat(28),
    members = Array.from({ length: 6 }, (_, i) => `${'M'.repeat(27)}${i}`);
  const scope = 'S'.repeat(40),
    period = 'P'.repeat(32),
    timingBasis = scope,
    label = 'L'.repeat(48),
    condition = `if ${'Q'.repeat(93)}`;
  const common = { actor, resource, scope, period };
  const clauses: string[] = [];
  const add = (s: string): number => {
    clauses.push(s);
    return clauses.length - 1;
  };
  const setup = add(
    `${label} names ${actor} as actor, ${resource} as resource, and ${members.slice(0, -1).join(', ')} and ${members[5]} as ${story === '43' ? 'states' : 'events'} for ${scope} during ${period}${story === '44' ? ` with basis ${timingBasis}` : ''}.`,
  );
  const records: Rec[] = [],
    relations: Rec[] = [];
  const proofs: { object: Rec; index: number }[] = [];
  let action = 1,
    response = 2,
    check = 3;
  if (story === '43') {
    let n = 0;
    for (let from = 0; from < 6 && n < 16; from++)
      for (let to = 0; to < 6 && n < 16; to++)
        if (from !== to) {
          const state =
            n % 4 === 0
              ? 'conditional'
              : n % 4 === 1
                ? 'allowed'
                : n % 4 === 2
                  ? 'denied'
                  : 'unknown';
          const status = state === 'conditional' ? 'allowed' : state;
          const index = add(
            `${state === 'conditional' ? `${condition}, ` : ''}${status === 'unknown' ? `${actor} transition of ${resource} from ${members[from]} to ${members[to]} is unknown` : `${actor} is ${status} to move ${resource} from ${members[from]} to ${members[to]}`} for ${scope} during ${period}.`,
          );
          const object: Rec = {
            ...common,
            from: members[from],
            to: members[to],
            state,
            ...(state === 'conditional' ? { status, condition } : {}),
          };
          relations.push(object);
          proofs.push({ object, index });
          n++;
        }
    action = 1;
    response = 9;
    check = clauses.length;
    for (let i = 0; i < 11; i++) {
      const state = i % 3 === 0 ? 'known' : i % 3 === 1 ? 'unknown' : 'conditional';
      const index = add(
        `${state === 'conditional' ? `${condition}, ` : ''}${actor} reports ${resource} state is ${state === 'unknown' ? 'unknown' : members[i % 6]} for ${scope} during ${period}.`,
      );
      const object: Rec = {
        ...common,
        type: 'state',
        state,
        ...(state !== 'unknown' ? { value: members[i % 6] } : {}),
        ...(state === 'conditional' ? { condition } : {}),
      };
      records.push(object);
      proofs.push({ object, index });
    }
  } else {
    const quantity = (claim: string, value: number, state: string): Rec => {
      const suppliedCondition = equivalentEndpointConditions
        ? claim === 'validity end'
          ? 'IF   READY'
          : 'if ready'
        : condition;
      const denominator = fractional ? 1000000000 : 1;
      const lexeme = fractional ? `${value}/${denominator}` : `${value}`;
      const assertion =
        state === 'unknown' || state === 'missing'
          ? `is ${state} hour`
          : state === 'disputed'
            ? `is disputed between ${lexeme} and ${value + 1} hour`
            : `is ${lexeme} hour`;
      const index = add(
        `${state === 'conditional' ? `${suppliedCondition}, ` : ''}${actor} ${resource} ${claim} ${assertion} during ${period} for ${timingBasis}.`,
      );
      const object: Rec = {
        actor,
        claim: `${resource} ${claim}`,
        basis: { unit: 'hour', population: timingBasis, period },
        state,
        ...(state === 'unknown' || state === 'missing'
          ? { qualifier: state }
          : state === 'disputed'
            ? {
                qualifier: 'disputed',
                alternatives: [value, value + 1].map((numerator) => ({
                  kind: 'rational',
                  value: { numerator, denominator: 1 },
                })),
              }
            : {
                amount: { kind: 'rational', value: { numerator: value, denominator } },
                ...(state === 'conditional' ? { condition: suppliedCondition } : {}),
              }),
      };
      proofs.push({ object, index });
      return object;
    };
    action = clauses.length;
    records.push(
      validity
        ? {
            ...common,
            type: 'validity',
            representedStart: quantity('validity start', 0, quantityState),
            representedEnd: quantity('validity end', 999999999, quantityState),
          }
        : {
            ...common,
            type: 'deadline',
            representedDeadline: quantity('deadline', 999999999, quantityState),
          },
    );
    response = clauses.length;
    for (const [i, event] of members.entries()) {
      records.push({
        ...common,
        type: 'attempt',
        event,
        representedEventTime: quantity(`${event} attempt time`, i, quantityState),
      });
    }
    check = clauses.length;
    members.forEach((event, i) => {
      const state =
        i % 4 === 0 ? 'conditional' : i % 4 === 1 ? 'allowed' : i % 4 === 2 ? 'denied' : 'unknown';
      const status = state === 'conditional' ? 'allowed' : state;
      const index = add(
        `${state === 'conditional' ? `${condition}, ` : ''}${actor}'s authorization for ${event} on ${resource} is ${status} for ${scope} during ${period}.`,
      );
      const object: Rec = {
        ...common,
        event,
        state,
        ...(state === 'conditional' ? { status, condition } : {}),
      };
      relations.push(object);
      proofs.push({ object, index });
    });
  }
  const resolve = clauses.length;
  const result: Rec = {
    ...common,
    state: 'unknown',
    ...(story === '44' ? { event: members[0] } : {}),
  };
  proofs.push({
    object: result,
    index: add(
      `${actor}'s result ${story === '44' ? `for ${members[0]} ` : ''}on ${resource} is unknown for ${scope} during ${period}.`,
    ),
  });
  const speech = expansionFixtureSpeech(clauses);
  const groups = [setup, action, response, check, resolve, clauses.length];
  const times = [0.25, 1.7, 3.3, 5, 8.8, 9.65];
  const words = speech.words.map((w, i) => {
    const c = speech.spans.findIndex((span) => i >= span.fromWord && i <= span.toWord);
    const g = groups.findIndex((start, j) => j < 5 && c >= start && c < groups[j + 1]);
    const first = speech.spans[groups[g]].fromWord,
      last = speech.spans[groups[g + 1] - 1].toWord;
    const step = (times[g + 1] - times[g]) / (last - first + 1);
    return { ...w, start: times[g] + (i - first) * step, end: times[g] + (i - first + 1) * step };
  });
  proofs.forEach(({ object, index }) => {
    object.evidence = speech.spans[index];
  });
  const proposal: Rec = {
    ...common,
    kind: story === '43' ? 'state-transition' : 'temporal-structure',
    preset: story === '43' ? 'reversible' : 'expiry',
    visualMode: 'diagram',
    template: story === '43' ? 'state-rail' : 'expiry-window',
    label,
    subject: resource,
    outcome: 'unknown',
    evidence: 'source-stated',
    entities: [actor, resource, ...members].map((name) => ({
      label: name,
      evidence: speech.spans[0],
    })),
    ...(story === '43' ? { states: members } : { events: members, timingBasis }),
    records,
    relations,
    result,
  };
  ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'].forEach((field, i) => {
    proposal[field] = speech.spans[groups[i]].fromWord;
  });
  return {
    id: story,
    sourceText: speech.sourceText,
    words,
    window: speech.window,
    proposal,
    negatives: [],
  };
}
export function reversibleExpiryTestScenes(): ExpansionReversibleExpiryScene[] {
  return [
    ...reversibleExpiryPacket.stories.flatMap((s) => [s, ...s.paraphrases, ...(s.examples ?? [])]),
    reversibleExpiryStressSeed('43'),
    reversibleExpiryStressSeed('44', 'known', true, true),
    reversibleExpiryStressSeed('44', 'conditional', true, false, true),
    ...['known', 'unknown', 'missing', 'disputed', 'conditional'].flatMap((state) => [
      reversibleExpiryStressSeed('44', state),
      reversibleExpiryStressSeed('44', state, true),
    ]),
  ].map(parseReversibleExpiryFixture);
}
