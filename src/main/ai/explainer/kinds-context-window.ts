import {
  type ContextWindowScene,
  TECHNOLOGY_LAYOUTS,
  TECHNOLOGY_LIMITS,
} from '../../remotion/compositions/explainer/technology/types';
import type { KindSpec, ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import {
  technologyClause,
  technologyPhrase,
  technologySource,
  technologyStory,
} from './technology-contract';

const WINDOW =
  '(?:the )?(?:(?:full|bounded|finite) )?(?:working (?:window|area)|context window|window)';
const ARCHIVE = '(?:the )?(?:separate )?archive';
const DOUBT =
  /\b(?:not|never|no|cannot|can't|couldn't|doesn't|didn't|won't|wouldn't|isn't|aren't|wasn't|without|fails?|failed|might|may|could|would|perhaps|proposed|hopes?|plans?|pretends?|false|untrue|fictional|hypothetical)\b/;

function clean(text: string): string {
  return text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}

function phrase(text: string): string {
  return `\\b${clean(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
}

/** Only the beat's own clause is evidence; a failed earlier attempt is not global negation. */
function affirmed(text: string, relation: string, condition?: string): boolean {
  let claim = clean(text);
  if (condition && claim.startsWith(clean(condition))) {
    claim = claim.slice(clean(condition).length).replace(/^\s*,\s*/, '');
  }
  return claim.split(/\b(?:however|whereas)\b|[;.!?]/).some((part) => {
    // A safe anti-deletion aside must not negate the affirmative retention claim.
    const local = part.replace(
      /\b(?:and|while|but)\b[^,]*\b(?:not deleted|never deleted)\b[^,]*$/,
      '',
    );
    return !DOUBT.test(local) && new RegExp(relation, 'i').test(local);
  });
}

function retained(memory: string): string {
  return `${phrase(memory)} (?:still )?(?:(?:remains?|stays?|remained|stayed) (?:stored |safe )?(?:in )?|(?:is|are|was|were) (?:still )?(?:stored|retained|kept|safe) in )${ARCHIVE}\\b`;
}

/** Reject the misleading claim, not the word "deleted" inside "not deleted". */
function misleading(source: string): boolean {
  return clean(source)
    .split(/[.!?;,]|\b(?:but|and|while|whereas|yet|however)\b/)
    .some((claim) => {
      if (
        /\bno (?:details?|information|data) (?:(?:is|are|was|were|will be) )?(?:ever )?(?:lost|omitted)\b/.test(
          claim,
        ) ||
        /\bwithout (?:any )?(?:detail|information|data) loss\b/.test(claim) ||
        /\bsummary (?:does not|doesn't|never) (?:omit|lose|leave out) (?:any )?details?\b/.test(
          claim,
        )
      )
        return true;
      if (DOUBT.test(claim)) return false;
      return (
        /\b(?:delet(?:e[sd]?|ing)|eras(?:e[sd]?|ing)|destroy(?:s|ed|ing)?)\b/.test(claim) ||
        /\b(?:lossless(?:ly)?|unbounded|unlimited|omniscient)\b/.test(claim) ||
        /\b(?:keeps?|preserves?|retains?|restores?|recalls?|retrieves?|returns?|remembers?) (?:all|every)(?: the)? (?:details?|contexts?|memor(?:y|ies)|data|information|items?)\b/.test(
          claim,
        ) ||
        /\b(?:all|every) (?:details?|contexts?|memor(?:y|ies)|data|information|items?) (?:is|are) (?:kept|preserved|retained|restored|recalled|retrieved)\b/.test(
          claim,
        ) ||
        /\b(?:recalls?|remembers?|restores?|retrieves?) everything\b/.test(claim)
      );
    });
}

function parseContextWindow(raw: Rec, ctx: ParseContext): ContextWindowScene | null {
  const preset = raw.preset;
  if (preset !== 'overflow' && preset !== 'summarisation' && preset !== 'memory-retrieval') {
    return mechanismIssue(ctx, 'context-window needs overflow, summarisation or memory-retrieval');
  }
  if (raw.layout !== undefined && !TECHNOLOGY_LAYOUTS.some((layout) => layout === raw.layout)) {
    return mechanismIssue(ctx, 'context-window requires a technology layout');
  }
  const story = technologyStory(raw, ctx);
  const detailLabel = technologyPhrase(raw.detailLabel, ctx, TECHNOLOGY_LIMITS.actorLabel);
  const memoryLabel = technologyPhrase(raw.memoryLabel, ctx, TECHNOLOGY_LIMITS.actorLabel);
  const summaryLabel =
    preset === 'summarisation'
      ? technologyPhrase(raw.summaryLabel, ctx, TECHNOLOGY_LIMITS.actorLabel)
      : undefined;
  if (!story || !detailLabel || !memoryLabel || (preset === 'summarisation' && !summaryLabel)) {
    return mechanismIssue(ctx, 'context actors and any summary must quote bounded source phrases');
  }
  if (preset !== 'summarisation' && raw.summaryLabel !== undefined) {
    return mechanismIssue(ctx, 'summaryLabel belongs only to summarisation');
  }
  if (misleading(technologySource(ctx))) {
    return mechanismIssue(
      ctx,
      'context is bounded: no deletion, lossless summary or total recall claims',
    );
  }

  const supports = (word: unknown, relation: string): boolean =>
    affirmed(technologyClause(ctx, word), relation, story.condition);
  const archiveRetention = retained(memoryLabel);
  let setup: string;
  let action: string;
  let response: string;
  let resolution: string;
  if (preset === 'overflow') {
    setup = `${WINDOW} (?:is|was|becomes?|became) (?:already )?full\\b`;
    action = `${phrase(story.subject)} (?:enters?|entered|arrives? in|arrived in) ${WINDOW}\\b`;
    response = `${phrase(detailLabel)} (?:leaves?|left|exits?|exited|moves? out of|moved out of) ${WINDOW}\\b`;
    // Merely calling an arbitrary excerpt "oldest" would invent its eviction priority.
    if (!/\boldest\b/.test(clean(detailLabel))) {
      return mechanismIssue(
        ctx,
        'overflow detailLabel must identify the source-stated oldest context',
      );
    }
    resolution = `(?:${archiveRetention}|${WINDOW} (?:now )?(?:holds?|contains?) ${phrase(story.subject)})`;
  } else if (preset === 'summarisation' && summaryLabel) {
    if (clean(story.subject) !== clean(detailLabel)) {
      return mechanismIssue(ctx, 'summarisation subject must retain the detailed context identity');
    }
    setup = `${phrase(detailLabel)} (?:fills?|filled) ${WINDOW}\\b`;
    action = `${phrase(summaryLabel)} (?:replaces?|replaced) ${phrase(detailLabel)} (?:in )?${WINDOW}\\b`;
    response = `${phrase(summaryLabel)} (?:keeps?|kept|retains?|retained) (?:the )?key points (?:and|but) (?:omits?|omitted|leaves? out|left out) (?:some )?detail\\b`;
    resolution = `${phrase(summaryLabel)} (?:omits?|omitted|leaves? out|left out) (?:some )?detail\\b`;
  } else {
    setup = `${phrase(story.subject)} (?:needs?|needed|requires?|required) (?:earlier|previous|stored) context\\b`;
    action = `\\bretrieval (?:selects?|selected) (?:a |the )?relevant ${phrase(detailLabel)} from ${phrase(memoryLabel)} in ${ARCHIVE}\\b`;
    response = `\\bretrieval (?:brings?|brought|returns?|returned) ${phrase(detailLabel)} (?:back )?(?:in|into|to) ${WINDOW}\\b`;
    resolution = `${phrase(detailLabel)} (?:is|was) (?:now )?(?:available for (?:this |the )?question|back in ${WINDOW})\\b`;
  }
  if (
    !supports(raw.setupWord, setup) ||
    !supports(raw.actionWord, action) ||
    !supports(raw.responseWord, response) ||
    !supports(raw.checkWord, archiveRetention) ||
    !supports(raw.resolveWord, resolution) ||
    !affirmed(story.outcome, resolution) ||
    !clean(technologyClause(ctx, raw.resolveWord)).includes(clean(story.outcome))
  ) {
    return mechanismIssue(
      ctx,
      'each context beat must support its actor relationship: bounded window, selected branch, retained archive and explicit outcome',
    );
  }
  return {
    kind: 'context-window',
    preset,
    ...story,
    detailLabel,
    memoryLabel,
    ...(summaryLabel ? { summaryLabel } : {}),
  };
}

export const CONTEXT_WINDOW_SPEC: KindSpec<'context-window'> = {
  kind: 'context-window',
  describe:
    'A finite working tray separate from a persistent archive. overflow: full window, new context enters, oldest detail exits only the window. summarisation: a summary replaces detailed context, keeps key points AND omits detail. memory-retrieval: a question needs earlier context, retrieval selects one relevant stored item and returns that item to the window. Every branch states archive retention, not deletion or omniscient recall.',
  schema:
    '{"kind":"context-window","preset":"overflow|summarisation|memory-retrieval","label":"source phrase","subject":"source actor","outcome":"source result","condition":"exact source condition, only if conditional","detailLabel":"source detail","memoryLabel":"stored source material","summaryLabel":"source summary, summarisation only","setupWord":N,"actionWord":N,"responseWord":N,"checkWord":N,"resolveWord":N}',
  limits:
    '5–12s. Five explicit words, gaps ≥0.6/1/1/1s, final hold ≥0.8s. label≤32, subject≤24, outcome≤40, condition≤56; actor labels≤22, source phrases. Overflow detail names oldest. Summary subject=detailLabel; response states key points kept AND detail omitted. Retrieval explicitly selects relevant detail from named memory in archive, then returns it to window. checkWord states archive retention; resolveWord supports the actual outcome. No lossless compression, deletion or unsupported restoration. Keep the complete exact condition.',
  layouts: TECHNOLOGY_LAYOUTS,
  durationSec: [5, 12],
  family: 'process',
  triggers: [
    /\b(?:context|working) window\b/,
    /\b(?:oldest (?:detail|context)|summary replaces|retrieval selects)\b/,
    /\b(?:summari[sz](?:e|es|ation)|earlier context|stored context)\b/,
  ],
  avoid:
    'buzzwords without a bounded context-to-archive relationship; lossless summaries, deleted stored data, all-memory recall, or unsupported outcomes',
  parse: parseContextWindow,
  cues: (scene) => [
    { kind: 'slide', at: scene.responseAt, gain: 0.22 },
    { kind: 'tick', at: scene.checkAt, gain: 0.25 },
  ],
};
