/** Authored identities only: no coordinates, numeric geometry or computed measures. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';

export const EXPANSION_SECTION_PARTS = {
  box: ['core', 'insert'],
  cylinder: ['shaft', 'core'],
  gadget: ['board', 'cell', 'drive', 'port'],
  house: ['partition', 'beam', 'valve'],
} as const;
export type ExpansionSectionTemplate = keyof typeof EXPANSION_SECTION_PARTS;
export type ExpansionInteriorPart =
  (typeof EXPANSION_SECTION_PARTS)[ExpansionSectionTemplate][number];
/** Matches the existing authored cube cross-net identities; not model-defined face names. */
export const EXPANSION_UNFOLD_FACES = ['front', 'right', 'left', 'top', 'bottom', 'back'] as const;
export type ExpansionUnfoldFace = (typeof EXPANSION_UNFOLD_FACES)[number];
export type ExpansionGeometryState<T extends string> =
  | { readonly state: 'known'; readonly value: T }
  | { readonly state: 'conditional'; readonly value: T; readonly condition: string }
  | { readonly state: 'simulated' | 'illustrative'; readonly value: T; readonly qualifier: string }
  | { readonly state: 'unknown' | 'missing'; readonly qualifier: string }
  | {
      readonly state: 'disputed';
      readonly alternatives: readonly [T, T];
      readonly qualifier: string;
    };
export type ExpansionGeometryFact<T extends string> = ExpansionGeometryState<T> & {
  readonly id: string;
  readonly actorId: string;
  readonly identity: string;
  readonly claim: string;
  readonly scope: string;
  readonly period: string;
  readonly evidence: ExpansionEvidenceSpan;
};
interface GeometryBase extends ExpansionStoryBase {
  readonly actors: readonly ExpansionEntity[];
  readonly identity: string;
  readonly scope: string;
  readonly period: string;
  /** A quoted measurement, never dimensions assigned to an authored schematic model. */
  readonly measurement: ExpansionQuantity;
}
export type ExpansionSectionPart = ExpansionGeometryFact<'hidden' | 'visible' | 'absent'> & {
  readonly part: ExpansionInteriorPart;
};
export interface ExpansionSectionScanScene extends GeometryBase {
  storyId: '57';
  kind: 'section-view';
  preset: 'scan';
  readonly template: ExpansionSectionTemplate;
  readonly parts: readonly ExpansionSectionPart[];
  readonly section: ExpansionGeometryFact<'intersects' | 'misses'> & { readonly partId: string };
  readonly result: ExpansionGeometryFact<'revealed' | 'not-revealed' | 'unresolved'> & {
    readonly partId: string;
  };
}
export interface ExpansionSolidUnfoldScene extends GeometryBase {
  storyId: '58';
  kind: 'geometry-projection';
  preset: 'unfold';
  readonly template: 'cube';
  readonly net: 'cube-cross';
  readonly faces: readonly {
    readonly id: string;
    readonly face: ExpansionUnfoldFace;
    readonly evidence: ExpansionEvidenceSpan;
  }[];
  readonly unfolding: ExpansionGeometryFact<'cube-cross'>;
  readonly correspondence: ExpansionGeometryFact<'matched' | 'unresolved'>;
  /** Supplied bijection only. Unresolved correspondence has no invented links. */
  readonly links: readonly {
    readonly id: string;
    readonly fromId: string;
    readonly toId: string;
    readonly role: 'correspondence';
    readonly evidence: ExpansionEvidenceSpan;
  }[];
  readonly result: ExpansionGeometryFact<'unfolded' | 'unresolved'>;
}
export type ExpansionSectionUnfoldScene = ExpansionSectionScanScene | ExpansionSolidUnfoldScene;
