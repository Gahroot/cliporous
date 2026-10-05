import type { Palette } from './palettes';
import { isStoryboardStyle, STORYBOARD_LIMITS, type StoryboardStyle } from './storyboards';
import type { LongformEditPlan, PhraseEmphasis, WordTimestamp } from './types';

export const LONGFORM_SCENE_SCHEMA_VERSION = 2 as const;
export const LONGFORM_SCENE_PARSER_VERSION = 3 as const;
export const LONGFORM_PRESENTATIONS = ['speaker-side', 'speaker-pip', 'full-frame'] as const;
export type LongformPresentation = (typeof LONGFORM_PRESENTATIONS)[number];
export const LONGFORM_PRESENTATION_LABELS: Record<LongformPresentation, string> = {
  'speaker-side': 'Speaker beside explanation',
  'speaker-pip': 'Explanation with speaker inset',
  'full-frame': 'Full-screen explanation',
};

export type LongformJson =
  | null
  | boolean
  | number
  | string
  | LongformJson[]
  | {
      [key: string]: LongformJson;
    };

/** Source specifications use the existing allowlisted, word-indexed scene vocabulary. */
export interface LongformScenePlacement {
  id: string;
  kind: string;
  startWord: number;
  endWord: number;
  startTime: number;
  endTime: number;
  sectionId: string;
  presentation: LongformPresentation;
  sourceSpec: Record<string, LongformJson>;
  label: string;
  purpose: string;
  omitted?: boolean;
}

export interface LongformPlanningSection {
  id: string;
  startWord: number;
  endWord: number;
  startTime: number;
  endTime: number;
  status: 'planned' | 'empty' | 'failed';
  diagnostics: string[];
}

export interface LongformScenePlanFields {
  schemaVersion: 2;
  mode: 'scene-first';
  parserVersion: 1 | 2 | 3;
  /** Required for parsers 2/3; never inserted into historical parser-1 plans. */
  storyboardStyle?: StoryboardStyle;
  sourceFingerprint: string;
  sourceDuration: number;
  scenes: LongformScenePlacement[];
  sections: LongformPlanningSection[];
}

export type SceneFirstLongformPlan = LongformEditPlan & LongformScenePlanFields;

export interface LongformGenerationRequest {
  requestId?: string;
  apiKey: string;
  words: WordTimestamp[];
  videoDuration: number;
  feedback?: string[];
  mode?: 'scene-first' | 'legacy';
  storyboardStyle?: StoryboardStyle;
  previousPlan?: LongformEditPlan;
  preservedSceneIds?: string[];
  sectionIds?: string[];
}

export interface LongformPlanningProgress {
  requestId?: string;
  window: number;
  total: number;
  sectionId?: string;
  outcome?: LongformPlanningSection['status'];
}

export interface LongformScenePreviewRequest {
  requestId: string;
  sourceVideoPath: string;
  wordTimestamps: WordTimestamp[];
  plan: SceneFirstLongformPlan;
  sceneId: string;
  paletteId?: string;
  customPalettes?: Palette[];
  /** Match export's existing default-on scene sound cues. */
  sceneSfxEnabled?: boolean;
}

export interface LongformSceneRenderResult {
  id: string;
  kind: string;
  startTime: number;
  endTime: number;
  status: 'rendered' | 'omitted' | 'failed';
  reason?: string;
}

export const LONGFORM_SCENE_LIMITS = {
  maxWords: 250_000,
  maxScenes: 2_000,
  maxSections: 1_000,
  maxSpecBytes: 32_768,
  maxDuration: 86_400,
} as const;

/** Phrase text overlays shown over the uninterrupted full-screen speaker between scenes. */
export const LONGFORM_PHRASE_LIMITS = {
  maxPhrases: 2_000,
  maxTextLength: 80,
  /** The overlay composition never renders shorter than this (see phrase-emphasis feature). */
  minVisibleSeconds: 0.4,
  maxSeconds: 8,
} as const;

const FPS = 30;

/** Validates one stored phrase overlay; scene-first plans persist only this shape. */
export function longformPhraseProblem(value: unknown, duration: number): string | null {
  if (!isRecord(value)) return 'Phrase overlay must be an object.';
  const { text, startTime, endTime, accentColor } = value;
  if (
    typeof text !== 'string' ||
    !text.trim() ||
    text.length > LONGFORM_PHRASE_LIMITS.maxTextLength
  )
    return 'Phrase overlay text is empty or too long.';
  if (
    typeof startTime !== 'number' ||
    typeof endTime !== 'number' ||
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    startTime < 0 ||
    endTime <= startTime ||
    endTime > duration ||
    endTime - startTime > LONGFORM_PHRASE_LIMITS.maxSeconds
  )
    return 'Phrase overlay timing is outside the source window.';
  if (
    accentColor !== undefined &&
    (typeof accentColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(accentColor))
  )
    return 'Phrase overlay colour is invalid.';
  return null;
}

