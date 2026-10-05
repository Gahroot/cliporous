import { findLongformPalette } from '@shared/longform-palette';
import {
  longformLayersMayOverlap,
  longformRangesOverlap,
  MAX_LONGFORM_BLOCK_SECONDS,
  removeLongformPlanRangeConflicts,
  resolveLongformPlanOverlaps,
} from '@shared/longform-plan-timing';
import {
  isLongformPresentation,
  isSceneFirstLongformPlan,
  isSceneFirstPlanEnvelope,
  LONGFORM_PHRASE_LIMITS,
  type LongformPresentation,
  type LongformScenePlacement,
  longformPhraseFrameWindow,
  longformPhraseProblem,
  longformSourceFingerprint,
  partitionLongformPhrases,
  sceneFirstPlanProblem,
  scheduleLongformScenes,
} from '@shared/longform-scenes';
import type { Palette } from '@shared/palettes';
import { DEFAULT_STORYBOARD_STYLE, type StoryboardStyle } from '@shared/storyboards';
import type {
  BlockPlacement,
  DelosCardPlacement,
  LongformEditPlan,
  LongformPlanItemType,
  LongformSkinId,
  PhraseEmphasis,
  WordTimestamp,
} from '@shared/types';

export interface LongformAppearanceSnapshot {
  skin: LongformSkinId;
  paletteId: string;
  palette: Palette;
  storyboardStyle: StoryboardStyle;
}

/** Call before the first await, never on completion: colors are content, not a library reference. */
export function captureLongformAppearance(
  appearance: {
    skin: LongformSkinId;
    paletteId: string;
    palette?: Palette;
    storyboardStyle?: StoryboardStyle;
  },
  customPalettes: readonly Palette[],
): LongformAppearanceSnapshot {
  const palette =
    appearance.palette?.id === appearance.paletteId
      ? appearance.palette
      : findLongformPalette(appearance.paletteId, [...customPalettes]);
  if (!palette)
    throw new Error('Selected palette is unavailable. Choose a palette before generating.');
  return {
    skin: appearance.skin,
    paletteId: appearance.paletteId,
    palette: structuredClone(palette),
    storyboardStyle: appearance.storyboardStyle ?? DEFAULT_STORYBOARD_STYLE,
  };
}

/** Scene mutations use persisted IDs, never array positions. */
export interface LongformPlanItemRef {
  type: LongformPlanItemType;
  index?: number;
  id?: string;
}

export interface LongformPlanItemView extends LongformPlanItemRef {
  key: string;
  index: number;
  startTime: number;
  endTime: number;
  title: string;
  detail: string;
  kind: string;
  sourceText: string;
  scene?: LongformScenePlacement;
}

export interface LongformPlanSection {
  id: string;
  index: number;
  title: string;
  startTime: number;
  endTime: number;
  items: LongformPlanItemView[];
  sourceText: string;
  status?: 'planned' | 'empty' | 'failed';
  diagnostics?: string[];
}

export interface LongformPlanItemUpdate {
  title?: string;
  detail?: string;
  startTime?: number;
  endTime?: number;
  presentation?: LongformPresentation;
  omitted?: boolean;
}

export interface LongformPlanDiff {
  added: number;
  removed: number;
  unchanged: number;
  timingChanges: number;
  contentChanges: number;
}

export type PreservedLongformItem =
  | { key: string; type: 'scene'; item: LongformScenePlacement }
  | {
      key: string;
      type: 'phrase' | 'block' | 'card';
      item: PhraseEmphasis | BlockPlacement | DelosCardPlacement;
    };

