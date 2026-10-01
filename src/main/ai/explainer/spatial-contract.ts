import {
  SPATIAL_PRESETS,
  type SpatialScene,
} from '../../remotion/compositions/explainer/spatial/types';
import {
  TECHNOLOGY_LAYOUTS,
  TECHNOLOGY_WORD_FIELDS,
  type TechnologyStory,
} from '../../remotion/compositions/explainer/technology/types';
import type { ParseContext, Rec } from './kind-spec';
import { mechanismIssue, sourceLabel } from './mechanism-contract';
import { technologyClause, technologyEvidence, technologyStory } from './technology-contract';

type SpatialKind = SpatialScene['kind'];
type Phase = 'setup' | 'action' | 'response' | 'check' | 'resolve';
type Claims = readonly string[];
export interface SpatialEvidence {
  story: TechnologyStory;
  setup: Claims;
  motion: Claims;
  check: Claims;
  resolve: Claims;
  all: Claims;
}

// These existing planner extras are suppressed by the causal-scene boundary;
// they are never spread into our returned body. All other unknown keys reject.
const ENVELOPE = [
  'kind',
  'preset',
  'startWord',
  'endWord',
  'layout',
  'transition',
  'continues',
  'laterStamp',
  'annotation',
  'dimWord',
  'reactions',
  'bursts',
];
const STORY = ['label', 'subject', 'outcome', 'condition', ...TECHNOLOGY_WORD_FIELDS];
const UNSAFE_TEXT = /[<>]|(?:https?|file|data|javascript):|www\.|\\\\/i;
const NEGATIVE =
  /\b(?:no|not|never|without|cannot|can't|won't|doesn't|don't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|couldn't|wouldn't|neither)\b/i;
const UNCERTAIN =
  /\b(?:may|might|could|should|maybe|perhaps|possibly|allegedly|supposedly|pretends?|claims?|hopes?|wants?|intends?|tries|attempts?|proposes?)\b|\bplans?\s+to\b/i;
