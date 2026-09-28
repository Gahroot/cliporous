/**
 * v3 framework & idea kinds (equation, quadrant, venn, definition, study) as
 * planner specs. Mirrors the structure of kinds-core.ts.
 */

import {
  EQUATION_OPS,
  type EquationOp,
  type QuadrantCell,
  type SceneCue,
} from '../../remotion/compositions/explainer/types';
import {
  type AnyKindSpec,
  isRec,
  type KindSpec,
  type ParseContext,
  parseTimedList,
} from './kind-spec';

const L = {
  eqTerm: 14,
  eqResult: 16,
  quadAxis: 12,
  quadItem: 16,
  vennLabel: 14,
  defTerm: 20,
  defTag: 12,
  defMeaning: 72,
  studySource: 26,
  studyFinding: 70,
  studyStat: 8,
} as const;

/** Beat `t` pushed at least `gap` after `prev`, capped at the window's last beat. */
export function after(ctx: ParseContext, t: number, prev: number, gap: number): number {
  return Math.min(ctx.lastBeat, Math.max(t, prev + gap));
}

const OP_ALIASES: Readonly<Record<string, EquationOp>> = {
  '+': '+',
  plus: '+',
  '-': '−',
  '−': '−',
  minus: '−',
  x: '×',
  '*': '×',
  '×': '×',
  times: '×',
  '/': '÷',
  '÷': '÷',
};

function op(v: unknown): EquationOp {
  if (typeof v !== 'string') return '+';
  const k = v.trim().toLowerCase();
  return (
    OP_ALIASES[k] ?? ((EQUATION_OPS as readonly string[]).includes(k) ? (k as EquationOp) : '+')
  );
}

export const equationSpec: KindSpec<'equation'> = {
  kind: 'equation',
  describe:
    'they state a formula or recipe ("consistency times time equals results", "A plus B is C"). 2-3 term tiles joined by + − × ÷, then "=" and the result tile lands.',
  schema:
    '{"kind":"equation","terms":[{"text":"...","word":N}],"ops":["+"|"−"|"×"|"÷"],"result":"...","resultWord":N}',
  limits: `term ≤ ${L.eqTerm} (2-3 terms, ops = terms − 1), result ≤ ${L.eqResult}`,
  layouts: ['stack', 'takeover', 'over'],
  durationSec: [3, 8],
  family: 'framework',
  triggers: [/\b(equals|equation|formula|plus|times|multipl|recipe|adds? up)\b/],
  avoid: 'a before/after change (before-after) or a plain list (checklist)',
  parse: (raw, ctx) => {
    const terms = parseTimedList(
      raw.terms,
      ctx,
      (t) => {
        const text = ctx.str(t.text, L.eqTerm);
        return text ? { text } : null;
      },
      [2, 3],
    );
    const result = ctx.str(raw.result, L.eqResult);
    const resultW = ctx.inWin(raw.resultWord);
    if (!terms || !result || resultW === null) return null;
    const rawOps = Array.isArray(raw.ops) ? raw.ops : [];
    const ops = terms.slice(1).map((_, i) => op(rawOps[i]));
    const lastTerm = terms[terms.length - 1]?.t ?? ctx.win.startTime;
    const resultAt = after(ctx, ctx.at(resultW), lastTerm, 0.45);
    if (resultAt - lastTerm < 0.25) return null;
    return {
      kind: 'equation',
      terms: terms.map((t) => ({ text: t.text, at: t.t })),
      ops,
      result,
      resultAt,
    };
  },
  cues: (s) => [
    ...s.terms.map((t): SceneCue => ({ kind: 'tick', at: t.at, gain: 0.85 })),
    { kind: 'pop', at: s.resultAt + 0.15, gain: 0.9 },
  ],
};

const CELLS: readonly QuadrantCell[] = ['tl', 'tr', 'bl', 'br'];

