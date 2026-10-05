import {
  parseCoordinationMap,
  parseTaskMap,
  parseWorkRedesign,
} from '../../../../../ai/explainer/business-work-contract';
import {
  makeParseContext,
  type PlannerWord,
  type Rec,
  type SceneWindow,
} from '../../../../../ai/explainer/kind-spec';
import type { BusinessIdentity, BusinessWordSpan } from '../types';
import type { BusinessWorkScene, WORK_RECIPE_IDS } from './types';

export interface WorkSourceFixture {
  id: (typeof WORK_RECIPE_IDS)[number];
  raw: Rec;
  words: PlannerWord[];
  window: SceneWindow;
}
interface SourceBuilder {
  span: (text: string) => BusinessWordSpan;
  identity: (id: string, label: string, text: string) => BusinessIdentity;
}

/** Five independently timed speech blocks: source indices are never seconds or rebased beats. */
function fixture(
  id: WorkSourceFixture['id'],
  kind: BusinessWorkScene['kind'],
  preset: string,
  subject: string,
  paragraphs: readonly [string, string, string, string, string],
  build: (source: SourceBuilder) => Rec,
  condition?: string,
): WorkSourceFixture {
  const starts = [0.5, 2.3, 4.5, 6.7, 8.9];
  const words: PlannerWord[] = [];
  const indices: number[] = [];
  paragraphs.forEach((paragraph, phase) => {
    indices.push(words.length);
    const tokens = paragraph.split(/\s+/u);
    const step = 1.2 / tokens.length;
    tokens.forEach((text, index) => {
      const start = starts[phase] + index * step;
      words.push({ text, start, end: start + step * 0.8 });
    });
  });
  function span(text: string): BusinessWordSpan {
    const tokens = text.split(/\s+/u);
    const fromWord = words.findIndex((_, from) =>
      tokens.every((token, offset) => words[from + offset]?.text === token),
    );
    if (fromWord < 0) throw new Error(`${id}: missing authored source clause: ${text}`);
    return { fromWord, toWord: fromWord + tokens.length - 1 };
  }
  const source: SourceBuilder = {
    span,
    identity: (identityId, label, text) => ({ id: identityId, label, source: span(text) }),
  };
  const outcome = paragraphs[4].replace(/\.$/u, '');
  const window = { startWord: 0, endWord: words.length - 1, startTime: 0.25, endTime: 10.5 };
  return {
    id,
    words,
    window,
    raw: {
      kind,
      preset,
      visualMode: 'diagram',
      label: subject,
      subject,
      outcome,
      evidence: 'source-stated',
      ...(condition ? { condition } : {}),
      startWord: window.startWord,
      endWord: window.endWord,
      layout: 'stack',
      setupWord: indices[0],
      actionWord: indices[1],
      responseWord: indices[2],
      checkWord: indices[3],
      resolveWord: indices[4],
      factEvidence: { state: 'source-stated', label: outcome, source: span(paragraphs[4]) },
      ...build(source),
    },
  };
}

