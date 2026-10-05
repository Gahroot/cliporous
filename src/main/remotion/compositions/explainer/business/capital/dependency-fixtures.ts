import {
  isRec,
  makeParseContext,
  type ParseContext,
  type PlannerWord,
  type Rec,
} from '../../../../../ai/explainer/kind-spec';
import type { BusinessWordSpan } from '../types';

export interface SharedDependencySourceFixture {
  id: 'OP-58';
  raw: Rec;
  words: PlannerWord[];
}
export interface SharedDependencyFixtureOptions {
  maxLabels?: boolean;
  includeLens?: boolean;
  version?: number;
  holdingClauses?: readonly [string, string];
  driverClauses?: readonly [string, string];
  modelClause?: string;
  sharedClause?: string;
}

/** Authored qualitative firm dependencies, not invented numeric risk, correlation or fund terms. */
export function sharedDependencyFixture(
  options: SharedDependencyFixtureOptions = {},
): SharedDependencySourceFixture {
  const funds = options.maxLabels
    ? [
        { id: 'cedar', label: 'Cedar Portfolio Holdings ABC' },
        { id: 'birch', label: 'Birch Portfolio Holdings XYZ' },
      ]
    : [
        { id: 'cedar', label: 'Cedar Fund' },
        { id: 'birch', label: 'Birch Fund' },
      ];
  const firms = options.maxLabels
    ? [
        { id: 'acorn', label: 'Acorn Financial Holdings ABC' },
        { id: 'rowan', label: 'Rowan Financial Holdings XYZ' },
      ]
    : [
        { id: 'acorn', label: 'Acorn' },
        { id: 'rowan', label: 'Rowan' },
      ];
  const exposure = {
    id: 'demand',
    label: options.maxLabels ? 'Demand Financial Driver ABCD' : 'Demand',
  };
  const phases: string[][] = [[], [], [], [], []];
  const spans: { phase: number; span: BusinessWordSpan }[] = [];
  function say(phase: number, text: string): BusinessWordSpan {
    const tokens = text.split(/\s+/u);
    const span = {
      fromWord: phases[phase].length,
      toWord: phases[phase].length + tokens.length - 1,
    };
    phases[phase].push(...tokens);
    spans.push({ phase, span });
    return span;
  }
  say(0, 'Shared driver records concern Fund portfolios.');
  for (const fund of funds) say(0, `${fund.label} is a fund.`);
  say(0, `${exposure.label} is a common driver.`);
  const identities = firms.map((firm) => ({
    ...firm,
    source: say(0, `${firm.label} is a company.`),
  }));
  const holdingSources = firms.map((firm, slot) =>
    say(1, options.holdingClauses?.[slot] ?? `${funds[slot].label} holds ${firm.label}.`),
  );
  // Explicit legacy fund→driver clauses remain supported when dependencyLens is absent.
  for (const fund of funds) say(1, `${fund.label} is exposed to ${exposure.label}.`);
  const modelSource = say(
    1,
    options.modelClause ??
      `${funds[0].label} and ${funds[1].label} maintain asset ownership and economic claim records.`,
  );
  const driverSources = firms.map((firm, slot) =>
    say(2, options.driverClauses?.[slot] ?? `${firm.label} depends on ${exposure.label}.`),
  );
  say(2, options.sharedClause ?? `Both funds share ${exposure.label} exposure.`);
  say(3, 'Payout, liquidity and correlation are not stated.');
  say(3, 'Inspection of records is not payment or transfer.');
  say(4, 'Shared exposure.');
  say(4, 'The records remain separate.');
  let offset = 0;
  const offsets = phases.map((tokens) => {
    const start = offset;
    offset += tokens.length;
    return start;
  });
  for (const { phase, span } of spans) {
    span.fromWord += offsets[phase];
    span.toWord += offsets[phase];
  }
  const intervals = [
    [0.3, 1.05],
    [1.3, 2.4],
    [2.7, 5.95],
    [6.5, 9],
    [10, 11.65],
  ];
  const words = phases.flatMap((tokens, phase) =>
    tokens.map((text, slot) => {
      const [start, end] = intervals[phase],
        step = (end - start) / tokens.length;
      return { text, start: start + slot * step, end: start + (slot + 1) * step };
    }),
  );
  const raw: Rec = {
    kind: 'portfolio-exposure',
    preset: 'shared-driver',
    visualMode: 'diagram',
    evidence: 'source-stated',
    label: 'Shared driver',
    subject: 'Fund portfolios',
    outcome: 'Shared exposure',
    funds,
    exposure,
    holdings: [],
    setupWord: offsets[0],
    actionWord: offsets[1],
    responseWord: offsets[2],
    checkWord: offsets[3],
    resolveWord: offsets[4],
    startWord: 0,
    endWord: words.length - 1,
    layout: 'stack',
    ...(options.includeLens === false
      ? {}
      : {
          dependencyLens: {
            version: options.version ?? 1,
            firms: identities.map((identity, slot) => ({
              fundId: funds[slot].id,
              identity,
              holdingSource: holdingSources[slot],
              driverSource: driverSources[slot],
            })),
            modelSource,
          },
        }),
  };
  // Transport-real JSON, with independently owned spans rather than aliased graph nodes.
  const tree: unknown = JSON.parse(JSON.stringify(raw));
  if (!isRec(tree)) throw new Error('Invalid authored dependency fixture');
  return { id: 'OP-58', raw: tree, words };
}

export const SHARED_DEPENDENCY_SOURCE_FIXTURES: readonly SharedDependencySourceFixture[] = [
  sharedDependencyFixture(),
  sharedDependencyFixture({ maxLabels: true }),
];

export function sharedDependencyFixtureContext(
  fixture: SharedDependencySourceFixture,
): ParseContext {
  return makeParseContext(fixture.words, {
    startWord: 0,
    endWord: fixture.words.length - 1,
    startTime: fixture.words[0].start - 0.3,
    endTime: fixture.words[fixture.words.length - 1].end + 0.35,
  });
}
