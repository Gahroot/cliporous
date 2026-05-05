/**
 * Safe Zone Layout Engine — Main Process Re-export
 *
 * All safe zone data and computation functions now live in the shared module
 * (`@shared/safe-zones`) so they can be imported directly by main, preload,
 * and renderer without IPC round-trips.
 *
 * This file re-exports everything for backward compatibility with existing
 * main-process imports.
 */

export {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PLATFORM_SAFE_ZONES,
  getSafeZone,
  getDeadZones,
  getElementPlacement,
  clampToSafeZone,
  isInsideSafeZone,
  rectToAssMargins
} from '@shared/safe-zones'

export type {
  Platform,
  ElementType,
  SafeZoneRect,
  PlatformDeadZones,
  PlatformSafeZone
} from '@shared/safe-zones'
