import type { LongformArchetype } from '@shared/types'

/**
 * Per-archetype tuning for the long-form (16:9) Hormozi pipeline.
 *
 * Kept separate from `EditStyleTemplate` (which is keyed on the 9:16
 * `Archetype` union) so the short-form template system stays untouched.
 */
export interface LongformArchetypeTemplate {
  archetype: LongformArchetype
  /**
   * Zoom applied to speaker segments. Ignored for `concept-card` /
   * `section-header` (those are full-frame Remotion renders).
   */
  zoomStyle?: 'none' | 'drift' | 'snap' | 'word-pulse' | 'zoom-out'
  /** Zoom intensity multiplier (1.0 = no zoom). */
  zoomIntensity?: number
  /**
   * Fallback duration (seconds) for a pre-rendered card / header segment when
   * the edit plan does not pin an explicit end time.
   */
  defaultDurationSec?: number
}
