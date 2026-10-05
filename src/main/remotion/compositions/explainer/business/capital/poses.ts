import { diagramPose, reveal } from '../../diagrams/motion';
import { capitalActivePage } from './presentation';
import { type CapitalScene, capitalHoldCount, capitalIdentities } from './types';

export type CapitalTreatment = 'M-03' | 'M-04' | 'M-06' | 'M-08' | 'M-12';
export interface CapitalPose {
  treatment: CapitalTreatment;
  pageId: string;
  entityIds: string[];
  holds: number;
  separation: number;
  folioOpen: number;
  /** No source clause in this grammar asserts contributed cash, even when shares were issued. */
  contributed: false;
  /** Rack emphasis is not commissioning, load, telemetry or money-derived power. */
  rackActivity: 0;
  maturityFocus: 0 | 1;
  focus: number;
  modelTurn: number;
  observedOwnership: { shares: number; total: number; percent: number } | null;
  rounds: { id: string; status: string; currentTotal: number; proposedTotal: number | null }[];
  outcomes: {
    id: string;
    measure: string;
    minorUnits: number | null;
    probability: { numerator: number; denominator: number } | null;
    equalArea: 1;
    equalFrequency: 1;
  }[];
  /** These are source labels, not clocks, durations or computed maturity events. */
  maturityLabels: string[];
}
export interface CapitalAssetPose {
  asset: 'A-09' | 'A-11' | 'A-12' | 'A-13';
  id: string;
  position: [number, number, number];
  scale: number;
}
function treatment(scene: CapitalScene): CapitalTreatment {
  switch (scene.preset) {
    case 'ownership-versus-claims':
      return 'M-04';
    case 'source-outcome-set':
      return 'M-08';
    case 'conditional-rounds':
      return 'M-12';
    case 'obligations-and-maturity':
      return 'M-06';
    default:
      return 'M-03';
  }
}
/** Pure source snapshots plus frame-seekable inspection. No financial calculator or simulator. */
export function sampleCapital(scene: CapitalScene, seconds: number): CapitalPose {
  const t = Number.isFinite(seconds)
    ? Math.max(scene.setupAt, Math.min(scene.resolveAt, seconds))
    : scene.setupAt;
  const action = reveal(t, scene.actionAt, Math.min(0.6, scene.responseAt - scene.actionAt));
  const inspection = reveal(t, scene.responseAt, Math.min(0.6, scene.checkAt - scene.responseAt));
  const rounds =
    scene.preset === 'conditional-rounds'
      ? scene.rounds.map((round) => ({
          id: round.identity.identity.id,
          status: round.status,
          currentTotal: round.status === 'issued' ? round.afterTotal : round.beforeTotal,
          proposedTotal: round.status === 'issued' ? null : round.afterTotal,
        }))
      : [];
  let observedOwnership: CapitalPose['observedOwnership'] = null;
  if (scene.preset === 'ownership-versus-claims') {
    observedOwnership = {
      shares: scene.ownership.shares,
      total: scene.ownership.total,
      percent: scene.ownership.percent,
    };
  } else if (scene.preset === 'conditional-rounds') {
    const lastIssued = [...scene.rounds].reverse().find((round) => round.status === 'issued');
    observedOwnership = {
      shares: scene.ownership.shares,
      total: lastIssued?.afterTotal ?? scene.ownership.total,
      percent: lastIssued?.afterPercent ?? scene.ownership.percent,
    };
  }
  const maturityLabels =
    scene.preset === 'financing-versus-capacity' || scene.preset === 'obligations-and-maturity'
      ? scene.obligations.map((obligation) => obligation.maturity)
      : [];
  return {
    treatment: treatment(scene),
    pageId: capitalActivePage(scene, t).id,
    entityIds: capitalIdentities(scene).map((identity) => identity.id),
    holds: capitalHoldCount(scene),
    separation: action,
    folioOpen:
      (scene.preset === 'conditional-rounds' && scene.rounds.some((r) => r.status !== 'issued')
        ? 0.32
        : 0.6) * action,
    contributed: false,
    rackActivity: 0,
    maturityFocus: maturityLabels.length > 1 && t >= scene.checkAt ? 1 : 0,
    focus: inspection,
    modelTurn: diagramPose(t, scene).modelTurn,
    observedOwnership,
    rounds,
    outcomes:
      scene.kind === 'investment-outcomes'
        ? scene.outcomes.map((o) => ({
            id: o.identity.id,
            measure: o.measure,
            minorUnits: o.amount.money?.minorUnits ?? null,
            probability: o.probability
              ? { numerator: o.probability.numerator, denominator: o.probability.denominator }
              : null,
            equalArea: 1,
            equalFrequency: 1,
          }))
        : [],
    maturityLabels,
  };
}
/** Fixed code-owned native assemblies; semantic counts never become mesh counts or fills. */
export function capitalAssembly(scene: CapitalScene): CapitalAssetPose[] {
  if (scene.kind === 'investment-outcomes') return [];
  if (scene.kind === 'economic-rights')
    return [{ asset: 'A-12', id: 'rights-records', position: [0, 0.25, -0.35], scale: 0.9 }];
  if (scene.preset === 'conditional-rounds')
    return [
      { asset: 'A-09', id: 'commitment-records', position: [-1.15, 0.2, -0.45], scale: 0.65 },
      { asset: 'A-12', id: 'round-rights-records', position: [1.15, 0.2, -0.5], scale: 0.76 },
    ];
  if (scene.preset === 'financing-versus-capacity')
    return [
      { asset: 'A-11', id: 'debt-records', position: [-1.45, 0.15, -0.45], scale: 0.9 },
      { asset: 'A-13', id: 'physical-rack', position: [1.35, 0.15, -0.55], scale: 0.9 },
    ];
  return [{ asset: 'A-11', id: 'maturity-records', position: [0, 0.1, -0.4], scale: 1.12 }];
}
