import {
  type BusinessClock,
  businessPhases,
  type HandshakeState,
  type NamedMotion,
  sampleHandshake,
  sampleScaleLens,
  sampleTaskSplit,
} from '../motion';
import type { BusinessIdentity } from '../types';
import type { CommercialScene, CommercialServiceStage, CommercialStageState } from './types';

export interface CommercialStagePose {
  state: CommercialStageState;
  approach: number;
  accepted: number;
}

export interface CommercialPose {
  setup: number;
  inspection: number;
  response: number;
  documents: readonly NamedMotion[];
  booking: CommercialStagePose | null;
  delivery: CommercialStagePose | null;
  localUnits: readonly NamedMotion[];
  localLens: number;
  dependencyRemoval: number;
}
function state(value: CommercialStageState): HandshakeState {
  return value === 'observed' ? 'approved' : value === 'negative' ? 'denied' : 'pending';
}
function stagePose(clock: BusinessClock, stage: CommercialServiceStage): CommercialStagePose {
  // Approval is only the motion helper's internal gate, not a renamed source fact.
  return { ...sampleHandshake(clock, state(stage.state)), state: stage.state };
}
export function commercialIdentities(scene: CommercialScene): BusinessIdentity[] {
  let entries: BusinessIdentity[];
  if (scene.kind === 'business-replication')
    entries = [scene.business, scene.standard, ...scene.units.map((unit) => unit.identity)];
  else if (scene.preset === 'back-office')
    entries = [scene.business, scene.service, ...scene.tasks.map((entry) => entry.task)];
  else if (scene.preset === 'service-slots') entries = [scene.business, scene.service];
  else if (scene.preset === 'service-lifecycle')
    entries = [
      scene.business,
      scene.service,
      scene.lead.identity,
      scene.booking.identity,
      scene.delivery.identity,
    ];
  else if (scene.preset === 'owner-dependency')
    entries = [scene.business, scene.founder, scene.task];
  else entries = [scene.business, scene.service, ...scene.modules];
  return entries.filter(
    (entry, index) => entries.findIndex((other) => other.id === entry.id) === index,
  );
}
/** Inspection is an authored explanation, not an assertion that operations or growth succeeded. */
export function sampleCommercial(scene: CommercialScene, seconds: number): CommercialPose {
  const clock: BusinessClock = { frame: seconds * 30, fps: 30, beats: scene };
  const phases = businessPhases(clock);
  const documents =
    scene.kind === 'business-blueprint'
      ? scene.preset === 'back-office'
        ? scene.tasks.map((entry) => entry.task.id)
        : scene.preset === 'service-modules'
          ? scene.modules.map((entry) => entry.id)
          : scene.preset === 'owner-dependency'
            ? [scene.task.id]
            : []
      : [];
  const lens = sampleScaleLens(
    clock,
    scene.kind === 'business-replication' ? scene.units.map((entry) => entry.identity.id) : [],
  );
  return {
    setup: phases.setup,
    inspection: phases.action,
    response: phases.response,
    documents: sampleTaskSplit(clock, documents),
    booking:
      scene.kind === 'business-blueprint' && scene.preset === 'service-lifecycle'
        ? stagePose(clock, scene.booking)
        : null,
    delivery:
      scene.kind === 'business-blueprint' && scene.preset === 'service-lifecycle'
        ? stagePose(clock, scene.delivery)
        : null,
    localUnits: lens.units,
    localLens: scene.kind === 'business-replication' ? lens.lens : 0,
    dependencyRemoval:
      scene.kind === 'business-blueprint' &&
      scene.preset === 'owner-dependency' &&
      scene.dependency.state === 'removed'
        ? phases.response
        : 0,
  };
}
