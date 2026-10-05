import type { ExpansionStoryId } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionEvidenceSpan } from '../../remotion/compositions/explainer/expansion/value-types';
import {
  type ExpansionNegativeFixture,
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from './expansion-fixture-words';
import { isRec, type Rec } from './kind-spec';

interface FixtureEdit {
  readonly path: readonly (string | number)[];
  readonly value?: unknown;
  readonly remove?: boolean;
}
interface NegativeSeed extends Partial<ExpansionNegativeFixture> {
  readonly name: string;
  readonly path?: string;
  readonly value?: unknown;
  readonly edits?: readonly FixtureEdit[];
  readonly clauses?: Readonly<Record<string, string>>;
  readonly intervals?: readonly (readonly [number, number])[];
}
interface ParaphraseSeed {
  readonly name: string;
  readonly clauses: readonly string[];
  readonly outcome: string;
}
export interface TemporalFixtureSeed extends Omit<ExpansionSourceFixture, 'negatives'> {
  readonly id: ExpansionStoryId;
  readonly negatives?: readonly NegativeSeed[];
  readonly paraphrases?: readonly (TemporalFixtureSeed | ParaphraseSeed)[];
  readonly examples?: readonly TemporalFixtureSeed[];
}
export interface TemporalClauseFixtureSeed {
  readonly id: '47' | '48';
  readonly clauses: readonly string[];
  readonly proposal: Rec;
  readonly negatives?: readonly NegativeSeed[];
}
export interface TemporalFixtureTiming {
  readonly durationSec: number;
  readonly clauseStarts: readonly number[];
  readonly interClausePauseSec: number;
  readonly leadInSec: number;
  readonly tailSec: number;
}
/** The history/twin packet explicitly authors its speech schedule; no facts are generated. */
export function temporalClauseFixture(
  seed: TemporalClauseFixtureSeed,
  timing: TemporalFixtureTiming,
): TemporalFixtureSeed {
  if (
    !Number.isFinite(timing.durationSec) ||
    timing.durationSec < 5 ||
    timing.durationSec > 12 ||
    timing.leadInSec !== 0.25 ||
    timing.tailSec !== 0.35 ||
    !Number.isFinite(timing.interClausePauseSec) ||
    timing.interClausePauseSec < 0 ||
    timing.clauseStarts.length !== seed.clauses.length ||
    timing.clauseStarts[0] !== timing.leadInSec ||
    timing.clauseStarts.some((value) => !Number.isFinite(value))
  )
    throw new Error('Malformed explicitly authored temporal speech timing');
  const speech = expansionFixtureSpeech(seed.clauses, timing.durationSec);
  for (const [index, span] of speech.spans.entries()) {
    const start = timing.clauseStarts[index];
    const end =
      index === speech.spans.length - 1
        ? timing.durationSec - timing.tailSec
        : timing.clauseStarts[index + 1] - timing.interClausePauseSec;
    if (!(end > start)) throw new Error('Authored pause must retain positive speech intervals');
    const count = span.toWord - span.fromWord + 1;
    for (let position = 0; position < count; position++) {
      const word = speech.words[span.fromWord + position];
      word.start = Number((start + ((end - start) * position) / count).toFixed(9));
      word.end = Number((start + ((end - start) * (position + 1)) / count).toFixed(9));
    }
  }
  return { ...seed, ...speech };
}
const phases = ['setup', 'action', 'response', 'check', 'resolve'] as const;
function record(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Expected authored temporal fixture record');
  return value;
}
function clauses(source: ExpansionSourceFixture): {
  readonly text: string[];
  readonly spans: ExpansionEvidenceSpan[];
} {
  const text: string[] = [];
  const spans: ExpansionEvidenceSpan[] = [];
  let fromWord = 0;
  for (const [index, word] of source.words.entries()) {
    if (!/[.!?;][”"’')\]]*$/.test(word.text)) continue;
    text.push(
      source.words
        .slice(fromWord, index + 1)
        .map((entry) => entry.text)
        .join(' '),
    );
    spans.push({ fromWord, toWord: index });
    fromWord = index + 1;
  }
  if (fromWord !== source.words.length)
    throw new Error('Incomplete authored temporal source clause');
  return { text, spans };
}
/** Test-authoring only; never supplies absent facts or timestamps to production parsing. */
function rewrite(source: ExpansionSourceFixture, texts: readonly string[]): ExpansionSourceFixture {
  const old = clauses(source);
  if (texts.length !== old.spans.length)
    throw new Error('Authored rewrite must retain source-clause identities');
  const speech = expansionFixtureSpeech(texts, source.window.endTime - source.window.startTime);
  for (const [index, span] of speech.spans.entries()) {
    const previous = old.spans[index];
    const start = source.words[previous.fromWord].start;
    const end = source.words[previous.toWord].end;
    const count = span.toWord - span.fromWord + 1;
    for (let position = 0; position < count; position++) {
      const word = speech.words[span.fromWord + position];
      word.start = Number((start + ((end - start) * position) / count).toFixed(9));
      word.end = Number((start + ((end - start) * (position + 1)) / count).toFixed(9));
    }
  }
  function rebase(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(rebase);
    if (!isRec(value)) return value;
    if (Object.keys(value).length === 2 && 'fromWord' in value && 'toWord' in value) {
      const index = old.spans.findIndex(
        (span) => span.fromWord === value.fromWord && span.toWord === value.toWord,
      );
      if (index >= 0) return { ...speech.spans[index] };
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rebase(entry)]));
  }
  const proposal = record(rebase(source.proposal));
  for (const phase of phases) {
    const index = old.spans.findIndex((span) => span.fromWord === source.proposal[`${phase}Word`]);
    if (index < 0) throw new Error('Authored beat must begin its complete original clause');
    proposal[`${phase}Word`] = speech.spans[index].fromWord;
  }
  if ('startWord' in proposal) proposal.startWord = 0;
  if ('endWord' in proposal) proposal.endWord = speech.words.length - 1;
  return {
    ...source,
    sourceText: speech.sourceText,
    words: speech.words,
    window: { ...source.window, startWord: 0, endWord: speech.words.length - 1 },
    proposal,
  };
}
function apply(target: Rec | unknown[], edit: FixtureEdit): void {
  if (
    edit.path.length < 1 ||
    edit.path.length > 8 ||
    edit.path.some(
      (key) =>
        (typeof key === 'number' && (!Number.isSafeInteger(key) || key < 0)) ||
        (typeof key === 'string' &&
          (!key || key.length > 64 || ['__proto__', 'constructor', 'prototype'].includes(key))),
    )
  )
    throw new Error('Invalid authored fixture patch path');
  let current: Rec | unknown[] = target;
  for (const key of edit.path.slice(0, -1)) {
    if (Array.isArray(current) && (typeof key !== 'number' || key >= current.length))
      throw new Error('Fixture patch must address an existing array member');
    if (!Object.hasOwn(current, key))
      throw new Error('Fixture patch must address an existing parent');
    const next: unknown = Array.isArray(current) ? current[Number(key)] : current[String(key)];
    if (!isRec(next) && !Array.isArray(next))
      throw new Error('Fixture patch parent must be a record or array');
    current = next;
  }
  const key = edit.path.at(-1);
  if (key === undefined) throw new Error('Empty authored fixture patch');
  if (Array.isArray(current)) {
    if (typeof key !== 'number' || key >= current.length)
      throw new Error('Fixture patch array index outside authored data');
    if (edit.remove) throw new Error('Do not create sparse authored fixture arrays');
    current[key] = structuredClone(edit.value);
  } else if (edit.remove) delete current[String(key)];
  else current[String(key)] = structuredClone(edit.value);
}
function negative(source: ExpansionSourceFixture, seed: NegativeSeed): ExpansionNegativeFixture {
  if (seed.proposal)
    return {
      name: seed.name,
      proposal: seed.proposal,
      ...(seed.words ? { words: seed.words } : {}),
      ...(seed.window ? { window: seed.window } : {}),
      ...(seed.sourceText ? { sourceText: seed.sourceText } : {}),
    };
  let changed = structuredClone(source);
  if (seed.clauses) {
    const texts = clauses(changed).text;
    for (const [key, text] of Object.entries(seed.clauses)) {
      const index = Number(key);
      if (!Number.isSafeInteger(index) || index < 0 || index >= texts.length)
        throw new Error('Invalid source-clause replacement');
      texts[index] = text;
    }
    changed = rewrite(changed, texts);
  }
  if (seed.intervals) {
    const spans = clauses(changed).spans;
    if (seed.intervals.length !== spans.length)
      throw new Error('Authored timing negative requires one explicit interval per clause');
    for (const [index, span] of spans.entries()) {
      const [start, end] = seed.intervals[index];
      const count = span.toWord - span.fromWord + 1;
      for (let position = 0; position < count; position++) {
        const word = changed.words[span.fromWord + position];
        word.start = Number((start + ((end - start) * position) / count).toFixed(9));
        word.end = Number((start + ((end - start) * (position + 1)) / count).toFixed(9));
      }
    }
  }
  const edits =
    seed.path !== undefined
      ? [
          {
            path: seed.path.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part)),
            value: seed.value,
          },
        ]
      : seed.edits;
  if (!edits || edits.length > 32)
    throw new Error('Authored negative requires bounded explicit patches');
  for (const edit of edits) {
    const root = edit.path[0];
    if (root === 'words' || root === 'window') {
      const holder = { words: changed.words, window: changed.window };
      apply(holder, edit);
      changed = { ...changed, ...holder };
    } else apply(changed.proposal, edit);
  }
  return {
    name: seed.name,
    proposal: changed.proposal,
    words: changed.words,
    window: changed.window,
    sourceText: changed.sourceText,
  };
}
/** Materialize only authored fixture patches; production contracts receive complete raw objects. */
export function temporalSourceFixtures(
  seeds: readonly TemporalFixtureSeed[],
): ExpansionSourceFixture[] {
  const results: ExpansionSourceFixture[] = [];
  for (const seed of seeds) {
    const source: ExpansionSourceFixture = {
      id: seed.id,
      sourceText: seed.sourceText,
      words: seed.words,
      window: seed.window,
      proposal: seed.proposal,
      negatives: [],
    };
    results.push({
      ...source,
      negatives: (seed.negatives ?? []).map((entry) => negative(source, entry)),
    });
    for (const paraphrase of seed.paraphrases ?? []) {
      if ('words' in paraphrase) results.push(...temporalSourceFixtures([paraphrase]));
      else {
        const revised = rewrite(source, paraphrase.clauses);
        revised.proposal.outcome = paraphrase.outcome;
        results.push(revised);
      }
    }
    if (seed.examples) results.push(...temporalSourceFixtures(seed.examples));
  }
  return results;
}