/** Exact frames a phrase occupies on screen, including the overlay's minimum duration. */
export function longformPhraseFrameWindow(phrase: Pick<PhraseEmphasis, 'startTime' | 'endTime'>): {
  startFrame: number;
  endFrame: number;
} {
  const visibleEnd = Math.max(
    phrase.endTime,
    phrase.startTime + LONGFORM_PHRASE_LIMITS.minVisibleSeconds,
  );
  return {
    startFrame: Math.floor(phrase.startTime * FPS + 1e-6),
    endFrame: Math.ceil(visibleEnd * FPS - 1e-6),
  };
}

export interface LongformPhrasePartition {
  kept: PhraseEmphasis[];
  dropped: { phrase: PhraseEmphasis; reason: string }[];
}

/**
 * Phrase text belongs only on the full-screen speaker: every non-omitted scene window
 * (side-by-side, inset, full-frame and storyboards alike) is off limits, and phrases never
 * stack on each other. Same outward 30fps quantization as the scene scheduler/timeline.
 */
export function partitionLongformPhrases(
  phrases: readonly PhraseEmphasis[],
  scenes: readonly LongformScenePlacement[],
  duration: number,
): LongformPhrasePartition {
  const sceneFrames = scenes
    .filter((scene) => !scene.omitted)
    .map((scene) => ({
      id: scene.id,
      startFrame: Math.floor(scene.startTime * FPS + 1e-6),
      endFrame: Math.ceil(scene.endTime * FPS - 1e-6),
    }));
  const totalFrames = Math.ceil(duration * FPS - 1e-6);
  const kept: PhraseEmphasis[] = [];
  const dropped: LongformPhrasePartition['dropped'] = [];
  let previousEnd = -1;
  const ordered = [...phrases].sort(
    (a, b) => a.startTime - b.startTime || a.endTime - b.endTime || a.text.localeCompare(b.text),
  );
  for (const phrase of ordered) {
    const problem = longformPhraseProblem(phrase, duration);
    const frames = longformPhraseFrameWindow(phrase);
    const scene = sceneFrames.find(
      (window) => frames.startFrame < window.endFrame && window.startFrame < frames.endFrame,
    );
    const reason =
      problem ??
      (frames.endFrame > totalFrames
        ? 'Phrase overlay runs past the end of the source.'
        : scene
          ? `Overlaps scene ${scene.id}; phrase text appears only over the full-screen speaker.`
          : frames.startFrame < previousEnd
            ? 'Overlaps an earlier phrase overlay.'
            : null);
    if (reason) dropped.push({ phrase, reason });
    else {
      kept.push(phrase);
      previousEnd = frames.endFrame;
    }
  }
  return { kept, dropped };
}

export function isSceneFirstLongformPlan(plan: LongformEditPlan): plan is SceneFirstLongformPlan {
  return plan.mode === 'scene-first' && plan.schemaVersion === LONGFORM_SCENE_SCHEMA_VERSION;
}

export function isLongformPresentation(value: unknown): value is LongformPresentation {
  return LONGFORM_PRESENTATIONS.some((presentation) => presentation === value);
}

/** Stable content identity, not an authentication or cryptographic integrity proof. */
export function longformSourceFingerprint(
  words: readonly WordTimestamp[],
  duration: number,
): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  const append = (text: string): void => {
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      first = Math.imul(first ^ code, 0x01000193);
      second = Math.imul(second ^ code, 0x85ebca6b);
    }
  };
  append(JSON.stringify([duration, words.length]));
  for (const word of words) append(JSON.stringify([word.text, word.start, word.end]));
  return `lf1-${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

export function longformSceneId(kind: string, startWord: number, endWord: number): string {
  return `scene-${kind}-${startWord}-${endWord}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reject executable/non-JSON structures, cycles and oversized nested model/file input. */
