import {
  type EdgeCloudScene,
  type ExpertRole,
  type ExpertSelectionScene,
  INFERENCE_LAYOUTS,
  INFERENCE_LIMITS,
  type InferenceExpert,
  type InferenceScene,
  type TokenChoiceScene,
  type WordCandidate,
} from '../../remotion/compositions/explainer/concepts/inference/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import {
  inferenceActor as actor,
  inferenceAtEvidence,
  inferenceEvidence,
  inferenceHas,
  inferenceLabel,
  inferenceMatches,
  inferenceRelation,
  inferenceStory,
  inferenceText,
} from './concept-inference-contract';
import { type AnyKindSpec, isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import { technologyClause } from './technology-contract';

function words(raw: unknown, ctx: ParseContext, prefix: string): WordCandidate[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > INFERENCE_LIMITS.actors)
    return mechanismIssue(ctx, 'token choices require two or three explicit distinct source words');
  const result: WordCandidate[] = [];
  for (const [index, value] of raw.entries()) {
    const label = inferenceLabel(value, ctx, INFERENCE_LIMITS.word);
    if (!label || !/^[\p{L}]+$/u.test(label))
      return mechanismIssue(
        ctx,
        'candidate tiles contain one source word, not scores or invented text',
      );
    if (result.some((item) => inferenceText(item.label) === inferenceText(label)))
      return mechanismIssue(ctx, 'word alternatives must be distinct');
    result.push({ id: `${prefix}-${index}`, label });
  }
  return result;
}

/** The ordered list must actually be offered by the actor; unrelated noun co-occurrence fails. */
function wordList(items: WordCandidate[]): string {
  return items.map((item) => actor(item.label)).join(' (?:and |or )?');
}

export function parseTokenChoice(raw: Rec, ctx: ParseContext): TokenChoiceScene | null {
  if (raw.preset !== 'next-token' && raw.preset !== 'uncertain-choice')
    return mechanismIssue(ctx, 'token-choice requires next-token or uncertain-choice');
  const story = inferenceStory(raw, ctx);
  const sentence = inferenceLabel(raw.sentence, ctx, INFERENCE_LIMITS.sentence);
  const candidates = words(raw.candidates, ctx, 'candidate');
  const nextCandidates = words(raw.nextCandidates, ctx, 'next');
  const offered = inferenceEvidence(raw.candidateEvidence, ctx);
  const selected = inferenceEvidence(raw.selectionEvidence, ctx);
  const next = inferenceEvidence(raw.nextEvidence, ctx);
  if (!story || !sentence || !candidates || !nextCandidates || !offered || !selected || !next)
    return null;
  const chosen = candidates.find((item) => item.label === raw.selected);
  if (!chosen) return mechanismIssue(ctx, 'selected must name exactly one offered candidate');
  if (
    !inferenceAtEvidence(offered, raw.actionWord) ||
    !inferenceAtEvidence(selected, raw.responseWord) ||
    !inferenceAtEvidence(next, raw.checkWord) ||
    !inferenceRelation(
      offered,
      `${actor(story.subject)} (?:considers|offers) ${wordList(candidates)} after ${actor(sentence)}`,
      story,
    ) ||
    !inferenceRelation(
      selected,
      `${actor(story.subject)} (?:tentatively )?(?:selects|chooses|appends) ${actor(chosen.label)} (?:after|to) ${actor(sentence)}`,
      story,
    ) ||
    !inferenceRelation(
      next,
      `${actor(story.subject)} (?:then )?(?:considers|offers) ${wordList(nextCandidates)} after ${actor(chosen.label)}`,
      story,
    )
  )
    return mechanismIssue(
      ctx,
      'bind offered words, chosen continuation and subsequent choices to the same sentence actor at their beats',
    );
  const final = inferenceText(technologyClause(ctx, raw.resolveWord));
  if (
    !inferenceMatches(
      final,
      `${actor(story.subject)} (?:keeps|retains) ${actor(chosen.label)} as (?:a )?(?:tentative )?continuation`,
      story,
    )
  )
    return mechanismIssue(
      ctx,
      'token outcome must retain the chosen continuation, not claim truth',
    );
  const uncertain = /\b(?:uncertain|tentative|tentatively|unresolved)\b/.test(
    `${selected.text} ${final}`,
  );
  const qualifier = final.match(
    /\b(?:choice|continuation|selection) (?:remains|is|stays) (?:uncertain|unresolved|tentative)\b/,
  )?.[0];
  const uncertainty =
    raw.uncertainty === undefined ? undefined : inferenceLabel(raw.uncertainty, ctx, 32);
  if (
    (raw.preset === 'uncertain-choice' &&
      (!uncertainty ||
        !uncertain ||
        inferenceText(uncertainty) !== qualifier ||
        !inferenceHas(story.outcome, uncertainty))) ||
    (raw.preset === 'next-token' && (uncertain || raw.uncertainty !== undefined))
  )
    return mechanismIssue(
      ctx,
      'uncertain choices must retain their complete source qualifier in the final outcome',
    );
  return {
    kind: 'token-choice',
    preset: raw.preset,
    ...story,
    sentence,
    candidates,
    selectedId: chosen.id,
    nextCandidates,
    candidateEvidence: offered.span,
    selectionEvidence: selected.span,
    nextEvidence: next.span,
    ...(uncertainty ? { uncertainty } : {}),
  };
}

