/**
 * Text-led scene kinds (statement, number, timeline, notes, question) as
 * planner specs. Mirrors kinds-core.ts.
 */

import type { SceneCue } from '../../remotion/compositions/explainer/types';
import { type AnyKindSpec, idx, type KindSpec, num, parseTimedList } from './kind-spec';

const L = {
  statementWord: 14,
  numberLabel: 22,
  numberAffix: 4,
  timelineStep: 16,
  notesTitle: 20,
  notesBadge: 10,
  notesLine: 26,
  question: 60,
  answer: 40,
} as const;

/** Largest figure the number scene will count to (exclusive). */
const NUMBER_MAX = 1e9;
/** Shortest count-up that still reads as a count (seconds). */
const MIN_COUNT_SEC = 0.6;
/** Card flip needs this long after the question lands before the answer. */
const MIN_ANSWER_GAP_SEC = 0.8;

export const statementSpec: KindSpec<'statement'> = {
  kind: 'statement',
  describe:
    'a short, punchy line worth shouting (1-3 words, e.g. "Never", "Stop guessing", "Ship it daily"). Huge editorial type; each word appears on the word they say it; one accent word.',
  schema:
    '{"kind":"statement","words":[{"text":"Stop","word":N},{"text":"guessing","word":N}],"accentIndex":1 or null}',
  limits: `1-3 single words, each ≤ ${L.statementWord} chars`,
  layouts: ['takeover', 'stack'],
  durationSec: [1.5, 4],
  family: 'words',
  general: true,
  triggers: [],
  parse: (raw, ctx) => {
    const words = parseTimedList(
      raw.words,
      ctx,
      (w) => {
        const text = ctx.str(w.text, L.statementWord);
        return text && !text.includes(' ') ? { text } : null;
      },
      [1, 3],
    );
    if (!words) return null;
    // Every provided word must survive — a dropped word changes the sentence.
    if (Array.isArray(raw.words) && raw.words.length !== words.length) return null;
    const accentIndex = idx(raw.accentIndex, 0, words.length - 1);
    return {
      kind: 'statement',
      words: words.map((w) => ({ text: w.text, at: w.t })),
      ...(accentIndex === null ? {} : { accentIndex }),
    };
  },
  cues: (s) => {
    const accent = s.words[s.accentIndex ?? s.words.length - 1] ?? s.words[s.words.length - 1];
    return accent ? [{ kind: 'thump', at: accent.at }] : [];
  },
};

export const numberSpec: KindSpec<'number'> = {
  kind: 'number',
  describe:
    'they say a striking figure ("3x", "$40k", "87%", "12 hours"). The number counts up and lands with a bounce on the word; short label under it. Write "$40k" as value 40, prefix "$", suffix "k".',
  schema:
    '{"kind":"number","value":40,"prefix":"$" or null,"suffix":"k" or null,"decimals":0,"label":"...","countWord":N,"landWord":N}',
  limits: `label ≤ ${L.numberLabel}, prefix/suffix ≤ ${L.numberAffix}, decimals 0-2, 0 < value < 1e9`,
  layouts: ['over', 'stack', 'takeover'],
  durationSec: [2, 5],
  family: 'data',
  general: true,
  triggers: [/\d/, /\b(percent|million|billion|thousand|hundred|times|double|triple)\b/],
  avoid: '"1 in N" / "X out of Y" people (pictogram)',
  parse: (raw, ctx) => {
    const value = num(raw.value, 0, NUMBER_MAX);
    if (value === null || value <= 0 || value >= NUMBER_MAX) return null;
    const label = ctx.str(raw.label, L.numberLabel);
    if (!label) return null;
    const decimals =
      raw.decimals === null || raw.decimals === undefined ? 0 : idx(raw.decimals, 0, 2);
    if (decimals === null) return null;
    // A value that rounds to 0 at the shown precision would count to nothing.
    if (Math.round(value * 10 ** decimals) <= 0) return null;
    const affix = (v: unknown): string | null | undefined =>
      v === null || v === undefined ? undefined : ctx.str(v, L.numberAffix);
    const prefix = affix(raw.prefix);
    const suffix = affix(raw.suffix);
    if (prefix === null || suffix === null) return null;
    const landW = ctx.inWin(raw.landWord);
    if (landW === null) return null;
    const countW = ctx.inWin(raw.countWord);
    const earliest = ctx.at(ctx.win.startWord);
    let landAt = ctx.at(landW);
    let countAt = countW === null ? landAt - 1 : ctx.at(countW);
    // The count must precede the landing by enough to read as a count-up.
    countAt = Math.max(earliest, Math.min(countAt, landAt - MIN_COUNT_SEC));
    if (landAt - countAt < MIN_COUNT_SEC) landAt = Math.min(ctx.lastBeat, countAt + MIN_COUNT_SEC);
    if (landAt - countAt < 0.35) return null;
    return {
      kind: 'number',
      value,
      ...(prefix ? { prefix } : {}),
      ...(suffix ? { suffix } : {}),
      ...(decimals > 0 ? { decimals } : {}),
      label,
      countAt,
      landAt,
    };
  },
  cues: (s) => [
    { kind: 'rise', at: s.countAt, gain: 0.55 },
    { kind: 'pop', at: s.landAt },
  ],
};

