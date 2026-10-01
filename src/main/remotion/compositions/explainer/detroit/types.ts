import type { DiagramStory } from '../diagrams/types';

/** Spirit is deliberately absent until a recorded rights basis covers asset and output use. */
export const DETROIT_LANDMARK_IDS = [
  'renaissance-center',
  'michigan-central',
  'fox-theatre',
  'guardian-building',
  'penobscot-building',
  'ambassador-bridge',
  'eastern-market',
] as const;
export type DetroitLandmarkId = (typeof DETROIT_LANDMARK_IDS)[number];
export const DETROIT_PRESETS = ['landmark-focus', 'city-portrait', 'market-block'] as const;
export interface DetroitPlaceScene extends DiagramStory {
  kind: 'detroit-place';
  preset: (typeof DETROIT_PRESETS)[number];
  landmarks: DetroitLandmarkId[];
}
export interface LandmarkDefinition {
  id: DetroitLandmarkId;
  label: string;
  aliases: readonly string[];
  recognition: readonly string[];
  meshCeiling: number;
  provenance: 'authored-architectural-massing';
}
