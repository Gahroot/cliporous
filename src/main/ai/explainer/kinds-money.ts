/**
 * v3 money, time & data kinds (pictogram, ranking, receipt, streak, spectrum)
 * as planner specs. Mirrors the structure of kinds-core.ts.
 */

import type { SceneCue } from '../../remotion/compositions/explainer/types';
import { type AnyKindSpec, isRec, type KindSpec, num, parseTimedList } from './kind-spec';
import { after } from './kinds-ideas';

const L = {
  pictoLabel: 26,
  pictoStat: 8,
  rankTitle: 20,
  rankItem: 20,
  receiptTitle: 18,
  receiptLabel: 16,
  receiptAmount: 9,
  streakLabel: 22,
  spectrumEnd: 12,
  spectrumMarker: 12,
} as const;

/** Streak fill speed bounds (days per second) so the grid reads, not blurs. */
const STREAK_MIN_FILL_SEC = 0.8;

export const pictogramSpec: KindSpec<'pictogram'> = {
  kind: 'pictogram',
  describe:
    'they give a share of people/things ("1 in 4 founders", "8 out of 10 people", "90% of startups"). A grid of person figures (total 4-100) with `filled` lit up, a headline stat and a short caption.',
  schema: '{"kind":"pictogram","total":N,"filled":N,"stat":"1 in 4","label":"...","fillWord":N}',
  limits: `stat ≤ ${L.pictoStat}, label ≤ ${L.pictoLabel}; total 4-100 (use 10 or 100 for percentages)`,
  layouts: ['stack', 'over', 'pip'],
  durationSec: [3, 7],
  family: 'data',
  triggers: [
    /\b(\d+|one|two|three|four|five|nine) (in|out of) (\d+|ten|four|five|three|every)\b/,
    /\bpercent|%/,
  ],
  avoid: 'a single money/growth figure (number)',
  parse: (raw, ctx) => {
    const total = num(raw.total, 4, 100);
    const filled = num(raw.filled, 0, 100);
    const stat = ctx.str(raw.stat, L.pictoStat);
    const label = ctx.str(raw.label, L.pictoLabel);
    const fillW = ctx.inWin(raw.fillWord);
    if (total === null || filled === null || !stat || !label || fillW === null) return null;
    const t = Math.round(total);
    const f = Math.round(filled);
    if (f > t) {
      ctx.issues.push(`filled (${f}) must be ≤ total (${t})`);
      return null;
    }
    return { kind: 'pictogram', total: t, filled: f, stat, label, fillAt: ctx.at(fillW) };
  },
  cues: (s) => [
    { kind: 'slide', at: Math.max(0, s.fillAt - 0.4), gain: 0.5 },
    { kind: 'rise', at: s.fillAt, gain: 0.45 },
    { kind: 'pop', at: s.fillAt + 0.9, gain: 0.7 },
  ],
};

