import type React from 'react';
import { ApprovalRail } from '../explainer/business/assets/authority';
import { CommitmentFolio } from '../explainer/business/assets/funds';
import { BranchPod, OperatingDesk } from '../explainer/business/assets/retail';
import { ApprovalGateModelParts } from '../explainer/business/authority/ApprovalGateParts';
import { AuthorityModelParts } from '../explainer/business/authority/Scene';
import { CapitalDependencyModelParts } from '../explainer/business/capital/DependencyLensParts';
import { CapitalModelParts } from '../explainer/business/capital/parts';
import { CommercialModelParts } from '../explainer/business/commercial/Scene';
import { BusinessAlternativeModelParts } from '../explainer/business/decisions/alternative-parts';
import { EconomicsModelParts } from '../explainer/business/economics/parts';
import { FundsModelParts } from '../explainer/business/funds/parts';
import { InfrastructureModelParts } from '../explainer/business/infrastructure/parts';
import { MarketsModelParts } from '../explainer/business/markets/MarketsModelParts';
import { OrganizationModelParts } from '../explainer/business/organization/parts';
import { WorkModelParts } from '../explainer/business/work/Scene';
import {
  BUSINESS_MODEL_FRAMING,
  type BusinessModelRail,
  type BusinessNativePose,
  businessPanelNativePose,
  businessPanelVisualMode,
  visibleBusinessPanels,
} from './business-panel-state';
import type { BoardBusinessPanel } from './business-types';
import type { CameraPose } from './camera';

/** The native decision parts read Remotion's clock. Reuse their exact asset selection and
 * authored transforms with the already-sampled pose instead; do not create a second clock.
 */
function HeldDecisionParts({
  native,
}: {
  native: Extract<BusinessNativePose, { pack: 'decisions' }>;
}): React.ReactElement | null {
  const { scene, pose } = native;
  const supported = (asset: string, identityId: string) =>
    pose.native.some((entry) => entry.asset === asset && entry.identityId === identityId);
  if (!pose.native.length) return null;
  switch (scene.preset) {
    case 'contingent-commitment':
      return (
        <group name="contingent-commitment">
          {supported('A-09', scene.commitment.identity.id) && (
            <group name={scene.commitment.identity.id} position={[-1.35, 0.3, 0]} scale={0.58}>
              <CommitmentFolio open={pose.folioOpen} contributed={pose.contributed} />
            </group>
          )}
          {supported('A-06', scene.gate.id) && (
            <group name={scene.gate.id} position={[1.4, 0.3, 0]} scale={0.6}>
              <ApprovalRail accepted={0} />
            </group>
          )}
        </group>
      );
    case 'planned-observed':
    case 'original-and-surviving-cohorts':
      return supported('A-04', scene.owner.id) ? (
        <group name={scene.owner.id} position={[0, 0.35, 0]} scale={0.85}>
          <OperatingDesk pending={pose.deskPending} />
        </group>
      ) : null;
    case 'alternatives-or-source-distribution':
      return supported('A-03', scene.owner.id) ? (
        <group name={scene.owner.id} position={[0, 0.3, 0]} scale={0.75}>
          <BranchPod open={pose.branchOpen} />
        </group>
      ) : null;
    default:
      return null;
  }
}

/** Native geometry only, in native model units. Palette comes from the EXISTING provider.
 * Diagram has no group at all. No native stage, text, lighting, camera or canvas is mounted.
 */
export function BusinessPanelNativeModels({
  panel,
  seconds,
}: {
  panel: BoardBusinessPanel;
  seconds: number;
}): React.ReactElement | null {
  if (businessPanelVisualMode(panel) === 'diagram') return null;
  const native = businessPanelNativePose(panel, seconds);
  const t = Math.min(
    panel.endAt,
    panel.scene.resolveAt,
    Math.max(panel.startAt, Number.isFinite(seconds) ? seconds : panel.startAt),
  );
  let parts: React.ReactNode;
  switch (native.pack) {
    case 'work':
      parts = <WorkModelParts scene={native.scene} pose={native.pose} />;
      break;
    case 'authority':
      parts = <AuthorityModelParts scene={native.scene} pose={native.pose} />;
      break;
    case 'commercial':
      parts = <CommercialModelParts scene={native.scene} seconds={t} />;
      break;
    case 'organization':
      parts = <OrganizationModelParts scene={native.scene} pose={native.pose} />;
      break;
    case 'economics':
      parts = <EconomicsModelParts scene={native.scene} seconds={t} />;
      break;
    case 'markets':
      parts = <MarketsModelParts scene={native.scene} seconds={t} />;
      break;
    case 'funds':
      parts = <FundsModelParts scene={native.scene} pose={native.pose} />;
      break;
    case 'capital':
      parts = <CapitalModelParts scene={native.scene} seconds={t} />;
      break;
    case 'infrastructure':
      parts = <InfrastructureModelParts scene={native.scene} seconds={t} />;
      break;
    case 'decisions':
      parts = <HeldDecisionParts native={native} />;
      break;
    case 'approval':
      parts = <ApprovalGateModelParts scene={native.scene} seconds={t} />;
      break;
    case 'dependency':
      parts = (
        <CapitalDependencyModelParts scene={native.scene} lens={native.lens} pose={native.pose} />
      );
      break;
    case 'alternatives':
      parts = (
        <BusinessAlternativeModelParts scene={native.scene} lens={native.lens} pose={native.pose} />
      );
      break;
  }
  return (
    <group
      name={`business-panel:${panel.id}`}
      userData={{
        businessPanelId: panel.id,
        recipe: panel.recipe,
        sourceScene: panel.scene,
        identityLinks: panel.identityLinks,
      }}
    >
      {parts}
    </group>
  );
}

/** Place native groups in the same pixel-camera plane as BoardProps3D. The coordinator owns
 * disjoint model/text rails and aggregate admission; no selection or registration happens here.
 */
export function BoardBusinessModels({
  panels,
  rails,
  camera,
  seconds,
  width,
  height,
}: {
  panels: readonly BoardBusinessPanel[];
  rails: Readonly<Record<string, BusinessModelRail>>;
  camera: CameraPose;
  seconds: number;
  width: number;
  height: number;
}): React.ReactElement | null {
  const visible = visibleBusinessPanels(panels, rails, camera, seconds, width, height);
  if (!visible.length) return null;
  return (
    <group name="board-business-models">
      {visible.map(({ panel, placement }) => (
        <group
          key={panel.id}
          name={`business-rail:${panel.id}`}
          position={placement.position}
          scale={placement.unit}
          rotation={[0, BUSINESS_MODEL_FRAMING.yaw, 0]}
        >
          <BusinessPanelNativeModels panel={panel} seconds={placement.time} />
        </group>
      ))}
    </group>
  );
}
