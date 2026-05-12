import type {
  AppSettings,
  ZoomSettings,
  HookTitleOverlaySettings,
  RehookOverlaySettings,
  BRollSettings,
  FillerRemovalSettings,
  RenderQualitySettings,
  ProcessingConfig,
  SourceVideo,
  TranscriptionData,
  ClipCandidate,
  StitchedClipCandidate,
  TemplateLayout,
  Platform,
} from './types'
import { DEFAULT_MIN_SCORE, DEFAULT_FILENAME_TEMPLATE } from '@shared/constants'

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/**
 * Update a single item by ID in an array of objects.
 * Accepts either a partial object or a function that receives the current item
 * and returns a partial update.
 */
export function updateItemById<T extends { id: string }>(
  items: T[],
  itemId: string,
  update: Partial<T> | ((item: T) => Partial<T>)
): T[] {
  return items.map(item =>
    item.id === itemId
      ? { ...item, ...(typeof update === 'function' ? update(item) : update) }
      : item
  )
}

// ---------------------------------------------------------------------------
// Default settings values
// ---------------------------------------------------------------------------

export const DEFAULT_AUTO_ZOOM: ZoomSettings = {
  enabled: true,
  mode: 'ken-burns',
  intensity: 'subtle',
  intervalSeconds: 4
}

export const DEFAULT_HOOK_TITLE_OVERLAY: HookTitleOverlaySettings = {
  enabled: true,
  style: 'centered-bold',
  displayDuration: 2.5,
  fadeIn: 0.3,
  fadeOut: 0.4,
  fontSize: 72,
  textColor: '#FFFFFF',
  outlineColor: '#000000',
  outlineWidth: 4
}

export const DEFAULT_REHOOK_OVERLAY: RehookOverlaySettings = {
  enabled: true,
  style: 'bar',
  displayDuration: 1.5,
  fadeIn: 0.2,
  fadeOut: 0.3,
  positionFraction: 0.45
}

export const DEFAULT_BROLL: BRollSettings = {
  enabled: false,
  intervalSeconds: 5,
  clipDuration: 3,
  displayMode: 'split-top',
  transition: 'crossfade',
  pipSize: 0.25,
  pipPosition: 'bottom-right'
}

export const DEFAULT_FILLER_REMOVAL: FillerRemovalSettings = {
  enabled: true,
  removeFillerWords: true,
  trimSilences: true,
  removeRepeats: true,
  silenceThreshold: 0.8,
  fillerWords: [
    'um', 'uh', 'erm', 'er', 'ah', 'hm', 'hmm', 'mm', 'mhm',
    'like', 'you know', 'i mean', 'sort of', 'kind of',
    'basically', 'actually', 'literally', 'right', 'okay so'
  ]
}

export const DEFAULT_RENDER_QUALITY: RenderQualitySettings = {
  preset: 'normal',
  customCrf: 20,
  outputResolution: '1080x1920',
  outputFormat: 'mp4',
  encodingPreset: 'medium'
}

/**
 * Template layout defaults — percent-of-canvas (0–100) coordinates for the
 * centre of each repositionable overlay. Hook title sits in the upper third,
 * subtitles ride the lower band above the platform UI dead-zones.
 */
export const DEFAULT_TEMPLATE_LAYOUT: TemplateLayout = {
  titleText: { x: 50, y: 18 },
  subtitles: { x: 50, y: 85 }
}

export const DEFAULT_TARGET_PLATFORM: Platform = 'universal'

export const DEFAULT_SETTINGS: AppSettings = {
  // API keys are loaded asynchronously from Electron safeStorage via
  // `hydrateSecretsFromMain()`. They default to empty strings here so the
  // store has a valid synchronous initial shape.
  geminiApiKey: '',
  falApiKey: localStorage.getItem('batchclip-fal-key') || '',
  pexelsApiKey: '',
  outputDirectory: null,
  minScore: DEFAULT_MIN_SCORE,
  autoZoom: DEFAULT_AUTO_ZOOM,
  hookTitleOverlay: DEFAULT_HOOK_TITLE_OVERLAY,
  rehookOverlay: DEFAULT_REHOOK_OVERLAY,
  broll: DEFAULT_BROLL,
  fillerRemoval: DEFAULT_FILLER_REMOVAL,
  enableNotifications: true,
  developerMode: false,
  renderQuality: DEFAULT_RENDER_QUALITY,
  outputAspectRatio: '9:16',
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  renderConcurrency: 1,
  templateLayout: DEFAULT_TEMPLATE_LAYOUT,
  targetPlatform: DEFAULT_TARGET_PLATFORM
}

