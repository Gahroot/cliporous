import { LONGFORM_SCENE_LIMITS, type LongformJson } from './longform-scenes';
import { storyboardSourceInputBudget } from './storyboards';

type ChoiceObject = Record<string, LongformJson>;
const VALUE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  basis: [
    'subjectId',
    'population',
    'unit',
    'period',
    'denominator',
    'sourceSpanFromWord',
    'sourceSpanToWord',
  ],
  amount: ['currency', 'minorUnits'],
  money: ['currency', 'minorUnits'],
};
export type BusinessChoiceResult =
  | { ok: true; choices: ChoiceObject }
  | { ok: false; message: string };
const record = (value: LongformJson): value is ChoiceObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const word = (value: LongformJson | undefined): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value < LONGFORM_SCENE_LIMITS.maxWords;
const slot = (key: string): boolean =>
  /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key) &&
  !['constructor', 'prototype', '__proto__'].includes(key);
const span = (value: LongformJson): value is ChoiceObject & { fromWord: number; toWord: number } =>
  record(value) &&
  Object.keys(value).length === 2 &&
  word(value.fromWord) &&
  word(value.toWord) &&
  value.toWord >= value.fromWord;
const identity = (
  value: LongformJson,
): value is ChoiceObject & {
  id: string;
  label: string;
  source: ChoiceObject & { fromWord: number; toWord: number };
} =>
  record(value) &&
  Object.keys(value).length === 3 &&
  typeof value.id === 'string' &&
  typeof value.label === 'string' &&
  span(value.source);

/** A passive source-choice encoding, not property paths or a graph/drawing instruction API. */
export function compactBusinessSourceChoices(input: unknown): BusinessChoiceResult {
  if (!storyboardSourceInputBudget(input))
    return { ok: false, message: 'Source choices exceed the existing JSON boundary.' };
  let error = '';
  const visit = (value: LongformJson): LongformJson => {
    if (Array.isArray(value)) return value.map(visit);
    if (!record(value)) return value;
    const out: ChoiceObject = {};
    const put = (key: string, child: LongformJson): void => {
      if (Object.hasOwn(value, key) || Object.hasOwn(out, key))
        error = 'Compact source selector collision.';
      out[key] = child;
    };
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (slot(key) && identity(child)) {
        put(`${key}ChoiceId`, child.id);
        put(`${key}ChoiceLabel`, child.label);
        put(`${key}ChoiceFromWord`, child.source.fromWord);
        put(`${key}ChoiceToWord`, child.source.toWord);
      } else if (slot(key) && span(child)) {
        put(`${key}SpanFromWord`, child.fromWord);
        put(`${key}SpanToWord`, child.toWord);
      } else {
        const packed = visit(child);
        const fields = VALUE_FIELDS[key];
        if (
          fields &&
          record(packed) &&
          Object.keys(packed).length &&
          Object.entries(packed).every(
            ([field, value]) =>
              fields.includes(field) && (value === null || typeof value !== 'object'),
          )
        ) {
          for (const [field, value] of Object.entries(packed))
            put(`${key}Value${field[0].toUpperCase()}${field.slice(1)}`, value);
        } else out[key] = packed;
      }
    }
    return out;
  };
  // The descriptor-first boundary proved this is a plain finite JSON object.
  const choices = visit(input as ChoiceObject);
  return !error && record(choices)
    ? { ok: true, choices }
    : { ok: false, message: error || 'Expected source choices object.' };
}

/** Restore only bounded identity/word-span records; the concrete grammar still validates every fact. */
export function expandBusinessSourceChoices(input: unknown): BusinessChoiceResult {
  if (!storyboardSourceInputBudget(input))
    return { ok: false, message: 'Compact choices exceed the existing JSON boundary.' };
  let error = '';
  const visit = (value: LongformJson): LongformJson => {
    if (Array.isArray(value)) return value.map(visit);
    if (!record(value)) return value;
    const out: ChoiceObject = {};
    const used = new Set<string>();
    for (const key of Object.keys(value).sort()) {
      if (used.has(key)) continue;
      const scalar = key.match(/^(basis|amount|money)Value([A-Z].*)$/u);
      if (scalar) {
        const prefix = scalar[1];
        if (Object.hasOwn(value, prefix) || Object.hasOwn(out, prefix)) {
          error = 'Colliding value source choice.';
          continue;
        }
        const group: ChoiceObject = {};
        for (const field of Object.keys(value).filter((field) =>
          field.startsWith(`${prefix}Value`),
        )) {
          const suffix = field.slice(prefix.length + 5);
          const native = suffix[0]?.toLowerCase() + suffix.slice(1);
          const child = value[field];
          if (
            !VALUE_FIELDS[prefix].includes(native) ||
            (child !== null && typeof child === 'object')
          )
            error = 'Unsupported scalar source choice.';
          else group[native] = child;
          used.add(field);
        }
        out[prefix] = visit(group);
        continue;
      }
      const match = key.match(
        /^(.*)(ChoiceId|ChoiceLabel|ChoiceFromWord|ChoiceToWord|SpanFromWord|SpanToWord)$/u,
      );
      if (!match) {
        out[key] = visit(value[key]);
        continue;
      }
      const prefix = match[1];
      if (!slot(prefix) || Object.hasOwn(value, prefix) || Object.hasOwn(out, prefix)) {
        error = 'Invalid or colliding compact source selector.';
        continue;
      }
      if (match[2].startsWith('Choice')) {
        const keys = [
          `${prefix}ChoiceId`,
          `${prefix}ChoiceLabel`,
          `${prefix}ChoiceFromWord`,
          `${prefix}ChoiceToWord`,
        ];
        const id = value[keys[0]],
          label = value[keys[1]],
          fromWord = value[keys[2]],
          toWord = value[keys[3]];
        if (
          typeof id !== 'string' ||
          typeof label !== 'string' ||
          !word(fromWord) ||
          !word(toWord) ||
          toWord < fromWord
        ) {
          error = 'Incomplete identity source choice.';
          continue;
        }
        keys.forEach((field) => {
          used.add(field);
          delete out[field];
        });
        out[prefix] = { id, label, source: { fromWord, toWord } };
      } else {
        const fromWord = value[`${prefix}SpanFromWord`],
          toWord = value[`${prefix}SpanToWord`];
        if (!word(fromWord) || !word(toWord) || toWord < fromWord) {
          error = 'Incomplete word-span source choice.';
          continue;
        }
        used.add(key);
        used.add(`${prefix}SpanToWord`);
        delete out[`${prefix}SpanToWord`];
        out[prefix] = { fromWord, toWord };
      }
    }
    return out;
  };
  const choices = visit(input as ChoiceObject);
  return !error && record(choices)
    ? { ok: true, choices }
    : { ok: false, message: error || 'Expected source choices object.' };
}
