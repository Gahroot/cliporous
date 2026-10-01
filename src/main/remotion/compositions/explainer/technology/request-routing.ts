import {
  contactOffset,
  phaseProgress,
  revealAt,
  type TechnologyPoint,
  travelPoint,
} from './motion';
import type { RequestRoutingScene } from './types';

/** Ticket top-left coordinates; the same ticket travels every selected wire. */
export const ROUTING_POINTS = {
  client: { x: 112, y: 646 },
  cache: { x: 144, y: 352 },
  primary: { x: 704, y: 352 },
  alternate: { x: 704, y: 646 },
  upper: { x: 412, y: 352 },
  lower: { x: 412, y: 646 },
} as const;

export const ROUTING_PATHS = {
  lookup: [ROUTING_POINTS.client, ROUTING_POINTS.lower, ROUTING_POINTS.upper, ROUTING_POINTS.cache],
  primary: [
    ROUTING_POINTS.client,
    ROUTING_POINTS.lower,
    ROUTING_POINTS.upper,
    ROUTING_POINTS.primary,
  ],
  miss: [ROUTING_POINTS.cache, ROUTING_POINTS.upper, ROUTING_POINTS.primary],
  populate: [ROUTING_POINTS.primary, ROUTING_POINTS.upper, ROUTING_POINTS.cache],
  fallback: [
    ROUTING_POINTS.primary,
    ROUTING_POINTS.upper,
    ROUTING_POINTS.lower,
    ROUTING_POINTS.alternate,
  ],
  cachedReturn: [
    ROUTING_POINTS.cache,
    ROUTING_POINTS.upper,
    ROUTING_POINTS.lower,
    ROUTING_POINTS.client,
  ],
  alternateReturn: [ROUTING_POINTS.alternate, ROUTING_POINTS.lower, ROUTING_POINTS.client],
} as const;

/** Fixed waypoints, finite interpolation, no retained playback state. */
function follow(
  time: number,
  start: number,
  end: number,
  points: readonly TechnologyPoint[],
): TechnologyPoint {
  const first = points[0];
  const last = points[points.length - 1];
  if (time <= start) return { ...first };
  if (time >= end) return { ...last };
  const segment = (end - start) / (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor((time - start) / segment));
  return travelPoint(
    time,
    start + index * segment,
    start + (index + 1) * segment,
    points[index],
    points[index + 1],
  );
}

export interface RequestRoutingPose {
  request: TechnologyPoint;
  requestOpacity: number;
  response: number;
  cacheContent: number;
  cacheOffset: number;
  primaryOffset: number;
  fallbackOffset: number;
  cacheState: 'Idle' | 'Lookup' | 'Match' | 'Empty' | 'Stored';
  primaryState: 'Waiting' | 'Receiving' | 'Responded' | 'Bypassed' | 'Timed out';
  fallbackState: 'Available' | 'Receiving' | 'Responded';
  lookupWire: number;
  primaryWire: number;
  fallbackWire: number;
  returnWire: number;
  switchTurn: number;
  outcome: number;
}

/** All motion finishes at resolveAt, leaving the contract's entire >=0.8s hold static. */
export function requestRoutingPose(
  scene: RequestRoutingScene,
  timeSeconds: number,
): RequestRoutingPose {
  const { setupAt, actionAt, responseAt, checkAt, resolveAt, preset } = scene;
  const t = Number.isFinite(timeSeconds) ? Math.min(timeSeconds, resolveAt) : setupAt - 1;
  const fallback = preset === 'timeout-fallback';
  const miss = preset === 'cache-miss';
  const replyAt = fallback ? checkAt : responseAt;
  // The service receives the request before it can return a response.
  const serviceContact = fallback ? actionAt : responseAt - 1 / 3;
  const alternateContact = checkAt - 1 / 3;
  let request = follow(
    t,
    setupAt,
    actionAt,
    fallback ? ROUTING_PATHS.primary : ROUTING_PATHS.lookup,
  );
  if (t > actionAt && miss) {
    request = follow(t, actionAt + 0.12, serviceContact, ROUTING_PATHS.miss);
    if (t > responseAt) request = follow(t, responseAt + 0.12, checkAt, ROUTING_PATHS.populate);
  } else if (t > responseAt && fallback) {
    request = follow(t, responseAt + 0.12, alternateContact, ROUTING_PATHS.fallback);
  }
  if (t > checkAt) {
    request = follow(
      t,
      checkAt + 0.2,
      resolveAt,
      fallback ? ROUTING_PATHS.alternateReturn : ROUTING_PATHS.cachedReturn,
    );
  }

  return {
    request,
    requestOpacity: revealAt(t, setupAt - 0.25),
    response: revealAt(t, replyAt),
    cacheContent: fallback ? 0 : miss ? revealAt(t, checkAt) : 1,
    cacheOffset: fallback ? 0 : contactOffset(t, actionAt) + (miss ? contactOffset(t, checkAt) : 0),
    primaryOffset: miss || fallback ? contactOffset(t, serviceContact) : 0,
    fallbackOffset: fallback ? contactOffset(t, alternateContact) : 0,
    cacheState:
      fallback || t < setupAt
        ? 'Idle'
        : t < actionAt
          ? 'Lookup'
          : miss
            ? t < checkAt
              ? 'Empty'
              : 'Stored'
            : 'Match',
    primaryState: fallback
      ? t >= responseAt
        ? 'Timed out'
        : t >= actionAt
          ? 'Receiving'
          : 'Waiting'
      : miss
        ? t >= responseAt
          ? 'Responded'
          : t >= serviceContact
            ? 'Receiving'
            : 'Waiting'
        : t >= checkAt
          ? 'Bypassed'
          : 'Waiting',
    fallbackState:
      t >= checkAt && fallback
        ? 'Responded'
        : t >= alternateContact && fallback
          ? 'Receiving'
          : 'Available',
    lookupWire: fallback ? 0 : phaseProgress(t, setupAt, actionAt),
    primaryWire: fallback
      ? phaseProgress(t, setupAt, actionAt)
      : miss
        ? phaseProgress(t, actionAt + 0.12, serviceContact)
        : 0,
    fallbackWire: fallback ? phaseProgress(t, responseAt + 0.12, alternateContact) : 0,
    returnWire: phaseProgress(t, checkAt + 0.2, resolveAt),
    switchTurn: fallback
      ? phaseProgress(t, responseAt, responseAt + 0.12)
      : miss
        ? phaseProgress(t, actionAt, actionAt + 0.12)
        : 0,
    outcome: t >= resolveAt ? 1 : 0,
  };
}
