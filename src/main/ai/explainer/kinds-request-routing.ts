import {
  type RequestRoutingScene,
  TECHNOLOGY_LAYOUTS,
  TECHNOLOGY_LIMITS,
} from '../../remotion/compositions/explainer/technology/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import type { KindSpec, ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import {
  technologyClause,
  technologyPhrase,
  technologySource,
  technologyStory,
} from './technology-contract';

function key(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}'-]+/gu, ' ')
    .trim();
}

function escapePattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function actor(label: string): string {
  return `(?:the |a |an )?${escapePattern(key(label).replace(/^(?:the|a|an) /, ''))}`;
}

/** Match a complete local assertion, never a bag of nouns or a hoped-for subclause. */
function claim(parts: readonly string[], pattern: string): string | undefined {
  const re = new RegExp(`^(?:then |only then )?${pattern}$`, 'i');
  return parts.find((part) => re.test(part));
}

function clauses(ctx: ParseContext, word: unknown, condition?: string): string[] {
  let source = technologyClause(ctx, word);
  if (condition) source = source.replace(condition, '');
  if (source.length > 360) return [];
  return source
    .split(/[,;.!?]|\b(?:and|but|so|however|while|whereas)\b/i)
    .map(key)
    .filter(Boolean);
}

const RESPONSE = '(?:a |the |that |its )?(?:cached |matching )?response';
const CACHE = '(?:the )?cache';
const RETURNS = '(?:returns?|returned|provides?|provided|sends?|sent)';
const GOES = '(?:goes|went|is routed|was routed|is sent|was sent) to';
const UNSUPPORTED =
  /\b(?:not|never|no|stale|expired|outdated|unrelated|different|other|fails?|failed|cannot|can\x27t|doesn\x27t|didn\x27t|may|might|could|hopes?|plans?|would|should)\b/;

function parseRequestRouting(raw: Rec, ctx: ParseContext): RequestRoutingScene | null {
  const preset = raw.preset;
  if (preset !== 'cache-hit' && preset !== 'cache-miss' && preset !== 'timeout-fallback') {
    return mechanismIssue(ctx, 'request-routing needs an explicit supported preset');
  }
  const story = technologyStory(raw, ctx);
  const serviceLabel = technologyPhrase(raw.serviceLabel, ctx, TECHNOLOGY_LIMITS.actorLabel);
  if (!story || !serviceLabel) return null;
  if (story.condition && !technologySource(ctx).includes(story.condition)) {
    return mechanismIssue(ctx, 'retain the exact source condition, including its wording and case');
  }
  const fallbackLabel =
    raw.fallbackLabel === undefined
      ? undefined
      : technologyPhrase(raw.fallbackLabel, ctx, TECHNOLOGY_LIMITS.actorLabel);
  if (
    (preset === 'timeout-fallback' && !fallbackLabel) ||
    (preset !== 'timeout-fallback' && raw.fallbackLabel !== undefined)
  ) {
    return mechanismIssue(
      ctx,
      'only timeout-fallback has a required source-backed alternate service',
    );
  }
  if (fallbackLabel && key(serviceLabel) === key(fallbackLabel)) {
    return mechanismIssue(ctx, 'the alternate service must differ from the primary service');
  }
  const request = actor(story.subject);
  const service = actor(serviceLabel);
  const target = `(?: (?:for|to) ${request})?`;
  const [setup, action, response, check, resolve] = [
    raw.setupWord,
    raw.actionWord,
    raw.responseWord,
    raw.checkWord,
    raw.resolveWord,
  ].map((word) => clauses(ctx, word, story.condition));
  const resolution =
    claim(resolve, `${request} (?:receives?|received|gets?|got) ${RESPONSE}`) ??
    claim(resolve, `${RESPONSE} (?:is |was )?(?:delivered|returned) to ${request}`);
  if (
    !resolution ||
    resolve.some((part) => UNSUPPORTED.test(part)) ||
    !` ${resolution} `.includes(` ${key(story.outcome)} `)
  ) {
    return mechanismIssue(
      ctx,
      'the outcome must quote the successful delivery to this same request',
    );
  }
  if (
    response.some((part) => UNSUPPORTED.test(part)) ||
    check.some((part) => UNSUPPORTED.test(part) && preset !== 'cache-hit')
  ) {
    return mechanismIssue(
      ctx,
      'the selected response/check claim is negated, unsuccessful or only proposed',
    );
  }

  if (preset === 'timeout-fallback' && fallbackLabel) {
    const alternate = actor(fallbackLabel);
    const availableAlternate = `(?:the |an? )?available ${escapePattern(key(fallbackLabel).replace(/^(?:the|a|an) /, ''))}`;
    const routed =
      claim(response, `${request} ${GOES} ${availableAlternate}`) ??
      (claim(
        [...setup, ...action, ...response],
        `${alternate} (?:is|was) (?:explicitly )?available`,
      ) &&
        claim(response, `${request} ${GOES} ${alternate}`));
    const timedOut = claim(
      response,
      `${service} (?:times? out|timed out)(?: (?:on|for) ${request})?`,
    );
    if (
      !claim(setup, `${request} ${GOES} ${service}`) ||
      !claim(action, `${service} (?:receives?|received|accepts?|accepted) ${request}`) ||
      !timedOut ||
      !routed ||
      response.indexOf(routed) <= response.indexOf(timedOut) ||
      !claim(check, `${alternate} ${RETURNS} ${RESPONSE}${target}`)
    )
      return mechanismIssue(
        ctx,
        'prove request → primary timeout → explicitly available alternate → its response; a mentioned fallback is not success',
      );
  } else {
    if (!claim(setup, `${request} (?:checks?|checked|searches?|searched) ${CACHE}`)) {
      return mechanismIssue(ctx, 'the named request must actually check the cache');
    }
    if (preset === 'cache-hit') {
      const freshMatch =
        claim(
          action,
          `${CACHE} (?:finds?|found|contains?|holds?|has) (?:a |the )?(?:fresh matching|matching fresh) response${target}`,
        ) ??
        claim(
          action,
          `(?:a |the )?(?:fresh matching|matching fresh) response (?:is |was )?found(?: in ${CACHE})?${target}`,
        );
      const bypass =
        claim(check, `${request} (?:bypasses?|bypassed|avoids?|avoided) ${service}`) ??
        claim(
          check,
          `${service} (?:is not called|was not called|does no work|is bypassed|was bypassed)`,
        );
      if (
        action.some((part) => UNSUPPORTED.test(part)) ||
        !freshMatch ||
        !claim(response, `${CACHE} ${RETURNS} ${RESPONSE}${target}`) ||
        !bypass ||
        check.some((part) => part !== bypass)
      )
        return mechanismIssue(
          ctx,
          'cache-hit requires a fresh matching response for this request, returned by cache without backend work',
        );
    } else {
      const missing =
        claim(
          action,
          `${CACHE} (?:has|had|contains?) no (?:cached )?response(?: for ${request})?`,
        ) ?? claim(action, `${request} (?:finds?|found) no cached response`);
      const afterResponse =
        claim(check, `only after ${service} (?:returns?|returned) ${RESPONSE}`) ??
        claim(check, `only after ${service} (?:responds?|responded)`);
      if (
        !missing ||
        !claim(action, `${request} ${GOES} ${service}`) ||
        !claim(response, `${service} ${RETURNS} ${RESPONSE}${target}`) ||
        !afterResponse ||
        !claim(
          check,
          `${CACHE} (?:stores?|stored|saves?|saved) (?:that|the) response(?: for ${request})?`,
        )
      )
        return mechanismIssue(
          ctx,
          'cache-miss requires the selected backend response, followed by cache population only after that response',
        );
    }
  }
  return {
    kind: 'request-routing',
    preset,
    ...story,
    serviceLabel,
    ...(fallbackLabel ? { fallbackLabel } : {}),
  };
}

