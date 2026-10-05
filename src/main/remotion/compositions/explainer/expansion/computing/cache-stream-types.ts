/** Source-only computing facts; no TTL, rates, ordering or version derivations. */
import type { ExpansionEntity, ExpansionStoryBase } from '../scene-types';
import type { ExpansionEvidenceSpan } from '../value-types';

export type CacheStreamState =
  | { readonly state: 'known'; readonly value: string }
  | { readonly state: 'conditional'; readonly value: string; readonly condition: string }
  | {
      readonly state: 'simulated' | 'illustrative';
      readonly value: string;
      readonly qualifier: string;
    }
  | { readonly state: 'unknown' | 'missing' | 'disputed'; readonly qualifier: string };
export interface CacheStreamFact {
  readonly id: string;
  readonly actorId: string;
  readonly targetIds: readonly string[];
  readonly role:
    | 'version'
    | 'freshness'
    | 'cache-action'
    | 'grouping'
    | 'arrival'
    | 'processing'
    | 'result';
  readonly scope: string;
  readonly period: string;
  readonly evidence: ExpansionEvidenceSpan;
  readonly qualification: CacheStreamState;
}
export interface CacheStreamBeatEvidence {
  readonly setup: ExpansionEvidenceSpan;
  readonly action: ExpansionEvidenceSpan;
  readonly response: ExpansionEvidenceSpan;
  readonly check: ExpansionEvidenceSpan;
  readonly resolve: ExpansionEvidenceSpan;
}
interface CacheStreamBase extends ExpansionStoryBase {
  readonly entities: readonly ExpansionEntity[];
  readonly records: readonly CacheStreamFact[];
  readonly relations: readonly CacheStreamFact[];
  readonly scope: string;
  readonly period: string;
  readonly sourceSpans: CacheStreamBeatEvidence;
}
export interface ExpansionCacheFreshnessScene extends CacheStreamBase {
  kind: 'request-routing';
  preset: 'cache-freshness';
  storyId: '65';
  template: 'cache-board';
}
export interface ExpansionBatchStreamScene extends CacheStreamBase {
  kind: 'computing-flow';
  preset: 'batch-stream';
  storyId: '66';
  template: 'input-buffer';
}
export type ExpansionCacheStreamScene = ExpansionCacheFreshnessScene | ExpansionBatchStreamScene;