const SECTION_TARGET_SECONDS = 90;
const SECTION_BREAK_SECONDS = 42;

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function humanizeLongformKind(value: string): string {
  return value
    .replace(/delos-/g, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function transcriptExcerpt(
  words: readonly WordTimestamp[],
  startTime: number,
  endTime: number,
  paddingSeconds = 2,
): string {
  const excerpt = words
    .filter(
      (word) => word.end >= startTime - paddingSeconds && word.start <= endTime + paddingSeconds,
    )
    .map((word) => word.text)
    .join(' ')
    .trim();
  if (excerpt.length <= 240) return excerpt;
  return `${excerpt.slice(0, 237).trimEnd()}…`;
}

export function longformItemKey(
  type: LongformPlanItemType,
  item: PhraseEmphasis | BlockPlacement | DelosCardPlacement | LongformScenePlacement,
): string {
  if (type === 'scene' && 'id' in item) return item.id;
  const text =
    type === 'phrase'
      ? (item as PhraseEmphasis).text
      : type === 'block'
        ? `${(item as BlockPlacement).kind}:${(item as BlockPlacement).heading ?? ''}`
        : `${(item as DelosCardPlacement).kind}:${(item as DelosCardPlacement).sourceText ?? ''}`;
  return `${type}:${item.startTime.toFixed(2)}:${item.endTime.toFixed(2)}:${text.slice(0, 80)}`;
}

export function isScenePlanForReview(plan: LongformEditPlan): boolean {
  return (
    (plan.schemaVersion !== undefined && plan.schemaVersion !== 1) ||
    (plan.mode !== undefined && plan.mode !== 'legacy')
  );
}

function phraseItemViews(
  phrases: readonly PhraseEmphasis[],
  words: readonly WordTimestamp[],
): LongformPlanItemView[] {
  return phrases.map<LongformPlanItemView>((item, index) => ({
    type: 'phrase',
    index,
    key: longformItemKey('phrase', item),
    startTime: item.startTime,
    endTime: item.endTime,
    title: item.text,
    detail: 'Spoken phrase emphasized over the speaker',
    kind: 'Phrase overlay',
    sourceText: transcriptExcerpt(words, item.startTime, item.endTime),
  }));
}

/**
 * Text overlays on a scene-first plan. Kept apart from the scene list, whose counts,
 * workspace and approval copy mean explanation scenes only. Legacy plans return [] here
 * because their phrases are already part of `buildLongformPlanItems`.
 */
export function buildLongformPhraseItems(
  plan: LongformEditPlan,
  words: readonly WordTimestamp[],
): LongformPlanItemView[] {
  if (!isSceneFirstPlanEnvelope(plan)) return [];
  return phraseItemViews(plan.phrases, words).sort(
    (left, right) => left.startTime - right.startTime || left.endTime - right.endTime,
  );
}

/** Phrases the export will skip, keyed by item key: they overlap an included scene or phrase. */
export function longformPhraseIssues(plan: LongformEditPlan): Map<string, string> {
  if (!isSceneFirstPlanEnvelope(plan)) return new Map();
  return new Map(
    partitionLongformPhrases(plan.phrases, plan.scenes, plan.sourceDuration).dropped.map(
      ({ phrase, reason }) => [longformItemKey('phrase', phrase), reason],
    ),
  );
}

export function buildLongformPlanItems(
  plan: LongformEditPlan,
  words: readonly WordTimestamp[],
): LongformPlanItemView[] {
  if (isScenePlanForReview(plan)) {
    if (!isSceneFirstPlanEnvelope(plan)) return [];
    return plan.scenes
      .map(
        (scene, index): LongformPlanItemView => ({
          type: 'scene',
          id: scene.id,
          index,
          key: scene.id,
          startTime: scene.startTime,
          endTime: scene.endTime,
          title: scene.label || humanizeLongformKind(scene.kind),
          detail: scene.purpose,
          kind: humanizeLongformKind(scene.kind),
          sourceText: words
            .slice(scene.startWord, scene.endWord + 1)
            .map((word) => word.text)
            .join(' '),
          scene,
        }),
      )
      .sort((left, right) => left.startTime - right.startTime || left.key.localeCompare(right.key));
  }
  const phrases = phraseItemViews(plan.phrases, words);
  const blocks = plan.blocks.map<LongformPlanItemView>((item, index) => ({
    type: 'block',
    index,
    key: longformItemKey('block', item),
    startTime: item.startTime,
    endTime: item.endTime,
    title: item.heading || humanizeLongformKind(item.kind),
    detail: item.kicker || 'Full-frame evidence graphic',
    kind: humanizeLongformKind(item.kind),
    sourceText: transcriptExcerpt(words, item.startTime, item.endTime),
  }));
  const cards = (plan.cards ?? []).map<LongformPlanItemView>((item, index) => ({
    type: 'card',
    index,
    key: longformItemKey('card', item),
    startTime: item.startTime,
    endTime: item.endTime,
    title: item.sourceText?.trim() || humanizeLongformKind(item.kind),
    detail: 'Evidence card over the speaker',
    kind: humanizeLongformKind(item.kind),
    sourceText: item.sourceText?.trim() || transcriptExcerpt(words, item.startTime, item.endTime),
  }));
  return [...phrases, ...blocks, ...cards].sort(
    (left, right) => left.startTime - right.startTime || left.endTime - right.endTime,
  );
}

function sectionTitle(index: number, items: readonly LongformPlanItemView[]): string {
  if (index === 0) return 'Opening';
  const anchor = items.find((item) => item.type === 'block') ?? items[0];
  if (!anchor) return `Section ${index + 1}`;
  const title = anchor.title.trim();
  return title.length > 44 ? `${title.slice(0, 41).trimEnd()}…` : title;
}

export function buildLongformSections(
  plan: LongformEditPlan,
  words: readonly WordTimestamp[],
  duration: number,
): LongformPlanSection[] {
  const items = buildLongformPlanItems(plan, words);
  if (isScenePlanForReview(plan)) {
    if (!isSceneFirstPlanEnvelope(plan)) return [];
    const sections: LongformPlanSection[] = plan.sections.map((section, index) => ({
      ...section,
      index,
      title: `Section ${index + 1}`,
      sourceText: words
        .slice(section.startWord, section.endWord + 1)
        .map((word) => word.text)
        .join(' '),
      items: items.filter((item) => item.scene?.sectionId === section.id),
    }));
    const unassigned = items.filter(
      (item) => !plan.sections.some((section) => section.id === item.scene?.sectionId),
    );
    if (unassigned.length > 0)
      sections.push({
        id: 'unassigned-scenes',
        index: sections.length,
        title: 'Scenes without a section',
        startTime: unassigned[0]?.startTime ?? 0,
        endTime: Math.max(...unassigned.map((item) => item.endTime)),
        sourceText: '',
        items: unassigned,
      });
    return sections;
  }
  if (items.length === 0) {
    return [
      {
        id: 'section-0',
        index: 0,
        title: 'Speaker cut',
        startTime: 0,
        endTime: Math.max(0, duration),
        items: [],
        sourceText: transcriptExcerpt(words, 0, duration, 0),
      },
    ];
  }

  const groups: LongformPlanItemView[][] = [];
  let current: LongformPlanItemView[] = [];
  let sectionStart = items[0]?.startTime ?? 0;
  let previousEnd = sectionStart;

  for (const item of items) {
    const exceedsTarget =
      current.length > 0 && item.startTime - sectionStart >= SECTION_TARGET_SECONDS;
    const followsLongGap =
      current.length > 0 && item.startTime - previousEnd >= SECTION_BREAK_SECONDS;
    if (exceedsTarget || followsLongGap) {
      groups.push(current);
      current = [];
      sectionStart = item.startTime;
    }
    current.push(item);
    previousEnd = Math.max(previousEnd, item.endTime);
  }
  if (current.length > 0) groups.push(current);

  return groups.map((sectionItems, index) => {
    const previous = groups[index - 1];
    const next = groups[index + 1];
    const first = sectionItems[0];
    const last = sectionItems.at(-1);
    const previousEndTime = previous?.at(-1)?.endTime ?? 0;
    const nextStartTime = next?.[0]?.startTime ?? duration;
    const startTime = index === 0 ? 0 : Math.max(previousEndTime, first?.startTime ?? 0);
    const endTime =
      index === groups.length - 1 ? duration : Math.min(nextStartTime, last?.endTime ?? duration);
    return {
      id: `section-${index}`,
      index,
      title: sectionTitle(index, sectionItems),
      startTime,
      endTime: Math.max(startTime, endTime),
      items: sectionItems,
      sourceText: transcriptExcerpt(words, startTime, Math.max(startTime, endTime), 0),
    };
  });
}

export function longformSceneReviewProblem(
  plan: LongformEditPlan,
  words: readonly WordTimestamp[],
  duration: number,
): string | null {
  if (!isScenePlanForReview(plan)) return null;
  const problem = sceneFirstPlanProblem(plan);
  if (problem) return problem;
  if (!isSceneFirstLongformPlan(plan)) return 'Unsupported scene plan. Regenerate a new draft.';
  if (words.length === 0)
    return 'Transcript unavailable. Restore the source transcript before previewing or approving scenes.';
  if (plan.sourceFingerprint !== longformSourceFingerprint(words, duration)) {
    return 'This scene plan is stale: the source duration or transcript changed. Regenerate against the current source; saved versions are kept.';
  }
  return null;
}

export function longformSceneScheduleIssues(plan: LongformEditPlan): Map<string, string> {
  return new Map(
    isSceneFirstPlanEnvelope(plan)
      ? scheduleLongformScenes(plan.scenes, plan.sourceDuration).rejected.map((issue) => [
          issue.id,
          issue.reason,
        ])
      : [],
  );
}

export function estimateLongformRenderSeconds(plan: LongformEditPlan, duration: number): number {
  if (isScenePlanForReview(plan) && !isSceneFirstPlanEnvelope(plan)) return 0;
  const visualComplexity = isSceneFirstLongformPlan(plan)
    ? plan.scenes.filter((scene) => !scene.omitted).length * 18 + plan.phrases.length * 3
    : plan.blocks.length * 12 + plan.phrases.length * 3 + (plan.cards?.length ?? 0) * 4;
  return Math.max(30, Math.round(duration * 1.25 + visualComplexity));
}

function clonePlan(plan: LongformEditPlan): LongformEditPlan {
  return structuredClone(plan);
}

function scenePlanPhraseEditProblem(
  plan: LongformEditPlan,
  item: LongformPlanItemView,
  update: LongformPlanItemUpdate,
): string | null {
  if (!isSceneFirstPlanEnvelope(plan) || item.type !== 'phrase') return null;
  const edited: PhraseEmphasis = {
    ...(plan.phrases[item.index] ?? { text: item.title }),
    text: (update.title ?? item.title).trim(),
    startTime: update.startTime ?? item.startTime,
    endTime: update.endTime ?? item.endTime,
  };
  const problem = longformPhraseProblem(edited, plan.sourceDuration);
  if (problem)
    return `${problem} Phrases are up to ${LONGFORM_PHRASE_LIMITS.maxTextLength} characters and ${LONGFORM_PHRASE_LIMITS.maxSeconds} seconds, inside the source.`;
  const frames = longformPhraseFrameWindow(edited);
  const scene = plan.scenes.find(
    (candidate) =>
      !candidate.omitted &&
      frames.startFrame < Math.ceil(candidate.endTime * 30 - 1e-6) &&
      Math.floor(candidate.startTime * 30 + 1e-6) < frames.endFrame,
  );
  if (scene)
    return 'Phrase text appears only over the full-screen speaker. Move it outside the scene, or omit the scene first.';
  const other = plan.phrases.find((candidate, index) => {
    if (index === item.index) return false;
    const window = longformPhraseFrameWindow(candidate);
    return frames.startFrame < window.endFrame && window.startFrame < frames.endFrame;
  });
  if (other) return `Overlaps the phrase "${other.text}". Move or remove one of them.`;
  return null;
}

export function longformItemEditProblem(
  item: LongformPlanItemView,
  update: LongformPlanItemUpdate,
  plan?: LongformEditPlan,
): string | null {
  if (plan) {
    const phraseProblem = scenePlanPhraseEditProblem(plan, item, update);
    if (phraseProblem) return phraseProblem;
  }
  if (item.scene?.kind !== 'storyboard') return null;
  if (
    (update.startTime !== undefined && update.startTime !== item.startTime) ||
    (update.endTime !== undefined && update.endTime !== item.endTime)
  )
    return 'Source-indexed beats need their complete authored window. Use feedback to request timing changes; no timing was changed.';
  if (
    item.scene.kind === 'storyboard' &&
    update.presentation !== undefined &&
    update.presentation !== 'full-frame'
  )
    return 'Continuous storyboards require full-screen presentation. Speaker layouts remain available for ordinary scenes.';
  return null;
}

export interface StoryboardPanelSummary {
  id: string;
  kind: string;
  title: string;
  beats: string[];
}
/** Read-only summary, not an alternate parser: unsupported stored payloads remain recoverable. */
export function storyboardPanelSummary(
  scene: LongformScenePlacement,
  words: readonly WordTimestamp[],
): StoryboardPanelSummary[] {
  if (scene.kind !== 'storyboard' || !Array.isArray(scene.sourceSpec.panels)) return [];
  const at = (word: unknown): string =>
    typeof word === 'number' && words[word] ? formatTimecode(words[word].start) : 'unavailable';
  return scene.sourceSpec.panels.flatMap((panel, index) => {
    if (!panel || typeof panel !== 'object' || Array.isArray(panel)) return [];
    const title = panel.title;
    const prop = panel.prop;
    const beats = [`Reveal ${at(panel.revealWord)}`, `Camera move ${at(panel.moveWord)}`];
    if (prop && typeof prop === 'object' && !Array.isArray(prop))
      beats.push(
        `${typeof prop.model === 'string' ? humanizeLongformKind(prop.model) : 'Prop'} · ${typeof prop.action === 'string' ? prop.action : 'action'} ${at(prop.atWord)}`,
      );
    return [
      {
        id: typeof panel.id === 'string' ? panel.id : String(index),
        kind:
          typeof panel.kind === 'string' ? humanizeLongformKind(panel.kind) : 'Unsupported panel',
        title:
          title &&
          typeof title === 'object' &&
          !Array.isArray(title) &&
          typeof title.text === 'string'
            ? title.text
            : 'Untitled panel',
        beats,
      },
    ];
  });
}

export function updateLongformPlanItem(
  plan: LongformEditPlan,
  ref: LongformPlanItemRef,
  update: LongformPlanItemUpdate,
): LongformEditPlan {
  if (isScenePlanForReview(plan) && !isSceneFirstPlanEnvelope(plan)) return plan;
  if (isSceneFirstLongformPlan(plan)) {
    if (ref.type === 'phrase') {
      const original = ref.index === undefined ? undefined : plan.phrases[ref.index];
      if (
        !original ||
        ref.index === undefined ||
        update.title === undefined ||
        update.startTime === undefined ||
        update.endTime === undefined
      )
        return plan;
      const view = phraseItemViews([original], [])[0];
      if (!view || scenePlanPhraseEditProblem(plan, { ...view, index: ref.index }, update))
        return plan;
      const next = clonePlan(plan);
      if (!isSceneFirstLongformPlan(next)) return plan;
      next.phrases[ref.index] = {
        ...original,
        text: update.title.trim(),
        startTime: update.startTime,
        endTime: update.endTime,
      };
      next.generatedAt = Date.now();
      return next;
    }
    if (ref.type !== 'scene' || !plan.scenes.some((scene) => scene.id === ref.id)) return plan;
    const original = buildLongformPlanItems(plan, []).find((item) => item.key === ref.id);
    if (original && longformItemEditProblem(original, update)) return plan;
    const next = clonePlan(plan);
    if (!isSceneFirstLongformPlan(next)) return plan;
    const scene = next.scenes.find((candidate) => candidate.id === ref.id);
    if (!scene) return plan;
    // Source-indexed specs and their complete authored windows are immutable here.
    if (isLongformPresentation(update.presentation)) scene.presentation = update.presentation;
    if (update.omitted !== undefined) scene.omitted = update.omitted;
    return next;
  }
  if (
    ref.type === 'scene' ||
    ref.index === undefined ||
    update.title === undefined ||
    update.startTime === undefined ||
    update.endTime === undefined
  )
    return plan;
  const next = clonePlan(plan);
  const startTime = Math.max(0, update.startTime);
  const requestedEndTime = Math.max(startTime + 0.2, update.endTime);
  const endTime =
    ref.type === 'block'
      ? Math.min(requestedEndTime, startTime + MAX_LONGFORM_BLOCK_SECONDS)
      : requestedEndTime;
  let editedItem: PhraseEmphasis | BlockPlacement | DelosCardPlacement | undefined;
  if (ref.type === 'phrase') {
    const item = next.phrases[ref.index];
    if (item) {
      Object.assign(item, { text: update.title.trim(), startTime, endTime });
      editedItem = item;
    }
  } else if (ref.type === 'block') {
    const item = next.blocks[ref.index];
    if (item) {
      Object.assign(item, {
        heading: update.title.trim(),
        kicker: update.detail?.trim() || item.kicker,
        startTime,
        endTime,
      });
      editedItem = item;
    }
  } else {
    const item = next.cards?.[ref.index];
    if (item) {
      Object.assign(item, { sourceText: update.title.trim(), startTime, endTime });
      editedItem = item;
    }
  }
  next.generatedAt = Date.now();
  return editedItem
    ? removeLongformPlanRangeConflicts(next, editedItem, { type: ref.type, index: ref.index })
    : next;
}

export function removeLongformPlanItem(
  plan: LongformEditPlan,
  ref: LongformPlanItemRef,
): LongformEditPlan {
  if (ref.type === 'scene') return updateLongformPlanItem(plan, ref, { omitted: true });
  if (isSceneFirstLongformPlan(plan) && ref.type === 'phrase' && ref.index !== undefined) {
    if (!plan.phrases[ref.index]) return plan;
    const next = clonePlan(plan);
    next.phrases.splice(ref.index, 1);
    next.generatedAt = Date.now();
    return next;
  }
  if (isScenePlanForReview(plan) || ref.index === undefined) return plan;
  const next = clonePlan(plan);
  if (ref.type === 'phrase') next.phrases.splice(ref.index, 1);
  else if (ref.type === 'block') next.blocks.splice(ref.index, 1);
  else next.cards?.splice(ref.index, 1);
  next.generatedAt = Date.now();
  return next;
}

function nearSameSlot(
  candidate: PhraseEmphasis | BlockPlacement | DelosCardPlacement,
  preserved: PhraseEmphasis | BlockPlacement | DelosCardPlacement,
): boolean {
  return Math.abs(candidate.startTime - preserved.startTime) <= 8;
}

export function mergePreservedLongformItems(
  generated: LongformEditPlan,
  preservedItems: readonly PreservedLongformItem[],
): LongformEditPlan {
  if (isScenePlanForReview(generated) && !isSceneFirstPlanEnvelope(generated)) return generated;
  if (isSceneFirstLongformPlan(generated)) {
    const next = structuredClone(generated);
    // Preserved phrase text wins its slot; the scene schedule below decides what may show.
    for (const saved of preservedItems) {
      if (saved.type !== 'phrase') continue;
      const phrase = structuredClone(saved.item as PhraseEmphasis);
      next.phrases = next.phrases.filter(
        (candidate) => !longformRangesOverlap(candidate, phrase) && candidate.text !== phrase.text,
      );
      next.phrases.push(phrase);
    }
    for (const saved of preservedItems) {
      if (saved.type !== 'scene') continue;
      const scene = structuredClone(saved.item);
      const existing = next.scenes.findIndex((candidate) => candidate.id === scene.id);
      if (existing >= 0) next.scenes[existing] = scene;
      else next.scenes.push(scene);
    }
    next.scenes.sort(
      (left, right) => left.startTime - right.startTime || left.id.localeCompare(right.id),
    );
    next.phrases = partitionLongformPhrases(next.phrases, next.scenes, next.sourceDuration).kept;
    return next;
  }
  let next = resolveLongformPlanOverlaps(clonePlan(generated));
  const acceptedPreserved: Exclude<PreservedLongformItem, { type: 'scene' }>[] = [];
  const chronological = [...preservedItems].sort(
    (left, right) => left.item.startTime - right.item.startTime,
  );

  for (const preserved of chronological) {
    if (preserved.type === 'scene') continue;
    const item = structuredClone(preserved.item);
    if (
      acceptedPreserved.some(
        (candidate) =>
          !longformLayersMayOverlap(candidate.type, preserved.type) &&
          longformRangesOverlap(candidate.item, item),
      )
    ) {
      continue;
    }

    if (preserved.type === 'phrase') {
      next.phrases = next.phrases.filter((candidate) => !nearSameSlot(candidate, item));
    } else if (preserved.type === 'block') {
      next.blocks = next.blocks.filter((candidate) => !nearSameSlot(candidate, item));
    } else {
      next.cards = (next.cards ?? []).filter((candidate) => !nearSameSlot(candidate, item));
    }
    next = removeLongformPlanRangeConflicts(next, item, undefined, preserved.type);

    if (preserved.type === 'phrase') next.phrases.push(item as PhraseEmphasis);
    else if (preserved.type === 'block') next.blocks.push(item as BlockPlacement);
    else {
      next.cards ??= [];
      next.cards.push(item as DelosCardPlacement);
    }
    acceptedPreserved.push({ key: preserved.key, type: preserved.type, item });
  }

  return resolveLongformPlanOverlaps(next);
}

function comparableKey(item: LongformPlanItemView): string {
  return item.type === 'scene'
    ? `scene:${item.id}`
    : `${item.type}:${item.kind}:${item.title.toLocaleLowerCase()}`;
}

export function compareLongformPlans(
  left: LongformEditPlan,
  right: LongformEditPlan,
): LongformPlanDiff {
  const leftItems = [...buildLongformPlanItems(left, []), ...buildLongformPhraseItems(left, [])];
  const rightItems = [...buildLongformPlanItems(right, []), ...buildLongformPhraseItems(right, [])];
  const leftMap = new Map(leftItems.map((item) => [comparableKey(item), item]));
  const rightMap = new Map(rightItems.map((item) => [comparableKey(item), item]));
  let unchanged = 0;
  let timingChanges = 0;
  let contentChanges = 0;
  for (const [key, leftItem] of Array.from(leftMap.entries())) {
    const rightItem = rightMap.get(key);
    if (!rightItem) continue;
    if (
      leftItem.scene &&
      rightItem.scene &&
      JSON.stringify(leftItem.scene) !== JSON.stringify(rightItem.scene)
    ) {
      contentChanges += 1;
    } else {
      unchanged += 1;
    }
    if (
      Math.abs(leftItem.startTime - rightItem.startTime) > 0.05 ||
      Math.abs(leftItem.endTime - rightItem.endTime) > 0.05
    ) {
      timingChanges += 1;
    }
  }
  return {
    added: Array.from(rightMap.keys()).filter((key) => !leftMap.has(key)).length,
    removed: Array.from(leftMap.keys()).filter((key) => !rightMap.has(key)).length,
    unchanged,
    timingChanges,
    contentChanges,
  };
}

export function snapshotLongformPlanItem(
  plan: LongformEditPlan,
  ref: LongformPlanItemRef,
): PreservedLongformItem | null {
  const raw = planItemFromRef(plan, ref);
  if (!raw) return null;
  if ('sourceSpec' in raw) return { key: raw.id, type: 'scene', item: structuredClone(raw) };
  if (ref.type === 'scene') return null;
  return { key: longformItemKey(ref.type, raw), type: ref.type, item: structuredClone(raw) };
}

export function planItemFromRef(
  plan: LongformEditPlan,
  ref: LongformPlanItemRef,
): PhraseEmphasis | BlockPlacement | DelosCardPlacement | LongformScenePlacement | null {
  if (isScenePlanForReview(plan) && !isSceneFirstPlanEnvelope(plan)) return null;
  if (isSceneFirstLongformPlan(plan)) {
    if (ref.type === 'phrase' && ref.index !== undefined) return plan.phrases[ref.index] ?? null;
    return ref.type === 'scene' ? (plan.scenes.find((scene) => scene.id === ref.id) ?? null) : null;
  }
  if (ref.type === 'scene' || ref.index === undefined) return null;
  if (ref.type === 'phrase') return plan.phrases[ref.index] ?? null;
  if (ref.type === 'block') return plan.blocks[ref.index] ?? null;
  return plan.cards?.[ref.index] ?? null;
}
