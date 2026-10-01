import {
  getLongformLayout,
  type LongformLayout,
  type LongformRect,
} from '../../../../shared/longform-layout';
import type { LongformPresentation } from '../../../../shared/longform-scenes';
import { labelLines } from './diagrams/layout';
import { EXPLAINER_STAGE_HEIGHT, EXPLAINER_STAGE_WIDTH, type ExplainerSceneKind } from './types';

/**
 * Audited shared region owners, not a blanket claim that all causal/future scenes reflow.
 * Native means the model viewport and editorial rail are separate. Model-bound labels
 * retain their authored coordinate system (and exact camera projection), not new geometry.
 */
export const LONGFORM_STAGE_OWNERS = {
  bottleneck: 'mechanism',
  momentum: 'mechanism',
  leverage: 'mechanism',
  'resource-leak': 'mechanism',
  'feedback-control': 'mechanism',
  keystone: 'mechanism',
  switchyard: 'mechanism',
  synchronization: 'mechanism',
  relay: 'mechanism',
  'exploded-view': 'mechanism',
  'agent-workflow': 'mechanism',
  'retrieval-grounding': 'mechanism',
  'context-window': 'mechanism',
  'software-release': 'mechanism',
  'request-routing': 'mechanism',
  'house-cutaway': 'explanation',
  'house-build': 'explanation',
  'house-renovation': 'explanation',
  'property-access': 'explanation',
  neighborhood: 'explanation',
  'floorplan-fit': 'explanation',
  'house-options': 'explanation',
  'property-lifecycle': 'explanation',
  'agent-team': 'explanation',
  'agent-plan': 'explanation',
  'agent-budget': 'explanation',
  'model-training': 'explanation',
  'model-evaluation': 'explanation',
  'evidence-conflict': 'explanation',
  'system-layers': 'explanation',
  'semantic-sort': 'explanation',
  'information-transform': 'explanation',
  'token-choice': 'explanation',
  'expert-selection': 'explanation',
  'edge-cloud': 'explanation',
  'resource-allocation': 'explanation',
  'market-exchange': 'explanation',
  'unit-economics': 'explanation',
  'population-distribution': 'explanation',
  'customer-cohort': 'explanation',
  'inventory-demand': 'explanation',
  'scale-hierarchy': 'explanation',
  'possible-futures': 'explanation',
  'digital-twin': 'explanation',
  'collective-pattern': 'explanation',
  'robot-perception': 'explanation',
  'modular-machine': 'explanation',
  'detroit-place': 'hybrid',
  'fund-flow': 'hybrid',
  'ownership-change': 'hybrid',
  'portfolio-exposure': 'hybrid',
  'cash-timing': 'hybrid',
  'token-attention': 'hybrid',
  'inference-tradeoff': 'hybrid',
} as const satisfies Partial<Record<ExplainerSceneKind, 'mechanism' | 'explanation' | 'hybrid'>>;

export function longformStaging(kind: string): 'native' | 'centered' {
  return Object.hasOwn(LONGFORM_STAGE_OWNERS, kind) ? 'native' : 'centered';
}

/** Affine mapping for existing authored HTML anchors, not a stretched WebGL canvas. */
export function modelSpaceTransform(model: LongformRect): { x: number; y: number; scale: number } {
  const scale = model.height / EXPLAINER_STAGE_HEIGHT;
  return {
    x: model.x + (model.width - EXPLAINER_STAGE_WIDTH * scale) / 2,
    y: model.y,
    scale,
  };
}

/** Older scenes have no separable editorial rail. Keep their entire artwork, never crop it. */
export function centeredLongformBox(presentation: LongformPresentation): LongformRect {
  const layout = getLongformLayout(presentation);
  if (presentation === 'speaker-pip') return layout.model;
  return {
    x: layout.text.x,
    y: layout.text.y,
    width: layout.model.x + layout.model.width - layout.text.x,
    height: layout.model.y + layout.model.height - layout.text.y,
  };
}

/** The mask is outside all scene/transition transforms, so moving content cannot fill the speaker. */
export function longformClipPath(presentation: LongformPresentation): string {
  const { explanation: e, speaker } = getLongformLayout(presentation);
  const rectPath = (r: LongformRect): string =>
    `M ${r.x} ${r.y} H ${r.x + r.width} V ${r.y + r.height} H ${r.x} Z`;
  // The side speaker is already outside the explanation. Only the inset needs a hole.
  return `path(evenodd, "${rectPath(e)}${presentation === 'speaker-pip' && speaker ? ` ${rectPath(speaker)}` : ''}")`;
}

export type EditorialSlot = 'title' | 'condition' | 'status' | 'evidence' | 'outcome';

/** Text stays in the frozen text reservation; side-by-side uses a two-column header. */
export function longformTextRegions(layout: LongformLayout): Record<EditorialSlot, LongformRect> {
  const t = layout.text;
  if (t.width > t.height * 2) {
    const leftWidth = Math.floor((t.width - 32) / 2);
    const right = t.x + leftWidth + 32;
    return {
      title: { x: t.x, y: t.y, width: leftWidth, height: 86 },
      condition: { x: t.x, y: t.y + 98, width: leftWidth, height: t.height - 98 },
      status: { x: right, y: t.y, width: leftWidth, height: 76 },
      evidence: { x: right, y: t.y, width: leftWidth, height: 76 },
      outcome: { x: right, y: t.y + 100, width: leftWidth, height: t.height - 100 },
    };
  }
  return {
    title: { x: t.x, y: t.y, width: t.width, height: 132 },
    condition: { x: t.x, y: t.y + 156, width: t.width, height: 120 },
    status: { x: t.x, y: t.y + 300, width: t.width, height: 104 },
    evidence: { x: t.x, y: t.y + 300, width: t.width, height: 104 },
    outcome: { x: t.x, y: t.y + t.height - 156, width: t.width, height: 156 },
  };
}

/** Conservative glyph budget (including W, currency and signs); preserve all source text. */
export function fitEditorialText(
  text: string,
  region: LongformRect,
  preferredSize: number,
): {
  fontSize: number;
  lines: string[];
} {
  for (let fontSize = preferredSize; fontSize >= 12; fontSize--) {
    const lines = labelLines(text, Math.max(1, Math.floor(region.width / fontSize)));
    if (lines.length * fontSize * 1.16 <= region.height) return { fontSize, lines };
  }
  return { fontSize: 12, lines: labelLines(text, Math.max(1, Math.floor(region.width / 12))) };
}
