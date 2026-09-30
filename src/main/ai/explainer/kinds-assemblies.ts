import { KEYSTONE_WITHDRAW_SECONDS } from '../../remotion/compositions/explainer/types';
import type { AnyKindSpec, KindSpec } from './kind-spec';
import { mechanismIssue, sourceLabel, strictMechanismBeats } from './mechanism-contract';

export const keystoneSpec: KindSpec<'keystone'> = {
  kind: 'keystone',
  describe: `temporary supports hold the blocks until a keystone locks the arch, allowing support removal. Require source-supported support → assembly → lock → unsupported stability. Supports are visible first at supportsAt; blocks seat after blocksAt; the keystone contacts exactly lockAt; support withdrawal starts at withdrawAt and lasts ${KEYSTONE_WITHDRAW_SECONDS}s, then the arch holds.`,
  schema:
    '{"kind":"keystone","label":"source phrase","supportsWord":N,"blocksWord":N,"lockWord":N,"withdrawWord":N}',
  limits:
    'label ≤ 26 chars, quote a contiguous phrase from this scene window (ignore case/sentence punctuation, preserve signed numbers and units); no invented outcomes or numeric promises. Required supportsWord < blocksWord < lockWord < withdrawWord; beat gaps ≥ 0.4/0.9/0.45s, then ≥ 0.95s final hold (0.45s withdrawal + 0.5s static). Scene 3.5–8s. No extra mechanism options.',
  layouts: ['stack', 'stack-flipped', 'over'],
  durationSec: [3.5, 8],
  family: 'object',
  triggers: [
    /\b(?:temporary supports?|scaffold(?:ing)?|centering|falsework)\b.{0,65}\b(?:blocks?|stones?|wedges?)\b.{0,65}\b(?:keystone|cent(?:er|re) stone)\b.{0,40}\b(?:locks?|seats?|settles?)\b.{0,65}\b(?:withdraw(?:s|n|ing)?|remov(?:e[sd]?|ing)|lower(?:s|ed|ing)?|pull(?:s|ed|ing)? out)\b.{0,35}\b(?:supports?|scaffold(?:ing)?|centering|falsework|them)\b/,
    /\b(?:blocks?|stones?|wedges?)\b.{0,45}\b(?:temporary supports?|scaffold(?:ing)?|centering|falsework)\b.{0,55}\b(?:seat(?:s|ed|ing)?|insert(?:s|ed|ing)?|lock(?:s|ed|ing)? in)\b.{0,20}\b(?:keystone|cent(?:er|re) stone)\b.{0,65}\b(?:withdraw(?:s|n|ing)?|remov(?:e[sd]?|ing)|lower(?:s|ed|ing)?|pull(?:s|ed|ing)? out)\b.{0,35}\b(?:supports?|scaffold(?:ing)?|centering|falsework|them)\b/,
  ],
  avoid:
    'an isolated arch or keystone (use hero), a generic foundation metaphor, or blocks assembled without support withdrawal and a stable result; never invent structural success',
  parse: (raw, ctx) => {
    const label = sourceLabel(raw.label, ctx, 26);
    if (!label) return null;
    const beats = strictMechanismBeats(
      raw,
      ctx,
      ['supportsWord', 'blocksWord', 'lockWord', 'withdrawWord'],
      [0.4, 0.9, 0.45],
      KEYSTONE_WITHDRAW_SECONDS + 0.5,
    );
    if (!beats) return null;
    const duration = ctx.win.endTime - ctx.win.startTime;
    if (duration < 3.5 || duration > 8) {
      return mechanismIssue(ctx, 'keystone scene must last 3.5..8s');
    }
    const [supportsAt, blocksAt, lockAt, withdrawAt] = beats;
    return { kind: 'keystone', label, supportsAt, blocksAt, lockAt, withdrawAt };
  },
  cues: (scene) => [
    { kind: 'slide', at: scene.blocksAt, gain: 0.3 },
    { kind: 'thump', at: scene.lockAt, gain: 0.4 },
  ],
};

/** Match sourceLabel's text normalization without erasing signed amounts or units. */
function branchKey(label: string): string {
  return (
    label
      .normalize('NFKC')
      .toLowerCase()
      .replace(/−/g, '-')
      .match(/[+-]?(?:[$€£]\s*)?\d+(?:[.,]\d+)*(?:%|[a-z]+)?|[\p{L}\p{N}]+/gu) ?? []
  )
    .map((word) => word.replace(/\s/g, ''))
    .join(' ');
}