export const timelineSpec: KindSpec<'timeline'> = {
  kind: 'timeline',
  describe:
    'a sequence in time ("first… then… finally", phases, years, day 1 → day 30). 2-5 dots on a line light up in order on the words.',
  schema: '{"kind":"timeline","steps":[{"label":"...","word":N}]}',
  limits: `step label ≤ ${L.timelineStep}`,
  layouts: ['stack', 'pip', 'stack-flipped'],
  durationSec: [3, 10],
  family: 'story',
  triggers: [/\b(then|next|after that|finally|years? later|months? later|back in|\d{4})\b/],
  avoid: 'a story with highs and lows (journey) or climbing towards a goal (stairs)',
  parse: (raw, ctx) => {
    const steps = parseTimedList(
      raw.steps,
      ctx,
      (s) => {
        const label = ctx.str(s.label, L.timelineStep);
        return label ? { label } : null;
      },
      [2, 5],
    );
    if (!steps) return null;
    return { kind: 'timeline', steps: steps.map((s) => ({ label: s.label, at: s.t })) };
  },
  cues: (s) => s.steps.map((st): SceneCue => ({ kind: 'tick', at: st.at, gain: 0.8 })),
};

export const notesSpec: KindSpec<'notes'> = {
  kind: 'notes',
  describe:
    'they describe what something involves (2-5 short notes on a card, e.g. title "Human calls", badge "Human"). Each line types in on the word they say it.',
  schema: '{"kind":"notes","title":"...","badge":"..." or null,"lines":[{"text":"...","word":N}]}',
  limits: `title ≤ ${L.notesTitle}, badge ≤ ${L.notesBadge}, line ≤ ${L.notesLine}`,
  layouts: ['stack', 'over', 'pip'],
  durationSec: [3.5, 10],
  family: 'list',
  triggers: [/\b(notes?|write (this|it) down|remember|reminder|takeaways?|key points?)\b/],
  parse: (raw, ctx) => {
    const title = ctx.str(raw.title, L.notesTitle);
    if (!title) return null;
    const badge =
      raw.badge === null || raw.badge === undefined ? undefined : ctx.str(raw.badge, L.notesBadge);
    if (badge === null) return null;
    const lines = parseTimedList(
      raw.lines,
      ctx,
      (l) => {
        const text = ctx.str(l.text, L.notesLine);
        return text ? { text } : null;
      },
      [2, 5],
    );
    if (!lines) return null;
    return {
      kind: 'notes',
      title,
      ...(badge ? { badge } : {}),
      lines: lines.map((l) => ({ text: l.text, at: l.t })),
    };
  },
  cues: (s) => s.lines.map((l): SceneCue => ({ kind: 'tick', at: l.at, gain: 0.5 })),
};

export const questionSpec: KindSpec<'question'> = {
  kind: 'question',
  describe:
    'they ask a question (rhetorical or to the viewer), optionally answering it right after. The card flips to the short answer on the answer word.',
  schema:
    '{"kind":"question","question":"...","askWord":N,"answer":"..." or null,"answerWord":N or null}',
  limits: `question ≤ ${L.question}, answer ≤ ${L.answer}`,
  layouts: ['over', 'stack', 'takeover'],
  durationSec: [2.5, 8],
  family: 'words',
  triggers: [/\?/, /\b(why|how come|what if|ask yourself|question)\b/],
  parse: (raw, ctx) => {
    const question = ctx.str(raw.question, L.question);
    const askW = ctx.inWin(raw.askWord);
    if (!question || askW === null) return null;
    const askAt = ctx.at(askW);
    const base = { kind: 'question' as const, question, askAt };
    if (raw.answer === null || raw.answer === undefined) return base;
    const answer = ctx.str(raw.answer, L.answer);
    if (!answer) return null;
    const ansW = ctx.inWin(raw.answerWord);
    if (ansW === null) return base;
    const answerAt = Math.min(ctx.lastBeat, Math.max(ctx.at(ansW), askAt + MIN_ANSWER_GAP_SEC));
    // No room to read the question before the flip: keep the question only.
    if (answerAt - askAt < 0.6) return base;
    return { ...base, answer, answerAt };
  },
  cues: (s) => [
    { kind: 'slide', at: s.askAt, gain: 0.7 },
    ...(s.answerAt === undefined ? [] : [{ kind: 'flip' as const, at: s.answerAt }]),
  ],
};

export const TEXT_KIND_SPECS: readonly AnyKindSpec[] = [
  statementSpec,
  numberSpec,
  timelineSpec,
  notesSpec,
  questionSpec,
];
