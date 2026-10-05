import {
  makeParseContext,
  type PlannerWord,
  type Rec,
} from '../../../../../ai/explainer/kind-spec';
import type { BusinessWordSpan } from '../types';
export interface DecisionsSourceFixture {
  readonly id: 'OP-73' | 'OP-76' | 'OP-77' | 'OP-78' | 'OP-79';
  readonly fixtureId: string;
  readonly words: readonly PlannerWord[];
  readonly raw: Rec;
}
interface Builder {
  span(text: string): BusinessWordSpan;
  identity(id: string, label: string, text: string): Rec;
  version(id: string, label: string, version: string, text: string): Rec;
  fact(state: string, text: string): Rec;
  quantity(
    state: string,
    value: number | null,
    operation: string,
    text: string,
    unit?: string,
    population?: string,
    denominator?: number | null,
  ): Rec;
  native(asset: string, identityId: string, text: string): Rec;
}
export function makeDecisionsFixture(
  id: DecisionsSourceFixture['id'],
  kind: string,
  preset: string,
  paragraphs: readonly [string, string, string, string, string],
  fields: (builder: Builder) => Rec,
  options: { condition?: string; fixtureId?: string } = {},
): DecisionsSourceFixture {
  const starts = [0.35, 1.5, 3, 7, 10.2],
    ends = [1.45, 2.95, 6.95, 10.15, 11.4];
  const words: PlannerWord[] = [],
    indices: number[] = [];
  paragraphs.forEach((paragraph, p) => {
    indices.push(words.length);
    const tokens = paragraph.split(/\s+/u),
      stride = (ends[p] - starts[p]) / tokens.length;
    tokens.forEach((text, i) => {
      words.push({ text, start: starts[p] + i * stride, end: starts[p] + (i + 0.95) * stride });
    });
  });
  const span = (text: string): BusinessWordSpan => {
    const tokens = text.split(/\s+/u),
      fromWord = words.findIndex((_, i) =>
        tokens.every((token, j) => token === words[i + j]?.text),
      );
    if (fromWord < 0) throw new Error(`Missing ${id} source: ${text}`);
    return { fromWord, toWord: fromWord + tokens.length - 1 };
  };
  const identity = (identityId: string, label: string, text: string): Rec => ({
    id: identityId,
    label,
    source: span(text),
  });
  const builder: Builder = {
    span,
    identity,
    version: (identityId, label, version, text) => ({
      identity: identity(identityId, label, text),
      version,
      source: span(text),
    }),
    fact: (state, text) => ({ state, source: span(text) }),
    quantity: (
      state,
      value,
      operation,
      text,
      unit = 'tasks',
      population = 'cases',
      denominator = 10,
    ) => ({
      state,
      value,
      source: span(text),
      basis: {
        subjectId: 'owner',
        unit,
        population,
        period: 'June',
        denominator,
        source: span(
          `Owner names ${operation} basis in ${unit} during June ${denominator === null ? `unknown ${population} denominator` : `per ${denominator} ${population}`}.`,
        ),
      },
    }),
    native: (asset, identityId, text) => ({ asset, identityId, source: span(text) }),
  };
  const outcome = paragraphs[4].replace(/\.$/u, '');
  return {
    id,
    fixtureId: options.fixtureId ?? `${id}:primary`,
    words,
    raw: {
      kind,
      preset,
      visualMode: 'diagram',
      evidence: 'source-stated',
      label: 'Owner',
      subject: 'Owner',
      owner: identity('owner', 'Owner', paragraphs[0].split(/(?<=\.)\s/u)[0]),
      period: 'June',
      outcome,
      startWord: 0,
      endWord: words.length - 1,
      layout: 'stack',
      setupWord: indices[0],
      actionWord: indices[1],
      responseWord: indices[2],
      checkWord: indices[3],
      resolveWord: indices[4],
      factEvidence: {
        state: /unresolved|unknown/u.test(outcome) ? 'unknown' : 'source-stated',
        label: outcome,
        source: span(paragraphs[4]),
      },
      modelSource: null,
      ...(options.condition ? { condition: options.condition } : {}),
      ...fields(builder),
    },
  };
}
export function decisionsSourceWindow(fixture: DecisionsSourceFixture) {
  const first = fixture.words[0],
    last = fixture.words.at(-1);
  if (!first || !last) throw new Error('Real source words required');
  return {
    startWord: 0,
    endWord: fixture.words.length - 1,
    startTime: first.start - 0.25,
    endTime: last.end + 0.35,
  };
}
export function decisionsSourceContext(fixture: DecisionsSourceFixture) {
  return makeParseContext(fixture.words, decisionsSourceWindow(fixture));
}
const folio =
  'Owner illustrates a commitment folio for Note version v1 concerning Launch during June.';
