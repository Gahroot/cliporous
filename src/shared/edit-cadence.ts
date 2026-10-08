export const EDIT_CADENCES = ['selective', 'balanced', 'continuous'] as const;
export type EditCadence = (typeof EDIT_CADENCES)[number];
export const DEFAULT_EDIT_CADENCE: EditCadence = 'selective';

export function isEditCadence(value: unknown): value is EditCadence {
  return value === 'selective' || value === 'balanced' || value === 'continuous';
}

/** Only missing values are compatible defaults; validate present values at boundaries. */
export function resolveEditCadence(value: EditCadence | undefined): EditCadence {
  return value ?? DEFAULT_EDIT_CADENCE;
}

/** Additive direction, never a quota or permission to invent evidence. */
export function editCadenceGuidance(value: EditCadence | undefined): string {
  const cadence = resolveEditCadence(value);
  if (cadence === 'selective') return '';
  return `Long-form edit cadence: ${cadence}. ${
    cadence === 'balanced'
      ? 'Seek more useful explanation opportunities and prefer speaker-side layouts.'
      : 'Prefer sustained multi-beat storyboards and speaker-visible explanations; use short source-backed phrase reveals in remaining speaker stretches.'
  } Use existing internal reveals, holds and scene-canvas development, not indiscriminate cuts. No forced diagrams for personal or emotional passages or unsupported claims. Silence remains silence. Preserve complete story windows and final reading holds; captions do not count as edits. These are opportunities, not quotas.`;
}

export const EDIT_CADENCE_PRESETS = Object.freeze({
  selective: Object.freeze({
    openingGap: 8,
    bodyGap: 14,
    shortBoards: 1,
    coverage: 0.3,
    separation: 10,
  }),
  balanced: Object.freeze({
    openingGap: 5,
    bodyGap: 8,
    shortBoards: 2,
    coverage: 0.45,
    separation: 6,
  }),
  continuous: Object.freeze({
    openingGap: 3,
    bodyGap: 4,
    shortBoards: 3,
    coverage: 0.6,
    separation: 3,
  }),
});
