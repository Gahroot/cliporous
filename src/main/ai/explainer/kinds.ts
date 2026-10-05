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
import {
  authorityHandoffSpec,
  constraintCheckSpec,
  delegationScopeSpec,
} from './kinds-business-authority';
import {
  CAPITAL_STRUCTURE_SPEC,
  ECONOMIC_RIGHTS_SPEC,
  INVESTMENT_OUTCOMES_SPEC,
} from './kinds-business-capital';
import { BUSINESS_BLUEPRINT_SPEC, BUSINESS_REPLICATION_SPEC } from './kinds-business-commercial';
import {
  MEASUREMENT_FRAME_SPEC,
  STAGED_DECISION_SPEC,
  UNCERTAINTY_ALBUM_SPEC,
} from './kinds-business-decisions';
import {
  OPERATING_COST_SPEC,
  SCALE_ECONOMICS_SPEC,
  VALUE_CAPTURE_SPEC,
} from './kinds-business-economics';
import {
  DISTRIBUTION_WATERFALL_SPEC,
  FUND_LIFECYCLE_SPEC,
  FUND_LIQUIDITY_SPEC,
} from './kinds-business-funds';
import { CAPACITY_MAP_SPEC, OPERATING_LINEAGE_SPEC } from './kinds-business-infrastructure';
import { MARKET_DEPENDENCY_SPEC, PROCUREMENT_COMMITMENT_SPEC } from './kinds-business-markets';
import { ORGANIZATION_MAP_SPEC, SYSTEM_RECONCILIATION_SPEC } from './kinds-business-organization';
import { COORDINATION_MAP_SPEC, TASK_MAP_SPEC, WORK_REDESIGN_SPEC } from './kinds-business-work';
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
  TASK_MAP_SPEC,
  COORDINATION_MAP_SPEC,
  WORK_REDESIGN_SPEC,
  delegationScopeSpec,
  authorityHandoffSpec,
  constraintCheckSpec,
  BUSINESS_BLUEPRINT_SPEC,
  BUSINESS_REPLICATION_SPEC,
  ORGANIZATION_MAP_SPEC,
  SYSTEM_RECONCILIATION_SPEC,
  OPERATING_COST_SPEC,
  SCALE_ECONOMICS_SPEC,
  VALUE_CAPTURE_SPEC,
  MARKET_DEPENDENCY_SPEC,
  PROCUREMENT_COMMITMENT_SPEC,
  FUND_LIFECYCLE_SPEC,
  DISTRIBUTION_WATERFALL_SPEC,
  FUND_LIQUIDITY_SPEC,
  ECONOMIC_RIGHTS_SPEC,
  CAPITAL_STRUCTURE_SPEC,
  INVESTMENT_OUTCOMES_SPEC,
  CAPACITY_MAP_SPEC,
  OPERATING_LINEAGE_SPEC,
  STAGED_DECISION_SPEC,
  MEASUREMENT_FRAME_SPEC,
  UNCERTAINTY_ALBUM_SPEC,
];

const BY_KIND = new Map<ExplainerSceneKind, AnyKindSpec>(ALL_KIND_SPECS.map((s) => [s.kind, s]));

export function getKindSpec(kind: string): AnyKindSpec | undefined {
  return BY_KIND.get(kind as ExplainerSceneKind);
}
