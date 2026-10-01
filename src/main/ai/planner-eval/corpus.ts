import type { WordTimestamp } from '@shared/types';

export const CORPUS_VERSION = 1 as const;
export const CORPUS_LIMITS = {
  maxBytes: 1024 * 1024,
  maxClips: 64,
  maxWordsPerClip: 2_000,
  maxSourceWords: 50_000,
} as const;

export type CorpusSplit = 'discovery' | 'holdout';
export type CorpusProvenance = 'synthetic' | 'private-import';

/** Absolute source seconds, including the speaker-owned hook lead. */
export interface CorpusBounds {
  start: number;
  end: number;
}

export interface CorpusExpectations {
  animation: 'required' | 'optional' | 'none';
  quote: 'required' | 'allowed' | 'forbidden';
  takeaway: 'required' | 'allowed' | 'forbidden';
  /** All listed scene kind IDs must occur; these are expectations, not planner settings. */
  requiredKinds: string[];
  forbiddenKinds: string[];
  minConsecutiveScenes?: number;
  /** Authored semantic criteria for human review, not a claim of measured quality. */
  notes: string;
}

export interface CorpusClip {
  id: string;
  provenance: CorpusProvenance;
  sourceGroup: string;
  topicGroup: string;
  split: CorpusSplit;
  bounds: CorpusBounds;
  words: WordTimestamp[];
  /** Runner minStart = bounds.start + (hookLeadSec ?? 0); maxEnd = bounds.end. */
  hookLeadSec?: number;
  /** Opaque local media ID only; never a path/URL. The parser performs no media I/O. */
  mediaRef?: string;
  expectations: CorpusExpectations;
}

export interface CorpusManifest {
  version: typeof CORPUS_VERSION;
  id: string;
  description: string;
  clips: CorpusClip[];
}

export type CorpusParseResult = { ok: true; value: CorpusManifest } | { ok: false; error: string };

/** A human must assign topic/split/expectations before admitting an import to a corpus. */
export interface ImportedCorpusClip {
  id: string;
  provenance: 'private-import';
  sourceGroup: string;
  bounds: CorpusBounds;
  words: WordTimestamp[];
}

export interface PrivateImportSkip {
  sourceGroup: string;
  clipIndex: number;
  reason: 'missing timed transcript' | 'invalid timed transcript' | 'invalid clip metadata';
}

export type PrivateImportResult =
  | { ok: true; value: { clips: ImportedCorpusClip[]; skipped: PrivateImportSkip[] } }
  | { ok: false; error: string };

class CorpusValidationError extends Error {}

function invalid(path: string, message: string): never {
  throw new CorpusValidationError(`${path}: ${message}`);
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw);
}

function record(raw: unknown, path: string, keys?: readonly string[]): Record<string, unknown> {
  if (!isRecord(raw)) invalid(path, 'expected an object');
  if (keys && Object.keys(raw).some((key) => !keys.includes(key))) {
    invalid(path, 'unknown field');
  }
  return raw;
}

function text(raw: unknown, path: string, maxLength = 2_000): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > maxLength) {
    invalid(path, `expected nonempty text of at most ${maxLength} characters`);
  }
  return raw;
}

function identifier(raw: unknown, path: string): string {
  const value = text(raw, path, 128);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) invalid(path, 'expected an opaque ID');
  return value;
}

function choice<T extends string>(raw: unknown, path: string, allowed: readonly T[]): T {
  const value = allowed.find((item) => item === raw);
  if (value === undefined) invalid(path, 'unsupported value');
  return value;
}

function finite(raw: unknown, path: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) invalid(path, 'expected a finite number');
  return raw;
}

function parseBounds(raw: unknown, path: string): CorpusBounds {
  const value = record(raw, path, ['start', 'end']);
  const start = finite(value.start, `${path}.start`);
  const end = finite(value.end, `${path}.end`);
  if (start < 0 || end <= start) invalid(path, 'expected 0 <= start < end');
  return { start, end };
}

function parseWords(
  raw: unknown,
  path: string,
  bounds?: CorpusBounds,
  maxWords: number = CORPUS_LIMITS.maxWordsPerClip,
  strict = true,
): WordTimestamp[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > maxWords) {
    invalid(path, `expected 1..${maxWords} timed words`);
  }
  let previousEnd = 0;
  return raw.map((item, index) => {
    const wordPath = `${path}[${index}]`;
    const word = record(item, wordPath, strict ? ['text', 'start', 'end'] : undefined);
    const wordText = text(word.text, `${wordPath}.text`, 256);
    const start = finite(word.start, `${wordPath}.start`);
    const end = finite(word.end, `${wordPath}.end`);
    if (start < previousEnd || end <= start) {
      invalid(wordPath, 'expected positive, ordered, non-overlapping timestamps');
    }
    if (bounds && (start < bounds.start || end > bounds.end)) {
      invalid(wordPath, 'word must be contained in clip bounds');
    }
    previousEnd = end;
    return { text: wordText, start, end };
  });
}