export const REQUEST_ROUTING_SPEC = {
  kind: 'request-routing',
  describe:
    'Follow one named request on a service switchboard: a fresh matching cache hit bypasses backend; a miss gets a backend response before filling cache; or primary timeout routes to an explicitly available alternate that returns the response. Require the same actor/response relationship at each beat, not keywords.',
  schema:
    '{"kind":"request-routing","preset":"cache-hit","label":"source phrase","subject":"request","outcome":"request receives the response","serviceLabel":"backend","setupWord":N,"actionWord":N,"responseWord":N,"checkWord":N,"resolveWord":N}',
  limits:
    'Source-backed label ≤32, subject ≤24, outcome ≤40, optional exact condition ≤56, serviceLabel/fallbackLabel ≤22. fallbackLabel required only for timeout-fallback. 5–12s; beat gaps ≥0.6/1/1/1s, final hold ≥0.8s. setup: named request checks cache (or goes to primary). action: fresh match / miss plus route to backend / primary receives request. response: cache or backend returns response / primary times out and request goes to explicitly available alternate. check: bypass backend / ONLY AFTER backend response store that response / alternate returns response. resolve: same request receives response. Quote outcome from delivery claim. Do not omit conditions, imply stale hits, assume fallback success, invent timings, logs or metrics.',
  layouts: TECHNOLOGY_LAYOUTS,
  durationSec: [5, 12],
  family: 'process',
  triggers: [
    /\b(?:request|query)\b.{0,70}\bcache\b/,
    /\b(?:cache hit|cache miss|cached response)\b/,
    /\b(?:times? out|timed out|timeout)\b.{0,100}\b(?:fallback|alternate|backup)\b/,
  ],
  avoid:
    'generic routing choices, cache mentions without freshness/matching evidence, unrelated services, and unsuccessful or merely suggested fallbacks',
  parse: parseRequestRouting,
  cues: (scene: RequestRoutingScene): SceneCue[] => [
    { kind: 'tick', at: scene.actionAt, gain: 0.25 },
    {
      kind: scene.preset === 'timeout-fallback' ? 'slide' : 'tick',
      at: scene.preset === 'cache-hit' ? scene.responseAt : scene.checkAt,
      gain: 0.28,
    },
  ],
} satisfies KindSpec<'request-routing'>;