const people = 'Ada works. Bo works. Cy works.';
const review = 'Review is a task.';
const send = 'Send is a task.';
const reviewRoles = 'Ada performs Review. Bo approves Review. Cy remains accountable for Review.';
const sendRoles = 'Ada performs Send. Bo approves Send. Cy remains accountable for Send.';
const reviewPaperwork = 'Review is pending for Ada. Review paperwork is pending for Ada.';
function actors(s: SourceBuilder): BusinessIdentity[] {
  return [
    s.identity('ada', 'Ada', 'Ada works.'),
    s.identity('bo', 'Bo', 'Bo works.'),
    s.identity('cy', 'Cy', 'Cy works.'),
  ];
}
function ownership(s: SourceBuilder, taskId: string, claim: string): Rec {
  return {
    taskId,
    performerId: 'ada',
    approverId: 'bo',
    accountableOwnerId: 'cy',
    source: s.span(claim),
  };
}
const split = fixture(
  'OP-01',
  'task-map',
  'task-split',
  'Clerk',
  [
    `Clerk is a job. ${review} ${send} ${people}`,
    'Clerk includes Review. Clerk includes Send.',
    reviewRoles,
    `${sendRoles} ${reviewPaperwork}`,
    'Roles remain explicit.',
  ],
  (s) => ({
    job: s.identity('clerk', 'Clerk', 'Clerk is a job.'),
    actors: actors(s),
    tasks: [s.identity('review', 'Review', review), s.identity('send', 'Send', send)],
    splits: [
      { jobId: 'clerk', taskId: 'review', source: s.span('Clerk includes Review.') },
      { jobId: 'clerk', taskId: 'send', source: s.span('Clerk includes Send.') },
    ],
    ownership: [ownership(s, 'review', reviewRoles), ownership(s, 'send', sendRoles)],
    holds: [
      { actorId: 'ada', taskId: 'review', state: 'pending', source: s.span(reviewPaperwork) },
    ],
  }),
);
const capability = fixture(
  'OP-02',
  'task-map',
  'capability-boundary',
  'Ada',
  [
    `Ada works. ${review} ${send} Check is a task.`,
    'Ada has tested capability for Review.',
    "Ada's capability for Send is unavailable.",
    "Ada's capability for Check is unknown.",
    'Boundaries remain explicit.',
  ],
  (s) => ({
    actors: [s.identity('ada', 'Ada', 'Ada works.')],
    tasks: [
      s.identity('review', 'Review', review),
      s.identity('send', 'Send', send),
      s.identity('check', 'Check', 'Check is a task.'),
    ],
    capabilities: [
      {
        actorId: 'ada',
        taskId: 'review',
        state: 'tested',
        source: s.span('Ada has tested capability for Review.'),
      },
      {
        actorId: 'ada',
        taskId: 'send',
        state: 'unavailable',
        source: s.span("Ada's capability for Send is unavailable."),
      },
      {
        actorId: 'ada',
        taskId: 'check',
        state: 'unknown',
        source: s.span("Ada's capability for Check is unknown."),
      },
    ],
  }),
);
const cross = fixture(
  'OP-03',
  'coordination-map',
  'cross-function',
  'Ada',
  [
    `Ada works. Bo works. ${review}`,
    'If review clears, Ada hands Review to Bo.',
    'Bo retains the review role.',
    'The condition stays explicit.',
    'Team roles remain distinct.',
  ],
  (s) => ({
    actors: [s.identity('ada', 'Ada', 'Ada works.'), s.identity('bo', 'Bo', 'Bo works.')],
    tasks: [s.identity('review', 'Review', review)],
    handoffs: [
      {
        fromActorId: 'ada',
        toActorId: 'bo',
        taskId: 'review',
        state: 'conditional',
        source: s.span('If review clears, Ada hands Review to Bo.'),
        condition: { label: 'If review clears', source: s.span('If review clears,') },
      },
    ],
  }),
  'If review clears',
);
const responsibility = fixture(
  'OP-04',
  'task-map',
  'responsibility',
  'Ada',
  [
    `${people} ${review}`,
    reviewRoles,
    'Each role stays distinct.',
    'Review remains the same task.',
    'Roles remain explicit.',
  ],
  (s) => ({
    actors: actors(s),
    tasks: [s.identity('review', 'Review', review)],
    ownership: [ownership(s, 'review', reviewRoles)],
  }),
);