export const quadrantSpec: KindSpec<'quadrant'> = {
  kind: 'quadrant',
  describe:
    'they sort things on two dimensions (effort vs impact, urgent vs important, easy/hard × high/low value). A 2×2 grid with two axis names; 1-4 items drop into cells (tl = low x/high y, tr = high x/high y, bl = low both, br = high x/low y); optionally the winning cell lights up.',
  schema:
    '{"kind":"quadrant","xLabel":"...","yLabel":"...","items":[{"label":"...","cell":"tl|tr|bl|br","word":N}],"winner":"tl|tr|bl|br" or null,"winnerWord":N or null}',
  limits: `axis label ≤ ${L.quadAxis}, item ≤ ${L.quadItem} (1-4 items, one per cell)`,
  layouts: ['stack', 'pip', 'takeover'],
  durationSec: [4, 10],
  family: 'framework',
  triggers: [
    /\b(matrix|quadrant|two by two|2x2|urgent|important|effort|impact|high value|low value|axis)\b/,
  ],
  avoid: 'only two options compared (versus)',
  parse: (raw, ctx) => {
    const xLabel = ctx.str(raw.xLabel, L.quadAxis);
    const yLabel = ctx.str(raw.yLabel, L.quadAxis);
    if (!xLabel || !yLabel) return null;
    const used = new Set<QuadrantCell>();
    const items = parseTimedList(
      raw.items,
      ctx,
      (it) => {
        const label = ctx.str(it.label, L.quadItem);
        const cell = CELLS.find((c) => c === it.cell);
        if (!label || !cell || used.has(cell)) return null;
        used.add(cell);
        return { label, cell };
      },
      [1, 4],
    );
    if (!items) return null;
    const scene = {
      kind: 'quadrant' as const,
      xLabel,
      yLabel,
      items: items.map((i) => ({ label: i.label, cell: i.cell, at: i.t })),
    };
    const winner = CELLS.find((c) => c === raw.winner);
    const winnerW = ctx.inWin(raw.winnerWord);
    if (!winner || winnerW === null) return scene;
    const lastItem = items[items.length - 1]?.t ?? ctx.win.startTime;
    return { ...scene, winner, winnerAt: after(ctx, ctx.at(winnerW), lastItem, 0.4) };
  },
  cues: (s) => [
    { kind: 'slide', at: Math.max(0, (s.items[0]?.at ?? 0.3) - 0.25), gain: 0.55 },
    ...s.items.map((i): SceneCue => ({ kind: 'tick', at: i.at, gain: 0.85 })),
    ...(s.winnerAt === undefined ? [] : [{ kind: 'pop' as const, at: s.winnerAt, gain: 0.8 }]),
  ],
};

export const vennSpec: KindSpec<'venn'> = {
  kind: 'venn',
  describe:
    'they name two things and the magic where they overlap ("the sweet spot where passion meets demand"). Two circles slide together; the overlap label lands last.',
  schema:
    '{"kind":"venn","left":{"label":"...","word":N},"right":{"label":"...","word":N},"center":{"label":"...","word":N}}',
  limits: `each label ≤ ${L.vennLabel}`,
  layouts: ['stack', 'takeover', 'pip'],
  durationSec: [3, 8],
  family: 'framework',
  triggers: [
    /\b(overlap|intersection|sweet spot|where .{1,30} meets|venn|both|combination|middle)\b/,
  ],
  avoid: 'two options where one wins (versus)',
  parse: (raw, ctx) => {
    const part = (v: unknown): { label: string; w: number } | null => {
      if (!isRec(v)) return null;
      const label = ctx.str(v.label, L.vennLabel);
      const w = ctx.inWin(v.word);
      return label && w !== null ? { label, w } : null;
    };
    const left = part(raw.left);
    const right = part(raw.right);
    const center = part(raw.center);
    if (!left || !right || !center) return null;
    const leftAt = ctx.at(left.w);
    const rightAt = after(ctx, ctx.at(right.w), leftAt, 0.3);
    const centerAt = after(ctx, ctx.at(center.w), rightAt, 0.6);
    if (centerAt - rightAt < 0.3) return null;
    return {
      kind: 'venn',
      left: { label: left.label, at: leftAt },
      right: { label: right.label, at: rightAt },
      center: { label: center.label, at: centerAt },
    };
  },
  cues: (s) => [
    { kind: 'slide', at: s.left.at, gain: 0.7 },
    { kind: 'slide', at: s.right.at, gain: 0.7 },
    { kind: 'pop', at: s.center.at, gain: 0.85 },
  ],
};

