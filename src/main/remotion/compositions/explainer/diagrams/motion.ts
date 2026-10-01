import type { TechnologyBeats } from '../technology/types';

/** Seekable smoothstep; non-finite probe times fail closed rather than leaking NaN into SVG. */
export function reveal(t: number, at: number, duration = 0.6): number {
  if (![t, at, duration].every(Number.isFinite) || duration <= 0) return 0;
  const p = Math.max(0, Math.min(1, (t - at) / duration));
  return p * p * (3 - 2 * p);
}

export function diagramPose(
  t: number,
  beats: TechnologyBeats,
  handoffBeat: 'action' | 'response' = 'response',
): {
  setup: number;
  action: number;
  response: number;
  check: number;
  resolve: number;
  diagramOpacity: number;
  modelOpacity: number;
  modelTurn: number;
} {
  const at = handoffBeat === 'action' ? beats.actionAt : beats.responseAt;
  const next = handoffBeat === 'action' ? beats.responseAt : beats.checkAt;
  const handoff = reveal(t, at, Math.min(0.7, next - at));
  return {
    setup: reveal(t, beats.setupAt, 0.35),
    action: reveal(t, beats.actionAt),
    response: reveal(t, beats.responseAt),
    check: reveal(t, beats.checkAt),
    resolve: reveal(t, beats.resolveAt, 0.25),
    diagramOpacity: handoff,
    modelOpacity: 1 - handoff,
    modelTurn: -0.09 + 0.18 * reveal(t, beats.actionAt, 1),
  };
}
