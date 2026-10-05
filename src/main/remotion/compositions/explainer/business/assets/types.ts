import type { BusinessAssetId, BusinessRecipeId } from '../types';

export interface BusinessAssetRecord {
  id: BusinessAssetId;
  name: string;
  authoredMeshCeiling: number;
  bounds: { min: readonly [number, number, number]; max: readonly [number, number, number] };
  allowedRecipes: readonly BusinessRecipeId[];
  sourceDependencies: readonly string[];
  provenance: 'project-authored';
  standaloneHero: false;
}

/** Internal validated-fact output, not a saved DTO or a model-selectable graphics API. */
export type BusinessAssembly =
  | { asset: 'A-01'; open: number }
  | { asset: 'A-02'; occupied: boolean }
  | { asset: 'A-03'; open: number }
  | { asset: 'A-04'; pending: boolean }
  | { asset: 'A-05'; state: 'allowed' | 'denied' | 'unknown'; focus: number }
  | { asset: 'A-06'; accepted: number }
  | { asset: 'A-07'; open: number; revision: 0 | 1 }
  | { asset: 'A-08'; pending: boolean }
  | { asset: 'A-09'; open: number; contributed: boolean }
  | { asset: 'A-10'; fills: readonly [number, number, number, number] }
  | { asset: 'A-11'; focus: 0 | 1 | 2 }
  | { asset: 'A-12'; separation: number }
  | { asset: 'A-13'; activity: number }
  | { asset: 'A-14'; ready: boolean }
  | { asset: 'A-15'; active: boolean }
  | { asset: 'A-16'; connected: boolean; progress: number };

export interface BusinessAssemblyInstance {
  /** Must already be source-validated by the owning explanation contract. */
  identityId: string;
  assembly: BusinessAssembly;
}
