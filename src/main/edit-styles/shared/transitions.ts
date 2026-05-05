/**
 * Transition matrix templates shared across edit styles.
 *
 * Low/medium-energy styles cover the 3x3 grid of
 * {main-video, main-video-text, fullscreen-text}; high-energy styles add
 * the fullscreen-image rows/columns.
 */

import type { TMap } from './types'

// All hard-cut except a soft return out of fullscreen-text. (Ember, Lumen.)
export const T_HARD_SOFT_RETURN: TMap = {
  'main-video→main-video': 'hard-cut',
  'main-video→main-video-text': 'hard-cut',
  'main-video→fullscreen-text': 'hard-cut',
  'main-video-text→main-video': 'hard-cut',
  'main-video-text→main-video-text': 'hard-cut',
  'main-video-text→fullscreen-text': 'hard-cut',
  'fullscreen-text→main-video': 'crossfade',
  'fullscreen-text→main-video-text': 'crossfade',
  'fullscreen-text→fullscreen-text': 'hard-cut'
}

// Crossfade baseline, hard-cut same-category, no color-wash. (Clarity.)
export const T_CROSSFADE_NO_WASH: TMap = {
  'main-video→main-video': 'hard-cut',
  'main-video→main-video-text': 'crossfade',
  'main-video→fullscreen-text': 'crossfade',
  'main-video-text→main-video': 'crossfade',
  'main-video-text→main-video-text': 'hard-cut',
  'main-video-text→fullscreen-text': 'crossfade',
  'fullscreen-text→main-video': 'crossfade',
  'fullscreen-text→main-video-text': 'crossfade',
  'fullscreen-text→fullscreen-text': 'hard-cut'
}

// Crossfade baseline, color-wash entering fullscreen-text. (Film, Elevate.)
export const T_CROSSFADE_WASH_INTO_FT: TMap = {
  'main-video→main-video': 'crossfade',
  'main-video→main-video-text': 'crossfade',
  'main-video→fullscreen-text': 'color-wash',
  'main-video-text→main-video': 'crossfade',
  'main-video-text→main-video-text': 'hard-cut',
  'main-video-text→fullscreen-text': 'color-wash',
  'fullscreen-text→main-video': 'crossfade',
  'fullscreen-text→main-video-text': 'crossfade',
  'fullscreen-text→fullscreen-text': 'hard-cut'
}

// Hard-cut same-category, flash-cut cross-category, color-wash into
// fullscreen-text. (Align, Growth, Impact.)
export const T_FLASH_CROSS_WASH_FT: TMap = {
  'main-video→main-video': 'hard-cut',
  'main-video→main-video-text': 'flash-cut',
  'main-video→fullscreen-text': 'color-wash',
  'main-video-text→main-video': 'flash-cut',
  'main-video-text→main-video-text': 'hard-cut',
  'main-video-text→fullscreen-text': 'color-wash',
  'fullscreen-text→main-video': 'flash-cut',
  'fullscreen-text→main-video-text': 'flash-cut',
  'fullscreen-text→fullscreen-text': 'hard-cut'
}

// All hard-cut except flash-cut entering fullscreen-text. (Recess.)
export const T_HARD_FLASH_INTO_FT: TMap = {
  'main-video→main-video': 'hard-cut',
  'main-video→main-video-text': 'hard-cut',
  'main-video→fullscreen-text': 'flash-cut',
  'main-video-text→main-video': 'hard-cut',
  'main-video-text→main-video-text': 'hard-cut',
  'main-video-text→fullscreen-text': 'flash-cut',
  'fullscreen-text→main-video': 'hard-cut',
  'fullscreen-text→main-video-text': 'hard-cut',
  'fullscreen-text→fullscreen-text': 'hard-cut'
}

// Color-wash everywhere except hard-cut same-cat & soft return from FT. (Cinematic.)
export const T_WASH_HEAVY: TMap = {
  'main-video→main-video': 'hard-cut',
  'main-video→main-video-text': 'color-wash',
  'main-video→fullscreen-text': 'color-wash',
  'main-video-text→main-video': 'color-wash',
  'main-video-text→main-video-text': 'hard-cut',
  'main-video-text→fullscreen-text': 'color-wash',
  'fullscreen-text→main-video': 'crossfade',
  'fullscreen-text→main-video-text': 'crossfade',
  'fullscreen-text→fullscreen-text': 'hard-cut'
}

