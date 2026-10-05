/** Source-only facts. UI shapes and retry outcomes are never derived. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan, ExpansionQuantity } from '../value-types';
// Authored neutral shapes verified against kits/product.tsx; no TSX dependency.

export type RetryProductState =
  | 'stated'
  | 'unknown'
  | 'missing'
  | 'disputed'
  | 'conditional'
  | 'simulated'
  | 'illustrative';
export type RetryProductRole =
  | 'request'
  | 'attempt'
  | 'effect'
  | 'condition'
  | 'result'
  | 'form'
  | 'field'
  | 'action';
export interface RetryProductRecord {
  readonly id: string;
  readonly actorId: string;
  readonly identityId: string;
  readonly role: RetryProductRole;
  readonly claim: string;
  readonly value: string;
  readonly state: RetryProductState;
  readonly scope: string;
  readonly period: string;
  readonly condition?: string;
  readonly qualifier?: string;
  readonly shape?: 'form' | 'table' | 'result' | 'task';
  readonly evidence: ExpansionEvidenceSpan;
}
export interface RetryProductRelation {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly role: 'provenance';
  readonly evidence: ExpansionEvidenceSpan;
}
interface RetryProductBase extends ExpansionStoryBase {
  readonly entities: readonly ExpansionEntity[];
  readonly records: readonly RetryProductRecord[];
  readonly relations: readonly RetryProductRelation[];
  readonly quantities: readonly ExpansionQuantity[];
  readonly sourceSpans: Readonly<
    Record<'setup' | 'action' | 'response' | 'check' | 'resolve', ExpansionEvidenceSpan>
  >;
}
export type ExpansionRetryProductScene = RetryProductBase &
  (
    | {
        readonly storyId: '67';
        readonly kind: 'agent-workflow';
        readonly preset: 'idempotent-retry';
        readonly template: 'request-attempts';
      }
    | {
        readonly storyId: '68';
        readonly kind: 'product-walkthrough';
        readonly preset: 'form-result';
        readonly template: 'neutral-form';
      }
  );
