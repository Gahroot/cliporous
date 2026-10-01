import {
  INFORMATION_LAYOUTS,
  type InformationScene,
  type InformationTransformScene,
  type LayerRole,
  type SemanticSortScene,
  type SystemLayersScene,
} from '../../remotion/compositions/explainer/concepts/information/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import {
  INFORMATION_UNACHIEVED,
  informationContains,
  informationDistinct,
  informationEntries,
  informationEvidence,
  informationLabel,
  informationRelation,
  informationStory,
  informationText,
} from './concept-information-contract';
import type { AnyKindSpec, ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import { technologyClause } from './technology-contract';

function literal(text: string): string {
  return informationText(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Deliberately local and directional; swapping actor/target is not repaired. */
function ordered(phrase: string, actor: string, verb: string, target: string): boolean {
  return new RegExp(`^${literal(actor)} ${verb} ${literal(target)}$`).test(informationText(phrase));
}

const ROLES: readonly LayerRole[] = [
  'people',
  'workflow',
  'records',
  'interface',
  'compute',
  'power',
];
function isRole(value: unknown): value is LayerRole {
  return ROLES.some((role) => role === value);
}

export function parseSystemLayers(raw: Rec, ctx: ParseContext): SystemLayersScene | null {
  if (raw.preset !== 'business-stack' && raw.preset !== 'device-stack')
    return mechanismIssue(ctx, 'system-layers needs a known preset');
  const story = informationStory(raw, ctx);
  const entries = informationEntries(raw.layers, ctx, 2, 4);
  if (!story || !entries) return null;
  const layers: SystemLayersScene['layers'] = [];
  for (const [index, entry] of entries.entries()) {
    const label = informationLabel(entry.label, ctx);
    const evidence = informationEvidence(entry.evidence, ctx);
    if (!label || !evidence || !isRole(entry.role))
      return mechanismIssue(ctx, 'layers need a source label, role and relationship');
    const role = entry.role;
    const validRole =
      raw.preset === 'business-stack'
        ? ['people', 'workflow', 'records'].includes(role)
        : ['interface', 'compute', 'power', 'records'].includes(role);
    if (
      !validRole ||
      !informationRelation(evidence, [label, story.subject, role], /\blayer\b/i, ctx) ||
      !ordered(evidence.phrase, label, `is the ${role} layer of`, story.subject)
    )
      return mechanismIssue(
        ctx,
        'each layer must explicitly name its function and the same containing system',
      );
    layers.push({ id: `layer-${index}`, label, role, evidence });
  }
  const action = technologyClause(ctx, raw.actionWord);
  const check = technologyClause(ctx, raw.checkWord);
  const connections = layers
    .slice(1)
    .every((layer, index) =>
      informationContains(check, `${layers[index].label} to ${layer.label}`),
    );
  if (
    !informationDistinct(
      layers.map((layer) => layer.label),
      ctx,
    ) ||
    !new RegExp(`^${literal(story.subject)} (?:separates|opens|reveals) `).test(
      informationText(action),
    ) ||
    INFORMATION_UNACHIEVED.test(action) ||
    !new RegExp(`^${literal(story.subject)} connects `).test(informationText(check)) ||
    !connections ||
    INFORMATION_UNACHIEVED.test(check) ||
    !new RegExp(`^${literal(story.subject)} (?:reassembles|rejoins)(?: |$)`).test(
      informationText(story.outcome),
    ) ||
    INFORMATION_UNACHIEVED.test(story.outcome)
  )
    return mechanismIssue(
      ctx,
      'system-layers needs actual separation, named adjacent connections and reassembly for the same subject',
    );
  return { kind: 'system-layers', preset: raw.preset, ...story, layers };
}

export function parseSemanticSort(raw: Rec, ctx: ParseContext): SemanticSortScene | null {
  if (
    raw.preset !== 'topic-clusters' &&
    raw.preset !== 'closest-match' &&
    raw.preset !== 'skill-match'
  )
    return mechanismIssue(ctx, 'semantic-sort needs a known preset');
  const story = informationStory(raw, ctx);
  const targetEntries = informationEntries(raw.targets, ctx, 2, 3);
  const itemEntries = informationEntries(
    raw.items,
    ctx,
    raw.preset === 'closest-match' ? 1 : 2,
    raw.preset === 'closest-match' ? 1 : raw.preset === 'skill-match' ? 3 : 6,
  );
  if (!story || !targetEntries || !itemEntries) return null;
  const targets: SemanticSortScene['targets'] = [];
  for (const [index, entry] of targetEntries.entries()) {
    const label = informationLabel(entry.label, ctx);
    if (!label) return null;
    targets.push({ id: `target-${index}`, label });
  }
  const items: SemanticSortScene['items'] = [];
  for (const [index, entry] of itemEntries.entries()) {
    const label = informationLabel(entry.label, ctx);
    const evidence = informationEvidence(entry.evidence, ctx);
    if (!label || !evidence) return null;
    if (entry.target === null) {
      // The complete statement must not say the actor is no longer unmatched.
      if (
        !new RegExp(
          `^${literal(label)} (?:remains|stays|is) (?:unmatched|unpaired|ungrouped)$`,
        ).test(informationText(evidence.phrase))
      )
        return mechanismIssue(ctx, 'unpaired status must be literal, not negated or proposed');
      items.push({ id: `item-${index}`, label, targetId: null, evidence });
      continue;
    }
    if (
      typeof entry.target !== 'number' ||
      !Number.isInteger(entry.target) ||
      entry.target < 0 ||
      entry.target >= targets.length
    )
      return mechanismIssue(
        ctx,
        'sort target must be a validated zero-based target index or explicit null',
      );
    const target = targets[entry.target];
    const verb =
      raw.preset === 'topic-clusters'
        ? '(?:belongs to|groups with)'
        : raw.preset === 'closest-match'
          ? '(?:is closest to|most closely matches)'
          : '(?:matches|pairs with)';
    if (
      !informationRelation(
        evidence,
        [label, target.label],
        /\b(?:belongs|groups|closest|closely|matches|pairs)\b/i,
        ctx,
      ) ||
      !ordered(evidence.phrase, label, verb, target.label)
    )
      return mechanismIssue(
        ctx,
        'sort evidence must bind this item to this target, in that direction',
      );
    if (/\b(?:true|truth|correct|proof|proves?|caus\w*|guarantee\w*)\b/i.test(evidence.phrase))
      return mechanismIssue(
        ctx,
        'semantic similarity cannot establish truth, causation or guaranteed performance',
      );
    items.push({ id: `item-${index}`, label, targetId: target.id, evidence });
  }
  const matched = items.filter((item) => item.targetId !== null);
  if (
    !matched.length ||
    !informationDistinct(
      [...targets.map((target) => target.label), ...items.map((item) => item.label)],
      ctx,
    ) ||
    targets.some(
      (target) =>
        matched.filter((item) => item.targetId === target.id).length >
        (raw.preset === 'skill-match' ? 1 : 2),
    )
  )
    return mechanismIssue(
      ctx,
      'sort needs distinct actors, at least one source-supported pairing and bounded target capacity',
    );
  if (
    !/\b(?:grouped|similarity|paired|unpaired|matched|visible)\b/i.test(story.outcome) ||
    /\b(?:true|truth|correct|proof|proves?|caus\w*|guarantee\w*|completed|finished)\b/i.test(
      story.outcome,
    ) ||
    INFORMATION_UNACHIEVED.test(story.outcome)
  )
    return mechanismIssue(
      ctx,
      'sort outcome must remain grouping/pairing, not truth or completed work',
    );
  return { kind: 'semantic-sort', preset: raw.preset, ...story, targets, items };
}

export function parseInformationTransform(
  raw: Rec,
  ctx: ParseContext,
): InformationTransformScene | null {
  if (raw.preset !== 'structured-report' && raw.preset !== 'multimodal-fusion')
    return mechanismIssue(ctx, 'information-transform needs a known preset');
  const story = informationStory(raw, ctx);
  const resultLabel = informationLabel(raw.resultLabel, ctx);
  const entries = informationEntries(
    raw.inputs,
    ctx,
    raw.preset === 'multimodal-fusion' ? 3 : 2,
    3,
  );
  if (!story || !resultLabel || !entries) return null;
  const inputs: InformationTransformScene['inputs'] = [];
  for (const [index, entry] of entries.entries()) {
    const label = informationLabel(entry.label, ctx);
    const detail = informationLabel(entry.detail, ctx, 28);
    const field = informationLabel(entry.field, ctx);
    const evidence = informationEvidence(entry.evidence, ctx);
    if (
      !label ||
      !detail ||
      !field ||
      !evidence ||
      (entry.medium !== 'text' && entry.medium !== 'image' && entry.medium !== 'audio')
    )
      return mechanismIssue(
        ctx,
        'transform input needs bounded source/medium/detail/field and provenance evidence',
      );
    if (
      !informationRelation(
        evidence,
        [label, entry.medium, detail, field, resultLabel],
        /\bcontributes?\b/i,
        ctx,
      ) ||
      !new RegExp(
        `^${literal(label)} ${entry.medium} contributes ${literal(detail)} to ${literal(resultLabel)} under ${literal(field)}$`,
      ).test(informationText(evidence.phrase))
    )
      return mechanismIssue(
        ctx,
        'each detail must explicitly come from this input and contribute to this result field',
      );
    inputs.push({ id: `input-${index}`, label, medium: entry.medium, detail, field, evidence });
  }
  if (
    !informationDistinct(
      inputs.map((input) => input.label),
      ctx,
    ) ||
    !informationDistinct(
      inputs.map((input) => input.field),
      ctx,
    )
  )
    return null;
  if (
    raw.preset === 'multimodal-fusion'
      ? new Set(inputs.map((input) => input.medium)).size !== 3
      : inputs.some((input) => input.medium !== 'text')
  )
    return mechanismIssue(
      ctx,
      'multimodal-fusion requires text/image/audio; structured-report requires text inputs',
    );
  const check = technologyClause(ctx, raw.checkWord);
  if (
    !informationContains(check, resultLabel) ||
    !/\b(?:retains?|preserves?|traceable|attributed)\b/i.test(check) ||
    !/\b(?:sources?|origins?|provenance)\b/i.test(check) ||
    INFORMATION_UNACHIEVED.test(check) ||
    !informationContains(story.outcome, resultLabel) ||
    !/\b(?:retains?|preserves?)\b/i.test(story.outcome) ||
    !/\b(?:sources?|origins?|provenance)\b/i.test(story.outcome) ||
    INFORMATION_UNACHIEVED.test(story.outcome)
  )
    return mechanismIssue(
      ctx,
      'transformation must preserve attribution in the check and complete final statement',
    );
  return { kind: 'information-transform', preset: raw.preset, ...story, resultLabel, inputs };
}

const STORY =
  '"label":"source phrase ≤32","subject":"source subject ≤24","outcome":"complete final source sentence ≤40","setupWord":N,"actionWord":N,"responseWord":N,"checkWord":N,"resolveWord":N';
const EVIDENCE = '"evidence":{"fromWord":N,"toWord":N}';
const COMMON = {
  layouts: INFORMATION_LAYOUTS,
  durationSec: [5, 12] as const,
  cues: (scene: InformationScene): SceneCue[] => [
    { kind: 'flip', at: scene.actionAt, gain: 0.32 },
    { kind: 'tick', at: scene.responseAt, gain: 0.3 },
    { kind: 'tick', at: scene.checkAt, gain: 0.25 },
  ],
};
const LIMITS =
  'All strings quote source. Actor labels ≤22, details ≤28. Five source-word beats: gaps ≥0.6/1/1/1s, final hold ≥0.8s; 5–12s. Evidence indices cover one COMPLETE local sentence (≤32 words), binding each relationship, never unrelated nouns. Setup and final sentence name subject. Preserve complete condition ≤56 as condition if present. No probabilities, truth claims, invented results, arbitrary coordinates or assets. ';

export const CONCEPT_INFORMATION_SPECS = [
  {
    ...COMMON,
    kind: 'system-layers',
    family: 'framework',
    describe:
      'A recognizable organization/device separates into source-named functional layers, reveals their connections and reassembles the same parts.',
    schema: `{"kind":"system-layers","preset":"business-stack|device-stack","layers":[{"label":"source actor","role":"people|workflow|records|interface|compute|power",${EVIDENCE}}],${STORY}}`,
    limits: `${LIMITS}2–4 distinct layers, bottom to top. Each evidence states "LAYER is the ROLE layer of SUBJECT". Business roles people/workflow/records; device roles interface/compute/power/records. Action explicitly separates subject; check says SUBJECT connects LAYER0 to LAYER1 and LAYER1 to LAYER2, naming every adjacent connection in the supplied order; resolve reassembles subject.`,
    triggers: [
      /\b(?:business|organization|device|system)\b.{0,100}\b(?:layers|stack|separates)\b/,
      /\b(?:people|workflow|compute|power) layer of\b/,
    ],
    avoid:
      'Not a generic hierarchy, ranking, house cutaway, module replacement, or disconnected components. No functional layer inferred from noun presence.',
    parse: parseSystemLayers,
  },
  {
    ...COMMON,
    kind: 'semantic-sort',
    family: 'compare',
    describe:
      'Persistent documents cluster by topic, a query approaches its closest candidate, or task tickets pair with skill workstations. Unpaired actors and unselected candidates stay visible. Similarity is not truth; pairing is not task completion.',
    schema: `{"kind":"semantic-sort","preset":"topic-clusters|closest-match|skill-match","targets":[{"label":"source target"},{"label":"source target"}],"items":[{"label":"source item","target":0,${EVIDENCE}},{"label":"unpaired item","target":null,${EVIDENCE}}],${STORY}}`,
    limits: `${LIMITS}2–3 targets. Topic: 2–6 items, max 2 per target, "ITEM belongs to TARGET" or "ITEM groups with TARGET". Closest: exactly 1 query, "QUERY is closest to CANDIDATE" (or most closely matches), no ranking scores. Skill: 2–3 tasks, max 1 per skill, "TASK matches SKILL"/"pairs with". Explicit null needs complete "ITEM remains unmatched/unpaired/ungrouped". At least one pairing. Outcome describes grouped/paired/matched/visible state.`,
    triggers: [
      /\b(?:documents?|topics?|meaning)\b.{0,90}\b(?:cluster|group|sort)/,
      /\b(?:query|document)\b.{0,90}\b(?:closest|similarity|matches)/,
      /\b(?:tasks?|skills?)\b.{0,90}\b(?:matches|pairs with|unmatched)\b/,
    ],
    avoid:
      'Not proof, causation, a vector score, training accuracy, agent-team assignment/completion, or expert activation architecture. Do not hide unmatched actors.',
    parse: parseSemanticSort,
  },
  {
    ...COMMON,
    kind: 'information-transform',
    family: 'process',
    describe:
      'Source fragments leave recognizable text/image/audio carriers and assemble a sectioned report or combined interpretation. The representation changes and origins stay traceable, not a document moved to a tray.',
    schema: `{"kind":"information-transform","preset":"structured-report|multimodal-fusion","resultLabel":"source result","inputs":[{"label":"source input","medium":"text|image|audio","detail":"exact contributed phrase","field":"source result section",${EVIDENCE}}],${STORY}}`,
    limits: `${LIMITS}Structured: 2–3 text sources. Multimodal: exactly text+image+audio. Distinct source/field labels. Each sentence "INPUT MEDIUM contributes DETAIL to RESULT under FIELD". Check and final sentence explicitly state RESULT retains/preserves sources/origins/provenance; no invented facts or truth certification.`,
    triggers: [
      /\b(?:sources?|notes|text)\b.{0,100}\b(?:structured report|synthesi|contributes|combines)/,
      /\b(?:text|image)\b.{0,100}\baudio\b.{0,100}\b(?:combine|fusion|interpretation)/,
      /\b(?:text|image|audio) contributes\b/,
    ],
    avoid:
      'Not retrieval, a source-count badge, an unchanged document moving containers, invented summary facts, or text-only material dressed up as multimodal.',
    parse: parseInformationTransform,
  },
] satisfies AnyKindSpec[];