export const rankingSpec: KindSpec<'ranking'> = {
  kind: 'ranking',
  describe:
    'they rank things ("top 3", "the best… the worst", "number one is…"). 2-5 rows slot into rank order (1 = best) as each is named; the #1 row glows.',
  schema: '{"kind":"ranking","title":"..." or null,"items":[{"label":"...","rank":1,"word":N}]}',
  limits: `title ≤ ${L.rankTitle}, item ≤ ${L.rankItem} (2-5 items, ranks 1..count, unique)`,
  layouts: ['stack', 'pip', 'stack-flipped'],
  durationSec: [3.5, 10],
  family: 'list',
  triggers: [/\b(top \d+|top (three|five|ten)|number one|#1|ranked|ranking|best|worst|tier)\b/],
  avoid: 'an unranked list of steps (checklist) or a race to 1st (podium)',
  parse: (raw, ctx) => {
    const ranks = new Set<number>();
    const items = parseTimedList(
      raw.items,
      ctx,
      (it) => {
        const label = ctx.str(it.label, L.rankItem);
        const rank = num(it.rank, 1, 5);
        if (!label || rank === null || !Number.isInteger(rank) || ranks.has(rank)) return null;
        ranks.add(rank);
        return { label, rank };
      },
      [2, 5],
    );
    if (!items) return null;
    // Ranks must be 1..n so the rows stack without holes.
    const sorted = [...items].sort((a, b) => a.rank - b.rank);
    const dense = new Map(sorted.map((it, i) => [it, i + 1]));
    const title =
      raw.title === null || raw.title === undefined ? null : ctx.str(raw.title, L.rankTitle);
    return {
      kind: 'ranking',
      ...(title ? { title } : {}),
      items: items.map((it) => ({ label: it.label, rank: dense.get(it) ?? it.rank, at: it.t })),
    };
  },
  cues: (s) =>
    s.items.map(
      (it): SceneCue =>
        it.rank === 1
          ? { kind: 'pop', at: it.at, gain: 0.85 }
          : { kind: 'tick', at: it.at, gain: 0.8 },
    ),
};

export const receiptSpec: KindSpec<'receipt'> = {
  kind: 'receipt',
  describe:
    'they break down costs or time ("rent is 2k, ads 500, tools 200 — that\'s 2,700 a month"). A receipt prints 1-5 line items then a bold total. Amounts are short display strings ("$40", "3 hrs").',
  schema:
    '{"kind":"receipt","title":"...","lines":[{"label":"...","amount":"$40","word":N}],"total":{"label":"Total","amount":"$2,700"},"totalWord":N}',
  limits: `title ≤ ${L.receiptTitle}, line label ≤ ${L.receiptLabel}, amount ≤ ${L.receiptAmount} (1-5 lines)`,
  layouts: ['stack', 'over', 'pip'],
  durationSec: [3.5, 9],
  family: 'data',
  triggers: [
    /\b(costs?|spend|spent|bill|budget|fees?|expenses?|per month|a month|total|add it up|breakdown)\b/,
    /\$/,
  ],
  parse: (raw, ctx) => {
    const title = ctx.str(raw.title, L.receiptTitle);
    const lines = parseTimedList(
      raw.lines,
      ctx,
      (l) => {
        const label = ctx.str(l.label, L.receiptLabel);
        const amount = ctx.str(l.amount, L.receiptAmount);
        return label && amount ? { label, amount } : null;
      },
      [1, 5],
    );
    const totalW = ctx.inWin(raw.totalWord);
    if (!title || !lines || !isRec(raw.total) || totalW === null) return null;
    const totalLabel = ctx.str(raw.total.label, L.receiptLabel);
    const totalAmount = ctx.str(raw.total.amount, L.receiptAmount);
    if (!totalLabel || !totalAmount) return null;
    const lastLine = lines[lines.length - 1]?.t ?? ctx.win.startTime;
    const totalAt = after(ctx, ctx.at(totalW), lastLine, 0.45);
    if (totalAt - lastLine < 0.25) return null;
    return {
      kind: 'receipt',
      title,
      lines: lines.map((l) => ({ label: l.label, amount: l.amount, at: l.t })),
      total: { label: totalLabel, amount: totalAmount },
      totalAt,
    };
  },
  cues: (s) => [
    ...s.lines.map((l): SceneCue => ({ kind: 'tick', at: l.at, gain: 0.7 })),
    { kind: 'thump', at: s.totalAt + 0.1, gain: 0.55 },
  ],
};

export const streakSpec: KindSpec<'streak'> = {
  kind: 'streak',
  describe:
    'they talk about doing something every day / a challenge / a streak ("30 days straight", "I posted daily for a year"). A calendar grid of 5-35 days fills in; optional missed day breaks the chain.',
  schema: '{"kind":"streak","days":30,"label":"...","fillWord":N,"doneWord":N,"missDay":N or null}',
  limits: `label ≤ ${L.streakLabel}; days 5-35 (a year → 35 is fine, the counter shows the grid)`,
  layouts: ['stack', 'over', 'pip'],
  durationSec: [3, 8],
  family: 'data',
  triggers: [
    /\b(every ?day|daily|streak|in a row|straight|days|challenge|consisten\w*|habit|each morning)\b/,
  ],
  avoid: 'a repeating cycle (loop)',
  parse: (raw, ctx) => {
    const days = num(raw.days, 5, 35);
    const label = ctx.str(raw.label, L.streakLabel);
    const fillW = ctx.inWin(raw.fillWord);
    const doneW = ctx.inWin(raw.doneWord);
    if (days === null || !label || fillW === null || doneW === null) return null;
    const d = Math.round(days);
    const fillAt = ctx.at(fillW);
    const doneAt = after(ctx, ctx.at(doneW), fillAt, STREAK_MIN_FILL_SEC);
    if (doneAt - fillAt < 0.5) return null;
    const miss = num(raw.missDay, 2, d);
    return {
      kind: 'streak',
      days: d,
      label,
      fillAt,
      doneAt,
      ...(miss === null ? {} : { missDay: Math.round(miss) }),
    };
  },
  cues: (s) => [
    { kind: 'rise', at: s.fillAt, gain: 0.45 },
    { kind: s.missDay === undefined ? 'pop' : 'thump', at: s.doneAt, gain: 0.7 },
  ],
};

export const spectrumSpec: KindSpec<'spectrum'> = {
  kind: 'spectrum',
  describe:
    'they place something on a scale between two extremes ("it\'s not all or nothing", "somewhere between lazy and burnt out", "move from X towards Y"). A slider with two end labels; a marker appears at `from` (0-1) and glides to `to`.',
  schema:
    '{"kind":"spectrum","left":"...","right":"...","from":0.2,"to":0.8,"markerLabel":"..." or null,"showWord":N,"moveWord":N}',
  limits: `end labels ≤ ${L.spectrumEnd}, marker ≤ ${L.spectrumMarker}; from/to between 0 and 1`,
  layouts: ['stack', 'over', 'pip'],
  durationSec: [3, 7],
  family: 'compare',
  triggers: [
    /\b(spectrum|scale|somewhere between|in between|extreme|balance between|middle ground|all or nothing|dial)\b/,
  ],
  avoid: 'two separate options (versus)',
  parse: (raw, ctx) => {
    const left = ctx.str(raw.left, L.spectrumEnd);
    const right = ctx.str(raw.right, L.spectrumEnd);
    const from = num(raw.from, 0, 1);
    const to = num(raw.to, 0, 1);
    const showW = ctx.inWin(raw.showWord);
    const moveW = ctx.inWin(raw.moveWord);
    if (!left || !right || from === null || to === null || showW === null || moveW === null) {
      return null;
    }
    const showAt = ctx.at(showW);
    const moveAt = after(ctx, ctx.at(moveW), showAt, 0.5);
    const marker =
      raw.markerLabel === null || raw.markerLabel === undefined
        ? null
        : ctx.str(raw.markerLabel, L.spectrumMarker);
    return {
      kind: 'spectrum',
      left,
      right,
      from,
      to,
      ...(marker ? { markerLabel: marker } : {}),
      showAt,
      moveAt,
    };
  },
  cues: (s) => [
    { kind: 'tick', at: s.showAt, gain: 0.7 },
    { kind: 'slide', at: s.moveAt, gain: 0.7 },
  ],
};

export const MONEY_KIND_SPECS: readonly AnyKindSpec[] = [
  pictogramSpec,
  rankingSpec,
  receiptSpec,
  streakSpec,
  spectrumSpec,
];