function playbook(
  id: 'OP-05' | 'OP-18',
  preset: 'expertise-transfer' | 'owner-playbook',
): WorkSourceFixture {
  const origin =
    preset === 'expertise-transfer' ? 'Ada has expertise for Review.' : 'Ada owns Review.';
  const capture = 'Bo records expertise from Ada for Review in Notes.';
  const approval = 'Cy approves Guide v1 for Review.';
  const use = 'Dee uses Guide v1 for Review.';
  return fixture(
    id,
    'work-redesign',
    preset,
    'Ada',
    [
      `${origin} ${review} Bo works. Cy works. Dee works. Notes is a record. Guide v1 is a playbook.`,
      capture,
      approval,
      use,
      'Revision use stays explicit.',
    ],
    (s) => ({
      ...(preset === 'expertise-transfer'
        ? { expert: s.identity('ada', 'Ada', origin), expertiseSource: s.span(origin) }
        : { owner: s.identity('ada', 'Ada', origin), ownerSource: s.span(origin) }),
      recorder: s.identity('bo', 'Bo', 'Bo works.'),
      approver: s.identity('cy', 'Cy', 'Cy works.'),
      receiver: s.identity('dee', 'Dee', 'Dee works.'),
      task: s.identity('review', 'Review', review),
      record: s.identity('notes', 'Notes', 'Notes is a record.'),
      playbook: {
        identity: s.identity('guide', 'Guide', 'Guide v1 is a playbook.'),
        version: 'v1',
        source: s.span('Guide v1 is a playbook.'),
      },
      capture: {
        recorderId: 'bo',
        expertId: 'ada',
        taskId: 'review',
        recordId: 'notes',
        state: 'observed',
        source: s.span(capture),
      },
      approval: {
        approverId: 'cy',
        taskId: 'review',
        playbookId: 'guide',
        version: 'v1',
        state: 'approved',
        source: s.span(approval),
      },
      use: {
        actorId: 'dee',
        taskId: 'review',
        playbookId: 'guide',
        version: 'v1',
        state: 'observed',
        source: s.span(use),
      },
    }),
  );
}
const redeployment = fixture(
  'OP-06',
  'work-redesign',
  'redeployment',
  'Ada',
  [
    `Ada works. ${review} ${send}`,
    'Ada performs Review during October 2026.',
    'Ada performs Send during November 2026.',
    'Ada retains the same identity.',
    'Task allocation stays explicit.',
  ],
  (s) => ({
    worker: s.identity('ada', 'Ada', 'Ada works.'),
    beforeTasks: [s.identity('review', 'Review', review)],
    afterTasks: [s.identity('send', 'Send', send)],
    before: { label: 'October 2026', source: s.span('Ada performs Review during October 2026.') },
    after: { label: 'November 2026', source: s.span('Ada performs Send during November 2026.') },
    allocations: [
      {
        actorId: 'ada',
        taskId: 'review',
        phase: 'before',
        state: 'observed',
        source: s.span('Ada performs Review during October 2026.'),
      },
      {
        actorId: 'ada',
        taskId: 'send',
        phase: 'after',
        state: 'observed',
        source: s.span('Ada performs Send during November 2026.'),
      },
    ],
  }),
);
const fanout = fixture(
  'OP-07',
  'coordination-map',
  'supervised-fanout',
  'Bo',
  [
    `Bo works. Ada works. Dee works. ${review} ${send}`,
    'Bo reviews Review from Ada. Bo reviews Send from Dee.',
    "Bo's review capacity is unknown.",
    'Review does not imply approval.',
    'Review limits stay explicit.',
  ],
  (s) => ({
    supervisor: s.identity('bo', 'Bo', 'Bo works.'),
    delegates: [s.identity('ada', 'Ada', 'Ada works.'), s.identity('dee', 'Dee', 'Dee works.')],
    tasks: [s.identity('review', 'Review', review), s.identity('send', 'Send', send)],
    reviews: [
      {
        reviewerId: 'bo',
        performerId: 'ada',
        taskId: 'review',
        state: 'observed',
        source: s.span('Bo reviews Review from Ada.'),
      },
      {
        reviewerId: 'bo',
        performerId: 'dee',
        taskId: 'send',
        state: 'observed',
        source: s.span('Bo reviews Send from Dee.'),
      },
    ],
    reviewCapacity: {
      state: 'unknown',
      value: null,
      basis: null,
      source: s.span("Bo's review capacity is unknown."),
    },
  }),
);
const loadText = 'Ada reports 2 handoffs per 10 requests in October 2026.';
const load = fixture(
  'OP-08',
  'coordination-map',
  'handoff-load',
  'Ada',
  [
    `Ada works. Bo works. ${review}`,
    'Ada hands Review to Bo.',
    loadText,
    'A handoff is not task completion.',
    'The stated load stays bounded.',
  ],
  (s) => ({
    actors: [s.identity('ada', 'Ada', 'Ada works.'), s.identity('bo', 'Bo', 'Bo works.')],
    tasks: [s.identity('review', 'Review', review)],
    handoffs: [
      {
        fromActorId: 'ada',
        toActorId: 'bo',
        taskId: 'review',
        state: 'observed',
        source: s.span('Ada hands Review to Bo.'),
      },
    ],
    load: {
      state: 'observed',
      value: 2,
      source: s.span(loadText),
      basis: {
        subjectId: 'ada',
        population: 'requests',
        unit: 'handoffs',
        period: 'October 2026',
        denominator: 10,
        source: s.span(loadText),
      },
    },
  }),
);
const approvalLoad = fixture(
  'OP-32',
  'coordination-map',
  'approval-load',
  'Bo',
  [
    `Bo is approver for Review. Ada works. ${review} Inbox is an approval queue.`,
    'Bo has review of Review from Ada pending.',
    'Inbox remains pending with Bo.',
    "Inbox's approval load is unknown. Bo's review capacity is unknown. Review is pending for Ada.",
    'Pending review stays pending.',
  ],
  (s) => ({
    actors: [
      s.identity('bo', 'Bo', 'Bo is approver for Review.'),
      s.identity('ada', 'Ada', 'Ada works.'),
    ],
    tasks: [s.identity('review', 'Review', review)],
    queue: {
      identity: s.identity('inbox', 'Inbox', 'Inbox is an approval queue.'),
      reviewerId: 'bo',
      state: 'pending',
      source: s.span('Inbox remains pending with Bo.'),
    },
    reviews: [
      {
        reviewerId: 'bo',
        performerId: 'ada',
        taskId: 'review',
        state: 'pending',
        source: s.span('Bo has review of Review from Ada pending.'),
      },
    ],
    load: {
      state: 'unknown',
      value: null,
      basis: null,
      source: s.span("Inbox's approval load is unknown."),
    },
    reviewCapacity: {
      state: 'unknown',
      value: null,
      basis: null,
      source: s.span("Bo's review capacity is unknown."),
    },
    holds: [
      {
        actorId: 'ada',
        taskId: 'review',
        state: 'pending',
        source: s.span('Review is pending for Ada.'),
      },
    ],
  }),
);
const bottleneck = fixture(
  'OP-80',
  'coordination-map',
  'bottleneck-shift',
  'Ada',
  [
    `Ada works. Bo works. ${review} ${send}`,
    "Ada's Review constraint is constrained during October 2026.",
    "Bo's Send constraint is constrained during November 2026.",
    'Both task identities stay explicit.',
    'Constraints remain source stated.',
  ],
  (s) => ({
    actors: [s.identity('ada', 'Ada', 'Ada works.'), s.identity('bo', 'Bo', 'Bo works.')],
    tasks: [s.identity('review', 'Review', review), s.identity('send', 'Send', send)],
    before: {
      actorId: 'ada',
      taskId: 'review',
      state: 'constrained',
      source: s.span("Ada's Review constraint is constrained during October 2026."),
      phase: {
        label: 'October 2026',
        source: s.span("Ada's Review constraint is constrained during October 2026."),
      },
    },
    after: {
      actorId: 'bo',
      taskId: 'send',
      state: 'constrained',
      source: s.span("Bo's Send constraint is constrained during November 2026."),
      phase: {
        label: 'November 2026',
        source: s.span("Bo's Send constraint is constrained during November 2026."),
      },
    },
    comparison: null,
  }),
);

/** Accepted raw planner inputs, not already-parsed scenes. Use each fixture's own indexed words/window. */
export const WORK_SOURCE_FIXTURES: readonly WorkSourceFixture[] = [
  split,
  capability,
  cross,
  responsibility,
  playbook('OP-05', 'expertise-transfer'),
  redeployment,
  fanout,
  load,
  playbook('OP-18', 'owner-playbook'),
  approvalLoad,
  bottleneck,
];

export function parseWorkFixture(fixture: WorkSourceFixture): {
  scene: BusinessWorkScene | null;
  issues: string[];
} {
  const ctx = makeParseContext(fixture.words, fixture.window);
  const kind = fixture.raw.kind;
  if (kind === 'task-map') return { scene: parseTaskMap(fixture.raw, ctx), issues: ctx.issues };
  if (kind === 'coordination-map')
    return { scene: parseCoordinationMap(fixture.raw, ctx), issues: ctx.issues };
  if (kind === 'work-redesign')
    return { scene: parseWorkRedesign(fixture.raw, ctx), issues: ctx.issues };
  return { scene: null, issues: ['unsupported work fixture kind'] };
}