// High-energy crossfade baseline with flash-cut return from fullscreen. (Paper II.)
export const T_HE_CROSSFADE_FLASH_RETURN: TMap = {
  'main-video→main-video': 'hard-cut',
  'main-video→main-video-text': 'crossfade',
  'main-video→fullscreen-text': 'crossfade',
  'main-video→fullscreen-image': 'crossfade',
  'main-video-text→main-video': 'crossfade',
  'main-video-text→main-video-text': 'hard-cut',
  'main-video-text→fullscreen-text': 'crossfade',
  'main-video-text→fullscreen-image': 'crossfade',
  'fullscreen-text→main-video': 'flash-cut',
  'fullscreen-text→main-video-text': 'flash-cut',
  'fullscreen-text→fullscreen-image': 'crossfade',
  'fullscreen-image→main-video': 'flash-cut',
  'fullscreen-image→main-video-text': 'flash-cut',
  'fullscreen-image→fullscreen-text': 'crossfade'
}

// High-energy: flash-cut cross-cat to text-augmented; crossfade into fullscreen. (Rebel, Pulse.)
export const T_HE_FLASH_CROSS_CROSSFADE_FS: TMap = {
  'main-video→main-video': 'hard-cut',
  'main-video→main-video-text': 'flash-cut',
  'main-video→fullscreen-text': 'crossfade',
  'main-video→fullscreen-image': 'crossfade',
  'main-video-text→main-video': 'flash-cut',
  'main-video-text→main-video-text': 'hard-cut',
  'main-video-text→fullscreen-text': 'crossfade',
  'main-video-text→fullscreen-image': 'crossfade',
  'fullscreen-text→main-video': 'flash-cut',
  'fullscreen-text→main-video-text': 'flash-cut',
  'fullscreen-text→fullscreen-image': 'crossfade',
  'fullscreen-image→main-video': 'flash-cut',
  'fullscreen-image→main-video-text': 'flash-cut',
  'fullscreen-image→fullscreen-text': 'crossfade'
}

// Prime: crossfade base, color-wash into fullscreen-text, flash-cut return.
export const T_PRIME: TMap = {
  'main-video→main-video': 'hard-cut',
  'main-video→main-video-text': 'crossfade',
  'main-video→fullscreen-text': 'color-wash',
  'main-video→fullscreen-image': 'crossfade',
  'main-video-text→main-video': 'crossfade',
  'main-video-text→main-video-text': 'hard-cut',
  'main-video-text→fullscreen-text': 'color-wash',
  'main-video-text→fullscreen-image': 'crossfade',
  'fullscreen-text→main-video': 'flash-cut',
  'fullscreen-text→main-video-text': 'flash-cut',
  'fullscreen-text→fullscreen-image': 'crossfade',
  'fullscreen-image→main-video': 'flash-cut',
  'fullscreen-image→main-video-text': 'flash-cut',
  'fullscreen-image→fullscreen-text': 'color-wash'
}

// PRESTYJ: crossfade baseline, hard-cut same-cat, crossfade into fullscreen. Clean & modern.
export const T_PRESTYJ: TMap = {
  'main-video→main-video': 'hard-cut',
  'main-video→main-video-text': 'crossfade',
  'main-video→fullscreen-text': 'crossfade',
  'main-video→fullscreen-image': 'crossfade',
  'main-video-text→main-video': 'crossfade',
  'main-video-text→main-video-text': 'hard-cut',
  'main-video-text→fullscreen-text': 'crossfade',
  'main-video-text→fullscreen-image': 'crossfade',
  'fullscreen-text→main-video': 'crossfade',
  'fullscreen-text→main-video-text': 'crossfade',
  'fullscreen-text→fullscreen-image': 'crossfade',
  'fullscreen-image→main-video': 'crossfade',
  'fullscreen-image→main-video-text': 'crossfade',
  'fullscreen-image→fullscreen-text': 'crossfade'
}

// Volt: flash-cut everywhere except hard-cut same-cat & crossfade between fullscreens.
export const T_VOLT: TMap = {
  'main-video→main-video': 'hard-cut',
  'main-video→main-video-text': 'flash-cut',
  'main-video→fullscreen-text': 'flash-cut',
  'main-video→fullscreen-image': 'flash-cut',
  'main-video-text→main-video': 'flash-cut',
  'main-video-text→main-video-text': 'hard-cut',
  'main-video-text→fullscreen-text': 'flash-cut',
  'main-video-text→fullscreen-image': 'flash-cut',
  'fullscreen-text→main-video': 'flash-cut',
  'fullscreen-text→main-video-text': 'flash-cut',
  'fullscreen-text→fullscreen-image': 'crossfade',
  'fullscreen-image→main-video': 'flash-cut',
  'fullscreen-image→main-video-text': 'flash-cut',
  'fullscreen-image→fullscreen-text': 'crossfade'
}
