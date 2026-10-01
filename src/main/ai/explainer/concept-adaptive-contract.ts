import {
  ADAPTIVE_LIMITS,
  type AdaptiveEvidence,
} from '../../remotion/compositions/explainer/concepts/adaptive/types';
import { isRec, type ParseContext } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import { technologyEvidence, technologyPhrase } from './technology-contract';

export function adaptiveKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}'-]+/gu, ' ')
    .trim();
}

export function adaptiveActor(label: string): string {
  const escaped = adaptiveKey(label)
    .replace(/^(?:the|a|an) /, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `(?:the |a |an )?${escaped}`;
}

/** Whole, bounded source clauses only: cropping out 'not', 'may', or an actor is forbidden. */
export function adaptiveEvidence(raw: unknown, ctx: ParseContext): AdaptiveEvidence | null {
  if (!isRec(raw)) return mechanismIssue(ctx, 'adaptive relationships need indexed evidence');
  const fromWord = ctx.inWin(raw.fromWord);
  const toWord = ctx.inWin(raw.toWord);
  if (
    fromWord === null ||
    toWord === null ||
    fromWord > toWord ||
    toWord - fromWord + 1 > ADAPTIVE_LIMITS.evidenceWords ||
    (fromWord > ctx.win.startWord && !/[.!?;]$/.test(ctx.words[fromWord - 1]?.text ?? '')) ||
    (toWord < ctx.win.endWord && !/[.!?;]$/.test(ctx.words[toWord]?.text ?? ''))
  )
    return mechanismIssue(
      ctx,
      'adaptive evidence must be one complete local clause (at most 32 words)',
    );
  const phrase = technologyEvidence(ctx, fromWord, toWord);
  if (!phrase || /[.!?;]\s+\S/.test(phrase)) {
    return mechanismIssue(ctx, 'do not combine unrelated source clauses as relationship evidence');
  }
  return { fromWord, toWord, phrase };
}

export function adaptiveClaim(
  evidence: AdaptiveEvidence,
  pattern: string,
  condition?: string,
): boolean {
  let phrase = evidence.phrase;
  if (condition && phrase.startsWith(`${condition},`)) phrase = phrase.slice(condition.length + 1);
  return new RegExp(`^(?:then |only then )?${pattern}$`, 'i').test(adaptiveKey(phrase));
}

export function adaptiveLabel(raw: unknown, ctx: ParseContext): string | null {
  return technologyPhrase(raw, ctx, ADAPTIVE_LIMITS.actorLabel);
}

export function evidenceAtBeat(
  evidence: AdaptiveEvidence,
  word: unknown,
  ctx: ParseContext,
): boolean {
  const index = ctx.inWin(word);
  return index !== null && index >= evidence.fromWord && index <= evidence.toWord;
}

export function adaptiveResolution(
  raw: Record<string, unknown>,
  ctx: ParseContext,
  pattern: string,
  outcome: string,
  condition?: string,
): boolean {
  const word = ctx.inWin(raw.resolveWord);
  if (word === null) return false;
  let end = word;
  while (end < ctx.win.endWord && !/[.!?;]$/.test(ctx.words[end]?.text ?? '')) end++;
  const evidence = adaptiveEvidence({ fromWord: word, toWord: end }, ctx);
  return (
    evidence !== null &&
    adaptiveClaim(evidence, pattern, condition) &&
    ` ${adaptiveKey(evidence.phrase)} `.includes(` ${adaptiveKey(outcome)} `)
  );
}