function expertRole(value: unknown): ExpertRole | null {
  return value === 'language' || value === 'math' || value === 'vision' || value === 'code'
    ? value
    : null;
}

export function parseExpertSelection(raw: Rec, ctx: ParseContext): ExpertSelectionScene | null {
  if (raw.preset !== 'single-specialist' && raw.preset !== 'specialist-team')
    return mechanismIssue(ctx, 'expert-selection requires single-specialist or specialist-team');
  const story = inferenceStory(raw, ctx);
  if (!story) return null;
  if (!Array.isArray(raw.experts) || raw.experts.length < 2 || raw.experts.length > 3)
    return mechanismIssue(
      ctx,
      'show two or three source-named experts, including an inactive expert',
    );
  const experts: InferenceExpert[] = [];
  for (const [index, item] of raw.experts.entries()) {
    if (!isRec(item) || typeof item.selected !== 'boolean')
      return mechanismIssue(ctx, 'every expert needs an explicit selected boolean');
    const label = inferenceLabel(item.label, ctx, INFERENCE_LIMITS.actor);
    const role = expertRole(item.role);
    const evidence = inferenceEvidence(item.evidence, ctx);
    if (!label || !role || !evidence) return null;
    if (
      !inferenceHas(label, role) ||
      experts.some((expert) => inferenceText(expert.label) === inferenceText(label))
    )
      return mechanismIssue(
        ctx,
        'distinct expert labels must name their illustrated math/language/vision/code role',
      );
    const pattern = item.selected
      ? `${actor(story.subject)} (?:selects|activates) ${actor(label)}`
      : `${actor(story.subject)} (?:leaves|keeps) ${actor(label)} inactive`;
    if (
      !inferenceRelation(evidence, pattern, story) ||
      evidence.span.fromWord < Number(raw.actionWord) ||
      evidence.span.toWord >= Number(raw.responseWord)
    )
      return mechanismIssue(
        ctx,
        'expert selection/nonselection must be explicit for this task in its local action clause',
      );
    const expert: InferenceExpert = {
      id: `expert-${index}`,
      label,
      role,
      selected: item.selected,
      evidence: evidence.span,
    };
    if (item.selected) {
      const contribution = inferenceLabel(item.contribution, ctx, INFERENCE_LIMITS.actor);
      const returned = inferenceEvidence(item.returnEvidence, ctx);
      if (!contribution || !returned) return null;
      if (
        !inferenceRelation(
          returned,
          `${actor(label)} (?:returns|delivers) ${actor(contribution)} to ${actor(story.subject)}`,
          story,
        ) ||
        returned.span.fromWord < Number(raw.responseWord) ||
        returned.span.toWord >= Number(raw.resolveWord)
      )
        return mechanismIssue(
          ctx,
          'each activated expert must return its own stated contribution to the same task',
        );
      expert.contribution = contribution;
      expert.returnEvidence = returned.span;
    } else if (item.contribution !== undefined || item.returnEvidence !== undefined) {
      return mechanismIssue(ctx, 'inactive experts cannot silently contribute');
    }
    experts.push(expert);
  }
  const selected = experts.filter((expert) => expert.selected);
  if (
    selected.length !== (raw.preset === 'single-specialist' ? 1 : 2) ||
    selected.length === experts.length
  )
    return mechanismIssue(
      ctx,
      'single activates one, team activates two; at least one expert remains inactive',
    );
  const final = inferenceText(technologyClause(ctx, raw.resolveWord));
  if (
    !inferenceMatches(
      final,
      `${actor(story.subject)} (?:holds|retains) ${selected.map((expert) => actor(expert.contribution ?? '')).join(' (?:and )?')}`,
      story,
    )
  )
    return mechanismIssue(
      ctx,
      'the final task must hold its selected contributions, not an unsupported success claim',
    );
  return { kind: 'expert-selection', preset: raw.preset, ...story, experts };
}

