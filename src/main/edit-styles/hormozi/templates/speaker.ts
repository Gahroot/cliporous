import type { LongformArchetypeTemplate } from './types'

/**
 * speaker — full-frame 16:9 talking head with a subtle Hormozi punch-in.
 * Rendered through the segmented FFmpeg path (face-centered landscape crop).
 */
export const speaker: LongformArchetypeTemplate = {
  archetype: 'speaker',
  zoomStyle: 'snap',
  zoomIntensity: 1.12
}
