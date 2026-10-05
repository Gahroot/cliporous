import {
  type BusinessClock,
  type BusinessPhases,
  businessPhases,
  type HandshakeState,
  sampleAlternatives,
  sampleConditionClamp,
  sampleHandshake,
  sampleObservationOverlay,
} from '../motion';
import { decisionPageIndex } from './presentation';
import { type DecisionQuantity, type DecisionsScene, immutableDecision } from './types';

export interface DecisionsPose {
  readonly phase: BusinessPhases;
  readonly page: number;
  readonly handshake: { approach: number; accepted: number; state: HandshakeState };
  readonly authorityState: 'pending' | 'denied' | 'conditional' | 'unknown';
  readonly clamp: { progress: number; gate: number; state: 'satisfied' | 'blocked' | 'unknown' };
  readonly observation: {
    planOpacity: number;
    observationOpacity: number;
    comparisonOpacity: number;
  };
  readonly alternatives: readonly { id: string; area: number; opacity: number; baseline: number }[];
  readonly folioOpen: number;
  readonly branchOpen: number;
  readonly deskPending: false;
  readonly contributed: false;
  readonly native: readonly { asset: string; identityId: string }[];
}

/** A missing observation/basis never becomes a zero-sized measured bar. */
export function decisionQuantityRatio(quantity: DecisionQuantity): number | null {
  const denominator = quantity.basis.denominator;
  if (
    quantity.state !== 'observed' ||
    quantity.value === null ||
    !Number.isFinite(quantity.value) ||
    denominator === null ||
    !Number.isFinite(denominator) ||
    denominator <= 0 ||
    quantity.value < 0 ||
    quantity.value > denominator
  )
    return null;
  return quantity.value / denominator;
}

/** Only fresh pose data is frozen; facts never resolve or mutate during a seek. */
export function decisionsPose(scene: DecisionsScene, frame: number, fps: number): DecisionsPose {
  const seconds = Number.isFinite(frame) && Number.isFinite(fps) && fps > 0 ? frame / fps : 0;
  const clock: BusinessClock = {
    frame: Math.min(scene.resolveAt, Math.max(0, Number.isFinite(seconds) ? seconds : 0)) * 30,
    fps: 30,
    beats: scene,
  };
  const phase = businessPhases(clock);
  const handshake = sampleHandshake(
    clock,
    scene.preset === 'contingent-commitment' && scene.actionFact.state === 'negative'
      ? 'denied'
      : 'pending',
  );
  const clamp = sampleConditionClamp(
    clock,
    scene.preset === 'contingent-commitment' && scene.gateFact.state === 'negative'
      ? 'blocked'
      : 'unknown',
  );
  return immutableDecision({
    phase,
    page: decisionPageIndex(scene, phase.time),
    handshake,
    authorityState:
      scene.preset !== 'contingent-commitment' || scene.actionFact.state === 'pending'
        ? 'pending'
        : scene.actionFact.state === 'negative'
          ? 'denied'
          : scene.actionFact.state === 'conditional'
            ? 'conditional'
            : 'unknown',
    clamp,
    observation: sampleObservationOverlay(clock),
    alternatives:
      scene.preset === 'alternatives-or-source-distribution'
        ? sampleAlternatives(
            clock,
            scene.alternatives.map((entry) => entry.entry.identity.id),
          )
        : [],
    folioOpen: phase.action,
    branchOpen: phase.setup,
    deskPending: false,
    contributed: false,
    native:
      scene.visualMode === 'hybrid'
        ? (scene.modelSource ?? []).map((entry) => ({
            asset: entry.asset,
            identityId: entry.identityId,
          }))
        : [],
  });
}