export function parseEdgeCloud(raw: Rec, ctx: ParseContext): EdgeCloudScene | null {
  if (raw.preset !== 'local-processing' && raw.preset !== 'split-processing')
    return mechanismIssue(ctx, 'edge-cloud requires local-processing or split-processing');
  const story = inferenceStory(raw, ctx);
  const localWork = inferenceLabel(raw.localWork, ctx, INFERENCE_LIMITS.actor);
  const localResult = inferenceLabel(raw.localResult, ctx, INFERENCE_LIMITS.actor);
  const local = inferenceEvidence(raw.localEvidence, ctx);
  const produced = inferenceEvidence(raw.localResultEvidence, ctx);
  if (!story || !localWork || !localResult || !local || !produced) return null;
  if (
    (raw.device !== 'phone' && raw.device !== 'camera') ||
    !inferenceHas(story.subject, raw.device)
  )
    return mechanismIssue(ctx, 'the source subject must name the illustrated phone or camera');
  if (
    !inferenceAtEvidence(local, raw.actionWord) ||
    !inferenceAtEvidence(produced, raw.responseWord) ||
    !inferenceRelation(
      local,
      `${actor(story.subject)} processes ${actor(localWork)} locally`,
      story,
    ) ||
    !inferenceRelation(
      produced,
      `${actor(story.subject)} produces ${actor(localResult)} from ${actor(localWork)} locally`,
      story,
    )
  )
    return mechanismIssue(
      ctx,
      'local work and its actual result must belong to this device, not another actor',
    );
  const scene: EdgeCloudScene = {
    kind: 'edge-cloud',
    preset: raw.preset,
    ...story,
    device: raw.device,
    localWork,
    localResult,
    localEvidence: local.span,
    localResultEvidence: produced.span,
  };
  if (raw.preset === 'split-processing') {
    if (!isRec(raw.remote))
      return mechanismIssue(
        ctx,
        'split-processing needs named outbound work and a returned result',
      );
    const service = inferenceLabel(raw.remote.service, ctx, INFERENCE_LIMITS.actor);
    const work = inferenceLabel(raw.remote.work, ctx, INFERENCE_LIMITS.actor);
    const result = inferenceLabel(raw.remote.result, ctx, INFERENCE_LIMITS.actor);
    const sent = inferenceEvidence(raw.remote.sendEvidence, ctx);
    const returned = inferenceEvidence(raw.remote.returnEvidence, ctx);
    if (!service || !work || !result || !sent || !returned) return null;
    if (
      !/\b(?:cloud|remote)\b/.test(inferenceText(service)) ||
      inferenceText(work) === inferenceText(localWork) ||
      !inferenceAtEvidence(sent, raw.checkWord) ||
      sent.span.toWord >= returned.span.fromWord ||
      returned.span.toWord >= Number(raw.resolveWord) ||
      !inferenceRelation(
        sent,
        `${actor(story.subject)} sends (?:only )?${actor(work)} to ${actor(service)}`,
        story,
      ) ||
      !inferenceRelation(
        returned,
        `${actor(service)} returns ${actor(result)} to ${actor(story.subject)}`,
        story,
      )
    )
      return mechanismIssue(
        ctx,
        'send only the stated remote work to its named service and return that result to this device',
      );
    scene.remote = {
      service,
      work,
      result,
      sendEvidence: sent.span,
      returnEvidence: returned.span,
    };
  } else if (raw.remote !== undefined)
    return mechanismIssue(ctx, 'local-processing cannot invent a cloud trip');
  const final = inferenceText(technologyClause(ctx, raw.resolveWord));
  if (
    !inferenceMatches(
      final,
      `${actor(story.subject)} (?:keeps|retains) ${actor(localResult)}${scene.remote ? ` and ${actor(scene.remote.result)}` : ''}`,
      story,
    )
  )
    return mechanismIssue(
      ctx,
      'the device must retain its stated results; this does not establish privacy or no networking',
    );
  return scene;
}

const STORY =
  '"label":"source phrase","subject":"named source actor","outcome":"source final state","condition":"complete source condition only if present","setupWord":N,"actionWord":N,"responseWord":N,"checkWord":N,"resolveWord":N';
