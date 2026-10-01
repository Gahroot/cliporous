import {
  ADAPTIVE_LAYOUTS,
  ADAPTIVE_LIMITS,
  type AdaptiveModule,
  type AdaptiveObject,
  type AdaptiveScene,
  type CollectivePatternScene,
  type ModularMachineScene,
  type RobotPerceptionScene,
} from '../../remotion/compositions/explainer/concepts/adaptive/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import {
  adaptiveActor,
  adaptiveClaim,
  adaptiveEvidence,
  adaptiveKey,
  adaptiveLabel,
  adaptiveResolution,
  evidenceAtBeat,
} from './concept-adaptive-contract';
import { type AnyKindSpec, isRec, type KindSpec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import { technologyEvidence, technologyStory } from './technology-contract';

/** Deliberately qualitative and small: neither layout nor actor count is a statistic. */
export function parseCollectivePattern(raw: Rec, ctx: ParseContext): CollectivePatternScene | null {
  const preset = raw.preset;
  if (
    preset !== 'network-clusters' &&
    preset !== 'adoption-wave' &&
    preset !== 'coordinated-swarm'
  ) {
    return mechanismIssue(ctx, 'collective-pattern needs an allowlisted preset');
  }
  const story = technologyStory(raw, ctx);
  if (!story) return null;
  if (
    !Array.isArray(raw.actors) ||
    raw.actors.length < 3 ||
    raw.actors.length > ADAPTIVE_LIMITS.actors
  ) {
    return mechanismIssue(ctx, 'use 3–6 individually named qualitative participants');
  }
  const actors: CollectivePatternScene['actors'] = [];
  for (const [i, entry] of raw.actors.entries()) {
    const label = isRec(entry) ? adaptiveLabel(entry.label, ctx) : null;
    if (!label || actors.some((actor) => adaptiveKey(actor.label) === adaptiveKey(label))) {
      return mechanismIssue(ctx, 'participants need distinct source-backed labels');
    }
    actors.push({ id: `actor-${i}`, label });
  }
  const setup = technologyEvidence(
    ctx,
    raw.setupWord,
    typeof raw.actionWord === 'number' ? raw.actionWord - 1 : null,
  );
  const roster = actors.map((actor) => adaptiveActor(actor.label));
  const rosterPattern = `${adaptiveActor(story.subject)} (?:includes|contains) ${preset === 'coordinated-swarm' ? 'robots' : 'people'} ${roster.slice(0, -1).join(' ')} and ${roster.at(-1)}`;
  if (!new RegExp(`^${rosterPattern}$`, 'i').test(adaptiveKey(setup))) {
    return mechanismIssue(ctx, 'setup must name this bounded group and its ordered people/robots');
  }
  if (
    !Array.isArray(raw.relationships) ||
    raw.relationships.length < 2 ||
    raw.relationships.length > ADAPTIVE_LIMITS.relationships
  ) {
    return mechanismIssue(ctx, 'use 2–5 source-indexed local relationships');
  }
  const relationships: CollectivePatternScene['relationships'] = [];
  const reached = new Set([actors[0].id]);
  for (const entry of raw.relationships) {
    if (
      !isRec(entry) ||
      typeof entry.fromActor !== 'number' ||
      typeof entry.toActor !== 'number' ||
      !Number.isInteger(entry.fromActor) ||
      !Number.isInteger(entry.toActor)
    ) {
      return mechanismIssue(ctx, 'relationship actor indices must be bounded integers');
    }
    const from = actors[entry.fromActor];
    const to = actors[entry.toActor];
    const evidence = adaptiveEvidence(entry.evidence, ctx);
    const word = ctx.inWin(entry.word);
    if (
      !from ||
      !to ||
      from.id === to.id ||
      !evidence ||
      word === null ||
      !evidenceAtBeat(evidence, word, ctx)
    ) {
      return mechanismIssue(
        ctx,
        'each interaction must bind two distinct listed actors and its source beat',
      );
    }
    const at = ctx.at(word);
    if (
      at < story.actionAt ||
      at > story.checkAt ||
      (relationships.length > 0 && at - relationships[relationships.length - 1].at < 0.55) ||
      relationships.some((edge) => edge.fromId === from.id && edge.toId === to.id)
    ) {
      return mechanismIssue(
        ctx,
        'local interactions must be distinct, chronological, and spaced before the check',
      );
    }
    const source = adaptiveActor(from.label);
    const target = adaptiveActor(to.label);
    const pattern =
      preset === 'network-clusters'
        ? `${source} (?:connects with|connected with|links to|linked to) ${target}`
        : `${target} ${preset === 'adoption-wave' ? '(?:adopts from|adopted from)' : '(?:follows|followed)'} ${source}`;
    if (!adaptiveClaim(evidence, pattern, story.condition)) {
      return mechanismIssue(
        ctx,
        'prove this local connection, adoption direction, or follower relationship—not noun presence',
      );
    }
    if (preset !== 'network-clusters' && (!reached.has(from.id) || reached.has(to.id))) {
      return mechanismIssue(
        ctx,
        'adoption/following must progress from a reached actor to a new actor, without cycles',
      );
    }
    reached.add(to.id);
    relationships.push({ fromId: from.id, toId: to.id, at, evidence });
  }
  if (preset === 'network-clusters') {
    const groups = actors.map((actor) => new Set([actor.id]));
    for (const edge of relationships) {
      const a = groups.find((group) => group.has(edge.fromId));
      const b = groups.find((group) => group.has(edge.toId));
      if (a && b && a !== b) {
        for (const id of b) a.add(id);
        groups.splice(groups.indexOf(b), 1);
      }
    }
    if (groups.length !== 2 || groups.some((group) => group.size < 2)) {
      return mechanismIssue(
        ctx,
        'network-clusters requires two supported connected groups, with no fabricated links',
      );
    }
  } else if (reached.size !== actors.length) {
    return mechanismIssue(
      ctx,
      'every depicted adopter/follower needs its own local source relationship',
    );
  }
  const result =
    preset === 'network-clusters'
      ? 'forms separate clusters'
      : preset === 'adoption-wave'
        ? 'retains staged adoption'
        : 'holds formation';
  if (
    !adaptiveResolution(
      raw,
      ctx,
      `${adaptiveActor(story.subject)} ${result}`,
      story.outcome,
      story.condition,
    )
  ) {
    return mechanismIssue(
      ctx,
      'resolve must explicitly describe this bounded pattern, not growth or guaranteed coordination',
    );
  }
  return { kind: 'collective-pattern', preset, ...story, actors, relationships };
}

function object(raw: unknown, id: string, ctx: ParseContext): AdaptiveObject | null {
  if (!isRec(raw)) return null;
  const label = adaptiveLabel(raw.label, ctx);
  const form = raw.form;
  if (
    !label ||
    (form !== 'parcel' && form !== 'cone' && form !== 'cylinder') ||
    !new RegExp(`\\b${form}\\b`, 'i').test(label)
  )
    return null;
  return { id, label, form };
}

export function parseRobotPerception(raw: Rec, ctx: ParseContext): RobotPerceptionScene | null {
  const preset = raw.preset;
  if (preset !== 'recognized-target' && preset !== 'uncertain-target') {
    return mechanismIssue(ctx, 'robot-perception needs recognized-target or uncertain-target');
  }
  const story = technologyStory(raw, ctx);
  const target = object(raw.target, 'target', ctx);
  const distractor = object(raw.distractor, 'distractor', ctx);
  const boundaryLabel = adaptiveLabel(raw.boundaryLabel, ctx);
  const observation = adaptiveEvidence(raw.observation, ctx);
  const recognition = adaptiveEvidence(raw.recognition, ctx);
  const response = adaptiveEvidence(raw.response, ctx);
  if (
    !story ||
    !target ||
    !distractor ||
    !boundaryLabel ||
    !observation ||
    !recognition ||
    !response
  ) {
    return mechanismIssue(
      ctx,
      'robot needs two source-backed semantic objects, a boundary, and three local evidence spans',
    );
  }
  if (
    target.form === distractor.form ||
    adaptiveKey(target.label) === adaptiveKey(distractor.label) ||
    !/\b(?:boundary|line|fence)\b/i.test(boundaryLabel)
  ) {
    return mechanismIssue(
      ctx,
      'use distinguishable authored object forms and an explicit physical boundary',
    );
  }
  const robot = adaptiveActor(story.subject);
  const setup = technologyEvidence(
    ctx,
    raw.setupWord,
    typeof raw.actionWord === 'number' ? raw.actionWord - 1 : null,
  );
  if (!new RegExp(`^${robot} is (?:a |the )?robot$`, 'i').test(adaptiveKey(setup))) {
    return mechanismIssue(ctx, 'setup must identify the named subject as a robot');
  }
  const a = adaptiveActor(target.label);
  const b = adaptiveActor(distractor.label);
  const boundary = adaptiveActor(boundaryLabel);
  if (
    !adaptiveClaim(
      observation,
      `${robot} (?:observes|observed) ${a} and ${b} (?:inside|behind) ${boundary}`,
      story.condition,
    ) ||
    !evidenceAtBeat(observation, raw.actionWord, ctx)
  ) {
    return mechanismIssue(
      ctx,
      'show the named robot observing both objects and their boundary before responding',
    );
  }
  const recognized = preset === 'recognized-target';
  if (
    !adaptiveClaim(
      recognition,
      recognized
        ? `${robot} (?:recognizes|recognized) ${a} (?:inside|behind) ${boundary}`
        : `${robot} (?:cannot|could not) distinguish ${a} from ${b}`,
      story.condition,
    ) ||
    !evidenceAtBeat(recognition, raw.responseWord, ctx)
  ) {
    return mechanismIssue(
      ctx,
      'recognition must explicitly bind this robot and target, preserving uncertainty',
    );
  }
  const action = recognized
    ? `${robot} (?:moves|moved) toward ${a}`
    : `${robot} (?:waits|waited) at ${boundary}`;
  const resolution = recognized
    ? `${robot} (?:stops|stopped) before ${boundary}`
    : `${robot} (?:defers|deferred) action`;
  if (
    !adaptiveClaim(response, action, story.condition) ||
    !evidenceAtBeat(response, raw.checkWord, ctx) ||
    !adaptiveResolution(raw, ctx, resolution, story.outcome, story.condition)
  ) {
    return mechanismIssue(
      ctx,
      'recognized motion remains bounded; uncertain recognition must wait and defer, never act',
    );
  }
  return {
    kind: 'robot-perception',
    preset,
    ...story,
    target,
    distractor,
    boundaryLabel,
    observation,
    recognition,
    response,
  };
}

function module(raw: unknown, id: string, ctx: ParseContext): AdaptiveModule | null {
  if (!isRec(raw)) return null;
  const label = adaptiveLabel(raw.label, ctx);
  const role = raw.role;
  if (
    !label ||
    (role !== 'roller' && role !== 'drill' && role !== 'gripper') ||
    !new RegExp(`\\b${role}\\b`, 'i').test(label)
  )
    return null;
  return { id, label, role };
}

export function parseModularMachine(raw: Rec, ctx: ParseContext): ModularMachineScene | null {
  const preset = raw.preset;
  if (preset !== 'reconfigure' && preset !== 'incompatible-module') {
    return mechanismIssue(ctx, 'modular-machine needs an explicit compatibility branch');
  }
  const story = technologyStory(raw, ctx);
  const current = module(raw.current, 'current', ctx);
  const candidate = module(raw.candidate, 'candidate', ctx);
  const jobLabel = adaptiveLabel(raw.jobLabel, ctx);
  const arrangement = adaptiveEvidence(raw.arrangement, ctx);
  const compatibility = adaptiveEvidence(raw.compatibility, ctx);
  const operation = adaptiveEvidence(raw.operation, ctx);
  if (
    !story ||
    !current ||
    !candidate ||
    !jobLabel ||
    !arrangement ||
    !compatibility ||
    !operation ||
    current.role === candidate.role ||
    adaptiveKey(current.label) === adaptiveKey(candidate.label)
  ) {
    return mechanismIssue(
      ctx,
      'machine needs distinct functional parts, a source job, and local arrangement/fit/operation evidence',
    );
  }
  const machine = adaptiveActor(story.subject);
  const a = adaptiveActor(current.label);
  const b = adaptiveActor(candidate.label);
  const job = adaptiveActor(jobLabel);
  const compatible = preset === 'reconfigure';
  const setup = technologyEvidence(
    ctx,
    raw.setupWord,
    typeof raw.actionWord === 'number' ? raw.actionWord - 1 : null,
  );
  if (
    !new RegExp(`^${machine} is (?:a |the )?modular machine with ${a}$`, 'i').test(
      adaptiveKey(setup),
    )
  ) {
    return mechanismIssue(
      ctx,
      'setup must identify this modular machine and its current functional part',
    );
  }
  const arrangementPattern = compatible
    ? `${machine} (?:replaces|replaced) ${a} with ${b} for ${job}`
    : `${machine} (?:brings|brought) ${b} toward (?:the )?socket`;
  const fitPattern = compatible
    ? `${b} (?:fits|fitted) ${machine}`
    : `${b} (?:does not|did not|cannot) fit ${machine}`;
  const operationPattern = compatible
    ? `${machine} (?:uses|used) ${b} for ${job}`
    : `${machine} (?:keeps|kept) ${a} for ${job}`;
  const result = compatible
    ? `${machine} (?:runs|ran) ${b}`
    : `${b} (?:remains|remained) incompatible`;
  if (
    !adaptiveClaim(arrangement, arrangementPattern, story.condition) ||
    !evidenceAtBeat(arrangement, raw.actionWord, ctx) ||
    !adaptiveClaim(compatibility, fitPattern, story.condition) ||
    !evidenceAtBeat(compatibility, raw.responseWord, ctx) ||
    !adaptiveClaim(operation, operationPattern, story.condition) ||
    !evidenceAtBeat(operation, raw.checkWord, ctx) ||
    !adaptiveResolution(raw, ctx, result, story.outcome, story.condition)
  ) {
    return mechanismIssue(
      ctx,
      'prove the same machine/part/job at each beat; incompatible parts must remain unseated and inactive',
    );
  }
  return {
    kind: 'modular-machine',
    preset,
    ...story,
    current,
    candidate,
    jobLabel,
    arrangement,
    compatibility,
    operation,
  };
}

const storySchema =
  '"label":"source phrase","subject":"named group/robot/machine","outcome":"exact local resolution","setupWord":N,"actionWord":N,"responseWord":N,"checkWord":N,"resolveWord":N';
const evidenceSchema = '{"fromWord":N,"toWord":N}';
const limits =
  'Qualitative only; 5–12s, five spaced source beats and ≥0.8s final hold. label≤32, subject≤24, outcome≤40, actor/job/boundary labels≤22. Preserve optional full source condition≤56. Evidence spans≤32 words, whole clauses, affirmative observed assertions except the explicit uncertain/incompatible branches. No noun-only, negated, proposed, swapped-actor, invented quantity, universal competence or growth claims.';
const cues = (scene: AdaptiveScene): SceneCue[] => [
  { kind: 'tick', at: scene.actionAt, gain: 0.22 },
  { kind: 'slide', at: scene.responseAt, gain: 0.22 },
];

export const COLLECTIVE_PATTERN_SPEC = {
  kind: 'collective-pattern',
  describe:
    'Bounded people form two locally linked network clusters or adopt from named peers in stages; wheeled robots follow named neighbors into an authored formation. Not network growth or a population chart.',
  schema: `{"kind":"collective-pattern","preset":"network-clusters",${storySchema},"actors":[{"label":"Ada"},{"label":"Ben"},{"label":"Cora"},{"label":"Dax"}],"relationships":[{"fromActor":0,"toActor":1,"word":N,"evidence":${evidenceSchema}},{"fromActor":2,"toActor":3,"word":N,"evidence":${evidenceSchema}}]}`,
  limits: `${limits} 3–6 ordered people/robots, 2–5 edges at source words between action and check, ≥0.55s apart. Setup: GROUP includes people/robots A, B and C. Links: A connects with B. Adoption: B adopts from A. Swarm: B follows A. Adoption/following is a rooted acyclic progression from first actor; clusters need exactly two connected groups with no isolated actors. Resolve: GROUP forms separate clusters / retains staged adoption / holds formation.`,
  layouts: ADAPTIVE_LAYOUTS,
  durationSec: [5, 12],
  family: 'framework',
  triggers: [
    /\b(?:network clusters|local connections|adoption wave|peer adoption|staged adoption)\b/,
    /\b(?:adopts?|adopted) from\b/,
    /\b(?:swarm|robots?)\b.{0,60}\b(?:coordinate|formation|follows?)\b/,
  ],
  avoid:
    'abstract particles, unbounded graphs, unsupported growth, anonymous crowds or mere mentions of a network',
  parse: parseCollectivePattern,
  cues,
} satisfies KindSpec<'collective-pattern'>;

export const ROBOT_PERCEPTION_SPEC = {
  kind: 'robot-perception',
  describe:
    'A robot observes two distinguishable physical objects and a boundary, recognizes one and moves only toward it, or cannot distinguish them and visibly defers all action.',
  schema: `{"kind":"robot-perception","preset":"uncertain-target",${storySchema},"target":{"label":"parcel","form":"parcel"},"distractor":{"label":"cone","form":"cone"},"boundaryLabel":"safety line","observation":${evidenceSchema},"recognition":${evidenceSchema},"response":${evidenceSchema}}`,
  limits: `${limits} Setup: ROBOT is a robot. Forms parcel/cone/cylinder must appear in each label and differ. Boundary label contains boundary/line/fence. action: ROBOT observes TARGET and DISTRACTOR inside BOUNDARY. response: ROBOT recognizes TARGET inside BOUNDARY, or cannot distinguish TARGET from DISTRACTOR. check: ROBOT moves toward TARGET, or waits at BOUNDARY. resolve: ROBOT stops before BOUNDARY, or defers action.`,
  layouts: ADAPTIVE_LAYOUTS,
  durationSec: [5, 12],
  family: 'story',
  triggers: [
    /\b(?:robot|robotic)\b.{0,70}\b(?:perception|recogniz|recognis|uncertain|distinguish|observ)/,
  ],
  avoid:
    'accuracy scores, general robot competence, uncertain targets followed by successful action',
  parse: parseRobotPerception,
  cues,
} satisfies KindSpec<'robot-perception'>;

export const MODULAR_MACHINE_SPEC = {
  kind: 'modular-machine',
  describe:
    'A machine exchanges distinctive functional tools for a named job; incompatible connectors never seat or activate. Keep the rejected part visible.',
  schema: `{"kind":"modular-machine","preset":"reconfigure",${storySchema},"current":{"label":"roller","role":"roller"},"candidate":{"label":"drill","role":"drill"},"jobLabel":"boring","arrangement":${evidenceSchema},"compatibility":${evidenceSchema},"operation":${evidenceSchema}}`,
  limits: `${limits} Setup: MACHINE is a modular machine with CURRENT. Roles roller/drill/gripper appear in labels and differ. action: MACHINE replaces CURRENT with CANDIDATE for JOB, or brings CANDIDATE toward socket. response: CANDIDATE fits MACHINE, or does not fit MACHINE. check: MACHINE uses CANDIDATE for JOB, or keeps CURRENT for JOB. resolve: MACHINE runs CANDIDATE, or CANDIDATE remains incompatible.`,
  layouts: ADAPTIVE_LAYOUTS,
  durationSec: [5, 12],
  family: 'object',
  triggers: [
    /\b(?:modular machine|incompatible module|interchangeable tool)\b/,
    /\b(?:roller|drill|gripper)\b.{0,65}\b(?:replaces?|fit|socket|incompatible)\b/,
  ],
  avoid:
    'generic assembly, source without a job and a specific compatibility relationship, invented successful fit',
  parse: parseModularMachine,
  cues,
} satisfies KindSpec<'modular-machine'>;

export const CONCEPT_ADAPTIVE_SPECS = [
  COLLECTIVE_PATTERN_SPEC,
  ROBOT_PERCEPTION_SPEC,
  MODULAR_MACHINE_SPEC,
] satisfies AnyKindSpec[];