const rail = 'Review illustrates an approval rail for Launch reviewed by Chair during June.';
const commitment = 'Owner records Note version v1 as a commitment for Launch during June.';
const gate = 'Review reviewed by Chair for Launch is pending during June.';
const action = 'Owner approval of Launch remains pending during June.';
export function stagedDecisionFixture(
  state: 'source-stated' | 'pending' | 'negative' | 'conditional' | 'unknown' = 'source-stated',
): DecisionsSourceFixture {
  const text = {
    'source-stated': commitment,
    pending: 'Owner commitment Note version v1 for Launch is pending during June.',
    negative: 'Owner does not record Note version v1 as a commitment for Launch during June.',
    conditional:
      'If Review passes, Owner may record Note version v1 as a commitment for Launch during June.',
    unknown: 'Owner commitment Note version v1 for Launch is unknown during June.',
  }[state];
  return makeDecisionsFixture(
    'OP-73',
    'staged-decision',
    'contingent-commitment',
    [
      'Owner introduces Note version v1 for Launch with Review and Chair during June.',
      `${folio} ${rail}`,
      text,
      `${gate} ${action}`,
      'Commitment stays separate from action.',
    ],
    (s) => ({
      commitment: s.version('note', 'Note', 'v1', text),
      action: s.identity('launch', 'Launch', text),
      gate: s.identity('review', 'Review', gate),
      approver: s.identity('chair', 'Chair', gate),
      commitmentFact: s.fact(state, text),
      gateFact: s.fact('pending', gate),
      actionFact: s.fact('pending', action),
      modelSource: [s.native('A-09', 'note', folio), s.native('A-06', 'review', rail)],
    }),
    {
      fixtureId: `OP-73:${state}`,
      ...(state === 'conditional' ? { condition: 'If Review passes' } : {}),
    },
  );
}
const staged = stagedDecisionFixture();
export function planFixture(
  state: 'planned' | 'configured' = 'planned',
  observedState: 'observed' | 'unknown' | 'pending' | 'negative' | 'conditional' = 'observed',
) {
  const native =
      'Owner illustrates an operating desk for inspecting Intake planned and observed throughput during June.',
    basis = 'Owner names Intake throughput basis in tasks during June per 10 cases.',
    planned = `Owner ${state} Intake throughput of 8 tasks during June per 10 cases.`,
    observed =
      observedState === 'observed'
        ? 'Owner observed Intake throughput of 6 tasks during June per 10 cases.'
        : observedState === 'conditional'
          ? 'If Review passes, Owner may report Intake throughput of 6 tasks during June per 10 cases.'
          : `Owner Intake throughput in tasks is ${observedState === 'negative' ? 'not supplied' : observedState} during June per 10 cases.`;
  return makeDecisionsFixture(
    'OP-76',
    'measurement-frame',
    'planned-observed',
    [
      'Owner introduces Intake during June.',
      native,
      `${basis} ${planned}`,
      observed,
      'Observation stays separate from plan.',
    ],
    (s) => ({
      task: s.identity('intake', 'Intake', basis),
      planned: s.quantity(state, 8, 'Intake throughput', planned),
      observed: s.quantity(
        observedState,
        observedState === 'observed' || observedState === 'conditional' ? 6 : null,
        'Intake throughput',
        observed,
      ),
      modelSource: [s.native('A-04', 'owner', native)],
    }),
    {
      fixtureId: `OP-76:${state}:${observedState}`,
      ...(observedState === 'conditional' ? { condition: 'If Review passes' } : {}),
    },
  );
}
const frames = ['firms', 'functions', 'workers'] as const;
const frameLabels = ['Firm panel', 'Function panel', 'Worker panel'] as const;
const frameBasis = frames.map(
  (frame, i) =>
    `Owner names adopter count for ${frameLabels[i]} frame basis in ${frame} during June per ${[10, 20, 40][i]} ${frame}.`,
);
const frameFacts = frames.map(
  (frame, i) =>
    `Owner observed adopter count for ${frameLabels[i]} frame of ${[2, 3, 4][i]} ${frame} during June per ${[10, 20, 40][i]} ${frame}.`,
);
const adoptionNative =
  'Owner illustrates a branch pod for inspecting Firm panel population in firms per 10 firms and Function panel population in functions per 20 functions and Worker panel population in workers per 40 workers during June.';
function adoptionFixture(hybrid = false): DecisionsSourceFixture {
  return makeDecisionsFixture(
    'OP-77',
    'measurement-frame',
    'firms-functions-workers',
    [
      'Owner introduces Firm panel and Function panel and Worker panel during June.',
      `${hybrid ? `${adoptionNative} ` : ''}${frameBasis.join(' ')}`,
      frameFacts.slice(0, 2).join(' '),
      frameFacts[2],
      'Source frames remain distinct.',
    ],
    (s) => ({
      ...(hybrid
        ? { visualMode: 'hybrid', modelSource: [s.native('A-03', 'owner', adoptionNative)] }
        : {}),
      frames: frames.map((frame, i) => ({
        frame,
        identity: s.identity(`frame-${frame}`, frameLabels[i], frameFacts[i]),
        quantity: s.quantity(
          'observed',
          [2, 3, 4][i],
          `adopter count for ${frameLabels[i]} frame`,
          frameFacts[i],
          frame,
          frame,
          [10, 20, 40][i],
        ),
      })),
    }),
    { fixtureId: `OP-77:${hybrid ? 'hybrid' : 'primary'}` },
  );
}
const adoption = adoptionFixture();
const roles = ['original', 'surviving', 'attrition'] as const,
  cohortLabels = ['Original group', 'Survivor group', 'Exit group'] as const;