export function isLongformSourceSpec(value: unknown): value is Record<string, LongformJson> {
  let nodes = 0;
  const seen = new Set<object>();
  const visit = (item: unknown, depth: number): boolean => {
    nodes += 1;
    if (nodes > 4_000 || depth > 14) return false;
    if (item === null || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item === 'string') return item.length <= 8_192;
    if (typeof item !== 'object' || seen.has(item)) return false;
    seen.add(item);
    const valid = Array.isArray(item)
      ? item.length <= 256 && item.every((entry) => visit(entry, depth + 1))
      : (Object.getPrototypeOf(item) === Object.prototype ||
          Object.getPrototypeOf(item) === null) &&
        Object.entries(item).every(
          ([key, entry]) =>
            !['__proto__', 'prototype', 'constructor'].includes(key) &&
            key.length <= 100 &&
            visit(entry, depth + 1),
        );
    seen.delete(item);
    return valid;
  };
  return (
    isRecord(value) &&
    visit(value, 0) &&
    JSON.stringify(value).length <= LONGFORM_SCENE_LIMITS.maxSpecBytes
  );
}

export function validLongformWords(words: unknown, duration: number): words is WordTimestamp[] {
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > LONGFORM_SCENE_LIMITS.maxDuration ||
    !Array.isArray(words) ||
    words.length > LONGFORM_SCENE_LIMITS.maxWords
  )
    return false;
  let previous = -1;
  for (const word of words) {
    if (
      !isRecord(word) ||
      typeof word.text !== 'string' ||
      word.text.length > 2_000 ||
      typeof word.start !== 'number' ||
      typeof word.end !== 'number' ||
      !Number.isFinite(word.start) ||
      !Number.isFinite(word.end) ||
      word.start < previous ||
      word.start < 0 ||
      word.end < word.start ||
      word.end > duration + 0.05
    )
      return false;
    previous = word.start;
  }
  return true;
}

/** Renderer/file envelope check. Main process additionally reconstructs every scene kind. */
export function sceneFirstPlanProblem(value: unknown): string | null {
  if (
    !isRecord(value) ||
    value.mode !== 'scene-first' ||
    value.schemaVersion !== 2 ||
    (value.parserVersion !== 1 && value.parserVersion !== 2 && value.parserVersion !== 3)
  )
    return 'Unsupported scene plan version. Regenerate a new draft; the saved version is preserved.';
  if (
    (value.parserVersion === 2 || value.parserVersion === 3) &&
    !isStoryboardStyle(value.storyboardStyle)
  )
    return 'Invalid storyboard style. Review a new draft; the saved version is preserved.';
  if (
    typeof value.sourceDuration !== 'number' ||
    !Number.isFinite(value.sourceDuration) ||
    value.sourceDuration <= 0 ||
    value.sourceDuration > LONGFORM_SCENE_LIMITS.maxDuration ||
    typeof value.sourceFingerprint !== 'string' ||
    !/^lf1-[0-9a-f]{16}$/.test(value.sourceFingerprint)
  )
    return 'Invalid scene plan source identity.';
  if (
    !Array.isArray(value.scenes) ||
    value.scenes.length > LONGFORM_SCENE_LIMITS.maxScenes ||
    !Array.isArray(value.sections) ||
    value.sections.length > LONGFORM_SCENE_LIMITS.maxSections
  )
    return 'Invalid scene plan size.';
  if (
    !Array.isArray(value.blocks) ||
    value.blocks.length !== 0 ||
    (value.cards !== undefined && (!Array.isArray(value.cards) || value.cards.length !== 0))
  )
    return 'Scene-first plans cannot contain legacy blocks or cards.';
  // Older scene plans saved `phrases: []`; plans without overlays keep loading unchanged.
  if (!Array.isArray(value.phrases) || value.phrases.length > LONGFORM_PHRASE_LIMITS.maxPhrases)
    return 'Invalid phrase overlay list.';
  for (const phrase of value.phrases) {
    const problem = longformPhraseProblem(phrase, value.sourceDuration);
    if (problem) return problem;
  }
  if (
    typeof value.reasoning !== 'string' ||
    value.reasoning.length > 16_384 ||
    typeof value.generatedAt !== 'number' ||
    !Number.isFinite(value.generatedAt)
  )
    return 'Invalid scene plan metadata.';
  const ids = new Set<string>();
  for (const scene of value.scenes) {
    if (
      !isRecord(scene) ||
      typeof scene.id !== 'string' ||
      scene.id.length > 160 ||
      !/^[a-zA-Z0-9_-]+$/.test(scene.id) ||
      ids.has(scene.id) ||
      typeof scene.kind !== 'string' ||
      !/^[a-z][a-z0-9-]{0,79}$/.test(scene.kind) ||
      typeof scene.startWord !== 'number' ||
      !Number.isInteger(scene.startWord) ||
      scene.startWord < 0 ||
      typeof scene.endWord !== 'number' ||
      !Number.isInteger(scene.endWord) ||
      scene.endWord <= scene.startWord ||
      scene.endWord >= LONGFORM_SCENE_LIMITS.maxWords ||
      typeof scene.startTime !== 'number' ||
      !Number.isFinite(scene.startTime) ||
      scene.startTime < 0 ||
      typeof scene.endTime !== 'number' ||
      !Number.isFinite(scene.endTime) ||
      scene.endTime <= scene.startTime ||
      scene.endTime > value.sourceDuration ||
      typeof scene.sectionId !== 'string' ||
      scene.sectionId.length > 160 ||
      typeof scene.label !== 'string' ||
      scene.label.length > 160 ||
      typeof scene.purpose !== 'string' ||
      scene.purpose.length > 1_000 ||
      !isLongformPresentation(scene.presentation) ||
      !isLongformSourceSpec(scene.sourceSpec) ||
      (scene.omitted !== undefined && typeof scene.omitted !== 'boolean')
    )
      return 'Invalid or duplicate scene placement.';
    if (
      scene.sourceSpec.kind !== scene.kind ||
      scene.sourceSpec.startWord !== scene.startWord ||
      scene.sourceSpec.endWord !== scene.endWord
    )
      return 'Scene identity does not match its source specification.';
    if (scene.kind === 'storyboard') {
      if (value.parserVersion === 1) return 'Parser-1 plans cannot contain storyboards.';
      if (value.parserVersion === 2 && scene.sourceSpec.specVersion === 2)
        return 'Parser-2 plans require storyboard spec version 1; the saved version is preserved.';
      if (
        value.parserVersion === 3 &&
        scene.sourceSpec.specVersion !== 1 &&
        scene.sourceSpec.specVersion !== 2
      )
        return 'Unsupported storyboard version; the saved version is preserved.';
      if (scene.presentation !== 'full-frame')
        return 'Storyboards require full-frame presentation.';
      if (JSON.stringify(scene.sourceSpec).length > STORYBOARD_LIMITS.maxSpecBytes)
        return 'Storyboard source specification exceeds its size budget.';
    }
    ids.add(scene.id);
  }
  const sectionIds = new Set<string>();
  for (const section of value.sections) {
    if (
      !isRecord(section) ||
      typeof section.id !== 'string' ||
      section.id.length > 160 ||
      sectionIds.has(section.id) ||
      typeof section.startWord !== 'number' ||
      !Number.isInteger(section.startWord) ||
      section.startWord < 0 ||
      typeof section.endWord !== 'number' ||
      !Number.isInteger(section.endWord) ||
      section.endWord < section.startWord ||
      typeof section.startTime !== 'number' ||
      !Number.isFinite(section.startTime) ||
      section.startTime < 0 ||
      typeof section.endTime !== 'number' ||
      !Number.isFinite(section.endTime) ||
      section.endTime < section.startTime ||
      section.endTime > value.sourceDuration ||
      !['planned', 'empty', 'failed'].includes(String(section.status)) ||
      !Array.isArray(section.diagnostics) ||
      section.diagnostics.length > 100 ||
      !section.diagnostics.every((entry) => typeof entry === 'string' && entry.length <= 1_000)
    )
      return 'Invalid planning section.';
    sectionIds.add(section.id);
  }
  if (value.scenes.some((scene: LongformScenePlacement) => !sectionIds.has(scene.sectionId)))
    return 'Scene refers to an unknown planning section.';
  return null;
}

