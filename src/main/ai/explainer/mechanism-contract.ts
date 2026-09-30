import type { ParseContext, Rec } from './kind-spec';

/** Keep authored-kind repair feedback bounded like makeParseContext's helpers. */
export function mechanismIssue(ctx: ParseContext, message: string): null {
  if (ctx.issues.length < 4 && !ctx.issues.includes(message)) ctx.issues.push(message);
  return null;
}

function normalized(text: string): string {
  const words = text.normalize('NFKC').toLowerCase().replace(/−/g, '-');
  // Numeric punctuation is meaning, not decoration: never turn -50% into 50.
  return (words.match(/[+-]?(?:[$€£]\s*)?\d+(?:[.,]\d+)*(?:%|[a-z]+)?|[\p{L}\p{N}]+/gu) ?? [])
    .map((word) => word.replace(/\s/g, ''))
    .join(' ');
}

/** Require a bounded, contiguous source phrase, not invented copy or numbers. */
export function sourceLabel(raw: unknown, ctx: ParseContext, max: number): string | null {
  const label = ctx.str(raw, max);
  if (!label) return mechanismIssue(ctx, `label must contain 1..${max} characters`);
  const phrase = normalized(label);
  const source = normalized(
    ctx.words
      .slice(ctx.win.startWord, ctx.win.endWord + 1)
      .map((word) => word.text)
      .join(' '),
  );
  if (!phrase || !` ${source} `.includes(` ${phrase} `)) {
    return mechanismIssue(
      ctx,
      'label must quote a phrase from this scene window; no invented numbers or outcomes',
    );
  }
  return label;
}

/** Validate source order and actual phase space; never repair compressed beats. */
export function strictMechanismBeats(
  raw: Rec,
  ctx: ParseContext,
  fields: readonly string[],
  minGaps: readonly number[],
  finalHold: number,
): number[] | null {
  if (
    !Number.isFinite(ctx.win.startTime) ||
    !Number.isFinite(ctx.win.endTime) ||
    ctx.words
      .slice(ctx.win.startWord, ctx.win.endWord + 1)
      .some((word) => !Number.isFinite(word.start) || !Number.isFinite(word.end))
  ) {
    return mechanismIssue(ctx, 'scene source word times must all be finite');
  }
  const beats: number[] = [];
  let previousIndex = -1;
  let previousSourceTime = Number.NEGATIVE_INFINITY;
  for (const [n, field] of fields.entries()) {
    const index = ctx.inWin(raw[field]);
    if (index === null)
      return mechanismIssue(ctx, `${field} must be an integer index inside this scene window`);
    if (index <= previousIndex) {
      return mechanismIssue(ctx, `${field} must follow ${fields[n - 1]} in source index order`);
    }
    const word = ctx.words[index];
    if (!word || word.start <= previousSourceTime) {
      return mechanismIssue(ctx, `${field} source time must strictly increase`);
    }
    // The entrance's normal safe-edge clamp is allowed; later phases stay on source time.
    const at = n === 0 ? ctx.at(index) : word.start;
    const previous = beats[n - 1];
    const gap = minGaps[n - 1] ?? 0;
    if (previous !== undefined && (at <= previous || at - previous < gap - 1e-6)) {
      return mechanismIssue(
        ctx,
        `${field} must be at least ${gap}s after ${fields[n - 1]}; phases are too compressed`,
      );
    }
    beats.push(at);
    previousIndex = index;
    previousSourceTime = word.start;
  }
  const last = beats[beats.length - 1];
  if (last === undefined || last > ctx.win.endTime - finalHold + 1e-6) {
    return mechanismIssue(
      ctx,
      `${fields[fields.length - 1]} must leave at least ${finalHold}s of final hold`,
    );
  }
  return beats;
}
