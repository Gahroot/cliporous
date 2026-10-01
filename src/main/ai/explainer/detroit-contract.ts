import {
  getDetroitLandmark,
  namedDetroitLandmarks,
} from '../../remotion/compositions/explainer/detroit/catalog';
import type { DetroitPlaceScene } from '../../remotion/compositions/explainer/detroit/types';
import { hybridStory } from './hybrid-contract';
import type { ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import { technologySource } from './technology-contract';

export function parseDetroitPlace(raw: Rec, ctx: ParseContext): DetroitPlaceScene | null {
  const parsed = hybridStory(raw, ctx, ['landmarks']);
  if (!parsed) return null;
  const preset = raw.preset;
  if (preset !== 'landmark-focus' && preset !== 'city-portrait' && preset !== 'market-block')
    return mechanismIssue(ctx, 'choose landmark-focus, city-portrait or market-block');
  if (
    !Array.isArray(raw.landmarks) ||
    raw.landmarks.length < 1 ||
    raw.landmarks.length > 3 ||
    new Set(raw.landmarks).size !== raw.landmarks.length
  )
    return mechanismIssue(ctx, 'use one to three distinct implemented landmarks');
  const entries = raw.landmarks.map(getDetroitLandmark);
  if (entries.some((entry) => !entry))
    return mechanismIssue(
      ctx,
      'landmark unavailable; Spirit of Detroit requires a documented rights basis',
    );
  const landmarks = entries.flatMap((entry) => (entry ? [entry.id] : []));
  const source = technologySource(ctx);
  const named = namedDetroitLandmarks(source);
  const detroit = /\bdetroit\b/i.test(source);
  if (
    landmarks.some(
      (id) =>
        !named.includes(id) &&
        !(preset === 'city-portrait' && detroit && id === 'renaissance-center'),
    )
  )
    return mechanismIssue(
      ctx,
      'specific landmarks require their qualified source name; ambiguous aliases are insufficient',
    );
  if (preset === 'landmark-focus' && landmarks.length !== 1)
    return mechanismIssue(ctx, 'landmark focus depicts exactly one named subject');
  if (preset === 'city-portrait' && (!detroit || landmarks[0] !== 'renaissance-center'))
    return mechanismIssue(
      ctx,
      'city portrait needs explicit Detroit context and Renaissance Center as centerpiece',
    );
  if (
    preset === 'market-block' &&
    (landmarks.length !== 1 || landmarks[0] !== 'eastern-market' || !detroit)
  )
    return mechanismIssue(ctx, 'market block needs Eastern Market and explicit Detroit context');
  if (
    /\b(?:not|never|unrelated|unverified|fake|imaginary)\b/i.test(source) ||
    /\b(?:owns?|holdings?|profits?|returns?|investments?|revenue|traffic|commut\w*)\b|\d|[%$€£]/i.test(
      parsed.story.outcome,
    )
  )
    return mechanismIssue(
      ctx,
      'place identity cannot be negated or assert ownership, financial performance or travel statistics',
    );
  return { kind: 'detroit-place', preset, ...parsed.story, landmarks };
}
