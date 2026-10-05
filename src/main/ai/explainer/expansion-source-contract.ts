import {
  type ExpansionStoryId,
  expansionEntry,
} from '../../remotion/compositions/explainer/expansion/catalog';
import {
  type ExpansionEntity,
  type ExpansionStoryBase,
  expansionEntityId,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  EXPANSION_LIMITS,
  type ExpansionEvidenceSpan,
} from '../../remotion/compositions/explainer/expansion/value-types';
import { TECHNOLOGY_WORD_FIELDS } from '../../remotion/compositions/explainer/technology/types';
import { hybridStory, onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue, sourceLabel } from './mechanism-contract';
import { technologyClause, technologyEvidence } from './technology-contract';

export interface ExpansionSourceEvidence {
  readonly span: ExpansionEvidenceSpan;
  readonly text: string;
}
export type ExpansionLocalEvidence = string | ExpansionSourceEvidence;
export interface ExpansionBeatSpans {
  setup: string;
  action: string;
  response: string;
  check: string;
  resolve: string;
}

function unsafeText(text: string): boolean {
  return (
    /[<>`]|https?:\/\/|www\./i.test(text) ||
    [...text].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  );
}
const CONDITION = /\b(?:if|unless|when|provided that|assuming)\b/gi;
const NON_ASSERTED =
  /\b(?:not|never|no|without|cannot|can't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|won't|hasn't|hadn't|couldn't|wouldn't|may|might|could|should|would|will|perhaps|maybe|plans?|proposes?|hopes?|allegedly|supposedly|unverified)\b/i;
const BASE_FIELDS = [
  'kind',
  'preset',
  'visualMode',
  'label',
  'subject',
  'outcome',
  'condition',
  'evidence',
  'startWord',
  'endWord',
  'layout',
  'continues',
  'transition',
  ...TECHNOLOGY_WORD_FIELDS,
] as const;

function evidenceText(evidence: ExpansionLocalEvidence): string {
  return typeof evidence === 'string' ? evidence : evidence.text;
}

/** Numeric punctuation is semantic: -2.50, 2.50 and 2.5 are not interchangeable labels. */
function phraseKey(text: string): string {
  return (
    text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/−/g, '-')
      .match(/[+-]?(?:[$€£]\s*)?\d+(?:[.,]\d+)*(?:%|[a-z]+)?|[\p{L}\p{N}]+/gu) ?? []
  )
    .map((word) => word.replace(/\s/g, ''))
    .join(' ');
}

function clauseKey(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/’/g, "'")
    .replace(/−/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function terminal(text: string): boolean {
  return /[.!?;][”"’')\]]*$/.test(text);
}

function clauseSpan(index: number, ctx: ParseContext): ExpansionEvidenceSpan | null {
  if (!ctx.words[index]) return mechanismIssue(ctx, 'source evidence must refer to existing words');
  let fromWord = index;
  let toWord = index;
  while (fromWord > ctx.win.startWord && !terminal(ctx.words[fromWord - 1]?.text ?? '')) {
    fromWord--;
    if (index - fromWord + 1 > EXPANSION_LIMITS.evidenceWords)
      return mechanismIssue(ctx, 'complete local evidence exceeds 64 words; never trim it');
  }
  while (toWord < ctx.win.endWord && !terminal(ctx.words[toWord]?.text ?? '')) {
    toWord++;
    if (toWord - fromWord + 1 > EXPANSION_LIMITS.evidenceWords)
      return mechanismIssue(ctx, 'complete local evidence exceeds 64 words; never trim it');
  }
  // A scene boundary is not permission to drop the beginning/end of a source clause.
  if (
    (fromWord > 0 && !terminal(ctx.words[fromWord - 1]?.text ?? '')) ||
    (toWord < ctx.words.length - 1 && !terminal(ctx.words[toWord]?.text ?? ''))
  )
    return mechanismIssue(
      ctx,
      'scene boundary cuts a local clause; preserve its full source scope',
    );
  return { fromWord, toWord };
}

/** Accept only exact, complete local clauses; do not silently repair or trim supplied spans. */
export function expansionSourceSpan(
  raw: unknown,
  ctx: ParseContext,
): ExpansionSourceEvidence | null {
  if (!isRec(raw) || !onlyFields(raw, ['fromWord', 'toWord'], ctx))
    return mechanismIssue(ctx, 'evidence needs only fromWord and toWord');
  const from = ctx.inWin(raw.fromWord);
  const to = ctx.inWin(raw.toWord);
  if (from === null || to === null || from > to)
    return mechanismIssue(ctx, 'evidence indices must be ordered integers inside this scene');
  const span = clauseSpan(from, ctx);
  if (!span) return null;
  if (from !== span.fromWord || to !== span.toWord)
    return mechanismIssue(
      ctx,
      'evidence must retain the complete local clause, including conditions and negation',
    );
  if (
    !Number.isFinite(ctx.win.startTime) ||
    !Number.isFinite(ctx.win.endTime) ||
    ctx.win.endTime <= ctx.win.startTime
  )
    return mechanismIssue(ctx, 'source evidence needs a finite positive time window');
  for (let index = from; index <= to; index++) {
    const word = ctx.words[index];
    const previous = index > ctx.win.startWord ? ctx.words[index - 1] : undefined;
    if (
      !word ||
      !Number.isFinite(word.start) ||
      !Number.isFinite(word.end) ||
      word.start < ctx.win.startTime ||
      word.end > ctx.win.endTime ||
      word.end <= word.start ||
      (previous && (!Number.isFinite(previous.end) || word.start < previous.end - 1e-7))
    )
      return mechanismIssue(
        ctx,
        'source evidence timing must be finite, positive, non-overlapping and inside its window',
      );
  }
  const text = technologyEvidence(ctx, from, to);
  // Reuse sentence-local lookup, but retain quote-aware boundaries and decimal punctuation.
  const local = technologyClause(ctx, from);
  if (!text || (!local.includes(text) && !text.includes(local)))
    return mechanismIssue(ctx, 'evidence must be contiguous local source text');
  return { span, text };
}

/** A label must quote this evidence, not just somewhere else in the scene window. */
export function expansionSourceLabel(
  raw: unknown,
  evidence: ExpansionLocalEvidence,
  ctx: ParseContext,
  max: number,
): string | null {
  if (!Number.isSafeInteger(max) || max < 1 || max > EXPANSION_LIMITS.claim)
    return mechanismIssue(
      ctx,
      'source label bound must be an authored limit of at most 96 characters',
    );
  const label = sourceLabel(raw, ctx, max);
  const text = evidenceText(evidence);
  if (
    !label ||
    unsafeText(label) ||
    !text ||
    text.trim().split(/\s+/).length > EXPANSION_LIMITS.evidenceWords ||
    !` ${phraseKey(text)} `.includes(` ${phraseKey(label)} `)
  )
    return mechanismIssue(
      ctx,
      'label must quote its bounded local evidence; no markup or invented values',
    );
  return label;
}

/** Authored patterns must match the entire clause, never a substring or model-supplied regex. */
export function expansionAssertedRelation(
  evidence: ExpansionLocalEvidence,
  trustedPattern: RegExp,
  condition?: string,
  literalLabels: readonly string[] = [],
): boolean {
  let text = evidenceText(evidence)
    .normalize('NFKC')
    .replace(/’/g, "'")
    .replace(/−/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || unsafeText(text) || text.split(/\s+/).length > EXPANSION_LIMITS.evidenceWords)
    return false;
  // Strip terminal sentence decoration only; decimal points inside amounts remain untouched.
  if (/[!?]/.test(text)) return false;
  text = text.replace(/[.;][”"’')\]]*$/, '').trim();
  if (/[;]|\.(?=\s|$)/.test(text)) return false;
  const markers = [...text.matchAll(CONDITION)];
  if (markers.length) {
    if (markers.length !== 1 || !condition || unsafeText(condition)) return false;
    const marker = markers[0];
    const index = marker?.index;
    if (index === undefined) return false;
    if (index === 0) {
      const comma = text.indexOf(',');
      if (comma < 0 || clauseKey(text.slice(0, comma)) !== clauseKey(condition)) return false;
      text = text.slice(comma + 1).trim();
    } else {
      if (clauseKey(text.slice(index)) !== clauseKey(condition)) return false;
      text = text.slice(0, index).replace(/,\s*$/, '').trim();
    }
  } else if (condition !== undefined) return false;
  if (!text) return false;
  const flags = trustedPattern.flags.replace(/[gmy]/g, '');
  const match = new RegExp(`^(?:${trustedPattern.source})$`, flags).exec(text);
  if (match === null || match[0].length !== text.length) return false;
  if (literalLabels.length > 8) return false;
  // Source-bound literal slots (for example the month May) are not modal grammar.
  // Mask only after the entire authored predicate matches; added/negated verbs still fail.
  if (
    literalLabels.some(
      (label) => label.length > EXPANSION_LIMITS.claim || !label.trim() || unsafeText(label),
    )
  )
    return false;
  // A shorter suffix must not partially mask a longer authored status such as not-revealed.
  const labels = [...literalLabels].sort(
    (a, b) =>
      b.normalize('NFKC').length - a.normalize('NFKC').length || (a < b ? -1 : a > b ? 1 : 0),
  );
  let grammar = text;
  for (const label of labels) {
    const literal = label
      .normalize('NFKC')
      .replace(/’/g, "'")
      .replace(/−/g, '-')
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+');
    grammar = grammar.replace(
      new RegExp(`(^|[^\\p{L}\\p{N}])${literal}(?=$|[^\\p{L}\\p{N}])`, 'giu'),
      '$1source-label',
    );
  }
  return !NON_ASSERTED.test(grammar);
}

/** Bounds and source labels only: packs still validate every story-specific fact/relation. */
export function expansionStoryBase(
  raw: Rec,
  ctx: ParseContext,
  storyId: ExpansionStoryId,
  additionalFields: readonly string[],
): { story: ExpansionStoryBase; spans: ExpansionBeatSpans } | null {
  if ('treatment' in raw)
    return mechanismIssue(
      ctx,
      'treatment requires a later explicit pack validator; base handling is fail-closed',
    );
  const entry = expansionEntry(raw.kind, raw.preset);
  if (!entry || entry.id !== storyId)
    return mechanismIssue(ctx, 'kind and preset must match the exact recognized expansion story');
  if (!onlyFields(raw, [...BASE_FIELDS, ...additionalFields], ctx)) return null;
  if (
    (raw.startWord !== undefined && raw.startWord !== ctx.win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== ctx.win.endWord) ||
    (raw.layout !== undefined && !entry.layouts.some((layout) => layout === raw.layout))
  )
    return mechanismIssue(
      ctx,
      'expansion envelope must match the complete scene and an offered layout',
    );
  const evidence: ExpansionSourceEvidence[] = [];
  for (const field of TECHNOLOGY_WORD_FIELDS) {
    const index = ctx.inWin(raw[field]);
    const word = index === null ? undefined : ctx.words[index];
    if (
      index === null ||
      !word ||
      !Number.isFinite(word.start) ||
      word.start < ctx.win.startTime ||
      word.start > ctx.win.endTime
    )
      return mechanismIssue(
        ctx,
        'every expansion beat needs a finite source time inside the scene',
      );
    const span = clauseSpan(index, ctx);
    const local = span ? expansionSourceSpan(span, ctx) : null;
    if (!local) return null;
    evidence.push(local);
  }
  if (new Set(evidence.map(({ span }) => span.fromWord)).size !== TECHNOLOGY_WORD_FIELDS.length)
    return mechanismIssue(
      ctx,
      'five expansion beats must use five distinct complete source clauses',
    );
  const [setup, action, response, check, resolve] = evidence;
  if (!setup || !action || !response || !check || !resolve) return null;
  if (
    !expansionSourceLabel(raw.label, setup, ctx, 48) ||
    !expansionSourceLabel(raw.subject, setup, ctx, 34) ||
    !expansionSourceLabel(raw.outcome, resolve, ctx, 54) ||
    (typeof raw.condition === 'string' && unsafeText(raw.condition))
  )
    return mechanismIssue(ctx, 'story labels must quote their own setup or resolve clause');
  const parsed = hybridStory(raw, ctx, [...additionalFields, 'startWord', 'endWord', 'layout']);
  if (!parsed) return null;
  return {
    story: { ...parsed.story, storyId },
    spans: {
      setup: setup.text,
      action: action.text,
      response: response.text,
      check: check.text,
      resolve: resolve.text,
    },
  };
}

/** Raw entries are {label, evidence:{fromWord,toWord}}; IDs are never accepted from input. */
export function expansionEntities(
  raw: unknown,
  ctx: ParseContext,
  storyId: ExpansionStoryId,
): ExpansionEntity[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > EXPANSION_LIMITS.actors)
    return mechanismIssue(ctx, 'include one to eight locally grounded expansion entities');
  const entities: ExpansionEntity[] = [];
  const labels = new Set<string>();
  for (const [index, value] of raw.entries()) {
    if (!isRec(value) || !onlyFields(value, ['label', 'evidence'], ctx)) return null;
    const evidence = expansionSourceSpan(value.evidence, ctx);
    const label = evidence
      ? expansionSourceLabel(value.label, evidence, ctx, EXPANSION_LIMITS.actorLabel)
      : null;
    if (!evidence || !label) return null;
    const key = phraseKey(label);
    if (labels.has(key))
      return mechanismIssue(ctx, 'entity labels must be distinct, not duplicate aliases');
    labels.add(key);
    entities.push({ id: expansionEntityId(storyId, index), label, evidence: evidence.span });
  }
  return entities;
}
