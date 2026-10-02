import { STORYBOARD_LIMITS } from '../../../../shared/storyboards';
import { assertModelBudget } from './model-resources';
import { supportedModel } from './prop-state';
import type { StoryBoardSpec } from './types';

/** Defence in depth for render work; reject rather than silently drop compiled facts. */
export function assertStoryboardBudgets(spec: StoryBoardSpec): void {
  const limits = STORYBOARD_LIMITS;
  assertModelBudget(spec.props);
  if (
    spec.elements.length > limits.maxElements ||
    spec.props.length > limits.maxProps ||
    (spec.panels?.length ?? 0) > limits.maxPanels ||
    spec.shots.length > limits.maxPanels * 3 + 1
  ) {
    throw new Error('Storyboard exceeds compiled element/panel/camera budget');
  }
  const world = spec.worldBounds;
  if (
    world &&
    (world.width > limits.maxWorldWidth ||
      world.height > limits.maxWorldHeight ||
      world.width * world.height > limits.maxWorldArea)
  )
    throw new Error('Storyboard exceeds world bounds');
  for (const el of spec.elements) {
    if (
      el.kind === 'frame' &&
      ((el.title?.length ?? 0) > limits.maxLabelWords ||
        !Number.isInteger(el.rows ?? 0) ||
        (el.rows ?? 0) < 0 ||
        (el.rows ?? 0) > 12)
    )
      throw new Error('Storyboard exceeds frame row/title budget');
    if ((el.kind === 'text' || el.kind === 'glyph') && el.text.length > limits.maxLabelChars)
      throw new Error('Storyboard exceeds text budget');
    if (el.kind === 'note' && el.title.length > limits.maxLabelChars)
      throw new Error('Storyboard exceeds note budget');
    if (
      el.kind === 'counter' &&
      (!Number.isFinite(el.value) || el.unit.length > limits.maxLabelChars)
    )
      throw new Error('Invalid storyboard counter');
  }
  for (const prop of spec.props) {
    supportedModel(prop);
    if (
      ![prop.at, prop.x, prop.y, prop.size, prop.actionEndAt ?? prop.at].every(Number.isFinite) ||
      prop.size <= 0 ||
      prop.size > limits.maxWorldHeight ||
      (prop.actionEndAt !== undefined && prop.actionEndAt < prop.at)
    )
      throw new Error('Invalid storyboard model bounds/clock');
  }
}
