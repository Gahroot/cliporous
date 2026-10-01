import type { TechnologyStory } from '../technology/types';

/** Authored miniatures only. No model-provided coordinates, meshes or asset paths. */
export const SPATIAL_PRESETS = {
  'house-cutaway': ['rooms', 'utilities'],
  'house-build': ['construct', 'plan-mismatch'],
  'house-renovation': ['cosmetic', 'structural'],
  'property-access': ['scoped-key', 'revoked-key'],
  neighborhood: ['replicate', 'context'],
  'floorplan-fit': ['fits', 'rearrange'],
  'house-options': ['compare', 'tradeoff'],
  'property-lifecycle': ['occupancy', 'maintenance', 'cash-flow'],
} as const;

export const SPATIAL_KINDS = [
  'house-cutaway',
  'house-build',
  'house-renovation',
  'property-access',
  'neighborhood',
  'floorplan-fit',
  'house-options',
  'property-lifecycle',
] as const satisfies readonly (keyof typeof SPATIAL_PRESETS)[];

export interface HouseCutawayScene extends TechnologyStory {
  kind: 'house-cutaway';
  preset: (typeof SPATIAL_PRESETS)['house-cutaway'][number];
  /** Two or three source-backed room/system names. */
  parts: string[];
}

export interface HouseBuildScene extends TechnologyStory {
  kind: 'house-build';
  preset: (typeof SPATIAL_PRESETS)['house-build'][number];
  planLabel: string;
}

export interface HouseRenovationScene extends TechnologyStory {
  kind: 'house-renovation';
  preset: (typeof SPATIAL_PRESETS)['house-renovation'][number];
  partLabel: string;
}

export interface PropertyAccessScene extends TechnologyStory {
  kind: 'property-access';
  preset: (typeof SPATIAL_PRESETS)['property-access'][number];
  allowedLabel: string;
  restrictedLabel: string;
}

export interface NeighborhoodScene extends TechnologyStory {
  kind: 'neighborhood';
  preset: (typeof SPATIAL_PRESETS)['neighborhood'][number];
  /** Exactly two source-backed context/template labels; copies are illustrative. */
  contextLabels: string[];
}

export interface FloorplanFitScene extends TechnologyStory {
  kind: 'floorplan-fit';
  preset: (typeof SPATIAL_PRESETS)['floorplan-fit'][number];
  /** Two or three source-backed items; authored furniture, never arbitrary geometry. */
  items: string[];
}

export interface HouseOptionsScene extends TechnologyStory {
  kind: 'house-options';
  preset: (typeof SPATIAL_PRESETS)['house-options'][number];
  /** Exactly two alternatives; neither is automatically a winner. */
  options: string[];
}

export interface PropertyLifecycleScene extends TechnologyStory {
  kind: 'property-lifecycle';
  preset: (typeof SPATIAL_PRESETS)['property-lifecycle'][number];
  /** Two or three stages; cash-flow requires exactly [income, expense], not net profit. */
  stageLabels: string[];
}

export type SpatialScene =
  | HouseCutawayScene
  | HouseBuildScene
  | HouseRenovationScene
  | PropertyAccessScene
  | NeighborhoodScene
  | FloorplanFitScene
  | HouseOptionsScene
  | PropertyLifecycleScene;
