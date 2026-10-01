export type PlannerProfileId =
  | 'baseline-policy-codex-v1'
  | 'content-led-codex-v1'
  | 'semantic-variety-codex-v1'
  | 'longform-scene-first-v1';
export interface PlannerProfile {
  readonly id: PlannerProfileId;
  readonly policy: 'baseline' | 'content-led';
  readonly outline: boolean;
  readonly history: boolean;
  readonly optionalQuotes: boolean;
  readonly acceptEmptyReview: boolean;
}
export const EVALUATION_PROFILES: readonly PlannerProfile[] = Object.freeze([
  Object.freeze({
    id: 'baseline-policy-codex-v1',
    policy: 'baseline',
    outline: false,
    history: false,
    optionalQuotes: false,
    acceptEmptyReview: false,
  } as const),
  Object.freeze({
    id: 'content-led-codex-v1',
    policy: 'content-led',
    outline: false,
    history: false,
    optionalQuotes: true,
    acceptEmptyReview: true,
  } as const),
  Object.freeze({
    id: 'semantic-variety-codex-v1',
    policy: 'content-led',
    outline: true,
    history: true,
    optionalQuotes: true,
    acceptEmptyReview: true,
  } as const),
]);
/** Explicit opt-in; not part of the short-form experiment or its default policy. */
export const LONGFORM_PLANNER_PROFILE = 'longform-scene-first-v1' as const;
const LONGFORM_PROFILE: PlannerProfile = Object.freeze({
  id: LONGFORM_PLANNER_PROFILE,
  policy: 'content-led',
  outline: false,
  history: true,
  optionalQuotes: false,
  acceptEmptyReview: true,
});
/** Provider-independent short-form policy, verified by offline/render controls. Gemini stays the provider. */
export const PRODUCTION_PLANNER_PROFILE: PlannerProfileId = 'content-led-codex-v1';
/** No measured Codex winner; the CLI still schedules the full comparison set. */
export const EVALUATION_DEFAULT_PROFILE: PlannerProfileId | null = null;
export function getPlannerProfile(id: string): PlannerProfile | undefined {
  return id === LONGFORM_PLANNER_PROFILE
    ? LONGFORM_PROFILE
    : EVALUATION_PROFILES.find((profile) => profile.id === id);
}
