import type { CognitionScene } from '../../remotion/compositions/explainer/cognition/types';
import {
  TECHNOLOGY_LAYOUTS,
  TECHNOLOGY_LIMITS,
} from '../../remotion/compositions/explainer/technology/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import {
  cognitionLabel,
  cognitionList,
  cognitionStory,
  cognitionSupported,
  cognitionText,
} from './cognition-contract';
import type { AnyKindSpec, ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

const COMMON = {
  layouts: TECHNOLOGY_LAYOUTS,
  durationSec: [TECHNOLOGY_LIMITS.minDuration, TECHNOLOGY_LIMITS.maxDuration] as const,
  cues: (scene: CognitionScene): SceneCue[] => [
    { kind: 'tick', at: scene.actionAt, gain: 0.4 },
    { kind: 'flip', at: scene.responseAt, gain: 0.35 },
    { kind: 'tick', at: scene.checkAt, gain: 0.35 },
  ],
};
const LIMITS =
  'label/subject/outcome and all named labels ≤22 chars; claims ≤40. Every string quotes the source. Keep the COMPLETE condition (≤56), only if present. Lists are bounded and distinct. No extra payload, scores, amounts, code, meshes or assets. Five explicit clause-start word indices; 5–12s, gaps ≥0.6/1/1/1s, final hold ≥0.8s. ';
const STORY =
  '"label":"source phrase","subject":"same source subject","outcome":"source final state","condition":"complete source condition, only if present","setupWord":N,"actionWord":N,"responseWord":N,"checkWord":N,"resolveWord":N';

function supported<T extends CognitionScene>(scene: T, raw: Rec, ctx: ParseContext): T | null {
  return cognitionSupported(scene, raw, ctx) ? scene : null;
}

function distinct(a: string, b: string, ctx: ParseContext): boolean {
  if (cognitionText(a) !== cognitionText(b)) return true;
  mechanismIssue(ctx, 'cognition phases need distinct named source inputs, not duplicated labels');
  return false;
}

export const COGNITION_KIND_SPECS = [
  {
    ...COMMON,
    kind: 'agent-team',
    family: 'process',
    describe:
      'Named specialists receive actual assignments for one subject, deliver their own results, and a coordinator combines those results. parallel-specialists needs explicit concurrency; contractor-crew needs real construction trades working on the same house. No inferred speedup or completion beyond the joined work.',
    schema: `{"kind":"agent-team","preset":"parallel-specialists|contractor-crew","roles":["source role","source role"],${STORY}}`,
    limits: `${LIMITS}roles: 2–3. setup: team and subject; action: coordinator assigns work to EACH named role for that subject (explicitly in parallel for specialists); response: EACH role delivers results; check: combine all named roles' results for the subject; resolve: subject has combined results.`,
    triggers: [
      /\b(?:agent|coordinator|team)\b.{0,100}\b(?:assigns?|delegates?)\b.{0,100}\b(?:specialists?|in parallel)\b/,
      /\b(?:specialists?|agents?)\b.{0,100}\bin parallel\b.{0,140}\b(?:combine|join|merge|results)\b/,
      /\b(?:contractor|crew)\b.{0,100}\b(?:plumber|electrician|carpenter|roofer|painter)\b/,
    ],
    avoid:
      'Not one agent calling tools, generic process steps, release joins, a list of people, unassigned roles, or outputs that never reunite. Contractors must be source-named construction trades, not a forced house metaphor.',
    parse: (raw, ctx) => {
      if (raw.preset !== 'parallel-specialists' && raw.preset !== 'contractor-crew')
        return mechanismIssue(ctx, 'agent-team needs parallel-specialists or contractor-crew');
      const story = cognitionStory(raw, ctx, 'agent-team');
      const roles = cognitionList(raw.roles, ctx, 2, 3);
      if (!story || !roles) return null;
      return supported({ kind: 'agent-team', preset: raw.preset, ...story, roles }, raw, ctx);
    },
  },
  {
    ...COMMON,
    kind: 'agent-plan',
    family: 'story',
    describe:
      'A named plan meets a named blocking obstacle and actually changes to a named revised route. fixed-vs-adaptive additionally preserves a distinct fixed plan on its original route. A revision is not proof the obstacle disappeared or the task succeeded.',
    schema: `{"kind":"agent-plan","preset":"replan|fixed-vs-adaptive","obstacleLabel":"source obstacle","revisedLabel":"source revised route",${STORY}}`,
    limits: `${LIMITS}setup: subject plan; action: named obstacle blocks that plan; response: that plan switches to revisedLabel; check/resolve: that plan follows/uses the revised route. fixed-vs-adaptive check also states the fixed plan keeps its original route.`,
    triggers: [
      /\b(?:agent|plan)\b.{0,100}\b(?:obstacle|new information|blocked|closure)\b.{0,100}\b(?:replan|switch|adapt|change)/,
      /\bfixed (?:plan|route)\b.{0,120}\b(?:adaptive|replans?|changes? route)\b/,
      /\b(?:obstacle|closure)\b.{0,80}\bblocks?\b.{0,80}\bplan\b/,
    ],
    avoid:
      'Not a static flow, tool retry, a proposed change, a route chosen before an obstacle, or an unsupported success claim. Distinguish the unchanged fixed route from the changed plan.',
    parse: (raw, ctx) => {
      if (raw.preset !== 'replan' && raw.preset !== 'fixed-vs-adaptive')
        return mechanismIssue(ctx, 'agent-plan needs replan or fixed-vs-adaptive');
      const story = cognitionStory(raw, ctx, 'agent-plan');
      const obstacleLabel = cognitionLabel(raw.obstacleLabel, ctx);
      const revisedLabel = cognitionLabel(raw.revisedLabel, ctx);
      if (!story || !obstacleLabel || !revisedLabel || !distinct(obstacleLabel, revisedLabel, ctx))
        return null;
      return supported(
        { kind: 'agent-plan', preset: raw.preset, ...story, obstacleLabel, revisedLabel },
        raw,
        ctx,
      );
    },
  },
  {
    ...COMMON,
    kind: 'agent-budget',
    family: 'process',
    describe:
      'A named agent spends a finite named allowance on a named action, exhausts it, then stops or requests more. request-more ends with an explicitly pending request, never an implicit grant, refill or resumed work. Tokens are illustrative, not fabricated amounts.',
    schema: `{"kind":"agent-budget","preset":"stop|request-more","resourceLabel":"source allowance","actionLabel":"source action",${STORY}}`,
    limits: `${LIMITS}setup: subject has bounded resource; action: subject spends resource on action; response: resource exhausted; check: subject stops action or requests more resource; resolve: subject remains stopped, or request remains pending/not granted.`,
    triggers: [
      /\b(?:agent|search)\b.{0,100}\b(?:spends?|consumes?)\b.{0,80}\b(?:budget|allowance|tokens|credits)\b/,
      /\b(?:budget|allowance)\b.{0,70}\b(?:exhausted|depleted|runs? out)\b.{0,110}\b(?:stop|request|ask)/,
    ],
    avoid:
      'Not context-window overflow, resource-leak, generic finance, or a human approval gate that actually grants permission. Mentioning a budget without spending and exhaustion is insufficient; requests are not grants.',
    parse: (raw, ctx) => {
      if (raw.preset !== 'stop' && raw.preset !== 'request-more')
        return mechanismIssue(ctx, 'agent-budget needs stop or request-more');
      const story = cognitionStory(raw, ctx, 'agent-budget');
      const resourceLabel = cognitionLabel(raw.resourceLabel, ctx);
      const actionLabel = cognitionLabel(raw.actionLabel, ctx);
      if (!story || !resourceLabel || !actionLabel || !distinct(resourceLabel, actionLabel, ctx))
        return null;
      return supported(
        { kind: 'agent-budget', preset: raw.preset, ...story, resourceLabel, actionLabel },
        raw,
        ctx,
      );
    },
  },
  {
    ...COMMON,
    kind: 'model-training',
    family: 'process',
    describe:
      'Source examples actually change a named model during training, training ends, then the same frozen model processes a different input during inference. examples-correction needs explicit corrections updating that model. Later use never silently learns or retrains.',
    schema: `{"kind":"model-training","preset":"train-then-use|examples-correction","exampleLabel":"source training examples","inputLabel":"source later input",${STORY}}`,
    limits: `${LIMITS}setup: model trains with examples; action: examples update/change model during training (explicit corrections for examples-correction); response: model finishes training; check: same model processes input in inference; resolve: model stays unchanged/does not learn during inference.`,
    triggers: [
      /\btraining\b.{0,110}\b(?:updates?|changes?|adjusts?)\b.{0,70}\bmodel\b/,
      /\b(?:examples|corrections)\b.{0,100}\bmodel\b.{0,180}\b(?:inference|frozen)\b/,
      /\btraining\b.{0,120}\b(?:ends|finishes|finished)\b.{0,120}\binference\b/,
    ],
    avoid:
      'Not retrieval, prompt context or memory saving. Examples merely being shown is not training; correction words alone do not prove an update. Do not depict inference as training or invent accuracy gains.',
    parse: (raw, ctx) => {
      if (raw.preset !== 'train-then-use' && raw.preset !== 'examples-correction')
        return mechanismIssue(ctx, 'model-training needs train-then-use or examples-correction');
      const story = cognitionStory(raw, ctx, 'model-training');
      const exampleLabel = cognitionLabel(raw.exampleLabel, ctx);
      const inputLabel = cognitionLabel(raw.inputLabel, ctx);
      if (!story || !exampleLabel || !inputLabel || !distinct(exampleLabel, inputLabel, ctx))
        return null;
      return supported(
        { kind: 'model-training', preset: raw.preset, ...story, exampleLabel, inputLabel },
        raw,
        ctx,
      );
    },
  },
  {
    ...COMMON,
    kind: 'model-evaluation',
    family: 'compare',
    describe:
      'Two source-named approaches face exactly two source-named criteria. same-tests explicitly applies identical checks to both and records/compares them. tradeoffs explicitly favors one criterion at the expense of the other in opposite directions. No invented scores, benchmarks or universal winner.',
    schema: `{"kind":"model-evaluation","preset":"same-tests|tradeoffs","approaches":["source approach","source approach"],"criteria":["source criterion","source criterion"],${STORY}}`,
    limits: `${LIMITS}approaches: exactly 2; criteria: exactly 2. setup: comparison with both approaches; action: compare/test both on both criteria (same checks for same-tests); response: record both criteria for both, or approach A favors X over Y and B favors Y over X; check: compare/check tradeoffs; resolve: same checks, tradeoffs remain or no universal winner.`,
    triggers: [
      /\b(?:models|approaches|model)\b.{0,100}\b(?:same|identical) (?:tests|checks|criteria)\b/,
      /\b(?:model|approach)\b.{0,80}\b(?:favors?|prioritizes?)\b.{0,60}\bover\b/,
      /\b(?:model|approach)\b.{0,100}\bat the (?:expense|cost) of\b/,
    ],
    avoid:
      'Not a generic versus panel, a software release pass/fail, fabricated leaderboard, matching nouns without shared tests, or a tradeoff label without opposing criterion preferences.',
    parse: (raw, ctx) => {
      if (raw.preset !== 'same-tests' && raw.preset !== 'tradeoffs')
        return mechanismIssue(ctx, 'model-evaluation needs same-tests or tradeoffs');
      const story = cognitionStory(raw, ctx, 'model-evaluation');
      const approaches = cognitionList(raw.approaches, ctx, 2, 2);
      const criteria = cognitionList(raw.criteria, ctx, 2, 2);
      if (!story || !approaches || !criteria) return null;
      return supported(
        { kind: 'model-evaluation', preset: raw.preset, ...story, approaches, criteria },
        raw,
        ctx,
      );
    },
  },
  {
    ...COMMON,
    kind: 'evidence-conflict',
    family: 'compare',
    describe:
      'Two named sources explicitly state opposite versions of the same proposition; keep their attributed claims separate and unresolved. human-review only refers the disputed subject to a human, never proves which source is right. Supports direct polarity/antonym contradictions, not arbitrary truth inference.',
    schema: `{"kind":"evidence-conflict","preset":"unresolved|human-review","sources":["source name","source name"],"claims":["exact first claim","exact opposing claim"],${STORY}}`,
    limits: `${LIMITS}sources: exactly 2; claims: exactly 2, paired by index. setup: disputed subject and both sources; action: source 1 says exact claim 1; response: source 2 says exact opposite claim 2; check: claims conflict (plus refer subject to human for human-review); resolve: subject remains unresolved. Keep negations inside claims.`,
    triggers: [
      /\b(?:sources|claims) (?:conflict|disagree|contradict)\b/,
      /\bconflicting (?:sources|claims|evidence)\b.{0,100}\b(?:unresolved|human|review)\b/,
      /\b(?:claims|sources)\b.{0,80}\b(?:refer|escalate)\b.{0,80}\bhuman\b/,
    ],
    avoid:
      'Not retrieval finding two agreeing excerpts, mere missing evidence, different topics, unpaired source claims, human approval, or a resolved/proven answer. Opposite claims require the same proposition; a referral is not adjudication.',
    parse: (raw, ctx) => {
      if (raw.preset !== 'unresolved' && raw.preset !== 'human-review')
        return mechanismIssue(ctx, 'evidence-conflict needs unresolved or human-review');
      const story = cognitionStory(raw, ctx, 'evidence-conflict');
      const sources = cognitionList(raw.sources, ctx, 2, 2);
      const claims = cognitionList(raw.claims, ctx, 2, 2, 40);
      if (!story || !sources || !claims) return null;
      return supported(
        { kind: 'evidence-conflict', preset: raw.preset, ...story, sources, claims },
        raw,
        ctx,
      );
    },
  },
] satisfies readonly AnyKindSpec[];