function kindList(raw: unknown, path: string): string[] {
  if (!Array.isArray(raw) || raw.length > 32) invalid(path, 'expected at most 32 kind IDs');
  const values = raw.map((item, index) => identifier(item, `${path}[${index}]`));
  if (new Set(values).size !== values.length) invalid(path, 'duplicate kind ID');
  return values;
}

function parseExpectations(raw: unknown, path: string): CorpusExpectations {
  const value = record(raw, path, [
    'animation',
    'quote',
    'takeaway',
    'requiredKinds',
    'forbiddenKinds',
    'minConsecutiveScenes',
    'notes',
  ]);
  const result: CorpusExpectations = {
    animation: choice(value.animation, `${path}.animation`, ['required', 'optional', 'none']),
    quote: choice(value.quote, `${path}.quote`, ['required', 'allowed', 'forbidden']),
    takeaway: choice(value.takeaway, `${path}.takeaway`, ['required', 'allowed', 'forbidden']),
    requiredKinds: kindList(value.requiredKinds, `${path}.requiredKinds`),
    forbiddenKinds: kindList(value.forbiddenKinds, `${path}.forbiddenKinds`),
    notes: text(value.notes, `${path}.notes`),
  };
  if (
    result.requiredKinds.some((kind) => result.forbiddenKinds.includes(kind)) ||
    (result.animation === 'none' &&
      (result.requiredKinds.length > 0 ||
        result.quote === 'required' ||
        result.takeaway === 'required'))
  )
    invalid(path, 'contradictory expectations');
  if (value.minConsecutiveScenes !== undefined) {
    const max = finite(value.minConsecutiveScenes, `${path}.minConsecutiveScenes`);
    if (!Number.isInteger(max) || max < 1 || max > 16)
      invalid(path, 'expected an integer from 1 to 16');
    result.minConsecutiveScenes = max;
  }
  return result;
}

function parseClip(raw: unknown, index: number): CorpusClip {
  const path = `clips[${index}]`;
  const value = record(raw, path, [
    'id',
    'provenance',
    'sourceGroup',
    'topicGroup',
    'split',
    'bounds',
    'words',
    'hookLeadSec',
    'mediaRef',
    'expectations',
  ]);
  const bounds = parseBounds(value.bounds, `${path}.bounds`);
  const clip: CorpusClip = {
    id: identifier(value.id, `${path}.id`),
    provenance: choice(value.provenance, `${path}.provenance`, ['synthetic', 'private-import']),
    sourceGroup: identifier(value.sourceGroup, `${path}.sourceGroup`),
    topicGroup: identifier(value.topicGroup, `${path}.topicGroup`),
    split: choice(value.split, `${path}.split`, ['discovery', 'holdout']),
    bounds,
    words: parseWords(value.words, `${path}.words`, bounds),
    expectations: parseExpectations(value.expectations, `${path}.expectations`),
  };
  if (value.hookLeadSec !== undefined) {
    const lead = finite(value.hookLeadSec, `${path}.hookLeadSec`);
    if (lead < 0 || lead >= bounds.end - bounds.start)
      invalid(`${path}.hookLeadSec`, 'outside clip');
    clip.hookLeadSec = lead;
  }
  if (value.mediaRef !== undefined) clip.mediaRef = identifier(value.mediaRef, `${path}.mediaRef`);
  return clip;
}

