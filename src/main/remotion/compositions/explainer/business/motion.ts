import { diagramPose, reveal } from '../diagrams/motion';
import { DIAGRAM_LIMITS } from '../diagrams/types';
import { staggerDelay } from '../motion-tokens';
import type { TechnologyBeats } from '../technology/types';

export interface BusinessClock {
  frame: number;
  fps: number;
  beats: TechnologyBeats;
}
export interface BusinessPhases {
  time: number;
  setup: number;
  action: number;
  response: number;
  check: number;
  holding: boolean;
}
export interface NamedMotion {
  id: string;
  x: number;
  y: number;
  opacity: number;
  scale: number;
}

function unit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
function time(clock: BusinessClock): number {
  if (!Number.isFinite(clock.frame) || !Number.isFinite(clock.fps) || clock.fps <= 0) return 0;
  const seconds = clock.frame / clock.fps;
  return Number.isFinite(seconds) ? seconds : 0;
}
function interval(clock: BusinessClock, from: number, to: number): number {
  return reveal(time(clock), from, to - from);
}

/** All authored transitions settle by resolveAt, leaving the complete final reading hold. */
export function businessPhases(clock: BusinessClock): BusinessPhases {
  const b = clock.beats;
  const t = time(clock);
  return {
    time: t,
    setup: interval(clock, b.setupAt, b.actionAt),
    action: interval(clock, b.actionAt, b.responseAt),
    response: interval(clock, b.responseAt, b.checkAt),
    check: interval(clock, b.checkAt, b.resolveAt),
    holding: Number.isFinite(b.resolveAt) && t >= b.resolveAt,
  };
}

/** M-01: children keep their semantic IDs while moving out of the named parent task. */
export function sampleTaskSplit(clock: BusinessClock, ids: readonly string[]): NamedMotion[] {
  const bounded = ids.slice(0, DIAGRAM_LIMITS.entities);
  return bounded.map((id, index) => {
    const delay = Math.min(0.14, staggerDelay(index, bounded.length));
    const p = interval(clock, clock.beats.actionAt + delay, clock.beats.responseAt);
    return {
      id,
      x: (index - (bounded.length - 1) / 2) * p,
      y: 0.7 * p,
      opacity: businessPhases(clock).setup,
      scale: 1 - 0.15 * p,
    };
  });
}

export interface ConservedPart {
  id: string;
  amount: number;
}
/** M-02: amounts remain exact facts; only visibility/position changes, never the total. */
export function sampleConservedParts(
  clock: BusinessClock,
  total: number,
  parts: readonly ConservedPart[],
): { total: number; originWeight: number; parts: (ConservedPart & { visualWeight: number })[] } {
  const p = businessPhases(clock).action;
  const bounded = parts.slice(0, DIAGRAM_LIMITS.entities);
  return {
    total,
    originWeight: 1 - p,
    parts: bounded.map((part) => ({
      ...part,
      visualWeight: Number.isFinite(total) && total > 0 ? unit(part.amount / total) * p : 0,
    })),
  };
}

/** M-03: no denial disappears at the resolution; focus is separate from permission state. */
export function sampleConstraintFocus(
  clock: BusinessClock,
  ids: readonly string[],
  focusedId: string,
): { id: string; focus: number; opacity: number }[] {
  const p = businessPhases(clock);
  return ids.slice(0, DIAGRAM_LIMITS.entities).map((id) => ({
    id,
    focus: id === focusedId ? p.response : 0,
    opacity: p.setup,
  }));
}

/** M-04: reuse the native same-subject handoff rather than creating a second stage/camera. */
export function sampleBusinessHandoff(clock: BusinessClock): {
  modelOpacity: number;
  diagramOpacity: number;
  modelTurn: number;
} {
  const pose = diagramPose(time(clock), clock.beats);
  return {
    modelOpacity: pose.modelOpacity,
    diagramOpacity: pose.diagramOpacity,
    modelTurn: pose.modelTurn,
  };
}

/** M-05: plan and observation share a baseline; their supplied values are not interpolated. */
export function sampleObservationOverlay(clock: BusinessClock): {
  planOpacity: number;
  observationOpacity: number;
  comparisonOpacity: number;
} {
  const p = businessPhases(clock);
  return { planOpacity: p.setup, observationOpacity: p.response, comparisonOpacity: p.check };
}