export function isSceneFirstPlanEnvelope(value: unknown): value is SceneFirstLongformPlan {
  return sceneFirstPlanProblem(value) === null;
}

export interface LongformSceneSchedule {
  scenes: LongformScenePlacement[];
  rejected: { id: string; reason: string }[];
}

/** Select whole scene windows. Never repair a collision by cutting an authored story. */
export function scheduleLongformScenes(
  scenes: readonly LongformScenePlacement[],
  duration: number,
): LongformSceneSchedule {
  const accepted: LongformScenePlacement[] = [];
  const rejected: LongformSceneSchedule['rejected'] = [];
  let previousEndFrame = 0;
  const ordered = [...scenes].sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
  for (const scene of ordered) {
    if (scene.omitted) continue;
    const startFrame = Math.floor(scene.startTime * 30 + 1e-6);
    const endFrame = Math.ceil(scene.endTime * 30 - 1e-6);
    const reason =
      !Number.isFinite(startFrame) ||
      !Number.isFinite(endFrame) ||
      startFrame < 0 ||
      endFrame <= startFrame ||
      scene.endTime > duration
        ? 'Scene is outside the source window.'
        : startFrame < previousEndFrame
          ? 'Scene overlaps another complete explanation.'
          : null;
    if (reason) rejected.push({ id: scene.id, reason });
    else {
      accepted.push(scene);
      previousEndFrame = endFrame;
    }
  }
  return { scenes: accepted, rejected };
}