export const definitionSpec: KindSpec<'definition'> = {
  kind: 'definition',
  describe:
    'they define a term or name a concept ("ROI is simply…", "what we call a moat"). A dictionary card: the term, an optional small tag, then the meaning in the speaker\'s words.',
  schema:
    '{"kind":"definition","term":"...","tag":"..." or null,"meaning":"...","termWord":N,"meaningWord":N}',
  limits: `term ≤ ${L.defTerm}, tag ≤ ${L.defTag}, meaning ≤ ${L.defMeaning}`,
  layouts: ['stack', 'over', 'pip'],
  durationSec: [3, 8],
  family: 'words',
  triggers: [
    /\b(means|meaning|definition|defined|is called|we call|what is|stands for|in other words|basically)\b/,
  ],
  parse: (raw, ctx) => {
    const term = ctx.str(raw.term, L.defTerm);
    const meaning = ctx.str(raw.meaning, L.defMeaning);
    const termW = ctx.inWin(raw.termWord);
    const meaningW = ctx.inWin(raw.meaningWord);
    if (!term || !meaning || termW === null || meaningW === null) return null;
    const termAt = ctx.at(termW);
    const meaningAt = after(ctx, ctx.at(meaningW), termAt, 0.6);
    if (meaningAt - termAt < 0.3) return null;
    const tag = raw.tag === null || raw.tag === undefined ? null : ctx.str(raw.tag, L.defTag);
    return {
      kind: 'definition',
      term,
      ...(tag ? { tag } : {}),
      meaning,
      termAt,
      meaningAt,
    };
  },
  cues: (s) => [
    { kind: 'slide', at: s.termAt, gain: 0.7 },
    { kind: 'flip', at: s.meaningAt, gain: 0.55 },
  ],
};

export const studySpec: KindSpec<'study'> = {
  kind: 'study',
  describe:
    'they cite research, data or an expert source ("a Harvard study found…", "according to Gallup"). A paper card with the source, the finding and an optional big stat.',
  schema:
    '{"kind":"study","source":"...","finding":"...","stat":"73%" or null,"sourceWord":N,"findingWord":N}',
  limits: `source ≤ ${L.studySource}, finding ≤ ${L.studyFinding}, stat ≤ ${L.studyStat}`,
  layouts: ['stack', 'over', 'pip'],
  durationSec: [3.5, 9],
  family: 'data',
  triggers: [
    /\b(study|studies|research|researchers|survey|according to|found that|scientists|university|report|data shows|paper)\b/,
  ],
  avoid: 'a lone number with no source (number)',
  parse: (raw, ctx) => {
    const source = ctx.str(raw.source, L.studySource);
    const finding = ctx.str(raw.finding, L.studyFinding);
    const sourceW = ctx.inWin(raw.sourceWord);
    const findingW = ctx.inWin(raw.findingWord);
    if (!source || !finding || sourceW === null || findingW === null) return null;
    const sourceAt = ctx.at(sourceW);
    const findingAt = after(ctx, ctx.at(findingW), sourceAt, 0.5);
    if (findingAt - sourceAt < 0.3) return null;
    const stat =
      raw.stat === null || raw.stat === undefined ? null : ctx.str(raw.stat, L.studyStat);
    return {
      kind: 'study',
      source,
      finding,
      ...(stat ? { stat } : {}),
      sourceAt,
      findingAt,
    };
  },
  cues: (s) => [
    { kind: 'slide', at: s.sourceAt, gain: 0.75 },
    { kind: s.stat ? 'pop' : 'flip', at: s.findingAt, gain: 0.7 },
  ],
};

export const IDEA_KIND_SPECS: readonly AnyKindSpec[] = [
  equationSpec,
  quadrantSpec,
  vennSpec,
  definitionSpec,
  studySpec,
];