export const DEFAULT_TARGET_AUDIENCE = 'Business owners interested in AI — making money, saving time, getting clients, handling marketing/sales, automating busy work. Content must deliver actionable value to entrepreneurs and founders.'

export const DEFAULT_PROCESSING_CONFIG: ProcessingConfig = {
  targetDuration: 'auto',
  enablePerfectLoop: false,
  clipEndMode: 'loop-first',
  enableMultiPart: false,
  enableAiEdit: true,
  targetAudience: DEFAULT_TARGET_AUDIENCE
}

export const DEFAULT_PIPELINE = {
  stage: 'idle' as const,
  message: '',
  percent: 0
}

// ---------------------------------------------------------------------------
// Project file schema
// ---------------------------------------------------------------------------

/** Canonical shape written to / read from .batchclip files. */
export interface ProjectFileData {
  version: number
  sources: SourceVideo[]
  transcriptions: Record<string, TranscriptionData>
  clips: Record<string, ClipCandidate[]>
  /** Stitched (multi-range) clip candidates keyed by source ID. */
  stitchedClips?: Record<string, StitchedClipCandidate[]>
  settings: AppSettings
  processingConfig?: ProcessingConfig
}

// ---------------------------------------------------------------------------
// Settings Persistence
// ---------------------------------------------------------------------------

const SETTINGS_STORAGE_KEY = 'batchclip-settings'
const PROCESSING_CONFIG_STORAGE_KEY = 'batchclip-processing-config'

export function loadPersistedSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<AppSettings>
      return {
        ...DEFAULT_SETTINGS,
        ...saved,
        // Gemini / Pexels keys + output directory are hydrated asynchronously
        // from safeStorage by hydrateSecretsFromMain(). Always start empty so
        // a stale localStorage value can't shadow the safeStorage source of
        // truth (where the Settings window writes them).
        geminiApiKey: '',
        pexelsApiKey: '',
        outputDirectory: null,
        falApiKey: localStorage.getItem('batchclip-fal-key') || '',
        autoZoom: { ...DEFAULT_AUTO_ZOOM, ...(saved.autoZoom ?? {}) },
        hookTitleOverlay: { ...DEFAULT_HOOK_TITLE_OVERLAY, ...(saved.hookTitleOverlay ?? {}) },
        rehookOverlay: { ...DEFAULT_REHOOK_OVERLAY, ...(saved.rehookOverlay ?? {}) },
        broll: { ...DEFAULT_BROLL, ...(saved.broll ?? {}) },
        fillerRemoval: { ...DEFAULT_FILLER_REMOVAL, ...(saved.fillerRemoval ?? {}) },
        renderQuality: { ...DEFAULT_RENDER_QUALITY, ...(saved.renderQuality ?? {}) },
        templateLayout: {
          titleText: {
            ...DEFAULT_TEMPLATE_LAYOUT.titleText,
            ...(saved.templateLayout?.titleText ?? {})
          },
          subtitles: {
            ...DEFAULT_TEMPLATE_LAYOUT.subtitles,
            ...(saved.templateLayout?.subtitles ?? {})
          }
        },
        targetPlatform: saved.targetPlatform ?? DEFAULT_TARGET_PLATFORM
      }
    }
  } catch {
    // JSON parse error — fall back to defaults
  }
  return DEFAULT_SETTINGS
}

export function loadPersistedProcessingConfig(): ProcessingConfig {
  try {
    const raw = localStorage.getItem(PROCESSING_CONFIG_STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<ProcessingConfig>
      return { ...DEFAULT_PROCESSING_CONFIG, ...saved }
    }
  } catch {
    // JSON parse error — fall back to defaults
  }
  return DEFAULT_PROCESSING_CONFIG
}

export function persistSettings(settings: AppSettings): void {
  try {
    // Strip values that live in safeStorage (the Settings window's source of
    // truth) so we don't double-write them to plaintext localStorage.
    const {
      geminiApiKey: _g,
      falApiKey: _f,
      pexelsApiKey: _p,
      outputDirectory: _o,
      ...rest
    } = settings
    void _g
    void _f
    void _p
    void _o
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(rest))
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function persistProcessingConfig(config: ProcessingConfig): void {
  try {
    localStorage.setItem(PROCESSING_CONFIG_STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Storage full or unavailable — silently ignore
  }
}
