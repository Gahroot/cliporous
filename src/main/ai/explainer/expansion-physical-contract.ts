import type { ExpansionPhysicalScene } from '../../remotion/compositions/explainer/expansion/physical/types';
import {
  parseExpansionDirectionalField,
  parseExpansionEnergyBudget,
} from './expansion-physical-energy-field-contract';
import {
  parseExpansionInterference,
  parseExpansionMaterialStateCycle,
} from './expansion-physical-interference-cycle-contract';
import {
  parseExpansionDiffusionFilter,
  parseExpansionSharedResource,
} from './expansion-physical-resource-diffusion-contract';
import {
  parseExpansionIncentiveExternality,
  parseExpansionSupplyChain,
} from './expansion-physical-supply-incentives-contract';
import type { ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

/** Local routes only; never turn an unsupported physical preset into a generic scene. */
export function parseExpansionPhysical(raw: Rec, ctx: ParseContext): ExpansionPhysicalScene | null {
  if (raw.kind === 'inventory-demand' && raw.preset === 'supply-chain')
    return parseExpansionSupplyChain(raw, ctx);
  if (raw.kind === 'market-exchange' && raw.preset === 'incentive-externality')
    return parseExpansionIncentiveExternality(raw, ctx);
  if (raw.kind === 'resource-allocation' && raw.preset === 'shared-resource')
    return parseExpansionSharedResource(raw, ctx);
  if (raw.kind === 'material-process' && raw.preset === 'diffusion-filter')
    return parseExpansionDiffusionFilter(raw, ctx);
  if (raw.kind === 'signal-composition' && raw.preset === 'interference')
    return parseExpansionInterference(raw, ctx);
  if (raw.kind === 'material-process' && raw.preset === 'state-cycle')
    return parseExpansionMaterialStateCycle(raw, ctx);
  if (raw.kind === 'conservation-flow' && raw.preset === 'energy-budget')
    return parseExpansionEnergyBudget(raw, ctx);
  if (raw.kind === 'field-map' && raw.preset === 'directional-field')
    return parseExpansionDirectionalField(raw, ctx);
  return mechanismIssue(ctx, 'physical requires an explicit supported kind/preset route');
}
