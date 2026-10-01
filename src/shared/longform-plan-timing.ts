import type {
  BlockPlacement,
  DelosCardPlacement,
  LongformEditPlan,
  LongformPlanItemType,
  PhraseEmphasis,
} from './types';

export interface LongformPlanItemRef {
  type: LongformPlanItemType;
  index: number;
}

type TimedItem = PhraseEmphasis | BlockPlacement | DelosCardPlacement;

/** Hard ceiling that prevents a full-frame block from hiding the remaining edit. */
export const MAX_LONGFORM_BLOCK_SECONDS = 8;

interface Candidate {
  type: Exclude<LongformPlanItemType, 'scene'>;
  item: TimedItem;
}

export function longformRangesOverlap(
  left: Pick<TimedItem, 'startTime' | 'endTime'>,
  right: Pick<TimedItem, 'startTime' | 'endTime'>,
): boolean {
  return left.startTime < right.endTime && right.startTime < left.endTime;
}

/**
 * Phrases occupy the bottom lower-third while evidence cards occupy the upper-left.
 * That pair may safely coexist; full-frame blocks and same-layer beats stay exclusive.
 */
export function longformLayersMayOverlap(
  left: LongformPlanItemType,
  right: LongformPlanItemType,
): boolean {
  return (left === 'phrase' && right === 'card') || (left === 'card' && right === 'phrase');
}

function candidatesConflict(left: Candidate, right: Candidate): boolean {
  return (
    !longformLayersMayOverlap(left.type, right.type) && longformRangesOverlap(left.item, right.item)
  );
}

/** Clamp full-frame block timing before it can suppress later plan items. */
function clampBlockDuration(item: BlockPlacement): BlockPlacement {
  return {
    ...item,
    endTime: Math.min(item.endTime, item.startTime + MAX_LONGFORM_BLOCK_SECONDS),
  };
}

/**
 * Resolve unsupported overlaps before a plan reaches review or render. Full-frame
 * blocks win, then authored phrases, then evidence cards. Phrase/card overlaps are
 * retained because those layers render in separate, non-obscuring screen regions.
 */
export function resolveLongformPlanOverlaps(plan: LongformEditPlan): LongformEditPlan {
  // Scene-first windows are approved stories; the legacy priority/clamping policy must not alter them.
  if (plan.mode === 'scene-first') return plan;
  const candidates: Candidate[] = [
    ...(plan.blocks ?? []).map((item) => ({
      type: 'block' as const,
      item: clampBlockDuration(item),
    })),
    ...(plan.phrases ?? []).map((item) => ({ type: 'phrase' as const, item })),
    ...(plan.cards ?? []).map((item) => ({ type: 'card' as const, item })),
  ];
  const layerPriority: Record<Candidate['type'], number> = {
    block: 0,
    phrase: 1,
    card: 2,
  };
  candidates.sort(
    (left, right) =>
      layerPriority[left.type] - layerPriority[right.type] ||
      left.item.startTime - right.item.startTime ||
      left.item.endTime - right.item.endTime,
  );

  const accepted: Candidate[] = [];
  for (const candidate of candidates) {
    const { startTime, endTime } = candidate.item;
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) continue;
    if (accepted.some((existing) => candidatesConflict(existing, candidate))) continue;
    accepted.push(candidate);
  }

  const chronological = (left: TimedItem, right: TimedItem): number =>
    left.startTime - right.startTime || left.endTime - right.endTime;

  return {
    ...plan,
    phrases: accepted
      .filter((candidate) => candidate.type === 'phrase')
      .map((candidate) => candidate.item as PhraseEmphasis)
      .sort(chronological),
    blocks: accepted
      .filter((candidate) => candidate.type === 'block')
      .map((candidate) => candidate.item as BlockPlacement)
      .sort(chronological),
    cards: accepted
      .filter((candidate) => candidate.type === 'card')
      .map((candidate) => candidate.item as DelosCardPlacement)
      .sort(chronological),
  };
}

/** Remove beats that cannot safely share a preferred edit's range. */
export function removeLongformPlanRangeConflicts(
  plan: LongformEditPlan,
  range: Pick<TimedItem, 'startTime' | 'endTime'>,
  except?: LongformPlanItemRef,
  preferredType: LongformPlanItemType | undefined = except?.type,
): LongformEditPlan {
  if (plan.mode === 'scene-first') return plan;
  const keep = (type: LongformPlanItemType, item: TimedItem, index: number): boolean =>
    (except?.type === type && except.index === index) ||
    !longformRangesOverlap(item, range) ||
    (preferredType != null && longformLayersMayOverlap(type, preferredType));

  return {
    ...plan,
    phrases: plan.phrases.filter((item, index) => keep('phrase', item, index)),
    blocks: plan.blocks.filter((item, index) => keep('block', item, index)),
    cards: (plan.cards ?? []).filter((item, index) => keep('card', item, index)),
  };
}
