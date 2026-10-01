import type { CognitionScene } from '../../remotion/compositions/explainer/cognition/types';
import {
  TECHNOLOGY_LAYOUTS,
  TECHNOLOGY_WORD_FIELDS,
  type TechnologyStory,
} from '../../remotion/compositions/explainer/technology/types';
import type { ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import { technologyEvidence, technologyPhrase, technologyStory } from './technology-contract';

export type CognitionKind = CognitionScene['kind'];
const FIELDS = {
  'agent-team': ['roles'],
  'agent-plan': ['obstacleLabel', 'revisedLabel'],
  'agent-budget': ['resourceLabel', 'actionLabel'],
  'model-training': ['exampleLabel', 'inputLabel'],
  'model-evaluation': ['approaches', 'criteria'],
  'evidence-conflict': ['sources', 'claims'],
} as const satisfies Record<CognitionKind, readonly string[]>;
const COMMON_FIELDS = [
  'kind',
  'preset',
  'label',
  'subject',
  'outcome',
  'condition',
  'startWord',
  'endWord',
  'layout',
  // The planner owns omission/diagnostics for these existing optional extras.
  // They never enter the returned authored body.
  'laterStamp',
  'dimWord',
  'reactions',
  'annotation',
  'bursts',
  ...TECHNOLOGY_WORD_FIELDS,
];
const UNSAFE_TEXT =
  /[<>`{}[\]\\]|(?:https?|file|data|javascript):|www\.|\b\S+\.(?:glb|gltf|obj|fbx|svg|png|jpe?g|js|py)\b|\b(?:eval|require|fetch|exec|alert)\s*\(/i;
const NEGATED =
  /\b(?:no|not|never|without|cannot|can't|won't|doesn't|don't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|couldn't|wouldn't|neither)\b/i;
const PROPOSED =
  /\b(?:may|might|could|should|would|will|maybe|perhaps|proposes?|hopes?|tries|attempts?|pretends?|allegedly|supposedly)\b|\bplans? to\b/i;
const UNRELATED =
  /\b(?:another|different|unrelated|other)\s+(?:\w+\s+){0,2}(?:task|project|model|plan|budget|result|claim|subject)\b/i;

/** Normalization here is for relationships only; sourceLabel still protects signed numbers. */
export function cognitionText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim();
}

function escaped(text: string): string {
  return cognitionText(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function has(clause: string, phrase: string): boolean {
  return ` ${clause} `.includes(` ${cognitionText(phrase)} `);
}

function asserted(clause: string): boolean {
  return (
    !NEGATED.test(clause) &&
    !PROPOSED.test(clause) &&
    !UNRELATED.test(clause) &&
    !/\b(?:unsuccessful(?:ly)?|fails? to|failed to|refuses? to|refused to)\b/.test(clause)
  );
}

function relation(clause: string, pattern: string): boolean {
  return new RegExp(`(?:^| )${pattern}(?= |$)`).test(clause);
}

export function cognitionLabel(value: unknown, ctx: ParseContext, max = 22): string | null {
  const label = technologyPhrase(value, ctx, max);
  if (!label || UNSAFE_TEXT.test(label))
    return mechanismIssue(
      ctx,
      'cognition labels must be bounded source text, not code, assets or markup',
    );
  return label;
}

export function cognitionList(
  value: unknown,
  ctx: ParseContext,
  min: number,
  max: number,
  chars = 22,
): string[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    return mechanismIssue(ctx, `cognition lists need ${min}–${max} entries; do not truncate them`);
  const labels = value.map((entry) => cognitionLabel(entry, ctx, chars));
  if (labels.some((entry) => entry === null)) return null;
  const result = labels.filter((entry): entry is string => entry !== null);
  if (new Set(result.map(cognitionText)).size !== result.length)
    return mechanismIssue(ctx, 'cognition list entries must be distinct source phrases');
  return result;
}

export function cognitionStory(
  raw: Rec,
  ctx: ParseContext,
  kind: CognitionKind,
): TechnologyStory | null {
  const allowed = new Set<string>([...COMMON_FIELDS, ...FIELDS[kind]]);
  if (raw.kind !== kind || Object.keys(raw).some((key) => !allowed.has(key)))
    return mechanismIssue(
      ctx,
      `${kind} accepts only its authored story fields, never scores, geometry or assets`,
    );
  if (
    (raw.startWord !== undefined && raw.startWord !== ctx.win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== ctx.win.endWord) ||
    (raw.layout !== undefined && !TECHNOLOGY_LAYOUTS.some((layout) => layout === raw.layout))
  )
    return mechanismIssue(ctx, 'cognition window/layout must match the existing scene envelope');
  const story = technologyStory(raw, ctx);
  if (!story) return null;
  // Conditions keep the shared 56-character bound: never shorten a prerequisite to fit a label.
  if (
    !['label', 'subject', 'outcome'].every((field) => cognitionLabel(raw[field], ctx)) ||
    (story.condition !== undefined && UNSAFE_TEXT.test(story.condition))
  )
    return mechanismIssue(
      ctx,
      'cognition label, subject and outcome are at most 22 characters; preserve the full condition',
    );
  return story;
}

type Phase = 'setup' | 'action' | 'response' | 'check' | 'resolve';
type Evidence = Record<Phase, string[]>;
const PHASES: readonly Phase[] = ['setup', 'action', 'response', 'check', 'resolve'];

function evidence(raw: Rec, ctx: ParseContext, story: TechnologyStory): Evidence {
  const spans = PHASES.map((phase, index) => {
    const next = PHASES[index + 1];
    const end = next ? ctx.inWin(raw[`${next}Word`]) : ctx.win.endWord + 1;
    const text = technologyEvidence(ctx, raw[`${phase}Word`], (end ?? 0) - 1);
    return text
      .split(/[.!?;]|\b(?:but|whereas)\b/i)
      .map(cognitionText)
      .map((clause) => {
        const condition = story.condition && cognitionText(story.condition);
        return condition && clause.startsWith(`${condition} `)
          ? clause.slice(condition.length).trim()
          : clause;
      })
      .filter(Boolean);
  });
  return {
    setup: spans[0],
    action: spans[1],
    response: spans[2],
    check: spans[3],
    resolve: spans[4],
  };
}

function some(clauses: string[], test: (clause: string) => boolean): boolean {
  return clauses.some((clause) => asserted(clause) && test(clause));
}

function finalClaim(
  e: Evidence,
  story: TechnologyStory,
  test: (clause: string) => boolean,
): boolean {
  return e.resolve.some(
    (clause) => has(clause, story.subject) && has(clause, story.outcome) && test(clause),
  );
}

const JOIN =
  /\b(?:joins?|joined|combines?|combined|merges?|merged|assembles?|assembled|reunites?|reunited)\b/;
const RESULTS = /\b(?:results?|outputs?|work|contributions)\b/;
const CONTRACTOR =
  /\b(?:contractor|plumber|electrician|carpenter|roofer|painter|mason|builder|architect|tiler|plasterer|joiner|landscaper)s?\b/;

function teamEvidence(
  scene: Extract<CognitionScene, { kind: 'agent-team' }>,
  e: Evidence,
): boolean {
  const subject = escaped(scene.subject);
  const assigned = (role: string): boolean =>
    some(
      e.action,
      (c) =>
        has(c, scene.subject) &&
        relation(
          c,
          `(?:(?:agent|coordinator|manager|contractor|team lead) (?:assigns?|assigned|delegates?|delegated) .+ to (?:the )?${escaped(role)}|${escaped(role)} (?:is|are|was|were) assigned .+)`,
        ),
    );
  const delivered = (role: string): boolean =>
    some(e.response, (c) =>
      relation(
        c,
        `${escaped(role)} (?:returns?|returned|delivers?|delivered|produces?|produced) (?:the |its |their |a )?(?:results?|outputs?|work|contributions)`,
      ),
    );
  return (
    Object.values(e).flat().every(asserted) &&
    some(
      e.setup,
      (c) => has(c, scene.subject) && /\b(?:agent|team|coordinator|contractor|crew)\b/.test(c),
    ) &&
    scene.roles.every(assigned) &&
    scene.roles.every(delivered) &&
    some(
      e.check,
      (c) =>
        has(c, scene.subject) &&
        /\b(?:coordinator|agent|manager|contractor|team lead) (?:joins?|joined|combines?|combined|merges?|merged|assembles?|assembled|reunites?|reunited)\b/.test(
          c,
        ) &&
        RESULTS.test(c) &&
        scene.roles.every((role) => has(c, role)),
    ) &&
    JOIN.test(cognitionText(scene.outcome)) &&
    RESULTS.test(cognitionText(scene.outcome)) &&
    finalClaim(
      e,
      scene,
      (c) => asserted(c) && JOIN.test(c) && RESULTS.test(c) && relation(c, subject),
    ) &&
    (scene.preset === 'parallel-specialists'
      ? some(e.action, (c) =>
          /\b(?:in parallel|simultaneously|concurrently|at the same time)\b/.test(c),
        )
      : scene.roles.every((role) => CONTRACTOR.test(cognitionText(role))) &&
        some(
          e.setup,
          (c) =>
            has(c, scene.subject) && /\b(?:house|home|building|renovation|construction)\b/.test(c),
        ))
  );
}

function planEvidence(
  scene: Extract<CognitionScene, { kind: 'agent-plan' }>,
  e: Evidence,
): boolean {
  const subject = escaped(scene.subject);
  const obstacle = escaped(scene.obstacleLabel);
  const revised = escaped(scene.revisedLabel);
  const follows = (c: string): boolean =>
    relation(
      c,
      `${subject} (?:now )?(?:follows?|followed|uses?|used|takes?|took) (?:the )?${revised}`,
    );
  const fixed = (c: string): boolean =>
    asserted(c) &&
    /\bfixed (?:plan|route) (?:keeps?|kept|retains?|retained|stays? on|stayed on) (?:the |its )?(?:original|same|initial) (?:plan|route|path)\b/.test(
      c,
    );
  return (
    Object.values(e).flat().every(asserted) &&
    some(e.setup, (c) => has(c, scene.subject) && /\b(?:plan|route)\b/.test(c)) &&
    some(e.action, (c) =>
      relation(
        c,
        `(?:${obstacle} (?:blocks?|blocked|disrupts?|disrupted|invalidates?|invalidated) (?:the )?${subject}|${subject} (?:encounters?|encountered|meets?|met|hits?|hit) (?:the )?${obstacle})`,
      ),
    ) &&
    some(e.response, (c) =>
      relation(
        c,
        `${subject} (?:switches|switched|changes|changed|adapts|adapted|replans|replanned|reroutes|rerouted) (?:the route )?(?:to|via|using) (?:the )?${revised}`,
      ),
    ) &&
    some(e.check, follows) &&
    has(cognitionText(scene.outcome), scene.revisedLabel) &&
    finalClaim(e, scene, (c) => asserted(c) && follows(c)) &&
    (scene.preset !== 'fixed-vs-adaptive' || e.check.some(fixed))
  );
}

const PENDING = /\b(?:pending|awaiting approval|ungranted|not (?:yet )?(?:approved|granted))\b/;
const STOPPED = /\b(?:stays?|remains?) (?:stopped|paused|halted)\b/;
function expectedNegative(clause: string, expected: RegExp): boolean {
  return expected.test(clause) && asserted(clause.replace(expected, 'expected state'));
}

function budgetEvidence(
  scene: Extract<CognitionScene, { kind: 'agent-budget' }>,
  e: Evidence,
): boolean {
  const subject = escaped(scene.subject);
  const resource = escaped(scene.resourceLabel);
  const action = escaped(scene.actionLabel);
  const stop = (c: string): boolean =>
    relation(c, `${subject} (?:stops?|stopped|halts?|halted|pauses?|paused) (?:the )?${action}`);
  const request = (c: string): boolean =>
    relation(
      c,
      `${subject} (?:requests?|requested|asks? for|asked for) (?:more|additional) ${resource}`,
    );
  const grantOrResume = (c: string): boolean =>
    asserted(c) &&
    /\b(?:grants?|granted|approves?|approved|replenishes?|replenished|refills?|refilled|resumes?|resumed|continues?|continued)\b/.test(
      c,
    );
  return (
    some(
      e.setup,
      (c) =>
        relation(
          c,
          `${subject} (?:has|had|receives?|received|is given|starts? with) (?:a |the |its )?(?:finite |bounded |capped )?${resource}`,
        ) && /\b(?:budget|allowance|limit|finite|bounded|capped)\b/.test(c),
    ) &&
    e.action.every(asserted) &&
    some(
      e.action,
      (c) =>
        relation(
          c,
          `${subject} (?:spends?|spent|uses? up|used up|consumes?|consumed) (?:the |its )?${resource} (?:on|for) (?:each |the )?${action}`,
        ) ||
        (has(c, scene.subject) &&
          relation(
            c,
            `${action} (?:spends?|spent|consumes?|consumed|uses? up|used up) (?:the )?${resource}`,
          )),
    ) &&
    e.response.every(asserted) &&
    some(
      e.response,
      (c) =>
        relation(
          c,
          `${resource} (?:(?:is|was|becomes?|became) (?:exhausted|depleted|empty|used up)|runs? out|ran out)`,
        ) ||
        relation(c, `${subject} (?:reaches?|reached|hits?|hit) (?:the |its )?${resource} limit`),
    ) &&
    ![...e.response, ...e.check, ...e.resolve].some(grantOrResume) &&
    (scene.preset === 'stop'
      ? e.check.every(asserted) &&
        some(e.check, stop) &&
        !e.check.some(request) &&
        STOPPED.test(cognitionText(scene.outcome)) &&
        finalClaim(e, scene, (c) => asserted(c) && STOPPED.test(c)) &&
        e.resolve.every(asserted)
      : e.check.every(asserted) &&
        some(e.check, request) &&
        PENDING.test(cognitionText(scene.outcome)) &&
        e.resolve.some(
          (c) => has(c, scene.outcome) && /\brequest\b/.test(c) && expectedNegative(c, PENDING),
        ) &&
        e.resolve.every((c) => asserted(c) || expectedNegative(c, PENDING)))
  );
}

const NONLEARNING =
  /\b(?:(?:stays?|remains?|is) (?:unchanged|frozen)|(?:does not|doesn't|never) (?:learn|retrain|update|change)(?:s|ed)?)\b/;
function trainingEvidence(
  scene: Extract<CognitionScene, { kind: 'model-training' }>,
  e: Evidence,
): boolean {
  const subject = escaped(scene.subject);
  const input = escaped(scene.inputLabel);
  const changes = (c: string): boolean =>
    has(c, scene.exampleLabel) &&
    /\btraining\b/.test(c) &&
    relation(
      c,
      `(?:updates?|updated|changes?|changed|adjusts?|adjusted|corrects?|corrected) (?:the )?${subject}`,
    );
  const inference = (c: string): boolean =>
    /\b(?:inference|later use)\b/.test(c) &&
    relation(
      c,
      `${subject} (?:answers?|answered|processes?|processed|uses?|used|predicts?|predicted from) (?:the |a )?${input}`,
    );
  return (
    some(
      e.setup,
      (c) => has(c, scene.subject) && has(c, scene.exampleLabel) && /\btraining\b/.test(c),
    ) &&
    e.action.every(asserted) &&
    some(e.action, changes) &&
    (scene.preset !== 'examples-correction' ||
      some(e.action, (c) => changes(c) && /\b(?:corrections?|corrected|corrects?)\b/.test(c))) &&
    e.response.every(asserted) &&
    some(e.response, (c) =>
      relation(c, `${subject} (?:finishes?|finished|completes?|completed) (?:its )?training`),
    ) &&
    some(e.check, inference) &&
    NONLEARNING.test(cognitionText(scene.outcome)) &&
    finalClaim(
      e,
      scene,
      (c) => expectedNegative(c, NONLEARNING) && /\b(?:inference|later use)\b/.test(c),
    ) &&
    [...e.check, ...e.resolve].every(
      (c) =>
        (asserted(c) || expectedNegative(c, NONLEARNING)) &&
        !/\b(?:learns?|learned|trains?|trained|retrains?|retrained|updates?|updated|changes?|changed|adjusts?|adjusted)\b/.test(
          c.replace(NONLEARNING, 'unchanged'),
        ),
    )
  );
}

const NEUTRAL_EVALUATION =
  /\b(?:same checks|same tests|tradeoffs remain|tradeoffs preserved|no (?:universal )?winner)\b/;
function evaluationEvidence(
  scene: Extract<CognitionScene, { kind: 'model-evaluation' }>,
  e: Evidence,
): boolean {
  const allNamed = (c: string): boolean =>
    [...scene.approaches, ...scene.criteria].every((label) => has(c, label));
  const tradeoff = (approach: string, gain: string, loss: string): boolean =>
    some(
      e.response,
      (c) =>
        relation(
          c,
          `${escaped(approach)} (?:favors?|favored|prioritizes?|prioritized) ${escaped(gain)} over ${escaped(loss)}`,
        ) ||
        relation(
          c,
          `${escaped(approach)} (?:improves?|improved|gains?|gained) ${escaped(gain)} at the (?:expense|cost) of ${escaped(loss)}`,
        ),
    );
  const [a, b] = scene.approaches;
  const [x, y] = scene.criteria;
  const approaches = `(?:(?:the )?${escaped(a)} and (?:the )?${escaped(b)}|(?:the )?${escaped(b)} and (?:the )?${escaped(a)})`;
  const tested = (c: string): boolean =>
    allNamed(c) &&
    relation(
      c,
      `(?:test|tests|tested|evaluate|evaluates|evaluated|compare|compares|compared) ${approaches} (?:on|using|against)`,
    );
  const later = [...e.check, ...e.resolve];
  return (
    some(
      e.setup,
      (c) => has(c, scene.subject) && scene.approaches.every((label) => has(c, label)),
    ) &&
    e.action.every(asserted) &&
    some(e.action, tested) &&
    e.response.every(asserted) &&
    (scene.preset === 'same-tests'
      ? some(
          e.action,
          (c) => allNamed(c) && /\b(?:same|identical) (?:tests|checks|criteria)\b/.test(c),
        ) &&
        some(
          e.response,
          (c) => allNamed(c) && /\b(?:record|records|recorded|measure|measures|measured)\b/.test(c),
        ) &&
        some(e.check, (c) => allNamed(c) && /\b(?:compare|compares|compared)\b/.test(c))
      : ((tradeoff(a, x, y) && tradeoff(b, y, x)) || (tradeoff(a, y, x) && tradeoff(b, x, y))) &&
        some(e.check, (c) => has(c, scene.subject) && /\btradeoffs?\b/.test(c))) &&
    NEUTRAL_EVALUATION.test(cognitionText(scene.outcome)) &&
    finalClaim(e, scene, (c) => expectedNegative(c, NEUTRAL_EVALUATION)) &&
    later.every((c) => asserted(c) || expectedNegative(c, NEUTRAL_EVALUATION)) &&
    !later.some(
      (c) =>
        asserted(c) &&
        /\b(?:wins?|winner|best|superior|perfect|proves?|proved|score|scores)\b/.test(c),
    )
  );
}

/** A bounded contradiction grammar, not an LLM truth adjudicator. Same proposition, opposite polarity. */
function opposingClaims(a: string, b: string): boolean {
  const expand = (s: string): string =>
    cognitionText(s)
      .replace(/\bisn't\b/g, 'is not')
      .replace(/\baren't\b/g, 'are not');
  const first = expand(a);
  const second = expand(b);
  if (
    [first, second].some(
      (claim) => PROPOSED.test(claim) || /\b(?:if|unless|and|or|only|sometimes)\b/.test(claim),
    )
  )
    return false;
  const negations = (s: string): number => (s.match(/\bnot\b/g) ?? []).length;
  if (
    negations(first) + negations(second) === 1 &&
    first.replace(/\bnot /, '') === second.replace(/\bnot /, '')
  )
    return true;
  if (NEGATED.test(first) || NEGATED.test(second)) return false;
  const pairs = [
    ['valid', 'invalid'],
    ['open', 'closed'],
    ['open', 'shut'],
    ['safe', 'unsafe'],
    ['approved', 'denied'],
    ['available', 'unavailable'],
    ['true', 'false'],
    ['on', 'off'],
    ['allowed', 'forbidden'],
    ['passed', 'failed'],
    ['present', 'absent'],
    ['complete', 'incomplete'],
    ['eligible', 'ineligible'],
    ['permitted', 'prohibited'],
    ['accepted', 'rejected'],
    ['enabled', 'disabled'],
    ['allows', 'forbids'],
    ['increased', 'decreased'],
  ];
  const left = first.split(' ');
  const right = second.split(' ');
  const differences = left.flatMap((word, i) => (word === right[i] ? [] : [[word, right[i]]]));
  return (
    left.length === right.length &&
    differences.length === 1 &&
    pairs.some(
      ([x, y]) =>
        (differences[0][0] === x && differences[0][1] === y) ||
        (differences[0][0] === y && differences[0][1] === x),
    )
  );
}

const UNRESOLVED = /\b(?:remains?|stays?|is) (?:unresolved|unverified|unknown|not resolved)\b/;
function conflictEvidence(
  scene: Extract<CognitionScene, { kind: 'evidence-conflict' }>,
  e: Evidence,
): boolean {
  const attributed = (clauses: string[], source: string, claim: string): boolean =>
    clauses.some((c) =>
      new RegExp(
        `^(?:the )?${escaped(source)} (?:says|said|reports|reported|states|stated|claims|claimed|records|recorded)(?: that)? ${escaped(claim)}$`,
      ).test(c),
    );
  const referred = (c: string): boolean =>
    asserted(c) &&
    relation(
      c,
      `(?:refer|refers|referred|send|sends|sent|escalate|escalates|escalated) (?:the )?${escaped(scene.subject)} to (?:a |the )?(?:human|person|reviewer)`,
    );
  return (
    some(
      e.setup,
      (c) => has(c, scene.subject) && scene.sources.every((source) => has(c, source)),
    ) &&
    attributed(e.action, scene.sources[0], scene.claims[0]) &&
    attributed(e.response, scene.sources[1], scene.claims[1]) &&
    opposingClaims(scene.claims[0], scene.claims[1]) &&
    e.action.length === 1 &&
    e.response.length === 1 &&
    some(e.check, (c) =>
      /\b(?:claims (?:conflict|contradict|disagree)|sources (?:conflict|disagree))\b/.test(c),
    ) &&
    (scene.preset === 'human-review' ? e.check.some(referred) : !e.check.some(referred)) &&
    UNRESOLVED.test(cognitionText(scene.outcome)) &&
    finalClaim(e, scene, (c) => expectedNegative(c, UNRESOLVED)) &&
    [...e.check, ...e.resolve].every(
      (c) =>
        (asserted(c) || expectedNegative(c, UNRESOLVED)) &&
        !/\b(?:proves?|proved|proven|resolves?|resolved|settles?|settled|verifies|verified|winner|correct)\b/.test(
          c.replace(UNRESOLVED, 'unresolved'),
        ),
    )
  );
}

export function cognitionSupported(scene: CognitionScene, raw: Rec, ctx: ParseContext): boolean {
  const spans = evidence(raw, ctx, scene);
  let supported: boolean;
  switch (scene.kind) {
    case 'agent-team':
      supported = teamEvidence(scene, spans);
      break;
    case 'agent-plan':
      supported = planEvidence(scene, spans);
      break;
    case 'agent-budget':
      supported = budgetEvidence(scene, spans);
      break;
    case 'model-training':
      supported = trainingEvidence(scene, spans);
      break;
    case 'model-evaluation':
      supported = evaluationEvidence(scene, spans);
      break;
    case 'evidence-conflict':
      supported = conflictEvidence(scene, spans);
      break;
  }
  if (!supported)
    mechanismIssue(
      ctx,
      `${scene.kind}/${scene.preset} needs locally attributed setup, action, response, check and outcome evidence; nouns, negations, proposals or an opposite branch are insufficient`,
    );
  return supported;
}
