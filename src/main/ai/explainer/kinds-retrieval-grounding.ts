import {
  type RetrievalGroundingScene,
  TECHNOLOGY_LAYOUTS,
  TECHNOLOGY_LIMITS,
} from '../../remotion/compositions/explainer/technology/types';
import { isRec, type KindSpec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import {
  technologyEvidence,
  technologyPhrase,
  technologySource,
  technologyStory,
} from './technology-contract';

// Keep signed quantities/units significant when binding an excerpt to its own source.
function key(text: string): string {
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

function contains(text: string, phrase: string): boolean {
  return ` ${key(text)} `.includes(` ${key(phrase)} `);
}

function escaped(text: string): string {
  return key(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clauses(text: string): string[] {
  return text
    .split(/[!?;]|\.(?!\d)/)
    .map(key)
    .filter(Boolean);
}

const DOUBT =
  /\b(?:not|never|no|neither|without|cannot|fails?|failed|unrelated|irrelevant|unselected|fabricated|invented|fake|denied|might|may|could|would|should|proposed|suggested|pretends?|but|except|isn|wasn|doesn|didn|won|hasn|haven)\b/;

function affirmative(text: string, condition?: string): boolean {
  return !DOUBT.test(condition ? key(text).replace(key(condition), '') : key(text));
}

function phase(ctx: ParseContext, from: unknown, until?: unknown): string {
  const next = until === undefined ? ctx.win.endWord + 1 : ctx.inWin(until);
  return next === null ? '' : technologyEvidence(ctx, from, next - 1);
}

const QUERY_STOP = new Set([
  'a',
  'an',
  'the',
  'of',
  'for',
  'is',
  'are',
  'do',
  'does',
  'what',
  'how',
  'why',
  'which',
  'can',
  'i',
  'we',
  'our',
  'this',
  'that',
  'question',
  'query',
  'source',
  'document',
  'evidence',
  'excerpt',
  'answer',
  'relevant',
  'selected',
  'information',
]);

function queryTerms(subject: string): string[] {
  return key(subject)
    .split(' ')
    .map((word) => word.replace(/s$/, ''))
    .filter((word) => word.length > 2 && !QUERY_STOP.has(word));
}

/** A source name, selection predicate, relevance and the exact excerpt must share one claim. */
function boundSelection(
  response: string,
  source: RetrievalGroundingScene['sources'][number],
  sources: RetrievalGroundingScene['sources'],
  terms: string[],
  condition?: string,
): boolean {
  const excerptTerms = key(source.excerpt)
    .split(' ')
    .map((word) => word.replace(/s$/, ''));
  if (!terms.some((term) => excerptTerms.includes(term))) return false;
  return clauses(response).some((claim) => {
    if (!contains(claim, source.label) || !contains(claim, source.excerpt)) return false;
    if (sources.some((other) => other !== source && contains(claim, other.label))) return false;
    // A negative fact can be a valid quotation; negated retrieval cannot. Mask only the
    // locally bound excerpt, not the rest of the claim (nor another source's failure).
    const relation = claim.replace(key(source.excerpt), 'quoted excerpt');
    if (!affirmative(relation, condition)) return false;
    const label = escaped(source.label);
    const quoted = 'quoted excerpt';
    return (
      new RegExp(
        `^(?:the )?${label} (?:supplies|supplied|provides|provided|yields|yielded|selects|selected) (?:the |a )?(?:selected )?relevant excerpt ${quoted}(?: for (?:the|this) question)?$`,
      ).test(relation) ||
      new RegExp(
        `^(?:the )?(?:question|query|search) (?:selects|selected|retrieves|retrieved|finds|found) (?:the |a )?relevant excerpt ${quoted} from (?:the )?${label}$`,
      ).test(relation)
    );
  });
}

function parseRetrievalGrounding(raw: Rec, ctx: ParseContext): RetrievalGroundingScene | null {
  const story = technologyStory(raw, ctx);
  if (!story) return null;
  const preset = raw.preset;
  if (preset !== 'evidence-found' && preset !== 'no-evidence' && preset !== 'two-sources') {
    return mechanismIssue(ctx, 'retrieval-grounding needs an explicit supported preset');
  }
  const count = preset === 'no-evidence' ? 0 : preset === 'two-sources' ? 2 : 1;
  if (!Array.isArray(raw.sources) || raw.sources.length !== count) {
    return mechanismIssue(ctx, `${preset} requires exactly ${count} selected sources`);
  }
  const sources: RetrievalGroundingScene['sources'] = [];
  for (const entry of raw.sources) {
    if (!isRec(entry)) return mechanismIssue(ctx, 'each selected source needs a label and excerpt');
    const label = technologyPhrase(entry.label, ctx, TECHNOLOGY_LIMITS.actorLabel);
    const excerpt = technologyPhrase(entry.excerpt, ctx, TECHNOLOGY_LIMITS.excerpt);
    if (!label || !excerpt) {
      return mechanismIssue(
        ctx,
        'source labels and excerpts must be short contiguous source phrases',
      );
    }
    if (
      sources.some(
        (source) =>
          contains(source.label, label) ||
          contains(label, source.label) ||
          key(source.excerpt) === key(excerpt),
      )
    ) {
      return mechanismIssue(ctx, 'two sources need distinct named origins and distinct excerpts');
    }
    sources.push({ label, excerpt });
  }

  const setup = phase(ctx, raw.setupWord, raw.actionWord);
  const action = phase(ctx, raw.actionWord, raw.responseWord);
  const response = phase(ctx, raw.responseWord, raw.checkWord);
  const check = phase(ctx, raw.checkWord, raw.resolveWord);
  const resolution = phase(ctx, raw.resolveWord);
  const terms = queryTerms(story.subject);
  const search = new RegExp(
    `^(?:the )?(?:question|query|${escaped(story.subject)}) (?:searches|searched) (?:the )?(?:documents|library|sources)\\b`,
  );
  if (
    !contains(setup, story.subject) ||
    !terms.length ||
    !/\b(?:question|query)\b/.test(key(setup)) ||
    !affirmative(action, story.condition) ||
    !search.test(key(action))
  ) {
    return mechanismIssue(
      ctx,
      'a specific question must actually search the document library, not merely mention it',
    );
  }
  if (!contains(resolution, story.outcome)) {
    return mechanismIssue(ctx, 'outcome must quote the local resolution, not another claim');
  }
  if (
    /\b(?:correct|correctness|accurate|accuracy|truth|guaranteed|proven)\b/.test(key(story.label))
  ) {
    return mechanismIssue(ctx, 'retrieval labels describe provenance, not guaranteed correctness');
  }
  if (
    preset === 'no-evidence'
      ? !contains(story.outcome, 'no evidence')
      : !/\b(?:keeps|retains|kept|retained)\b.*\breferences?\b/.test(key(story.outcome))
  ) {
    return mechanismIssue(
      ctx,
      'outcome must retain the branch meaning: no evidence or retained references',
    );
  }

  if (preset === 'no-evidence') {
    // Deliberately narrow empty branch: neither an answer nor a correctness mark is inferred.
    if (
      !/^(?:the )?(?:search|question) (?:finds|found) no relevant (?:evidence|excerpts?)$/.test(
        key(response),
      ) ||
      !/^(?:the )?answer(?: workspace)? (?:stays|remains|stayed|remained) empty$/.test(
        key(check),
      ) ||
      !/^(?:the )?answer(?: workspace)? reports no evidence$/.test(key(resolution))
    ) {
      return mechanismIssue(
        ctx,
        'no-evidence requires an actual no-match, an empty answer and a no-evidence report',
      );
    }
  } else {
    if (
      !sources.every((source) => boundSelection(response, source, sources, terms, story.condition))
    ) {
      return mechanismIssue(
        ctx,
        'bind each selected relevant excerpt locally to its named source and the question topic',
      );
    }
    const answer =
      preset === 'two-sources'
        ? /^(?:the )?answer (?:combines|combined|uses|used) (?:only )?(?:both|the two) selected excerpts$/
        : /^(?:the )?answer (?:uses|used|includes|included) (?:only )?(?:this|that|the) selected excerpt$/;
    if (!affirmative(check, story.condition) || !answer.test(key(check))) {
      return mechanismIssue(
        ctx,
        'the answer must use exactly the selected excerpt(s), not unrelated or invented material',
      );
    }
    const references =
      preset === 'two-sources'
        ? /^(?:the )?answer (?:keeps|retains|kept|retained) both (?:source )?references$/
        : new RegExp(
            `^(?:the )?answer (?:keeps|retains|kept|retained) (?:(?:its|the) source reference|the ${escaped(sources[0].label)} reference)$`,
          );
    if (!affirmative(resolution, story.condition) || !references.test(key(resolution))) {
      return mechanismIssue(
        ctx,
        'retain the selected source references as provenance, never as proof of correctness',
      );
    }
  }
  // technologyStory checks equality after normalization; render the actual source condition.
  const condition = story.condition
    ? technologySource(ctx)
        .match(/\b(?:if|unless|when|provided that|assuming)\b[^,;.!?]*/i)?.[0]
        ?.trim()
    : undefined;
  return {
    kind: 'retrieval-grounding',
    preset,
    ...story,
    ...(condition ? { condition } : {}),
    sources,
  };
}

export const RETRIEVAL_GROUNDING_SPEC: KindSpec<'retrieval-grounding'> = {
  kind: 'retrieval-grounding',
  describe:
    'A specific question searches a document library; selected relevant excerpts move into an answer with their source references. No evidence leaves the answer empty. Citations show origin, not factual correctness.',
  schema:
    '{"kind":"retrieval-grounding","preset":"evidence-found","label":"source phrase","subject":"Returns question","outcome":"answer retains its source reference","sources":[{"label":"Returns guide","excerpt":"Returns last thirty days"}],"setupWord":N,"actionWord":N,"responseWord":N,"checkWord":N,"resolveWord":N}',
  limits:
    '5–12s. label≤32, subject≤24, outcome≤40, condition≤56, source label≤22, excerpt≤40. All copy quotes source phrases. sources counts evidence-found=1, no-evidence=0, two-sources=2. Five required beat words at the start of question / search / selection / answer-use / reference-retention claims, gaps ≥0.6/1/1/1s and ≥0.8s final hold. Each named source supplies its own explicitly relevant excerpt about the question topic. Two sources must both be selected and combined; never borrow relevance or text across sources. No-evidence: search finds no relevant evidence, answer stays empty, answer reports no evidence. Preserve the exact complete source condition. Reject missing, negated, hypothetical-without-condition, unrelated or fabricated evidence and truth guarantees.',
  layouts: TECHNOLOGY_LAYOUTS,
  durationSec: [5, 12],
  family: 'process',
  triggers: [
    /\b(?:question|query)\b.{0,80}\bsearch(?:es|ed)?\b.{0,40}\b(?:documents|sources|library)\b/,
    /\b(?:relevant|selected) excerpts?\b.{0,100}\b(?:answer|references?|citations?)\b/,
    /\bno relevant evidence\b/,
  ],
  avoid:
    'documents merely mentioned, citations as truth guarantees, unselected sources, or memory-window capacity (use context-window)',
  parse: parseRetrievalGrounding,
  cues: (scene: RetrievalGroundingScene) =>
    scene.preset === 'no-evidence'
      ? [{ kind: 'tick', at: scene.responseAt, gain: 0.22 }]
      : [
          { kind: 'slide', at: scene.responseAt, gain: 0.28 },
          { kind: 'tick', at: scene.checkAt, gain: 0.25 },
        ],
};
