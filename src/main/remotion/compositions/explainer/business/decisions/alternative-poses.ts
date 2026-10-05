import type { PossibleFuturesScene } from '../../concepts/perspective/types';
import { diagramPose } from '../../diagrams/motion';
import { businessPhases, sampleAlternatives } from '../motion';
import {
  type BusinessAlternativeFact,
  type BusinessAlternativePage,
  businessAlternativeFacts,
  businessAlternativePageAt,
} from './alternative-presentation';
import type { BusinessAlternativesLens } from './alternative-types';

export interface BusinessAlternativePose {
  treatment: 'M-08';
  modelOpacity: number;
  diagramOpacity: number;
  modelTurn: number;
  open: number;
  page: BusinessAlternativePage;
  facts: BusinessAlternativeFact[];
  records: {
    id: string;
    alternativeId: string;
    subjectId: string;
    baselineId: string;
    position: [number, number, number];
    scale: number;
    area: number;
    opacity: number;
  }[];
}

/** Fixed equal record assemblies: capacity is text, not geometry/count/area or achieved output. */
export function sampleBusinessAlternative(
  scene: PossibleFuturesScene,
  lens: BusinessAlternativesLens,
  seconds: number,
): BusinessAlternativePose {
  const t = Number.isFinite(seconds) ? seconds : scene.setupAt;
  const clock = { frame: t * 30, fps: 30, beats: scene };
  const alternatives = sampleAlternatives(
    clock,
    scene.alternatives.map((alternative) => alternative.id),
  );
  const handoff = diagramPose(t, scene);
  return {
    treatment: 'M-08',
    modelOpacity: handoff.modelOpacity,
    diagramOpacity: handoff.diagramOpacity,
    modelTurn: handoff.modelTurn,
    open: businessPhases(clock).action,
    page: businessAlternativePageAt(scene, lens, t),
    facts: businessAlternativeFacts(scene, lens),
    records: lens.records.map((record, slot) => ({
      id: record.identity.id,
      alternativeId: record.alternativeId,
      subjectId: record.subjectId,
      baselineId: record.baselineId,
      position: [(slot - (lens.records.length - 1) / 2) * 1.95, -0.2, 0],
      scale: 0.63,
      area: alternatives[slot].area,
      opacity: alternatives[slot].opacity,
    })),
  };
}
