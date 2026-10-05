import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import { ApprovalRail, ExceptionTrolley, PermissionCard, PlaybookBinder } from './authority';
import {
  CommitmentFolio,
  DistributionTierTrays,
  EconomicRightsLayers,
  MaturityLadder,
} from './funds';
import {
  CoolingLoop,
  DataCenterRack,
  PowerReadinessSubstation,
  ProviderConnectorPanel,
} from './infrastructure';
import { BusinessAssetParts } from './parts';
import { BranchPod, CommercialStorefront, OperatingDesk, ServiceStation } from './retail';
import type { BusinessAssembly } from './types';

const cases = [
  { assembly: { asset: 'A-01', open: 1 }, component: CommercialStorefront },
  { assembly: { asset: 'A-02', occupied: false }, component: ServiceStation },
  { assembly: { asset: 'A-03', open: 1 }, component: BranchPod },
  { assembly: { asset: 'A-04', pending: true }, component: OperatingDesk },
  { assembly: { asset: 'A-05', state: 'unknown', focus: 1 }, component: PermissionCard },
  { assembly: { asset: 'A-06', accepted: 0 }, component: ApprovalRail },
  { assembly: { asset: 'A-07', open: 1, revision: 0 }, component: PlaybookBinder },
  { assembly: { asset: 'A-08', pending: true }, component: ExceptionTrolley },
  { assembly: { asset: 'A-09', open: 1, contributed: false }, component: CommitmentFolio },
  { assembly: { asset: 'A-10', fills: [0, 0, 0, 0] }, component: DistributionTierTrays },
  { assembly: { asset: 'A-11', focus: 0 }, component: MaturityLadder },
  { assembly: { asset: 'A-12', separation: 1 }, component: EconomicRightsLayers },
  { assembly: { asset: 'A-13', activity: 1 }, component: DataCenterRack },
  { assembly: { asset: 'A-14', ready: false }, component: PowerReadinessSubstation },
  { assembly: { asset: 'A-15', active: false }, component: CoolingLoop },
  { assembly: { asset: 'A-16', connected: false, progress: 1 }, component: ProviderConnectorPanel },
] satisfies { assembly: BusinessAssembly; component: unknown }[];

describe('ordinary scene/shared-board asset parts, not an untrusted asset-selection API', () => {
  it.each(
    cases,
  )('maps $assembly.asset without a stage or loss of source identity/state', (fixture) => {
    const instance = { identityId: 'source-subject', assembly: fixture.assembly };
    const before = structuredClone(instance);
    const result = BusinessAssetParts({ instance });
    expect(result.type).toBe('group');
    if (!isValidElement<{ name: string; userData: unknown; children: unknown }>(result))
      throw new Error('Missing semantic assembly group');
    expect(result.props.name).toBe('business-asset:source-subject');
    expect(result.props.userData).toEqual({
      sourceIdentityId: 'source-subject',
      businessAssetId: fixture.assembly.asset,
    });
    const child = result.props.children;
    if (!isValidElement<Record<string, unknown>>(child)) throw new Error('Missing authored part');
    expect(child.type).toBe(fixture.component);
    const { asset: _asset, ...props } = fixture.assembly;
    expect(child.props).toEqual(props);
    expect(instance).toEqual(before);
  });
});
