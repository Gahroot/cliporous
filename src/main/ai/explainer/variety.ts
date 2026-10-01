/**
 * Variety rules for a planned explainer sequence. Pure + deterministic.
 * Baseline rules below are preserved as the control. Content-led admission
 * keeps source windows intact and budgets speaker-hidden takeovers separately.
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

import {
  EXPLAINER_SCENE_KINDS,
  type ExplainerLayout,
  type ExplainerSceneKind,
} from '../../remotion/compositions/explainer/types';
import type { PlanningObserver } from './planning-diagnostics';

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

export const CONTENT_LED_LIMITS = Object.freeze({
  minSceneSec: 2,
  maxSceneSec: 14,
  maxScenes: 12,
  maxTakeoverSec: 3.5,
  /** Minimum start-to-start spacing, as in the baseline takeover rule. */
  takeoverEverySec: 18,
  maxTakeoverCoverage: 0.2,
} as const);

function span(s: VarietyScene): number {
  return s.endTime - s.startTime;
}

/** No novelty quotas or window edits: invalid scenes are removed, never trimmed. */
function applyContentLedRules<T extends VarietyScene>(
  scenes: readonly T[],
  bounds: { minStart: number; maxEnd: number },
  onDiagnostic?: PlanningObserver,
): T[] {
  const validBounds =
    Number.isFinite(bounds.minStart) &&
    Number.isFinite(bounds.maxEnd) &&
    bounds.minStart >= 0 &&
    bounds.maxEnd > bounds.minStart;
  const budget = (bounds.maxEnd - bounds.minStart) * CONTENT_LED_LIMITS.maxTakeoverCoverage;
  const sorted = scenes
    .map((scene, index) => ({ scene, index }))
    .sort(
      (a, b) =>
        (Number.isFinite(a.scene.startTime) ? a.scene.startTime : Infinity) -
        (Number.isFinite(b.scene.startTime) ? b.scene.startTime : Infinity),
    );
  const out: T[] = [];
  let hidden = 0;
  let lastTakeoverAt = Number.NEGATIVE_INFINITY;

  for (const { scene, index } of sorted) {
    const kind = EXPLAINER_SCENE_KINDS.find((k) => k === scene.kind);
    const diagnose = (action: 'removed' | 'repaired', reason: string): void => {
      onDiagnostic?.({ stage: 'policy', action, reason, index, ...(kind ? { kind } : {}) });
    };
    if (!validBounds) {
      diagnose('removed', 'content-led-invalid-bounds');
      continue;
    }
    if (
      !Number.isFinite(scene.startTime) ||
      !Number.isFinite(scene.endTime) ||
      scene.startTime < bounds.minStart ||
      scene.endTime > bounds.maxEnd ||
      scene.endTime <= scene.startTime
    ) {
      diagnose('removed', 'content-led-invalid-window');
      continue;
    }
    const duration = span(scene);
    if (duration < CONTENT_LED_LIMITS.minSceneSec || duration > CONTENT_LED_LIMITS.maxSceneSec) {
      diagnose('removed', 'content-led-scene-duration');
      continue;
    }
    const prev = out[out.length - 1];
    if (prev && scene.startTime < prev.endTime) {
      diagnose('removed', 'overlap');
      continue;
    }
    if (out.length >= CONTENT_LED_LIMITS.maxScenes) {
      diagnose('removed', 'content-led-scene-limit');
      continue;
    }

    let layout = scene.layout;
    if (!scene.layouts.includes(layout)) {
      const next = scene.layouts[0];
      if (!next) {
        diagnose('removed', 'content-led-no-supported-layout');
        continue;
      }
      layout = next;
      diagnose('repaired', 'layout-not-allowed');
    }
    if (layout === 'takeover') {
      const reason =
        duration > CONTENT_LED_LIMITS.maxTakeoverSec
          ? 'content-led-takeover-duration'
          : scene.startTime - lastTakeoverAt < CONTENT_LED_LIMITS.takeoverEverySec
            ? 'content-led-takeover-frequency'
            : hidden + duration > budget
              ? 'content-led-takeover-coverage'
              : undefined;
      if (reason) {
        const visible = scene.layouts.find((l) => l !== 'takeover');
        if (!visible) {
          diagnose('removed', reason);
          continue;
        }
        layout = visible;
        diagnose('repaired', reason);
      }
    }

    // A touching, speaker-visible layout run can share a render group. This
    // connects stages only, NOT object identities across scenes. Never snap beats.
    const touching = prev !== undefined && scene.startTime === prev.endTime;
    const chained = touching && layout === prev.layout && layout !== 'takeover';
    if (chained && !scene.chained) diagnose('repaired', 'content-led-chain-connected');
    if (!chained && scene.chained) {
      diagnose(
        'repaired',
        !prev ? 'chain-without-predecessor' : !touching ? 'chain-gap' : 'chain-layout-incompatible',
      );
    }
    out.push({ ...scene, layout, chained });
    if (layout === 'takeover') {
      hidden += duration;
      lastTakeoverAt = scene.startTime;
    }
  }
  return out;
}

