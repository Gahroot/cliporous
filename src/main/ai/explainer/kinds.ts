/**
 * Registry of every explainer scene kind the planner may use.
 */

import type { ExplainerSceneKind } from '../../remotion/compositions/explainer/types';
import type { AnyKindSpec } from './kind-spec';
import { THREE_D_KIND_SPECS } from './kinds-3d';
import { OBJECT_KIND_SPECS } from './kinds-3d-objects';
import { CORE_KIND_SPECS } from './kinds-core';
import { DATA_KIND_SPECS } from './kinds-data';
import { IDEA_KIND_SPECS } from './kinds-ideas';
import { MONEY_KIND_SPECS } from './kinds-money';
import { STORY_KIND_SPECS } from './kinds-story';
import { TEXT_KIND_SPECS } from './kinds-text';

export const ALL_KIND_SPECS: readonly AnyKindSpec[] = [
  ...CORE_KIND_SPECS,
  ...TEXT_KIND_SPECS,
  ...DATA_KIND_SPECS,
  ...THREE_D_KIND_SPECS,
  ...IDEA_KIND_SPECS,
  ...MONEY_KIND_SPECS,
  ...STORY_KIND_SPECS,
  ...OBJECT_KIND_SPECS,
];

const BY_KIND = new Map<ExplainerSceneKind, AnyKindSpec>(ALL_KIND_SPECS.map((s) => [s.kind, s]));

export function getKindSpec(kind: string): AnyKindSpec | undefined {
  return BY_KIND.get(kind as ExplainerSceneKind);
}