const cohortBasis = roles.map(
  (role, i) =>
    `Owner names ${role} count for ${cohortLabels[i]} basis in firms during June per 10 firms.`,
);
const cohortFacts = roles.map(
  (role, i) =>
    `Owner observed ${role} count for ${cohortLabels[i]} of ${[10, 6, 4][i]} firms during June per 10 firms.`,
);
const account =
  'Owner accounting of Original group as Survivor group plus Exit group has no entrants during June.';
const desk =
  'Owner illustrates an operating desk for inspecting Original group and Survivor group cohorts with Exit group attrition during June.';
const cohorts = makeDecisionsFixture(
  'OP-78',
  'measurement-frame',
  'original-and-surviving-cohorts',
  [
    'Owner introduces Original group and Survivor group and Exit group during June.',
    desk,
    `${cohortBasis.join(' ')} ${cohortFacts.join(' ')}`,
    account,
    'Original cohort accounting is retained.',
  ],
  (s) => ({
    original: {
      identity: s.identity('original', cohortLabels[0], cohortFacts[0]),
      quantity: s.quantity(
        'observed',
        10,
        `original count for ${cohortLabels[0]}`,
        cohortFacts[0],
        'firms',
        'firms',
      ),
    },
    surviving: {
      identity: s.identity('surviving', cohortLabels[1], cohortFacts[1]),
      quantity: s.quantity(
        'observed',
        6,
        `surviving count for ${cohortLabels[1]}`,
        cohortFacts[1],
        'firms',
        'firms',
      ),
    },
    attrition: {
      identity: s.identity('attrition', cohortLabels[2], cohortFacts[2]),
      quantity: s.quantity(
        'observed',
        4,
        `attrition count for ${cohortLabels[2]}`,
        cohortFacts[2],
        'firms',
        'firms',
      ),
    },
    accounting: s.fact('source-stated', account),
    modelSource: [s.native('A-04', 'owner', desk)],
  }),
);
function albumFixture(distribution = false) {
  const native =
      'Owner illustrates a branch pod for inspecting alternatives East version v1 and West version v2 during June.',
    east = 'Owner keeps East version v1 unresolved during June.',
    west = 'Owner keeps West version v2 unresolved during June.',
    pe = 'Owner assigns East version v1 probability 1 of 4 during June.',
    pw = 'Owner assigns West version v2 probability 3 of 4 during June.',
    declare =
      'Owner supplies exhaustive mutually exclusive alternatives East version v1 and West version v2 during June.';
  return makeDecisionsFixture(
    'OP-79',
    'uncertainty-album',
    'alternatives-or-source-distribution',
    [
      'Owner introduces East version v1 and West version v2 during June.',
      native,
      `${east} ${west}`,
      distribution ? `${pe} ${pw} ${declare}` : 'Owner records supplied alternatives during June.',
      'Alternatives remain unresolved.',
    ],
    (s) => ({
      setMode: distribution ? 'distribution' : 'qualitative',
      alternatives: [
        {
          entry: s.version('east', 'East', 'v1', east),
          fact: s.fact('source-stated', east),
          probability: distribution ? { numerator: 1, denominator: 4, source: s.span(pe) } : null,
        },
        {
          entry: s.version('west', 'West', 'v2', west),
          fact: s.fact('source-stated', west),
          probability: distribution ? { numerator: 3, denominator: 4, source: s.span(pw) } : null,
        },
      ],
      distribution: distribution ? s.fact('source-stated', declare) : null,
      modelSource: [s.native('A-03', 'owner', native)],
    }),
    { fixtureId: `OP-79:${distribution ? 'distribution' : 'qualitative'}` },
  );
}
export const DECISIONS_SOURCE_FIXTURES: readonly DecisionsSourceFixture[] = [
  staged,
  planFixture(),
  adoption,
  cohorts,
  albumFixture(),
];
export const DECISIONS_ACCEPTED_VARIANTS: readonly DecisionsSourceFixture[] = [
  adoptionFixture(true),
  planFixture('configured'),
  planFixture('planned', 'unknown'),
  albumFixture(true),
  ...(['pending', 'negative', 'conditional', 'unknown'] as const).map((state) =>
    stagedDecisionFixture(state),
  ),
  ...(['pending', 'negative', 'conditional'] as const).map((state) =>
    planFixture('planned', state),
  ),
];