const SPAN = '{"fromWord":N,"toWord":N}';
const COMMON = {
  layouts: INFERENCE_LAYOUTS,
  durationSec: [5, 12] as const,
  cues: (scene: InferenceScene): SceneCue[] => [
    { kind: 'tick', at: scene.actionAt, gain: 0.3 },
    { kind: 'slide', at: scene.responseAt, gain: 0.3 },
    { kind: 'tick', at: scene.checkAt, gain: 0.25 },
  ],
};
const LIMITS =
  'Use full local sentence/clause evidence spans, never truncated negation or unrelated actor nouns. Labels quote source: title/sentence 32, subject 24, actors 22, outcome 40, condition 56 chars. Five source-word beats, 5–12s, gaps ≥0.6/1/1/1s, hold ≥0.8s. Qualitative only: no probability, accuracy, truth, privacy or universal model claims. ';

export const CONCEPT_INFERENCE_SPECS = [
  {
    ...COMMON,
    kind: 'token-choice',
    family: 'words',
    describe:
      'Source-named writer/model considers two or three word candidates after a sentence, selects one continuation, then considers subsequent words. All alternatives remain visible; uncertain-choice explicitly retains uncertainty, never correctness.',
    schema: `{"kind":"token-choice","preset":"next-token|uncertain-choice","sentence":"source prefix","candidates":["word","word"],"selected":"word","nextCandidates":["word","word"],"candidateEvidence":${SPAN},"selectionEvidence":${SPAN},"nextEvidence":${SPAN},"uncertainty":"exact final qualifier for uncertain-choice only",${STORY}}`,
    limits: `${LIMITS}Candidate words ≤16 chars each. Action: actor considers A and B after prefix. Response: same actor selects A after prefix. Check: same actor considers C and D after A. Resolve: actor keeps A as a continuation. Uncertain qualifier must remain in outcome; do not replace uncertain-choice with confident next-token.`,
    triggers: [
      /\b(?:next word|next token|word candidates|candidate words)\b/,
      /\b(?:writer|model)\b.{0,70}\b(?:considers|selects)\b.{0,90}\b(?:continuation|after)\b/,
    ],
    avoid:
      'Not factual verification, a probability chart, token budget, model training, or unsupported candidate words.',
    parse: parseTokenChoice,
  },
  {
    ...COMMON,
    kind: 'expert-selection',
    family: 'process',
    describe:
      'A named task activates one or two source-named specialist stations, leaves another explicitly inactive, and receives only selected contributions. This illustrates a stated selection, not an architecture claim about all models.',
    schema: `{"kind":"expert-selection","preset":"single-specialist|specialist-team","experts":[{"label":"math expert","role":"math|language|vision|code","selected":true,"evidence":${SPAN},"contribution":"source contribution","returnEvidence":${SPAN}},{"label":"vision expert","role":"vision","selected":false,"evidence":${SPAN}}],${STORY}}`,
    limits: `${LIMITS}2–3 distinct named experts; single selects exactly 1, team exactly 2, always ≥1 inactive. Source role must occur in label. Action clauses: task selects expert / task leaves expert inactive. Response/check clauses: EACH selected expert returns contribution to task. Resolve: task holds those contributions. Inactive experts have no contribution fields.`,
    triggers: [
      /\b(?:task|request)\b.{0,90}\b(?:selects|activates)\b.{0,70}\b(?:expert|specialist)\b/,
      /\b(?:expert|specialist)\b.{0,60}\binactive\b/,
    ],
    avoid:
      'Not all specialists working in parallel, generic agent-team, mere role nouns, proposed activation or invented universal architecture.',
    parse: parseExpertSelection,
  },
  {
    ...COMMON,
    kind: 'edge-cloud',
    family: 'process',
    describe:
      'A source-named phone/camera processes stated work locally and retains its result. split-processing additionally sends distinct stated work to a named remote/cloud service and receives its result. No automatic privacy or networking claim.',
    schema: `{"kind":"edge-cloud","preset":"local-processing|split-processing","device":"phone|camera","localWork":"source work","localResult":"source result","localEvidence":${SPAN},"localResultEvidence":${SPAN},"remote":{"service":"source cloud service","work":"source remote work","result":"source result","sendEvidence":${SPAN},"returnEvidence":${SPAN}},${STORY}}`,
    limits: `${LIMITS}Action: device processes localWork locally. Response: same device produces localResult from localWork locally. Split check: device sends remote work to named service, then service returns result to device before resolve. Resolve: device retains localResult and remote result if applicable. Omit remote entirely for local-processing.`,
    triggers: [
      /\b(?:phone|camera|device)\b.{0,80}\b(?:processes|processing)\b.{0,70}\blocally\b/,
      /\b(?:edge|local processing)\b.{0,90}\bcloud\b/,
    ],
    avoid:
      'Not generic request routing, an entirely cloud-side process, noun-only device/cloud mentions, privacy guarantees or an unstated data transfer.',
    parse: parseEdgeCloud,
  },
] satisfies readonly AnyKindSpec[];
