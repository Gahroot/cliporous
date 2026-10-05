import type React from 'react';
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
import { BranchPod, CommercialStorefront, OperatingDesk, ServiceStation } from './retail';
import type { BusinessAssembly, BusinessAssemblyInstance } from './types';

/** Concrete code-owned parts; only source parsers/adapters may produce these inputs. */
function assemblyPart(assembly: BusinessAssembly): React.ReactElement {
  switch (assembly.asset) {
    case 'A-01':
      return <CommercialStorefront open={assembly.open} />;
    case 'A-02':
      return <ServiceStation occupied={assembly.occupied} />;
    case 'A-03':
      return <BranchPod open={assembly.open} />;
    case 'A-04':
      return <OperatingDesk pending={assembly.pending} />;
    case 'A-05':
      return <PermissionCard state={assembly.state} focus={assembly.focus} />;
    case 'A-06':
      return <ApprovalRail accepted={assembly.accepted} />;
    case 'A-07':
      return <PlaybookBinder open={assembly.open} revision={assembly.revision} />;
    case 'A-08':
      return <ExceptionTrolley pending={assembly.pending} />;
    case 'A-09':
      return <CommitmentFolio open={assembly.open} contributed={assembly.contributed} />;
    case 'A-10':
      return <DistributionTierTrays fills={assembly.fills} />;
    case 'A-11':
      return <MaturityLadder focus={assembly.focus} />;
    case 'A-12':
      return <EconomicRightsLayers separation={assembly.separation} />;
    case 'A-13':
      return <DataCenterRack activity={assembly.activity} />;
    case 'A-14':
      return <PowerReadinessSubstation ready={assembly.ready} />;
    case 'A-15':
      return <CoolingLoop active={assembly.active} />;
    case 'A-16':
      return <ProviderConnectorPanel connected={assembly.connected} progress={assembly.progress} />;
  }
  const unhandled: never = assembly;
  return unhandled;
}

/** No camera, canvas or stage: ordinary scenes and board adapters share these model parts. */
export function BusinessAssetParts({
  instance,
}: {
  instance: BusinessAssemblyInstance;
}): React.ReactElement {
  return (
    <group
      name={`business-asset:${instance.identityId}`}
      userData={{
        sourceIdentityId: instance.identityId,
        businessAssetId: instance.assembly.asset,
      }}
    >
      {assemblyPart(instance.assembly)}
    </group>
  );
}