const UNRELATED =
  /\b(?:another|unrelated|someone else's)\s+(?:house|home|property|building|project)\b/i;
const HOME =
  /\b(?:house|home|cottage|apartment|flat|property|building|bungalow|room|unit|key|floorplan)\b/i;

export function spatialText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function hasPhrase(text: string, phrase: string): boolean {
  return ` ${spatialText(text)} `.includes(` ${spatialText(phrase)} `);
}

export function spatialLabel(value: unknown, ctx: ParseContext): string | null {
  const label = sourceLabel(value, ctx, 22);
  return label && !UNSAFE_TEXT.test(label)
    ? label
    : mechanismIssue(
        ctx,
        'spatial labels need source phrases of at most 22 chars, not markup or URLs',
      );
}

export function spatialLabels(
  value: unknown,
  ctx: ParseContext,
  min: number,
  max: number,
): string[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    return mechanismIssue(
      ctx,
      `spatial labels need exactly ${min === max ? min : `${min}–${max}`} entries`,
    );
  const labels: string[] = [];
  for (const entry of value) {
    const label = spatialLabel(entry, ctx);
    if (!label) return null;
    labels.push(label);
  }
  if (new Set(labels.map(spatialText)).size !== labels.length)
    return mechanismIssue(
      ctx,
      'spatial labels must be distinct; do not repeat or silently truncate entries',
    );
  return labels;
}

export function spatialPreset<K extends SpatialKind>(
  kind: K,
  value: unknown,
  ctx: ParseContext,
): (typeof SPATIAL_PRESETS)[K][number] | null {
  const presets: readonly string[] = SPATIAL_PRESETS[kind];
  return typeof value === 'string' && presets.includes(value)
    ? (value as (typeof SPATIAL_PRESETS)[K][number])
    : mechanismIssue(ctx, `${kind} needs an authored preset: ${presets.join(', ')}`);
}

function claims(text: string, condition: string | undefined): string[] {
  // technologyStory has already required the COMPLETE condition. Remove only that
  // subordinate clause for relationship matching, never from the returned story.
  let evidence = text.toLowerCase().replace(/’/g, "'");
  if (condition) {
    const escaped = condition
      .toLowerCase()
      .replace(/’/g, "'")
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    evidence = evidence.replace(new RegExp(escaped, 'g'), '');
  }
  return evidence
    .split(
      /[.!?;,]|\b(?:but|whereas|while|however|yet)\b|\band\s+(?=(?:blocks?|denies|revokes?|cannot|never|not)\b)/i,
    )
    .map((claim) => claim.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function asserted(claim: string): boolean {
  return !UNCERTAIN.test(claim) && !UNRELATED.test(claim);
}

export function positive(claim: string): boolean {
  return asserted(claim) && !NEGATIVE.test(claim.replace(/\bnot (?:only|just)\b/g, ''));
}

/** Indices and source phrases are the entire input surface: no geometry or amounts. */
export function spatialStory(
  raw: Rec,
  ctx: ParseContext,
  kind: SpatialKind,
  extraFields: readonly string[],
): SpatialEvidence | null {
  const keys = new Set([...ENVELOPE, ...STORY, ...extraFields]);
  if (raw.kind !== kind || Object.keys(raw).some((key) => !keys.has(key)))
    return mechanismIssue(
      ctx,
      `${kind} accepts only its story fields; no extra semantic payload, geometry or assets`,
    );
  for (const field of ['startWord', 'endWord']) {
    if (raw[field] !== undefined && ctx.inWin(raw[field]) === null)
      return mechanismIssue(ctx, 'spatial window indices must be integers inside the scene');
  }
  if (
    raw.startWord !== undefined &&
    raw.endWord !== undefined &&
    Number(raw.startWord) > Number(raw.endWord)
  )
    return mechanismIssue(ctx, 'spatial window indices must be ordered');
  if (raw.layout !== undefined && !(TECHNOLOGY_LAYOUTS as readonly unknown[]).includes(raw.layout))
    return mechanismIssue(ctx, 'spatial layout must be an offered authored layout');
  const story = technologyStory(raw, ctx);
  if (!story) return null;
  if (
    [story.label, story.subject, story.outcome, story.condition ?? ''].some((s) =>
      UNSAFE_TEXT.test(s),
    )
  )
    return mechanismIssue(ctx, 'spatial story strings are source text, not markup, paths or URLs');

  const phase = (name: Phase): string[] => {
    const n = TECHNOLOGY_WORD_FIELDS.indexOf(`${name}Word`);
    const first = ctx.inWin(raw[TECHNOLOGY_WORD_FIELDS[n]]);
    const next = n < 4 ? ctx.inWin(raw[TECHNOLOGY_WORD_FIELDS[n + 1]]) : ctx.win.endWord + 1;
    if (first === null || next === null) return [];
    // The sentence around a beat permits natural clause-internal indices. The
    // bounded span also retains additional sentences between successive beats.
    return [
      ...new Set([
        ...claims(technologyEvidence(ctx, first, next - 1), story.condition),
        ...claims(technologyClause(ctx, first), story.condition),
      ]),
    ];
  };
  const setup = phase('setup');
  const motion = [...phase('action'), ...phase('response')];
  const check = phase('check');
  const resolve = phase('resolve');
  if (
    !story.condition &&
    [...setup, ...motion, ...check, ...resolve].some((c) => /\b(?:will|would)\b/.test(c))
  )
    return mechanismIssue(ctx, 'a proposed spatial outcome is not an observed relationship');
  if (!setup.some((c) => hasPhrase(c, story.subject) && HOME.test(c) && asserted(c)))
    return mechanismIssue(
      ctx,
      'setup must identify this source subject as the home, room or key in the spatial story',
    );
  return { story, setup, motion, check, resolve, all: [...setup, ...motion, ...check, ...resolve] };
}

function quotedOutcome(claim: string, outcome: string): boolean {
  if (!hasPhrase(claim, outcome) || !asserted(claim)) return false;
  const prefix = spatialText(claim).split(spatialText(outcome))[0];
  // Do not lift "matches the plan" out of "never matches the plan", or "winner"
  // out of "no winner". Semantic negative branches still accept the full phrase.
  const negative = (text: string): boolean =>
    NEGATIVE.test(text) ||
    /\b(?:can|won|doesn|don|didn|isn|aren|wasn|weren|hasn|haven|couldn|wouldn) t\b/.test(text);
  return !negative(prefix) || negative(outcome);
}

function finish(e: SpatialEvidence, predicate: (claim: string) => boolean): boolean {
  return e.resolve.some((c) => quotedOutcome(c, e.story.outcome) && predicate(c));
}

function eachLabel(
  claims: Claims,
  labels: readonly string[],
  test: (claim: string) => boolean,
): boolean {
  return labels.every((label) => claims.some((c) => hasPhrase(c, label) && test(c)));
}

const REVEAL =
  /\b(?:open[sed]*|lift[sed]*|remov\w*|expos\w*|reveal\w*|show[sn]?|contains?|inside|divid\w*)\b/;
const ROOMS =
  /\b(?:rooms?|kitchen|bedroom|bathroom|hallway|lounge|study|nursery|living room|spaces?|interior)\b/;
const SYSTEM =
  /\b(?:utilit\w*|plumbing|pipes?|water|wiring|wires?|electric\w*|power|heating|ducts?|drains?)\b/;
const ROUTE =
  /\b(?:connect\w*|rout\w*|carr(?:y|ies|ied)|flow\w*|runs?|ran|suppl\w*|distribut\w*|feed[sn]?|fed|serv\w*)\b/;
const BUILD =
  /\b(?:build[st]?|built|construct\w*|assembl\w*|laid|lays?|erect\w*|rais\w*|place[sd]?|rise[sn]?|rose|add[sed]*|attach\w*)\b/;
const STRUCTURE = /\b(?:foundation|walls?|roof|frame)\b/;
const MATCH =
  /\b(?:match\w*|follow\w*|fulfil\w*|conform\w*|align\w*|correspond\w*|according to|as (?:planned|drawn|designed))\b/;
const MISMATCH =
  /\b(?:mismatch\w*|deviat\w*|differ\w*|disagree\w*|diverg\w*|wrong|out of (?:line|alignment)|fails? to match|(?:not|never|doesn't|didn't)\s+(?:\w+\s+){0,2}(?:match|follow|align|conform))\b/;
const SURFACE =
  /\b(?:paint\w*|repaint\w*|decorat\w*|wallpaper\w*|finish\w*|cosmetic|surface|tiles?|facade|plaster\w*)\b/;
const REPAIR =
  /\b(?:repair\w*|replac\w*|reinforc\w*|renew\w*|restor\w*|fix(?:ed|es)?|patch\w*|maintain\w*)\b/;
const LOAD =
  /\b(?:load[- ]bearing|structural|supports?|supporting|carr(?:y|ies|ying) (?:the |a )?(?:load|roof|weight)|holds? up)\b/;
const COSMETIC_ACTION =
  /\b(?:paint(?:s|ed|ing)?|repaint\w*|decorat\w*|wallpaper(?:s|ed|ing)?|refresh\w*|refinish\w*|resurfac\w*|retile\w*|patch\w*|renew\w*)\b/;
const KEY = /\b(?:key|credential|permission|access|authori[sz]\w*)\b/;
const GRANT =
  /\b(?:opens?|opened|unlocks?|unlocked|allows?|allowed|permits?|permitted|grants?|granted|authori[sz]\w*|admits?|admitted)\b/;
const DENIED_STATE = /\b(?:locked|closed|denied|blocked|restricted|excluded|off limits)\b/;
const DENIED_ACCESS =
  /\b(?:no (?:access|permission)|(?:cannot|can't|never|not|doesn't|won't|no longer)\s+(?:\w+\s+){0,2}(?:open|unlock|access|enter|allow|grant))\b/;
const REVOKE =
  /\b(?:revok\w*|withdraw\w*|cancel\w*|disabl\w*|remov\w*|invalidat\w*|expir\w*|no longer valid)\b/;
const COPY = /\b(?:replicat\w*|cop(?:y|ies|ied|ying)|repeat\w*|duplicat\w*|reproduc\w*)\b/;
const SAME =
  /\b(?:same|identical|unchanged|stays? (?:fixed|intact)|remains? (?:fixed|intact)|not chang\w*|doesn't change)\b/;
const CONTEXT =
  /\b(?:surroundings|neighbou?rhood|setting|context|street|road|park|area|location|nearby)\b/;
const CHANGE =
  /\b(?:chang\w*|differ\w*|contrast\w*|switch\w*|var(?:y|ies)|versus|instead|compared)\b/;
const FIT = /\b(?:fits?|fitted|fitting|accommodat\w*|enough (?:room|space)|clearance|space for)\b/;
const MOVE =
  /\b(?:rearrang\w*|reposition\w*|mov(?:e|es|ed|ing)|rotat\w*|reorient\w*|swapp?\w*|reshuffl\w*)\b/;
const INSIDE =
  /\b(?:inside|within|in (?:the |this |that |a |one |same |fixed )*(?:room|floorplan|space)|room (?:fits?|accommodat\w*))\b/;
const WALL_CHANGE =
  /\b(?:remov\w*|demolish\w*|enlarg\w*|expand\w*|cross\w*|through)\b.{0,40}\b(?:walls?|room|boundar\w*)\b/;
const COMPARE = /\b(?:compar\w*|alternatives?|options?|versus|either|choice|contrast\w*)\b/;
const TRADE =
  /\b(?:trades?|trade[- ]offs?|sacrific\w*|gains?|gives? up|costs?|more|less|larger|smaller)\b/;
const UNDECIDED =
  /\b(?:alternatives?|options?|trade[- ]offs?|undecided|unresolved|no winner|neither wins?|not (?:a |the )?(?:winner|chosen)|without (?:a )?winner|choice remains)\b/;
const WIN = /\b(?:wins?|winner|best|superior|chosen|selected|guarantee\w*|profit\w*)\b/;
const OCCUPANT = /\b(?:tenant|resident|occupant|family|families|renter|people)\w*\b/;
const ENTER =
  /\b(?:moves? in|moved in|moving in|enter\w*|occup(?:y|ies|ied)|takes? possession|settle\w*)\b/;
const OCCUPIED = /\b(?:occupied|inhabited|tenanted|rented|lived in|moved in|moves? in)\b/;
const DAMAGE = /\b(?:wear|worn|damag\w*|broken|leak\w*|fault\w*|decay\w*|crack\w*)\b/;
const RESTORED =
  /\b(?:repaired|replaced|restored|fixed|maintained|working|sound|stops? leaking|no longer leaks?)\b/;
const INCOMING =
  /\b(?:receiv\w*|collect\w*|comes? in|came in|flows? in|arriv\w*|paid to|pays? (?:the )?(?:owner|landlord)|incoming)\b/;
const OUTGOING =
  /\b(?:pays?|paid|spen[dt]\w*|leav\w*|left|goes? out|went out|flows? out|outgoing|deduct\w*)\b/;

/** Branch evidence is relational, source/beat-local and target-linked, never noun hits alone. */
export function spatialRelationship(
  scene: SpatialScene,
  e: SpatialEvidence,
  ctx: ParseContext,
): boolean {
  const active = [...e.motion, ...e.check];
  const tail = [...e.check, ...e.resolve];
  const linked = (c: string): boolean =>
    asserted(c) &&
    (hasPhrase(c, scene.subject) ||
      /\b(?:it|its|this|that|same|house|home|room|property)\b/.test(c));
  let valid = false;
  switch (scene.kind) {
    case 'house-cutaway': {
      const anatomy = (c: string): boolean => positive(c) && REVEAL.test(c) && ROOMS.test(c);
      const utility = (c: string): boolean => positive(c) && SYSTEM.test(c) && ROUTE.test(c);
      valid =
        scene.preset === 'rooms'
          ? eachLabel(active, scene.parts, anatomy) && finish(e, anatomy)
          : eachLabel(active, scene.parts, utility) && finish(e, utility);
      break;
    }
    case 'house-build': {
      const built = active.some(
        (c) => linked(c) && positive(c) && BUILD.test(c) && STRUCTURE.test(c),
      );
      const planned = (c: string): boolean => linked(c) && hasPhrase(c, scene.planLabel);
      const matches = (c: string): boolean =>
        planned(c) && positive(c) && MATCH.test(c) && !MISMATCH.test(c);
      const mismatches = (c: string): boolean =>
        planned(c) &&
        asserted(c) &&
        ((positive(c) && MISMATCH.test(c)) ||
          /\b(?:not|never|doesn't|didn't)\s+(?:\w+\s+){0,2}(?:match|follow|align|conform)\b/.test(
            c,
          ));
      valid =
        built &&
        (scene.preset === 'construct'
          ? tail.some(matches) && finish(e, matches) && !tail.some(mismatches)
          : tail.some(mismatches) && finish(e, mismatches) && !e.resolve.some(matches));
      break;
    }
    case 'house-renovation': {
      const target = (c: string): boolean => hasPhrase(c, scene.partLabel) && positive(c);
      const structural = (c: string): boolean => target(c) && LOAD.test(c);
      if (scene.preset === 'cosmetic') {
        valid =
          active.some((c) => target(c) && SURFACE.test(c) && COSMETIC_ACTION.test(c)) &&
          !active.some((c) => positive(c) && LOAD.test(c) && REPAIR.test(c)) &&
          finish(
            e,
            (c) =>
              positive(c) &&
              SURFACE.test(c) &&
              (COSMETIC_ACTION.test(c) ||
                REPAIR.test(c) ||
                /\b(?:new|changed|different)\b/.test(c)),
          );
      } else {
        valid =
          e.all.some(structural) &&
          active.some((c) => target(c) && REPAIR.test(c)) &&
          finish(
            e,
            (c) =>
              positive(c) &&
              (hasPhrase(c, scene.partLabel) || LOAD.test(c)) &&
              (REPAIR.test(c) || LOAD.test(c)),
          );
      }
      // Neither treatment is evidence for a valuation forecast.
      valid &&= !e.resolve.some(
        (c) => positive(c) && /\b(?:profit|value|worth|return|price)\b/.test(c),
      );
      break;
    }
    case 'property-access': {
      const grant = (c: string): boolean =>
        positive(c) && KEY.test(c) && GRANT.test(c) && hasPhrase(c, scene.allowedLabel);
      const deny = (c: string, label: string): boolean =>
        asserted(c) &&
        hasPhrase(c, label) &&
        ((positive(c) && DENIED_STATE.test(c)) || DENIED_ACCESS.test(c));
      const revoked = (c: string): boolean => positive(c) && KEY.test(c) && REVOKE.test(c);
      const restriction = e.all.some((c) => deny(c, scene.restrictedLabel));
      valid =
        restriction &&
        (scene.preset === 'scoped-key'
          ? active.some(grant) &&
            ![...active, ...e.resolve].some(revoked) &&
            finish(e, (c) => grant(c) || deny(c, scene.restrictedLabel)) &&
            !tail.some((c) => positive(c) && GRANT.test(c) && hasPhrase(c, scene.restrictedLabel))
          : active.some(
              (c) =>
                revoked(c) && (hasPhrase(c, scene.allowedLabel) || hasPhrase(c, scene.subject)),
            ) &&
            finish(e, (c) => deny(c, scene.allowedLabel)) &&
            !tail.some(grant));
      break;
    }
    case 'neighborhood': {
      if (scene.preset === 'replicate') {
        // A label such as "copied home" is not itself a copying action.
        const copies = (c: string): boolean =>
          linked(c) &&
          positive(c) &&
          COPY.test(
            scene.contextLabels.reduce(
              (text, label) => text.replaceAll(spatialText(label), 'target'),
              spatialText(c),
            ),
          );
        valid =
          eachLabel(active, scene.contextLabels, copies) &&
          finish(
            e,
            (c) =>
              copies(c) ||
              (linked(c) &&
                positive(c) &&
                SAME.test(c) &&
                /\b(?:copies|homes|houses|design|template)\b/.test(c)),
          );
      } else {
        const context = (c: string): boolean => positive(c) && CONTEXT.test(c) && CHANGE.test(c);
        valid =
          active.some(
            (c) =>
              linked(c) &&
              ((positive(c) && SAME.test(c)) || /\b(?:does not|doesn't|never) change\b/.test(c)),
          ) &&
          eachLabel(active, scene.contextLabels, context) &&
          finish(e, context) &&
          !tail.some(
            (c) =>
              positive(c) &&
              /\b(?:house|home)\s+(?:itself\s+)?(?:changes?|changed|differs?)\b/.test(c),
          );
      }
      break;
    }
    case 'floorplan-fit': {
      const fitting = (c: string): boolean => positive(c) && FIT.test(c) && INSIDE.test(c);
      const moving = (c: string): boolean => positive(c) && MOVE.test(c) && INSIDE.test(c);
      valid =
        ![...active, ...e.resolve].some((c) => positive(c) && WALL_CHANGE.test(c)) &&
        (scene.preset === 'fits'
          ? eachLabel(active, scene.items, fitting) && !active.some(moving) && finish(e, fitting)
          : eachLabel(active, scene.items, moving) && finish(e, (c) => moving(c) || fitting(c)));
      break;
    }
    case 'house-options': {
      const alternatives = (c: string): boolean => linked(c) && positive(c) && COMPARE.test(c);
      const trade = (c: string): boolean =>
        positive(c) &&
        TRADE.test(c) &&
        /\b(?:trades?|gains?|gives?|sacrific\w*|costs?|offers?|provides?|has|have|means?)\b/.test(
          c,
        );
      valid =
        eachLabel(active, scene.options, alternatives) &&
        (scene.preset !== 'tradeoff' || eachLabel(active, scene.options, trade)) &&
        ![...active, ...e.resolve].some((c) => positive(c) && WIN.test(c)) &&
        finish(
          e,
          (c) =>
            asserted(c) &&
            ((positive(c) && UNDECIDED.test(c)) ||
              /\b(?:no winner|neither wins?|without (?:a )?winner|not (?:a |the )?(?:winner|chosen))\b/.test(
                c,
              )),
        );
      break;
    }
    case 'property-lifecycle': {
      const last = scene.stageLabels[scene.stageLabels.length - 1];
      if (scene.preset === 'occupancy') {
        valid =
          e.motion.some((c) => linked(c) && positive(c) && OCCUPANT.test(c) && ENTER.test(c)) &&
          finish(e, (c) => linked(c) && positive(c) && OCCUPIED.test(c) && hasPhrase(c, last));
      } else if (scene.preset === 'maintenance') {
        valid =
          [...e.setup, ...e.motion].some((c) => linked(c) && positive(c) && DAMAGE.test(c)) &&
          active.some((c) => linked(c) && positive(c) && REPAIR.test(c)) &&
          finish(e, (c) => linked(c) && positive(c) && RESTORED.test(c) && hasPhrase(c, last));
      } else {
        const [income, expense] = scene.stageLabels;
        const money = (c: string): boolean =>
          linked(c) || (asserted(c) && /\b(?:owner|landlord)\b/.test(c));
        valid =
          scene.stageLabels.length === 2 &&
          active.some((c) => money(c) && positive(c) && hasPhrase(c, income) && INCOMING.test(c)) &&
          active.some(
            (c) => money(c) && positive(c) && hasPhrase(c, expense) && OUTGOING.test(c),
          ) &&
          !e.all.some(
            (c) => positive(c) && /\b(?:profit\w*|net|yield|return on|gains?)\b/.test(c),
          ) &&
          finish(
            e,
            (c) =>
              asserted(c) &&
              hasPhrase(c, income) &&
              hasPhrase(c, expense) &&
              /\b(?:separate|distinct|different|not profit)\b/.test(c),
          );
      }
      if (scene.preset !== 'cash-flow') {
        valid &&=
          e.setup.some((c) => positive(c) && hasPhrase(c, scene.stageLabels[0])) &&
          scene.stageLabels
            .slice(1, -1)
            .every((label) => active.some((c) => positive(c) && hasPhrase(c, label)));
      }
      break;
    }
  }
  if (!valid)
    mechanismIssue(
      ctx,
      `${scene.kind}/${scene.preset} needs source-backed relationships for these targets at the action/check/resolution beats; nouns, negated actions and opposite outcomes are insufficient`,
    );
  return valid;
}