/** Strict, bounded V1 manifest parser. Unknown fields (including settings) are rejected. */
export function parseCorpus(raw: unknown): CorpusParseResult {
  try {
    const json = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (typeof json !== 'string') invalid('corpus', 'expected JSON data');
    if (Buffer.byteLength(json, 'utf8') > CORPUS_LIMITS.maxBytes)
      invalid('corpus', 'size limit exceeded');
    const value = record(typeof raw === 'string' ? JSON.parse(json) : raw, 'corpus', [
      'version',
      'id',
      'description',
      'clips',
    ]);
    if (value.version !== CORPUS_VERSION) invalid('version', 'unsupported corpus version');
    if (
      !Array.isArray(value.clips) ||
      value.clips.length === 0 ||
      value.clips.length > CORPUS_LIMITS.maxClips
    ) {
      invalid('clips', `expected 1..${CORPUS_LIMITS.maxClips} clips`);
    }
    const clips = value.clips.map(parseClip);
    const ids = new Set<string>();
    const sources = new Map<string, CorpusSplit>();
    const topics = new Map<string, CorpusSplit>();
    for (const clip of clips) {
      if (ids.has(clip.id)) invalid('clips', 'duplicate clip ID');
      ids.add(clip.id);
      for (const [key, groups] of [
        ['sourceGroup', sources],
        ['topicGroup', topics],
      ] as const) {
        const split = groups.get(clip[key]);
        if (split !== undefined && split !== clip.split)
          invalid(key, 'group leaks across discovery/holdout partitions');
        groups.set(clip[key], clip.split);
      }
    }
    return {
      ok: true,
      value: {
        version: CORPUS_VERSION,
        id: identifier(value.id, 'id'),
        description: text(value.description, 'description'),
        clips,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof CorpusValidationError ? error.message : 'Invalid corpus JSON',
    };
  }
}

/**
 * Pure projection of an already-read snapshot; never opens files or retains the project.
 * Reads ONLY clips[sourceId].{id,sourceId,startTime,endTime,wordTimestamps} and,
 * when needed, transcriptions[sourceId].words.{text,start,end}. Clip-local words
 * take precedence. Text/segments/settings/source paths are never timing fallbacks.
 * Absolute timings are validated, never estimated, sorted, rebased or repaired.
 */
export function importPrivateClips(raw: unknown): PrivateImportResult {
  try {
    const project = record(raw, 'snapshot');
    const groups = record(project.clips, 'snapshot.clips');
    const clips: ImportedCorpusClip[] = [];
    const skipped: PrivateImportSkip[] = [];
    let count = 0;
    if (Object.keys(groups).length > CORPUS_LIMITS.maxClips)
      invalid('snapshot.clips', 'too many source groups');
    for (const [sourceKey, entries] of Object.entries(groups)) {
      const sourceGroup = identifier(sourceKey, 'sourceGroup');
      if (!Array.isArray(entries)) invalid('snapshot.clips', 'expected clip arrays');
      count += entries.length;
      if (count > CORPUS_LIMITS.maxClips) invalid('snapshot.clips', 'too many clips');
      for (const [clipIndex, entry] of entries.entries()) {
        let id: string;
        let bounds: CorpusBounds;
        let clip: Record<string, unknown>;
        try {
          clip = record(entry, 'clip');
          id = identifier(clip.id, 'clip.id');
          if (clip.sourceId !== undefined && clip.sourceId !== sourceGroup)
            invalid('clip.sourceId', 'source mismatch');
          bounds = parseBounds({ start: clip.startTime, end: clip.endTime }, 'clip.bounds');
        } catch {
          skipped.push({ sourceGroup, clipIndex, reason: 'invalid clip metadata' });
          continue;
        }
        try {
          let words: WordTimestamp[];
          const local = clip.wordTimestamps;
          if (local !== undefined && !(Array.isArray(local) && local.length === 0)) {
            words = parseWords(local, 'words', bounds, CORPUS_LIMITS.maxWordsPerClip, false);
          } else {
            const transcriptions = project.transcriptions;
            const source = isRecord(transcriptions) ? transcriptions[sourceGroup] : undefined;
            const timed = isRecord(source) ? source.words : undefined;
            if (timed === undefined || (Array.isArray(timed) && timed.length === 0)) {
              skipped.push({ sourceGroup, clipIndex, reason: 'missing timed transcript' });
              continue;
            }
            // Validate before selecting; malformed words must not disappear during filtering.
            words = parseWords(
              timed,
              'words',
              undefined,
              CORPUS_LIMITS.maxSourceWords,
              false,
            ).filter((word) => word.start >= bounds.start && word.end <= bounds.end);
            if (words.length > CORPUS_LIMITS.maxWordsPerClip)
              invalid('words', 'too many clip words');
          }
          if (words.length === 0) {
            skipped.push({ sourceGroup, clipIndex, reason: 'missing timed transcript' });
          } else {
            clips.push({ id, provenance: 'private-import', sourceGroup, bounds, words });
          }
        } catch {
          skipped.push({ sourceGroup, clipIndex, reason: 'invalid timed transcript' });
        }
      }
    }
    return { ok: true, value: { clips, skipped } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof CorpusValidationError ? error.message : 'Invalid snapshot data',
    };
  }
}
