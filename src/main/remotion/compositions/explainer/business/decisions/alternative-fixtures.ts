import {
  isRec,
  makeParseContext,
  type ParseContext,
  type PlannerWord,
  type Rec,
} from '../../../../../ai/explainer/kind-spec';
import type { BusinessWordSpan } from '../types';

export interface BusinessAlternativeSourceFixture {
  id: 'OP-75';
  raw: Rec;
  words: PlannerWord[];
}
export interface BusinessAlternativeFixtureOptions {
  mode?: 'diagram' | 'hybrid';
  count?: 2 | 3;
  native?: boolean;
  condition?: boolean;
  maxLabels?: boolean;
  baselinePhase?: 0 | 1 | 2 | 3 | 4;
  nativePhase?: 0 | 1 | 2 | 3 | 4;
  baselineClause?: string;
  evidenceClause?: string;
  nativeClause?: string;
  recordClause?: (slot: number, positive: string) => string;
  alternativeClause?: (slot: number, positive: string) => string;
}

/** Complete legacy modal capacity statements plus separately authored illustrative record evidence. */
export function businessAlternativeFixture(
  options: BusinessAlternativeFixtureOptions = {},
): BusinessAlternativeSourceFixture {
  function labels(text: string): string {
    if (!options.maxLabels) return text;
    return text
      .replaceAll('Press line', 'Precision Plant Line')
      .replaceAll('Current design', 'Current Operating Design ABC')
      .replaceAll('autumn', 'Autumn Reporting Period ABCD')
      .replaceAll('alpha', 'Revision Alpha ABCDE')
      .replaceAll('Lower record', 'Lower Operating Record ABCDE')
      .replaceAll('Steady record', 'Steady Operating Record ABCD')
      .replaceAll('Higher record', 'Higher Operating Record ABCD');
  }
  const phases: string[][] = [[], [], [], [], []];
  const spans: { phase: number; span: BusinessWordSpan }[] = [];
  function say(phase: number, sentence: string): BusinessWordSpan {
    const tokens = labels(sentence).split(/\s+/u);
    const span = {
      fromWord: phases[phase].length,
      toWord: phases[phase].length + tokens.length - 1,
    };
    phases[phase].push(...tokens);
    spans.push({ phase, span });
    return span;
  }
  say(0, 'Press line considers Operating alternatives.');
  if (options.condition) say(0, 'If supplies arrive, Press line considers alternatives.');
  say(4, 'Press line remains unresolved.');
  const baselineSource = say(
    options.baselinePhase ?? 0,
    options.baselineClause ??
      'Press line has actual baseline Current design during autumn at revision alpha.',
  );
  const specifications = [
    {
      label: 'lower capacity',
      change: 'reduced',
      qualifier: 'could have lower capacity',
      record: 'Lower record',
    },
    {
      label: 'steady capacity',
      change: 'steady',
      qualifier: 'may have steady capacity',
      record: 'Steady record',
    },
    {
      label: 'higher capacity',
      change: 'expanded',
      qualifier: 'might have higher capacity',
      record: 'Higher record',
    },
  ].slice(0, options.count ?? 3);
  const alternatives = specifications.map((spec, slot) => {
    const source = say(
      1,
      options.alternativeClause?.(slot, `Press line ${spec.qualifier}.`) ??
        `Press line ${spec.qualifier}.`,
    );
    return { label: spec.label, change: spec.change, qualifier: spec.qualifier, source };
  });
  const records = specifications.map((spec, slot) => {
    const positive = `${spec.record} is an illustrative operating-unit record for Press line from actual baseline Current design during autumn at revision alpha representing ${spec.qualifier}.`;
    const source = say(1, options.recordClause?.(slot, positive) ?? positive);
    return {
      alternativeId: `alternative-${slot}`,
      baselineId: 'baseline',
      subjectId: 'press',
      period: 'autumn',
      revision: 'alpha',
      identity: { id: `record-${slot}`, label: spec.record, source },
      source,
    };
  });
  const modelSource = say(
    options.nativePhase ?? 1,
    options.nativeClause ??
      'Press line maintains illustrative operating-unit records of actual baseline Current design during autumn at revision alpha.',
  );
  const evidenceSource = say(
    2,
    options.evidenceClause ??
      'Press line compares illustrative operating-unit records from actual baseline Current design during autumn at revision alpha.',
  );
  say(3, 'These records are illustrations, not achieved production or actual branches.');
  say(3, 'Capacity remains qualitative and the alternatives have no stated probability or winner.');
  let offset = 0;
  const offsets = phases.map((tokens) => {
    const start = offset;
    offset += tokens.length;
    return start;
  });
  for (const entry of spans) {
    entry.span.fromWord += offsets[entry.phase];
    entry.span.toWord += offsets[entry.phase];
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
      const [start, end] = intervals[phase];
      const step = (end - start) / tokens.length;
      return { text, start: start + slot * step, end: start + (slot + 1) * step };
    }),
  );
  const raw: Rec = {
    kind: 'possible-futures',
    preset: 'branching-scenarios',
    visualMode: options.mode ?? 'diagram',
    label: 'Operating alternatives',
    subject: 'Press line',
    outcome: 'Press line remains unresolved',
    uncertainty: 'unresolved',
    ...(options.condition ? { condition: 'If supplies arrive' } : {}),
    alternatives: alternatives.map(({ source, ...alternative }) => ({
      ...alternative,
      evidenceStartWord: source.fromWord,
      evidenceEndWord: source.toWord,
    })),
    setupWord: offsets[0],
    actionWord: offsets[1],
    responseWord: offsets[2],
    checkWord: offsets[3],
    resolveWord: offsets[4],
    startWord: 0,
    endWord: words.length - 1,
    layout: 'stack',
    businessAlternatives: {
      version: 1,
      evidence: {
        state: 'illustrative',
        label: 'illustrative operating-unit records',
        source: evidenceSource,
      },
      baseline: {
        identity: { id: 'baseline', label: 'Current design', source: baselineSource },
        subject: { id: 'press', label: 'Press line', source: baselineSource },
        period: 'autumn',
        revision: 'alpha',
        source: baselineSource,
      },
      records,
      native:
        options.native === false
          ? null
          : {
              assembly: 'A-03',
              baselineId: 'baseline',
              subjectId: 'press',
              period: 'autumn',
              revision: 'alpha',
              source: modelSource,
            },
    },
  };
  const tree: unknown = JSON.parse(labels(JSON.stringify(raw)));
  if (!isRec(tree)) throw new Error('Invalid authored alternative fixture');
  return { id: 'OP-75', raw: tree, words };
}

export function businessAlternativeFixtureContext(
  fixture: BusinessAlternativeSourceFixture,
): ParseContext {
  return makeParseContext(fixture.words, {
    startWord: 0,
    endWord: fixture.words.length - 1,
    startTime: fixture.words[0].start - 0.3,
    endTime: fixture.words[fixture.words.length - 1].end + 0.35,
  });
}
export const BUSINESS_ALTERNATIVE_SOURCE_FIXTURES: readonly BusinessAlternativeSourceFixture[] = [
  businessAlternativeFixture(),
  businessAlternativeFixture({ mode: 'hybrid', condition: true }),
  businessAlternativeFixture({ count: 2, native: false }),
];