export interface SourceSnapshot {
  id: string;
  date: string;
}
/** M-06: discrete source snapshots retain dates, including when visual time is compressed. */
export function sampleSnapshots(
  clock: BusinessClock,
  snapshots: readonly SourceSnapshot[],
): (SourceSnapshot & { visible: boolean; focused: boolean })[] {
  const bounded = snapshots.slice(0, DIAGRAM_LIMITS.holders);
  const p = businessPhases(clock).action;
  const active = Math.min(bounded.length - 1, Math.floor(p * Math.max(1, bounded.length)));
  return bounded.map((snapshot, index) => ({
    ...snapshot,
    visible: index <= active && businessPhases(clock).setup > 0,
    focused: index === active,
  }));
}

/** M-07: the unit IDs remain distinct; the lens changes scope, not facts or performance. */
export function sampleScaleLens(
  clock: BusinessClock,
  unitIds: readonly string[],
): {
  lens: number;
  units: NamedMotion[];
} {
  const p = businessPhases(clock);
  const ids = unitIds.slice(0, DIAGRAM_LIMITS.entities);
  return {
    lens: p.response,
    units: ids.map((id, index) => ({
      id,
      x: (index - (ids.length - 1) / 2) * (0.35 + p.action * 0.65),
      y: 0,
      opacity: p.setup,
      scale: 1 - p.action * 0.25,
    })),
  };
}

/** M-08: identical area, reveal and duration; no frequency/area proxy for an unstated probability. */
export function sampleAlternatives(
  clock: BusinessClock,
  ids: readonly string[],
): {
  id: string;
  area: number;
  opacity: number;
  baseline: number;
}[] {
  const p = businessPhases(clock);
  return ids.slice(0, DIAGRAM_LIMITS.holders).map((id) => ({
    id,
    area: 1,
    opacity: p.action,
    baseline: 0,
  }));
}

export type HandshakeState = 'pending' | 'approved' | 'denied';
/** M-09: pending/denied stop before the acceptance gate even during the final hold. */
export function sampleHandshake(
  clock: BusinessClock,
  state: HandshakeState,
): {
  approach: number;
  accepted: number;
  state: HandshakeState;
} {
  const p = businessPhases(clock);
  return { approach: p.action, accepted: state === 'approved' ? p.check : 0, state };
}

export interface PriorityTier {
  id: string;
  amount: number | null;
  ceiling: number | null;
}
/** M-10: unknown amounts show priorities without filling, and partial tiers stop later filling. */
export function samplePriorityFill(
  clock: BusinessClock,
  tiers: readonly PriorityTier[],
): (PriorityTier & { reveal: number; fill: number })[] {
  const bounded = tiers.slice(0, DIAGRAM_LIMITS.holders);
  const duration = clock.beats.resolveAt - clock.beats.responseAt;
  let eligible = true;
  return bounded.map((tier, index) => {
    const start = clock.beats.responseAt + (duration * index) / Math.max(1, bounded.length);
    const end = clock.beats.responseAt + (duration * (index + 1)) / Math.max(1, bounded.length);
    const p = interval(clock, start, end);
    const known =
      tier.amount !== null &&
      tier.ceiling !== null &&
      Number.isFinite(tier.amount) &&
      Number.isFinite(tier.ceiling) &&
      tier.ceiling > 0;
    const ratio =
      known && tier.amount !== null && tier.ceiling !== null ? unit(tier.amount / tier.ceiling) : 0;
    const fill = eligible ? ratio * p : 0;
    // A stated 0/0 ceiling needs no payout; it is not an unknown or partial tier.
    const emptyTier = tier.amount === 0 && tier.ceiling === 0;
    eligible = eligible && (emptyTier || (known && ratio === 1));
    return { ...tier, reveal: p, fill };
  });
}

/** M-11: declared links reveal in order but do not change evidence labels or source versions. */
export function sampleProvenance(
  clock: BusinessClock,
  ids: readonly string[],
): {
  id: string;
  opacity: number;
  linkProgress: number;
}[] {
  const bounded = ids.slice(0, DIAGRAM_LIMITS.entities);
  return bounded.map((id, index) => {
    const offset = Math.min(0.25, staggerDelay(index, bounded.length));
    return {
      id,
      opacity: interval(clock, clock.beats.actionAt + offset, clock.beats.responseAt),
      linkProgress: interval(clock, clock.beats.responseAt + offset, clock.beats.checkAt),
    };
  });
}

/** M-12: a clamp is an explicit source condition, not a physics-based inferred bottleneck. */
export function sampleConditionClamp(
  clock: BusinessClock,
  state: 'satisfied' | 'blocked' | 'unknown',
): { progress: number; gate: number; state: 'satisfied' | 'blocked' | 'unknown' } {
  const p = businessPhases(clock);
  return {
    progress: state === 'satisfied' ? p.action + (1 - p.action) * p.check : p.action * 0.55,
    gate: state === 'satisfied' ? p.check : 0,
    state,
  };
}
