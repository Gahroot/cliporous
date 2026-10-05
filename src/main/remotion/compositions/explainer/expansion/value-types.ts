/** React-free, JSON-safe values. Domain values never use animation ...At fields. */
import type { Money } from '../finance/types';

export const EXPANSION_LIMITS = {
  actors: 8,
  records: 12,
  relations: 16,
  matrixRows: 4,
  matrixColumns: 4,
  populationMarks: 100,
  rationalComponent: 1_000_000_000,
  evidenceWords: 64,
  actorLabel: 28,
  claim: 96,
  qualifier: 96,
  period: 32,
  population: 40,
} as const;

/** Reduced, signed numerator and positive denominator, each bounded to 1e9. */
export interface ExpansionRational {
  readonly numerator: number;
  readonly denominator: number;
}

export const EXPANSION_UNITS = [
  'count',
  'ratio',
  'percent',
  'percentage-point',
  'percent-change',
  'second',
  'minute',
  'hour',
  'day',
  'millimetre',
  'centimetre',
  'metre',
  'square-metre',
  'cubic-metre',
  'gram',
  'kilogram',
  'joule',
  'kilojoule',
  'watt',
  'hertz',
  'radian',
  'degree',
  'byte',
  'item/second',
  'USD',
  'EUR',
  'GBP',
] as const;
export type ExpansionUnit = (typeof EXPANSION_UNITS)[number];

/** A reference group and period are meaning, not inferred defaults. */
export interface ExpansionBasis {
  readonly unit: ExpansionUnit;
  readonly period: string;
  readonly population: string;
  readonly denominator?: ExpansionRational;
}

export type ExpansionAmount =
  | {
      readonly kind: 'rational';
      readonly value: ExpansionRational;
      /** Parser-retained source lexeme, never a model-supplied formatting directive. */
      readonly notation?: string;
    }
  | {
      readonly kind: 'money';
      readonly value: Money;
      readonly notation?: string;
    };

export interface ExpansionEvidenceSpan {
  readonly fromWord: number;
  readonly toWord: number;
}

export interface ExpansionQuantityClaim {
  readonly actor: string;
  readonly claim: string;
  readonly basis: ExpansionBasis;
  readonly evidence: ExpansionEvidenceSpan;
}

/** Absence, dispute, simulation and an explicit condition never become measured zero. */
export type ExpansionQuantity = ExpansionQuantityClaim &
  (
    | { readonly state: 'known'; readonly amount: ExpansionAmount }
    | {
        readonly state: 'conditional';
        readonly amount: ExpansionAmount;
        readonly condition: string;
      }
    | {
        readonly state: 'simulated' | 'illustrative';
        readonly amount: ExpansionAmount;
        readonly qualifier: string;
      }
    | { readonly state: 'missing' | 'unknown'; readonly qualifier: string }
    | {
        readonly state: 'disputed';
        readonly alternatives: readonly [ExpansionAmount, ExpansionAmount];
        readonly qualifier: string;
      }
  );

/** Permitted operations are selected by authored presets, never model-supplied code. */
export const EXPANSION_DERIVATIONS = [
  'ratio',
  'subgroup-total',
  'difference',
  'percent-change',
  'unit-conversion',
  'matrix-product',
  'factorization',
  'dimensional-scaling',
  'pareto',
  'critical-path',
  'signal-sum',
] as const;
export type ExpansionDerivation = (typeof EXPANSION_DERIVATIONS)[number];

export interface ExpansionDerivedValue {
  readonly state: 'derived';
  readonly operation: ExpansionDerivation;
  readonly operands: readonly ExpansionRational[];
  readonly result: ExpansionRational;
  readonly basis: ExpansionBasis;
  readonly evidence: readonly ExpansionEvidenceSpan[];
}

export type ExpansionValueResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error: 'invalid-value' | 'overflow' | 'zero-denominator' | 'incompatible-basis';
    };
