import { readFileSync } from 'node:fs';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionDualRights,
  parseExpansionTaxonomy,
} from '../../../../../ai/explainer/expansion-relationships-taxonomy-rights-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionTaxonomyRightsScene } from './taxonomy-rights-types';

export const taxonomyRightsPacket: {
  stories: (ExpansionSourceFixture & { paraphrases: ExpansionSourceFixture[] })[];
} = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/relationships/taxonomy-rights.source.json',
    'utf8',
  ),
);
export function parseTaxonomyRightsFixture(
  seed: ExpansionSourceFixture,
): ExpansionTaxonomyRightsScene {
  const ctx = makeParseContext(seed.words, seed.window);
  const scene =
    seed.id === '33'
      ? parseExpansionTaxonomy(seed.proposal, ctx)
      : parseExpansionDualRights(seed.proposal, ctx);
  if (!scene) throw new Error(JSON.stringify(ctx.issues));
  return scene;
}
export type TestRelationshipState =
  | 'known'
  | 'denied'
  | 'unknown'
  | 'missing'
  | 'disputed'
  | 'conditional'
  | 'illustrative'
  | 'simulated';
export interface TaxonomyRightsStressOptions {
  readonly story: '33' | '34';
  readonly state?: TestRelationshipState;
  readonly unit?: 'count' | 'percent' | 'ratio';
  readonly zero?: boolean;
  readonly concentrated?: boolean;
}
/** Maximum accepted local entities/relations and source text; every fact goes through the real parser. */
export function taxonomyRightsStressSeed(
  options: TaxonomyRightsStressOptions,
): ExpansionSourceFixture {
  const taxonomy = options.story === '33';
  const scope = 'S'.repeat(40),
    period = 'P'.repeat(32),
    subject = 'Guide';
  const condition = `If ${'Q'.repeat(93)}`;
  const names = Array.from({ length: 8 }, (_, i) => `${'W'.repeat(27)}${i}`);
  const actorCount = options.concentrated ? 4 : 6;
  const first = taxonomy ? names.slice(0, 3) : names.slice(0, actorCount);
  const second = taxonomy ? names.slice(3) : names.slice(actorCount);
  const clauses = [
    `${subject} ${taxonomy ? 'lists categories' : 'compares actors'} ${first.join(' and ')} and ${taxonomy ? 'members' : 'resources'} ${second.join(' and ')} for ${scope} during ${period}.`,
  ];
  const declarations = names.map((entity, i) => ({
    entity,
    type: taxonomy ? (i < 3 ? 'category' : 'member') : i < actorCount ? 'actor' : 'resource',
  }));
  const rows: Rec[] = [];
  const relationClauses: number[] = [];
  const quantities: { row: number; quantity: Rec; proof: number; evidence: number }[] = [];
  const states: TestRelationshipState[] = [
    'known',
    'denied',
    'unknown',
    'missing',
    'disputed',
    'conditional',
    'illustrative',
    'simulated',
  ];
  for (let i = 0; i < 16; i++) {
    const requestedState = options.state ?? states[i % states.length];
    // The common contract accepts exactly one condition occurrence per source window.
    const state =
      requestedState === 'conditional' && (options.unit || (options.state ? i !== 0 : i !== 5))
        ? 'known'
        : requestedState;
    const from = taxonomy
      ? i < 2
        ? names[i + 1]
        : names[3 + Math.floor((i - 2) / 3)]
      : names[options.concentrated ? (i < 14 ? Math.floor(i / 4) : 0) : Math.floor(i / 3)];
    const to = taxonomy
      ? i < 2
        ? names[i]
        : names[(i - 2) % 3]
      : names[options.concentrated ? (i < 14 ? 4 + (i % 4) : 4) : i === 15 ? 7 : 6];
    const role = i < 2 ? 'parent' : 'membership';
    const right = (['economic', 'voting', 'control'] as const)[
      options.concentrated ? (i < 14 ? 0 : i - 13) : i % 3
    ];
    const positive = taxonomy ? 'included' : 'granted',
      negative = taxonomy ? 'excluded' : 'denied';
    const body = taxonomy
      ? `${from} is ${state === 'denied' ? 'not ' : ''}a ${role === 'parent' ? 'subcategory' : 'member'} of ${to}`
      : `${from} ${state === 'denied' ? 'has no' : 'holds'} ${right} rights over ${to}`;
    const unresolved = taxonomy
      ? `${from} ${role === 'parent' ? 'parent link to' : 'membership in'} ${to}`
      : `${from} ${right} rights over ${to}`;
    // These are the longest literals accepted by the relationship contract, not free text.
    const qualifier = state === 'illustrative' ? 'illustrative example' : 'simulated example';
    const assertion =
      state === 'unknown' || state === 'missing' || state === 'disputed'
        ? `${unresolved} ${taxonomy ? 'is' : 'are'} ${state}${state === 'disputed' ? ` between ${positive} and ${negative}` : ''}`
        : body;
    relationClauses.push(clauses.length);
    clauses.push(
      `${state === 'conditional' ? `${condition}, ` : state === 'illustrative' || state === 'simulated' ? `In this ${qualifier}, ` : ''}${assertion} for ${scope} during ${period}.`,
    );
    const row: Rec = {
      ...(taxonomy ? { from, to, role } : { actor: from, resource: to, right }),
      scope,
      period,
      state: state === 'denied' ? 'known' : state,
      ...(state === 'unknown' || state === 'missing'
        ? { qualifier: state }
        : state === 'disputed'
          ? { qualifier: state, alternatives: [positive, negative] }
          : {
              status: state === 'denied' ? negative : positive,
              ...(state === 'conditional'
                ? { condition }
                : state === 'illustrative' || state === 'simulated'
                  ? { qualifier }
                  : {}),
            }),
    };
    rows.push(row);
    if (!taxonomy && i === 0 && options.unit && state !== 'denied') {
      const state = options.state ?? 'known';
      const unit = options.unit;
      const denominator = unit === 'count' ? 1_000_000_000 : unit === 'percent' ? 100 : 1;
      const amount = {
        kind: 'rational',
        value: {
          numerator: options.zero ? 0 : unit === 'count' ? 999_999_999 : 1,
          denominator: unit === 'ratio' && !options.zero ? 3 : 1,
        },
      };
      const notation = options.zero
        ? '0'
        : unit === 'count'
          ? '999999999'
          : unit === 'ratio'
            ? '1/3'
            : '1';
      const quantity: Rec = {
        actor: from,
        claim: `${to} ${right} share`,
        basis: {
          unit,
          period,
          population: scope,
          denominator: { numerator: denominator, denominator: 1 },
        },
        state,
        ...(state === 'unknown' || state === 'missing'
          ? { qualifier: state }
          : state === 'disputed'
            ? {
                qualifier: state,
                alternatives: [
                  amount,
                  { kind: 'rational', value: { numerator: 0, denominator: 1 } },
                ],
              }
            : {
                amount,
                ...(state === 'conditional'
                  ? { condition }
                  : state === 'illustrative' || state === 'simulated'
                    ? { qualifier }
                    : {}),
              }),
      };
      const evidence = clauses.length;
      const valueText =
        state === 'unknown' || state === 'missing'
          ? state
          : state === 'disputed'
            ? `disputed between ${notation} and 0`
            : notation;
      clauses.push(
        `${state === 'conditional' ? `${condition}, ` : state === 'illustrative' || state === 'simulated' ? `In this ${qualifier}, ` : ''}${from} ${to} ${right} share is ${valueText} ${unit} during ${period} for ${scope} with denominator ${denominator}.`,
      );
      const proof = clauses.length;
      clauses.push(
        `${state === 'illustrative' || state === 'simulated' ? `In this ${qualifier}, ` : ''}${from} ${to} ${right} share denominator is ${denominator} ${unit} during ${period} for ${scope}.`,
      );
      quantities.push({ row: i, quantity, proof, evidence });
    }
  }
  clauses.push(
    `${subject} keeps ${taxonomy ? 'only stated links' : 'separate source-stated rights'}.`,
  );
  const duration = 12;
  const speech = expansionFixtureSpeech(clauses, duration);
  speech.spans.forEach((span, i) => {
    const count = span.toWord - span.fromWord + 1;
    const start = i === 0 ? 0.25 : 1.5 + ((i - 1) * 9) / (clauses.length - 2);
    const length = i === 0 ? 0.6 : 0.3;
    for (let w = span.fromWord; w <= span.toWord; w++) {
      const word = speech.words[w];
      if (!word) throw new Error('Missing fixture word');
      word.start = start + (length * (w - span.fromWord)) / count;
      word.end = start + (length * (w - span.fromWord + 1)) / count;
    }
  });
  rows.forEach((row, i) => {
    row.evidence = speech.spans[relationClauses[i]];
  });
  quantities.forEach((q) => {
    q.quantity.evidence = speech.spans[q.evidence];
    const row = rows[q.row];
    if (!row) throw new Error('Missing fixture relation');
    row.share = {
      quantity: q.quantity,
      denominatorUnit: options.unit,
      basisEvidence: speech.spans[q.proof],
    };
  });
  const source = taxonomyRightsPacket.stories.find((s) => s.id === options.story);
  if (!source) throw new Error('Missing shipped fixture');
  const proposal: Rec = {
    ...source.proposal,
    label: subject,
    subject,
    scope,
    period,
    startWord: 0,
    endWord: speech.words.length - 1,
    setupWord: 0,
    actionWord: speech.spans[relationClauses[0]]?.fromWord,
    responseWord: speech.spans[relationClauses[5]]?.fromWord,
    checkWord: speech.spans[relationClauses[10]]?.fromWord,
    resolveWord: speech.spans.at(-1)?.fromWord,
    entities: names.map((label) => ({ label, evidence: speech.spans[0] })),
    records: declarations.map((record) => ({ ...record, evidence: speech.spans[0] })),
    relations: rows,
    evidence: 'illustrative',
    ...(options.state === 'conditional' || !options.state ? { condition } : {}),
  };
  return {
    id: options.story,
    sourceText: speech.sourceText,
    words: speech.words,
    window: speech.window,
    proposal,
    negatives: [],
  };
}
export function taxonomyRightsTestScenes(): ExpansionTaxonomyRightsScene[] {
  return [
    ...taxonomyRightsPacket.stories.map(parseTaxonomyRightsFixture),
    ...(['33', '34'] as const).map((story) =>
      parseTaxonomyRightsFixture(taxonomyRightsStressSeed({ story })),
    ),
    ...(['count', 'percent', 'ratio'] as const).flatMap((unit) =>
      (
        [
          'known',
          'unknown',
          'missing',
          'disputed',
          'conditional',
          'illustrative',
          'simulated',
        ] as const
      ).map((state) =>
        parseTaxonomyRightsFixture(taxonomyRightsStressSeed({ story: '34', state, unit })),
      ),
    ),
    parseTaxonomyRightsFixture(
      taxonomyRightsStressSeed({ story: '34', state: 'known', unit: 'count', zero: true }),
    ),
    ...(
      [
        'known',
        'denied',
        'unknown',
        'missing',
        'disputed',
        'conditional',
        'illustrative',
        'simulated',
      ] as const
    ).map((state) => parseTaxonomyRightsFixture(taxonomyRightsStressSeed({ story: '33', state }))),
    parseTaxonomyRightsFixture(
      taxonomyRightsStressSeed({ story: '34', state: 'known', concentrated: true }),
    ),
  ];
}
