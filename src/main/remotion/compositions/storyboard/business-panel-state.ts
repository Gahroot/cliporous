import { AUTHORITY_ASSET_BUDGETS } from '../explainer/business/assets/authority-poses';
import { FUNDS_ASSET_BUDGETS } from '../explainer/business/assets/funds-poses';
import { INFRASTRUCTURE_ASSET_BUDGETS } from '../explainer/business/assets/infrastructure-poses';
import { RETAIL_ASSET_BUDGETS } from '../explainer/business/assets/retail-poses';
import { sampleApprovalGate } from '../explainer/business/authority/approval-poses';
import { sampleBusinessAuthority } from '../explainer/business/authority/poses';
import { sampleCapitalDependency } from '../explainer/business/capital/dependency-poses';
import { capitalAssembly, sampleCapital } from '../explainer/business/capital/poses';
import { BUSINESS_RECIPES } from '../explainer/business/catalog';
import { sampleCommercial } from '../explainer/business/commercial/poses';
import { sampleBusinessAlternative } from '../explainer/business/decisions/alternative-poses';
import { decisionsPose } from '../explainer/business/decisions/poses';
import { economicsFacts } from '../explainer/business/economics/identities';
import { economicsAssembly, sampleEconomics } from '../explainer/business/economics/poses';
import { sampleFundsScene } from '../explainer/business/funds/poses';
import { fundsObserved } from '../explainer/business/funds/types';
import {
  infrastructureAssets,
  sampleInfrastructure,
} from '../explainer/business/infrastructure/poses';
import { infrastructureIdentities } from '../explainer/business/infrastructure/presentation';
import { marketsAssets, sampleMarkets } from '../explainer/business/markets/poses';
import { marketsIdentities } from '../explainer/business/markets/presentation';
import { sampleOrganizationScene } from '../explainer/business/organization/poses';
import { sampleWorkScene } from '../explainer/business/work/poses';

import type { BoardBusinessPanel } from './business-types';
import { type CameraPose, worldToScreen } from './camera';
import { pixelCameraDistance } from './prop-state';

