import { isSceneFirstLongformPlan, isSceneFirstPlanEnvelope } from '@shared/longform-scenes';
import type { LongformPlanRecord } from '../store/longform-slice';

function canonical(value: unknown): string {
  return (
    JSON.stringify(value, (_key, entry: unknown) => {
      if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
        return Object.fromEntries(
          Object.keys(entry)
            .sort()
            .map((key) => [key, Reflect.get(entry, key)]),
        );
      }
      return entry;
    }) ?? 'undefined'
  );
}

/** Approval refers to one immutable snapshot, not just two equal user-controlled ID strings. */
export function longformApprovalProblem(record: LongformPlanRecord): string | null {
  if (
    !isSceneFirstLongformPlan(record.plan) ||
    (record.status !== 'accepted' && record.approvedVersionId == null)
  )
    return null;
  if (
    !record.activeVersionId ||
    !record.approvedVersionId ||
    record.activeVersionId !== record.approvedVersionId
  )
    return 'The saved approval does not identify the active plan. Review a new draft.';
  const matches =
    record.versions?.filter((version) => version.id === record.approvedVersionId) ?? [];
  const version = matches[0];
  if (
    matches.length !== 1 ||
    !version ||
    version.origin !== 'accepted' ||
    version.validationProblem ||
    !isSceneFirstPlanEnvelope(record.plan) ||
    !isSceneFirstPlanEnvelope(version.plan)
  )
    return 'The approved snapshot is missing, ambiguous or invalid. Review a new draft.';
  if (
    canonical(version.plan) !== canonical(record.plan) ||
    version.paletteId !== record.paletteId ||
    version.skin !== record.skin ||
    canonical(version.palette) !== canonical(record.palette)
  )
    return 'The current edit differs from its approved snapshot. Review a new draft before exporting.';
  return null;
}
