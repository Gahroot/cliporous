import type { TechnologyStory } from '../../technology/types';

/** Pack F: bounded qualitative actors, not population/accuracy measurements. */
export const ADAPTIVE_PRESETS = {
  'collective-pattern': ['network-clusters', 'adoption-wave', 'coordinated-swarm'],
  'robot-perception': ['recognized-target', 'uncertain-target'],
  'modular-machine': ['reconfigure', 'incompatible-module'],
} as const;

export const ADAPTIVE_LAYOUTS = ['stack', 'stack-flipped', 'takeover', 'over'] as const;
export const ADAPTIVE_LIMITS = {
  actors: 6,
  relationships: 5,
  actorLabel: 22,
  evidenceWords: 32,
} as const;

/** Inclusive source span retained for auditing; coordinates never come from the model. */
export interface AdaptiveEvidence {
  fromWord: number;
  toWord: number;
  phrase: string;
}

export interface CollectivePatternScene extends TechnologyStory {
  kind: 'collective-pattern';
  preset: (typeof ADAPTIVE_PRESETS)['collective-pattern'][number];
  /** People except coordinated-swarm, which uses recognizable wheeled robots. */
  actors: { id: string; label: string }[];
  /** Directed local interactions; at is absolute source seconds. */
  relationships: {
    fromId: string;
    toId: string;
    at: number;
    evidence: AdaptiveEvidence;
  }[];
}

export type AdaptiveObjectForm = 'parcel' | 'cone' | 'cylinder';
export interface AdaptiveObject {
  id: string;
  label: string;
  form: AdaptiveObjectForm;
}

export interface RobotPerceptionScene extends TechnologyStory {
  kind: 'robot-perception';
  preset: (typeof ADAPTIVE_PRESETS)['robot-perception'][number];
  /** subject identifies the robot; exactly two distinct source-backed objects. */
  target: AdaptiveObject;
  distractor: AdaptiveObject;
  boundaryLabel: string;
  observation: AdaptiveEvidence;
  recognition: AdaptiveEvidence;
  response: AdaptiveEvidence;
}

export type AdaptiveModuleRole = 'roller' | 'drill' | 'gripper';
export interface AdaptiveModule {
  id: string;
  label: string;
  role: AdaptiveModuleRole;
}

export interface ModularMachineScene extends TechnologyStory {
  kind: 'modular-machine';
  preset: (typeof ADAPTIVE_PRESETS)['modular-machine'][number];
  /** subject identifies the machine. Incompatible candidates never seat or activate. */
  current: AdaptiveModule;
  candidate: AdaptiveModule;
  jobLabel: string;
  arrangement: AdaptiveEvidence;
  compatibility: AdaptiveEvidence;
  operation: AdaptiveEvidence;
}

export type AdaptiveScene = CollectivePatternScene | RobotPerceptionScene | ModularMachineScene;
