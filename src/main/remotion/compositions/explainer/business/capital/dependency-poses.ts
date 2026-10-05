import { diagramPose } from '../../diagrams/motion';
import type { PortfolioExposureScene } from '../../finance/types';
import { type BusinessClock, businessPhases, sampleConstraintFocus } from '../motion';
import {
  type CapitalDependencyPage,
  capitalDependencyPageAt,
  capitalDependencySemanticIds,
} from './dependency-presentation';
import type { CapitalDependencyLens } from './dependency-types';

export interface CapitalDependencyRecordPose {
  fundId: string;
  firmId: string;
  position: [number, number, number];
  scale: number;
}
export interface CapitalDependencyPose {
  time: number;
  opacity: number;
  holding: boolean;
  page: CapitalDependencyPage;
  semanticIds: string[];
  focus: ReturnType<typeof sampleConstraintFocus>;
  /** Opening existing records is inspection, never payment, transfer or a new economic right. */
  separation: number;
  modelTurn: number;
  records: CapitalDependencyRecordPose[];
  sourceLens: CapitalDependencyLens;
}

/** Pure seconds/30fps sampling. Source spans, identities and edges are copied, not interpolated. */
export function sampleCapitalDependency(
  scene: PortfolioExposureScene,
  lens: CapitalDependencyLens,
  seconds: number,
): CapitalDependencyPose {
  const time = Math.min(scene.resolveAt, Number.isFinite(seconds) ? seconds : scene.setupAt - 1);
  const clock: BusinessClock = { frame: time * 30, fps: 30, beats: scene };
  const phases = businessPhases(clock);
  const semanticIds = capitalDependencySemanticIds(scene.funds, scene.exposure, lens);
  return {
    time,
    opacity: phases.setup,
    holding: phases.holding,
    page: capitalDependencyPageAt(scene, scene.funds, scene.exposure, lens, time),
    semanticIds,
    focus: sampleConstraintFocus(clock, semanticIds, scene.exposure.id),
    separation: phases.action,
    modelTurn: diagramPose(time, scene).modelTurn,
    records: scene.funds.map((fund, slot) => {
      const firm = lens.firms.find((entry) => entry.fundId === fund.id);
      if (!firm) throw new Error('Missing source-held firm for a separate fund record');
      return {
        fundId: fund.id,
        firmId: firm.identity.id,
        position: [(slot - 0.5) * 2.7, 0.1, -0.35],
        scale: 0.88,
      };
    }),
    sourceLens: {
      version: lens.version,
      firms: lens.firms.map((firm) => ({
        fundId: firm.fundId,
        identity: { ...firm.identity, source: { ...firm.identity.source } },
        holdingSource: { ...firm.holdingSource },
        driverSource: { ...firm.driverSource },
      })),
      modelSource: { ...lens.modelSource },
      finalHoldSeconds: lens.finalHoldSeconds,
    },
  };
}
