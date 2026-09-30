import {
  type LabelTreatment,
  type SemanticTextTreatment,
  STAMP_CONTACT_SECONDS,
  type StampFinish,
} from './types';

export { STAMP_CONTACT_SECONDS } from './types';

export function unit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
export function ease(value: number): number {
  const p = unit(value);
  return p * p * (3 - 2 * p);
}

/** Contact is shared with the stamp cue; all settling is finite, not an idle shimmer. */
export function sampleStamp(t: number, at: number, finish: StampFinish) {
  const elapsed = t - at;
  const contact = elapsed - STAMP_CONTACT_SECONDS;
  const press = elapsed < 0 ? 0 : unit(elapsed / STAMP_CONTACT_SECONDS);
  const settle = ease(contact / 0.28);
  return {
    visible: elapsed >= 0,
    press,
    dieOpacity: elapsed < 0 ? 0 : 1 - ease(contact / 0.16),
    impression: contact < 0 ? 0 : ease(contact / 0.07),
    depression: contact < 0 ? 0 : (1 - settle) * (finish === 'letterpress' ? 3 : 1),
    highlight: contact < 0 || contact >= 0.65 ? 0 : Math.sin(unit(contact / 0.65) * Math.PI),
    highlightPosition: unit(contact / 0.65),
  };
}

export function sampleLabel(t: number, treatment: LabelTreatment, part = 0) {
  const elapsed = t - treatment.revealAt;
  return treatment.kind === 'peel-back'
    ? { lift: ease(elapsed / 0.16), reveal: ease((elapsed - 0.16) / 0.48) }
    : { lift: 0, reveal: ease((elapsed - Math.min(part, 4) * 0.065) / 0.34) };
}

/** Bounded letter poses; a word always returns to the original typeset arrangement. */
export function semanticLetterPose(
  t: number,
  treatment: SemanticTextTreatment,
  index: number,
  count: number,
) {
  const elapsed = t - treatment.at;
  const enter = ease(elapsed / 0.28);
  const settle = 1 - ease((elapsed - 0.42) / 0.5);
  const emphasis = elapsed < 0 ? 0 : enter * settle;
  if (elapsed < 0 || elapsed >= 1.1) return { x: 0, y: 0, scaleX: 1 };
  const center = (count - 1) / 2;
  if (treatment.kind === 'compress')
    return { x: (center - index) * 0.09 * emphasis, y: 0, scaleX: 1 - 0.12 * emphasis };
  if (treatment.kind === 'separate')
    return { x: (index - center) * 0.07 * emphasis, y: 0, scaleX: 1 };
  // Alignment starts with a small staggered baseline, then seats on a common rule.
  const align = elapsed < 0 ? 0 : 1 - ease(elapsed / 0.75);
  return { x: 0, y: (index % 2 ? 0.09 : -0.09) * align, scaleX: 1 };
}
