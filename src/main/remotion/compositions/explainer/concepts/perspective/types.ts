import type { TechnologyStory } from '../../technology/types';

/** Pack E is illustrative, never telemetry, probability geometry or measured scale. */
export const PERSPECTIVE_PRESETS = {
  'scale-hierarchy': ['chip-to-center', 'customer-to-market'],
  'possible-futures': ['branching-scenarios', 'forecast-range'],
  'digital-twin': ['mirror-state', 'simulated-change'],
} as const;

export const PERSPECTIVE_LAYOUTS = ['stack', 'stack-flipped', 'takeover', 'over'] as const;
export const PERSPECTIVE_LIMITS = {
  actorLabel: 22,
  qualifier: 40,
  levels: 3,
  alternatives: 3,
} as const;

export interface PerspectiveActor {
  /** Deterministic ordered ID, generated at the parser boundary. */
  id: string;
  label: string;
}

export interface ScaleHierarchyScene extends TechnologyStory {
  kind: 'scale-hierarchy';
  preset: (typeof PERSPECTIVE_PRESETS)['scale-hierarchy'][number];
  /** The chip/customer never becomes a different actor during the reveal. */
  trackedId: 'tracked-subject';
  /** chip: server → rack → data center; customer: segment → market. */
  levels: PerspectiveActor[];
}

export type FutureChange = 'steady' | 'reduced' | 'expanded';
export interface PerspectiveAlternative extends PerspectiveActor {
  /** Qualitative production/capacity state, not an amount or likelihood. */
  change: FutureChange;
  /** Exact local source possibility phrase; always shown with the alternative. */
  qualifier: string;
}

export interface PossibleFuturesScene extends TechnologyStory {
  kind: 'possible-futures';
  preset: (typeof PERSPECTIVE_PRESETS)['possible-futures'][number];
  /** Two or three equally weighted possibilities; range has exactly two endpoints. */
  alternatives: PerspectiveAlternative[];
  /** Exact source phrase explicitly retaining uncertainty/no selected winner. */
  uncertainty: string;
}

export interface DigitalTwinScene extends TechnologyStory {
  kind: 'digital-twin';
  preset: (typeof PERSPECTIVE_PRESETS)['digital-twin'][number];
  physical: PerspectiveActor;
  model: PerspectiveActor;
  /** This authored twin models a recognizable conveyor's safety gate. */
  partLabel: string;
  physicalState: 'open' | 'closed';
  /** Only simulated-change has a different model state. Physical state never mutates. */
  simulatedState?: 'open' | 'closed';
  /** Exact source qualifier: illustrative mirror / simulated, not observed. */
  qualifier: string;
}

export type PerspectiveScene = ScaleHierarchyScene | PossibleFuturesScene | DigitalTwinScene;