export function applyVarietyRules<T extends VarietyScene>(
  scenes: readonly T[],
  bounds: { minStart: number; maxEnd: number },
  onDiagnostic?: PlanningObserver,
  policy: 'baseline' | 'content-led' = 'baseline',
): T[] {
  if (policy === 'content-led') return applyContentLedRules(scenes, bounds, onDiagnostic);
  const sorted = scenes
    .map((scene, index) => ({ scene, index }))
    .sort((a, b) => a.scene.startTime - b.scene.startTime);
  const budget = Math.max(0, bounds.maxEnd - bounds.minStart) * VARIETY_LIMITS.maxCoverage;
  const out: T[] = [];
  let covered = 0;
  let lastTakeoverAt = Number.NEGATIVE_INFINITY;

  for (const { scene, index } of sorted) {
    const kind = EXPLAINER_SCENE_KINDS.find((k) => k === scene.kind);
    const diagnose = (action: 'removed' | 'repaired', reason: string): void => {
      onDiagnostic?.({ stage: 'policy', action, reason, index, ...(kind ? { kind } : {}) });
    };
    const prev = out[out.length - 1];
    const chained = scene.chained && prev !== undefined && scene.startTime - prev.endTime < 0.25;
    // Gap rule (chains excepted); overlaps are always rejected.
    if (prev) {
      if (scene.startTime < prev.endTime - 0.001 && !chained) {
        diagnose('removed', 'overlap');
        continue;
      }
      if (!chained && scene.startTime < prev.endTime + VARIETY_LIMITS.minGapSec) {
        diagnose('removed', 'baseline-gap');
        continue;
      }
    }
    // Same kind twice in a row reads as a repeat; drop the later one.
    if (prev && prev.kind === scene.kind) {
      diagnose('removed', 'baseline-kind-repeat');
      continue;
    }
    // Third separate moment in a row from one family reads samey.
    const prev2 = out[out.length - 2];
    if (
      !chained &&
      scene.family !== undefined &&
      prev?.family === scene.family &&
      prev2?.family === scene.family
    ) {
      diagnose('removed', 'baseline-family-repeat');
      continue;
    }
    if (covered + span(scene) > budget) {
      diagnose('removed', 'baseline-coverage');
      continue;
    }

    let layout = scene.layout;
    if (!scene.layouts.includes(layout)) {
      const next = scene.layouts[0] ?? 'stack';
      if (layout !== next) diagnose('repaired', 'layout-not-allowed');
      layout = next;
    }
    // Takeover budget.
    if (layout === 'takeover') {
      const tooLong = span(scene) > VARIETY_LIMITS.maxTakeoverSec;
      const tooSoon = scene.startTime - lastTakeoverAt < VARIETY_LIMITS.takeoverEverySec;
      if (tooLong || tooSoon) {
        diagnose(
          'repaired',
          tooLong ? 'baseline-takeover-duration' : 'baseline-takeover-frequency',
        );
        layout = scene.layouts.find((l) => l !== 'takeover') ?? 'stack';
      }
    }
    // Chained scenes share the stage, so they must share the layout.
    if (chained && prev) {
      const next = scene.layouts.includes(prev.layout) ? prev.layout : layout;
      if (layout !== next) diagnose('repaired', 'chain-layout-matched');
      layout = next;
      if (layout !== prev.layout) {
        // Cannot share the stage — treat as a normal cut with a gap requirement.
        if (scene.startTime < prev.endTime + VARIETY_LIMITS.minGapSec) {
          diagnose('removed', 'chain-layout-incompatible');
          continue;
        }
      }
    } else if (prev && layout === prev.layout) {
      // Vary the layout between separate moments when the kind allows it.
      const alt = scene.layouts.find((l) => l !== prev.layout && l !== 'takeover');
      if (alt) {
        diagnose('repaired', 'baseline-layout-repeat');
        layout = alt;
      }
    }
    if (layout === 'takeover') lastTakeoverAt = scene.startTime;

    const isChained = chained && prev !== undefined && layout === prev.layout;
    if (scene.chained && !isChained)
      diagnose(
        'repaired',
        !prev ? 'chain-without-predecessor' : !chained ? 'chain-gap' : 'chain-layout-incompatible',
      );
    out.push({ ...scene, layout, chained: isChained });
    covered += span(scene);
  }
  return out;
}
