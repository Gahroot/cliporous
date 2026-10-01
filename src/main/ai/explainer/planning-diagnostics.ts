import type { PlannerPhase } from './planner-generation';

export interface PlanningEvent {
  stage:
    | 'offer'
    | 'outline'
    | 'proposal'
    | 'validation'
    | 'policy'
    | 'review'
    | 'quote'
    | 'group'
    | 'splice'
    | 'render'
    | 'quote-prop';
  action:
    | 'offered'
    | 'proposed'
    | 'accepted'
    | 'removed'
    | 'repaired'
    | 'rejected'
    | 'retained'
    | 'fallback'
    | 'empty'
    | 'rendered';
  /** Authored reason codes only; never transcript, labels, raw JSON or model commentary. */
  reason: string;
  phase?: PlannerPhase;
  kind?: string;
  prop?: string;
  index?: number;
  count?: number;
}
export type PlanningObserver = (event: Readonly<PlanningEvent>) => void;
export interface PlanningDiagnostics {
  readonly events: PlanningEvent[];
  emit: PlanningObserver;
  dropped(): number;
}
export function createPlanningDiagnostics(observer?: PlanningObserver): PlanningDiagnostics {
  const events: PlanningEvent[] = [];
  let dropped = 0;
  return {
    events,
    emit(event) {
      if (events.length >= 512) {
        dropped++;
        return;
      }
      // Explicit allowlist avoids persisting accidental extra properties from callers.
      const safe: PlanningEvent = {
        stage: event.stage,
        action: event.action,
        reason: event.reason,
        ...(event.phase ? { phase: event.phase } : {}),
        ...(event.kind ? { kind: event.kind } : {}),
        ...(event.prop ? { prop: event.prop } : {}),
        ...(event.index !== undefined ? { index: event.index } : {}),
        ...(event.count !== undefined ? { count: event.count } : {}),
      };
      events.push(safe);
      observer?.(Object.freeze({ ...safe }));
    },
    dropped: () => dropped,
  };
}
