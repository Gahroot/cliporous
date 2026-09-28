/**
 * Variety rules for a planned explainer sequence. Pure + deterministic.
 *
 *  - never the same scene kind twice in a row (a continuation chain counts as
 *    one "moment"; the dropped scene is the later one);
 *  - never three separate moments from one kind family in a row (e.g.
 *    versus → myth-fact → balance all read as "compare");
 *  - never the same layout twice in a row when the kind allows another;
 *  - scenes cover at most `maxCoverage` of the plannable span;
 *  - plain-talking gap between scenes (chained scenes are exempt);
 *  - at most one full `takeover` per `takeoverEverySec` seconds, each ≤ 3.5 s
 *    (longer takeovers are demoted to the kind's next layout).
 */

import type {
  ExplainerLayout,
  ExplainerSceneKind,
} from '../../remotion/compositions/explainer/types';

export interface VarietyScene {
  startTime: number;
  endTime: number;
  kind: ExplainerSceneKind;
  layout: ExplainerLayout;
  /** Allowed layouts for the kind, preferred first. */
  layouts: readonly ExplainerLayout[];
  /** True when this scene continues the previous one (no gap, transition). */
  chained: boolean;
  /** Kind family (see KindFamily); omitted = no family rule. */
  family?: string;
}

export const VARIETY_LIMITS = {
  maxCoverage: 0.55,
  minGapSec: 1.2,
  takeoverEverySec: 18,
  maxTakeoverSec: 3.5,
} as const;

function span(s: VarietyScene): number {
  return s.endTime - s.startTime;
}

export function applyVarietyRules<T extends VarietyScene>(
  scenes: readonly T[],
  bounds: { minStart: number; maxEnd: number },
): T[] {
  const sorted = [...scenes].sort((a, b) => a.startTime - b.startTime);
  const budget = Math.max(0, bounds.maxEnd - bounds.minStart) * VARIETY_LIMITS.maxCoverage;
  const out: T[] = [];
  let covered = 0;
  let lastTakeoverAt = Number.NEGATIVE_INFINITY;

  for (const scene of sorted) {
    const prev = out[out.length - 1];
    const chained = scene.chained && prev !== undefined && scene.startTime - prev.endTime < 0.25;
    // Gap rule (chains excepted); overlaps are always rejected.
    if (prev) {
      if (scene.startTime < prev.endTime - 0.001 && !chained) continue;
      if (!chained && scene.startTime < prev.endTime + VARIETY_LIMITS.minGapSec) continue;
    }
    // Same kind twice in a row reads as a repeat; drop the later one.
    if (prev && prev.kind === scene.kind) continue;
    // Third separate moment in a row from one family reads samey.
    const prev2 = out[out.length - 2];
    if (
      !chained &&
      scene.family !== undefined &&
      prev?.family === scene.family &&
      prev2?.family === scene.family
    ) {
      continue;
    }
    if (covered + span(scene) > budget) continue;

    let layout = scene.layout;
    if (!scene.layouts.includes(layout)) layout = scene.layouts[0] ?? 'stack';
    // Takeover budget.
    if (layout === 'takeover') {
      const tooLong = span(scene) > VARIETY_LIMITS.maxTakeoverSec;
      const tooSoon = scene.startTime - lastTakeoverAt < VARIETY_LIMITS.takeoverEverySec;
      if (tooLong || tooSoon) {
        layout = scene.layouts.find((l) => l !== 'takeover') ?? 'stack';
      }
    }
    // Chained scenes share the stage, so they must share the layout.
    if (chained && prev) {
      layout = scene.layouts.includes(prev.layout) ? prev.layout : layout;
      if (layout !== prev.layout) {
        // Cannot share the stage — treat as a normal cut with a gap requirement.
        if (scene.startTime < prev.endTime + VARIETY_LIMITS.minGapSec) continue;
      }
    } else if (prev && layout === prev.layout) {
      // Vary the layout between separate moments when the kind allows it.
      const alt = scene.layouts.find((l) => l !== prev.layout && l !== 'takeover');
      if (alt) layout = alt;
    }
    if (layout === 'takeover') lastTakeoverAt = scene.startTime;

    const isChained = chained && prev !== undefined && layout === prev.layout;
    out.push({ ...scene, layout, chained: isChained });
    covered += span(scene);
  }
  return out;
}
