/**
 * Registry of every explainer scene kind the planner may use.
 */

import type { ExplainerSceneKind } from '../../remotion/compositions/explainer/types';
import type { AnyKindSpec } from './kind-spec';
import { THREE_D_KIND_SPECS } from './kinds-3d';
import { OBJECT_KIND_SPECS } from './kinds-3d-objects';
import { AGENT_WORKFLOW_SPEC } from './kinds-agent-workflow';
import { inferenceTradeoffSpec, tokenAttentionSpec } from './kinds-ai-diagrams';
import { ASSEMBLY_KIND_SPECS } from './kinds-assemblies';
import { cashTimingSpec } from './kinds-cash-timing';
import { COGNITION_KIND_SPECS } from './kinds-cognition';
import { COMPOSED_KIND_SPECS } from './kinds-composed';
import { CONCEPT_ADAPTIVE_SPECS } from './kinds-concept-adaptive';
import { CONCEPT_BUSINESS_OPERATIONS_SPECS } from './kinds-concept-business-operations';
import { CONCEPT_BUSINESS_POPULATIONS_SPECS } from './kinds-concept-business-populations';
import { CONCEPT_INFERENCE_SPECS } from './kinds-concept-inference';
import { CONCEPT_INFORMATION_SPECS } from './kinds-concept-information';
import { CONCEPT_PERSPECTIVE_SPECS } from './kinds-concept-perspective';
import { CONTEXT_WINDOW_SPEC } from './kinds-context-window';
import { CORE_KIND_SPECS } from './kinds-core';
import { DATA_KIND_SPECS } from './kinds-data';
import { detroitPlaceSpec } from './kinds-detroit';
import { fundFlowSpec, ownershipChangeSpec, portfolioExposureSpec } from './kinds-finance';
import { IDEA_KIND_SPECS } from './kinds-ideas';
import { MECHANISM_KIND_SPECS } from './kinds-mechanisms';
import { MONEY_KIND_SPECS } from './kinds-money';
import { REQUEST_ROUTING_SPEC } from './kinds-request-routing';
import { RETRIEVAL_GROUNDING_SPEC } from './kinds-retrieval-grounding';
import { SOFTWARE_RELEASE_SPEC } from './kinds-software-release';
import { SPATIAL_KIND_SPECS } from './kinds-spatial';
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
  ...MECHANISM_KIND_SPECS,
  ...ASSEMBLY_KIND_SPECS,
  ...COMPOSED_KIND_SPECS,
  AGENT_WORKFLOW_SPEC,
  RETRIEVAL_GROUNDING_SPEC,
  CONTEXT_WINDOW_SPEC,
  SOFTWARE_RELEASE_SPEC,
  REQUEST_ROUTING_SPEC,
  ...SPATIAL_KIND_SPECS,
  ...COGNITION_KIND_SPECS,
  ...CONCEPT_INFORMATION_SPECS,
  ...CONCEPT_INFERENCE_SPECS,
  ...CONCEPT_BUSINESS_OPERATIONS_SPECS,
  ...CONCEPT_BUSINESS_POPULATIONS_SPECS,
  ...CONCEPT_PERSPECTIVE_SPECS,
  ...CONCEPT_ADAPTIVE_SPECS,
  detroitPlaceSpec,
  fundFlowSpec,
  ownershipChangeSpec,
  portfolioExposureSpec,
  cashTimingSpec,
  tokenAttentionSpec,
  inferenceTradeoffSpec,
];

const BY_KIND = new Map<ExplainerSceneKind, AnyKindSpec>(ALL_KIND_SPECS.map((s) => [s.kind, s]));

export function getKindSpec(kind: string): AnyKindSpec | undefined {
  return BY_KIND.get(kind as ExplainerSceneKind);
}
