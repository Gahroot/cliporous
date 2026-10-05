/** Step14 stories55–56. Mathematical data only: no renderer coordinates or expression language. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type {
  ExpansionBasis,
  ExpansionEvidenceSpan,
  ExpansionQuantity,
  ExpansionRational,
} from '../value-types';

export type ExpansionVectorAxis = 'x' | 'y' | 'z';
export type ExpansionComponentDirection =
  | 'positive'
  | 'negative'
  | 'zero'
  | 'unknown'
  | 'missing'
  | 'disputed';
export interface ExpansionVectorComponent {
  readonly id: string;
  readonly axis: ExpansionVectorAxis;
  readonly direction: ExpansionComponentDirection;
  readonly quantity: ExpansionQuantity;
}
export interface ExpansionSuppliedVector {
  readonly id: string;
  readonly entityId: string;
  readonly components: readonly ExpansionVectorComponent[];
}
export interface ExpansionVectorBasisScene extends ExpansionStoryBase {
  storyId: '55';
  kind: 'linear-algebra';
  preset: 'vector-basis';
  template: 'planar-components' | 'spatial-components';
  entities: readonly ExpansionEntity[];
  actorId: string;
  /** Source frame is domain data, never a camera transform or rotation. */
  frame: string;
  scope: string;
  period: string;
  axes: readonly ExpansionVectorAxis[];
  vector: ExpansionSuppliedVector;
  basis: readonly ExpansionSuppliedVector[];
  correspondence: {
    readonly actorId: string;
    readonly frame: string;
    readonly vectorId: string;
    readonly basisIds: readonly string[];
    readonly evidence: ExpansionEvidenceSpan;
  };
  result: {
    readonly state: 'supplied';
    readonly actorId: string;
    readonly claim: 'component display';
    readonly evidence: ExpansionEvidenceSpan;
  };
}

export const EXPANSION_FACTORIZATION_OPERATIONS = ['factorization'] as const;
export type ExpansionFactorizationRole =
  | 'linear coefficient'
  | 'constant term'
  | 'common factor'
  | 'inner coefficient'
  | 'inner constant'
  | 'first base'
  | 'second base'
  | 'square coefficient';
export interface ExpansionFactorizationOperand {
  readonly id: string;
  readonly role: ExpansionFactorizationRole;
  readonly quantity: ExpansionQuantity;
}
export type ExpansionAuthoredFactors =
  | {
      readonly template: 'common-factor';
      readonly outerFactor: ExpansionRational;
      readonly linear: {
        readonly coefficient: ExpansionRational;
        readonly constant: ExpansionRational;
      };
    }
  | {
      readonly template: 'integer-difference-of-squares';
      readonly left: {
        readonly coefficient: ExpansionRational;
        readonly constant: ExpansionRational;
      };
      readonly right: {
        readonly coefficient: ExpansionRational;
        readonly constant: ExpansionRational;
      };
    };
export type ExpansionFactorizationResult =
  | {
      readonly state: 'derived';
      readonly operation: 'factorization';
      readonly sourceState: 'known' | 'conditional' | 'simulated' | 'illustrative';
      readonly qualifier?: string;
      readonly condition?: string;
      readonly identity: 'verified';
      readonly operandIds: readonly string[];
      readonly operands: readonly ExpansionRational[];
      readonly basis: ExpansionBasis;
      readonly evidence: readonly ExpansionEvidenceSpan[];
      readonly factors: ExpansionAuthoredFactors;
    }
  | {
      readonly state: 'unknown' | 'missing' | 'disputed';
      readonly qualifier: string;
      readonly operandIds: readonly string[];
      readonly evidence: readonly ExpansionEvidenceSpan[];
    };
export interface ExpansionFactorizationScene extends ExpansionStoryBase {
  storyId: '56';
  kind: 'equation';
  preset: 'factorization';
  template: 'common-factor' | 'integer-difference-of-squares';
  entities: readonly ExpansionEntity[];
  actorId: string;
  scope: string;
  period: string;
  symbol: 'x' | 'y' | 'z';
  operands: readonly ExpansionFactorizationOperand[];
  request: {
    readonly actorId: string;
    readonly operation: 'factorization';
    readonly evidence: ExpansionEvidenceSpan;
  };
  result: ExpansionFactorizationResult;
}
/** Frozen local union; parent owns aggregate/spec/registry integration. */
export type ExpansionVectorFactorizationScene =
  | ExpansionVectorBasisScene
  | ExpansionFactorizationScene;