/** Coordinator reserves this separate from its text rail. Coordinates are board pixels. */
export interface BusinessModelRail {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Code-owned model envelope; CPU primitive-geometry audits cover source fixtures/beat seeks.
 * These are authored extents, NOT measured GPU/RSS. Text is a separate coordinator rail.
 * 640x480 is a proposed visual-review size, not an enforced or proven legibility minimum.
 */
export const BUSINESS_MODEL_FRAMING = {
  suggestedRail: { width: 640, height: 480 },
  bounds: { min: [-6, -4, -4], max: [6, 4, 4] },
  box: { width: 14, height: 10 },
  yaw: -0.15,
} as const;

/** No offset subtraction: the compiler's native and panel clocks have already been rebased. */
export function businessPanelClock(panel: BoardBusinessPanel, seconds: number): number {
  const end = Math.min(panel.endAt, panel.scene.resolveAt);
  if (!Number.isFinite(end) || end < panel.startAt)
    throw new Error(`Invalid business panel clock: ${panel.id}`);
  return Math.min(end, Math.max(panel.startAt, Number.isFinite(seconds) ? seconds : panel.startAt));
}

/** Tagged native poses retain their original discriminated scene, IDs and negative/unknown facts. */
function sampleBusinessPanelNativePose(panel: BoardBusinessPanel, seconds: number) {
  const scene = panel.scene;
  const recipe = BUSINESS_RECIPES.find((entry) => entry.id === panel.recipe);
  if (!recipe || recipe.kind !== scene.kind || recipe.preset !== scene.preset)
    throw new Error(`Business panel recipe/source mismatch: ${panel.id}`);
  const t = businessPanelClock(panel, seconds);
  const clock = { frame: t * 30, fps: 30, beats: scene };
  switch (scene.kind) {
    case 'task-map':
    case 'coordination-map':
    case 'work-redesign':
      return { pack: 'work' as const, scene, pose: sampleWorkScene(scene, t) };
    case 'delegation-scope':
    case 'authority-handoff':
    case 'constraint-check':
      return { pack: 'authority' as const, scene, pose: sampleBusinessAuthority(scene, clock) };
    case 'business-blueprint':
    case 'business-replication':
      return { pack: 'commercial' as const, scene, pose: sampleCommercial(scene, t) };
    case 'organization-map':
    case 'system-reconciliation':
      return { pack: 'organization' as const, scene, pose: sampleOrganizationScene(scene, t) };
    case 'operating-cost':
    case 'scale-economics':
    case 'value-capture':
      return { pack: 'economics' as const, scene, pose: sampleEconomics(scene, t) };
    case 'market-dependency':
    case 'procurement-commitment':
      return { pack: 'markets' as const, scene, pose: sampleMarkets(scene, t) };
    case 'fund-lifecycle':
    case 'distribution-waterfall':
    case 'fund-liquidity':
      return { pack: 'funds' as const, scene, pose: sampleFundsScene(scene, t) };
    case 'economic-rights':
    case 'capital-structure':
    case 'investment-outcomes':
      return { pack: 'capital' as const, scene, pose: sampleCapital(scene, t) };
    case 'capacity-map':
    case 'operating-lineage':
      return { pack: 'infrastructure' as const, scene, pose: sampleInfrastructure(scene, t) };
    case 'staged-decision':
    case 'measurement-frame':
    case 'uncertainty-album':
      return { pack: 'decisions' as const, scene, pose: decisionsPose(scene, t * 30, 30) };
    case 'agent-workflow': {
      const pose = sampleApprovalGate(scene, t);
      if (panel.recipe !== 'OP-10' || !pose) throw new Error('OP-10 requires native approval-gate');
      return { pack: 'approval' as const, scene, pose };
    }
    case 'portfolio-exposure': {
      const lens = scene.dependencyLens;
      if (panel.recipe !== 'OP-58' || !lens)
        throw new Error('OP-58 requires source dependency lens');
      return {
        pack: 'dependency' as const,
        scene,
        lens,
        pose: sampleCapitalDependency(scene, lens, t),
      };
    }
    case 'possible-futures': {
      const lens = scene.businessAlternatives;
      if (panel.recipe !== 'OP-75' || !lens)
        throw new Error('OP-75 requires source alternatives lens');
      return {
        pack: 'alternatives' as const,
        scene,
        lens,
        pose: sampleBusinessAlternative(scene, lens, t),
      };
    }
  }
}

export type BusinessNativePose = ReturnType<typeof sampleBusinessPanelNativePose>;

export function businessPanelNativePose(
  panel: BoardBusinessPanel,
  seconds: number,
): BusinessNativePose {
  return sampleBusinessPanelNativePose(panel, seconds);
}

export interface BusinessPanelResources {
  modelInstances: number;
  meshes: number;
  authoredModels: string[];
  looseMeshes: number;
  ceiling: { modelInstances: number; meshes: number };
  bounds: typeof BUSINESS_MODEL_FRAMING.bounds;
}

export interface BusinessPanelPlacement {
  time: number;
  visible: boolean;
  position: [number, number, number];
  unit: number;
  radius: number;
}

const ASSET_MESHES = {
  ...RETAIL_ASSET_BUDGETS,
  ...AUTHORITY_ASSET_BUDGETS,
  ...FUNDS_ASSET_BUDGETS,
  ...INFRASTRUCTURE_ASSET_BUDGETS,
  // Baseline folio excludes the optional four-mesh source-observed banknote.
  // The funds branch adds it only when the native source pose mounts it.
  'A-09': 17,
};
const BASE_MESHES = { document: 7, desk: 8, tray: 5, inbox: 3, person: 8, folder: 3 } as const;
type AuthoredModel = keyof typeof ASSET_MESHES | keyof typeof BASE_MESHES;

/** Exact mounted topology, including hidden/zero-opacity meshes, not GPU memory.
 * modelInstances counts reusable authored assemblies (A01-16, documents, desks, etc.),
 * once at their outer boundary; internal submodels aren't double counted. Loose source
 * rails/settlement marks count towards meshes, not reusable model instances.
 * Scenes over the coordinator's aggregate six-instance limit must NOT be silently thinned.
 */
export function businessPanelResources(
  panel: BoardBusinessPanel,
  seconds = panel.scene.resolveAt,
): BusinessPanelResources {
  const native = businessPanelNativePose(panel, seconds);
  const models: AuthoredModel[] = [];
  let looseMeshes = 0;
  let optionalCeilingMeshes = 0;
  const add = (model: AuthoredModel, count = 1) => {
    for (let i = 0; i < count; i++) models.push(model);
  };
  const asset = (id: string) => {
    if (!(id in ASSET_MESHES)) throw new Error(`Unaccounted authored asset ${id}`);
    add(id as keyof typeof ASSET_MESHES);
  };
  const link = (state: string) =>
    ['source-stated', 'observed', 'dependent', 'compatible'].includes(state) ? 1 : 2;
  if (businessPanelVisualMode(panel) === 'hybrid') {
    switch (native.pack) {
      case 'work': {
        const { scene, pose } = native;
        if (scene.kind === 'work-redesign') {
          if (scene.preset === 'redeployment') {
            add('person');
            add('desk');
            add(
              'document',
              new Set([...scene.beforeTasks, ...scene.afterTasks].map((task) => task.id)).size,
            );
          } else {
            add('document', 2);
            add('A-07');
          }
        } else {
          const approval = scene.kind === 'coordination-map' && scene.preset === 'approval-load';
          const pending =
            scene.holds.some((hold) => hold.state === 'pending') ||
            (approval && scene.queue.state === 'pending');
          add(pending ? 'A-04' : 'desk');
          add('document', pose.tasks.length);
          if (scene.kind === 'task-map' && scene.preset === 'task-split') add('folder');
          if (scene.kind === 'coordination-map') {
            add(
              'inbox',
              scene.preset === 'supervised-fanout'
                ? 1 + scene.delegates.length
                : scene.actors.length,
            );
            if (approval) add('A-06');
          }
        }
        break;
      }
      case 'authority': {
        const { scene, pose } = native;
        switch (scene.preset) {
          case 'conflicting-limits':
            break;
          case 'permissions':
            add('A-05', pose.cards.length);
            break;
          case 'action-limits':
            add('A-05', pose.cards.length);
            add('A-07');
            break;
          case 'exception-review':
            add(scene.review.state === 'pending' ? 'A-08' : 'A-05');
            break;
          case 'accountable-transfer':
            add(scene.roles.approverId === null ? 'A-07' : 'A-06');
            break;
          default:
            add('A-07');
        }
        break;
      }
      case 'commercial': {
        const { scene } = native;
        if (scene.kind === 'business-replication') {
          add('document');
          add('A-03', scene.units.length);
          add('document', scene.units.length);
          looseMeshes += scene.units.reduce((sum, unit) => sum + link(unit.standardUse.state), 0);
        } else
          switch (scene.preset) {
            case 'back-office':
              add('A-01');
              add('document', 1 + scene.tasks.length);
              looseMeshes += scene.tasks.reduce((sum, task) => sum + link(task.state), 0);
              break;
            case 'service-slots':
              add('A-02');
              for (const role of ['reserved', 'used', 'available'] as const)
                add(scene[role] ? 'document' : 'tray');
              break;
            case 'service-lifecycle': {
              add('desk');
              add('A-02');
              const stages = [scene.lead, scene.booking, scene.delivery];
              add('document', new Set(stages.map((stage) => stage.identity.id)).size);
              looseMeshes += stages.reduce((sum, stage) => sum + link(stage.state), 0);
              break;
            }
            case 'owner-dependency':
              add('A-01');
              add('person');
              add('document');
              looseMeshes += link(scene.dependency.state);
              break;
            case 'service-modules':
              add('A-02');
              add('document', scene.modules.length + (scene.repeatedOffering ? 1 : 0));
              looseMeshes += scene.compatibility.reduce((sum, entry) => sum + link(entry.state), 0);
              break;
          }
        break;
      }
      case 'organization': {
        const { scene, pose } = native;
        switch (scene.preset) {
          case 'federated-units':
          case 'stated-chargeback':
            add('A-03', scene.units.length);
            break;
          case 'rollout-rings':
            add('A-03', scene.rings.length);
            break;
          case 'decision-rights':
            add('A-03', scene.units.length);
            if (pose.preset === 'decision-rights') add('A-05', pose.rights.length);
            break;
          case 'legacy-boundaries':
            add('A-16');
            break;
          case 'merge-identities':
            add('A-04');
            break;
          case 'declared-tool-boundaries':
            break;
        }
        break;
      }
      case 'economics': {
        const { scene, pose } = native;
        const instance = economicsAssembly(scene, pose);
        if (instance) {
          asset(instance.assembly.asset);
          const facts = economicsFacts(scene);
          add('document', facts.length);
          for (const fact of facts) {
            if (
              pose.decompositions
                .flatMap((group) => group.parts)
                .some((part) => part.id === fact.id)
            )
              looseMeshes++;
            if (
              pose.alternatives.some(
                (part) => fact.id === part.id || fact.id.startsWith(`${part.id}:`),
              )
            )
              looseMeshes++;
          }
        }
        break;
      }
      case 'markets': {
        const { scene, pose } = native;
        if (scene.kind === 'market-dependency' && scene.preset === 'stated-participation-benefit')
          break;
        const assets = marketsAssets(scene);
        for (const identity of marketsIdentities(scene)) {
          const carrier = assets.find((entry) => entry.id === identity.id);
          if (carrier) asset(carrier.asset);
          else add('document');
        }
        add('document', pose.matches.length * 2);
        if (
          scene.kind === 'procurement-commitment' &&
          scene.payment.state === 'paid' &&
          scene.payment.amount !== null
        )
          looseMeshes++;
        break;
      }
      case 'funds': {
        const { scene, pose } = native;
        if (scene.carrierSource === null) break;
        if (pose.folio.contributed) looseMeshes += 4;
        const canContribute =
          scene.preset === 'capital-states'
            ? fundsObserved(scene.contributed) && scene.contributed.amount.minorUnits > 0
            : scene.preset === 'source-periods' &&
              scene.periods.some(
                (period) =>
                  period.account === 'contributed' &&
                  fundsObserved(period.value) &&
                  period.value.amount.minorUnits > 0,
              );
        if (canContribute && !pose.folio.contributed) optionalCeilingMeshes = 4;
        switch (scene.preset) {
          case 'capital-states':
          case 'subscriptions-and-close':
          case 'source-periods':
            add('A-09');
            break;
          case 'stated-priority-tiers':
            add('A-10');
            break;
          case 'retained-follow-on-capital':
            add('A-09');
            add('A-10');
            break;
          case 'periodic-repurchase':
            add('A-09');
            add('A-08');
            break;
          case 'valuation-cash-distinction':
            add('A-12');
            break;
          case 'gross-to-net':
            break;
        }
        break;
      }
      case 'capital':
        for (const entry of capitalAssembly(native.scene)) asset(entry.asset);
        break;
      case 'infrastructure': {
        const { scene, pose } = native;
        const assets = infrastructureAssets(scene);
        if (scene.preset === 'evaluation-periods' || !assets.length) break;
        for (const identity of infrastructureIdentities(scene)) {
          const carrier = assets.find((entry) => entry.id === identity.id);
          if (carrier) asset(carrier.asset);
          else add('document');
        }
        if (scene.preset === 'versioned-provenance')
          looseMeshes += scene.edges.filter(
            (edge) =>
              edge.state === 'source-stated' &&
              pose.identities.some((identity) => identity.id === edge.fromId) &&
              pose.identities.some((identity) => identity.id === edge.toId),
          ).length;
        break;
      }
      case 'decisions': {
        const { scene, pose } = native;
        const supports = (id: string, subject: string) =>
          pose.native.some((entry) => entry.asset === id && entry.identityId === subject);
        switch (scene.preset) {
          case 'contingent-commitment':
            if (supports('A-09', scene.commitment.identity.id)) add('A-09');
            if (supports('A-06', scene.gate.id)) add('A-06');
            break;
          case 'planned-observed':
          case 'original-and-surviving-cohorts':
            if (supports('A-04', scene.owner.id)) add('A-04');
            break;
          case 'alternatives-or-source-distribution':
            if (supports('A-03', scene.owner.id)) add('A-03');
            break;
        }
        break;
      }
      case 'approval':
        add('A-06');
        break;
      case 'dependency':
        add('A-12', native.pose.records.length);
        break;
      case 'alternatives':
        if (native.lens.native?.assembly === 'A-03') add('A-03', native.pose.records.length);
        break;
    }
  }
  const meshes =
    looseMeshes +
    models.reduce(
      (sum, model) =>
        sum +
        (model in ASSET_MESHES
          ? ASSET_MESHES[model as keyof typeof ASSET_MESHES]
          : BASE_MESHES[model as keyof typeof BASE_MESHES]),
      0,
    );
  return {
    modelInstances: models.length,
    meshes,
    authoredModels: models,
    looseMeshes,
    ceiling: { modelInstances: models.length, meshes: meshes + optionalCeilingMeshes },
    bounds: BUSINESS_MODEL_FRAMING.bounds,
  };
}

export function businessPanelVisualMode(panel: BoardBusinessPanel): 'diagram' | 'hybrid' {
  const scene = panel.scene;
  if (scene.kind === 'possible-futures') {
    if (!scene.businessAlternatives) throw new Error('Missing business alternatives lens');
    return scene.businessAlternatives.visualMode;
  }
  return scene.visualMode ?? 'hybrid';
}

export function businessPanelPlacement(
  panel: BoardBusinessPanel,
  rail: BusinessModelRail,
  cam: CameraPose,
  seconds: number,
  width: number,
  height: number,
): BusinessPanelPlacement {
  const values = [rail.x, rail.y, rail.width, rail.height, cam.x, cam.y, cam.zoom, width, height];
  if (!values.every(Number.isFinite) || cam.zoom <= 0 || width <= 0 || height <= 0)
    throw new Error('Nonfinite business model framing');
  if (rail.width <= 0 || rail.height <= 0)
    throw new Error(`Empty business model rail: ${panel.id}`);
  const center = { x: rail.x + rail.width / 2, y: rail.y + rail.height / 2 };
  const screen = worldToScreen(center, cam, width, height);
  const distance = pixelCameraDistance(height);
  const halfWidth = (rail.width * cam.zoom) / 2;
  const halfHeight = (rail.height * cam.zoom) / 2;
  const { yaw } = BUSINESS_MODEL_FRAMING;
  const xBound = 6 * Math.abs(Math.cos(yaw)) + 4 * Math.abs(Math.sin(yaw));
  const zBound = 6 * Math.abs(Math.sin(yaw)) + 4 * Math.abs(Math.cos(yaw));
  // Perspective parallax includes the rail's offset from camera centre. Fit the full
  // authored enclosure, not just a flat width/height, with a 5% rounding margin.
  const xReach = xBound + (Math.abs(screen.x - width / 2) * zBound) / distance;
  const yReach = 4 + (Math.abs(height / 2 - screen.y) * zBound) / distance;
  const unit =
    0.95 *
    Math.min(
      halfWidth / (xReach + (halfWidth * zBound) / distance),
      halfHeight / (yReach + (halfHeight * zBound) / distance),
      (distance - 10) / zBound,
    );
  const perspective = 1 / (1 - (unit * zBound) / distance);
  const radius = unit * Math.hypot(xReach, yReach) * perspective;
  return {
    time: businessPanelClock(panel, seconds),
    visible:
      Number.isFinite(seconds) &&
      seconds >= panel.startAt &&
      businessPanelVisualMode(panel) === 'hybrid' &&
      screen.x + radius >= 0 &&
      screen.x - radius <= width &&
      screen.y + radius >= 0 &&
      screen.y - radius <= height,
    position: [screen.x - width / 2, height / 2 - screen.y, 0] as [number, number, number],
    unit,
    radius,
  };
}

export function visibleBusinessPanels(
  panels: readonly BoardBusinessPanel[],
  rails: Readonly<Record<string, BusinessModelRail>>,
  cam: CameraPose,
  seconds: number,
  width: number,
  height: number,
): { panel: BoardBusinessPanel; placement: BusinessPanelPlacement }[] {
  return panels.flatMap((panel) => {
    // Validate native allowlist even for diagram panels: no legacy renderer broadening.
    businessPanelNativePose(panel, seconds);
    if (businessPanelVisualMode(panel) === 'diagram' || seconds < panel.startAt) return [];
    const rail = rails[panel.id];
    if (!rail) throw new Error(`Missing separate business model rail: ${panel.id}`);
    const placement = businessPanelPlacement(panel, rail, cam, seconds, width, height);
    return placement.visible ? [{ panel, rail, placement }] : [];
  });
}