export const switchyardSpec: KindSpec<'switchyard'> = {
  kind: 'switchyard',
  describe:
    'an approaching flow waits for a switch to select a branch, then commits to that route and arrives. Require source-supported approach → branch selection → commitment → arrival, with both branch names spoken. Three fixed illustrative persistent tokens, not a claimed quantity. approachAt starts approach; during the last 0.3s before seatAt the tongue moves and contacts exactly seatAt; movement beyond the junction starts at commitAt; the first token finishes the route at arriveAt, highlighting the result.',
  schema:
    '{"kind":"switchyard","label":"source phrase","route":"left","leftLabel":"source branch","rightLabel":"other branch","approachWord":N,"seatWord":N,"commitWord":N,"arriveWord":N}',
  limits:
    'label ≤ 26 chars, leftLabel/rightLabel ≤ 16 each; independently quote contiguous phrases from this scene window (ignore case/sentence punctuation, preserve signed numbers and units); branch labels must differ after normalization; no invented outcomes or numeric promises. route required, only left/right, selecting the source-supported destination. Required approachWord < seatWord < commitWord < arriveWord; beat gaps ≥ 0.55/0.35/1s, then ≥ 0.6s final hold. Scene 3.5–8s. No tokenCount or extra mechanism options.',
  layouts: ['stack', 'stack-flipped', 'over'],
  durationSec: [3.5, 8],
  family: 'object',
  triggers: [
    /\b(?:tokens?|parcels?|trains?|requests?|items?|traffic)\b.{0,35}\bapproach(?:es|ing)?\b.{0,35}\b(?:junction|fork|switch)\b.{0,45}\b(?:switch|tongue)\b.{0,40}\b(?:seats?|selects?|locks?|aligns?)\b.{0,100}\b(?:commit(?:s|ted|ting)?|send(?:s|ing)?|rout(?:e[sd]?|ing)|pass(?:es|ing)?|mov(?:e[sd]?|ing)|follow(?:s|ed|ing)?)\b.{0,85}\b(?:arriv(?:e[sd]?|ing)|reach(?:es|ed|ing)?)\b/,
    /\b(?:tokens?|parcels?|trains?|requests?|items?|traffic)\b.{0,35}\bapproach(?:es|ing)?\b.{0,35}\b(?:junction|fork|switch)\b.{0,45}\b(?:seat(?:s|ed|ing)?|align(?:s|ed|ing)?|lock(?:s|ed|ing)?)\b.{0,15}\b(?:switch|tongue)\b.{0,100}\b(?:commit(?:s|ted|ting)?|send(?:s|ing)?|rout(?:e[sd]?|ing)|pass(?:es|ing)?|mov(?:e[sd]?|ing)|follow(?:s|ed|ing)?)\b.{0,85}\b(?:arriv(?:e[sd]?|ing)|reach(?:es|ed|ing)?)\b/,
  ],
  avoid:
    'switching tasks or software, a generic choice, or an isolated rail switch (use statement or hero); require selected routing before committed flow and a spoken arrival, not an invented destination',
  parse: (raw, ctx) => {
    const label = sourceLabel(raw.label, ctx, 26);
    const leftLabel = sourceLabel(raw.leftLabel, ctx, 16);
    const rightLabel = sourceLabel(raw.rightLabel, ctx, 16);
    if (!label || !leftLabel || !rightLabel) return null;
    if (branchKey(leftLabel) === branchKey(rightLabel)) {
      return mechanismIssue(ctx, 'leftLabel and rightLabel must differ after normalization');
    }
    const route = raw.route;
    if (route !== 'left' && route !== 'right') {
      return mechanismIssue(ctx, 'route must be left or right; no default route');
    }
    const beats = strictMechanismBeats(
      raw,
      ctx,
      ['approachWord', 'seatWord', 'commitWord', 'arriveWord'],
      [0.55, 0.35, 1],
      0.6,
    );
    if (!beats) return null;
    const duration = ctx.win.endTime - ctx.win.startTime;
    if (duration < 3.5 || duration > 8) {
      return mechanismIssue(ctx, 'switchyard scene must last 3.5..8s');
    }
    const [approachAt, seatAt, commitAt, arriveAt] = beats;
    return {
      kind: 'switchyard',
      label,
      route,
      leftLabel,
      rightLabel,
      approachAt,
      seatAt,
      commitAt,
      arriveAt,
    };
  },
  cues: (scene) => [
    { kind: 'tick', at: scene.seatAt, gain: 0.35 },
    { kind: 'thump', at: scene.arriveAt, gain: 0.3 },
  ],
};

export const ASSEMBLY_KIND_SPECS: readonly AnyKindSpec[] = [keystoneSpec, switchyardSpec];
